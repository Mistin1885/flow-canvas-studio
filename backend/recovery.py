"""Host operator interface to scheduled snapshots."""

import argparse
from datetime import datetime, timezone
import json
import sys

from . import snapshots, storage


def instant(value):
    try:
        stamp = datetime.fromisoformat(value)
        if stamp.utcoffset() is None:
            raise ValueError()
        return stamp.astimezone(timezone.utc).isoformat(timespec="microseconds")
    except ValueError:
        raise argparse.ArgumentTypeError("Specify an ISO timestamp with an offset, e.g. 2026-11-24T09:30:00+08:00")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="action", required=True)
    listing = commands.add_parser("list")
    listing.add_argument("--cold", action="store_true", help="Show archived files")
    commands.add_parser("scan")
    export = commands.add_parser("export-gzip", help="Write one retained gzip payload to stdout")
    export.add_argument("--id", type=int, required=True)
    restore = commands.add_parser("restore")
    target = restore.add_mutually_exclusive_group(required=True)
    target.add_argument("--id", type=int)
    target.add_argument("--at", type=instant)
    restore.add_argument("--canvas", help="Canvas ID for a point-in-time restore")
    args = parser.parse_args()
    if args.action == "scan":
        snapshots.scan()
    elif args.action == "export-gzip":
        with storage.session() as db:
            row = db.execute("""SELECT a.payload FROM recovery_archives a JOIN recovery_points p ON p.id=a.point
                                WHERE p.id=%s AND p.expires>%s""", (args.id, snapshots.times(datetime.now(timezone.utc))[0])).fetchone()
            if row is None:
                parser.error("No retained snapshot with that ID")
            sys.stdout.buffer.write(row[0])
    elif args.action == "list":
        with storage.session() as db:
            print(json.dumps(snapshots.listing(db, cold=args.cold), ensure_ascii=False, indent=2))
    else:
        if bool(args.at) != bool(args.canvas):
            parser.error("Use --at together with --canvas, or --id alone")
        with storage.session(True, library=True) as db:
            point = args.id
            if args.at:
                row = db.execute("""SELECT id FROM recovery_points WHERE kind='canvas' AND item=%s
                    AND cold=0 AND captured<=%s AND expires>%s ORDER BY captured DESC,id DESC LIMIT 1""",
                    (args.canvas, args.at, snapshots.times(datetime.now(timezone.utc))[0])).fetchone()
                if not row:
                    parser.error("No retained active snapshot at or before that time")
                point = row[0]
            try:
                result = snapshots.restore(db, point, "system operator")
            except storage.Missing:
                parser.error("No retained active snapshot with that ID")
        print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
