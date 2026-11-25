export function applyEdgeEdits(graph, id, form, parent) {
  const edits = new Map(), added = []
  const key = e => JSON.stringify([e.from, e.to, e.kind, e.label])
  for (const row of form.edges) {
    const original = row.original
    const e = { ...original, from: id, to: row.to, kind: row.kind, label: row.label }
    if (original.to !== e.to) delete e.wireLayout
    if (row.label !== original.label) e.label = row.label.trim()
    if (original.label !== e.label || original.to !== e.to || original.kind !== e.kind) {
      if (e.sourceAnnotationIds) {
        e.originalSourceAnnotationIds = e.sourceAnnotationIds
        delete e.sourceAnnotationIds
      }
      e.labelStatus = 'user_edited'
    }
    if (e.to === '$caller' && row.fallbackText !== (original.fallback || []).join(', '))
      e.fallback = row.fallbackText.split(',').map(x => x.trim()).filter(Boolean)
    if (original.to === '$caller' && e.to !== '$caller') delete e.fallback
    if (original.to) edits.set(key(original), e)
    else added.push(e)
  }
  graph.edges = graph.edges.flatMap(edge => {
    if (edge.from !== id || edge.kind === 'spine') return [edge]
    const edited = edits.get(key(edge))
    return edited ? [edited] : []
  }).concat(added)
  if (parent)
    graph.edges.push({ from: parent, to: id, label: '', kind: 'next', dashed: false })
  for (const [from, label] of form.incoming)
    graph.edges.push({
      from,
      to: id,
      label: label.trim(),
      kind: 'next',
      dashed: false,
    })
  for (const r of graph.review || []) {
    if (!r.resolved || !r.resolution) continue
    const edge = r.resolution.added
      ? graph.edges.find((e) => e.reviewedConnectorId === r.id)
      : graph.edges.find((e) => e.from === r.resolution.from && e.to === r.resolution.to)
    if (edge) {
      r.resolution.from = edge.from
      r.resolution.to = edge.to
    } else {
      r.resolved = false
      delete r.resolution
    }
  }
}
