"""Portable knowledge stored in canvas metadata, with explicitly shared workspace originals."""
from collections import Counter
import re
from uuid import uuid4

from . import storage as store

PREFIX = "knowledge."
IDENT = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")
LINK = re.compile(r"\[([^\]\n]+)\]\(kb:([a-zA-Z0-9_-]+)(?:#([a-zA-Z0-9_-]+))?\)")
# The first token owns its span, matching proseSegments in the workbench.
PROSE_TOKEN = re.compile(LINK.pattern + r"|`[^`]+`")


def document(value):
    if not isinstance(value, dict):
        raise store.Invalid("知識條目格式無效")
    title = store.name(value.get("title"))
    summary, sections = value.get("summary", ""), value.get("sections", [])
    if not isinstance(summary, str) or len(summary) > 600 or not isinstance(sections, list) or len(sections) > 50:
        raise store.Invalid("摘要最多 600 字，每篇最多 50 小節")
    ids = set()
    result = []
    for section in sections:
        if not isinstance(section, dict):
            raise store.Invalid("小節格式無效")
        key, name, body = (section.get(k) for k in ("id", "title", "body"))
        if (not isinstance(key, str) or not IDENT.fullmatch(key) or key in ids or
                not isinstance(name, str) or len(name) > 120 or not isinstance(body, str) or len(body) > 50000):
            raise store.Invalid("請檢查小節 ID、名稱與內容")
        ids.add(key)
        result.append({"id": key, "title": name, "body": body})
    return {"title": title, "summary": summary, "sections": result}


def entries(graph):
    for key, value in graph.items():
        if key.startswith(PREFIX):
            yield key[len(PREFIX):], value


def node_targets(node):
    for key, label in (("description", "說明"), ("expect", "預期結果"), ("note", "注意事項")):
        text = node.get(key)
        if isinstance(text, str) and "](kb:" in text:
            for match in LINK.finditer(text):
                yield label, match[2], match[3]
    for index, block in enumerate(node.get("content", []), 1):
        if block.get("type") != "text" or "](kb:" not in block["value"]:
            continue
        for match in PROSE_TOKEN.finditer(block["value"]):
            if match[2] is not None:
                yield f"文字步驟 {index}", match[2], match[3]


def nodes_using(nodes, item):
    for node in nodes:
        if any(key == item for _, key, _ in node_targets(node)):
            yield {"id": node["id"], "name": node["title"]}


def missing_targets(graph):
    for node in graph["nodes"].values():
        for field, key, section in node_targets(node):
            doc = graph.get(PREFIX + key)
            if doc is None:
                missing = "條目"
            elif section and not any(part["id"] == section for part in doc.get("sections", [])):
                missing = "小節"
            else:
                continue
            yield node["id"], field, key + ("#" + section if section else ""), missing


def check_reference_changes(graph, previous):
    allowed = None
    for node, field, target, missing in missing_targets(graph):
        if allowed is None:
            allowed = Counter((n, t, m) for n, _, t, m in missing_targets(previous)) if previous else Counter()
        # Step indices can move. Count occurrences within a node, keeping the current field for feedback.
        key = node, target, missing
        if allowed[key]:
            allowed[key] -= 1
        else:
            raise store.Invalid(f"節點 {node} 的{field}引用了缺少的{missing}「{target}」。請保留該條目或調整引用。")


def validate(graph):
    for key, value in entries(graph):
        if not IDENT.fullmatch(key):
            raise store.Invalid("條目 ID 無效")
        document(value)
        if "source" in value and (not isinstance(value["source"],str) or not IDENT.fullmatch(value["source"])):
            raise store.Invalid("共用原文 ID 無效")
    pins = graph.get("knowledgePins", [])
    if not isinstance(pins, list) or any(not isinstance(k, str) or PREFIX+k not in graph for k in pins):
        raise store.Invalid("畫布參考資料缺少對應條目")


def allowed(db, entry, space):
    return db.execute("""SELECT * FROM knowledge_entries e WHERE id=%s AND
        (workspace=%s OR EXISTS(SELECT 1 FROM knowledge_shares WHERE entry=e.id AND workspace=%s))""",
                      (entry, space, space)).fetchone()


def reconcile(db, graph, space, follow):
    for _, value in entries(graph):
        if not isinstance(value, dict) or "source" not in value:
            continue
        source = value.pop("source")
        row = allowed(db, source, space) if follow and isinstance(source, str) else None
        if row:
            value.update(row["document"], source=source)


def subscribers(db, source):
    return db.execute("""SELECT m.canvas,m.key,m.value,m.version,c.workspace,c.name,w.name AS space_name
        FROM meta m JOIN active_canvases c ON c.id=m.canvas JOIN workspaces w ON w.id=c.workspace
        WHERE starts_with(m.key, 'knowledge.') AND (m.value->>'source')=%s""", (source,)).fetchall()


def usage(db, row):
    key = row["key"][len(PREFIX):]
    nodes = db.execute("SELECT value FROM nodes WHERE canvas=%s", (row["canvas"],))
    pins = db.execute("SELECT value FROM meta WHERE canvas=%s AND key='knowledgePins'", (row["canvas"],)).fetchone()
    return {"canvas": row["canvas"], "name": row["name"], "workspace": row["space_name"],
            "pinned": bool(pins and key in pins[0]),
            "nodes": list(nodes_using((n[0] for n in nodes), key))}


def usage_list(db, rows):
    uses = (usage(db, row) for row in rows)
    return [item for item in uses if item["nodes"] or item["pinned"]]


def change_meta(db, canvas, key, value, expected, editor):
    info = store.required(db, "canvases", canvas)
    return store.commit(db, canvas, info["rev"], [
        {"table":"meta", "key":key, "value":value, "version":expected, "remove":False}
    ], editor)


def publish(db, owner, entry, doc, targets, version, editor):
    origin = store.required(db, "workspaces", owner)
    current = db.execute("SELECT * FROM knowledge_entries WHERE id=%s", (entry,)).fetchone()
    if current and current["workspace"] != owner:
        raise store.Invalid("請從來源工作區編輯共用原文")
    if (current["version"] if current else 0) != version:
        raise store.Conflict("原文已更新，請保留草稿並重新比對")
    targets = set(targets) - {owner}
    for t in targets:
        store.required(db, "workspaces", t)
    db.execute("""INSERT INTO knowledge_entries(id,workspace,document,version) VALUES(%s,%s,%s,%s) ON CONFLICT(id) DO UPDATE SET
        document=excluded.document,version=excluded.version""", (entry, owner, store.Jsonb(doc), version+1))
    db.execute("DELETE FROM knowledge_shares WHERE entry=%s", (entry,))
    db.cursor().executemany("INSERT INTO knowledge_shares VALUES(%s,%s)", ((entry,t) for t in targets))
    db.execute("UPDATE workspaces SET updated=%s WHERE id=%s", (store.next_update(origin["updated"]), owner))
    updated = {}
    for row in subscribers(db, entry):
        previous = row["value"]
        next_doc = dict(doc, source=entry) if row["workspace"] in targets | {owner} else document(previous)
        if next_doc != previous:
            updated[row["canvas"]] = change_meta(db, row["canvas"], row["key"], next_doc, row["version"], editor)
    return updated


def backups(db, owner):
    return [dict(id=r["id"], document=r["document"], shares=shares(db,r["id"]))
            for r in db.execute("SELECT * FROM knowledge_entries WHERE workspace=%s", (owner,))]


def shares(db, entry):
    return [r[0] for r in db.execute("SELECT workspace FROM knowledge_shares WHERE entry=%s ORDER BY workspace",(entry,))]


def restore_library(db, owner, saved, editor):
    wanted = {item["id"] for item in saved}
    for item in backups(db, owner):
        if item["id"] not in wanted:
            for row in subscribers(db, item["id"]):
                change_meta(db,row["canvas"],row["key"],document(row["value"]),row["version"],editor)
            db.execute("DELETE FROM knowledge_entries WHERE id=%s", (item["id"],))
    for item in saved:
        row = db.execute("SELECT version FROM knowledge_entries WHERE id=%s", (item["id"],)).fetchone()
        publish(db,owner,item["id"],item["document"],item["shares"],row[0] if row else 0,editor)
