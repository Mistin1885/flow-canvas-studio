import { diagramState } from '../diagram/state.js'
import { frameTargetAt } from '../frames/handles.js'
import { frameHandles } from '../frames/membership.js'
import { nearestFace } from '../layout/dockPoints.js'
import { collectDockGuides, placeDock } from '../layout/dockSnap.js'
import { routedPoints, wireGeometry } from '../layout/editedWires.js'
import { $ } from '../ui/dom.js'

function nearCard(card, point, radius) {
  return point.x >= card.x - radius && point.x <= card.x + card.w + radius &&
    point.y >= card.y - radius && point.y <= card.y + card.h + radius
}

// A captured pointer keeps delivering events to the original grip, so resolve
// the drop from the element under the pointer on both move and release.
export function previewEndpoint(g, event, cursor) {
  const start = g.mode === 'start'
  const original = start ? g.geometry.from : g.geometry.to
  const fixed = start ? g.geometry.to : g.geometry.from
  const fixedPoint = start ? g.points.at(-1) : g.points[0]
  $('canvas').classList.add('choosing-endpoint')
  const hit = frameTargetAt(event.clientX, event.clientY)
  const key = hit?.dataset.endpoint || hit?.dataset.key
  let card = diagramState.instanceMap.get(key) || frameHandles.get(key)
  // A grip straddles the border. Allow the same small margin when adjusting
  // its position just outside the original card.
  if (!card && nearCard(original, cursor, 2 * g.radius)) card = original
  if (card === fixed && card !== original) card = null
  const target = card && card !== original ? hit : null
  if (g.target !== target) {
    g.target?.classList.remove('link-target')
    g.target = target
    target?.classList.add('link-target')
  }
  const previousEndpoint = g.endpoint
  g.endpoint = card?.id
  if (!card) {
    g.next = null
    return start ? [cursor, fixedPoint] : [fixedPoint, cursor]
  }

  const same = card === original
  const geometry = same ? g.geometry : wireGeometry(g.geometry.edge,
    start ? card : fixed, start ? fixed : card, g.points)
  const layout = same ? { ...g.layout } : {}
  if (same && !layout.start && !layout.end && !layout.lanes)
    Object.assign(layout, geometry.autoDock)
  if (!same) {
    // Pin the opposite end where it is drawn, including a previously automatic dock.
    const fixedEnd = start ? 'end' : 'start'
    const fixedSide = g.layout[fixedEnd] || nearestFace(fixed, fixedPoint)
    placeDock(layout, fixedEnd, fixed, fixedSide, fixedPoint, [], 0)
    if (g.layout.label) layout.label = g.layout.label
  }
  if (g.guideCard !== card) {
    g.guideCard = card
    g.endpointGuides = same ? g.dockGuides[g.mode] : collectDockGuides(geometry, g.peers)[g.mode]
  }
  placeDock(layout, g.mode, card, nearestFace(card, cursor), cursor, g.endpointGuides, g.radius)
  const ratio = g.mode + 'Ratio'
  if (previousEndpoint === card.id && g.next?.[g.mode] === layout[g.mode] && g.next[ratio] === layout[ratio])
    return g.endpointPoints
  g.next = layout
  g.endpointPoints = routedPoints(geometry, layout)
  return g.endpointPoints
}
