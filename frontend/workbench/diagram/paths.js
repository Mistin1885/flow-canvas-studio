function ancestors(i) {
  const out = new Set(),
    visit = (n) => {
      if (!n || out.has(n.key)) return
      out.add(n.key)
      for (const link of n.incoming || []) visit(link.from)
    }
  visit(i)
  return [...out]
}

// Only H and V commands are emitted, including during interpolation and pointer drags.
function rightAnglePath(points) {
  if (!points.length) return ''
  let a = points[0],
    d = 'M' + a.x + ' ' + a.y
  for (const b of points.slice(1)) {
    if (a.x !== b.x && a.y !== b.y) {
      if (Math.abs(b.x - a.x) >= Math.abs(b.y - a.y))
        d += ' H' + (a.x + b.x) / 2 + ' V' + b.y + ' H' + b.x
      else d += ' V' + (a.y + b.y) / 2 + ' H' + b.x + ' V' + b.y
    } else if (a.x !== b.x) d += ' H' + b.x
    else if (a.y !== b.y) d += ' V' + b.y
    a = b
  }
  return d
}

export { ancestors, rightAnglePath }
