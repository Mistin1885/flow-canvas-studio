import { diagramState } from '../diagram/state.js'

// Keep long merge edges outside unrelated cards. Dagre supplies the layout;
// only obstructed routes receive a short orthogonal detour, retaining their label.
function segmentHitsBox(a, b, r) {
  let low = 0,
    high = 1
  const dx = b.x - a.x,
    dy = b.y - a.y
  for (const [p, q] of [
    [-dx, a.x - r.x],
    [dx, r.x + r.w - a.x],
    [-dy, a.y - r.y],
    [dy, r.y + r.h - a.y],
  ]) {
    if (Math.abs(p) < 1e-9) {
      if (q <= 0.01) return false
      continue
    }
    const t = q / p
    if (p < 0) low = Math.max(low, t)
    else high = Math.min(high, t)
    if (low >= high - 0.000001) return false
  }
  return high > 0 && low < 1
}

function clearRoute(points, boxes) {
  return !boxes.some((r) => points.some((p, k) => k && segmentHitsBox(points[k - 1], p, r)))
}

function wireTrack(a, b) {
  const dx = Math.abs(a.x - b.x),
    dy = Math.abs(a.y - b.y)
  if (dx < 0.02 && dy > 0.02)
    return { axis: 'x', at: (a.x + b.x) / 2, lo: Math.min(a.y, b.y), hi: Math.max(a.y, b.y) }
  if (dy < 0.02 && dx > 0.02)
    return { axis: 'y', at: (a.y + b.y) / 2, lo: Math.min(a.x, b.x), hi: Math.max(a.x, b.x) }
  return null
}

function tracksOf(points) {
  return points
    .slice(1)
    .map((p, k) => wireTrack(points[k], p))
    .filter(Boolean)
}

function parallelRun(a, b, gap) {
  if (!a || a.axis !== b.axis || Math.abs(a.at - b.at) >= gap) return 0
  return Math.max(0, Math.min(a.hi, b.hi) - Math.max(a.lo, b.lo))
}

function orthogonalRoute(start, end, boxes, bounds, tracks, conflicts) {
  const { left, right, min, max } = bounds
  const obstacles = boxes.filter((r) => r.x < right && r.x + r.w > left && r.y < max && r.y + r.h > min)
  const spacing = 12 * diagramState.readingScale
  const lanes = (axis) =>
    conflicts.filter((t) => t.axis === axis).flatMap((t) => [t.at - spacing, t.at + spacing])
  const xs = [
    ...new Set(
      [start.x, end.x, left, right, ...lanes('x'), ...obstacles.flatMap((r) => [r.x, r.x + r.w])].filter(
        (x) => x >= left && x <= right,
      ),
    ),
  ].sort((a, b) => a - b)
  const ys = [
      ...new Set(
        [start.y, end.y, min, max, ...lanes('y'), ...obstacles.flatMap((r) => [r.y, r.y + r.h])].filter(
          (y) => y >= min && y <= max,
        ),
      ),
    ].sort((a, b) => a - b),
    nx = xs.length
  const first = ys.indexOf(start.y) * nx + xs.indexOf(start.x),
    last = ys.indexOf(end.y) * nx + xs.indexOf(end.x),
    dist = new Map([[first * 3, 0]]),
    previous = new Map(),
    heap = []
  const point = (id) => ({ x: xs[id % nx], y: ys[Math.floor(id / nx)] })
  const push = (item) => {
    heap.push(item)
    let k = heap.length - 1
    while (k) {
      const p = (k - 1) >> 1
      if (heap[p].score <= item.score) break
      heap[k] = heap[p]
      k = p
    }
    heap[k] = item
  }
  const pop = () => {
    const top = heap[0],
      tail = heap.pop()
    if (heap.length) {
      let k = 0
      while (2 * k + 1 < heap.length) {
        let child = 2 * k + 1
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++
        if (heap[child].score >= tail.score) break
        heap[k] = heap[child]
        k = child
      }
      heap[k] = tail
    }
    return top
  }
  // Keep direction in the search state to favor fewer bends at equal distance.
  push({ id: first * 3, cost: 0, score: 0 })
  while (heap.length) {
    const current = pop()
    if (current.cost !== dist.get(current.id)) continue
    const cell = Math.floor(current.id / 3),
      axis = current.id % 3
    if (cell === last) {
      const path = []
      for (let id = current.id; id !== undefined; id = previous.get(id))
        path.push(point(Math.floor(id / 3)))
      return path.reverse()
    }
    const a = point(cell),
      col = cell % nx,
      row = Math.floor(cell / nx),
      neighbors = []
    if (col > 0) neighbors.push(cell - 1)
    if (col + 1 < nx) neighbors.push(cell + 1)
    if (row > 0) neighbors.push(cell - nx)
    if (row + 1 < ys.length) neighbors.push(cell + nx)
    for (const next of neighbors) {
      const b = point(next),
        dir = next % nx === col ? 2 : 1,
        id = next * 3 + dir
      const step = wireTrack(a, b)
      const congestion = step
        ? tracks.reduce((sum, t) => sum + parallelRun(step, t, 8 * diagramState.readingScale), 0)
        : 0
      const cost =
        current.cost +
        Math.abs(b.x - a.x) +
        Math.abs(b.y - a.y) +
        congestion * 6 +
        (axis && axis !== dir ? 20 * diagramState.readingScale : 0)
      if (cost >= (dist.get(id) ?? Infinity) || obstacles.some((r) => segmentHitsBox(a, b, r))) continue
      dist.set(id, cost)
      previous.set(id, current.id)
      push({ id, cost, score: cost + Math.abs(end.x - b.x) + Math.abs(end.y - b.y) })
    }
  }
  return null
}

export { clearRoute, orthogonalRoute, parallelRun, segmentHitsBox, tracksOf, wireTrack }
