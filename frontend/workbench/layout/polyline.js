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
