import { el } from '../ui/dom.js'
import { diagramState } from '../diagram/state.js'
import { resizedBounds } from '../layout/nodeGeometry.js'
import { exportGraph } from '../io/graph.js'
import { replaceGraph } from '../graph/replace.js'
import { pinDisplayedNodes, storeDisplayedPosition } from './nodePosition.js'
import { setEditTarget } from './selection.js'

export function addResizeHandles(dom) {
  if (dom.querySelector('.node-resize')) return
  for (const [corner, label] of [['nw', '左上'], ['ne', '右上'], ['sw', '左下'], ['se', '右下']]) {
    const grip = el('span', 'node-resize')
    grip.dataset.corner = corner
    grip.title = '拖曳' + label + '角調整節點大小'
    grip.setAttribute('aria-hidden', 'true')
    dom.append(grip)
  }
}

export function beginResize(item, card, grip, event) {
  grip.setPointerCapture(event.pointerId)
  return { resize: true, item, card, corner: grip.dataset.corner, capture: grip,
    pointer: event.pointerId, x: event.clientX, y: event.clientY }
}

function bounds(g, event) {
  return resizedBounds(g.item, g.corner, (event.clientX - g.x) / diagramState.scale,
    (event.clientY - g.y) / diagramState.scale, diagramState.readingScale)
}

export function previewResize(g, event) {
  const b = bounds(g, event)
  g.card.classList.add('being-resized')
  Object.assign(g.card.style, { transform: `translate(${b.x}px,${b.y}px)`, width: b.w + 'px', height: b.h + 'px' })
}

export function resetResize(g) {
  g.card.classList.remove('being-resized')
  Object.assign(g.card.style, { transform: `translate(${g.item.x}px,${g.item.y}px)`, width: g.item.w + 'px', height: g.item.h + 'px' })
}

export function commitResize(g, event) {
  if (diagramState.instanceMap.get(g.item.key) !== g.item) return
  const b = bounds(g, event), graph = exportGraph(), scale = diagramState.readingScale
  pinDisplayedNodes(graph, diagramState.instances, scale)
  const n = graph.nodes[g.item.id]
  n.layoutSize = { width: b.w / scale, height: b.h / scale }
  storeDisplayedPosition(n, g.item, b, scale)
  diagramState.displayPositions.set(g.item.key, { x: b.x, y: b.y })
  replaceGraph(graph, { keepView: true, selection: g.item.id })
  setEditTarget({ node: g.item.id })
}
