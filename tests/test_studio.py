import json
import os
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx
import jwt
from fastapi.testclient import TestClient
from backend import storage
from backend.main import app
from backend.backup import backup

BASE = "http://127.0.0.1:8768"
DFX = Path(os.environ.get("FLOW_TEST_GRAPH", ""))


def node(key):
    return {
        "id": key,
        "group": "驗證",
        "decision": False,
        "title": key,
        "content": [],
        "customerField": {"batch": 7},
    }


def operation(table, key, version, value=None, remove=False):
    return dict(table=table, key=key, version=version, value=value, remove=remove)


class Studio(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        env = patch.dict(os.environ, FLOW_DATA_DIR=self.temp.name, FLOW_AUTH="local")
        env.start()
        self.addCleanup(env.stop)
        self.http = TestClient(app, base_url=BASE, client=("127.0.0.1", 53000))
        self.http.__enter__()
        self.addCleanup(self.http.__exit__, None, None, None)
        self.space = self.http.get("/api/catalog").json()["workspaces"][0]["id"]
        self.canvas = self.create()
        self.path = "/api/canvases/" + self.canvas

    def create(self, **values):
        response = self.http.post(f"/api/workspaces/{self.space}/canvases", json={"name": "驗證", **values})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["id"]

    def change(self, base, *ops):
        return self.http.post(self.path + "/changes", json=dict(base=base, ops=ops))

    def test_two_connections_and_conflict(self):
        with (
            self.http.websocket_connect(
                BASE.replace("http:", "ws:") + self.path + "/live", headers={"origin": BASE}
            ) as a,
            self.http.websocket_connect(
                BASE.replace("http:", "ws:") + self.path + "/live", headers={"origin": BASE}
            ) as b,
        ):
            self.assertEqual(a.receive_json(), b.receive_json())
            self.assertEqual(self.change(1, operation("nodes", "A", None, node("A"))).status_code, 200)
            self.assertEqual(a.receive_json(), {"rev": 2})
            self.assertEqual(b.receive_json(), {"rev": 2})
            ops = [operation("nodes", "A", 2, dict(node("A"), title=t)) for t in ("first", "second")]
            barrier = threading.Barrier(2)
            codes = []

            def edit(op):
                barrier.wait()
                codes.append(self.change(2, op).status_code)

            threads = [threading.Thread(target=edit, args=(op,)) for op in ops]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
            self.assertEqual(sorted(codes), [200, 409])
            self.assertEqual(b.receive_json(), {"rev": 3})
            self.assertEqual(self.change(1, operation("nodes", "B", None, node("B"))).status_code, 200)

    def test_cascade_and_rollback(self):
        self.change(1, *(operation("nodes", i, None, node(i)) for i in "AB"))
        edge = {"from": "A", "to": "B", "kind": "next", "label": "ok"}
        self.change(2, operation("edges", storage.edge_key(edge), None, edge))
        self.assertEqual(self.change(2, operation("nodes", "A", 2, remove=True)).status_code, 409)
        bad = dict(edge, to="Z")
        self.assertEqual(
            self.change(
                3,
                operation("nodes", "C", None, node("C")),
                operation("edges", storage.edge_key(bad), None, bad),
            ).status_code,
            409,
        )
        self.assertNotIn("C", self.http.get(self.path).json()["graph"]["nodes"])
        self.assertEqual(self.change(3, operation("nodes", "A", 2, remove=True)).status_code, 200)
        self.assertEqual(self.http.get(self.path).json()["graph"]["edges"], [])

    def test_import_history_upgrade_preserves_existing_canvas(self):
        folder = Path(self.temp.name) / "old-installation"
        folder.mkdir()
        with patch.dict(os.environ, FLOW_DATA_DIR=str(folder)):
            with sqlite3.connect(storage.location()) as db:
                db.executescript(storage.SCHEMA)
            with storage.session(True) as db:
                workspace = db.execute("SELECT id FROM workspaces").fetchone()[0]
                # Seed a real v1 database before running the current migrations.
                canvas = "legacy-canvas"
                db.execute("INSERT INTO canvases VALUES(?,?,?,?,?,?)",
                           (canvas, workspace, "Existing canvas", 2, storage.now(), "Editor"))
                for key, value in {"schemaVersion": 1, "documentType": "dfx-project-flow",
                                   "title": "Existing canvas", "navigation": [], "subflows": []}.items():
                    storage.put(db, canvas, "meta", key, value, 1)
                storage.put(db, canvas, "nodes", "A", node("A"), 2)
            storage.initialize()
            storage.initialize()
            with storage.session() as db:
                self.assertEqual(storage.snapshot(db, canvas)["graph"]["nodes"], {"A": node("A")})
                self.assertEqual(db.execute("SELECT count(*) FROM import_history").fetchone()[0], 0)
                self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 6)
            with storage.session(True) as db:
                storage.commit(db, canvas, 2, [operation("nodes", "B", None, node("B"))], "Editor")
                self.assertEqual(db.execute("SELECT rev FROM canvas_activity").fetchone()[0], 3)

    def test_import_precondition_recovery_and_atomicity(self):
        self.change(1, *(operation("nodes", i, None, node(i)) for i in "AB"))
        edge = {"from": "A", "to": "B", "kind": "next", "label": "peer"}
        self.change(2, operation("edges", storage.edge_key(edge), None, edge))
        before = self.http.get(self.path).json()["graph"]
        history = self.path + "/imports"

        def apply(base, *ops):
            return self.http.post(history, json={"base": base, "ops": ops})

        remove = operation("nodes", "A", 2, remove=True)
        self.assertEqual(apply(2, remove).status_code, 412)
        self.assertEqual(apply(3, remove).status_code, 422)
        self.assertEqual(apply(3, operation("meta", "navigation", None, ["Z"])).status_code, 409)
        self.assertEqual(self.http.get(history).json(), [])
        self.assertEqual(self.http.get(self.path).json()["graph"], before)

        ops = [remove, operation("edges", storage.edge_key(edge), 3, remove=True)]
        with self.http.websocket_connect(BASE.replace("http:", "ws:") + self.path + "/live",
                                         headers={"origin": BASE}) as peer:
            self.assertEqual(peer.receive_json(), {"rev": 3})
            self.assertEqual(apply(3, *ops).json(), {"rev": 4})
            self.assertEqual(peer.receive_json(), {"rev": 4})
        self.assertEqual(apply(3, *ops).status_code, 412)
        self.assertEqual([r["revision"] for r in self.http.get(history).json()], [3])
        self.assertEqual(self.http.get(history + "/3").json(), before)
        self.assertEqual(self.http.get(self.path).json()["graph"]["edges"], [])

    def test_backup_and_clone(self):
        self.change(1, operation("nodes", "A", None, node("A")))
        space2 = self.http.post("/api/workspaces", json={"name": "新工作區"}).json()["id"]
        clone = self.http.post(
            f"/api/workspaces/{space2}/canvases", json={"source": self.canvas, "name": "副本"}
        ).json()["id"]
        self.change(2, operation("nodes", "A", 2, remove=True))
        self.assertIn("A", self.http.get("/api/canvases/" + clone).json()["graph"]["nodes"])
        self.assertEqual(
            self.http.patch("/api/canvases/" + clone, json={"name": "改名", "previous": "副本"}).status_code,
            200,
        )
        folder = Path(self.temp.name) / "new-machine"
        folder.mkdir()
        target = folder / "studio.sqlite3"
        backup(target)
        with self.assertRaises(FileExistsError):
            backup(target)
        with patch.dict(os.environ, FLOW_DATA_DIR=str(folder)):
            storage.initialize()
            with storage.session() as db:
                snap = storage.snapshot(db, clone)
                self.assertEqual(snap["canvas"]["name"], "改名")
                self.assertEqual(snap["graph"]["nodes"]["A"], node("A"))
                self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])

    @unittest.skipUnless(DFX.is_file(), "Set FLOW_TEST_GRAPH to an external graph for the integration check")
    def test_dfx_exact_roundtrip(self):
        data = json.loads(DFX.read_text())
        key = self.create(graph=data)
        self.assertEqual(self.http.get("/api/canvases/" + key).json()["graph"], data)

    def test_auth_and_origins(self):
        self.assertEqual(self.http.get("/api/catalog", headers={"cf-ray": "abc"}).status_code, 403)
        self.assertEqual(
            self.http.post(
                "/api/workspaces", headers={"origin": "https://other.example"}, json={"name": "X"}
            ).status_code,
            403,
        )
        with patch.dict(
            os.environ,
            FLOW_AUTH="cloudflare",
            CF_ACCESS_ISSUER="https://test.cloudflareaccess.com",
            CF_ACCESS_AUD="studio",
            FLOW_ORIGIN="https://flow.example.org",
        ):
            self.assertEqual(
                self.http.get(
                    "/api/catalog", headers={"Cf-Access-Authenticated-User-Email": "me@example.org"}
                ).status_code,
                401,
            )
            self.assertEqual(self.http.get("/workbench.html").status_code, 401)
            self.assertEqual(
                self.http.get("/api/catalog", headers={"cf-access-jwt-assertion": "bad"}).status_code, 401
            )
            from cryptography.hazmat.primitives.asymmetric import rsa
            import time

            key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
            claims = {
                "iss": os.environ["CF_ACCESS_ISSUER"],
                "aud": "studio",
                "email": "editor@example.org",
                "sub": "abc",
                "iat": int(time.time()),
                "exp": int(time.time() + 60),
                "type": "app",
            }
            def profile(url, *, headers, **kwargs):
                if url == claims["iss"] + "/cdn-cgi/access/get-identity":
                    self.assertEqual(set(headers), {"Cookie"})
                    self.assertEqual(headers["Cookie"], "CF_Authorization=" + assertion)
                    data = {"user_uuid": "abc", "idp": {"type": "github"}, "id": "12345", "name": "Full Name"}
                else:
                    self.assertEqual(url, "https://api.github.com/user/12345")
                    self.assertNotIn("Cookie", headers)
                    data = {"id": 12345, "login": "flow-editor"}
                return httpx.Response(200, json=data, request=httpx.Request("GET", url))

            assertion = jwt.encode(claims, key, algorithm="RS256")
            with patch("backend.auth.signing_keys") as keys, patch("backend.github_identity.httpx.get", side_effect=profile) as lookups:
                keys.return_value.get_signing_key_from_jwt.return_value.key = key.public_key()

                def get(changes):
                    assertion = jwt.encode(dict(claims, **changes), key, algorithm="RS256")
                    return self.http.get("/api/session", headers={"Cf-Access-Jwt-Assertion": assertion})

                session = get({}).json()
                self.assertEqual(session["label"], "flow-editor")
                self.assertEqual(session["username"], "flow-editor")
                self.assertEqual(session["storage_key"], claims["email"])
                headers = {"Cf-Access-Jwt-Assertion": assertion, "X-Flow-Editor": "ignored"}
                imported = self.http.post(self.path + "/imports", headers=headers, json={
                    "base": 1, "ops": [operation("nodes", "A", None, node("A"))],
                })
                self.assertEqual(imported.status_code, 200)
                history = self.http.get(self.path + "/imports", headers=headers).json()
                self.assertEqual(history[0]["editor"], "flow-editor")
                for change in ({"aud": "another"}, {"iss": "wrong"}, {"exp": 0}, {"type": "org"}):
                    self.assertEqual(get(change).status_code, 401)
                self.assertEqual(lookups.call_count, 2)
