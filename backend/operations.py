"""Durable receipts for edit requests and the most recent scheduled scan."""
import hashlib
import json

MIGRATION = """
CREATE TABLE edit_receipts(
 canvas TEXT NOT NULL REFERENCES canvases(id), principal TEXT NOT NULL, operation TEXT NOT NULL,
 digest BLOB NOT NULL, revision INTEGER NOT NULL, PRIMARY KEY(canvas,principal,operation)
) WITHOUT ROWID;
CREATE TABLE scan_status(
 id INTEGER PRIMARY KEY CHECK(id=1), attempted TEXT, succeeded TEXT, failed TEXT,
 state TEXT NOT NULL, captured INTEGER NOT NULL, error TEXT
);
INSERT INTO scan_status(id,state,captured) VALUES(1,'pending',0);
PRAGMA user_version=5;
"""


def fingerprint(route, batch):
    raw = batch.model_dump(exclude={"operation_id"})
    encoded = json.dumps([route, raw], sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode()).digest()
