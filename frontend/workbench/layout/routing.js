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

function heading(a, b) {
  if (a.x !== b.x) return a.x < b.x ? 1 : 2
  return a.y < b.y ? 3 : 4
}

function opposite(direction) {
  return direction % 2 ? direction + 1 : direction - 1
}

function orthogonalRoute(start, end, boxes, bounds, tracks, conflicts, scale, edit) {
  const { left, right, min, max } = bounds
  const obstacles = boxes.filter((r) => r.x < right && r.x + r.w > left && r.y < max && r.y + r.h > min)
  const spacing = 12 * scale
  const lanes = (axis) => [
    ...conflicts.filter((t) => t.axis === axis).flatMap((t) => [t.at - spacing, t.at + spacing]),
    ...(edit?.lane?.axis === axis ? [edit.lane.at] : []),
  ]
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
    // Edited routes distinguish travel direction and whether the dragged lane was used.
    states = edit ? 10 : 3,
    initial = first * states + (edit ? heading(edit.source, start) : 0),
    endDirection = edit ? heading(end, edit.target) : 0,
    dist = new Map(),
    previous = new Map(),
    heap = []
  const point = (id) => ({ x: xs[id % nx], y: ys[Math.floor(id / nx)] })
  const compare = (a, b) => a.bends - b.bends || a.score - b.score
  const push = (item) => {
    heap.push(item)
    let k = heap.length - 1
    while (k) {
      const p = (k - 1) >> 1
      if (compare(heap[p], item) <= 0) break
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
        if (child + 1 < heap.length && compare(heap[child + 1], heap[child]) < 0) child++
        if (compare(heap[child], tail) >= 0) break
        heap[k] = heap[child]
        k = child
      }
      heap[k] = tail
    }
    return top
  }
  // Manual routes minimize turns first. Automatic layout keeps its congestion and distance costs.
  const seed = { id: initial, cost: 0, score: 0, bends: 0 }
  dist.set(initial, seed)
  push(seed)
  while (heap.length) {
    const current = pop()
    if (current !== dist.get(current.id)) continue
    const cell = Math.floor(current.id / states),
      direction = current.id % states % 5,
      usedLane = edit && current.id % states >= 5
    if (cell === last && (!edit?.lane || usedLane)) {
      const path = []
      for (let id = current.id; id !== undefined; id = previous.get(id))
        path.push(point(Math.floor(id / states)))
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
        dir = edit ? heading(a, b) : next % nx === col ? 2 : 1
      if (edit && dir === opposite(direction)) continue
      const lane = edit?.lane
      const onLane = lane && a[lane.axis] === lane.at && b[lane.axis] === lane.at
      const id = next * states + dir + (usedLane || onLane ? 5 : 0)
      if (edit && next === last && (dir === opposite(endDirection) || (lane && !usedLane && !onLane))) continue
      const step = tracks.length ? wireTrack(a, b) : null
      const congestion = step
        ? tracks.reduce((sum, t) => sum + parallelRun(step, t, 8 * scale), 0)
        : 0
      const cost =
        current.cost +
        Math.abs(b.x - a.x) +
        Math.abs(b.y - a.y) +
        congestion * 6 +
        (!edit && direction && direction !== dir ? 20 * scale : 0)
      const bends = current.bends + (edit && direction !== dir ? 1 : 0) +
        (edit && next === last && dir !== endDirection ? 1 : 0)
      const candidate = { id, cost, bends, score: cost + Math.abs(end.x - b.x) + Math.abs(end.y - b.y) }
      const prior = dist.get(id)
      if ((prior && compare(candidate, prior) >= 0) || obstacles.some((r) => segmentHitsBox(a, b, r))) continue
      dist.set(id, candidate)
      previous.set(id, current.id)
      push(candidate)
    }
  }
  return null
}

export { clearRoute, orthogonalRoute, parallelRun, segmentHitsBox, tracksOf, wireTrack }
