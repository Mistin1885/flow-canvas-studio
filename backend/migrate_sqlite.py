"""Inspect a stopped SQLite installation or transfer it to a fresh PostgreSQL schema."""
import argparse
import json
import sqlite3
import zlib

from .legacy_transfer import import_database, inspect_database


def apply(directory):
    from .postgres import migrate, session

    with session(write=True, library=True) as db:
        if not migrate(db):
            raise ValueError("PostgreSQL is already initialized. Select a fresh target to migrate.")
        return import_database(db, directory)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("check", "apply"))
    parser.add_argument("directory", help="Directory containing studio.sqlite3 and any backups/")
    args = parser.parse_args()
    errors = (ValueError, OSError, sqlite3.Error, EOFError, KeyError, TypeError, zlib.error)
    if args.action == "apply":
        from psycopg import Error
        errors += (Error,)
    try:
        result = (inspect_database if args.action == "check" else apply)(args.directory)
    except errors as exc:
        parser.exit(1, f"Migration {args.action} failed: {exc}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
