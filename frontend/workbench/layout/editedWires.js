import { diagramState } from '../diagram/state.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { graphModel } from '../graph/model.js'
import { resolveWire, routeAnchor, straightPoints } from './wireGeometry.js'

export function wireGeometry(edge, from, to, autoPoints) {
  return {
    edge,
    from,
    to,
    autoPoints,
    get obstacles() {
      return diagramState.instances.filter(
        (i) => i !== from && i !== to && !isFrameNode(graphModel.nodes[i.id]),
      )
    },
  }
}

export function routedPoints(wire, layout = wire.edge.wireLayout) {
  return resolveWire(wire, layout, diagramState.readingScale)
}

export function pinnedLabel(points, layout) {
  if (!layout?.label) return null
  const anchor = routeAnchor(straightPoints(points)),
    scale = diagramState.readingScale
  return { x: anchor.x + layout.label.x * scale, y: anchor.y + layout.label.y * scale }
}

// Measure only on a fit request. Manual lanes and labels may extend past the cards,
// including into negative canvas coordinates.
export function includeEditedWires(bounds) {
  for (const group of document.querySelectorAll('#paths .edge-route:not(.group-off)')) {
    if (!group.wireGeometry?.edge.wireLayout) continue
    const box = group.getBBox()
    bounds.left = Math.min(bounds.left, box.x)
    bounds.top = Math.min(bounds.top, box.y)
    bounds.right = Math.max(bounds.right, box.x + box.width)
    bounds.bottom = Math.max(bounds.bottom, box.y + box.height)
  }
  return bounds
}
