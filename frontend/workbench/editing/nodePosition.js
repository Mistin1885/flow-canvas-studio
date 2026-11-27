// Positions are logical canvas units, local to a node's sheet. An absolute
// edit supersedes offsets imported from older workbenches.
export function storePosition(node, position) {
  node.layoutPosition = position
  delete node.layoutOffset
  delete node.layoutOrder
}

export function storeDisplayedPosition(node, item, point, scale) {
  storePosition(node, {
    x: (point.x - (item.scopeOrigin?.x || 0)) / scale,
    y: (point.y - (item.scopeOrigin?.y || 0)) / scale,
  })
}

export function pinDisplayedNodes(graph, instances, scale) {
  for (const item of instances) storeDisplayedPosition(graph.nodes[item.id], item, item, scale)
}
