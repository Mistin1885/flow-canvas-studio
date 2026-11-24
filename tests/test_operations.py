import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
from uuid import uuid4
import zipfile

from fastapi.testclient import TestClient
from backend import bundle, snapshots, snapshot_schedule, storage
from backend.main import app

URL = "http://127.0.0.1:8768"


class Operations(unittest.TestCase):
    def setUp(self):
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.root = Path(folder.name)
        env = patch.dict(os.environ, FLOW_DATA_DIR=str(self.root / "live"), FLOW_AUTH="local", FLOW_DATABASE_SOCKET="")
        env.start()
        self.addCleanup(env.stop)
        self.http = TestClient(app, base_url=URL, client=("127.0.0.1", 50100))
        self.http.__enter__()
        self.addCleanup(self.http.__exit__, None, None, None)

    def canvas(self):
        ws = self.http.get("/api/catalog").json()["workspaces"][0]["id"]
        return self.http.post(f"/api/workspaces/{ws}/canvases", json={"name": "First"}).json()["id"]

    def test_probes_then_browser_login(self):
        for path in ("/healthz", "/api/session", "/", "/admin"):
            self.assertEqual(self.http.get(path).status_code, 200)
        self.assertFalse(self.http.get("/api/session").json()["admin"])
        self.assertEqual(self.http.get("/api/admin/backup-status").status_code, 403)
        self.http.cookies.clear()
        self.assertTrue(self.http.post("/api/session/login").json()["admin"])
        self.http.cookies.clear()
        self.assertFalse(self.http.post("/api/session/login").json()["admin"])
        self.assertEqual(self.http.get("/admin").status_code, 403)

    def test_concurrent_duplicate_and_late_replay(self):
        self.http.post("/api/session/login")
        path = "/api/canvases/" + self.canvas()
        for route, base in [("changes", 1), ("imports", 2)]:
            body = {"base": base, "strict": True, "operation_id": str(uuid4()),
                    "ops": [{"table": "meta", "key": "title", "version": base, "value": str(base)}]}
            barrier = threading.Barrier(2)
            responses = []
            def write():
                barrier.wait()
                responses.append(self.http.post(path + "/" + route, json=body).json())
            threads = [threading.Thread(target=write) for _ in range(2)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            self.assertEqual(responses, [{"rev": base+1}] * 2)
            if base == 1:
                first = body
        self.assertEqual(self.http.post(path + "/changes", json=first).json(), {"rev": 2})
        self.assertEqual(self.http.post(path + "/changes", json=dict(first, base=2)).status_code, 409)
        self.assertEqual(self.http.get(path).json()["canvas"]["rev"], 3)
        self.assertEqual(len(self.http.get(path + "/imports").json()), 1)
        self.http.cookies.clear()
        self.http.post("/api/session/login")
        self.assertEqual(self.http.post(path + "/changes", json=first).status_code, 409)

    def test_scan_failure_success_and_idle(self):
        self.http.post("/api/session/login")
        status = lambda: self.http.get("/api/admin/backup-status").json()
        # Let the startup scan finish before attributing a capture to the next run.
        import time
        for _ in range(100):
            if status()["state"] == "success":
                break
            time.sleep(0.01)
        self.canvas()
        snapshot_schedule.scheduled_scan()
        self.assertGreaterEqual(status()["captured"], 1)
        last = status()["succeeded"]
        with patch("backend.snapshot_schedule.scan", side_effect=OSError("disk full")):
            with self.assertRaises(OSError):
                snapshot_schedule.scheduled_scan()
        failed = status()
        self.assertEqual((failed["state"], failed["succeeded"]), ("failed", last))
        self.assertIn("disk full", failed["error"])
        snapshot_schedule.scheduled_scan()
        recovered = status()
        self.assertEqual((recovered["state"], recovered["captured"]), ("success", 0))
        self.assertEqual(recovered["failed"], failed["failed"])

    def test_verified_bundle_restores_both_branches(self):
        self.http.post("/api/session/login")
        key = self.canvas()
        path = "/api/canvases/" + key
        snapshots.scan()
        points = lambda: self.http.get("/api/admin/backups").json()
        initial = next(p for p in points() if p["item"] == key)
        self.http.patch(path, json={"previous": "First", "name": "Second"}).raise_for_status()
        snapshots.scan()
        with storage.session(True) as db:
            snapshots.restore(db, initial["id"], "Tester")
        file, target = self.root / "migration.zip", self.root / "destination"
        result = bundle.create(file)
        self.assertEqual((result["canvases"], result["cold"]), (1, 1))
        self.assertEqual(bundle.verify_or_restore(file), result)
        self.assertEqual(bundle.verify_or_restore(file, target), result)
        with self.assertRaises(ValueError):
            bundle.verify_or_restore(file, target)
        with patch.dict(os.environ, FLOW_DATA_DIR=str(target)):
            storage.initialize()
            with storage.session() as db:
                self.assertEqual(storage.snapshot(db, key)["canvas"]["name"], "First")
                self.assertEqual(snapshots.listing(db, cold=True)[0]["name"], "Second")
        bad = self.root / "bad.zip"
        with zipfile.ZipFile(file) as src, zipfile.ZipFile(bad, "w") as dst:
            for name in src.namelist():
                dst.writestr(name, b"broken" if name.endswith(".gz") else src.read(name))
        with self.assertRaises(ValueError):
            bundle.verify_or_restore(bad, self.root / "never-published")
        self.assertFalse((self.root / "never-published").exists())

    def test_same_node_presence_clears_on_switch_and_disconnect(self):
        path = "/api/canvases/" + self.canvas() + "/live"
        connect = lambda: self.http.websocket_connect(URL.replace("http:", "ws:") + path, headers={"origin": URL})
        with connect() as a:
            a.receive_json()
            a.send_json({"editing": "N"})
            self.assertEqual(a.receive_json()["editors"], [])
            with connect() as b:
                b.receive_json()
                b.send_json({"editing": "other"})
                self.assertEqual(b.receive_json()["editors"], [])
                b.send_json({"editing": "N", "label": "impersonated"})
                self.assertEqual(b.receive_json()["editors"], ["本機開發"])
                self.assertEqual(a.receive_json()["editors"], ["本機開發"])
                b.send_json({"editing": None})
                self.assertEqual(a.receive_json()["editors"], [])
                b.receive_json()
                b.send_json({"editing": "N"})
                b.receive_json()
                a.receive_json()
            self.assertEqual(a.receive_json()["editors"], [])
