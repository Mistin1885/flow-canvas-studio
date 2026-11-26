import { cardCenter, centerConnection } from './cardCenters.js'
import { clearRoute } from './routing.js'
import { overlapsAt } from './nodePlacement.js'

// Prefer the smallest displacement. On a tie keep the source in place.
// Try a compact gap as well, so an intervening card need not be moved.
export function straightConnection(from, to, obstacles, movable, scale = 1) {
  if (from === to) return
  let best
  for (const [item, fixed] of [
    [to, from],
    [from, to],
  ]) {
    const a = cardCenter(item),
      b = cardCenter(fixed)
    for (const [axis, cross, length] of [
      ['x', 'y', 'w'],
      ['y', 'x', 'h'],
    ]) {
      const sign = Math.sign(a[axis] - b[axis]) || (item === to ? 1 : -1)
      const gap = (item[length] + fixed[length]) / 2 + 32 * scale
      for (const run of [a[axis] - b[axis], sign * gap]) {
        const pos = {
          [axis]: item[axis] + b[axis] + run - a[axis],
          [cross]: item[cross] + b[cross] - a[cross],
        }
        const distance = Math.hypot(pos.x - item.x, pos.y - item.y)
        if ((best && distance >= best.distance) || (distance && !movable(item, pos))) continue
        if (distance && obstacles.some((box) => overlapsAt(item, pos, box))) continue
        const shifted = { ...item, ...pos }
        const line = item === from ? centerConnection(shifted, fixed) : centerConnection(fixed, shifted)
        if (line && clearRoute(line.points, obstacles))
          best = { item, pos, distance, faces: line.faces }
      }
    }
  }
  return best
}
