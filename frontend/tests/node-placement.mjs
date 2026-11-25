import assert from 'node:assert/strict'
import { test } from 'node:test'
import { gridStep, overlapsAt, snapDrag } from '../workbench/layout/nodePlacement.js'
import { addNode } from '../workbench/graph/addNode.js'
import { effectiveStyle } from '../workbench/appearance/schema.js'
import { invalidatePeerStyles, peerStyle } from '../workbench/appearance/groupPalette.js'

test('drag anchors match the visible grid across zoom and reading sizes', () => {
  for (const zoom of [0.005, 0.35, 1, 2.4]) {
    for (const reading of [0.8, 1, 1.3]) {
      const step = gridStep(reading, zoom)
      const pos = snapDrag({ x: 14, y: 33 }, (-step * 1.8 - 14) * zoom, (step * 3.4 - 33) * zoom, reading, zoom)
      assert.deepEqual(pos, { x: -step * 2, y: step * 3 })
    }
  }
})

test('neighbouring card edges can touch, including expanded flow footprints', () => {
  const host = { x: 10, y: 10, inlineFlow: { x: 0, y: 0, w: 100, h: 100 } }
  const obstacle = { x: 150, y: 10, w: 50, h: 50 }
  assert.equal(overlapsAt(host, { x: 60, y: 10 }, obstacle), false)
  assert.equal(overlapsAt(host, { x: 61, y: 10 }, obstacle), true)
})

test('new cards inherit same-type styles, then group consensus for a new type', () => {
  const card = (type, dark, extras) => ({ group: 'A', type, nodeStyle: { dark, ...extras } })
  const g = { nodes: {
    first: card('main', '#ABCDEF', { line: 'solid' }),
    second: card('main', '#abcdef', { line: 'solid' }),
    note: card('note', '#aaaaaa', { line: 'dotted' }),
    unrelated: { ...card('note', '#bbbbbb'), group: 'B' },
  } }
  addNode(g, { id: 'new', group: 'A', type: 'action' })
  const n = g.nodes.new
  assert.equal(n.inheritPeerStyle, true)
  addNode(g, { id: 'firstInGroup', group: 'New group', type: 'action' })
  assert.equal(g.nodes.firstInGroup.inheritPeerStyle, undefined)
  assert.deepEqual(effectiveStyle(g, n), { dark: '#abcdef', line: 'solid' })
  assert.deepEqual(effectiveStyle(g, { ...n, type: 'note' }), { dark: '#aaaaaa', line: 'dotted' })
  assert.deepEqual(effectiveStyle(g, { ...n, group: 'Empty' }), {})
  assert.deepEqual(effectiveStyle(g, { group: 'A' }), {})
  g.nodeStyle = { dark: '#123456' }
  g.layoutGroups = [{ name: 'A', nodeStyle: { line: 'dashed' } }]
  assert.deepEqual(effectiveStyle(g, n), { dark: '#123456', line: 'dashed' })
  assert.equal(effectiveStyle(g, { ...n, nodeStyle: { line: 'solid' } }).line, 'solid')
  delete g.nodes.second
  invalidatePeerStyles(g)
  assert.deepEqual(peerStyle(g, n), {})
})
