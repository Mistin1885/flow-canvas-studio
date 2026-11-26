import { facePort } from './dockPoints.js'
import { clearRoute, parallelRun, tracksOf } from './routing.js'

function crossing(a, b) {
  return a.axis !== b.axis && a.at > b.lo && a.at < b.hi && b.at > a.lo && b.at < a.hi
}

// Reserve lanes in sheet coordinates. Alternate candidates only for independent
// forward wires; sibling branches keep the same departure lane.
export function reserveTracks(from, to, layout, fanout, boxes, prior) {
  const axis = ['left', 'right'].includes(layout.start) ? 'x' : 'y'
  const flip = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }
  if (layout.end !== flip[layout.start]) return
  const a = facePort(from, layout.start, 0).point,
    b = facePort(to, layout.end, 0).point
  const sign = ['right', 'bottom'].includes(layout.start) ? 1 : -1
  const distance = (b[axis] - a[axis]) * sign
  if (distance < 24) return
  const mid = (a[axis] + b[axis]) / 2
  const primary = mid + (layout.lanes?.[0]?.at || 0)
  const cross = axis === 'x' ? 'y' : 'x'
  const candidates = new Set([primary])
  if (fanout === 1 && a[cross] !== b[cross]) {
    for (const offset of [-12, 12, -24, 24]) {
      const at = primary + offset
      if ((at - a[axis]) * sign >= 12 && (b[axis] - at) * sign >= 12) candidates.add(at)
    }
  }
  let best
  for (const at of candidates) {
    const path = [a, { ...a, [axis]: at }, { ...b, [axis]: at }, b]
    if (!clearRoute(path, boxes)) continue
    const tracks = tracksOf(path)
    let cost = 0
    for (const track of tracks)
      for (const peer of prior) {
        if (peer.from === from || peer.to === to) continue
        cost += parallelRun(track, peer, 8) + (crossing(track, peer) ? 32 : 0)
      }
    if (!best || cost < best.cost) best = { cost, at, tracks }
    if (!cost) break
  }
  if (!best) return
  for (const track of best.tracks) prior.push({ ...track, from, to })
  if (fanout === 1 && a[cross] !== b[cross]) layout.lanes = [{ axis, at: best.at - mid, exact: true }]
}
