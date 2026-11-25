// Manual coordinates and placement order belong to a particular sheet.
// Keep them for an in-sheet reorder. Auto-layout positions newly moved members.
export function moveToSheet(node, previous, next) {
  node.sheetId = next
  if (previous === next) return
  delete node.layoutPosition
  delete node.layoutOffset
  delete node.layoutOrder
}
