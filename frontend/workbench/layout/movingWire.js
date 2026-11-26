import { orthogonalPoints, simplifyWire } from './polyline.js'

// Interpolate the coordinate of each run, then intersect neighboring runs.
// Moving the two ends of a vertical run independently would draw a staircase.
export function movingWirePoints(points, from, to) {
  const shift = (p, d) => ({ x: p.x + d.x, y: p.y + d.y })
  if (from.x === to.x && from.y === to.y)
    return from.x || from.y ? points.map(p => shift(p, from)) : points
  const path = simplifyWire(orthogonalPoints(points))
  if (path.length < 2) return path
  const start = shift(path[0], from), end = shift(path.at(-1), to)
  if (path.length === 2) {
    const along = path[0].y === path[1].y ? 'x' : 'y'
    const middle = (start[along] + end[along]) / 2
    return simplifyWire([start, { ...start, [along]: middle }, { ...end, [along]: middle }, end])
  }
  const result = [start]
  let previous = start
  for (let i = 0; i < path.length - 1; i++) {
    const axis = path[i].x === path[i + 1].x ? 'x' : 'y'
    const t = i / (path.length - 2)
    const at = path[i][axis] + from[axis] * (1 - t) + to[axis] * t
    previous = { ...previous, [axis]: at }
    if (i) result.push(previous)
  }
  result.push(end)
  return result
}
