"""Compact, transactional canvas activity. Historical labels survive node removal."""
import json

MIGRATION = """
CREATE TABLE canvas_activity(
 canvas TEXT NOT NULL REFERENCES canvases(id), rev INTEGER NOT NULL, created TEXT NOT NULL,
 editor TEXT NOT NULL, kind TEXT NOT NULL, items TEXT NOT NULL, PRIMARY KEY(canvas,rev)
);
PRAGMA user_version=4;
"""


def node_changes(before, after):
    items = []
    for key in sorted(before.keys() | after.keys()):
        old, new = before.get(key), after.get(key)
        if old != new:
            action = "added" if old is None else "removed" if new is None else "edited"
            items.append({"id": key, "title": (new or old)["title"], "action": action})
    return items


def record(db, canvas, rev, time, editor, kind, items=()):
    db.execute("INSERT INTO canvas_activity VALUES(?,?,?,?,?,?)",
               (canvas, rev, time, editor, kind, json.dumps(items, ensure_ascii=False)))


def page(db, canvas, after):
    rows = db.execute("SELECT * FROM canvas_activity WHERE canvas=? AND rev>? ORDER BY rev LIMIT 51",
                      (canvas, after)).fetchall()
    return {"more": len(rows) > 50,
            "entries": [{**dict(row), "items": json.loads(row["items"])} for row in rows[:50]]}
