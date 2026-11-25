"""Per-item recovery points with atomic branch selection and compressed payloads."""

import gzip
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from . import knowledge, storage as store

TABLE = {"canvas": "canvases", "workspace": "workspaces"}
WEEK = timedelta(days=7)


def times(instant):
    return (instant.isoformat(timespec="microseconds"), (instant + WEEK).isoformat(timespec="microseconds"))


def write_payload(payload):
    return gzip.compress(store.encode(payload).encode(), compresslevel=6, mtime=0)


def capture(db, kind, info, clock, *, force=False):
    key, rev = info["id"], info.get("rev", 0)
    head = db.execute("SELECT * FROM snapshot_heads WHERE kind=%s AND item=%s", (kind, key)).fetchone()
    if not force and head and (head["updated"], head["revision"]) == (info["updated"], rev):
        return head["snapshot"]
    captured, expires = times(clock)
    payload = {"kind": kind, "item": info, "captured": captured}
    if kind == "canvas":
        payload["graph"] = store.snapshot(db, key)["graph"]
    else:
        payload["knowledge"] = knowledge.backups(db,key)
    archive = write_payload(payload)
    file = uuid4().hex + ".json.gz"
    point = db.execute("""INSERT INTO recovery_points(kind,item,workspace,name,revision,captured,expires,file)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""", (kind, key, info.get("workspace", key), info["name"], rev,
                                     captured, expires, file)).fetchone()[0]
    db.execute("INSERT INTO recovery_archives(point,payload) VALUES(%s,%s)", (point, archive))
    mark_head(db, kind, key, info["updated"], rev, point)
    return point


def mark_head(db, kind, key, updated, rev, point):
    db.execute("""INSERT INTO snapshot_heads(kind,item,updated,revision,snapshot)
        VALUES(%s,%s,%s,%s,%s) ON CONFLICT(kind,item) DO UPDATE SET
        updated=excluded.updated,revision=excluded.revision,snapshot=excluded.snapshot""", (kind, key, updated, rev, point))


def scan(instant=None, *, scheduled=False):
    clock = instant or datetime.now(timezone.utc)
    timestamp = times(clock)[0]
    with store.session(True) as db:
        db.execute("DELETE FROM recovery_points WHERE expires<=%s", (timestamp,))
        for row in db.execute("SELECT id FROM canvases WHERE deleted_until<=%s ORDER BY id FOR UPDATE", (timestamp,)).fetchall():
            key = row["id"]
            for table in ("edges", "nodes", "meta", "import_history", "canvas_activity", "edit_receipts"):
                db.execute(f"DELETE FROM {table} WHERE canvas=%s", (key,))
            db.execute("DELETE FROM snapshot_heads WHERE kind='canvas' AND item=%s", (key,))
            db.execute("DELETE FROM canvases WHERE id=%s", (key,))
        changed = []
        for kind, table in TABLE.items():
            if kind == "canvas":
                table = "active_canvases"
            revision = "i.rev" if kind == "canvas" else "0"
            keys = db.execute(f"""SELECT i.id FROM {table} i LEFT JOIN snapshot_heads h
                ON h.kind=%s AND h.item=i.id
                WHERE h.item IS NULL OR h.updated!=i.updated OR h.revision!={revision}""", (kind,))
            changed.extend((kind, row[0]) for row in keys)
    for kind, key in changed:
        # Re-read under the write lock. Release between items so editors can interleave.
        with store.session(True) as db:
            try:
                info = store.required(db, TABLE[kind], key, lock=True)
            except store.Missing:  # A canvas can be deleted between scan transactions.
                continue
            head = db.execute("SELECT snapshot FROM snapshot_heads WHERE kind=%s AND item=%s", (kind,key)).fetchone()
            point = capture(db, kind, info, instant or datetime.now(timezone.utc))
            if scheduled and (not head or point != head[0]):
                db.execute("UPDATE scan_status SET captured=captured+1 WHERE id=1")


def listing(db, cold=False):
    now = times(datetime.now(timezone.utc))[0]
    return [dict(r) for r in db.execute("""
        SELECT p.*, w.name AS workspace_name,
               coalesce(c.updated,w.updated) AS live_updated, c.rev AS live_revision
        FROM recovery_points p JOIN workspaces w ON w.id=p.workspace
        LEFT JOIN canvases c ON p.kind='canvas' AND c.id=p.item
        WHERE p.cold=%s AND p.expires>%s ORDER BY p.id DESC
        """, (int(cold), now))]


def restore(db, point, editor, expected=None):
    clock = datetime.now(timezone.utc)
    now, expiry = times(clock)
    row = db.execute("SELECT * FROM recovery_points WHERE id=%s AND cold=0 AND expires>%s", (point, now)).fetchone()
    if row is None:
        raise store.Missing(point)
    kind, key = row["kind"], row["item"]
    # Deleted canvases retain their identity and history during the recovery window.
    live = db.execute(f"SELECT * FROM {TABLE[kind]} WHERE id=%s FOR NO KEY UPDATE", (key,)).fetchone()
    if live is None:
        raise store.Missing(key)
    # Recheck after waiting for another restore of this canvas.
    if not db.execute("SELECT id FROM recovery_points WHERE id=%s AND cold=0 AND expires>%s FOR SHARE",
                      (point, now)).fetchone():
        raise store.Missing(point)
    live = dict(live)
    deleted = bool(live.get("deleted_until"))
    if expected and (live["updated"], live.get("rev")) != expected:
        raise store.Conflict("此項目在確認期間已有更新，請重新整理後再還原")
    try:
        archive = db.execute("SELECT payload FROM recovery_archives WHERE point=%s", (point,)).fetchone()
        if archive is None:
            raise ValueError("Missing archive")
        payload = json.loads(gzip.decompress(archive[0]))
    except (OSError, EOFError, ValueError) as exc:
        raise store.Invalid("備份檔案遺失或無法讀取，還原已取消") from exc
    if payload["kind"] != kind or payload["item"]["id"] != key:
        raise store.Invalid("備份內容與項目不符")
    # Capture edits made since the last tick before retiring this branch.
    if not deleted and capture(db, kind, live, clock) == point:
        return {"kind": kind, "item": key, "rev": live.get("rev")}
    stamp = store.next_update(live["updated"])
    rev = live.get("rev", 0)
    name = store.name(payload["item"]["name"])
    if kind == "workspace":
        if "knowledge" in payload:
            knowledge.restore_library(db,key,payload["knowledge"],editor)
        db.execute("UPDATE workspaces SET name=%s,updated=%s WHERE id=%s", (name, stamp, key))
    else:
        graph = payload["graph"]
        knowledge.reconcile(db,graph,live["workspace"],True)
        if deleted:
            db.execute("UPDATE canvases SET deleted_until=NULL WHERE id=%s", (key,))
        before_nodes = store.snapshot(db, key)["graph"]["nodes"]
        store.check_graph(graph)
        rev += 1
        for table in ("edges", "nodes", "meta"):
            db.execute(f"DELETE FROM {table} WHERE canvas=%s", (key,))
        store.put_graph(db, key, graph, rev)
        db.execute("UPDATE canvases SET name=%s,updated=%s,rev=%s,editor=%s,write_floor=%s WHERE id=%s", (name, stamp, rev, editor, rev, key))
        store.activity.record(db, key, rev, stamp, editor, "restored", store.activity.node_changes(before_nodes, graph["nodes"]))
    db.execute("UPDATE recovery_points SET cold=1,expires=%s WHERE kind=%s AND item=%s AND cold=0 AND id>%s",
               (expiry, kind, key, point))
    mark_head(db, kind, key, stamp, rev, point)
    return {"kind": kind, "item": key, "rev": rev if kind == "canvas" else None}
