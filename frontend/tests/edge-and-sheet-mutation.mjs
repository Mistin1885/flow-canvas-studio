import assert from 'node:assert/strict'
import { test } from 'node:test'
import { updateEdge, reconcileEdgeReviews } from '../workbench/graph/edgeMutation.js'
import { moveToSheet } from '../workbench/graph/nodeSheet.js'
import { applyEdgeEdits } from '../workbench/editing/saveEdges.js'

function reviewedGraph() {
  return {
    edges: [{
      from: 'A', to: 'B', kind: 'next', label: '', reviewedConnectorId: 'review-1',
      drawingRoute: { from: 'A', to: 'B', points: [[0, 0], [0, 50]] },
      wireLayout: { start: 'bottom', end: 'top', lanes: [{ axis: 'x', at: 8 }], label: { x: 6, y: 1 } },
      sourceAnnotationIds: ['ann'],
    }],
    review: [{ id: 'review-1', resolved: true, resolution: { from: 'A', to: 'B', added: true } }],
  }
}

test('retargeting in either form preserves manual faces and invalidates the old route and review', () => {
  const line = reviewedGraph(), node = reviewedGraph()
  const edits = { from: 'A', to: 'C', kind: 'next', label: 'done' }
  updateEdge(line.edges[0], edits)
  reconcileEdgeReviews(line)
  applyEdgeEdits(node, 'A', { edges: [{ original: node.edges[0], ...edits }], incoming: [] })
  assert.deepEqual(node, line)
  assert.deepEqual(node.edges[0], {
    ...edits, wireLayout: { start: 'bottom', end: 'top' }, labelStatus: 'user_edited',
    originalSourceAnnotationIds: ['ann'],
  })
  assert.deepEqual(node.review, [{ id: 'review-1', resolved: false }])
})

test('a label edit retains geometry and confirmation, including when parallel links exist', () => {
  const g = reviewedGraph(), e = g.edges[0], layout = e.wireLayout
  updateEdge(e, { ...e, label: 'pass' })
  reconcileEdgeReviews(g)
  assert.equal(e.wireLayout, layout)
  assert.equal(e.reviewedConnectorId, 'review-1')
  assert.equal(g.review[0].resolved, true)
  g.edges.push({ from: 'A', to: 'B', kind: 'next', label: 'alternate' })
  g.review.push({ id: 'review-2', resolved: true, resolution: { from: 'A', to: 'B', added: false } })
  updateEdge(e, { ...e, from: 'C' })
  reconcileEdgeReviews(g)
  assert.deepEqual(g.review.map(r => r.resolved), [false, true])
})

test('in-sheet reorders keep placement and actual sheet changes clear local placement data', () => {
  const n = { id: 'Step', sheetId: 'F', layoutPosition: { x: 20, y: -45 }, layoutOrder: 3,
    layoutOffset: { x: 8, y: 10 }, drawingBox: [0, 0, 50, 70] }
  const original = structuredClone(n)
  moveToSheet(n, 'F', 'F')
  assert.deepEqual(n, original)
  moveToSheet(n, 'F', 'project')
  assert.deepEqual(n, { id: 'Step', sheetId: 'project', drawingBox: original.drawingBox })
})
