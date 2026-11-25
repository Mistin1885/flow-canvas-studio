"""A shared original, an independent copy and a portable export across workspaces."""
from contextlib import ExitStack
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app
from backend import snapshots, storage

BASE = "http://127.0.0.1:8768"


class Knowledge(unittest.TestCase):
    def setUp(self):
        stack = self.enterContext(ExitStack())
        folder = stack.enter_context(tempfile.TemporaryDirectory())
        stack.enter_context(patch.dict(os.environ, FLOW_DATA_DIR=folder, FLOW_AUTH="local", FLOW_DATABASE_SOCKET=""))
        self.web = stack.enter_context(TestClient(app, base_url=BASE, client=("127.0.0.1", 53000)))
        self.owner = self.web.get("/api/catalog").json()["workspaces"][0]["id"]
        self.guest = self.post("workspaces", {"name":"Support"})["id"]

    def post(self, path, body):
        result = self.web.post("/api/"+path, json=body)
        self.assertLess(result.status_code, 300, result.text)
        return result.json()

    def canvas(self, space, **kwargs):
        return self.post(f"workspaces/{space}/canvases", dict(name="Workflow", **kwargs))["id"]

    def mutate(self, space, action, **kwargs):
        return self.post("knowledge/"+space, dict(action=action, **kwargs))

    def library(self, space, **query):
        return self.web.get("/api/knowledge/"+space, params=query).json()

    def snapshot(self, canvas):
        return self.web.get("/api/canvases/"+canvas).json()

    def test_sharing_and_portable_forks(self):
        owner, guest = self.owner, self.guest
        first, second = self.canvas(owner), self.canvas(guest)
        doc = dict(title="Report",summary="Original",sections=[dict(id="fields", title="Fields",body="Name and impact")])
        local = self.mutate(owner,"save",canvas=first,doc=doc)["id"]
        key = "knowledge."+local
        shared = self.mutate(owner,"promote",canvas=first,local=local,localVersion=2)["id"]
        self.assertFalse(self.library(guest)["entries"])
        self.mutate(owner,"save",entry=shared,version=1,shares=[guest],doc=doc)
        self.mutate(guest,"pin",canvas=second,entry=shared)
        info = self.library(guest,canvas=second,selected=shared)
        self.assertEqual(info["entries"][0]["uses"][0]["canvas"],second)
        pinned = "knowledge."+info["pins"][0]
        standalone = self.canvas(guest,source=first)
        following = self.canvas(guest,source=first,follow=True)
        imported = self.canvas(guest,graph=self.snapshot(first)["graph"])
        with ExitStack() as sockets:
            peers = [sockets.enter_context(self.web.websocket_connect(BASE.replace("http:", "ws:")+f"/api/canvases/{c}/live",
                      headers={"origin":BASE})) for c in (first,second)]
            starts = [p.receive_json()["rev"] for p in peers]
            updated = dict(doc,summary="Updated")
            self.mutate(owner,"save",entry=shared,version=2,shares=[guest],doc=updated)
            self.assertEqual([p.receive_json()["rev"] for p in peers],[r+1 for r in starts])
        self.assertEqual(self.snapshot(second)["graph"][pinned]["summary"],"Updated")
        self.assertEqual(self.snapshot(following)["graph"][key]["summary"],"Updated")
        for canvas in standalone, imported:
            self.assertEqual(self.snapshot(canvas)["graph"][key],doc)
        stale = self.web.post("/api/knowledge/"+owner,json=dict(action="save",entry=shared,version=2,doc=doc))
        self.assertEqual(stale.status_code,409)
        self.mutate(owner,"save",entry=shared,version=3,shares=[],doc=dict(doc,summary="Owner only"))
        self.assertEqual(self.snapshot(second)["graph"][pinned],updated)
        self.assertEqual(self.snapshot(following)["graph"][key],updated)
        self.assertFalse(self.library(guest)["entries"])

    def test_local_sections_pins_and_named_backlinks(self):
        canvas = self.canvas(self.owner)
        key = self.mutate(self.owner,"save",canvas=canvas,doc=dict(title="Checklist"))["id"]
        self.mutate(self.owner,"pin",canvas=canvas,local=key)
        node = dict(id="N1",title="Verify",group="Flow",decision=False,content=[],
                    description=f"Read [requirements](kb:{key}#fields).")
        self.post("canvases/"+canvas+"/changes",dict(base=3,ops=[dict(table="nodes",key="N1",version=None,value=node)]))
        usage=self.library(self.owner,canvas=canvas,selected=key)["entries"][0]["uses"][0]
        self.assertEqual(usage["nodes"],[dict(id="N1",name="Verify")])
        self.assertTrue(usage["pinned"])
        self.mutate(self.owner,"pin",canvas=canvas,local=key,pinVersion=3)
        self.assertFalse(self.library(self.owner,canvas=canvas)["pins"])

    def test_workspace_recovery_restores_original_and_subscriptions(self):
        key = self.mutate(self.owner, "save", doc={"title": "Original"}, shares=[self.guest])["id"]
        canvas = self.canvas(self.guest)
        self.mutate(self.guest, "pin", canvas=canvas, entry=key)
        snapshots.scan()
        with storage.session() as db:
            point = db.execute("SELECT snapshot FROM snapshot_heads WHERE kind='workspace' AND item=?",
                               (self.owner,)).fetchone()[0]
        self.mutate(self.owner, "save", entry=key, version=1, shares=[self.guest], doc={"title": "Revised"})
        with storage.session(True) as db:
            snapshots.restore(db, point, "test")
        current = self.library(self.guest, canvas=canvas)["entries"][0]
        self.assertEqual(current["doc"]["title"], "Original")
        self.assertEqual(self.snapshot(canvas)["graph"]["knowledge."+current["local"]]["title"], "Original")
