import { cardCenter } from './cardCenters.js'
import { snappedDisplacement } from './nodePlacement.js'

const snapPixels = 8
const neighborGapPixels = 240

export function centerPeers(item, stationary, connected) {
  return stationary.filter(peer => peer.scope === item.scope).map(peer => ({
    center: cardCenter(peer), w: peer.w, h: peer.h, connected: connected.has(peer),
  }))
}

export function alignNodeDrag(item, dx, dy, scale, zoom, peers) {
  const delta = snappedDisplacement(item, dx, dy, scale, zoom)
  const raw = { x: dx / zoom, y: dy / zoom }, source = cardCenter(item)
  const guides = []
  for (const axis of ['x', 'y']) {
    const along = axis === 'x' ? 'y' : 'x', length = along === 'x' ? 'w' : 'h'
    let best
    for (const peer of peers) {
      const target = peer.center
      const offset = target[axis] - source[axis]
      const error = Math.abs(offset - raw[axis]) * zoom
      if (error > snapPixels) continue
      const run = target[along] - source[along] - raw[along]
      const gap = Math.abs(run) - (item[length] + peer[length]) / 2
      if (gap < 0 || (!peer.connected && gap * zoom > neighborGapPixels)) continue
      if (best && best.connected !== peer.connected) {
        if (best.connected) continue
      } else if (best && (error > best.error || (error === best.error && gap >= best.gap))) continue
      best = { axis, along, source, target, offset, error, gap, connected: peer.connected, direction: Math.sign(run) }
    }
    if (best) {
      guides.push(best)
      delta[axis] = best.offset
    }
  }
  return { delta, guides }
}
