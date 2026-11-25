// Expand diagonal transitions once for both SVG drawing and pointer hit testing.
// Already orthogonal routes pass through without allocating another point array.
export function orthogonalPoints(points) {
  let expanded
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    if (a.x !== b.x && a.y !== b.y) {
      expanded ??= points.slice(0, i)
      if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y)) {
        const x = (a.x + b.x) / 2
        expanded.push({ x, y: a.y }, { x, y: b.y })
      } else {
        const y = (a.y + b.y) / 2
        expanded.push({ x: a.x, y }, { x: b.x, y })
      }
    }
    expanded?.push(b)
  }
  return expanded ?? points
}

function simplifyWire(points) {
  const result = []
  for (const p of points) {
    const v = result.at(-1)
    if (v && Math.abs(p.x - v.x) < 0.01 && Math.abs(p.y - v.y) < 0.01) continue
    const u = result.at(-2)
    if (
      u &&
      ((u.x === v.x && v.x === p.x && (v.y - u.y) * (p.y - v.y) >= 0) ||
        (u.y === v.y && v.y === p.y && (v.x - u.x) * (p.x - v.x) >= 0))
    )
      result.pop()
    result.push(p)
  }
  return result
}

export { simplifyWire }
