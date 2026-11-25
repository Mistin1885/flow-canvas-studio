import { orthogonalPoints } from '../layout/polyline.js'

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
  const route = orthogonalPoints(points)
  for (let i = 1; i < route.length; i++) {
    const b = route[i]
    if (a.x !== b.x) d += ' H' + b.x
    else if (a.y !== b.y) d += ' V' + b.y
    a = b
  }
  return d
}

export { ancestors, rightAnglePath }
