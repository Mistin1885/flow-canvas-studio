import { simplifyWire } from './polyline.js'
import { bypassEndpoints, routeBetweenPorts } from './wireDocking.js'

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

// Store each straight segment as a lane relative to the two ports. End lanes
// normally follow the corresponding port as cards move or change size.
export function dragLanes(points, index, delta, ports, scale) {
  const [a, b] = ports.map((p) => p.point)
  return points.slice(1).map((p, i) => {
    const axis = points[i].x === p.x ? 'x' : 'y'
    let at = (p[axis] + (i === index ? delta[axis] : 0) - (a[axis] + b[axis]) / 2) / scale
    if (i !== index && i === 0) at = 'start'
    else if (i !== index && i === points.length - 2) at = 'end'
    return { axis, at }
  })
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
  if (layout.lanes?.length) {
    let p = a.stub
    middle = [p]
    for (const { axis, at } of layout.lanes) {
      const coord =
        at === 'start'
          ? a.stub[axis]
          : at === 'end'
            ? b.stub[axis]
            : (a.point[axis] + b.point[axis]) / 2 + at * scale
      p = { ...p, [axis]: coord }
      middle.push(p)
    }
    const axis = layout.lanes.at(-1).axis === 'x' ? 'y' : 'x'
    middle.push({ ...p, [axis]: b.stub[axis] }, b.stub)
    middle = bypassEndpoints(middle, view, scale)
  } else {
    middle = routeBetweenPorts(a, b, view, scale)
  }
  return simplifyWire([a.point, ...middle, b.point])
}
