import { diagramState } from '../diagram/state.js'
import { cloneGraph } from '../graph/json.js'
import { suggestIdForNode } from '../graph/nodeIds.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { replaceGraph } from '../graph/replace.js'
import { exportGraph } from '../io/graph.js'
import { gridPlacement } from '../layout/grid.js'
import { say } from '../ui/toast.js'
import { setEditTarget } from './selection.js'
import { selectionState } from './state.js'

function positionBeside(item) {
  const { readingScale: scale, instances } = diagramState
  const origin = item.scopeOrigin || { x: 0, y: 0 }
  const footprint = item.inlineFlow || item
  const boxes = instances.filter(i => i.scope === item.scope).map(i => {
    const box = i.inlineFlow || i
    return { x: box.x - origin.x, y: box.y - origin.y - (i.badgeTop || 0),
      w: box.w, h: box.h + (i.badgeTop || 0) + (i.badgeBottom || 0) }
  })
  const top = item.badgeTop || 0
  const pos = gridPlacement(footprint.x + footprint.w + 20 * scale - origin.x, item.y - top - origin.y,
    item.w, item.h + top + (item.badgeBottom || 0), boxes, true)
  return { x: pos.x / scale, y: (pos.y + top) / scale }
}

export function duplicateSelectedNode() {
  const sourceId = selectionState.editTarget?.node
  const item = diagramState.instanceMap.get(sourceId)
  if (!item) return
  try {
    const graph = exportGraph()
    const copy = cloneGraph(graph.nodes[sourceId])
    const id = suggestIdForNode(copy, graph.nodes)
    copy.id = id
    copy.layoutPosition = positionBeside(item)
    if (item.scope !== 'project') copy.sheetId = item.scope
    // The new card is independent of the original worksheet shape and flow container.
    delete copy.sourceId
    delete copy.drawingBox
    delete copy.layoutOrder
    delete copy.layoutOffset
    delete copy.subflowId
    if (isFrameNode(copy)) copy.frameMembers = []
    graph.nodes[id] = copy
    replaceGraph(graph, { selection: id, createdNode: id })
    setEditTarget({ node: id })
    say('已複製節點：' + id)
  } catch (error) {
    say(error.message)
  }
}
