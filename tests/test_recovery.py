"""Exercise the scheduled backup, operator API, and recovery timeline with disposable data."""

import asyncio
from datetime import datetime, timedelta, timezone
import gzip
import json
import os
import subprocess
import sys
import unittest
from pg_test_support import isolated_schema
from unittest.mock import patch

from fastapi.testclient import TestClient
from backend import snapshots, storage
from backend.main import app

ORIGIN = "http://127.0.0.1:8768"


class Recovery(unittest.TestCase):
    def setUp(self):
        self.enterContext(isolated_schema())
        env = patch.dict(os.environ, FLOW_AUTH="local", FLOW_DATABASE_SOCKET="")
        env.start()
        self.addCleanup(env.stop)
        self.http = TestClient(app, base_url=ORIGIN, client=("127.0.0.1", 50001))
        self.http.__enter__()
        self.addCleanup(self.http.__exit__, None, None, None)
        self.ws = self.http.get("/api/catalog").json()["workspaces"][0]["id"]
        self.canvas = self.http.post(f"/api/workspaces/{self.ws}/canvases", json={"name": "A"}).json()["id"]
        self.path = "/api/canvases/" + self.canvas
        self.assertTrue(self.http.post("/api/session/login").json()["admin"])

    def rename(self, before, after):
        res = self.http.patch(self.path, json={"name": after, "previous": before})
        self.assertEqual(res.status_code, 200, res.text)

    def points(self):
        return self.http.get("/api/admin/backups").json()

    def restore(self, point):
        return self.http.post(f"/api/admin/backups/{point['id']}/restore", json={
            "updated": point["live_updated"], "revision": point["live_revision"]})

    def test_scheduler_picks_up_changes_between_ticks(self):
        from backend import snapshot_schedule
        self.assertEqual(snapshot_schedule.INTERVAL_SECONDS, 900)

        async def exercise():
            with patch.object(snapshot_schedule, "INTERVAL_SECONDS", 0.02):
                async with snapshot_schedule.scheduler():
                    self.rename("A", "Scheduled")
                    for _ in range(100):
                        await asyncio.sleep(0.02)
                        if any(p["name"] == "Scheduled" for p in self.points()):
                            return
                    self.fail("The scheduled scan did not capture the renamed canvas")
        asyncio.run(exercise())

    def test_first_login_and_server_enforcement(self):
        cookies = dict(self.http.cookies)
        self.assertEqual(self.http.get("/admin").status_code, 200)
        self.http.cookies.clear()
        self.assertFalse(self.http.get("/api/session").json()["admin"])
        self.assertEqual(self.http.get("/admin").status_code, 403)
        for path in ["/api/admin/backups", "/admin/"]:
            self.assertEqual(self.http.get(path, headers={"X-Flow-Realm": "local",
                "X-Flow-Principal": "fake"}).status_code, 403)
        self.assertEqual(self.restore({"id": 1, "live_updated": "", "live_revision": None}).status_code, 403)
        self.http.cookies.clear()
        self.http.cookies.update(cookies)
        self.assertTrue(self.http.get("/api/session").json()["admin"])
        self.assertEqual(self.http.get("/api/admin/backups").status_code, 200)

    def test_cloud_owner_is_bound_to_subject(self):
        def verified(request):
            request.state.principal = request.headers["test-subject"]
            return {"label": "same display email", "mode": "cloudflare", "expires": None}

        with patch("backend.main.authenticate", side_effect=verified):
            for subject, expected in [("first", True), ("second", False), ("first", True)]:
                self.assertEqual(self.http.post("/api/session/login", headers={"test-subject": subject}).json()["admin"], expected)
                self.assertEqual(self.http.get("/api/admin/backups", headers={"test-subject": subject}).status_code,
                                 200 if expected else 403)
        self.assertFalse(self.http.get("/api/session").json()["admin"])

    def test_branch_expiry_and_restore_race(self):
        other = self.http.post(f"/api/workspaces/{self.ws}/canvases", json={"name": "Other"}).json()["id"]
        snapshots.scan()
        initial = self.points()
        snapshots.scan()
        self.assertEqual(self.points(), initial)
        self.rename("A", "B")
        snapshots.scan()
        target = next(p for p in self.points() if p["name"] == "B")
        self.rename("B", "C")
        snapshots.scan()
        self.rename("C", "Unsnapshotted")
        self.assertEqual(self.restore(target).status_code, 409)
        target = next(p for p in self.points() if p["name"] == "B")
        with self.http.websocket_connect(ORIGIN.replace("http:", "ws:") + self.path + "/live", headers={"origin": ORIGIN}) as socket:
            socket.receive_json()
            result = self.restore(target)
            self.assertEqual(result.status_code, 200, result.text)
            self.assertEqual(socket.receive_json(), {"rev": result.json()["rev"]})
        self.assertEqual(self.http.get(self.path).json()["canvas"]["name"], "B")
        snapshots.scan()
        self.assertEqual([p["name"] for p in self.points() if p["item"] == self.canvas], ["B", "A"])
        self.assertIn(other, [p["item"] for p in self.points()])
        with storage.session() as db:
            cold = snapshots.listing(db, cold=True)
        self.assertEqual({p["name"] for p in cold}, {"C", "Unsnapshotted"})
        for p in cold:
            with storage.session() as db:
                archive = db.execute("SELECT payload FROM recovery_archives WHERE point=%s", (p["id"],)).fetchone()[0]
                self.assertEqual(json.loads(gzip.decompress(archive))["item"]["name"], p["name"])
        self.assertEqual(self.restore(cold[0]).status_code, 404)
        self.rename("B", "D")
        snapshots.scan()
        self.assertEqual([p["name"] for p in self.points() if p["item"] == self.canvas], ["D", "B", "A"])
        snapshots.scan(datetime.now(timezone.utc) + timedelta(days=8))
        self.assertFalse(self.points())
        with storage.session() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM recovery_archives").fetchone()[0], 0)

    def test_cli_time_restore_and_workspace_rename(self):
        snapshots.scan()
        self.http.post(self.path + "/changes", json={"base": 1, "ops": [
            {"table":"meta", "key":"title", "version":1, "value":"Changed"}]}).raise_for_status()
        self.http.patch("/api/workspaces/" + self.ws, json={"name":"Renamed", "previous":"團隊工作區"}).raise_for_status()
        snapshots.scan()
        ws_target = next(p for p in self.points() if p["kind"] == "workspace" and p["name"] == "團隊工作區")
        self.assertEqual(self.restore(ws_target).status_code, 200)
        self.assertEqual(self.http.get(self.path).json()["graph"]["title"], "Changed")
        p = min((p for p in self.points() if p["item"] == self.canvas), key=lambda p:p["id"])
        result = subprocess.run([sys.executable, "-m", "backend.recovery", "restore", "--canvas",
            self.canvas, "--at", p["captured"]], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        restored = self.http.get(self.path).json()
        self.assertEqual(restored["graph"]["title"], "A")
        self.assertGreater(restored["canvas"]["rev"], 2)
        self.assertNotEqual(restored["versions"]["meta"]["title"], 1)

    def test_deleted_canvas_recovery_and_expiry(self):
        snapshots.scan()
        before = self.http.get(self.path).json()
        self.rename("A", "Latest")
        remove = lambda base: self.http.request("DELETE", self.path, json={"base": base})
        self.assertEqual(remove(1).status_code, 409)
        with patch.object(snapshots, "write_payload", side_effect=OSError("backup unavailable")):
            self.assertEqual(remove(2).status_code, 503)
        self.assertEqual(remove(2).status_code, 200)
        self.assertEqual(self.http.get(self.path).status_code, 404)
        self.assertEqual(self.http.get("/api/catalog").json()["canvases"], [])
        self.assertEqual(self.http.get("/api/catalog/page").json()["listing"]["total"], 0)
        self.assertIsNone(self.http.get("/api/catalog/page", params={"canvas": self.canvas}).json()["opened"])
        snapshots.scan()
        page = self.http.get("/api/admin/backups/page", params={"canvas": self.canvas}).json()
        latest, older = page["items"]
        self.assertTrue(latest["deleted"])
        self.assertEqual(latest["name"], "Latest")
        self.assertEqual(self.restore(older).status_code, 200)
        result = self.http.get(self.path).json()
        self.assertEqual(result["graph"], before["graph"])
        self.assertEqual(result["canvas"]["name"], "A")
        self.assertEqual(result["canvas"]["workspace"], self.ws)
        self.assertEqual(self.restore(latest).status_code, 404)
        self.assertEqual(remove(result["canvas"]["rev"]).status_code, 200)
        snapshots.scan(datetime.now(timezone.utc) + timedelta(days=8))
        with storage.session() as db:
            self.assertIsNone(db.execute("SELECT id FROM canvases WHERE id=%s", (self.canvas,)).fetchone())
        self.assertEqual(self.points(), [])

    def test_clear_and_restore_do_not_replay_old_edits(self):
        node = {"id": "A", "group": "Example", "title": "Start", "decision": False, "content": []}
        create = lambda base: self.http.post(self.path + "/changes", json={"base": base, "ops": [
            {"table": "nodes", "key": "A", "version": None, "value": node}]})
        create(1).raise_for_status()
        self.assertEqual(self.http.post(self.path + "/clear", json={"base": 1}).status_code, 409)
        with self.http.websocket_connect(ORIGIN.replace("http:", "ws:") + self.path + "/live", headers={"origin": ORIGIN}) as peer:
            peer.receive_json()
            resp = self.http.post(self.path + "/clear", json={"base": 2})
            resp.raise_for_status()
            self.assertEqual(peer.receive_json(), resp.json())
        self.assertEqual(self.http.get(self.path).json()["graph"], storage.empty_graph("A"))
        self.assertEqual(create(2).status_code, 409)
        point = next(p for p in self.points() if p["kind"] == "canvas")
        self.restore(point).raise_for_status()
        self.assertEqual(self.http.get(self.path).json()["graph"]["nodes"], {"A": node})

    def test_corrupt_archive_leaves_current_branch_intact(self):
        snapshots.scan()
        self.rename("A", "B")
        snapshots.scan()
        p = next(p for p in self.points() if p["name"] == "A")
        with storage.session(True) as db:
            db.execute("UPDATE recovery_archives SET payload=%s WHERE point=%s", (b"unreadable", p["id"]))
        self.assertEqual(self.restore(p).status_code, 422)
        self.assertEqual(self.http.get(self.path).json()["canvas"]["name"], "B")
        self.assertEqual([r["name"] for r in self.points() if r["item"] == self.canvas], ["B", "A"])
