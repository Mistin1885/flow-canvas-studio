"""Public entry point for the web UI, authenticated API and canvas WebSockets."""

import asyncio
from collections import defaultdict
from contextlib import asynccontextmanager, AsyncExitStack
import os
from pathlib import Path
import time
from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from .auth import authenticate


@asynccontextmanager
async def lifespan(app):
    async with AsyncExitStack() as stack:
        socket = os.getenv("FLOW_DATABASE_SOCKET")
        if socket:
            transport = httpx.AsyncHTTPTransport(uds=socket)
        else:
            # Native development runs the same private API in-process.
            from .database_api import app as database

            await stack.enter_async_context(database.router.lifespan_context(database))
            transport = httpx.ASGITransport(app=database)
        app.state.database = await stack.enter_async_context(
            httpx.AsyncClient(base_url="http://database", transport=transport, timeout=30)
        )
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


@app.get("/api/session")
def identity(request: Request):
    return request.state.user


@app.exception_handler(httpx.RequestError)
async def database_unavailable(request, exc):
    return JSONResponse({"detail": "資料庫暫時無法連線"}, status_code=503)


@app.get("/api/catalog")
@app.post("/api/workspaces")
@app.patch("/api/workspaces/{key}")
@app.patch("/api/canvases/{key}")
@app.get("/api/canvases/{canvas}")
@app.post("/api/workspaces/{workspace}/canvases")
@app.get("/api/canvases/{canvas}/imports")
@app.get("/api/canvases/{canvas}/imports/{revision}")
@app.post("/api/canvases/{canvas}/imports")
@app.post("/api/canvases/{canvas}/changes")
async def data_request(request: Request):
    # Forward only the matched data operation and the identity verified by this server.
    response = await request.app.state.database.request(
        request.method,
        request.scope["raw_path"].decode("ascii"),
        content=await request.body(),
        headers={
            "content-type": "application/json",
            "x-flow-editor": quote(request.state.user["label"], safe=""),
        },
    )
    if response.is_success and request.url.path.endswith(("/changes", "/imports")) and request.method == "POST":
        notify(request.path_params["canvas"], response.json()["rev"])
    return Response(content=response.content, status_code=response.status_code, media_type="application/json")


def notify(canvas, rev):
    # The transaction has committed. A slow client only needs the newest revision.
    for queue in rooms.get(canvas, ()):
        if queue.full():
            rev_pending = queue.get_nowait()
            queue.put_nowait(max(rev, rev_pending))
        else:
            queue.put_nowait(rev)


@app.websocket("/api/canvases/{canvas}/live")
async def live(ws: WebSocket, canvas: str):
    try:
        user = await run_in_threadpool(authenticate, ws)
    except HTTPException:
        await ws.close(code=1008)
        return
    queue = asyncio.Queue(maxsize=1)
    rooms[canvas].add(queue)
    listener = None
    try:
        # Subscribe before reading the version so a racing commit cannot be missed.
        result = await ws.app.state.database.get("/revision", params={"canvas": canvas})
        if not result.is_success:
            await ws.close(code=1008 if result.status_code == 404 else 1013)
            return
        await ws.accept()
        await ws.send_json(result.json())

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
                if waiter in done:
                    await ws.send_json({"rev": waiter.result()})
                else:
                    # Recover a committed update if the database response was lost.
                    latest = await ws.app.state.database.get("/revision", params={"canvas": canvas})
                    if not latest.is_success:
                        await ws.close(code=1013)
                        break
                    await ws.send_json(latest.json())
            finally:
                waiter.cancel()
    except httpx.RequestError:
        await ws.close(code=1013)
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
