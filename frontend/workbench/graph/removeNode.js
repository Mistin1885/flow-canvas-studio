import { sheetFor } from '../diagram/visibleGraph.js'
import { flowKey, groupKey } from '../frames/membership.js'

function removeGraphNode(graph, id) {
  const members = new Map(
    (graph.subflows || []).map((s) => [
      s.id,
      Object.keys(graph.nodes).filter((k) => k !== id && sheetFor(k) === s.id),
    ]),
  )
  delete graph.nodes[id]
  for (const n of Object.values(graph.nodes))
    if (n.frameMembers) n.frameMembers = n.frameMembers.filter((k) => k !== id)
  for (const r of [...(graph.layoutGroups || []), ...(graph.subflows || [])])
    if (r.memberOrder) r.memberOrder = r.memberOrder.filter((k) => k !== id)
  graph.edges = graph.edges.filter((e) => e.from !== id && e.to !== id)
  if (graph.navigation) graph.navigation = graph.navigation.filter((k) => k !== id)
  if (graph.subflows)
    graph.subflows = graph.subflows.filter((s) => {
      if (s.parent === id || !members.get(s.id).length) {
        for (const k of members.get(s.id)) graph.nodes[k].sheetId = 'project'
        for (const n of Object.values(graph.nodes)) if (n.subflowId === s.id) delete n.subflowId
        return false
      }
      if (s.root === id) s.root = members.get(s.id)[0]
      return true
    })
  if (graph.groupLinks) {
    const available = new Set([
      ...Object.keys(graph.nodes),
      ...(graph.subflows || []).map((f) => flowKey(f.id)),
      ...Object.values(graph.nodes).map((n) => groupKey(n.group)),
      ...(graph.layoutGroups || []).map((g) => groupKey(g.name)),
    ])
    graph.groupLinks = graph.groupLinks.filter((e) => available.has(e.from) && available.has(e.to))
  }
  for (const item of [...Object.values(graph.nodes), ...graph.edges]) {
    if (item.jumpTo === id) {
      if (item.type === 'return') item.type = 'note'
      delete item.jumpTo
      delete item.jumpScope
    }
    if (item.jumpScope === id) delete item.jumpScope
    if (item.resume === id) delete item.resume
    if (item.fallback) item.fallback = item.fallback.filter((k) => k !== id)
    if (item.scopeOverrides) {
      delete item.scopeOverrides[id]
      for (const patch of Object.values(item.scopeOverrides)) {
        if (patch.to === id) delete patch.to
        if (patch.resume === id) delete patch.resume
      }
    }
  }
  for (const review of graph.review || []) {
    if (review.resolution?.from === id || review.resolution?.to === id) {
      review.resolved = false
      delete review.resolution
    }
  }
  return graph
}

export { removeGraphNode }
