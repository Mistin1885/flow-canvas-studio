"""SQLite graph storage. The HTTP and CLI entry points use the same transactions."""

import json
import os
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
import sqlite3
from uuid import uuid4

from . import activity, operations, knowledge
from .snapshot_schema import MIGRATION


class Invalid(ValueError):
    pass


class Conflict(Exception):
    pass


class Missing(Exception):
    pass


def location():
    default = Path(__file__).resolve().parents[2] / "flow-canvas-studio-data"
    folder = Path(os.getenv("FLOW_DATA_DIR", default)).expanduser().resolve()
    if folder.is_relative_to(Path(__file__).resolve().parents[1]):
        raise Invalid("FLOW_DATA_DIR 必須位於 repo 外")
    return folder / "studio.sqlite3"


def now():
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def next_update(previous):
    stamp = now()
    if datetime.fromisoformat(stamp) <= datetime.fromisoformat(previous):
        return (datetime.fromisoformat(previous) + timedelta(milliseconds=1)).isoformat(timespec="milliseconds")
    return stamp


def encode(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def name(value):
    if not isinstance(value, str) or not 0 < len(value.strip()) <= 120:
        raise Invalid("名稱長度須為 1 至 120 字")
    return value.strip()


@contextmanager
def session(write=False):
    db = sqlite3.connect(location(), timeout=10, isolation_level=None)
    db.row_factory = sqlite3.Row
    try:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
        yield db
        db.commit()
    finally:
        db.close()  # rolls back unfinished transactions


SCHEMA = """
CREATE TABLE workspaces(id TEXT PRIMARY KEY, name TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE canvases(id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id),
 name TEXT NOT NULL, rev INTEGER NOT NULL, updated TEXT NOT NULL, editor TEXT NOT NULL);
CREATE INDEX canvas_workspace ON canvases(workspace);
CREATE TABLE nodes(canvas TEXT REFERENCES canvases(id), key TEXT, value TEXT NOT NULL,
 version INTEGER NOT NULL, PRIMARY KEY(canvas,key));
CREATE TABLE edges(canvas TEXT, key TEXT, value TEXT NOT NULL, version INTEGER NOT NULL,
 src TEXT NOT NULL, dst TEXT NOT NULL, PRIMARY KEY(canvas,key),
 FOREIGN KEY(canvas,src) REFERENCES nodes(canvas,key) ON DELETE CASCADE,
 FOREIGN KEY(canvas,dst) REFERENCES nodes(canvas,key) ON DELETE CASCADE);
CREATE INDEX edge_src ON edges(canvas,src);
CREATE INDEX edge_dst ON edges(canvas,dst);
CREATE TABLE meta(canvas TEXT REFERENCES canvases(id), key TEXT, value TEXT NOT NULL,
 version INTEGER NOT NULL, PRIMARY KEY(canvas,key));
INSERT INTO workspaces VALUES(lower(hex(randomblob(16))), '團隊工作區', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
PRAGMA user_version=1;
"""
TABLES = ("nodes", "edges", "meta")
RESERVED = {"__proto__", "prototype", "constructor"}


def initialize():
    path = location()
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("BEGIN IMMEDIATE")
        version = db.execute("PRAGMA user_version").fetchone()[0]
        migrations = (SCHEMA, """
            CREATE TABLE import_history(
                canvas TEXT NOT NULL REFERENCES canvases(id), revision INTEGER NOT NULL,
                created TEXT NOT NULL, editor TEXT NOT NULL, graph TEXT NOT NULL,
                PRIMARY KEY(canvas,revision)
            );
            PRAGMA user_version=2;
        """, MIGRATION, activity.MIGRATION, operations.MIGRATION, activity.SUMMARY_MIGRATION, """
            ALTER TABLE canvases ADD COLUMN deleted_until TEXT;
            ALTER TABLE canvases ADD COLUMN write_floor INTEGER NOT NULL DEFAULT 1;
            CREATE VIEW active_canvases AS SELECT * FROM canvases WHERE deleted_until IS NULL;
            PRAGMA user_version=7;
        """, knowledge.MIGRATION)
        if version > len(migrations):
            raise Invalid(f"資料庫版本 {version} 與程式不相容")
        # Keep the version check and schema changes in one write transaction.
        for script in migrations[version:]:
            for statement in script.split(";"):
                if statement.strip():
                    db.execute(statement)



def required(db, table, key):
    source = "active_canvases" if table == "canvases" else table
    row = db.execute(f"SELECT * FROM {source} WHERE id=?", (key,)).fetchone()
    if row is None:
        raise Missing(key)
    return dict(row)


def edge_key(edge):
    return encode([edge.get(k) for k in ("from", "to", "kind", "label")])


def check_wire_layout(edge):
    if "wireLayout" not in edge:
        return
    layout = edge["wireLayout"]
    def coordinate(value):
        return type(value) in (float, int) and abs(value) <= 1e7
    if not isinstance(layout, dict) or any(
        layout[key] not in ("top", "right", "bottom", "left") for key in ("start", "end") if key in layout
    ):
        raise Invalid("連線接點無效")
    if "label" in layout:
        label = layout["label"]
        if not isinstance(label, dict) or not all(coordinate(label.get(k)) for k in ("x", "y")):
            raise Invalid("連線文字座標無效")
    if "lanes" in layout:
        lanes = layout["lanes"]
        if not isinstance(lanes, list) or not 1 <= len(lanes) <= 2048 or any(
            not isinstance(lane, dict) or lane.get("axis") not in ("x", "y") or
            (lane.get("at") not in ("start", "end") and not coordinate(lane.get("at")))
            for lane in lanes
        ):
            raise Invalid("連線線段座標無效")


def check_badge_styles(graph):
    styles = graph.get("badgeStyles", {})
    if not isinstance(styles, dict):
        raise Invalid("醒目標籤樣式表格式無效")
    for name, style in styles.items():
        if (not name.strip() or name != name.strip() or len(name) > 32 or name in RESERVED
                or not isinstance(style, dict)
                or not isinstance(style.get("color"), str)
                or not re.fullmatch(r"#[0-9a-fA-F]{6}", style["color"])
                or style.get("style") not in ("solid", "outline")
                or style.get("icon") not in ("none", "warning", "time", "info", "star")):
            raise Invalid("醒目標籤樣式無效")
    return styles


def check_graph(graph):
    if graph.get("schemaVersion") != 1 or graph.get("documentType") != "dfx-project-flow":
        raise Invalid("請使用工作台的流程 JSON")
    nodes, edges = graph.get("nodes"), graph.get("edges")
    if not isinstance(nodes, dict) or not isinstance(edges, list) or len(nodes) > 300 or len(edges) > 800:
        raise Invalid("畫布最多支援 300 個節點及 800 條連線")
    knowledge.validate(graph)
    badge_styles = check_badge_styles(graph)
    for key in ("ownerRoleOptions", "locationOptions"):
        if key in graph and (not isinstance(graph[key], list) or
                             any(not isinstance(v, str) or not v.strip() for v in graph[key])):
            raise Invalid("選項必須是非空白文字")
    for key, node in nodes.items():
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_-]{0,63}", key) or key in RESERVED:
            raise Invalid("節點 ID 無效")
        if not isinstance(node, dict) or node.get("id") != key:
            raise Invalid("節點 ID 與索引不符")
        if not all(isinstance(node.get(k), str) and node[k].strip() for k in ("title", "group")):
            raise Invalid("節點缺少標題或群組")
        if not isinstance(node.get("decision"), bool) or not isinstance(node.get("content"), list):
            raise Invalid("節點格式無效")
        if any(
            not isinstance(c, dict)
            or c.get("type") not in ("text", "code")
            or not isinstance(c.get("value"), str)
            for c in node["content"]
        ):
            raise Invalid("節點內容格式無效")
        badges = node.get("badges", {})
        if not isinstance(badges, dict) or any(
            name not in badge_styles or side not in ("top", "bottom") for name, side in badges.items()
        ):
            raise Invalid("醒目標籤不存在或位置無效")
        if any(i not in nodes for i in node.get("frameMembers", [])):
            raise Conflict("框內節點已變更")
    for key, node in nodes.items():
        target = node.get("jumpTo")
        if node.get("type") == "return" or target is not None:
            if not isinstance(target, str) or target not in nodes or target == key or nodes[target].get("jumpTo"):
                raise Conflict("返回目標必須為同一畫布中存在且非跳轉入口的其他節點")
    seen = set()
    for edge in edges:
        if (
            not isinstance(edge, dict)
            or edge.get("kind") not in ("next", "return", "retry")
            or not isinstance(edge.get("label"), str)
        ):
            raise Invalid("連線格式無效")
        if edge.get("from") not in nodes or edge.get("to") not in nodes:
            raise Conflict("連線端點已變更或不在此畫布")
        check_wire_layout(edge)
        key = edge_key(edge)
        if key in seen:
            raise Invalid("重複連線")
        seen.add(key)
    if any(i not in nodes for i in graph.get("navigation", [])):
        raise Conflict("導覽節點已變更")
    for flow in graph.get("subflows", []):
        if flow["root"] not in nodes or flow["parent"] not in nodes:
            raise Conflict("子流程端點已變更")
    groups = {n["group"] for n in nodes.values()}
    flows = {f["id"] for f in graph.get("subflows", [])}
    for group in graph.get("layoutGroups", []):
        groups.add(group["name"])
    for row in [*graph.get("subflows", []), *graph.get("layoutGroups", [])]:
        if any(i not in nodes for i in row.get("memberOrder", [])):
            raise Conflict("群組或子流程成員已變更")
    endpoints = set(nodes) | {"flow:" + key for key in flows} | {"group:" + key for key in groups}
    for link in graph.get("groupLinks", []):
        check_wire_layout(link)
        if link.get("from") not in endpoints or link.get("to") not in endpoints:
            raise Conflict("框線或群組連線端點已變更")
    for item in [*nodes.values(), *edges]:
        for field in ("jumpTo", "jumpScope", "resume"):
            if field in item and item[field] not in nodes:
                raise Conflict("跳轉或接續的節點已變更")
        for scope, patch in item.get("scopeOverrides", {}).items():
            if scope not in nodes or any(patch[k] not in nodes for k in ("to", "resume") if k in patch):
                raise Conflict("主流程覆寫的端點已變更")
    if RESERVED.intersection(graph):
        raise Invalid("保留的欄位名稱")


def snapshot(db, canvas):
    info = required(db, "canvases", canvas)
    records = {}
    versions = {}
    for table in TABLES:
        rows = db.execute(f"SELECT key,value,version FROM {table} WHERE canvas=? ORDER BY rowid", (canvas,))
        values, stamps = {}, {}
        for key, raw, stamp in rows:
            values[key], stamps[key] = json.loads(raw), stamp
        records[table], versions[table] = values, stamps
    graph = dict(records["meta"], nodes=records["nodes"], edges=list(records["edges"].values()))
    return {"canvas": info, "graph": graph, "versions": versions}


def put(db, canvas, table, key, value, version):
    cols = ["canvas", "key", "value", "version"]
    values = [canvas, key, encode(value), version]
    if table == "edges":
        if not isinstance(value, dict) or edge_key(value) != key:
            raise Invalid("連線索引無效")
        cols.extend(["src", "dst"])
        values.extend([value["from"], value["to"]])
    update = ",".join(f"{col}=excluded.{col}" for col in cols[2:])
    db.execute(
        f"INSERT INTO {table}({','.join(cols)}) VALUES({','.join('?' for _ in cols)}) "
        f"ON CONFLICT(canvas,key) DO UPDATE SET {update}",
        values,
    )


def empty_graph(title):
    return {
        "schemaVersion": 1,
        "documentType": "dfx-project-flow",
        "title": title,
        "nodes": {},
        "edges": [],
        "navigation": [],
        "subflows": [],
    }


def create_canvas(db, workspace, title, editor, graph=None, source=None, follow=False):
    required(db, "workspaces", workspace)
    canvas = uuid4().hex
    db.execute("INSERT INTO canvases(id,workspace,name,rev,updated,editor) VALUES(?,?,?,?,?,?)", (canvas, workspace, name(title), 1, now(), editor))
    if source:
        source_info = required(db, "canvases", source)
        for table in ("nodes", "edges", "meta"):
            extra = ",src,dst" if table == "edges" else ""
            db.execute(
                f"INSERT INTO {table} SELECT ?,key,value,1{extra} FROM {table} WHERE canvas=? ORDER BY rowid",
                (canvas, source),
            )
        docs = {r[0]: json.loads(r[1]) for r in db.execute("SELECT key,value FROM meta WHERE canvas=? AND key GLOB 'knowledge.*'", (canvas,))}
        knowledge.reconcile(db, docs, workspace, follow or source_info["workspace"] == workspace)
        for key, value in docs.items():
            put(db, canvas, "meta", key, value, 1)
    else:
        if graph is None:
            graph = empty_graph(title)
        knowledge.reconcile(db, graph, workspace, False)
        check_graph(graph)
        for key, value in graph.items():
            if key not in ("nodes", "edges"):
                put(db, canvas, "meta", key, value, 1)
        for key, value in graph["nodes"].items():
            put(db, canvas, "nodes", key, value, 1)
        for value in graph["edges"]:
            put(db, canvas, "edges", edge_key(value), value, 1)
    activity.record(db, canvas, 1, now(), editor, "created")
    return canvas


def commit(db, canvas, base, ops, editor, kind="edited", actor=None):
    before = {}
    after = {}
    info = required(db, "canvases", canvas)
    if base < info["write_floor"]:
        raise Conflict("畫布已清空或還原，請比對最新版本")
    current = info["rev"]
    stamp = current + 1
    visited = set()
    for op in ops:
        table, key = op["table"], op["key"]
        if table not in TABLES or key in RESERVED or (table == "meta" and key in TABLES):
            raise Invalid("無效的編輯項目")
        if (table, key) in visited:
            raise Invalid("重複的編輯項目")
        visited.add((table, key))
        result = db.execute(
            f"SELECT version,value FROM {table} WHERE canvas=? AND key=?", (canvas, key)
        ).fetchone()
        if table == "nodes":
            if result:
                before[key] = json.loads(result[1])
            if not op["remove"]:
                after[key] = op["value"]
        if (result[0] if result else None) != op["version"]:
            if table == "meta" and result and not op["remove"] and json.loads(result[1]) == op["value"]:
                continue
            raise Conflict(f"{table} · {key} 已由其他人變更")
        if table == "nodes" and op["remove"]:
            if db.execute(
                "SELECT 1 FROM edges WHERE canvas=? AND (src=? OR dst=?) AND version>? LIMIT 1",
                (canvas, key, key, base),
            ).fetchone():
                raise Conflict("此節點的連線已由其他人變更")
    # Keep referential integrity even during a compound import or deletion.
    for table, remove in (
        ("edges", True),
        ("nodes", True),
        ("meta", True),
        ("nodes", False),
        ("meta", False),
        ("edges", False),
    ):
        for op in ops:
            if op["table"] != table or op["remove"] != remove:
                continue
            if remove:
                db.execute(f"DELETE FROM {table} WHERE canvas=? AND key=?", (canvas, op["key"]))
            else:
                value = op["value"]
                if table == "meta" and op["key"].startswith(knowledge.PREFIX) and isinstance(value,dict) and "source" in value:
                    source = value["source"]
                    origin = knowledge.allowed(db, source, info["workspace"]) if isinstance(source,str) else None
                    if not origin or knowledge.document(value) != json.loads(origin["document"]):
                        if kind == "imported":
                            value = knowledge.document(value)
                        else:
                            raise Conflict("共用原文或分享範圍已變更，請重新選取或建立副本")
                put(db, canvas, table, op["key"], value, stamp)
    check_graph(snapshot(db, canvas)["graph"])
    updated = now()
    items = activity.node_changes(before, after)
    for table, label in (("edges", "connections"), ("meta", "settings")):
        if any(op["table"] == table for op in ops):
            items.append({"action": label})
    activity.record(db, canvas, stamp, updated, editor, kind, items, actor)
    db.execute("UPDATE canvases SET rev=?,updated=?,editor=? WHERE id=?", (stamp, updated, editor, canvas))
    return stamp
