"""Workspace summaries, paged canvas cards and direct editor links."""

from typing import Literal

from fastapi import APIRouter

from . import storage
from .paging import PageNumber, PageSize, read_page

router = APIRouter()
CARD = """c.*, (SELECT count(*) FROM nodes WHERE canvas=c.id) AS nodes,
               (SELECT count(*) FROM edges WHERE canvas=c.id) AS edges"""


@router.get("/api/catalog/page")
def catalog_page(workspace: str = "", canvas: str = "", q: str = "", sort: Literal["updated", "name"] = "updated",
                 page: PageNumber = 1, size: PageSize = 12):
    with storage.session() as db:
        spaces = [dict(r) for r in db.execute("""SELECT w.id,w.name,
            (SELECT count(*) FROM active_canvases c WHERE c.workspace=w.id) AS canvases
            FROM workspaces w ORDER BY w.created,w.id""")]
        if canvas:
            row = db.execute(f"SELECT {CARD} FROM active_canvases c WHERE c.id=?", (canvas,)).fetchone()
            return {"workspaces": spaces, "opened": dict(row) if row else None}
        selected = workspace or (spaces[0]["id"] if spaces else "")
        source = "FROM active_canvases c WHERE c.workspace=?"
        params = [selected]
        if q.strip():
            db.create_function("casefold", 1, str.casefold)
            source += " AND instr(casefold(c.name), ?)>0"
            params.append(q.strip().casefold())
        order = "c.name COLLATE NOCASE,c.id" if sort == "name" else "c.updated DESC,c.id"
        result = read_page(db, CARD, source, params, order, page, size)
        nodes = db.execute("""SELECT count(*) FROM active_canvases c JOIN nodes n ON n.canvas=c.id
                              WHERE c.workspace=?""", (selected,)).fetchone()[0]
        return {"workspace": selected, "listing": result, "workspaces": spaces, "nodes": nodes}
