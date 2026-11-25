import { simplifyWire } from './polyline.js'
import { clearRoute, orthogonalRoute } from './routing.js'

export function bypassEndpoints(points, view, scale) {
  const boxes = [view.from, view.to]
  if (clearRoute(points, boxes)) return points
  const safe = points.filter(
    (p, index) =>
      index === 0 ||
      index === points.length - 1 ||
      !boxes.some((r) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h),
  )
  const result = [safe[0]]
  for (const end of safe.slice(1)) {
    const start = result.at(-1)
    if (clearRoute([start, end], boxes)) {
      // Skipping a waypoint inside a node can leave a diagonal gap.
      const elbow = { x: end.x, y: start.y }
      if (clearRoute([start, elbow, end], boxes)) {
        result.push(elbow, end)
        continue
      }
    }
    const pad = 16 * scale
    const bounds = {
      left: Math.min(start.x, end.x, ...boxes.map((r) => r.x)) - pad,
      right: Math.max(start.x, end.x, ...boxes.map((r) => r.x + r.w)) + pad,
      min: Math.min(start.y, end.y, ...boxes.map((r) => r.y)) - pad,
      max: Math.max(start.y, end.y, ...boxes.map((r) => r.y + r.h)) + pad,
    }
    const path = orthogonalRoute(start, end, boxes, bounds, [], [], scale)
    if (path) result.push(...path.slice(1))
    else result.push(end)
  }
  return result
}

// Score the complete polyline including the entry and exit legs. A locally short
// elbow between the stubs can introduce two extra turns at the actual ports.
function directRoutes(a, b, lane) {
  const s = a.stub, t = b.stub
  const choices = [[s, { x: s.x, y: t.y }, t], [s, { x: t.x, y: s.y }, t]]
  for (const axis of ['x', 'y']) {
    const at = lane?.axis === axis ? lane.at : (s[axis] + t[axis]) / 2
    choices.push([s, { ...s, [axis]: at }, { ...t, [axis]: at }, t])
  }
  const candidates = []
  for (const middle of choices) {
    const path = simplifyWire([a.point, ...middle, b.point])
    // A reversal on the same axis folds the line back onto itself.
    if (path.some((p, i) => i > 1 && (p.x === path[i - 2].x || p.y === path[i - 2].y))) continue
    if (lane && !path.some((p, i) => i && p[lane.axis] === lane.at && path[i - 1][lane.axis] === lane.at)) continue
    let length = 0
    for (let i = 1; i < path.length; i++)
      length += Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y)
    candidates.push({ middle, bends: path.length - 2, length })
  }
  return candidates.sort((u, v) => u.bends - v.bends || u.length - v.length)
}

export function routeBetweenPorts(a, b, view, scale, lane) {
  const s = a.stub, t = b.stub, pad = 6 * scale
  const boxes = [view.from, view.to].map((r) => ({
    x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad,
  }))
  const obstacles = [...boxes, ...(view.obstacles || [])]
  const choices = directRoutes(a, b, lane)
  // Only skip the search when an unobstructed candidate attains the free-space optimum.
  const best = choices[0]
  const direct = choices.find(c => c.bends === best.bends && c.length === best.length && clearRoute(c.middle, obstacles))
  if (direct) return direct.middle

  const margin = 16 * scale
  const bounds = {
    left: Math.min(s.x, t.x, lane?.axis === 'x' ? lane.at : s.x) - margin,
    right: Math.max(s.x, t.x, lane?.axis === 'x' ? lane.at : t.x) + margin,
    min: Math.min(s.y, t.y, lane?.axis === 'y' ? lane.at : s.y) - margin,
    max: Math.max(s.y, t.y, lane?.axis === 'y' ? lane.at : t.y) + margin,
  }
  const edit = { source: a.point, target: b.point, lane }
  // Grow the search window past touching blockers if the current window has no exit.
  let expanded
  do {
    const nearby = obstacles.filter(r => r.x <= bounds.right && r.x + r.w >= bounds.left &&
      r.y <= bounds.max && r.y + r.h >= bounds.min)
    const previous = { ...bounds }
    for (const r of nearby) {
      bounds.left = Math.min(bounds.left, r.x - margin)
      bounds.right = Math.max(bounds.right, r.x + r.w + margin)
      bounds.min = Math.min(bounds.min, r.y - margin)
      bounds.max = Math.max(bounds.max, r.y + r.h + margin)
    }
    const path = orthogonalRoute(s, t, obstacles, bounds, [], [], scale, edit)
    if (path) return path
    expanded = Object.keys(bounds).some(key => bounds[key] !== previous[key]) && nearby.length < obstacles.length
  } while (expanded)

  // Tight layouts can leave a dock inside the other card's clearance margin.
  const unpadded = [view.from, view.to, ...obstacles.slice(2)]
  const path = orthogonalRoute(s, t, unpadded, bounds, [], [], scale, edit)
  if (path) return path
  if (lane) return routeBetweenPorts(a, b, view, scale)
  return bypassEndpoints([s, { x: t.x, y: s.y }, t], view, scale)
}
