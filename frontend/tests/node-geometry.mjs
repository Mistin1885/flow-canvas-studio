import assert from 'node:assert/strict'
import { test } from 'node:test'
import { enclosingBounds, resizedBounds, validNodeSize } from '../workbench/layout/nodeGeometry.js'
import { pinDisplayedNodes, storeDisplayedPosition } from '../workbench/editing/nodePosition.js'
import { readGraph } from '../workbench/graph/readGraph.js'

test('frame bounds reserve margins, title room and badge rails without moving selected nodes', () => {
  const items = [{ x: 50, y: 100, w: 180, h: 70, badgeTop: 16 }, { x: 300, y: 200, w: 200, h: 90, badgeBottom: 12 }]
  const copy = structuredClone(items)
  const b = enclosingBounds(items)
  assert.deepEqual(b, { x: 26, y: 24, w: 498, h: 302 })
  assert.deepEqual(items, copy)
  const scaled = items.map(i => Object.fromEntries(Object.entries(i).map(([k,v]) => [k, v * 1.5])))
  assert.deepEqual(enclosingBounds(scaled, 1.5), Object.fromEntries(Object.entries(b).map(([k,v]) => [k,v*1.5])))
})

test('resizing keeps the opposite corner fixed at limits and under reading scaling', () => {
  const box = { x: 100, y: 200, w: 300, h: 180 }
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    const b = resizedBounds(box, corner, 55, -30)
    assert.equal(corner.includes('w') ? b.x + b.w : b.x, corner.includes('w') ? 400 : 100)
    assert.equal(corner.includes('n') ? b.y + b.h : b.y, corner.includes('n') ? 380 : 200)
    assert.ok(validNodeSize({ width: b.w, height: b.h }))
  }
  assert.deepEqual(resizedBounds(box, 'nw', 999, 999), { x: 320, y: 332, w: 80, h: 48 })
  assert.equal(resizedBounds(box, 'se', 9999999, 9999999, 1.5).w, 1500000)
})

test('pinning an inline step stores sheet-local coordinates and preserves its content and size', () => {
  const graph = { nodes: { A: { content: [{ type: 'text', value: 'Keep' }], layoutOffset: { x: 7, y: 8 }, layoutSize: { width: 200, height: 90 } } } }
  const item = { id: 'A', x: 450, y: 600, scopeOrigin: { x: 150, y: 300 } }
  pinDisplayedNodes(graph, [item], 1.5)
  assert.deepEqual(graph.nodes.A.layoutPosition, { x: 200, y: 200 })
  assert.equal(graph.nodes.A.layoutOffset, undefined)
  storeDisplayedPosition(graph.nodes.A, item, { x: 480, y: 630 }, 1.5)
  assert.deepEqual(graph.nodes.A.layoutPosition, { x: 220, y: 220 })
  assert.deepEqual(graph.nodes.A.layoutSize, { width: 200, height: 90 })
  assert.equal(graph.nodes.A.content[0].value, 'Keep')
})

test('all node types retain manual dimensions through JSON and reject malformed dimensions', () => {
  const graph = { schemaVersion: 1, documentType: 'dfx-project-flow', nodes: {}, edges: [], navigation: [], subflows: [] }
  for (const type of ['action','decision','frame','main','fault','note','shared','return']) {
    graph.nodes[type] = { id: type, type, group: 'QA', title: type, content: [], decision: type === 'decision', layoutSize: { width: 320, height: 160 }, ...(type === 'return' ? { jumpTo: 'action' } : {}) }
  }
  const roundtrip = readGraph(JSON.parse(JSON.stringify(graph)))
  for (const type of Object.keys(graph.nodes)) assert.deepEqual(roundtrip.nodes[type].layoutSize, { width: 320, height: 160 })
  for (const size of [null, [], { width: 79, height: 48 }, { width: 80, height: 47 }, { width: Infinity, height: 90 }, { width: '200', height: 90 }]) {
    const invalid = structuredClone(graph); invalid.nodes.action.layoutSize = size
    assert.throws(() => readGraph(invalid))
  }
})
