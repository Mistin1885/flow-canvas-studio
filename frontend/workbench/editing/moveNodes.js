import { diagramState } from '../diagram/state.js'
import { rightAnglePath } from '../diagram/paths.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { graphModel } from '../graph/model.js'
import { replaceGraph } from '../graph/replace.js'
import { hiddenGroups } from '../groups/visibility.js'
import { exportGraph } from '../io/graph.js'
import { dropPositions, snappedDisplacement } from '../layout/nodePlacement.js'
import { say } from '../ui/toast.js'
import { selectionState } from './state.js'
import { setNodeSelection } from './selection.js'

export function prepareMove(item) {
  const selected = selectionState.editTarget?.nodes
  const items = selected?.has(item.key)
    ? diagramState.instances.filter(i => selected.has(i.key))
    : [item]
  // An expanded subflow carries its children. Preserve their local coordinates.
  const carried = new Set(items.flatMap(i => i.inlineFlow?.nodes || []))
  const roots = items.filter(i => !carried.has(i))
  const moving = new Set([...roots, ...carried])
  const wires = diagramState.edgeViews.filter(v => moving.has(v.from) || moving.has(v.to))
  return { roots, moving, wires, keys: items.map(i => i.key) }
}

function displacement(g, e) {
  return snappedDisplacement(g.item, e.clientX - g.x, e.clientY - g.y, diagramState.readingScale, diagramState.scale)
}

export function previewMove(g, e) {
  const delta = displacement(g, e)
  for (const item of g.moving) {
    const card = diagramState.domNodes.get(item.key)
    if (!card) continue
    card.classList.add('being-moved')
    card.style.transform = `translate(${item.x + delta.x}px,${item.y + delta.y}px)`
  }
  for (const v of g.wires) {
    const from = Number(g.moving.has(v.from)), to = Number(g.moving.has(v.to))
    const d = rightAnglePath(v.points.map((p, k) => {
      const t = k / Math.max(1, v.points.length - 1), pull = from * (1 - t) + to * t
      return { x: p.x + pull * delta.x, y: p.y + pull * delta.y }
    }))
    v.p.setAttribute('d', d)
    v.hit.setAttribute('d', d)
    v.label?.setAttribute('transform', `translate(${delta.x * (from + to) / 2},${delta.y * (from + to) / 2})`)
  }
}

export function resetMove(g) {
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
  const delta = displacement(g, e)
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
  for (const { item, x, y } of positions) {
    const node = graph.nodes[item.id]
    delete node.layoutOffset
    delete node.layoutOrder
    node.layoutPosition = {
      x: (x - (item.scopeOrigin?.x || 0)) / diagramState.readingScale,
      y: (y - (item.scopeOrigin?.y || 0)) / diagramState.readingScale,
    }
    diagramState.displayPositions.set(item.key, { x, y })
  }
  replaceGraph(graph, { keepView: true, selection: g.item.id })
  setNodeSelection(g.keys)
}
