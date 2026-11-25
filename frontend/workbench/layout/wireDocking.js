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

export function routeBetweenPorts(a, b, view, scale) {
  const s = a.stub,
    t = b.stub,
    pad = 6 * scale
  const boxes = [view.from, view.to].map((r) => ({
    x: r.x - pad,
    y: r.y - pad,
    w: r.w + 2 * pad,
    h: r.h + 2 * pad,
  }))
  const obstacles = [...boxes, ...(view.obstacles || [])]
  const direct = [s, { x: t.x, y: s.y }, t],
    other = [s, { x: s.x, y: t.y }, t]
  return clearRoute(direct, obstacles)
    ? direct
    : clearRoute(other, obstacles)
      ? other
      : orthogonalRoute(
          s,
          t,
          obstacles,
          {
            left: Math.min(s.x, t.x, ...boxes.map((r) => r.x)) - 40 * scale,
            right: Math.max(s.x, t.x, ...boxes.map((r) => r.x + r.w)) + 40 * scale,
            min: Math.min(s.y, t.y, ...boxes.map((r) => r.y)) - 40 * scale,
            max: Math.max(s.y, t.y, ...boxes.map((r) => r.y + r.h)) + 40 * scale,
          },
          [],
          [],
          scale,
        ) || direct
}
