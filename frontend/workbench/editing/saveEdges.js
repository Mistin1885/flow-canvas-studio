import { reconcileEdgeReviews, updateEdge } from '../graph/edgeMutation.js'

export function applyEdgeEdits(graph, id, form, parent) {
  const edits = new Map(), added = []
  const key = e => JSON.stringify([e.from, e.to, e.kind, e.label])
  for (const row of form.edges) {
    const original = row.original
    const e = { ...original }
    const label = row.label === original.label ? row.label : row.label.trim()
    updateEdge(e, { from: id, to: row.to, kind: row.kind, label })
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
  reconcileEdgeReviews(graph)
}
