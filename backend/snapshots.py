"""Per-item recovery points with transactional branch selection and immutable gzip files."""

import gzip
import json
import os
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
from uuid import uuid4

from . import storage as store

TABLE = {"canvas": "canvases", "workspace": "workspaces"}
WEEK = timedelta(days=7)


def times(instant):
    return (instant.isoformat(timespec="microseconds"), (instant + WEEK).isoformat(timespec="microseconds"))


def directory():
    return store.location().parent / "backups"


def write_payload(payload):
    folder = directory()
    folder.mkdir(mode=0o700, parents=True, exist_ok=True)
    name = uuid4().hex + ".json.gz"
    with tempfile.NamedTemporaryFile(dir=folder, prefix=".writing-", delete=False) as out:
        temp = Path(out.name)
        try:
            with gzip.GzipFile(fileobj=out, mode="wb", filename="", compresslevel=6) as archive:
                archive.write(store.encode(payload).encode())
            out.flush()
            os.fsync(out.fileno())
            os.replace(temp, folder / name)
            fd = os.open(folder, os.O_DIRECTORY)
            try:
                os.fsync(fd)
            finally:
                os.close(fd)
        finally:
            temp.unlink(missing_ok=True)
    return name


def capture(db, kind, info, clock):
    key, rev = info["id"], info.get("rev", 0)
    head = db.execute("SELECT * FROM snapshot_heads WHERE kind=? AND item=?", (kind, key)).fetchone()
    if head and (head["updated"], head["revision"]) == (info["updated"], rev):
        return head["snapshot"]
    captured, expires = times(clock)
    payload = {"kind": kind, "item": info, "captured": captured}
    if kind == "canvas":
        payload["graph"] = store.snapshot(db, key)["graph"]
    file = write_payload(payload)
    point = db.execute("""INSERT INTO recovery_points(kind,item,workspace,name,revision,captured,expires,file)
        VALUES(?,?,?,?,?,?,?,?)""", (kind, key, info.get("workspace", key), info["name"], rev,
                                     captured, expires, file)).lastrowid
    mark_head(db, kind, key, info["updated"], rev, point)
    return point


def mark_head(db, kind, key, updated, rev, point):
    db.execute("""INSERT OR REPLACE INTO snapshot_heads(kind,item,updated,revision,snapshot)
        VALUES(?,?,?,?,?)""", (kind, key, updated, rev, point))


def scan(instant=None):
    clock = instant or datetime.now(timezone.utc)
    timestamp = times(clock)[0]
    with store.session(True) as db:
        db.execute("INSERT OR IGNORE INTO snapshot_garbage SELECT file FROM recovery_points WHERE expires<=?", (timestamp,))
        db.execute("DELETE FROM recovery_points WHERE expires<=?", (timestamp,))
        changed = []
        for kind, table in TABLE.items():
            revision = "i.rev" if kind == "canvas" else "0"
            keys = db.execute(f"""SELECT i.id FROM {table} i LEFT JOIN snapshot_heads h
                ON h.kind=? AND h.item=i.id
                WHERE h.item IS NULL OR h.updated!=i.updated OR h.revision!={revision}""", (kind,))
            changed.extend((kind, row[0]) for row in keys)
    for kind, key in changed:
        # Re-read under the write lock. Release between items so editors can interleave.
        with store.session(True) as db:
            capture(db, kind, store.required(db, TABLE[kind], key), instant or datetime.now(timezone.utc))
    collect_files(clock)


def collect_files(clock):
    folder = directory()
    if not folder.is_dir():
        return
    with store.session(True) as db:
        for row in db.execute("SELECT file FROM snapshot_garbage").fetchall():
            (folder / row[0]).unlink(missing_ok=True)
            db.execute("DELETE FROM snapshot_garbage WHERE file=?", (row[0],))
        # A rolled-back transaction may have published a file. Give unindexed
        # archives a full recovery window, including after a database replacement.
        cutoff = (clock - WEEK).timestamp()
        known = {r[0] for r in db.execute("SELECT file FROM recovery_points")}
        for f in folder.iterdir():
            if f.name.startswith(".writing-"):
                f.unlink(missing_ok=True)
            elif re.fullmatch(r"[0-9a-f]{32}\.json\.gz", f.name) and f.name not in known and f.stat().st_mtime <= cutoff:
                f.unlink(missing_ok=True)


def listing(db, cold=False):
    now = times(datetime.now(timezone.utc))[0]
    return [dict(r) for r in db.execute("""
        SELECT p.*, w.name AS workspace_name,
               coalesce(c.updated,w.updated) AS live_updated, c.rev AS live_revision
        FROM recovery_points p JOIN workspaces w ON w.id=p.workspace
        LEFT JOIN canvases c ON p.kind='canvas' AND c.id=p.item
        WHERE p.cold=? AND p.expires>? ORDER BY p.id DESC
        """, (int(cold), now))]


def restore(db, point, editor, expected=None):
    clock = datetime.now(timezone.utc)
    now, expiry = times(clock)
    row = db.execute("SELECT * FROM recovery_points WHERE id=? AND cold=0 AND expires>?", (point, now)).fetchone()
    if row is None:
        raise store.Missing(point)
    kind, key = row["kind"], row["item"]
    live = store.required(db, TABLE[kind], key)
    if expected and (live["updated"], live.get("rev")) != expected:
        raise store.Conflict("此項目在確認期間已有更新，請重新整理後再還原")
    try:
        with gzip.open(directory() / row["file"], "rt", encoding="utf-8") as f:
            payload = json.load(f)
    except (OSError, EOFError, ValueError) as exc:
        raise store.Invalid("備份檔案遺失或無法讀取，還原已取消") from exc
    if payload["kind"] != kind or payload["item"]["id"] != key:
        raise store.Invalid("備份內容與項目不符")
    # Capture edits made since the last tick before retiring this branch.
    current = capture(db, kind, live, clock)
    if current == point:
        return {"kind": kind, "item": key, "rev": live.get("rev")}
    stamp = store.next_update(live["updated"])
    rev = live.get("rev", 0)
    name = store.name(payload["item"]["name"])
    if kind == "workspace":
        db.execute("UPDATE workspaces SET name=?,updated=? WHERE id=?", (name, stamp, key))
    else:
        graph = payload["graph"]
        before_nodes = store.snapshot(db, key)["graph"]["nodes"]
        store.check_graph(graph)
        rev += 1
        for table in ("edges", "nodes", "meta"):
            db.execute(f"DELETE FROM {table} WHERE canvas=?", (key,))
        for node, value in graph["nodes"].items():
            store.put(db, key, "nodes", node, value, rev)
        for edge in graph["edges"]:
            store.put(db, key, "edges", store.edge_key(edge), edge, rev)
        for field, value in graph.items():
            if field not in ("edges", "nodes"):
                store.put(db, key, "meta", field, value, rev)
        db.execute("UPDATE canvases SET name=?,updated=?,rev=?,editor=? WHERE id=?", (name, stamp, rev, editor, key))
        store.activity.record(db, key, rev, stamp, editor, "restored", store.activity.node_changes(before_nodes, graph["nodes"]))
    db.execute("UPDATE recovery_points SET cold=1,expires=? WHERE kind=? AND item=? AND cold=0 AND id>?",
               (expiry, kind, key, point))
    mark_head(db, kind, key, stamp, rev, point)
    return {"kind": kind, "item": key, "rev": rev if kind == "canvas" else None}
