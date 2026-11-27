import assert from 'node:assert/strict'
import { test } from 'node:test'

const priorDocument = globalThis.document
// Only the initial graph script is needed; this suite exercises draft data, not DOM behavior.
globalThis.document = { getElementById: () => ({ textContent: '{"nodes":{},"edges":[]}' }) }
const { setFormBaseline } = await import('../workbench/editing/formSource.js')
const { typeDraftGraph, restoreTypeEdits, stageTypeEdit, applyTypeEdits } = await import('../workbench/modeling/nodeTypeDraft.js')
const draft = await import('../workbench/modeling/nodeTypeDraft.js')
globalThis.document = priorDocument

const fixture = () => ({ nodes: { A: { id: 'A', type: 'action', customType: 'type-check',
  content: [{ type: 'text', value: 'Keep' }], nodeStyle: { edge: '#123456' } } }, edges: [],
  nodeTypeDefinitions: [{ id: 'type-check', name: 'Check', baseType: 'action', nodeStyle: { edge: '#abcdef' } }] })

test('staged rename and creation survive draft serialization without changing the baseline', () => {
  const graph = fixture(), before = structuredClone(graph)
  setFormBaseline({ graph }); restoreTypeEdits()
  stageTypeEdit({ definition: { ...graph.nodeTypeDefinitions[0], name: 'Inspection' } })
  stageTypeEdit({ definition: { id: 'type-retry', name: 'Return for review', baseType: 'return' } })
  const saved = JSON.parse(JSON.stringify(draft.typeEdits))
  restoreTypeEdits(); assert.deepEqual(typeDraftGraph(), before)
  restoreTypeEdits(saved)
  assert.equal(typeDraftGraph().nodeTypeDefinitions[0].name, 'Inspection')
  assert.equal(typeDraftGraph().nodeTypeDefinitions[1].baseType, 'return')
  const next = structuredClone(graph); applyTypeEdits(next)
  assert.deepEqual(next, typeDraftGraph())
  assert.deepEqual(graph, before)
  assert.deepEqual(next.nodes, graph.nodes)
})

test('discarding a staged removal restores assignments and shared styles', () => {
  const graph = fixture(), before = structuredClone(graph)
  setFormBaseline({ graph }); restoreTypeEdits()
  stageTypeEdit({ remove: 'type-check' })
  const saved = JSON.parse(JSON.stringify(draft.typeEdits))
  restoreTypeEdits(saved)
  assert.equal(typeDraftGraph().nodes.A.customType, undefined)
  assert.deepEqual(typeDraftGraph().nodes.A.nodeStyle, before.nodes.A.nodeStyle)
  restoreTypeEdits()
  assert.deepEqual(typeDraftGraph(), before)
  assert.deepEqual(draft.typeEdits, [])
})

test('invalid edits cannot alter an existing private draft', () => {
  const graph = fixture()
  setFormBaseline({ graph }); restoreTypeEdits()
  stageTypeEdit({ definition: { id: 'type-new', name: 'New type', baseType: 'action' } })
  const before = structuredClone(typeDraftGraph()), edits = structuredClone(draft.typeEdits)
  assert.throws(() => stageTypeEdit({ definition: { id: 'type-invalid', name: 'Check', baseType: 'action' } }))
  assert.deepEqual(typeDraftGraph(), before)
  assert.deepEqual(draft.typeEdits, edits)
})
