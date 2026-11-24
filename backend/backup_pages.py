"""Read searchable recovery metadata without opening snapshot archives."""

from datetime import datetime, timezone

from . import snapshots
from .paging import read_page


def backup_page(db, page, size, q, workspace, canvas, kind):
    active = "p.cold=0 AND p.expires>?"
    now = snapshots.times(datetime.now(timezone.utc))[0]
    source = """FROM recovery_points p JOIN workspaces w ON w.id=p.workspace
                LEFT JOIN canvases c ON p.kind='canvas' AND c.id=p.item WHERE """ + active
    params = [now]
    if workspace:
        source += " AND p.workspace=?"
        params.append(workspace)
    if canvas:
        source += " AND p.kind='canvas' AND p.item=?"
        params.append(canvas)
    if kind:
        source += " AND p.kind=?"
        params.append(kind)
    if q.strip():
        db.create_function("casefold", 1, str.casefold)
        needle = q.strip().casefold()
        source += """ AND (instr(casefold(p.name),?) OR instr(casefold(w.name),?)
                     OR instr(casefold(coalesce(c.name,'')),?) OR cast(p.id AS TEXT)=?)"""
        params.extend([needle, needle, needle, needle.removeprefix('#')])
    columns = """p.id,p.kind,p.item,p.name,p.revision,p.captured,w.name AS workspace_name,
                 coalesce(c.updated,w.updated) AS live_updated,c.rev AS live_revision, c.deleted_until IS NOT NULL AS deleted"""
    result = read_page(db, columns, source, params, "p.id DESC", page, size)
    spaces = db.execute(f"""SELECT DISTINCT w.id,w.name FROM recovery_points p JOIN workspaces w
        ON w.id=p.workspace WHERE {active} ORDER BY w.name,w.id""", (now,))
    result["workspaces"] = [dict(r) for r in spaces]
    scope = "AND c.workspace=?" if workspace else ""
    canvases = db.execute(f"""SELECT c.id,c.name,c.workspace FROM canvases c WHERE EXISTS
        (SELECT 1 FROM recovery_points p WHERE p.kind='canvas' AND p.item=c.id AND {active})
        {scope} ORDER BY c.name,c.id""", (now, workspace) if workspace else (now,))
    result["canvases"] = [dict(r) for r in canvases]
    result["scan"] = dict(db.execute("SELECT attempted,succeeded,failed,state,captured,error FROM scan_status").fetchone())
    return result
