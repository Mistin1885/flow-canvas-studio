"""Bound collaborative activity while preserving meaningful editing boundaries."""
import sqlite3
import unittest

from backend import activity


class Activity(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(activity.MIGRATION + activity.SUMMARY_MIGRATION)

    def record(self, rev, *, actor="a", second=0, action="edited", kind="edited", count=1):
        items = [{"id": f"N{i}", "action": action, "title": f"Title {rev}"} for i in range(count)]
        activity.record(self.db, "c", rev, f"2026-01-01T12:{second:02}:00+00:00",
                        "Shared display name", kind, items, actor)

    def test_batches_respect_authors_clock_and_structural_changes(self):
        for rev in (1, 2, 3):
            self.record(rev)
        self.record(4, actor="b")
        self.record(5, actor="b", second=5)
        self.record(6, action="added")
        self.record(7)
        self.record(8, kind="restored")
        entries = activity.page(self.db, "c", 2)["entries"]
        self.assertEqual([e["rev"] for e in entries], [3, 4, 5, 6, 7, 8])
        self.assertEqual(entries[0]["first_rev"], 1)
        self.assertEqual(entries[0]["items"][0]["title"], "Title 3")
        self.assertNotIn("actor", entries[0])

    def test_retention_per_canvas_and_large_import(self):
        activity.record(self.db, "other", 1, "2026-01-01T12:00:00Z", "a", "created")
        for rev in range(1, 222):
            self.record(rev, kind="renamed")
        self.record(222, kind="imported", count=90)
        rows = self.db.execute("SELECT rev FROM canvas_activity WHERE canvas='c' ORDER BY rev").fetchall()
        self.assertEqual((len(rows), rows[0][0]), (200, 23))
        self.assertEqual(activity.page(self.db, "other", 0)["entries"][0]["rev"], 1)
        items = activity.page(self.db, "c", 221)["entries"][0]["items"]
        self.assertEqual(len(items), 13)
        self.assertEqual(items[-1], {"action": "more", "count": 78})
