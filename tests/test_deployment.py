"""Exercise the web/database boundary without using a development database."""

import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import tempfile
import unittest
from pg_test_support import isolated_schema
from unittest.mock import patch
from urllib.parse import unquote

import httpx
from fastapi.testclient import TestClient

from backend.main import app


class Deployment(unittest.TestCase):
    def test_socket_mode_forwards_verified_identity_and_never_opens_a_local_database(self):
        available = True
        received = []

        def database(request):
            if not available:
                raise httpx.ConnectError("database unavailable", request=request)
            received.append(request)
            return httpx.Response(201, json={"id": "copy"})

        with tempfile.TemporaryDirectory() as folder:
            socket = str(Path(folder) / "database.sock")
            with (
                patch.dict(os.environ, FLOW_AUTH="local", FLOW_DATABASE_SOCKET=socket, FLOW_DATA_DIR=folder),
                patch(
                    "backend.main.httpx.AsyncHTTPTransport", return_value=httpx.MockTransport(database)
                ) as transport,
                TestClient(app, base_url="http://localhost", client=("127.0.0.1", 53000)) as web,
            ):
                transport.assert_called_once_with(uds=socket)
                path = "/api/workspaces/example/canvases"
                body = {"name": "A copy", "source": "example"}
                response = web.post(path, json=body, headers={"X-Flow-Editor": "unverified"})
                self.assertEqual(response.status_code, 201)
                self.assertEqual(received[0].url.path, path)
                self.assertEqual(json.loads(received[0].content), body)
                self.assertEqual(unquote(received[0].headers["X-Flow-Editor"]), "本機開發")
                self.assertEqual(web.get("/ready").status_code, 404)
                available = False
                self.assertEqual(web.get("/api/catalog").status_code, 503)
                self.assertEqual(list(Path(folder).iterdir()), [])

    def test_separate_database_process_over_unix_socket(self):
        self.enterContext(isolated_schema())
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            address = str(root / "database.sock")
            database_dir = root / "data"
            web_dir = root / "web"
            try:
                with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as probe:
                    probe.bind(str(root / "probe.sock"))
            except PermissionError as exc:
                self.skipTest(f"Unix socket bind unavailable: {exc}")

            database = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "backend.database_api:app",
                    "--uds",
                    address,
                    "--no-proxy-headers",
                    "--log-level",
                    "warning",
                ],
                cwd=Path(__file__).resolve().parents[1],
                env={**os.environ, "FLOW_DATA_DIR": str(database_dir)},
            )
            try:
                with httpx.Client(
                    transport=httpx.HTTPTransport(uds=address), base_url="http://database"
                ) as client:
                    deadline = time.monotonic() + 10
                    while time.monotonic() < deadline and database.poll() is None:
                        try:
                            if client.get("/ready").is_success:
                                break
                        except httpx.ConnectError:
                            pass
                        time.sleep(0.05)
                    else:
                        self.fail("Database API did not become ready")

                base = "http://127.0.0.1:8768"
                with (
                    patch.dict(
                        os.environ,
                        FLOW_DATABASE_SOCKET=address,
                        FLOW_DATA_DIR=str(web_dir),
                        FLOW_AUTH="local",
                    ),
                    TestClient(app, base_url=base, client=("127.0.0.1", 53000)) as web,
                ):
                    workspace = web.get("/api/catalog").json()["workspaces"][0]["id"]
                    canvas = web.post(
                        f"/api/workspaces/{workspace}/canvases", json={"name": "Example"}
                    ).json()["id"]
                    path = f"/api/canvases/{canvas}"
                    with web.websocket_connect(
                        base.replace("http:", "ws:") + path + "/live", headers={"origin": base}
                    ) as ws:
                        self.assertEqual(ws.receive_json(), {"rev": 1})
                        batch = {
                            "base": 1,
                            "ops": [{"table": "meta", "key": "title", "value": "Updated", "version": 1}],
                        }
                        self.assertEqual(web.post(path + "/changes", json=batch).status_code, 200)
                        self.assertEqual(ws.receive_json(), {"rev": 2})
                        self.assertEqual(
                            web.post(
                                path + "/changes",
                                json={**batch, "ops": [{**batch["ops"][0], "value": "Conflict"}]},
                            ).status_code,
                            409,
                        )
                    self.assertEqual(web.get(path).json()["graph"]["title"], "Updated")
                self.assertFalse((database_dir / "studio.sqlite3").exists())
                self.assertFalse(web_dir.exists())
            finally:
                database.terminate()
                database.wait(timeout=10)
