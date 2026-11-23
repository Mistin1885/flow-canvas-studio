"""Create a portable online SQLite backup, including committed WAL pages."""

import argparse
from pathlib import Path
import sqlite3
import tempfile
import os

from .storage import location


def backup(target):
    source = location()
    target = Path(target).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as tmp:
        temp = Path(tmp.name)
    try:
        with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as src, sqlite3.connect(temp) as dst:
            src.backup(dst)
            if dst.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("備份檢查失敗")
        os.link(temp, target)  # publish atomically, never overwrite another backup
    finally:
        temp.unlink()
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("destination")
    print(backup(parser.parse_args().destination))
