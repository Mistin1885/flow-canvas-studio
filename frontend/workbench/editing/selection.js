import { reconcileEdgeReviews } from '../graph/edgeMutation.js'
import { showWireGrips } from './wireDrag.js'
import { selectionState, editState } from './state.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { graphModel } from '../graph/model.js'
import { flowKey, frameObjects, groupKey, objectName } from '../frames/membership.js'
import { $ } from '../ui/dom.js'
import { diagramState } from '../diagram/state.js'
import { exportGraph } from '../io/graph.js'
import { removeGraphNode } from '../graph/removeNode.js'
import { replaceGraph } from '../graph/replace.js'
import { say } from '../ui/toast.js'
import { openEdge } from './edges.js'
import { populateEditor } from './nodeForm.js'
import { sheetFor } from '../diagram/visibleGraph.js'
import { attachSearch } from './searchPicker.js'
export function setNodeSelection(keys) {
  const nodes = new Set(keys)
  const [node] = nodes
  setEditTarget(nodes.size > 1 ? { nodes } : node ? { node } : null)
}

function setEditTarget(next) {
  selectionState.editTarget = next
  const name = next?.node
    ? graphModel.nodes[next.node]?.title
    : next?.edge
      ? objectName(next.edge.from) + ' → ' + objectName(next.edge.to)
      : ''
  const b = $('canvas-delete')
  b.hidden = !editState.enabled
  b.disabled = !name
  b.title = name ? '刪除 ' + name : '先選取節點或連線'
  b.textContent = next?.edge ? '刪除連線' : next?.node ? '刪除節點' : '刪除'
  for (const [id, dom] of diagramState.domNodes) dom.classList.toggle('edit-picked', id === next?.node || !!next?.nodes?.has(id))
  for (const v of diagramState.edgeViews)
    v.group.classList.toggle('edit-picked', v.link.edge === next?.edge)
  for (const line of $('paths').querySelectorAll('.graph-link'))
    line.classList.toggle('edit-picked', line._edge === next?.edge)
  showWireGrips(next?.edge && $('paths').querySelector('.edge-route.edit-picked'))
  const multi = !!next?.nodes
  $('canvas-properties').disabled = multi || !(next?.node || next?.edge || diagramState.selected)
  $('canvas-members').disabled = $('canvas-connect').disabled = multi
  $('edit-selection-hint').textContent = multi ? `已選取 ${next.nodes.size} 個節點，拖曳其中一個一起移動。Esc 取消選取。` : ''
  $('edit-default-hint').hidden = multi
}

function deleteEditTarget() {
  if (!editState.enabled || !selectionState.editTarget || selectionState.editTarget.nodes) return
  const g = exportGraph(),
    target = selectionState.editTarget
  if (target.node) removeGraphNode(g, target.node)
  else {
    const index = graphModel.edges.indexOf(target.edge)
    if (index < 0) {
      const k = graphModel.document.groupLinks?.indexOf(target.edge)
      if (k == null || k < 0) return
      g.groupLinks.splice(k, 1)
    } else g.edges.splice(index, 1)
    reconcileEdgeReviews(g)
  }
  replaceGraph(g, { keepView: true })
  say(target.node ? '已刪除節點及其連線，可復原' : '已刪除連線，可復原')
}

function editContext() {
  if (selectionState.editTarget?.edge) {
    openEdge(
      selectionState.editTarget.edge.from,
      selectionState.editTarget.edge.to,
      selectionState.editTarget.edge,
    )
    return
  }
  const id = selectionState.editTarget?.node || diagramState.selected?.id
  if (!id) return
  populateEditor(id)
  $('node-editor').showModal()
}

function preferredFrame() {
  const n = graphModel.nodes[selectionState.editTarget?.node || diagramState.selected?.id]
  if (!n) return frameObjects()[0]?.[0]
  if (isFrameNode(n)) return n.id
  const f = graphModel.document.subflows?.find((f) => f.parent === n.id || sheetFor(n.id) === f.id)
  return f ? flowKey(f.id) : groupKey(n.group)
}

function endpointControls(from, to) {
  const entries = [
    ...Object.values(graphModel.nodes),
    ...frameObjects()
      .filter(([k]) => !graphModel.nodes[k])
      .map(([id, title]) => ({ id, title, group: '' })),
  ]
  for (const [id, value] of [
    ['edge-from-control', from],
    ['edge-to-control', to],
  ]) {
    const select = $(id),
      container = select.closest('label'),
      prior = select.closest('.node-picker')
    if (prior) {
      container.append(select)
      prior.remove()
    }
    container.append(
      attachSearch(select, value, id === 'edge-from-control' ? '連線起點' : '連線終點', entries),
    )
  }
}

export { deleteEditTarget, editContext, endpointControls, preferredFrame, setEditTarget }
