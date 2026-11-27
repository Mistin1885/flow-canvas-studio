import { $ } from '../ui/dom.js'
import { graphModel } from '../graph/model.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { suggestNodeId } from '../graph/nodeIds.js'
import { addNode } from '../graph/addNode.js'
import { diagramState } from '../diagram/state.js'
import { selectionState } from '../editing/state.js'
import { setEditTarget } from '../editing/selection.js'
import { pinDisplayedNodes, storeDisplayedPosition } from '../editing/nodePosition.js'
import { enclosingBounds, validNodeSize } from '../layout/nodeGeometry.js'
import { exportGraph } from '../io/graph.js'
import { replaceGraph } from '../graph/replace.js'
import { say } from '../ui/toast.js'

export function createFrameFromSelection() {
  try {
    const target = selectionState.editTarget
    const keys = target?.nodes || new Set(target?.node ? [target.node] : [])
    const items = diagramState.instances.filter(i => keys.has(i.key))
    if (items.some(i => isFrameNode(graphModel.nodes[i.id]))) throw Error('請選取步驟節點建立外框；外框不包含其他外框。')
    if (new Set(items.map(i => i.scope)).size > 1) throw Error('請選取同一畫布區域內的節點。')
    const scale = diagramState.readingScale, graph = exportGraph(), id = suggestNodeId('frame', graph.nodes)
    const rect = $('canvas').getBoundingClientRect()
    const box = items.length ? enclosingBounds(items, scale) : {
      x: (rect.width / 2 - diagramState.tx) / diagramState.scale - 160 * scale,
      y: (rect.height / 2 - diagramState.ty) / diagramState.scale - 110 * scale,
      w: 320 * scale, h: 220 * scale,
    }
    const layoutSize = { width: box.w / scale, height: box.h / scale }
    if (!validNodeSize(layoutSize)) throw Error('選取範圍太大，請分成數個外框。')
    pinDisplayedNodes(graph, diagramState.instances, scale)
    const node = { id, title: '新外框', type: 'frame', decision: false, content: [],
      group: '未分組', sheetId: items[0]?.scope || 'project',
      frameMembers: items.map(i => i.id), layoutSize }
    storeDisplayedPosition(node, items[0] || {}, box, scale)
    addNode(graph, node)
    replaceGraph(graph, { keepView: true, selection: id, createdNode: id })
    setEditTarget({ node: id })
    say(items.length ? `已建立外框，包含 ${items.length} 個步驟與 24 px 邊距；雙擊可編輯。` : '已建立空白外框，可拖曳角落調整大小。')
  } catch (error) { say(error.message) }
}
