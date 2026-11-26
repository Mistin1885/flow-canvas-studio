import { edgeKey, type Graph, type Link, type Snapshot } from '../api'
import { suggestIdForNode } from '../../workbench/graph/nodeIds.js'
import type { Draft } from './draftMerge'

// A node form creates one node and may add incoming or outgoing links. Only rewrite
// those new records. Imported graphs and edits to existing nodes use normal review.
export function resolveCreation(draft: Draft, latest: Snapshot) {
  const id = draft.createdNode
  if (!draft.confirmedConflict || !id || !Object.hasOwn(latest.graph.nodes, id)) return { draft }
  const mine = draft.graph.nodes[id]
  const replacement = suggestIdForNode(mine, { ...latest.graph.nodes, ...draft.graph.nodes })
  const node = { ...mine, id: replacement }
  const nodes: Graph['nodes'] = { ...draft.graph.nodes, [replacement]: node }
  delete nodes[id]
  const links = new Map<string, Link>()
  const ops = draft.ops.map(op => {
    if (op.table === 'nodes' && op.key === id) return { ...op, key: replacement, value: node }
    if (op.table !== 'edges' || op.version !== null || op.remove) return op
    const edge = op.value as Link
    if (edge.to !== id && edge.from !== id) return op
    const rewritten = { ...edge, to: edge.to === id ? replacement : edge.to,
      from: edge.from === id ? replacement : edge.from }
    links.set(op.key, rewritten)
    return { ...op, key: edgeKey(rewritten), value: rewritten }
  })
  const edges = draft.graph.edges.map(edge => links.get(edgeKey(edge)) ?? edge)
  return { replacement, draft: { ...draft, graph: { ...draft.graph, nodes, edges }, ops } }
}
