"""Private data API. Each successful mutation finishes its SQLite transaction before returning."""

from contextlib import asynccontextmanager
import sqlite3
from typing import Any, Literal
from uuid import UUID, uuid4
from urllib.parse import unquote

from fastapi import FastAPI, Header
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from . import activity, operations, storage as store
from .knowledge_api import router as knowledge_router
from .canvas_lifecycle import router as lifecycle_router
from .admin_api import router as admin_router
from .catalog_pages import router as catalog_router
from .snapshot_schedule import scheduler


@asynccontextmanager
async def lifespan(app):
    store.initialize()
    async with scheduler():
        yield


app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)


app.include_router(knowledge_router)
app.include_router(lifecycle_router)
app.include_router(admin_router)
app.include_router(catalog_router)


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
    follow: bool = False
    source: str | None = None
    graph: dict | None = None


class Operation(BaseModel):
    table: Literal["nodes", "edges", "meta"]
    key: str = Field(max_length=1024)
    version: int | None
    remove: bool = False
    value: Any = None


class Batch(BaseModel):
    operation_id: UUID | None = None
    strict: bool = False
    base: int = Field(ge=1)
    ops: list[Operation] = Field(min_length=1, max_length=4000)


@app.get("/api/catalog")
def catalog():
    with store.session() as db:
        return {
            "workspaces": [dict(r) for r in db.execute("SELECT * FROM workspaces ORDER BY created,id")],
            "canvases": [
                dict(r)
                for r in db.execute("""
                    SELECT c.*, (SELECT count(*) FROM nodes WHERE canvas=c.id) AS nodes,
                    (SELECT count(*) FROM edges WHERE canvas=c.id) AS edges FROM active_canvases c
                    ORDER BY updated DESC,id""")
            ],
        }


@app.post("/api/workspaces", status_code=201)
def workspace(body: Named):
    key = uuid4().hex
    with store.session(True) as db:
        stamp = store.now()
        db.execute("INSERT INTO workspaces(id,name,created,updated) VALUES(?,?,?,?)", (key, store.name(body.name), stamp, stamp))
    return {"id": key}


@app.patch("/api/{kind}/{key}")
def rename(kind: Literal["workspaces", "canvases"], key: str, body: Rename, x_flow_editor: str = Header()):
    with store.session(True) as db:
        row = store.required(db, kind, key)
        if row["name"] != body.previous:
            raise store.Conflict("名稱剛被其他人修改，請重新整理")
        name = store.name(body.name)
        if row["name"] != name:
            # Also distinguish multiple renames in one millisecond.
            stamp = store.next_update(row["updated"])
            revision = ", rev=rev+1" if kind == "canvases" else ""
            db.execute(f"UPDATE {kind} SET name=?,updated=?{revision} WHERE id=?", (name, stamp, key))
            if kind == "canvases":
                activity.record(db, key, row["rev"] + 1, stamp, unquote(x_flow_editor), "renamed")
        if kind == "canvases":
            return {"id": key, "rev": store.required(db, kind, key)["rev"]}
    return {"id": key}


@app.post("/api/workspaces/{workspace}/canvases", status_code=201)
def canvas(workspace: str, body: CanvasCreate, x_flow_editor: str = Header()):
    with store.session(True) as db:
        key = store.create_canvas(db, workspace, body.name, unquote(x_flow_editor), body.graph, body.source, body.follow)
    return {"id": key}


@app.get("/api/canvases/{canvas}")
def read(canvas: str):
    with store.session() as db:
        return store.snapshot(db, canvas)


def write_batch(canvas, body, editor, principal, route):
    with store.session(True) as db:
        operation = str(body.operation_id) if body.operation_id else None
        store.required(db, "canvases", canvas)
        if operation:
            key = (canvas, principal, operation)
            digest = operations.fingerprint(route, body)
            receipt = db.execute("SELECT digest,revision FROM edit_receipts WHERE canvas=? AND principal=? AND operation=?", key).fetchone()
            if receipt:
                if receipt["digest"] != digest:
                    raise store.Conflict("儲存識別碼已用於另一項修改")
                return {"rev": receipt["revision"]}
        if route == "imports":
            result = commit_import(db, canvas, body, editor)
            if isinstance(result, Response):
                return result
            rev = result["rev"]
        else:
            if body.strict and store.required(db, "canvases", canvas)["rev"] != body.base:
                raise store.Conflict("團隊版本已更新，請確認最新比對")
            rev = store.commit(db, canvas, body.base, [op.model_dump() for op in body.ops], editor, actor=principal)
        if operation:
            db.execute("INSERT INTO edit_receipts VALUES(?,?,?,?,?)", (*key, digest, rev))
        return {"rev": rev}


@app.post("/api/canvases/{canvas}/changes")
def changes(canvas: str, body: Batch, x_flow_editor: str = Header(), x_flow_principal: str = Header()):
    return write_batch(canvas, body, unquote(x_flow_editor), x_flow_principal, "changes")


@app.post("/api/canvases/{canvas}/imports")
def apply_import(canvas: str, body: Batch, x_flow_editor: str = Header(), x_flow_principal: str = Header()):
    return write_batch(canvas, body, unquote(x_flow_editor), x_flow_principal, "imports")


def commit_import(db, canvas, body, editor):
    before = store.snapshot(db, canvas)
    if before["canvas"]["rev"] != body.base:
        return JSONResponse({"detail": "預覽後畫布已有更新"}, status_code=412)
    # Never let a cascade remove a connection the reviewer did not see.
    removed_nodes = {op.key for op in body.ops if op.table == "nodes" and op.remove}
    removed_edges = {op.key for op in body.ops if op.table == "edges" and op.remove}
    for edge in before["graph"]["edges"]:
        loses_endpoint = edge["from"] in removed_nodes or edge["to"] in removed_nodes
        if loses_endpoint and store.edge_key(edge) not in removed_edges:
            raise store.Invalid("請確認與移除節點相連的每一條連線")
    rev = store.commit(db, canvas, body.base, [op.model_dump() for op in body.ops], editor, kind="imported")
    db.execute(
        "INSERT INTO import_history(canvas,revision,created,editor,graph) VALUES(?,?,?,?,?)",
        (canvas, body.base, store.now(), editor, store.encode(before["graph"])),
    )
    return {"rev": rev}


@app.get("/api/canvases/{canvas}/imports")
def import_history(canvas: str):
    with store.session() as db:
        store.required(db, "canvases", canvas)
        return [dict(r) for r in db.execute(
            "SELECT revision,created,editor FROM import_history WHERE canvas=? ORDER BY revision DESC",
            (canvas,),
        )]


@app.get("/api/canvases/{canvas}/imports/{revision}")
def before_import(canvas: str, revision: int):
    with store.session() as db:
        store.required(db, "canvases", canvas)
        row = db.execute("SELECT graph FROM import_history WHERE canvas=? AND revision=?",
                         (canvas, revision)).fetchone()
        if row is None:
            raise store.Missing(revision)
        return Response(content=row[0], media_type="application/json")


@app.get("/api/canvases/{canvas}/activity/{after}")
def canvas_activity(canvas: str, after: int):
    with store.session() as db:
        store.required(db, "canvases", canvas)
        return activity.page(db, canvas, after)


@app.get("/revision")
def revision(canvas: str):
    with store.session() as db:
        row = db.execute("SELECT rev FROM canvases WHERE id=?", (canvas,)).fetchone()
        if row is None:
            raise store.Missing(canvas)
        return {"rev": row["rev"]}


@app.get("/ready")
def ready():
    with store.session() as db:
        db.execute("SELECT id FROM workspaces LIMIT 1").fetchone()
    return {"ready": True}
