import { nearestFace } from './dockPoints.js'

const endpoints = [['start', 'from', 0], ['end', 'to', -1]]

export function collectDockGuides(view, routes) {
  const guides = { start: [], end: [] }
  for (const [key, card] of endpoints) {
    for (const { wireGeometry, wirePoints } of routes) {
      for (const [, peerCard, index] of endpoints) {
        if (wireGeometry?.[peerCard] === view[card])
          guides[key].push(wirePoints.at(index))
      }
    }
  }
  return guides
}

function sideAxis(side) {
  return side === 'left' || side === 'right' ? 'y' : 'x'
}

// A ratio keeps a manual dock attached to the same spot when a card moves or resizes.
export function placeDock(layout, key, card, side, cursor, peers, radius, onlySnap = false) {
  const axis = sideAxis(side), size = axis === 'x' ? card.w : card.h
  if (!size) return false
  let at = cursor[axis], distance = Infinity
  for (const point of peers) {
    if (nearestFace(card, point) !== side) continue
    const offset = Math.abs(point[axis] - cursor[axis])
    if (offset <= radius && offset < distance) {
      at = point[axis]
      distance = offset
    }
  }
  if (onlySnap && distance === Infinity) return false
  layout[key] = side
  layout[key + 'Ratio'] = Math.max(0, Math.min(1, (at - card[axis]) / size))
  return true
}

export function snapTerminalSegment(layout, view, points, index, delta, guides, radius) {
  let snapped = false
  for (const [key, card, tip] of endpoints) {
    if (index !== (key === 'start' ? 0 : points.length - 2)) continue
    const point = points.at(tip)
    const side = nearestFace(view[card], point), axis = sideAxis(side)
    if (points[index][axis] !== points[index + 1][axis]) continue
    const cursor = { ...point, [axis]: point[axis] + delta[axis] }
    if (placeDock(layout, key, view[card], side, cursor, guides[key], radius, true)) snapped = true
  }
  return snapped
}
