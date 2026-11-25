"""Use the public proxy and disposable PostgreSQL schemas to exercise filtered page boundaries."""

import os
import unittest
from pg_test_support import isolated_schema
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend import snapshots
from backend.main import app


class Paging(unittest.TestCase):
    def setUp(self):
        self.enterContext(isolated_schema())
        self.enterContext(patch.dict(os.environ, FLOW_AUTH="local", FLOW_DATABASE_SOCKET=""))
        self.web = self.enterContext(TestClient(app, base_url="http://localhost", client=("127.0.0.1", 50001)))
        self.web.post("/api/session/login").raise_for_status()
        self.workspace = self.web.get("/api/catalog/page").json()["workspaces"][0]["id"]
        self.other = self.web.post("/api/workspaces", json={"name": "Other"}).json()["id"]

    def canvas(self, space, name):
        response = self.web.post(f"/api/workspaces/{space}/canvases", json={"name": name})
        response.raise_for_status()
        return response.json()["id"]

    def read(self, path, **params):
        response = self.web.get("/api/" + path + "/page", params=params)
        response.raise_for_status()
        return response.json()

    def test_canvas_search_order_totals_and_deep_link(self):
        ids = sorted(self.canvas(self.workspace, "重複_%") for _ in range(3))
        self.canvas(self.workspace, "A")
        self.canvas(self.other, "重複_%")
        args = dict(workspace=self.workspace, size=2, sort="name", q="_%")
        first = self.read("catalog", **args)
        self.assertEqual(first["workspaces"][0]["canvases"], 4)
        self.assertEqual(first["listing"]["total"], 3)
        self.assertEqual([c["id"] for c in first["listing"]["items"]], ids[:2])
        last = self.read("catalog", page=90, **args)["listing"]
        self.assertEqual((last["page"], last["pages"], last["items"][0]["id"]), (2, 2, ids[2]))
        self.assertEqual(self.read("catalog", canvas=ids[2])["opened"]["id"], ids[2])
        self.assertIsNone(self.read("catalog", canvas="missing")["opened"])
        self.assertEqual(self.web.get("/api/catalog/page?size=0").status_code, 422)

    def test_backup_filter_page_and_restore(self):
        key = self.canvas(self.workspace, "QA_%")
        self.canvas(self.other, "QA_%")
        path = f"/api/canvases/{key}"
        args = dict(workspace=self.workspace, canvas=key, kind="canvas", size=1)
        snapshots.scan()
        self.web.patch(path, json={"name": "Current", "previous": "QA_%"}).raise_for_status()
        snapshots.scan()
        first = self.read("admin/backups", **args)
        self.assertEqual(first["total"], 2)
        self.assertEqual(first["items"][0]["name"], "Current")
        self.assertEqual([c["id"] for c in first["canvases"]], [key])
        last = self.read("admin/backups", page=2, **args)["items"][0]
        self.assertEqual(last["name"], "QA_%")
        for q in ["_%", "#" + str(last["id"])]:
            self.assertEqual(self.read("admin/backups", q=q, **args)["items"][0]["id"], last["id"])
        self.assertEqual(self.read("admin/backups", q="CURRENT", **args)["total"], 2)
        self.assertEqual(self.read("admin/backups", workspace=self.other, canvas=key)["total"], 0)
        self.assertTrue(all(p["kind"] == "workspace" for p in self.read("admin/backups", kind="workspace")["items"]))
        response = self.web.post(f"/api/admin/backups/{last['id']}/restore",
                                 json={"updated": last["live_updated"], "revision": last["live_revision"]})
        response.raise_for_status()
        reduced = self.read("admin/backups", page=2, **args)
        self.assertEqual((reduced["page"], reduced["total"], reduced["items"][0]["id"]), (1, 1, last["id"]))
        self.web.cookies.clear()
        self.assertEqual(self.web.get("/api/admin/backups/page").status_code, 403)
