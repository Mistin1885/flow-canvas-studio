import { isFrameNode } from '../graph/nodeTypes.js'
import { diagramState } from '../diagram/state.js'

import { graphModel } from '../graph/model.js'
import { clearRoute, orthogonalRoute, parallelRun, tracksOf, wireTrack } from './routing.js'
import { removeBacktracks } from './backtracks.js'
import { straightenAutomaticWire } from './dockPoints.js'
import { simplifyWire } from './ports.js'

// Use workbook ports and waypoints unless the displayed card sizes obstruct a wire.
function clearCardRoutes() {
  // When both docks are specified, resolveWire computes the complete path from
  // the saved geometry. Searching for an unused automatic path doubles the work.
  if (diagramState.graphLinks.every(l => l.edge.wireLayout?.start && l.edge.wireLayout?.end)) return
  const cards = diagramState.instances.filter((i) => !isFrameNode(graphModel.nodes[i.id]))
  const outside = (p, i, d) => {
    const sides = [
      [Math.abs(p.x - i.x), -1, 0],
      [Math.abs(p.x - i.x - (i.w || diagramState.W)), 1, 0],
      [Math.abs(p.y - i.y), 0, -1],
      [Math.abs(p.y - i.y - (i.h || diagramState.H)), 0, 1],
    ]
    const [, dx, dy] = sides.sort((a, b) => a[0] - b[0])[0]
    return { x: p.x + dx * d, y: p.y + dy * d }
  }
  const routed = []
  const box = (i, pad) => ({
    x: i.x - pad,
    y: i.y - pad,
    w: (i.w || diagramState.W) + 2 * pad,
    h: (i.h || diagramState.H) + 2 * pad,
  })
  for (const l of diagramState.graphLinks) {
    const shapes = cards
    const other = shapes.filter((i) => i !== l.from && i !== l.to)
    const first = l.points[0], last = l.points.at(-1)
    const endpoints = shapes.filter((i) => i === l.from || i === l.to)
    const space = 125 * diagramState.readingScale
    const bounds = {
      left: Math.min(first.x, last.x) - space,
      right: Math.max(first.x, last.x) + space,
      min: Math.min(first.y, last.y) - space,
      max: Math.max(first.y, last.y) + space,
    }
    const sources = new Set(l.edge.sourceConnectorIds || [])
    // Explicit shared workbook trunks may share a corridor. Other long
    // parallel segments reserve separate tracks; perpendicular crossings stay open.
    const nearbyTracks = routed.filter((t) => {
      if (t.ids.some((id) => sources.has(id))) return false
      return t.axis === 'x'
        ? t.at >= bounds.left && t.at <= bounds.right && t.hi >= bounds.min && t.lo <= bounds.max
        : t.at >= bounds.min && t.at <= bounds.max && t.hi >= bounds.left && t.lo <= bounds.right
    })
    l.points = straightenAutomaticWire(l.from, l.to, l.points, diagramState.readingScale, l.edge.wireLayout, straight => {
      const track = wireTrack(...straight), gap = 8 * diagramState.readingScale
      return !nearbyTracks.some(t => parallelRun(track, t, gap) > 18 * diagramState.readingScale) &&
        clearRoute(straight, other.map(i => box(i, gap)))
    })
    if (l.points[0] !== first) l.originalPorts = [first, last]
    const a = l.points[0], b = l.points.at(-1)
    // Keep existing worksheet tracks and ports. Only replace non-axis-aligned legs.
    if (l.points.some((p, k) => k && p.x !== l.points[k - 1].x && p.y !== l.points[k - 1].y)) {
      const blocks = [
        ...other.map((i) => box(i, 8 * diagramState.readingScale)),
        ...endpoints.map((i) => box(i, -0.25)),
      ]
      const fixed = [a]
      for (const end of l.points.slice(1)) {
        const start = fixed.at(-1)
        if (start.x !== end.x && start.y !== end.y) {
          const mx = (start.x + end.x) / 2,
            my = (start.y + end.y) / 2
          const bends = [
            [{ x: end.x, y: start.y }],
            [{ x: start.x, y: end.y }],
            [
              { x: mx, y: start.y },
              { x: mx, y: end.y },
            ],
            [
              { x: start.x, y: my },
              { x: end.x, y: my },
            ],
          ]
          let best = bends[0],
            score = Infinity
          for (const bend of bends) {
            const path = [start, ...bend, end]
            const blocked = blocks.filter((r) => !clearRoute(path, [r])).length
            let cost = blocked * 1e7 + bend.length * 16 * diagramState.readingScale
            for (const track of tracksOf(path))
              for (const prior of nearbyTracks)
                cost += parallelRun(track, prior, 8 * diagramState.readingScale)
            if (cost < score) {
              score = cost
              best = bend
            }
          }
          fixed.push(...best)
        }
        fixed.push(end)
      }
      l.points = simplifyWire(fixed)
    }
    const current = tracksOf(l.points),
      conflicts = nearbyTracks.filter((t) =>
        current.some(
          (v) => parallelRun(v, t, 8 * diagramState.readingScale) > 18 * diagramState.readingScale,
        ),
      )
    if (
      conflicts.length ||
      !clearRoute(
        l.points,
        other.map((i) => box(i, 8 * diagramState.readingScale)),
      ) ||
      !clearRoute(
        l.points,
        endpoints.map((i) => box(i, -0.5)),
      )
    ) {
      for (const pad of [12 * diagramState.readingScale, 6 * diagramState.readingScale, 2]) {
        const nearby = other.map((i) => box(i, pad))
        const stub = (point, card) => {
          for (const extra of [0, 12, 24, 36]) {
            const q = outside(point, card, pad + 2 + extra * diagramState.readingScale)
            const axis = q.x === point.x ? 'y' : 'x',
              cross = axis === 'y' ? q.x : q.y
            if (
              nearbyTracks.some(
                (t) =>
                  t.axis === axis &&
                  Math.abs(t.at - q[axis]) < 8 * diagramState.readingScale &&
                  cross >= t.lo &&
                  cross <= t.hi,
              )
            )
              continue
            if (clearRoute([point, q], nearby)) return q
          }
          return outside(point, card, pad + 2)
        }
        const start = stub(a, l.from),
          end = stub(b, l.to)
        if (!clearRoute([a, start], nearby) || !clearRoute([end, b], nearby)) continue
        const blocks = [
          ...nearby,
          ...shapes.filter((i) => i === l.from || i === l.to).map((i) => box(i, pad)),
        ]
        const route = orthogonalRoute(start, end, blocks, bounds, nearbyTracks, conflicts, diagramState.readingScale)
        if (!route) continue
        l.points = simplifyWire([a, ...route, b])
        break
      }
    }
    for (const t of tracksOf(l.points)) routed.push({ ...t, ids: l.edge.sourceConnectorIds || [] })
  }
  // Both wires can now be considered when selecting the segment to move.
  const footprints = new Map(diagramState.graphLinks.map((l) => [l, tracksOf(l.points)]))
  for (const l of diagramState.graphLinks) {
    const endpoints = cards.filter((i) => i === l.from || i === l.to),
      other = cards.filter((i) => i !== l.from && i !== l.to)
    const ids = l.edge.sourceConnectorIds || [],
      peers = []
    for (const [peer, tracks] of footprints)
      if (peer !== l && !(peer.edge.sourceConnectorIds || []).some((id) => ids.includes(id)))
        peers.push(...tracks)
    // Shift a remaining shared middle lane without moving either arrow tip.
    const points = l.points,
      clearance = 8 * diagramState.readingScale
    for (let k = 1; k < points.length - 2; k++) {
      const u = points[k],
        v = points[k + 1],
        t = wireTrack(u, v)
      if (!t || t.hi - t.lo < 24 * diagramState.readingScale) continue
      const exposure = (track) => peers.reduce((n, prior) => n + parallelRun(track, prior, clearance), 0)
      if (exposure(t) < 18 * diagramState.readingScale) continue
      const axis = t.axis,
        prev = points[k - 1],
        next = points[k + 2]
      for (const off of [-12, 12, -24, 24, -36, 36]) {
        const delta = off * diagramState.readingScale,
          uu = { ...u, [axis]: u[axis] + delta },
          vv = { ...v, [axis]: v[axis] + delta }
        if (
          (uu[axis] - prev[axis]) * (u[axis] - prev[axis]) <= 0 ||
          (next[axis] - vv[axis]) * (next[axis] - v[axis]) <= 0
        )
          continue
        if (Math.min(Math.abs(uu[axis] - prev[axis]), Math.abs(next[axis] - vv[axis])) < clearance)
          continue
        if (
          exposure(wireTrack(uu, vv)) > 1 ||
          !clearRoute(
            [prev, uu, vv, next],
            other.map((i) => box(i, clearance)),
          )
        )
          continue
        if (
          !clearRoute(
            [uu, vv],
            endpoints.map((i) => box(i, clearance)),
          ) ||
          !clearRoute(
            [prev, uu, vv, next],
            endpoints.map((i) => box(i, -0.25)),
          )
        )
          continue
        points[k] = uu
        points[k + 1] = vv
        break
      }
    }
    if (l.from !== l.to && !l.edge.wireLayout?.lanes) {
      l.points = removeBacktracks(points, (shortcut, original) => {
        if (!clearRoute(shortcut, [...other.map(i => box(i, clearance)), ...endpoints.map(i => box(i, -0.25))]))
          return false
        const before = tracksOf(original), after = tracksOf(shortcut)
        const overlap = (tracks, peer) => tracks.reduce((sum, t) => sum + parallelRun(t, peer, clearance), 0)
        return peers.every(peer => overlap(after, peer) <= overlap(before, peer) + 0.01)
      })
    }
    footprints.set(l, tracksOf(l.points))
  }
}

export { clearCardRoutes }
