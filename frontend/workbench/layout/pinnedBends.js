import { simplifyWire } from './polyline.js'
import { clearRoute } from './routing.js'

function laneOffset(axis, coordinate, [start, end], scale) {
  const midpoint = (start.point[axis] + end.point[axis]) / 2
  return { axis, at: (coordinate - midpoint) / scale, exact: true }
}

// An ordered lane list describes the interior segments between the two dock legs.
// Each pair of consecutive lanes intersects at a bend.
export function pinnedRoute(ports, lanes, scale, view) {
  const [start, end] = ports
  const points = [start.point]
  let previousAxis
  for (const { axis, at } of lanes) {
    if (axis === previousAxis || !Number.isFinite(at)) return null
    const midpoint = (start.point[axis] + end.point[axis]) / 2
    points.push({ ...points.at(-1), [axis]: midpoint + at * scale })
    previousAxis = axis
  }
  const along = previousAxis === 'x' ? 'y' : 'x'
  points.push({ ...points.at(-1), [along]: end.point[along] }, end.point)
  const path = simplifyWire(points)
  // Reject a reversal or an approach through the wrong face. Short, outward
  // runs are valid even when they are shorter than an automatic docking stub.
  const leavesFace = (port, next) => next &&
    (port.stub.x - port.point.x) * (next.x - port.point.x) +
    (port.stub.y - port.point.y) * (next.y - port.point.y) > 0
  if (!leavesFace(start, path[1]) || !leavesFace(end, path.at(-2))) return null
  if (path.some((p, i) => i >= 2 && (p.x === path[i - 2].x || p.y === path[i - 2].y))) return null
  return clearRoute(path, [view.from, view.to, ...(view.obstacles || [])]) ? path : null
}

export function interiorLanes(points, ports, scale) {
  const interior = []
  for (let i = 1; i < points.length - 2; i++) {
    const axis = points[i].x === points[i + 1].x ? 'x' : 'y'
    interior.push(laneOffset(axis, points[i][axis], ports, scale))
  }
  return interior
}

export function moveBend(points, index, moved, ports, scale, view) {
  if (points.length < 4) return [moved]
  const interior = interiorLanes(points, ports, scale)
  const along = moved.axis === 'x' ? 'y' : 'x'
  const lane = { ...moved, exact: true }
  if (index === 0) {
    interior.unshift(laneOffset(along, ports[0].stub[along], ports, scale), lane)
  } else if (index === points.length - 2) {
    interior.push(lane, laneOffset(along, ports[1].stub[along], ports, scale))
  } else {
    interior[index - 1] = lane
  }
  if (interior.length === 1) return [moved]
  // If the requested move hits a card, keep the last valid preview.
  return pinnedRoute(ports, interior, scale, view) ? interior : null
}
