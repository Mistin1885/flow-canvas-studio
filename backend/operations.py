"""Durable receipts for edit requests and the most recent scheduled scan."""
import hashlib
import json


def fingerprint(route, batch):
    raw = batch.model_dump(exclude={"operation_id"})
    encoded = json.dumps([route, raw], sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode()).digest()
