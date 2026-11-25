"""Workspace library, canvas-local entries and sharing impact."""
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


def entry_actions(scope):
    if scope == "workspace":
        return ["edit", "share"]
    return ["edit"] if scope == "canvas" else []


def local_rows(db, canvas):
    return db.execute("""SELECT m.*,c.name,w.name AS space_name FROM meta m
        JOIN active_canvases c ON c.id=m.canvas JOIN workspaces w ON w.id=c.workspace
        WHERE m.canvas=%s AND starts_with(m.key, 'knowledge.') ORDER BY m.position""", (canvas,))


@router.get("/api/knowledge/{space}")
def listing(space: str, canvas: str = "", selected: str = ""):
    with store.session() as db:
        context(db,space,canvas)
        workspaces = [dict(r) for r in db.execute("SELECT id,name FROM workspaces ORDER BY name")]
        items = []
        local = {}
        for row in local_rows(db,canvas):
            doc = row["value"]
            key = row["key"][len(kb.PREFIX):]
            if "source" in doc:
                local[doc["source"]] = (key,row["version"])
            else:
                items.append(dict(id=key, doc=doc, local=key, version=row["version"], scope="canvas",
                                  owner=space, shares=[], uses=kb.usage_list(db,[row]) if selected==key else []))
        rows = db.execute("""SELECT e.* FROM knowledge_entries e WHERE e.workspace=%s OR EXISTS
            (SELECT 1 FROM knowledge_shares s WHERE s.entry=e.id AND s.workspace=%s) ORDER BY e.position""",(space,space))
        for row in rows:
            key = row["id"]
            alias, local_version = local.get(key,(None,0))
            uses = kb.usage_list(db,kb.subscribers(db,key)) if selected==key else []
            items.append(dict(id=key, doc=row["document"], local=alias, localVersion=local_version,
                              version=row["version"], owner=row["workspace"], shares=kb.shares(db,key),
                              scope="workspace" if row["workspace"]==space else "shared",
                              uses=uses))
        for item in items:
            item["actions"] = entry_actions(item["scope"])
        pins = db.execute("SELECT value,version FROM meta WHERE canvas=%s AND key='knowledgePins'",(canvas,)).fetchone()
        return {"entries":items,"spaces":workspaces,"pins":pins[0] if pins else [],"pinVersion":pins[1] if pins else None}


@router.get("/api/knowledge/{space}/copy-preview")
def preview(space: str, source: str):
    with store.session() as db:
        store.required(db,"canvases",source)
        context(db,space,"")
        docs = [r["value"] for r in local_rows(db,source)]
        return {"total":len(docs),"eligible":sum(1 for d in docs if d.get("source") and kb.allowed(db,d["source"],space))}


class Mutation(BaseModel):
    action: Literal["save","share","promote","copy","detach","pin"]
    canvas: str = ""
    entry: str = Field(default="", pattern=r"^[a-zA-Z0-9_-]{0,64}$")
    local: str = Field(default="", pattern=r"^[a-zA-Z0-9_-]{0,64}$")
    localVersion: int | None = None
    version: int = 0
    pinVersion: int | None = None
    doc: dict | None = None
    shares: list[str] | None = Field(default=None,max_length=500)


@router.post("/api/knowledge/{space}")
def modify(space: str, body: Mutation, x_flow_editor: str = Header()):
    editor = unquote(x_flow_editor)
    with store.session(True, library=True) as db:
        context(db,space,body.canvas)
        updated = {}
        def put_local(key, doc, version):
            if not body.canvas:
                raise store.Invalid("請選擇畫布")
            updated[body.canvas] = kb.change_meta(db,body.canvas,key,doc,version,editor)
        local = db.execute("SELECT value,version FROM meta WHERE canvas=%s AND key=%s",
                           (body.canvas,kb.PREFIX+body.local)).fetchone()
        local_doc = local["value"] if local else None
        original = kb.allowed(db,body.entry,space) if body.entry else None
        if body.entry:
            scope = "workspace" if original and original["workspace"] == space else "shared"
        else:
            scope = "canvas" if body.canvas else "workspace"
        actions = entry_actions(scope)
        if body.action == "save":
            if "edit" not in actions or (scope != "canvas" and body.shares is not None and "share" not in actions):
                raise store.Invalid("請從來源工作區編輯共用原文")
            doc = kb.document(body.doc)
            if body.canvas and not body.entry:
                if local_doc and local_doc.get("source"):
                    raise store.Conflict("此條目已加入共用")
                key = body.local or uuid4().hex
                put_local(kb.PREFIX+key,doc,body.localVersion)
            else:
                key = body.entry or uuid4().hex
                # Older clients submit both content and recipients. Content-only edits
                # from the current editor preserve sharing inside this transaction.
                targets = body.shares if body.shares is not None else kb.shares(db, key)
                updated = kb.publish(db,space,key,doc,targets,body.version,editor)
        elif body.action == "share":
            if not original or "share" not in actions:
                raise store.Invalid("請從來源工作區管理共用範圍")
            if body.shares is None or body.doc is not None:
                raise store.Invalid("請僅指定要共用的工作區")
            key = original["id"]
            updated = kb.publish(db,space,key,original["document"],body.shares,body.version,editor)
        elif body.action == "promote":
            if not local_doc or local_doc.get("source"):
                raise store.Conflict("無法將此條目加入共用")
            key = uuid4().hex
            kb.publish(db,space,key,kb.document(local_doc),[],0,editor)
            put_local(kb.PREFIX+body.local,dict(local_doc,source=key),body.localVersion)
        elif body.action == "copy" and original:
            key = uuid4().hex
            if body.canvas:
                put_local(kb.PREFIX+key,original["document"],None)
            else:
                kb.publish(db,space,key,original["document"],[],0,editor)
        elif body.action == "detach" and local_doc and local_doc.get("source"):
            key = body.local
            put_local(kb.PREFIX+key,kb.document(local_doc),body.localVersion)
        elif body.action == "pin":
            if local_doc:
                key = body.local
            elif original:
                key = uuid4().hex
                put_local(kb.PREFIX+key,dict(original["document"],source=original["id"]),None)
            else:
                raise store.Missing(body.entry)
            row = db.execute("SELECT value FROM meta WHERE canvas=%s AND key='knowledgePins'",(body.canvas,)).fetchone()
            pins = row[0] if row else []
            pins = [k for k in pins if k != key] if key in pins else pins+[key]
            put_local("knowledgePins",pins,body.pinVersion)
        else:
            raise store.Missing(body.entry)
        return {"id":key,"updated":updated}
