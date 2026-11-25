"""Export a consistent PostgreSQL snapshot and verify or unpack a portable migration bundle."""
import argparse
from contextlib import closing
import gzip
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
import zipfile

from . import storage
from .legacy_transfer import export_database

DATABASE = "studio.sqlite3"
ARCHIVE = re.compile(r"backups/[0-9a-f]{32}\.json\.gz")
MANIFEST = "manifest.json"


def inventory(db):
    if db.execute("PRAGMA integrity_check").fetchone() != ("ok",) or db.execute("PRAGMA foreign_key_check").fetchone():
        raise ValueError("SQLite integrity check failed")
    files = {"backups/" + row[0] for row in db.execute("SELECT file FROM recovery_points")}
    if not all(ARCHIVE.fullmatch(name) for name in files):
        raise ValueError("Invalid recovery archive name")
    counts = {table: db.execute(f"SELECT count(*) FROM {table}").fetchone()[0]
              for table in ("workspaces", "canvases")}
    counts["active"], counts["cold"] = db.execute(
        "SELECT count(*) FILTER (WHERE cold=0),count(*) FILTER (WHERE cold=1) FROM recovery_points"
    ).fetchone()
    return files, counts


def checksum(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def check_gzip(path):
    with gzip.open(path, "rb") as stream:
        while stream.read(1024 * 1024):
            pass


def create(destination):
    target = Path(destination).absolute()
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        raise FileExistsError(target)
    with tempfile.TemporaryDirectory() as folder:
        stage = Path(folder)
        (stage / "backups").mkdir()
        # All table scans and gzip payloads share one MVCC snapshot.
        with storage.session() as db:
            export_database(db, stage / DATABASE)
            with db.cursor(name="bundle_archives") as rows:
                rows.itersize = 1
                rows.execute("SELECT p.file,a.payload FROM recovery_points p JOIN recovery_archives a ON a.point=p.id")
                for filename, payload in rows:
                    if not ARCHIVE.fullmatch("backups/" + filename):
                        raise ValueError("Invalid archive filename")
                    (stage / "backups" / filename).write_bytes(payload)
        with closing(sqlite3.connect(stage / DATABASE)) as copy:
            archives, counts = inventory(copy)
        files = {}
        with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as out:
            temp = Path(out.name)
        try:
            with zipfile.ZipFile(temp, "w", allowZip64=True) as bundle:
                for name in [DATABASE, *sorted(archives)]:
                    path = stage / name
                    if name != DATABASE:
                        check_gzip(path)
                    files[name] = checksum(path)
                    bundle.write(path, name, compress_type=zipfile.ZIP_DEFLATED if name == DATABASE else zipfile.ZIP_STORED)
                bundle.writestr(MANIFEST, json.dumps({"format": 1, "sha256": files, "counts": counts}))
            with temp.open("rb") as stream:
                os.fsync(stream.fileno())
            os.link(temp, target)
        finally:
            temp.unlink(missing_ok=True)
    return counts


def unpack(bundle_path, stage):
    with zipfile.ZipFile(bundle_path) as bundle:
        names = bundle.namelist()
        if len(names) != len(set(names)) or MANIFEST not in names or DATABASE not in names:
            raise ValueError("Missing or duplicate bundle entries")
        if any(name not in (MANIFEST, DATABASE) and not ARCHIVE.fullmatch(name) for name in names):
            raise ValueError("Unexpected bundle entry")
        manifest = json.loads(bundle.read(MANIFEST))
        hashes = manifest["sha256"]
        if manifest["format"] != 1 or set(hashes) != set(names) - {MANIFEST}:
            raise ValueError("Invalid bundle manifest")
        (stage / "backups").mkdir()
        for name, expected in hashes.items():
            path = stage / name
            with bundle.open(name) as src, path.open("xb") as dst:
                shutil.copyfileobj(src, dst)
            if checksum(path) != expected:
                raise ValueError(f"Checksum mismatch: {name}")
            if name != DATABASE:
                check_gzip(path)
    with closing(sqlite3.connect((stage / DATABASE).as_uri() + "?mode=ro", uri=True)) as db:
        archives, counts = inventory(db)
    if archives != set(hashes) - {DATABASE} or counts != manifest["counts"]:
        raise ValueError("Database and archive catalog disagree")
    return counts


def verify_or_restore(bundle, destination=None):
    target = Path(destination).absolute() if destination else None
    if target:
        if target.is_symlink() or (target.exists() and (not target.is_dir() or any(target.iterdir()))):
            raise ValueError("Restore destination must be a new or empty directory")
        target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent if target else None) as temp:
        stage = Path(temp) / "data"
        stage.mkdir(mode=0o700)
        counts = unpack(bundle, stage)
        if target:
            os.rename(stage, target)
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    for action in ("create", "verify", "restore"):
        cmd = commands.add_parser(action)
        cmd.add_argument("bundle")
        if action == "restore":
            cmd.add_argument("directory")
    args = parser.parse_args()
    try:
        result = create(args.bundle) if args.action == "create" else verify_or_restore(args.bundle, getattr(args, "directory", None))
    except (OSError, ValueError, KeyError, sqlite3.Error, zipfile.BadZipFile, EOFError) as exc:
        parser.exit(1, f"Bundle {args.action} failed: {exc}\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
