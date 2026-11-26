// Both edge editors change connector identity here. Geometry tied to the previous
// endpoints is discarded, while the explicitly selected attachment faces survive.
export function updateEdge(edge, { from, to, kind, label }) {
  const moved = edge.from !== from || edge.to !== to
  if (moved || edge.label !== label || edge.kind !== kind) {
    if (edge.sourceAnnotationIds) {
      edge.originalSourceAnnotationIds = edge.sourceAnnotationIds
      delete edge.sourceAnnotationIds
    }
    edge.labelStatus = 'user_edited'
  }
  if (moved) {
    delete edge.drawingRoute
    delete edge.reviewedConnectorId
    const layout = edge.wireLayout
    if (layout) {
      const sides = {}
      if (layout.start) sides.start = layout.start
      if (layout.end) sides.end = layout.end
      if (Object.keys(sides).length) edge.wireLayout = sides
      else delete edge.wireLayout
    }
  }
  Object.assign(edge, { from, to, kind, label })
}

// A review confirms the recorded endpoint pair. A connector created by the
// review must also be the same reviewed edge, even when parallel edges exist.
export function reconcileEdgeReviews(graph) {
  for (const review of graph.review || []) {
    if (!review.resolved || !review.resolution) continue
    const { from, to, added } = review.resolution
    const confirmed = graph.edges.some(edge => edge.from === from && edge.to === to &&
      (!added || edge.reviewedConnectorId === review.id))
    if (!confirmed) {
      review.resolved = false
      delete review.resolution
    }
  }
}

// Move the existing record between collections when an endpoint changes from
// a node to a group handle (or back). All writes are to the caller's draft.
export function editConnection(graph, original, old, from, to, label) {
  if (!from || !to || (from === to && !(old?.from === from && old.to === to)))
    throw Error('請選擇兩個不同的端點。')
  const field = graph.nodes[from] && graph.nodes[to] ? 'edges' : 'groupLinks'
  const source = old && original.edges.includes(old) ? 'edges' : 'groupLinks'
  let edge = { from, to, kind: 'next', dashed: false, label: '' }
  let index = (graph[field] || []).length
  if (old) {
    const pos = original[source]?.indexOf(old) ?? -1
    if (pos < 0) throw Error('連線已更新，請重新選取。')
    edge = graph[source].splice(pos, 1)[0]
    if (source === field) index = pos
  }
  updateEdge(edge, { from, to, kind: field === 'edges' ? edge.kind || 'next' : edge.kind, label })
  for (const key of [from, to])
    if (key.startsWith('group:') && !graph.layoutGroups?.some(r => r.name === key.slice(6)))
      (graph.layoutGroups ??= []).push({ name: key.slice(6), direction: 'auto' })
  const destination = graph[field] ??= []
  destination.splice(index, 0, edge)
  reconcileEdgeReviews(graph)
  return { field, index, edge }
}
