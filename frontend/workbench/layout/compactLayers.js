// Lay out each connected component independently. Packing their bounding boxes
// afterwards avoids turning unrelated flows into one very tall first rank.
import Dagre from '../vendor/dagre.js'
import { edgeLabelLines } from './labels.js'

export function compactLayers(cards, edges, direction) {
  const g = new Dagre.Graph({ multigraph: true })
  const byId = new Map(cards.map((c) => [c.id, c]))
  for (const card of cards) g.setNode(card.id, { width: card.w, height: card.h })
  edges.forEach((edge, i) => {
    if (edge.from === edge.to || !byId.has(edge.from) || !byId.has(edge.to)) return
    const lines = edgeLabelLines(edge.label || '', 156)
    g.setEdge(
      edge.from,
      edge.to,
      {
        weight: edge.kind === 'return' || edge.kind === 'retry' ? 1 : 5,
        width: Math.max(0, ...lines.map((line) => Math.min(156, line.length * 8 + 12))),
        height: lines.length ? lines.length * 16 + 8 : 0,
      },
      String(i),
    )
  })
  const seen = new Set(),
    components = []
  for (const { id } of cards) {
    if (seen.has(id)) continue
    const ids = [id]
    seen.add(id)
    for (const key of ids)
      for (const neighbor of g.neighbors(key)) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor)
          ids.push(neighbor)
        }
      }
    const members = new Set(ids)
    const sub = g.filterNodes((key) => members.has(key))
    sub.setGraph({
      rankdir: direction === 'TD' ? 'TB' : direction,
      ranker: 'network-simplex',
      acyclicer: 'greedy',
      ranksep: 46,
      nodesep: 30,
      edgesep: 16,
      marginx: 0,
      marginy: 0,
    })
    Dagre.layout(sub)
    components.push({ sub, ids, w: sub.graph().width, h: sub.graph().height })
  }
  components.sort((a, b) => b.ids.length - a.ids.length || b.h - a.h)
  const gap = 44,
    area = components.reduce((sum, c) => sum + (c.w + gap) * (c.h + gap), 0)
  const limit = Math.max(0, ...components.map((c) => c.w), Math.sqrt(area * 1.6))
  let x = 0,
    y = 0,
    row = 0,
    width = 0
  const positions = new Map()
  for (const { sub, ids, w, h } of components) {
    if (x && x + w > limit) {
      x = 0
      y += row + gap
      row = 0
    }
    for (const id of ids) {
      const n = sub.node(id)
      positions.set(id, { x: x + n.x - n.width / 2, y: y + n.y - n.height / 2 })
    }
    width = Math.max(width, x + w)
    x += w + gap
    row = Math.max(row, h)
  }
  return { positions, w: width, h: y + row }
}
