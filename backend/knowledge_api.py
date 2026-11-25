"""Workspace library, canvas-local entries and sharing impact."""
import json
from typing import Literal
from urllib.parse import unquote
from uuid import uuid4

from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from . import knowledge as kb, storage as store

router = APIRouter()


def context(db, space, canvas):
    store.required(db, "workspaces", space)
    if canvas and store.required(db, "canvases", canvas)["workspace"] != space:
        raise store.Invalid("畫布不屬於此工作區")


def local_rows(db, canvas):
    return db.execute("""SELECT m.*,c.name,w.name AS space_name FROM meta m
        JOIN active_canvases c ON c.id=m.canvas JOIN workspaces w ON w.id=c.workspace
        WHERE m.canvas=? AND m.key GLOB 'knowledge.*' ORDER BY m.rowid""", (canvas,))


@router.get("/api/knowledge/{space}")
def listing(space: str, canvas: str = "", selected: str = ""):
    with store.session() as db:
        context(db,space,canvas)
        workspaces = [dict(r) for r in db.execute("SELECT id,name FROM workspaces ORDER BY name")]
        items = []
        local = {}
        for row in local_rows(db,canvas):
            doc = json.loads(row["value"])
            key = row["key"][len(kb.PREFIX):]
            if "source" in doc:
                local[doc["source"]] = (key,row["version"])
            else:
                items.append(dict(id=key, doc=doc, local=key, version=row["version"], scope="canvas",
                                  owner=space, shares=[], uses=[kb.usage(db,row)] if selected==key else []))
        rows = db.execute("""SELECT e.* FROM knowledge_entries e WHERE e.workspace=? OR EXISTS
            (SELECT 1 FROM knowledge_shares s WHERE s.entry=e.id AND s.workspace=?) ORDER BY e.rowid""",(space,space))
        for row in rows:
            key = row["id"]
            alias, local_version = local.get(key,(None,0))
            uses = [kb.usage(db,r) for r in kb.subscribers(db,key)] if selected==key else []
            items.append(dict(id=key, doc=json.loads(row["document"]), local=alias, localVersion=local_version,
                              version=row["version"], owner=row["workspace"], shares=kb.shares(db,key),
                              scope="workspace" if row["workspace"]==space else "shared",
                              uses=[u for u in uses if u["nodes"] or u["pinned"]]))
        pins = db.execute("SELECT value,version FROM meta WHERE canvas=? AND key='knowledgePins'",(canvas,)).fetchone()
        return {"entries":items,"spaces":workspaces,"pins":json.loads(pins[0]) if pins else [],"pinVersion":pins[1] if pins else None}


@router.get("/api/knowledge/{space}/copy-preview")
def preview(space: str, source: str):
    with store.session() as db:
        store.required(db,"canvases",source)
        context(db,space,"")
        docs = [json.loads(r["value"]) for r in local_rows(db,source)]
        return {"total":len(docs),"eligible":sum(1 for d in docs if d.get("source") and kb.allowed(db,d["source"],space))}


class Mutation(BaseModel):
    action: Literal["save","promote","copy","detach","pin"]
    canvas: str = ""
    entry: str = Field(default="", pattern=r"^[a-zA-Z0-9_-]{0,64}$")
    local: str = Field(default="", pattern=r"^[a-zA-Z0-9_-]{0,64}$")
    localVersion: int | None = None
    version: int = 0
    pinVersion: int | None = None
    doc: dict | None = None
    shares: list[str] = Field(default_factory=list,max_length=500)


@router.post("/api/knowledge/{space}")
def modify(space: str, body: Mutation, x_flow_editor: str = Header()):
    editor = unquote(x_flow_editor)
    with store.session(True) as db:
        context(db,space,body.canvas)
        updated = {}
        def put_local(key, doc, version):
            if not body.canvas:
                raise store.Invalid("請選擇畫布")
            updated[body.canvas] = kb.change_meta(db,body.canvas,key,doc,version,editor)
        local = db.execute("SELECT value,version FROM meta WHERE canvas=? AND key=?",
                           (body.canvas,kb.PREFIX+body.local)).fetchone()
        local_doc = json.loads(local["value"]) if local else None
        original = kb.allowed(db,body.entry,space) if body.entry else None
        if body.action == "save":
            doc = kb.document(body.doc)
            if body.canvas and not body.entry:
                if local_doc and local_doc.get("source"):
                    raise store.Conflict("此條目已加入共用")
                key = body.local or uuid4().hex
                put_local(kb.PREFIX+key,doc,body.localVersion)
            else:
                key = body.entry or uuid4().hex
                updated = kb.publish(db,space,key,doc,body.shares,body.version,editor)
        elif body.action == "promote":
            if not local_doc or local_doc.get("source"):
                raise store.Conflict("無法將此條目加入共用")
            key = uuid4().hex
            kb.publish(db,space,key,kb.document(local_doc),[],0,editor)
            put_local(kb.PREFIX+body.local,dict(local_doc,source=key),body.localVersion)
        elif body.action == "copy" and original:
            key = uuid4().hex
            if body.canvas:
                put_local(kb.PREFIX+key,json.loads(original["document"]),None)
            else:
                kb.publish(db,space,key,json.loads(original["document"]),[],0,editor)
        elif body.action == "detach" and local_doc and local_doc.get("source"):
            key = body.local
            put_local(kb.PREFIX+key,kb.document(local_doc),body.localVersion)
        elif body.action == "pin":
            if local_doc:
                key = body.local
            elif original:
                key = uuid4().hex
                put_local(kb.PREFIX+key,dict(json.loads(original["document"]),source=original["id"]),None)
            else:
                raise store.Missing(body.entry)
            row = db.execute("SELECT value FROM meta WHERE canvas=? AND key='knowledgePins'",(body.canvas,)).fetchone()
            pins = json.loads(row[0]) if row else []
            pins = [k for k in pins if k != key] if key in pins else pins+[key]
            put_local("knowledgePins",pins,body.pinVersion)
        else:
            raise store.Missing(body.entry)
        return {"id":key,"updated":updated}
