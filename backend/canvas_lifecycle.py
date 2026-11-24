"""Revision-checked operations that replace a whole canvas or remove it from the catalog."""

from datetime import datetime, timezone
from urllib.parse import unquote

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from . import snapshots, storage

router = APIRouter()


class Revision(BaseModel):
    base: int = Field(ge=1)


def at_revision(db, canvas, base):
    info = storage.required(db, "canvases", canvas)
    if info["rev"] != base:
        raise storage.Conflict("畫布已有更新，請重新整理並確認最新版本")
    return info


def checkpoint(db, info):
    clock = datetime.now(timezone.utc)
    try:
        snapshots.capture(db, "canvas", info, clock, force=True)
    except OSError as exc:
        raise HTTPException(503, "無法寫入備份，操作已取消。請檢查備份目錄與磁碟空間。") from exc
    return snapshots.times(clock)[1]


@router.delete("/api/canvases/{canvas}")
def delete_canvas(canvas: str, body: Revision):
    with storage.session(True) as db:
        info = at_revision(db, canvas, body.base)
        expires = checkpoint(db, info)
        rev = info["rev"] + 1
        db.execute("UPDATE canvases SET deleted_until=?,updated=?,rev=? WHERE id=?",
                   (expires, storage.next_update(info["updated"]), rev, canvas))
    return {"rev": rev}


@router.post("/api/canvases/{canvas}/clear")
def clear_canvas(canvas: str, body: Revision, x_flow_editor: str = Header()):
    with storage.session(True) as db:
        info = at_revision(db, canvas, body.base)
        blank = storage.empty_graph(info["name"])
        if storage.snapshot(db, canvas)["graph"] == blank:
            return {"rev": info["rev"]}
        checkpoint(db, info)
        rev, stamp, editor = info["rev"] + 1, storage.next_update(info["updated"]), unquote(x_flow_editor)
        for table in storage.TABLES:
            db.execute(f"DELETE FROM {table} WHERE canvas=?", (canvas,))
        for key, value in blank.items():
            if key not in ("nodes", "edges"):
                storage.put(db, canvas, "meta", key, value, rev)
        db.execute("UPDATE canvases SET updated=?,editor=?,rev=?,write_floor=? WHERE id=?",
                   (stamp, editor, rev, rev, canvas))
        storage.activity.record(db, canvas, rev, stamp, editor, "cleared")
    return {"rev": rev}
