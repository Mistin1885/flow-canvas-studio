-- Historical SQLite migrations, used only by the offline conversion tool.
CREATE TABLE workspaces(id TEXT PRIMARY KEY, name TEXT NOT NULL, created TEXT NOT NULL);
CREATE TABLE canvases(id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id),
 name TEXT NOT NULL, rev INTEGER NOT NULL, updated TEXT NOT NULL, editor TEXT NOT NULL);
CREATE INDEX canvas_workspace ON canvases(workspace);
CREATE TABLE nodes(canvas TEXT REFERENCES canvases(id), key TEXT, value TEXT NOT NULL,
 version INTEGER NOT NULL, PRIMARY KEY(canvas,key));
CREATE TABLE edges(canvas TEXT, key TEXT, value TEXT NOT NULL, version INTEGER NOT NULL,
 src TEXT NOT NULL, dst TEXT NOT NULL, PRIMARY KEY(canvas,key),
 FOREIGN KEY(canvas,src) REFERENCES nodes(canvas,key) ON DELETE CASCADE,
 FOREIGN KEY(canvas,dst) REFERENCES nodes(canvas,key) ON DELETE CASCADE);
CREATE INDEX edge_src ON edges(canvas,src);
CREATE INDEX edge_dst ON edges(canvas,dst);
CREATE TABLE meta(canvas TEXT REFERENCES canvases(id), key TEXT, value TEXT NOT NULL,
 version INTEGER NOT NULL, PRIMARY KEY(canvas,key));
INSERT INTO workspaces VALUES(lower(hex(randomblob(16))), '團隊工作區', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
PRAGMA user_version=1;
CREATE TABLE import_history(
                canvas TEXT NOT NULL REFERENCES canvases(id), revision INTEGER NOT NULL,
                created TEXT NOT NULL, editor TEXT NOT NULL, graph TEXT NOT NULL,
                PRIMARY KEY(canvas,revision)
            );
            PRAGMA user_version=2;
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
CREATE TABLE canvas_activity(
 canvas TEXT NOT NULL REFERENCES canvases(id), rev INTEGER NOT NULL, created TEXT NOT NULL,
 editor TEXT NOT NULL, kind TEXT NOT NULL, items TEXT NOT NULL, PRIMARY KEY(canvas,rev)
);
PRAGMA user_version=4;
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
ALTER TABLE canvas_activity ADD COLUMN first_rev INTEGER;
ALTER TABLE canvas_activity ADD COLUMN actor TEXT;
PRAGMA user_version=6;
ALTER TABLE canvases ADD COLUMN deleted_until TEXT;
            ALTER TABLE canvases ADD COLUMN write_floor INTEGER NOT NULL DEFAULT 1;
            CREATE VIEW active_canvases AS SELECT * FROM canvases WHERE deleted_until IS NULL;
            PRAGMA user_version=7;
CREATE TABLE knowledge_entries(id TEXT PRIMARY KEY, workspace TEXT NOT NULL REFERENCES workspaces(id),
 document TEXT NOT NULL, version INTEGER NOT NULL);
CREATE INDEX knowledge_owner ON knowledge_entries(workspace);
CREATE TABLE knowledge_shares(entry TEXT NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
 workspace TEXT NOT NULL REFERENCES workspaces(id), PRIMARY KEY(entry,workspace));
CREATE INDEX knowledge_incoming ON knowledge_shares(workspace,entry);
CREATE INDEX knowledge_links ON meta(json_extract(value,'$.source')) WHERE key GLOB 'knowledge.*';
PRAGMA user_version=8;
