import { diagramState } from '../diagram/state.js'

function gridPlacement(x, y, w, h, boxes, allowNegative = false) {
  const step = 20 * diagramState.readingScale,
    gap = 12 * diagramState.readingScale
  const bound = (k) => allowNegative ? k : Math.max(0, k)
  const rounded = (v) => bound(Math.round(v / step))
  const xs = new Set([0, rounded(x)]),
    ys = new Set([0, rounded(y)])
  // A closest legal grid point is at the requested coordinate or next to an obstacle on each axis.
  for (const b of boxes) {
    xs.add(bound(Math.floor((b.x - w - gap) / step)))
    xs.add(Math.ceil((b.x + b.w + gap) / step))
    ys.add(bound(Math.floor((b.y - h - gap) / step)))
    ys.add(Math.ceil((b.y + b.h + gap) / step))
  }
  const closest = (values, target) =>
    [...values].map((k) => k * step).sort((a, b) => Math.abs(a - target) - Math.abs(b - target) || a - b)
  const cols = closest(xs, x),
    rows = closest(ys, y)
  let best = null,
    cost = Infinity
  for (const py of rows) {
    const dy = (py - y) ** 2
    if (dy > cost) break
    const obstacles = boxes.filter((b) => py < b.y + b.h + gap && py + h + gap > b.y)
    for (const px of cols) {
      const d = dy + (px - x) ** 2
      if (d >= cost) break
      if (obstacles.some((b) => px < b.x + b.w + gap && px + w + gap > b.x)) continue
      best = { x: px, y: py }
      cost = d
      break
    }
  }
  return best
}

export { gridPlacement }
