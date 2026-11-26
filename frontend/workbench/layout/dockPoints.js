const normals = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }
export const dockSides = Object.keys(normals)
export const portSnapRadius = 6

export function facingSide(card, other) {
  const dx = other.x + other.w / 2 - card.x - card.w / 2
  const dy = other.y + other.h / 2 - card.y - card.h / 2
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right'
  return dy < 0 ? 'top' : 'bottom'
}

export function facePort(card, side, spacing, ratio = 0.5) {
  const [dx, dy] = normals[side]
  const point = {
    x: card.x + card.w * (dx ? (dx + 1) / 2 : ratio),
    y: card.y + card.h * (dy ? (dy + 1) / 2 : ratio),
  }
  return { point, stub: extendPort(point, side, spacing) }
}

export function extendPort(point, side, spacing) {
  const [dx, dy] = normals[side]
  return { x: point.x + dx * spacing, y: point.y + dy * spacing }
}

export function nearestFace(card, p) {
  const dx = p.x - card.x, dy = p.y - card.y
  const outsideX = Math.max(-dx, dx - card.w), outsideY = Math.max(-dy, dy - card.h)
  if (Math.max(outsideX, outsideY) > 0) {
    if (outsideX > outsideY) return dx < 0 ? 'left' : 'right'
    return dy < 0 ? 'top' : 'bottom'
  }
  const distances = [Math.abs(dy), Math.abs(dx - card.w), Math.abs(dy - card.h), Math.abs(dx)]
  return dockSides[distances.indexOf(Math.min(...distances))]
}

// Align only the ports. The cards and their stored coordinates stay in place.
export function nearStraightRoute(from, to, points, scale, layout) {
  if (from === to || points.length < 2) return
  const a = points[0], b = points.at(-1)
  const side = nearestFace(from, a), otherSide = nearestFace(to, b)
  const [dx, dy] = normals[side], [ex, ey] = normals[otherSide]
  if (dx !== -ex || dy !== -ey) return
  const along = dx ? 'x' : 'y', across = dx ? 'y' : 'x', direction = dx || dy
  if ((b[along] - a[along]) * direction <= 0) return
  const tolerance = 2 * portSnapRadius * scale
  if (Math.abs(a[across] - b[across]) > tolerance) return
  const pinnedStart = layout?.startRatio !== undefined, pinnedEnd = layout?.endRatio !== undefined
  if (pinnedStart && pinnedEnd && a[across] !== b[across]) return
  const at = pinnedStart ? a[across] : pinnedEnd ? b[across] : (a[across] + b[across]) / 2
  const dimension = dx ? 'h' : 'w'
  for (const card of [from, to]) {
    const inset = Math.min(4 * scale, card[dimension] / 4)
    if (at < card[across] + inset || at > card[across] + card[dimension] - inset) return
  }
  // Keep purposeful worksheet detours outside the narrow corridor, and paths
  // which double back to reach a dock on the other side of an obstacle.
  if (points.some((p, i) => Math.abs(p[across] - at) > tolerance / 2 ||
      (i && (p[along] - points[i - 1][along]) * direction < -0.01))) return
  return [{ ...a, [across]: at }, { ...b, [across]: at }]
}

// Run before automatic obstacle/track routing; authored lanes keep their original ports.
export function straightenAutomaticWire(from, to, points, scale, layout, accepts) {
  if (layout?.lanes || layout?.start || layout?.end || points.length < 2) return points
  if (points.length === 2 && (points[0].x === points[1].x || points[0].y === points[1].y)) return points
  const straight = nearStraightRoute(from, to, points, scale)
  return straight && accepts(straight) ? straight : points
}
