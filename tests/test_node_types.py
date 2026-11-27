import copy
import unittest
from backend.node_types import check_node_types


class NodeTypeTests(unittest.TestCase):
    def setUp(self):
        self.graph = {'nodes': {'A': {'type': 'action', 'customType': 'type-check'}},
                      'nodeTypeDefinitions': [{'id': 'type-check', 'name': 'Check', 'baseType': 'action',
                                               'nodeStyle': {'edge': '#abcdef', 'line': 'dashed'}}]}

    def test_valid_catalog_and_legacy_graph(self):
        check_node_types(self.graph, ValueError)
        check_node_types({'nodes': {'A': {}}}, ValueError)

    def test_invalid_definition_and_reference(self):
        for field, value in [('baseType', 'invalid'), ('id', '__proto__'), ('name', '一般步驟'),
                             ('nodeStyle', {'frame': 'on'})]:
            graph = copy.deepcopy(self.graph)
            graph['nodeTypeDefinitions'][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                check_node_types(graph, ValueError)
        self.graph['nodes']['A']['type'] = 'decision'
        with self.assertRaises(ValueError):
            check_node_types(self.graph, ValueError)

    def test_deleted_definition_rejects_concurrent_stale_assignment(self):
        self.graph['nodeTypeDefinitions'] = []
        with self.assertRaises(ValueError):
            check_node_types(self.graph, ValueError)
