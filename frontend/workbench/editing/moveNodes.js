import { sourceMembers } from '../frames/membership.js'
import { storeDisplayedPosition, pinDisplayedNodes } from './nodePosition.js'
import { diagramState } from '../diagram/state.js'
import { movingWirePoints } from '../layout/movingWire.js'
import { centerConnection } from '../layout/cardCenters.js'
import { clearRoute } from '../layout/routing.js'
import { rightAnglePath } from '../diagram/paths.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { graphModel } from '../graph/model.js'
import { replaceGraph } from '../graph/replace.js'
import { hiddenGroups } from '../groups/visibility.js'
import { exportGraph } from '../io/graph.js'
import { dropPositions } from '../layout/nodePlacement.js'
import { alignNodeDrag, centerPeers } from '../layout/nodeAlignment.js'
import { showAlignmentGuides, clearAlignmentGuides } from './alignmentGuides.js'
import { say } from '../ui/toast.js'
import { selectionState } from './state.js'
import { setNodeSelection } from './selection.js'

export function prepareMove(item) {
  const selected = selectionState.editTarget?.nodes
  let items = selected?.has(item.key)
    ? diagramState.instances.filter(i => selected.has(i.key))
    : [item]
  const keys = items.map(i => i.key)
  const members = new Set(items.filter(i => isFrameNode(graphModel.nodes[i.id]))
    .flatMap(i => sourceMembers(graphModel.nodes[i.id])))
  items = [...new Set([...items, ...diagramState.instances.filter(i => members.has(i.id))])]
  // An expanded subflow carries its children. Preserve their local coordinates.
  const carried = new Set(items.flatMap(i => i.inlineFlow?.nodes || []))
  const roots = items.filter(i => !carried.has(i))
  const moving = new Set([...roots, ...carried])
  const wires = diagramState.edgeViews.filter(v => moving.has(v.from) || moving.has(v.to))
  const visibleCards = diagramState.instances.filter(i =>
    !hiddenGroups.has(graphModel.nodes[i.id].group) && !isFrameNode(graphModel.nodes[i.id]))
  const connected = new Set(wires.filter(v => v.from === item || v.to === item)
    .map(v => v.from === item ? v.to : v.from))
  const peers = centerPeers(item, visibleCards.filter(i => !moving.has(i)), connected)
  return { roots, moving, wires, peers, visibleCards, keys }
}

function displacement(g, e) {
  return alignNodeDrag(g.item, e.clientX - g.x, e.clientY - g.y, diagramState.readingScale, diagramState.scale, g.peers)
}

export function previewMove(g, e) {
  const { delta, guides } = displacement(g, e)
  showAlignmentGuides(guides, delta, diagramState.scale)
  for (const item of g.moving) {
    const card = diagramState.domNodes.get(item.key)
    if (!card) continue
    card.classList.add('being-moved')
    card.style.transform = `translate(${item.x + delta.x}px,${item.y + delta.y}px)`
  }
  const shifted = i => g.moving.has(i) ? { x: i.x + delta.x, y: i.y + delta.y, w: i.w, h: i.h } : i
  for (const v of g.wires) {
    const from = Number(g.moving.has(v.from)), to = Number(g.moving.has(v.to))
    const start = { x: delta.x * from, y: delta.y * from }
    const end = { x: delta.x * to, y: delta.y * to }
    const centered = from !== to && centerConnection(shifted(v.from), shifted(v.to), v.link?.edge.wireLayout)
    const points = centered && clearRoute(centered.points,
      g.visibleCards.filter(i => i !== v.from && i !== v.to).map(shifted))
      ? centered.points : movingWirePoints(v.points, start, end)
    const d = rightAnglePath(points)
    v.p.setAttribute('d', d)
    v.hit.setAttribute('d', d)
    v.label?.setAttribute('transform', `translate(${delta.x * (from + to) / 2},${delta.y * (from + to) / 2})`)
  }
}

export function resetMove(g) {
  clearAlignmentGuides()
  for (const item of g.moving) {
    const card = diagramState.domNodes.get(item.key)
    if (!card || diagramState.instanceMap.get(item.key) !== item) continue
    card.classList.remove('being-moved')
    card.style.transform = `translate(${item.x}px,${item.y}px)`
  }
  for (const v of g.wires) {
    v.p.setAttribute('d', v.d)
    v.hit.setAttribute('d', v.d)
    v.label?.removeAttribute('transform')
  }
}

export function commitMove(g, e) {
  if (g.roots.some(i => diagramState.instanceMap.get(i.key) !== i)) return
  const { delta } = displacement(g, e)
  if (!delta.x && !delta.y) return
  const isFrame = item => isFrameNode(graphModel.nodes[item.id])
  const obstacles = diagramState.instances.filter(i => !g.moving.has(i) && !isFrame(i) &&
    !hiddenGroups.has(graphModel.nodes[i.id].group))
  const positions = dropPositions(g.roots, delta, obstacles, isFrame)
  if (!positions) {
    say('該格會與其他節點重疊，請選擇空位。')
    return
  }
  const graph = exportGraph()
  if (g.roots.some(isFrame)) pinDisplayedNodes(graph, diagramState.instances, diagramState.readingScale)
  for (const { item, x, y } of positions) {
    if (isFrame(item)) graph.nodes[item.id].layoutSize = { width: item.w / diagramState.readingScale, height: item.h / diagramState.readingScale }
    storeDisplayedPosition(graph.nodes[item.id], item, { x, y }, diagramState.readingScale)
    diagramState.displayPositions.set(item.key, { x, y })
  }
  replaceGraph(graph, { keepView: true, selection: g.item.id })
  setNodeSelection(g.keys)
}
