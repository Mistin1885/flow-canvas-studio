"""Validation for user-sized cards, in logical canvas units."""
import math


def check_node_size(node, invalid):
    if "layoutSize" not in node:
        return
    size = node["layoutSize"]
    if not isinstance(size, dict):
        raise invalid("節點尺寸無效")
    for key, minimum in (("width", 80), ("height", 48)):
        value = size.get(key)
        if type(value) not in (int, float) or not math.isfinite(value) or not minimum <= value <= 1000000:
            raise invalid("節點尺寸無效（寬 80–1000000、高 48–1000000）")
