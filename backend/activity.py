"""Compact, transactional canvas activity. Historical labels survive node removal."""
from datetime import datetime
from psycopg.types.json import Jsonb


MAX_ENTRIES = 200
MAX_ITEMS = 12


def node_changes(before, after):
    items = []
    for key in sorted(before.keys() | after.keys()):
        old, new = before.get(key), after.get(key)
        if old != new:
            action = "added" if old is None else "removed" if new is None else "edited"
            items.append({"id": key, "title": (new or old)["title"][:200], "action": action})
    return items


def record(db, canvas, rev, time, editor, kind, items=(), actor=None):
    items = list(items)
    if kind == "edited" and not items:
        return
    actor = actor or editor
    # Group adjacent routine saves by the same editor in a fixed five-minute window.
    # Structural actions remain individually visible and form a boundary between summaries.
    if kind == "edited" and _routine(items):
        previous = db.execute("""SELECT * FROM canvas_activity WHERE canvas=%s
            ORDER BY rev DESC LIMIT 1""", (canvas,)).fetchone()
        if (previous and previous["kind"] == kind and previous["actor"] == actor and previous["editor"] == editor
                and previous["rev"] + 1 == rev and _window(previous["created"]) == _window(time)):
            old = previous["items"]
            if _routine(old):
                combined = {(i["action"], i.get("id")): i for i in [*old, *items]}
                if len(combined) <= MAX_ITEMS:
                    db.execute("""UPDATE canvas_activity SET first_rev=coalesce(first_rev, rev),
                        rev=%s,created=%s,items=%s WHERE canvas=%s AND rev=%s""",
                        (rev, time, Jsonb(list(combined.values())), canvas, previous["rev"]))
                    return
    if len(items) > MAX_ITEMS:
        items = [*items[:MAX_ITEMS], {"action": "more", "count": len(items) - MAX_ITEMS}]
    db.execute("INSERT INTO canvas_activity(canvas,rev,created,editor,kind,items,actor) VALUES(%s,%s,%s,%s,%s,%s,%s)",
               (canvas, rev, time, editor, kind, Jsonb(items), actor))
    db.execute("""DELETE FROM canvas_activity WHERE canvas=%s AND rev <=
        (SELECT rev FROM canvas_activity WHERE canvas=%s ORDER BY rev DESC LIMIT 1 OFFSET %s)""",
        (canvas, canvas, MAX_ENTRIES))


def _routine(items):
    return all(i["action"] in {"edited", "connections", "settings"} for i in items)


def _window(stamp):
    return int(datetime.fromisoformat(stamp).timestamp()) // 300


def page(db, canvas, after):
    rows = db.execute("SELECT canvas,rev,first_rev,created,editor,kind,items FROM canvas_activity WHERE canvas=%s AND rev>%s ORDER BY rev LIMIT 51",
                      (canvas, after)).fetchall()
    return {"more": len(rows) > 50,
            "entries": [{**dict(row), "items": row["items"]} for row in rows[:50]]}
