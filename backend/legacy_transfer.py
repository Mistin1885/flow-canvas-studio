"""Lossless bridge for v1–v8 SQLite installations and format-1 portable bundles.

Only explicitly selected legacy inputs and portable exports use SQLite. Live traffic
always goes through PostgreSQL. The caller owns the PostgreSQL transaction.
"""
from contextlib import closing
import gzip
import json
from pathlib import Path
import re
import sqlite3
import tempfile

from psycopg.types.json import Json, Jsonb


TABLES = {
    "workspaces": "id name created updated",
    "canvases": "id workspace name rev updated editor deleted_until write_floor",
    "nodes": "canvas key value version",
    "edges": "canvas key value version src dst",
    "meta": "canvas key value version",
    "knowledge_entries": "id workspace document version",
    "knowledge_shares": "entry workspace",
    "import_history": "canvas revision created editor graph",
    "canvas_activity": "canvas rev created editor kind items first_rev actor",
    "edit_receipts": "canvas principal operation digest revision",
    "recovery_points": "id kind item workspace name revision captured expires cold file",
    "snapshot_heads": "kind item updated revision snapshot",
    "admin_owner": "singleton realm principal",
    "scan_status": "id attempted succeeded failed state captured error",
}
JSON_FIELDS = {"value", "graph", "items", "document"}
ORDERED = {"nodes", "edges", "meta", "knowledge_entries"}


def postgres_value(column, value):
    if column == "graph":
        # Historical whole graphs keep the insertion order of their node dictionaries.
        return Json(json.loads(value))
    return Jsonb(json.loads(value)) if column in JSON_FIELDS else value


def upgrade_copy(db):
    current = db.execute("PRAGMA user_version").fetchone()[0]
    scripts = re.findall(r"(.*?PRAGMA user_version=\d+;)", Path(__file__).with_name("legacy")
                         .joinpath("sqlite.sql").read_text(), re.S)
    if not 0 <= current <= len(scripts):
        raise ValueError(f"Unsupported SQLite schema version {current}")
    for script in scripts[current:]:
        db.executescript(script)


def import_database(db, directory):
    """Import into a newly created PG schema, including every indexed gzip archive."""
    path = (Path(directory) / "studio.sqlite3").resolve()
    with tempfile.TemporaryDirectory() as folder, closing(sqlite3.connect(Path(folder) / "copy.db")) as copy:
        with closing(sqlite3.connect(path.as_uri() + "?mode=ro", uri=True)) as source:
            if source.execute("PRAGMA user_version").fetchone()[0] == 0:
                raise ValueError("Unrecognized SQLite database")
            source.backup(copy)
        upgrade_copy(copy)
        if copy.execute("PRAGMA integrity_check").fetchone() != ("ok",) or copy.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("SQLite integrity check failed")
        db.execute("DELETE FROM scan_status")
        for table, fields in TABLES.items():
            columns = fields.split()
            names = ",".join(columns)
            query = f"SELECT {names} FROM {table}" + (" ORDER BY rowid" if table in ORDERED else "")
            rows = copy.execute(query)
            values = ([postgres_value(col, v) for col, v in zip(columns, row)]
                      for row in rows)
            with db.cursor() as cursor:
                cursor.executemany(f"INSERT INTO {table}({names}) VALUES({','.join(['%s'] * len(columns))})", values)
        for point, kind, item, filename in copy.execute("SELECT id,kind,item,file FROM recovery_points"):
            if not re.fullmatch(r"[a-f0-9]{32}\.json\.gz", filename):
                raise ValueError("Invalid archive filename")
            archive = path.parent / "backups" / filename
            if archive.is_symlink():
                raise ValueError("Unexpected archive symlink")
            raw = archive.read_bytes()
            decoded = json.loads(gzip.decompress(raw))
            if (decoded["kind"], decoded["item"]["id"]) != (kind, item):
                raise ValueError(f"Recovery point {point} does not match its archive")
            db.execute("INSERT INTO recovery_archives VALUES(%s,%s)", (point, raw))
        # Preserve the SQLite autoincrement high-water mark even after expiry.
        last = copy.execute("SELECT seq FROM sqlite_sequence WHERE name='recovery_points'").fetchone()
        if last and last[0]:
            db.execute("SELECT setval(pg_get_serial_sequence('recovery_points','id'),%s)", (last[0],))


def export_database(db, path):
    """Write a portable snapshot using the field order and JSON encoding of v8."""
    with closing(sqlite3.connect(path)) as copy:
        upgrade_copy(copy)
        copy.execute("PRAGMA foreign_keys=ON")
        copy.execute("DELETE FROM workspaces")
        copy.execute("DELETE FROM scan_status")
        for table, fields in TABLES.items():
            columns = fields.split()
            names = ",".join(columns)
            query = f"SELECT {names} FROM {table}" + (" ORDER BY position" if table in ORDERED else "")
            with db.cursor(name="portable_rows") as rows:
                rows.execute(query)
                values = ([json.dumps(v,ensure_ascii=False,separators=(",",":")) if col in JSON_FIELDS else v
                           for col,v in zip(columns,row)] for row in rows)
                copy.executemany(f"INSERT INTO {table}({names}) VALUES({','.join(['?'] * len(columns))})", values)
        high = db.execute("SELECT last_value FROM pg_sequences WHERE schemaname=current_schema() "
                          "AND sequencename='recovery_points_id_seq'").fetchone()
        if high and high[0]:
            copy.execute("DELETE FROM sqlite_sequence WHERE name='recovery_points'")
            copy.execute("INSERT INTO sqlite_sequence VALUES('recovery_points',?)", (high[0],))
        copy.commit()
