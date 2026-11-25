"""PostgreSQL-specific collaboration and migration acceptance checks."""
import json
import os
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import threading
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from backend import storage, legacy_transfer
from backend.main import app
from pg_test_support import isolated_schema


class Postgres(unittest.TestCase):
    def test_other_canvas_saves_while_import_is_open(self):
        self.enterContext(isolated_schema())
        self.enterContext(patch.dict(os.environ, FLOW_AUTH="local", FLOW_DATABASE_SOCKET=""))
        web = self.enterContext(TestClient(app, base_url="http://localhost", client=("127.0.0.1", 50001)))
        ws = web.get("/api/catalog").json()["workspaces"][0]["id"]
        def canvas(name):
            return "/api/canvases/" + web.post(f"/api/workspaces/{ws}/canvases", json={"name": name}).json()["id"]
        a, b = canvas("A"), canvas("B")
        arrived, release = threading.Event(), threading.Event()
        check = storage.knowledge.check_reference_changes
        def hold(graph, previous):
            arrived.set()
            if not release.wait(15):
                raise RuntimeError("Timed out waiting for parallel save")
            return check(graph, previous)
        op = {"base": 1, "ops": [{"table": "meta", "key": "title", "version": 1, "value": "Updated"}]}
        with patch.object(storage.knowledge, "check_reference_changes", side_effect=hold), ThreadPoolExecutor(2) as pool:
            importing = pool.submit(web.post, a + "/imports", json=op)
            try:
                self.assertTrue(arrived.wait(5))
                editing = pool.submit(web.post, b + "/changes", json=op)
                self.assertEqual(editing.result(timeout=5).json(), {"rev": 2})
                self.assertEqual(web.get(a).json()["graph"]["title"], "A")
            finally:
                release.set()
            self.assertEqual(importing.result(timeout=5).json(), {"rev": 2})
        self.assertEqual(web.post(a + "/imports", json=op).status_code, 412)

    def test_parallel_edits_to_different_nodes_share_one_revision_history(self):
        self.enterContext(isolated_schema())
        self.enterContext(patch.dict(os.environ, FLOW_AUTH="local", FLOW_DATABASE_SOCKET=""))
        web = self.enterContext(TestClient(app, base_url="http://localhost", client=("127.0.0.1", 50001)))
        ws = web.get("/api/catalog").json()["workspaces"][0]["id"]
        path = "/api/canvases/" + web.post(f"/api/workspaces/{ws}/canvases", json={"name": "Joint edits"}).json()["id"]
        keys = ["A", "B", "C", "D", "E"]
        start = threading.Barrier(len(keys))
        def save(key):
            node = dict(id=key, title=key, group="Test", decision=False, content=[])
            start.wait(timeout=5)
            response = web.post(path + "/changes", json={"base": 1, "ops": [
                dict(table="nodes", key=key, value=node, version=None)]})
            response.raise_for_status()
            return response.json()["rev"]
        with ThreadPoolExecutor(len(keys)) as pool:
            self.assertEqual(sorted(pool.map(save, keys)), [2, 3, 4, 5, 6])
        snapshot = web.get(path).json()
        self.assertEqual(snapshot["canvas"]["rev"], 6)
        self.assertEqual(set(snapshot["graph"]["nodes"]), set(keys))

    @unittest.skipUnless(os.getenv("FLOW_TEST_LEGACY_DIR"), "Optional read-only legacy installation")
    def test_existing_installation(self):
        source = Path(os.environ["FLOW_TEST_LEGACY_DIR"])
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            # Freeze the reader's WAL snapshot before comparing all values.
            with closing(sqlite3.connect((source / "studio.sqlite3").as_uri() + "?mode=ro", uri=True)) as live, \
                    closing(sqlite3.connect(root / "studio.sqlite3")) as expected:
                live.backup(expected)
                (root / "backups").symlink_to(source / "backups", target_is_directory=True)
                with isolated_schema(root):
                    storage.initialize()
                    storage.initialize()
                    with storage.session() as db:
                        legacy_transfer.export_database(db, root / "roundtrip.sqlite3")
                legacy_transfer.upgrade_copy(expected)
                with closing(sqlite3.connect(root / "roundtrip.sqlite3")) as actual:
                    for table, fields in legacy_transfer.TABLES.items():
                        cols = fields.split()
                        order = "rowid" if table in legacy_transfer.ORDERED else ",".join(cols)
                        sql = f"SELECT {','.join(cols)} FROM {table} ORDER BY {order}"
                        def values(conn):
                            return [tuple(json.loads(v) if col in legacy_transfer.JSON_FIELDS else v
                                          for col,v in zip(cols, row)) for row in conn.execute(sql)]
                        self.assertTrue(values(expected) == values(actual), "Mismatched rows in " + table)
