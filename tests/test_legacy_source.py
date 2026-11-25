"""Offline SQLite checks also run on a host without PostgreSQL dependencies."""
from contextlib import closing
from pathlib import Path
import shutil
import sqlite3
import tempfile
import unittest

from backend.legacy_transfer import inspect_database, upgrade_copy


class LegacySource(unittest.TestCase):
    def test_wal_only_commit_survives_without_shm_on_readonly_source(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            frozen = root / "frozen"
            frozen.mkdir()
            with closing(sqlite3.connect(root / "studio.sqlite3")) as writer:
                writer.execute("PRAGMA journal_mode=WAL")
                upgrade_copy(writer)
                writer.commit()
                writer.execute("PRAGMA wal_checkpoint(TRUNCATE)")
                writer.execute("INSERT INTO workspaces VALUES('extra','In WAL','now','now')")
                writer.commit()
                for name in ("studio.sqlite3", "studio.sqlite3-wal"):
                    shutil.copyfile(root / name, frozen / name)
            files = {p.name: p.read_bytes() for p in frozen.iterdir()}
            try:
                frozen.chmod(0o550)
                result = inspect_database(frozen)
                self.assertEqual(result["rows"]["workspaces"], 2)
                self.assertEqual(result["sqlite_version"], 8)
                self.assertEqual({p.name: p.read_bytes() for p in frozen.iterdir()}, files)
            finally:
                frozen.chmod(0o700)

    def test_missing_indexed_archive_blocks_check(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            with closing(sqlite3.connect(root / "studio.sqlite3")) as db:
                upgrade_copy(db)
                db.execute("INSERT INTO recovery_points(kind,item,workspace,name,revision,captured,expires,file) "
                           "VALUES('canvas','c','w','Example',1,'now','later',?)", ("f"*32 + ".json.gz",))
                db.commit()
            with self.assertRaises(FileNotFoundError):
                inspect_database(root)
