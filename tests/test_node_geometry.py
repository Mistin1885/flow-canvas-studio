import unittest
from backend.node_geometry import check_node_size


class NodeGeometryTests(unittest.TestCase):
    def test_legacy_and_all_node_types(self):
        check_node_size({}, ValueError)
        for kind in ('action', 'frame', 'decision', 'return', 'note', 'main', 'fault', 'shared'):
            check_node_size({'type': kind, 'layoutSize': {'width': 320, 'height': 180}}, ValueError)

    def test_rejects_invalid_geometry(self):
        for size in (None, [], {}, {'width': 79, 'height': 90}, {'width': 100, 'height': 47},
                     {'width': 1000001, 'height': 100}, {'width': float('inf'), 'height': 80},
                     {'width': float('nan'), 'height': 80}, {'width': True, 'height': 100},
                     {'width': '200', 'height': 90}):
            with self.subTest(size=size), self.assertRaises(ValueError):
                check_node_size({'layoutSize': size}, ValueError)
