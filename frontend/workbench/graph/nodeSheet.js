// Manual coordinates and placement order belong to a particular sheet.
// Keep them for an in-sheet reorder. Auto-layout positions newly moved members.
export function moveToSheet(node, previous, next) {
  node.sheetId = next
  if (previous === next) return
  delete node.layoutPosition
  delete node.layoutOffset
  delete node.layoutOrder
}

export function sheetInGraph(graph, id) {
  const n = graph.nodes[id]
  if (!n) return 'project'
  if (n.sheetId === 'project') return 'project'
  if (n.sheetId && (graph.subflows || []).some((s) => s.id === n.sheetId)) return n.sheetId
  if (n.sourceKind === 'subflow')
    return (
      (graph.subflows || []).find(
        (s) => s.root === id || graph.nodes[s.root]?.group === n.group,
      )?.id || 'project'
    )
  return 'project'
}
