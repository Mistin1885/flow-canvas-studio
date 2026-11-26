// Old documents stored every generated bend, including short steps the user
// never moved. Accept a simpler route only if it stays in the old corridor.
import { removeBacktracks } from './backtracks.js'
import { clearRoute } from './routing.js'
import { simplifyWire } from './polyline.js'
import { bypassEndpoints, routeBetweenPorts } from './wireDocking.js'

function coversRoute(route, other, tolerance) {
  return route.slice(1).every((end, i) => {
    const start = route[i], axis = start.x === end.x ? 'y' : 'x', cross = axis === 'x' ? 'y' : 'x'
    let covered = Math.min(start[axis], end[axis])
    const goal = Math.max(start[axis], end[axis])
    const intervals = []
    for (let j = 1; j < other.length; j++) {
      const a = other[j - 1], b = other[j]
      if (start[cross] < Math.min(a[cross], b[cross]) - tolerance ||
          start[cross] > Math.max(a[cross], b[cross]) + tolerance) continue
      intervals.push([Math.min(a[axis], b[axis]) - tolerance, Math.max(a[axis], b[axis]) + tolerance])
    }
    for (const [lo, hi] of intervals.sort((a, b) => a[0] - b[0])) {
      if (lo > covered) return false
      covered = Math.max(covered, hi)
      if (covered >= goal) return true
    }
    return false
  })
}

// Merge two parallel runs separated by a tiny step. Move the shorter run
// first, leaving distant hand-positioned bends and the docking faces in place.
function mergeSmallSteps(points, boxes, tolerance) {
  const path = points.slice()
  for (let i = 1; i + 2 < path.length; i++) {
    const [a, b, c, d] = path.slice(i - 1, i + 3)
    const axis = a.x === b.x ? 'x' : 'y', along = axis === 'x' ? 'y' : 'x'
    if (c[axis] !== d[axis] || Math.abs(b[axis] - c[axis]) > tolerance ||
        (b[along] - a[along]) * (d[along] - c[along]) <= 0) continue
    const alignStart = Math.abs(b[along] - a[along]) <= Math.abs(d[along] - c[along])
    for (const moveStart of [alignStart, !alignStart]) {
      const neighbor = moveStart ? path[i - 2] : path[i + 3]
      if (!neighbor) continue
      const old = moveStart ? a : d
      const moved = { ...old, [axis]: moveStart ? c[axis] : b[axis] }
      if ((old[axis] - neighbor[axis]) * (moved[axis] - neighbor[axis]) <= 0) continue
      if (!clearRoute([neighbor, moved, moveStart ? d : a], boxes)) continue
      path.splice(i - 1, 4, moveStart ? moved : a, moveStart ? d : moved)
      i = Math.max(0, i - 2)
      break
    }
  }
  return path
}

export function legacyRoute(a, b, lanes, view, scale) {
  let p = a.stub
  const middle = [p]
  for (const { axis, at } of lanes) {
    const coord = at === 'start' ? a.stub[axis] : at === 'end' ? b.stub[axis] :
      (a.point[axis] + b.point[axis]) / 2 + at * scale
    p = { ...p, [axis]: coord }
    middle.push(p)
  }
  const axis = lanes.at(-1).axis === 'x' ? 'y' : 'x'
  middle.push({ ...p, [axis]: b.stub[axis] }, b.stub)
  const original = simplifyWire([a.point, ...bypassEndpoints(middle, view, scale), b.point])
  if (original.length <= 3) return original

  const tolerance = 6 * scale
  function equivalent(lane) {
    const path = simplifyWire([a.point, ...routeBetweenPorts(a, b, view, scale, lane), b.point])
    if (path.length < original.length && coversRoute(original, path, tolerance) &&
        coversRoute(path, original, tolerance)) return path
  }
  const automatic = equivalent()
  if (automatic) return automatic
  let longest = 0, lane
  for (let i = 1; i < original.length; i++) {
    const u = original[i - 1], v = original[i]
    const length = Math.abs(u.x - v.x) + Math.abs(u.y - v.y)
    if (length <= longest) continue
    longest = length
    const axis = u.x === v.x ? 'x' : 'y'
    lane = { axis, at: u[axis] }
  }
  const boxes = [view.from, view.to, ...(view.obstacles || [])]
  const path = equivalent(lane) || mergeSmallSteps(original, boxes, tolerance)
  return view.from === view.to || lanes.some(l => l.exact) ? path :
    removeBacktracks(path, shortcut => clearRoute(shortcut, boxes))
}
