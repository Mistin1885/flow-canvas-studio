"""Give each test (including its subprocesses) a disposable PostgreSQL schema."""
from contextlib import contextmanager
import os
from unittest.mock import patch
from uuid import uuid4

import psycopg
from psycopg.conninfo import make_conninfo
from psycopg import sql


@contextmanager
def isolated_schema(legacy=None):
    base = os.environ.get("FLOW_TEST_DATABASE_URL")
    if not base:
        raise RuntimeError("Set FLOW_TEST_DATABASE_URL to a PostgreSQL test database. See README.")
    name = "flow_test_" + uuid4().hex
    with psycopg.connect(base, autocommit=True) as db:
        db.execute(sql.SQL("CREATE SCHEMA {}").format(sql.Identifier(name)))
        try:
            # No fallback to public: unqualified DDL and reads stay in this test's schema.
            dsn = make_conninfo(base, options="-csearch_path=" + name)
            with patch.dict(os.environ, FLOW_DATABASE_URL=dsn, FLOW_LEGACY_DIR=str(legacy or "")):
                yield
        finally:
            db.execute(sql.SQL("DROP SCHEMA {} CASCADE").format(sql.Identifier(name)))
