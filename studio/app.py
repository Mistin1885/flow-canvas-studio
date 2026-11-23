import asyncio
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path
import sqlite3
import time
from typing import Any, Literal
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from . import storage as store
from .auth import authenticate


@asynccontextmanager
async def lifespan(app):
    store.initialize()
    yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
rooms = defaultdict(set)


@app.middleware("http")
async def auth(request: Request, call_next):
    try:
        request.state.user = await run_in_threadpool(authenticate, request)
    except HTTPException as exc:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    response = await call_next(request)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response


@app.exception_handler(store.Missing)
async def missing(request, exc):
    return JSONResponse({"detail": "找不到指定項目"}, status_code=404)


@app.exception_handler(store.Invalid)
async def invalid(request, exc):
    return JSONResponse({"detail": str(exc)}, status_code=422)


@app.exception_handler(sqlite3.IntegrityError)
@app.exception_handler(store.Conflict)
async def conflict(request, exc):
    return JSONResponse(
        {"detail": str(exc) if isinstance(exc, store.Conflict) else "畫布關聯已變更"}, status_code=409
    )


class Named(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class Rename(Named):
    previous: str


class CanvasCreate(Named):
    source: str | None = None
    graph: dict | None = None


class Operation(BaseModel):
    table: Literal["nodes", "edges", "meta"]
    key: str = Field(max_length=1024)
    version: int | None
    remove: bool = False
    value: Any = None


class Batch(BaseModel):
    base: int = Field(ge=1)
    ops: list[Operation] = Field(min_length=1, max_length=4000)


@app.get("/api/session")
def identity(request: Request):
    return request.state.user


@app.get("/api/catalog")
def catalog():
    with store.session() as db:
        return {
            "workspaces": [dict(r) for r in db.execute("SELECT * FROM workspaces ORDER BY created,id")],
            "canvases": [
                dict(r)
                for r in db.execute("""
                    SELECT c.*, (SELECT count(*) FROM nodes WHERE canvas=c.id) AS nodes,
                    (SELECT count(*) FROM edges WHERE canvas=c.id) AS edges FROM canvases c
                    ORDER BY updated DESC,id""")
            ],
        }


@app.post("/api/workspaces", status_code=201)
def workspace(body: Named):
    key = uuid4().hex
    with store.session(True) as db:
        db.execute("INSERT INTO workspaces VALUES(?,?,?)", (key, store.name(body.name), store.now()))
    return {"id": key}


@app.patch("/api/{kind}/{key}")
def rename(kind: Literal["workspaces", "canvases"], key: str, body: Rename):
    with store.session(True) as db:
        row = store.required(db, kind, key)
        if row["name"] != body.previous:
            raise store.Conflict("名稱剛被其他人修改，請重新整理")
        db.execute(f"UPDATE {kind} SET name=? WHERE id=?", (store.name(body.name), key))
    return {"id": key}


@app.post("/api/workspaces/{workspace}/canvases", status_code=201)
def canvas(workspace: str, body: CanvasCreate, request: Request):
    with store.session(True) as db:
        key = store.create_canvas(
            db, workspace, body.name, request.state.user["label"], body.graph, body.source
        )
    return {"id": key}


@app.get("/api/canvases/{canvas}")
def read(canvas: str):
    with store.session() as db:
        return store.snapshot(db, canvas)


def write(canvas, batch, editor):
    with store.session(True) as db:
        return store.commit(db, canvas, batch.base, [op.model_dump() for op in batch.ops], editor)


@app.post("/api/canvases/{canvas}/changes")
async def changes(canvas: str, body: Batch, request: Request):
    rev = await run_in_threadpool(write, canvas, body, request.state.user["label"])
    # The transaction has committed. A slow client only needs the newest revision.
    for queue in rooms.get(canvas, ()):
        if queue.full():
            rev_pending = queue.get_nowait()
            queue.put_nowait(max(rev, rev_pending))
        else:
            queue.put_nowait(rev)
    return {"rev": rev}


@app.websocket("/api/canvases/{canvas}/live")
async def live(ws: WebSocket, canvas: str):
    try:
        user = await run_in_threadpool(authenticate, ws)
        with store.session() as db:
            rev = store.required(db, "canvases", canvas)["rev"]
    except (HTTPException, store.Missing):
        await ws.close(code=1008)
        return
    queue = asyncio.Queue(maxsize=1)
    rooms[canvas].add(queue)
    queue.put_nowait(rev)
    listener = None
    try:
        await ws.accept()

        async def watch_disconnect():
            while (await ws.receive())["type"] != "websocket.disconnect":
                pass

        listener = asyncio.create_task(watch_disconnect())
        while not listener.done():
            expiry = user["expires"]
            if expiry and expiry <= time.time():
                await ws.close(code=1008)
                break
            waiter = asyncio.create_task(queue.get())
            try:
                done, _ = await asyncio.wait(
                    [waiter, listener],
                    timeout=min(25, expiry - time.time()) if expiry else 25,
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if listener in done:
                    break
                await ws.send_json({"rev": waiter.result()} if waiter in done else {"ping": True})
            finally:
                waiter.cancel()
    except (WebSocketDisconnect, OSError):
        pass
    finally:
        if listener:
            listener.cancel()
        rooms[canvas].discard(queue)
        if not rooms[canvas]:
            del rooms[canvas]


dist = Path(__file__).resolve().parents[1] / "frontend/dist"
app.mount("/", StaticFiles(directory=dist, html=True, check_dir=False))
