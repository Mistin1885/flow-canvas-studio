// Collapse a forward/backward/forward jog between parallel entry and exit
// segments. Keep the first turn (often shared by branches) when both lanes fit.
export function removeBacktracks(points, accepts) {
  let path = points
  for (let i = 0; i + 5 < path.length; i++) {
    const [a, b, c, d, e, f] = path.slice(i, i + 6)
    const along = a.y === b.y ? 'x' : 'y'
    const cross = along === 'x' ? 'y' : 'x'
    if (a[cross] !== b[cross] || b[along] !== c[along] || c[cross] !== d[cross] ||
        d[along] !== e[along] || e[cross] !== f[cross]) continue
    const direction = Math.sign(b[along] - a[along])
    if ((d[along] - c[along]) * direction >= 0 || (f[along] - e[along]) * direction <= 0 ||
        (c[cross] - b[cross]) * (e[cross] - d[cross]) <= 0) continue
    for (const lane of [b[along], e[along]]) {
      if ((lane - a[along]) * direction <= 0 || (f[along] - lane) * direction <= 0) continue
      const first = { ...a, [along]: lane }, last = { ...f, [along]: lane }
      if (!accepts([a, first, last, f], [a, b, c, d, e, f])) continue
      if (path === points) path = points.slice()
      path.splice(i + 1, 4, first, last)
      i = Math.max(-1, i - 4)
      break
    }
  }
  return path
}
