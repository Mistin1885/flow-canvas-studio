import { facePort, facingSide } from './dockPoints.js'

const sides = ['left', 'right', 'top', 'bottom']

function worksheetSide(box, point, adjacent) {
  if (!point || !box) return
  const [x, y, w, h] = box,
    [px, py] = point
  const distances = [Math.abs(px - x), Math.abs(px - x - w), Math.abs(py - y), Math.abs(py - y - h)]
  let side = distances.indexOf(Math.min(...distances))
  // Some Excel endpoints terminate just outside a corner. Follow the drawn
  // final leg there so a horizontal arrow still meets a vertical card face.
  if (adjacent && (px < x || px > x + w) && (py < y || py > y + h)) {
    const dx = adjacent[0] - px,
      dy = adjacent[1] - py
    const toward = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : dy < 0 ? 2 : 3
    if (distances[toward] <= distances[side] + 18) side = toward
  }
  return sides[side]
}

// Imported connectors supply a face. Only an explicitly saved ratio can move
// an endpoint away from that face's midpoint, regardless of the branch count.
export function linkPorts(from, to, layout = {}, raw, fromBox, toBox, spacing) {
  const start = layout.start || worksheetSide(fromBox, raw?.[0], raw?.[1]) || facingSide(from, to)
  let end = layout.end || worksheetSide(toBox, raw?.at(-1), raw?.at(-2)) || facingSide(to, from)
  let first = start
  if (from === to && start === end && (layout.startRatio ?? 0.5) === (layout.endRatio ?? 0.5)) {
    const adjacent = start === 'left' || start === 'right' ? 'bottom' : 'right'
    if (!layout.end) end = adjacent
    else if (!layout.start) first = adjacent
  }
  function port(card, side, ratio) {
    const { point: at, stub } = facePort(card, side, spacing, ratio)
    return { side: sides.indexOf(side), at, stub }
  }
  return [port(from, first, layout.startRatio), port(to, end, layout.endRatio)]
}
