import { default as T1Layout } from '../vendor/dagre.js'
import { edgeLabelLines } from './labels.js'
import { diagramState } from '../diagram/state.js'

function layoutGraph(nodes, links, direction = 'LR', reserveFlows = false) {
  const g = new T1Layout.Graph({ multigraph: true })
    .setGraph({
      rankdir: direction,
      ranksep: 70,
      nodesep: 42,
      edgesep: 24,
      marginx: 0,
      marginy: 12,
      ranker: 'network-simplex',
    })
    .setDefaultEdgeLabel(() => ({}))
  for (const i of nodes) {
    const box = (reserveFlows && i.inlineFlow) || i
    g.setNode(i.key, { width: box.w, height: box.h + (box.badgeTop || 0) + (box.badgeBottom || 0) })
  }
  for (const [k, l] of links.entries()) {
    l.lines = edgeLabelLines(l.edge.label || '')
    l.labelHeight = l.lines.length ? (l.lines.length * 16 + 10) * diagramState.readingScale : 0
    l.labelWidth = l.lines.length
      ? Math.min(240, Math.max(...l.lines.map((line) => line.length * 8)) + 16) *
        diagramState.readingScale
      : 0
    g.setEdge(
      l.from.key,
      l.to.key,
      { width: l.labelWidth, height: l.labelHeight, labelpos: 'c' },
      String(k),
    )
  }
  T1Layout.layout(g)
  for (const i of nodes) {
    const pos = g.node(i.key)
    i.x = pos.x - pos.width / 2
    i.y = pos.y - pos.height / 2 + (reserveFlows && i.inlineFlow ? 0 : (i.badgeTop || 0))
  }
  for (const [k, l] of links.entries()) {
    const pos = g.edge(l.from.key, l.to.key, String(k))
    l.points = pos.points
    l.labelX = pos.x - l.labelWidth / 2
    l.labelY = pos.y - l.labelHeight / 2
  }
  return g.graph()
}

export { layoutGraph }
