"""Public entry point for the web UI, authenticated API and canvas WebSockets."""

import asyncio
import json
from collections import defaultdict
from contextlib import asynccontextmanager, AsyncExitStack
import os
from pathlib import Path
import time
from urllib.parse import quote

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool

from .auth import authenticate
from .live_room import Room, Peer


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
rooms = defaultdict(Room)


@app.middleware("http")
async def auth(request: Request, call_next):
    if request.method == "GET" and request.url.path == "/healthz":
        return await call_next(request)
    try:
        request.state.user = await run_in_threadpool(authenticate, request)
    except HTTPException as exc:
        return JSONResponse({"detail": exc.detail}, status_code=exc.status_code)
    response = await call_next(request)
    token = getattr(request.state, "new_local_token", None)
    if token and request.url.path in ("/", "/admin", "/admin/", "/api/session", "/api/session/login"):
        response.set_cookie("flow_local_identity", token, httponly=True, samesite="strict", max_age=31536000)
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    return response


def identity_headers(request):
    return {"x-flow-principal": request.state.principal, "x-flow-realm": request.state.user["mode"]}


@app.get("/healthz")
async def health(request: Request):
    result = await request.app.state.database.get("/ready")
    return JSONResponse({"ready": result.is_success}, status_code=200 if result.is_success else 503,
                        headers={"Cache-Control": "no-store"})


@app.post("/api/session/login")
async def login(request: Request):
    result = await request.app.state.database.post("/identity/login", headers=identity_headers(request))
    if not result.is_success:
        raise HTTPException(result.status_code, "無法建立登入狀態")
    return {**request.state.user, "admin": result.json()["admin"]}


@app.get("/api/session")
async def identity(request: Request):
    result = await request.app.state.database.get("/identity/session", headers=identity_headers(request))
    if not result.is_success:
        return Response(content=result.content, status_code=result.status_code, media_type="application/json")
    return {**request.state.user, "admin": result.json()["admin"]}


@app.get("/")
@app.get("/admin")
@app.get("/admin/")
async def site(request: Request):
    if request.url.path != "/":
        result = await request.app.state.database.get("/identity/session", headers=identity_headers(request))
        if not result.is_success:
            raise HTTPException(result.status_code, "無法讀取登入狀態")
        state = result.json()
        if not (state["admin"] or state["first_login"]):
            raise HTTPException(403, "此頁面僅開放系統管理員")
    return FileResponse(dist / "index.html")


@app.exception_handler(httpx.RequestError)
async def database_unavailable(request, exc):
    return JSONResponse({"detail": "資料庫暫時無法連線"}, status_code=503)


@app.get("/api/catalog/page")
@app.get("/api/admin/backups/page")
@app.get("/api/admin/backup-status")
@app.get("/api/admin/backups")
@app.post("/api/admin/backups/{point}/restore")
@app.get("/api/canvases/{canvas}/activity/{after}")
@app.get("/api/catalog")
@app.post("/api/workspaces")
@app.patch("/api/workspaces/{key}")
@app.patch("/api/canvases/{key}")
@app.delete("/api/canvases/{canvas}")
@app.post("/api/canvases/{canvas}/clear")
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
        params=request.query_params.multi_items(),
        content=await request.body(),
        headers={
            "content-type": "application/json",
            **identity_headers(request),
            "x-flow-editor": quote(request.state.user["label"], safe=""),
        },
    )
    canvas_changed = request.method == "DELETE" or (
        request.method == "POST" and request.url.path.endswith(("/changes", "/imports", "/clear"))
    )
    if response.is_success and canvas_changed:
        notify(request.path_params["canvas"], response.json()["rev"])
    if response.is_success and request.method == "PATCH" and request.url.path.startswith("/api/canvases/"):
        notify(request.path_params["key"], response.json()["rev"])
    if response.is_success and request.url.path.endswith("/restore"):
        restored = response.json()
        if restored["kind"] == "canvas":
            notify(restored["item"], restored["rev"])
    return Response(content=response.content, status_code=response.status_code, media_type="application/json")


def notify(canvas, rev):
    # The transaction has committed. A slow client only needs the newest revision.
    if room := rooms.get(canvas):
        for peer in room.peers:
            peer.revision = max(rev, peer.revision)
            peer.ready.set()


@app.websocket("/api/canvases/{canvas}/live")
async def live(ws: WebSocket, canvas: str):
    try:
        user = await run_in_threadpool(authenticate, ws)
    except HTTPException:
        await ws.close(code=1008)
        return
    room = rooms[canvas]
    peer = Peer(user["label"])
    room.peers.add(peer)
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
            while True:
                event = await ws.receive()
                if event["type"] == "websocket.disconnect":
                    return
                raw = event.get("text")
                if not raw or len(raw) > 1024:
                    continue
                try:
                    message = json.loads(raw)
                except ValueError:
                    continue
                if isinstance(message, dict) and "editing" in message:
                    node = message["editing"]
                    if node is None or (isinstance(node, str) and 0 < len(node) <= 128):
                        room.move(peer, node)

        listener = asyncio.create_task(watch_disconnect())
        loop = asyncio.get_running_loop()
        next_check = loop.time() + 25
        while not listener.done():
            expiry = user["expires"]
            if expiry and expiry <= time.time():
                await ws.close(code=1008)
                break
            waiter = asyncio.create_task(peer.ready.wait())
            try:
                done, _ = await asyncio.wait(
                    [waiter, listener],
                    timeout=max(0, min(next_check - loop.time(), expiry - time.time() if expiry else 25)),
                    return_when=asyncio.FIRST_COMPLETED,
                )
                if listener in done:
                    break
                if waiter in done:
                    await ws.send_json(peer.take(room))
                if loop.time() >= next_check:
                    next_check = loop.time() + 25
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
        room.move(peer, None)
        room.peers.discard(peer)
        if not room.peers:
            del rooms[canvas]


dist = Path(__file__).resolve().parents[1] / "frontend/dist"
app.mount("/", StaticFiles(directory=dist, html=True, check_dir=False))
