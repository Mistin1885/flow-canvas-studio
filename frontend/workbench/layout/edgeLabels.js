import { isFrameNode } from '../graph/nodeTypes.js'
import { diagramState } from '../diagram/state.js'

import { graphModel } from '../graph/model.js'
import { segmentHitsBox } from './routing.js'

function placeEdgeLabels() {
  const cards = diagramState.instances.filter((i) => !isFrameNode(graphModel.nodes[i.id]))
  const labelBoxes = []
  const frameBorders = []
  for (const i of diagramState.instances) {
    const f = i.inlineFlow || (isFrameNode(graphModel.nodes[i.id]) ? i : null)
    if (!f) continue
    const t = 3 * diagramState.readingScale
    frameBorders.push(
      { x: f.x - t, y: f.y - t, w: f.w + 2 * t, h: 2 * t },
      { x: f.x - t, y: f.y + f.h - t, w: f.w + 2 * t, h: 2 * t },
      { x: f.x - t, y: f.y, w: 2 * t, h: f.h },
      { x: f.x + f.w - t, y: f.y, w: 2 * t, h: f.h },
    )
  }

  const views = diagramState.edgeViews.filter((v) => v.label)
  const segments = diagramState.graphLinks.flatMap((link) =>
    link.points.slice(1).map((v, k) => {
      const u = link.points[k]
      return {
        link,
        u,
        v,
        left: Math.min(u.x, v.x),
        right: Math.max(u.x, v.x),
        top: Math.min(u.y, v.y),
        bottom: Math.max(u.y, v.y),
      }
    }),
  )
  // Read actual SVG text metrics in one pass, before writing any label positions.
  for (const view of views) {
    const widths = [...view.label.querySelectorAll('tspan')].map((t) => t.getComputedTextLength())
    view.link.labelWidth = Math.ceil(Math.max(...widths)) + 16
  }
  for (const view of views) {
    const l = view.link
    const shapes = cards
    // Try both sides of each segment. Prefer staying close to the wire while
    // keeping the label away from cards, earlier labels and unrelated wires.
    const pad = 6 * diagramState.readingScale
    const obstacles = [
      ...shapes.map((i) => ({ x: i.x - pad, y: i.y - pad, w: i.w + 2 * pad, h: i.h + 2 * pad })),
      ...labelBoxes,
      ...frameBorders,
    ]
    const w = l.labelWidth,
      h = l.labelHeight
    let best = null
    for (let k = 1; k < l.points.length; k++) {
      const u = l.points[k - 1],
        v = l.points[k],
        length = Math.hypot(v.x - u.x, v.y - u.y)
      if (length < 1) continue
      const vertical = Math.abs(v.y - u.y) > Math.abs(v.x - u.x)
      for (const t of [0.5, 0.28, 0.72, 0.15, 0.85]) {
        for (const side of [0, -1, 1]) {
          const x = u.x + (v.x - u.x) * t - w / 2 + (vertical ? side * (w / 2 + 5) : 0)
          const y = u.y + (v.y - u.y) * t - h / 2 + (vertical ? 0 : side * (h / 2 + 5))
          const r = { x, y, w, h },
            hits = obstacles.filter(
              (o) => x < o.x + o.w && x + w > o.x && y < o.y + o.h && y + h > o.y,
            ).length
          const wires = segments.reduce(
            (n, s) =>
              s.link !== l &&
              x < s.right &&
              x + w > s.left &&
              y < s.bottom &&
              y + h > s.top &&
              segmentHitsBox(s.u, s.v, r)
                ? n + 1
                : n,
            0,
          )
          const score =
            hits * 1e6 +
            wires * 160 +
            (side ? 12 : 0) +
            Math.abs(t - 0.5) * 14 +
            Math.max(0, (vertical ? h : w) + 16 - length) * 2 -
            Math.min(length, 550) / 150
          if (!best || score < best.score) best = { ...r, score }
        }
      }
    }
    if (best) {
      l.labelX = best.x
      l.labelY = best.y
      labelBoxes.push(best)
      const rect = view.label.querySelector('rect'),
        text = view.label.querySelector('text')
      rect.setAttribute('x', best.x)
      rect.setAttribute('y', best.y)
      rect.setAttribute('width', w)
      text.setAttribute('x', best.x + 8)
      text.setAttribute('y', best.y + 17 * diagramState.readingScale)
      for (const t of text.children) t.setAttribute('x', best.x + 8)
    }
  }
}

export { placeEdgeLabels }
