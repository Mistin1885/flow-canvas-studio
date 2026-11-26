"""PostgreSQL graph storage. The HTTP and CLI entry points use the same transactions."""

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
import re
from psycopg.types.json import Jsonb
from uuid import uuid4

from . import activity, knowledge
from .postgres import migrate, session


class Invalid(ValueError):
    pass


class Conflict(Exception):
    pass


class Missing(Exception):
    pass


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


TABLES = ("nodes", "edges", "meta")
RESERVED = {"__proto__", "prototype", "constructor"}


def initialize():
    with session(True, library=True) as db:
        if migrate(db):
            legacy = os.getenv("FLOW_LEGACY_DIR")
            if legacy and (Path(legacy) / "studio.sqlite3").exists():
                from .legacy_transfer import import_database
                import_database(db, Path(legacy))
            else:
                stamp = now()
                db.execute("INSERT INTO workspaces(id,name,created,updated) VALUES(%s,%s,%s,%s)",
                           (uuid4().hex, "團隊工作區", stamp, stamp))


def required(db, table, key, *, lock=False):
    source = "active_canvases" if table == "canvases" else table
    clause = " FOR NO KEY UPDATE" if lock else ""
    row = db.execute(f"SELECT * FROM {source} WHERE id=%s{clause}", (key,)).fetchone()
    if row is None:
        raise Missing(key)
    return dict(row)


def edge_key(edge):
    return encode([edge.get(k) for k in ("from", "to", "kind", "label")])


def check_edge_appearance(edge):
    background = edge.get("labelBackgroundColor", "auto")
    if background != "auto" and (not isinstance(background, str) or not re.fullmatch(r"#[a-fA-F0-9]{6}", background)):
        raise Invalid("條件文字底色無效")
    check_wire_layout(edge)


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
    for side in ("start", "end"):
        key = side + "Ratio"
        if key in layout and (side not in layout or not coordinate(layout[key]) or not 0 <= layout[key] <= 1):
            raise Invalid("連線接點位置無效")
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
        check_edge_appearance(edge)
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
        check_edge_appearance(link)
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
        rows = db.execute(f"SELECT key,value,version FROM {table} WHERE canvas=%s ORDER BY position", (canvas,))
        values, stamps = {}, {}
        for key, raw, stamp in rows:
            values[key], stamps[key] = raw, stamp
        records[table], versions[table] = values, stamps
    graph = dict(records["meta"], nodes=records["nodes"], edges=list(records["edges"].values()))
    return {"canvas": info, "graph": graph, "versions": versions}


def put(db, canvas, table, key, value, version):
    put_items(db, canvas, table, [(key, value)], version)


def put_items(db, canvas, table, items, version):
    cols = ["canvas", "key", "value", "version"]
    if table == "edges":
        cols.extend(["src", "dst"])
    rows = []
    for key, value in items:
        row = [canvas, key, Jsonb(value), version]
        if table == "edges":
            if not isinstance(value, dict) or edge_key(value) != key:
                raise Invalid("連線索引無效")
            row.extend([value["from"], value["to"]])
        rows.append(row)
    if rows:
        update = ",".join(f"{col}=excluded.{col}" for col in cols[2:])
        with db.cursor() as cur:
            cur.executemany(
                f"INSERT INTO {table}({','.join(cols)}) VALUES({','.join(['%s'] * len(cols))}) "
                f"ON CONFLICT(canvas,key) DO UPDATE SET {update}", rows,
            )


def put_graph(db, canvas, graph, version):
    put_items(db, canvas, "meta", ((k, v) for k, v in graph.items() if k not in ("nodes", "edges")), version)
    put_items(db, canvas, "nodes", graph["nodes"].items(), version)
    put_items(db, canvas, "edges", ((edge_key(edge), edge) for edge in graph["edges"]), version)


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
    db.execute("INSERT INTO canvases(id,workspace,name,rev,updated,editor) VALUES(%s,%s,%s,%s,%s,%s)", (canvas, workspace, name(title), 1, now(), editor))
    if source:
        source_info = required(db, "canvases", source, lock=True)
        for table in ("nodes", "edges", "meta"):
            extra = ",src,dst" if table == "edges" else ""
            db.execute(
                f"INSERT INTO {table}(canvas,key,value,version{extra}) SELECT %s,key,value,1{extra} FROM {table} WHERE canvas=%s ORDER BY position",
                (canvas, source),
            )
        docs = {r[0]: r[1] for r in db.execute("SELECT key,value FROM meta WHERE canvas=%s AND starts_with(key, 'knowledge.')", (canvas,))}
        knowledge.reconcile(db, docs, workspace, follow or source_info["workspace"] == workspace)
        for key, value in docs.items():
            put(db, canvas, "meta", key, value, 1)
    else:
        if graph is None:
            graph = empty_graph(title)
        knowledge.reconcile(db, graph, workspace, False)
        check_graph(graph)
        knowledge.check_reference_changes(graph, None)
        put_graph(db, canvas, graph, 1)
    activity.record(db, canvas, 1, now(), editor, "created")
    return canvas


def commit(db, canvas, base, ops, editor, kind="edited", actor=None, reference_base=None):
    before = {}
    after = {}
    info = required(db, "canvases", canvas, lock=True)
    if base < info["write_floor"]:
        raise Conflict("畫布已清空或還原，請比對最新版本")
    current = info["rev"]
    stamp = current + 1
    # Check a batch against at most three indexed reads while the canvas row is locked.
    existing = {}
    for table in TABLES:
        keys = [op["key"] for op in ops if op["table"] == table]
        if keys:
            for key, version, value in db.execute(
                f"SELECT key,version,value FROM {table} WHERE canvas=%s AND key=ANY(%s)", (canvas, keys)
            ):
                existing[table, key] = version, value
    visited = set()
    for op in ops:
        table, key = op["table"], op["key"]
        if table not in TABLES or key in RESERVED or (table == "meta" and key in TABLES):
            raise Invalid("無效的編輯項目")
        if (table, key) in visited:
            raise Invalid("重複的編輯項目")
        visited.add((table, key))
        result = existing.get((table, key))
        if table == "nodes":
            if result:
                before[key] = result[1]
            if not op["remove"]:
                after[key] = op["value"]
        if (result[0] if result else None) != op["version"]:
            if table == "meta" and result and not op["remove"] and result[1] == op["value"]:
                continue
            raise Conflict(f"{table} · {key} 已由其他人變更")
    removed_nodes = [op["key"] for op in ops if op["table"] == "nodes" and op["remove"]]
    if removed_nodes and db.execute(
        "SELECT 1 FROM edges WHERE canvas=%s AND (src=ANY(%s) OR dst=ANY(%s)) AND version>%s LIMIT 1",
        (canvas, removed_nodes, removed_nodes, base),
    ).fetchone():
        raise Conflict("此節點的連線已由其他人變更")

    # Delete edges before nodes and insert nodes before edges, in one transaction.
    for table in ("edges", "nodes", "meta"):
        keys = [op["key"] for op in ops if op["table"] == table and op["remove"]]
        if keys:
            db.execute(f"DELETE FROM {table} WHERE canvas=%s AND key=ANY(%s)", (canvas, keys))
    for table in ("nodes", "meta", "edges"):
        items = []
        for op in ops:
            if op["table"] != table or op["remove"]:
                continue
            key, value = op["key"], op["value"]
            if table == "meta" and key.startswith(knowledge.PREFIX) and isinstance(value, dict) and "source" in value:
                source = value["source"]
                origin = knowledge.allowed(db, source, info["workspace"]) if isinstance(source, str) else None
                if not origin or knowledge.document(value) != origin["document"]:
                    if kind != "imported":
                        raise Conflict("共用原文或分享範圍已變更，請重新選取或建立副本")
                    value = knowledge.document(value)
            items.append((key, value))
        put_items(db, canvas, table, items, stamp)
    graph = snapshot(db, canvas)["graph"]
    check_graph(graph)
    if reference_base is not None:
        knowledge.check_reference_changes(graph, reference_base)
    updated = now()
    items = activity.node_changes(before, after)
    for table, label in (("edges", "connections"), ("meta", "settings")):
        if any(op["table"] == table for op in ops):
            items.append({"action": label})
    activity.record(db, canvas, stamp, updated, editor, kind, items, actor)
    db.execute("UPDATE canvases SET rev=%s,updated=%s,editor=%s WHERE id=%s", (stamp, updated, editor, canvas))
    return stamp
