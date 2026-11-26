import { orthogonalPoints, simplifyWire } from './polyline.js'
import { legacyRoute } from './legacyWire.js'
import { routeBetweenPorts } from './wireDocking.js'

import { dockSides, extendPort, facePort, nearestFace, nearStraightRoute, portSnapRadius } from './dockPoints.js'
import { clearRoute, wireTrack, tracksOf } from './routing.js'

export { nearestFace }
const finite = (v) => Number.isFinite(v) && Math.abs(v) <= 1e7

export function validateWireLayout(layout) {
  if (layout === undefined) return
  if (
    !layout ||
    typeof layout !== 'object' ||
    Array.isArray(layout) ||
    [layout.start, layout.end].some((s) => s !== undefined && !dockSides.includes(s)) ||
    (layout.label !== undefined && !(finite(layout.label?.x) && finite(layout.label?.y))) ||
    (layout.lanes !== undefined &&
      (!Array.isArray(layout.lanes) ||
        !layout.lanes.length ||
        layout.lanes.length > 2048 ||
        layout.lanes.some(
          (l) => !['x', 'y'].includes(l?.axis) || !(finite(l.at) || ['start', 'end'].includes(l.at)),
        )))
  )
    throw Error('連線的接點或排版座標無效')
}

export function wirePorts(view, layout, scale) {
  // A hand-set lane is measured against the original ports, both in the live
  // preview and after saving/loading it. Auto snap changes only the default drawing.
  const ports = view.originalPorts || view.autoPoints
  return [
    ['start', view.from, ports[0]],
    ['end', view.to, ports.at(-1)],
  ].map(([key, card, auto]) => layout[key]
    ? facePort(card, layout[key], 12 * scale)
    : { point: auto, stub: extendPort(auto, nearestFace(card, auto), 12 * scale) })
}

export function straightPoints(points) {
  return simplifyWire(orthogonalPoints(points))
}

export function routeAnchor(points) {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let left = lengths.reduce((a, b) => a + b, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (left <= lengths[i] && lengths[i]) {
      const t = left / lengths[i],
        a = points[i],
        b = points[i + 1]
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    left -= lengths[i]
  }
  return points[0]
}

// Snapshot the displayed routes once per drag. Only parallel runs which overlap
// or almost meet along their length can guide the segment (including split branches).
export function parallelGuides(routes, points, index, radius) {
  const segment = points[index + 1] && wireTrack(points[index], points[index + 1])
  if (!segment) return []
  const guides = []
  for (const route of routes) {
    for (const track of tracksOf(straightPoints(route))) {
      if (track.axis !== segment.axis) continue
      const overlap = Math.min(track.hi, segment.hi) - Math.max(track.lo, segment.lo)
      if (overlap >= -radius) guides.push({ at: track.at, overlap })
    }
  }
  return guides
}

// Only the line the user moved is a constraint. The bends that connected it
// to the ports are disposable, otherwise each new drag accumulates old bends.
export function dragLanes(points, index, delta, ports, scale, guides = [], radius = 0) {
  const p = points[index]
  const axis = p.x === points[index + 1].x ? 'x' : 'y'
  const desired = p[axis] + delta[axis]
  let coordinate = desired
  let distance = Infinity
  for (const { point, stub } of ports) {
    const offset = Math.abs(desired - point[axis])
    if (point[axis] === stub[axis] && offset <= portSnapRadius * scale && offset < distance) {
      distance = offset
      coordinate = point[axis]
    }
  }
  // Prefer the closest guide. On a tie retain a dock or the best overlapping run.
  let overlap = Infinity
  let peer = false
  for (const guide of guides) {
    const offset = Math.abs(guide.at - desired)
    if (offset > radius || offset > distance) continue
    if (offset === distance && (guide.overlap < overlap ||
        (guide.overlap === overlap && guide.at >= coordinate))) continue
    coordinate = guide.at
    distance = offset
    overlap = guide.overlap
    peer = true
  }
  const midpoint = (ports[0].point[axis] + ports[1].point[axis]) / 2
  const at = (coordinate - midpoint) / scale
  // A peer can sit just beside the midpoint where automatic port straightening kicks in.
  return [peer && at !== 0 && Math.abs(at) <= portSnapRadius ? { axis, at, exact: true } : { axis, at }]
}

export function closestSegment(points, p) {
  let closest = 0,
    best = Infinity
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i]
    const dx = p.x - Math.max(Math.min(a.x, b.x), Math.min(Math.max(a.x, b.x), p.x))
    const dy = p.y - Math.max(Math.min(a.y, b.y), Math.min(Math.max(a.y, b.y), p.y))
    if (dx * dx + dy * dy < best) {
      best = dx * dx + dy * dy
      closest = i - 1
    }
  }
  return closest
}

export function resolveWire(view, layout, scale) {
  if (!layout?.start && !layout?.end && !layout?.lanes) return view.autoPoints
  const [a, b] = wirePorts(view, layout, scale)
  const single = layout.lanes?.length === 1 && layout.lanes[0]
  // A dragged lane is stored relative to the ports' midpoint. Let a user
  // pull it back onto their common axis without having to reset the wire.
  if (!layout.lanes || (single && single.exact !== true && finite(single.at) && Math.abs(single.at) <= portSnapRadius)) {
    const corridor = layout.start || layout.end ? [a.point, b.point] : view.autoPoints
    const straight = nearStraightRoute(view.from, view.to, corridor, scale)
    if (straight && (!single || straight[0][single.axis] === straight[1][single.axis]) &&
        clearRoute(straight, view.obstacles || [])) return straight
  }
  let middle
  if (single && finite(single.at)) {
    const { axis, at } = single
    middle = routeBetweenPorts(a, b, view, scale, {
      axis, at: (a.point[axis] + b.point[axis]) / 2 + at * scale,
    })
  } else if (layout.lanes?.length) {
    return legacyRoute(a, b, layout.lanes, view, scale)
  } else {
    middle = routeBetweenPorts(a, b, view, scale)
  }
  return simplifyWire([a.point, ...middle, b.point])
}
