"""Export the live PostgreSQL records to a backwards-compatible portable SQLite file."""

import argparse
from pathlib import Path
import tempfile
import os

from .postgres import session
from .legacy_transfer import export_database


def backup(target):
    target = Path(target).expanduser().resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as tmp:
        temp = Path(tmp.name)
    try:
        with session() as db:
            export_database(db, temp)
        os.link(temp, target)  # publish atomically, never overwrite another backup
    finally:
        temp.unlink()
    return target


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("destination")
    print(backup(parser.parse_args().destination))
