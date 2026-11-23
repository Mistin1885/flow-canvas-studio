import { isFrameNode } from '../graph/nodeTypes.js'
import { diagramState } from '../diagram/state.js'
import { graphModel } from '../graph/model.js'

import { positionFootprint } from './inlineFlows.js'
import { dockProjectLinks } from './ports.js'

// Stretch the worksheet grid only where a card needs extra room for its text.
// Interpolating the same grid for wire bends preserves workbook alignment.
function worksheetAxis(items, index, minSize) {
  const unit = diagramState.readingScale * 0.92
  const stops = new Map()
  for (const i of items) {
    const b = graphModel.nodes[i.id].drawingBox,
      a = b[index],
      z = a + b[index + 2]
    if (!stops.has(a)) stops.set(a, [])
    if (!stops.has(z)) stops.set(z, [])
    stops.get(z).push([a, minSize(i)])
  }
  const xs = [...stops.keys()].sort((a, b) => a - b),
    ys = new Map()
  xs.forEach((v, k) => {
    let out = k ? ys.get(xs[k - 1]) + (v - xs[k - 1]) * unit : 32
    for (const [a, gap] of stops.get(v)) out = Math.max(out, ys.get(a) + gap)
    ys.set(v, out)
  })
  return (v) => {
    let k = xs.findIndex((t) => t >= v)
    if (k < 0) k = xs.length - 1
    if (k === 0 || v >= xs.at(-1)) return ys.get(xs[k]) + (v - xs[k]) * unit
    const a = xs[k - 1],
      b = xs[k]
    return ys.get(a) + ((v - a) * (ys.get(b) - ys.get(a))) / (b - a)
  }
}

function workbookLayout(projectNodes, projectLinks) {
  const placed = projectNodes.filter((i) => graphModel.nodes[i.id].drawingBox)
  const parents = new Set((graphModel.document.subflows || []).map((sf) => sf.parent))
  const isFrame = (i) => isFrameNode(graphModel.nodes[i.id])
  const gap = 40 * diagramState.readingScale
  const mx = worksheetAxis(placed, 0, (i) => (i.inlineFlow ? i.inlineFlow.w + gap : 0))
  const my = worksheetAxis(placed, 1, (i) => (i.inlineFlow ? i.inlineFlow.h + gap : 0))
  const occupied = []
  function reserve(i, x, y) {
    const f = i.inlineFlow || i
    const touches = (px, py, o) =>
      px < o.x + o.w + gap - 0.01 &&
      px + f.w + gap > o.x + 0.01 &&
      py < o.y + o.h + gap - 0.01 &&
      py + f.h + gap > o.y + 0.01
    if (occupied.some((o) => touches(x, y, o))) {
      // Try nearby lanes first, keeping cards on the same worksheet row or column.
      const xs = [x],
        ys = [y]
      for (const o of occupied) {
        for (const a of [o.x - f.w - gap, o.x + o.w + gap])
          if (a >= 16 && Math.abs(a - x) < 460 * diagramState.readingScale) xs.push(a)
        if (o.y + o.h + gap >= y) ys.push(o.y + o.h + gap)
      }
      let best = null
      for (const px of xs)
        for (const py of ys) {
          const cost = Math.abs(px - x) + Math.abs(py - y) * 1.25
          if ((best && cost >= best.cost) || occupied.some((o) => touches(px, py, o))) continue
          best = { x: px, y: py, cost }
        }
      if (best) {
        x = best.x
        y = best.y
      }
    }
    positionFootprint(i, x, y)
    occupied.push(f)
  }
  const cards = placed
    .filter((i) => !isFrame(i))
    .map((i) => {
      const [x, y, w, h] = graphModel.nodes[i.id].drawingBox,
        f = i.inlineFlow || i
      return {
        i,
        x: (mx(x) + mx(x + w) - f.w) / 2,
        y: parents.has(i.id) ? my(y) + gap / 2 : (my(y) + my(y + h) - f.h) / 2,
      }
    })
  for (const c of cards.sort((a, b) => a.y - b.y || a.x - b.x)) reserve(c.i, c.x, c.y)
  for (const i of projectNodes.filter((i) => !graphModel.nodes[i.id].drawingBox)) {
    const parent = i.incoming.map((l) => l.from).find((n) => occupied.includes(n.inlineFlow || n))
    const f = parent && (parent.inlineFlow || parent)
    const next = i.children.find((n) => occupied.includes(n.inlineFlow || n)),
      target = next && (next.inlineFlow || next)
    reserve(
      i,
      f ? f.x + f.w + gap * 2 : target ? Math.max(16, target.x - i.w - gap * 2) : 32,
      f ? f.y : target ? target.y : 32,
    )
  }
  for (const i of placed.filter(isFrame)) {
    const [x, y, w, h] = graphModel.nodes[i.id].drawingBox
    const members = cards
      .filter(({ i: n }) => {
        const [a, b, c, d] = graphModel.nodes[n.id].drawingBox
        return a + c / 2 > x && a + c / 2 < x + w && b + d / 2 > y && b + d / 2 < y + h
      })
      .map(({ i: n }) => n.inlineFlow || n)
    if (members.length) {
      const pad = 18 * diagramState.readingScale
      i.x = Math.min(...members.map((n) => n.x)) - pad
      i.y = Math.min(...members.map((n) => n.y)) - pad - 24 * diagramState.readingScale
      i.w = Math.max(...members.map((n) => n.x + n.w)) + pad - i.x
      i.h = Math.max(...members.map((n) => n.y + n.h)) + pad - i.y
    } else {
      i.x = mx(x)
      i.y = my(y)
      i.w = mx(x + w) - i.x
      i.h = my(y + h) - i.y
    }
  }
  const footprints = projectNodes.map((i) => i.inlineFlow || i)
  diagramState.totalW = Math.max(...footprints.map((i) => i.x + i.w)) + 45
  diagramState.totalH = Math.max(...footprints.map((i) => i.y + i.h)) + 45
  dockProjectLinks(projectLinks, mx, my)
}

export { workbookLayout }
