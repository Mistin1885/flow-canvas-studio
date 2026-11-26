import { reserveTracks } from './arrangeTracks.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { cardCenter } from './cardCenters.js'
import { facePort } from './dockPoints.js'

const directions = {
  LR: ['x', 1, 'right', 'left', 'top', 'bottom'],
  RL: ['x', -1, 'left', 'right', 'top', 'bottom'],
  TD: ['y', 1, 'bottom', 'top', 'left', 'right'],
  BT: ['y', -1, 'top', 'bottom', 'left', 'right'],
}

export function arrangedWire(from, to, direction, fanout, old = {}, parallelIndex = 0) {
  const [axis, sign, forward, incoming, low, high] = directions[direction] || directions.LR
  const across = axis === 'x' ? 'y' : 'x'
  const a = cardCenter(from),
    b = cardCenter(to)
  const startTip = facePort(from, forward, 0).point,
    endTip = facePort(to, incoming, 0).point
  const gap = (endTip[axis] - startTip[axis]) * sign
  const result = old.label ? { label: old.label } : {}
  if (parallelIndex > 0 && from !== to) {
    // Keep the first condition on the main route. Alternate additional
    // conditions around the cards, with a separate outward lane on each pass.
    const side = parallelIndex % 2 ? low : high
    const source = facePort(from, side, 0).point[across]
    const target = facePort(to, side, 0).point[across]
    const clearance = 20 * Math.ceil(parallelIndex / 2)
    const track =
      side === low ? Math.min(source, target) - clearance : Math.max(source, target) + clearance
    return {
      ...result,
      start: side,
      end: side,
      lanes: [{ axis: across, at: track - (source + target) / 2, exact: true }],
    }
  }
  if (gap < 32) {
    // A back edge turns out through a side perpendicular to the reading direction.
    // Same-rank neighbors use their facing sides; a return goes around the row.
    result.start = b[across] > a[across] ? high : low
    result.end = Math.abs(b[axis] - a[axis]) < 8 ? (result.start === low ? high : low) : result.start
    if (from === to) result.end = incoming
  } else {
    result.start = forward
    result.end = incoming
    if (fanout > 1 && Math.abs(a[across] - b[across]) > 0.01) {
      const turn = startTip[axis] + sign * 20
      result.lanes = [{ axis, at: turn - (startTip[axis] + endTip[axis]) / 2, exact: true }]
    }
  }
  return result
}

export function arrangeConnections(graph, links, boxes, groups, direction) {
  const fanout = new Map()
  for (const e of links) fanout.set(e.from, (fanout.get(e.from) || 0) + 1)
  const parallels = new Map()
  const tracksByScope = new Map()
  const cards = [...boxes.entries()]
    .filter(([id]) => !isFrameNode(graph.nodes[id]))
    .map(([, box]) => box)
  for (const e of links) {
    const from = boxes.get(e.from),
      to = boxes.get(e.to)
    const sourceGroup = graph.nodes[e.from]?.group || (e.from.startsWith('group:') && e.from.slice(6))
    const dir = groups.get(sourceGroup) || direction
    if (from && to && from.scope === to.scope) {
      const pair = JSON.stringify([e.from, e.to])
      const index = parallels.get(pair) || 0
      parallels.set(pair, index + 1)
      const count = fanout.get(e.from)
      e.wireLayout = arrangedWire(from, to, dir, count, e.wireLayout, index)
      if (!tracksByScope.has(from.scope)) tracksByScope.set(from.scope, [])
      const obstacles = cards.filter(
        (card) => card.scope === from.scope && card !== from && card !== to,
      )
      reserveTracks(from, to, e.wireLayout, count, obstacles, tracksByScope.get(from.scope))
    } else {
      const start = { LR: 'right', RL: 'left', TD: 'bottom', BT: 'top' }[dir]
      e.wireLayout = { ...(e.wireLayout?.label ? { label: e.wireLayout.label } : {}), start }
    }
  }
}
