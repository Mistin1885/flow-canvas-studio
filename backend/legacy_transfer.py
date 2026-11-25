"""Lossless bridge for v1–v8 SQLite installations and format-1 portable bundles.

Only explicitly selected legacy inputs and portable exports use SQLite. Live traffic
always goes through PostgreSQL. The caller owns the PostgreSQL transaction.
"""
from contextlib import closing, contextmanager
import gzip
import json
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile


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
    from psycopg.types.json import Json, Jsonb

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


def _file_state(path):
    try:
        st = path.stat()
    except FileNotFoundError:
        return None
    return st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns


@contextmanager
def legacy_snapshot(directory):
    # Cutover sources are offline. Recover WAL / rollback journals only on the
    # private copy so a read-only mount also works without a writable SHM file.
    source = Path(directory) / "studio.sqlite3"
    files = [source, source.with_suffix(".sqlite3-wal"), source.with_suffix(".sqlite3-journal")]
    before = [_file_state(path) for path in files]
    if before[0] is None:
        raise ValueError(f"Missing SQLite source: {source}")
    with tempfile.TemporaryDirectory() as folder:
        for path, state in zip(files, before):
            if state is not None:
                shutil.copyfile(path, Path(folder) / path.name)
        if [_file_state(path) for path in files] != before:
            raise ValueError("SQLite source changed while copying. Stop the old services and retry.")
        with closing(sqlite3.connect(Path(folder) / source.name)) as copy:
            version = copy.execute("PRAGMA user_version").fetchone()[0]
            if version == 0:
                raise ValueError("Unrecognized SQLite database")
            upgrade_copy(copy)
            if copy.execute("PRAGMA integrity_check").fetchone() != ("ok",) or copy.execute("PRAGMA foreign_key_check").fetchone():
                raise ValueError("SQLite integrity check failed")
            yield copy, version


def recovery_archives(copy, directory):
    for point, kind, item, filename in copy.execute("SELECT id,kind,item,file FROM recovery_points"):
        if not re.fullmatch(r"[a-f0-9]{32}\.json\.gz", filename):
            raise ValueError("Invalid archive filename")
        archive = Path(directory) / "backups" / filename
        if archive.is_symlink():
            raise ValueError("Unexpected archive symlink")
        raw = archive.read_bytes()
        decoded = json.loads(gzip.decompress(raw))
        if (decoded["kind"], decoded["item"]["id"]) != (kind, item):
            raise ValueError(f"Recovery point {point} does not match its archive")
        yield point, raw


def row_counts(db):
    return {table: db.execute(f"SELECT count(*) FROM {table}").fetchone()[0] for table in TABLES}


def inspect_database(directory):
    with legacy_snapshot(directory) as (copy, version):
        for table, fields in TABLES.items():
            # Verify the historical column layout and parse every stored JSON document.
            copy.execute(f"SELECT {','.join(fields.split())} FROM {table} LIMIT 0")
            for field in JSON_FIELDS.intersection(fields.split()):
                for (value,) in copy.execute(f"SELECT {field} FROM {table}"):
                    json.loads(value)
        return {"sqlite_version": version, "rows": row_counts(copy),
                "archives": sum(1 for _ in recovery_archives(copy, directory))}


def import_database(db, directory):
    """Import into a newly created PG schema, including every indexed gzip archive."""
    with legacy_snapshot(directory) as (copy, version):
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
        for point, raw in recovery_archives(copy, directory):
            db.execute("INSERT INTO recovery_archives VALUES(%s,%s)", (point, raw))
        # Preserve the SQLite autoincrement high-water mark even after expiry.
        last = copy.execute("SELECT seq FROM sqlite_sequence WHERE name='recovery_points'").fetchone()
        if last and last[0]:
            db.execute("SELECT setval(pg_get_serial_sequence('recovery_points','id'),%s)", (last[0],))
        counts = row_counts(copy)
        archives = db.execute("SELECT count(*) FROM recovery_archives").fetchone()[0]
        if row_counts(db) != counts or archives != counts["recovery_points"]:
            raise ValueError("PostgreSQL row counts differ from the SQLite source")
        return {"sqlite_version": version, "rows": counts, "archives": archives}


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
