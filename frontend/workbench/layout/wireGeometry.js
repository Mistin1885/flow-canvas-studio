import { simplifyWire } from './polyline.js'
import { legacyRoute } from './legacyWire.js'
import { routeBetweenPorts } from './wireDocking.js'

const faces = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }
const sides = Object.keys(faces)
const finite = (v) => Number.isFinite(v) && Math.abs(v) <= 1e7

export function validateWireLayout(layout) {
  if (layout === undefined) return
  if (
    !layout ||
    typeof layout !== 'object' ||
    Array.isArray(layout) ||
    [layout.start, layout.end].some((s) => s !== undefined && !sides.includes(s)) ||
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

export function nearestFace(card, p) {
  const dx = p.x - card.x,
    dy = p.y - card.y
  // Outside a card, pick the side facing the pointer, including near corners.
  const outsideX = Math.max(-dx, dx - card.w),
    outsideY = Math.max(-dy, dy - card.h)
  if (Math.max(outsideX, outsideY) > 0) {
    if (outsideX > outsideY) return dx < 0 ? 'left' : 'right'
    return dy < 0 ? 'top' : 'bottom'
  }
  const distances = [Math.abs(dy), Math.abs(dx - card.w), Math.abs(dy - card.h), Math.abs(dx)]
  return sides[distances.indexOf(Math.min(...distances))]
}

export function wirePorts(view, layout, scale) {
  return [
    ['start', view.from, view.autoPoints[0]],
    ['end', view.to, view.autoPoints.at(-1)],
  ].map(([key, card, auto]) => {
    const side = layout[key] || nearestFace(card, auto),
      [dx, dy] = faces[side]
    const point = layout[key]
      ? { x: card.x + (card.w * (dx + 1)) / 2, y: card.y + (card.h * (dy + 1)) / 2 }
      : auto
    return { point, stub: { x: point.x + dx * 12 * scale, y: point.y + dy * 12 * scale } }
  })
}

export function straightPoints(points) {
  const result = [points[0]]
  for (const b of points.slice(1)) {
    const a = result.at(-1)
    if (a.x !== b.x && a.y !== b.y) {
      if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
        const x = (a.x + b.x) / 2
        result.push({ x, y: a.y }, { x, y: b.y })
      } else {
        const y = (a.y + b.y) / 2
        result.push({ x: a.x, y }, { x: b.x, y })
      }
    }
    result.push(b)
  }
  return simplifyWire(result)
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

// Only the line the user moved is a constraint. The bends that connected it
// to the ports are disposable, otherwise each new drag accumulates old bends.
export function dragLanes(points, index, delta, ports, scale) {
  const p = points[index]
  const axis = p.x === points[index + 1].x ? 'x' : 'y'
  let coordinate = p[axis] + delta[axis]
  const aligned = ports.filter(port => port.point[axis] === port.stub[axis])
    .sort((a, b) => Math.abs(coordinate - a.point[axis]) - Math.abs(coordinate - b.point[axis]))
  if (aligned.length && Math.abs(coordinate - aligned[0].point[axis]) <= 6 * scale)
    coordinate = aligned[0].point[axis]
  const midpoint = (ports[0].point[axis] + ports[1].point[axis]) / 2
  return [{ axis, at: (coordinate - midpoint) / scale }]
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
  let middle
  const single = layout.lanes?.length === 1 && layout.lanes[0]
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
