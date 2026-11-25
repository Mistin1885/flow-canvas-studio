"""PostgreSQL transactions, ordered migrations and consistent multi-query reads."""
from contextlib import contextmanager
import os
from functools import lru_cache
from pathlib import Path

import psycopg


def record_factory(cursor):
    # Named lookup for records, ordinal lookup and unpacking for small projections.
    return record_type(tuple(column.name for column in cursor.description or ()))


@lru_cache(maxsize=128)
def record_type(names):
    indices = {name: i for i, name in enumerate(names)}

    class Record(tuple):
        def keys(self):
            return names

        def __getitem__(self, key):
            return super().__getitem__(indices[key] if isinstance(key, str) else key)

    return Record


@contextmanager
def session(write=False, *, library=False):
    with psycopg.connect(os.getenv("FLOW_DATABASE_URL", ""), row_factory=record_factory,
                         connect_timeout=5) as db:
        if write:
            # Publishing an original can update multiple canvases. Ordinary canvas
            # writes take compatible shared locks, then lock only their own canvas.
            lock = "pg_advisory_xact_lock" if library else "pg_advisory_xact_lock_shared"
            db.execute(f"SELECT {lock}(734211, 1)")
        else:
            db.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        yield db


def migrate(db):
    db.execute("SELECT pg_advisory_xact_lock(734211, 2)")
    db.execute("CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())")
    versions = [row[0] for row in db.execute("SELECT version FROM schema_migrations ORDER BY version")]
    scripts = sorted(Path(__file__).with_name("migrations").glob("[0-9]*.sql"))
    expected = [int(path.name.split("_")[0]) for path in scripts]
    if not scripts or versions != expected[:len(versions)]:
        raise RuntimeError("Unsupported PostgreSQL schema migration history")
    for path, version in zip(scripts[len(versions):], expected[len(versions):]):
        db.execute(path.read_text())
        db.execute("INSERT INTO schema_migrations(version) VALUES(%s)", (version,))
    return not versions
