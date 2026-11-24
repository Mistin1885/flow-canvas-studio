"""Version 3 metadata. Snapshot payloads live beside the database in backups/."""

MIGRATION = """
ALTER TABLE workspaces ADD COLUMN updated TEXT NOT NULL DEFAULT '';
UPDATE workspaces SET updated=created;
CREATE TABLE snapshot_heads(
    kind TEXT NOT NULL, item TEXT NOT NULL, updated TEXT NOT NULL, revision INTEGER NOT NULL,
    snapshot INTEGER NOT NULL, PRIMARY KEY(kind,item)
);
CREATE TABLE recovery_points(
    id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, item TEXT NOT NULL,
    workspace TEXT NOT NULL, name TEXT NOT NULL, revision INTEGER NOT NULL,
    captured TEXT NOT NULL, expires TEXT NOT NULL, cold INTEGER NOT NULL DEFAULT 0,
    file TEXT NOT NULL UNIQUE
);
CREATE INDEX recovery_item ON recovery_points(kind,item,cold,id);
CREATE INDEX recovery_expiry ON recovery_points(expires);
CREATE TABLE admin_owner(singleton INTEGER PRIMARY KEY CHECK(singleton=1), realm TEXT NOT NULL, principal TEXT NOT NULL);
CREATE TABLE snapshot_garbage(file TEXT PRIMARY KEY);
PRAGMA user_version=3;
"""
