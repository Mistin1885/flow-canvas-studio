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
