import { facePort, facingSide } from './dockPoints.js'

export function cardCenter(card) {
  return { x: card.x + card.w / 2, y: card.y + card.h / 2 }
}

// The guide and both docks use the same measured rectangles. A fixed side,
// ratio or lane can require a bend even when the cards themselves line up.
export function centerConnection(from, to, layout = {}) {
  if (from === to || layout.lanes) return
  const a = cardCenter(from), b = cardCenter(to)
  const horizontal = Math.abs(a.y - b.y) < 1e-7
  if (!horizontal && Math.abs(a.x - b.x) >= 1e-7) return
  const axis = horizontal ? 'y' : 'x', along = horizontal ? 'x' : 'y'
  const length = horizontal ? 'w' : 'h'
  if (Math.abs(b[along] - a[along]) <= (from[length] + to[length]) / 2) return
  const faces = [facingSide(from, to), facingSide(to, from)]
  if ((layout.start && layout.start !== faces[0]) || (layout.end && layout.end !== faces[1])) return
  const start = facePort(from, faces[0], 0, layout.startRatio).point
  const end = facePort(to, faces[1], 0, layout.endRatio).point
  if (Math.abs(start[axis] - end[axis]) > 1e-7) return
  return { faces, points: [start, { ...end, [axis]: start[axis] }] }
}
