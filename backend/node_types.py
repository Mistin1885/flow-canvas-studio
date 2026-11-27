"""Validate reusable node type definitions without changing legacy node behavior."""
import re

BUILTINS = {
    'action': '一般步驟', 'decision': '決策節點', 'frame': '外框', 'main': '流程入口',
    'return': '返回節點', 'fault': '異常處理', 'note': '註記', 'shared': '子流程步驟',
}


def check_node_types(graph, invalid):
    definitions = graph.get('nodeTypeDefinitions', [])
    if not isinstance(definitions, list) or len(definitions) > 100:
        raise invalid('節點類型定義格式無效')
    catalog = {}
    names = dict(BUILTINS)
    for item in definitions:
        if not isinstance(item, dict):
            raise invalid('節點類型定義格式無效')
        key, name, base = (item.get(k) for k in ('id', 'name', 'baseType'))
        if (not isinstance(key, str) or not (key in BUILTINS or re.fullmatch(r'type-[a-zA-Z0-9_-]{1,64}', key))
                or key in catalog or not isinstance(name, str) or not name.strip()
                or name != name.strip() or len(name) > 64 or not isinstance(base, str) or base not in BUILTINS
                or (key in BUILTINS and base != key)):
            raise invalid('節點類型名稱、識別碼或基本行為無效')
        style = item.get('nodeStyle', {})
        if not isinstance(style, dict):
            raise invalid('節點類型樣式格式無效')
        choices = {'radius': ('0', '8', '18'), 'line': ('solid', 'dashed', 'dotted'), 'width': ('1', '2', '3')}
        for field, value in style.items():
            if (not isinstance(value, str) or not (
                (field in ('edge', 'light', 'dark') and re.fullmatch(r'#[a-fA-F0-9]{6}', value))
                or (field in choices and value in choices[field])
            )):
                raise invalid('節點類型樣式無效')
        catalog[key], names[key] = item, name
    if len({name.lower() for name in names.values()}) != len(names):
        raise invalid('節點類型名稱重複')
    for node in graph.get('nodes', {}).values():
        if not isinstance(node, dict) or 'customType' not in node:
            continue
        key = node['customType']
        item = catalog.get(key) if isinstance(key, str) else None
        if not item or key in BUILTINS or node.get('type') != item['baseType']:
            raise invalid('自訂節點類型不存在或基本行為不一致')
