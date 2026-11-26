import { reserveTracks } from '../workbench/layout/arrangeTracks.js'
import test from 'node:test'
import assert from 'node:assert/strict'
import { arrangeSheet } from '../workbench/layout/arrangeSheet.js'
import { arrangedWire } from '../workbench/layout/arrangeConnections.js'
import { straightConnection } from '../workbench/layout/straightConnection.js'
import { resolveWire } from '../workbench/layout/wireGeometry.js'
import { overlapsAt } from '../workbench/layout/nodePlacement.js'

const cards = [...'ABCD'].map((id) => ({ id, w: 140, h: 64 }))
const links = ['AB', 'AC', 'BD', 'CD'].map(([from, to]) => ({ from, to }))
const box = (x, y, w = 140, h = 64) => ({ x, y, w, h })
const canMove = () => true
for (const [dir, axis, sign, exit] of [
  ['LR', 'x', 1, 'right'],
  ['RL', 'x', -1, 'left'],
  ['TD', 'y', 1, 'bottom'],
  ['BT', 'y', -1, 'top'],
]) {
  test(dir + ' fork and merge fit adjacent ranks and share a departure trunk', () => {
    const { positions } = arrangeSheet(cards, links, dir, new Map())
    const bounds = (id) => ({ ...cards.find((c) => c.id === id), ...positions.get(id) })
    const a = bounds('A'),
      b = bounds('B'),
      c = bounds('C'),
      d = bounds('D')
    assert.equal(b[axis], c[axis])
    assert.ok((b[axis] - a[axis]) * sign > 0 && (d[axis] - b[axis]) * sign > 0)
    const spacing = Math.abs(a[axis] - b[axis]) - (axis === 'x' ? a.w : a.h)
    assert.ok(spacing >= 24 && spacing <= 64)
    const paths = [b, c].map((to) => {
      const layout = arrangedWire(a, to, dir, 2)
      assert.equal(layout.start, exit)
      return resolveWire({ from: a, to, autoPoints: [a, to], obstacles: [] }, layout, 1)
    })
    assert.deepEqual(paths[0].slice(0, 2), paths[1].slice(0, 2))
    assert.ok(Math.abs(paths[0][1][axis] - paths[0][0][axis]) >= 12)
    assert.notEqual(
      arrangedWire(d, a, dir, 1).start,
      { right: 'left', left: 'right', bottom: 'top', top: 'bottom' }[exit],
    )
    assert.deepEqual(positions, arrangeSheet(cards, links, dir, new Map()).positions)
  })
}

test('cycles, a local reverse group, a frame and isolated cards retain every node', () => {
  const nodes = [
    ...cards.map((c) => ({ ...c, group: 'review' })),
    { id: 'F', w: 145, h: 42, members: ['A', 'B'] },
    ...Array.from({ length: 16 }, (_, i) => ({ id: 'isolated' + i, w: 120, h: 48 })),
  ]
  const { positions } = arrangeSheet(
    nodes,
    [...links, { from: 'D', to: 'A', kind: 'retry' }],
    'LR',
    new Map([['review', 'RL']]),
  )
  assert.equal(positions.size, nodes.length)
  for (const [id, p] of positions) {
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y))
    for (const other of nodes)
      if (id !== 'F' && other.id !== 'F' && other.id !== id)
        assert.equal(
          overlapsAt(
            nodes.find((n) => n.id === id),
            p,
            { ...other, ...positions.get(other.id) },
          ),
          false,
        )
  }
  const groupOnly = arrangeSheet(
    cards.map((c) => ({ ...c, group: 'review' })),
    links,
    'LR',
    new Map([['review', 'RL']]),
  )
  assert.ok(groupOnly.positions.get('A').x > groupOnly.positions.get('D').x)
  const islands = [...positions].filter(([id]) => id.startsWith('isolated')).map(([, p]) => p)
  assert.ok(new Set(islands.map((p) => p.x)).size > 1 && new Set(islands.map((p) => p.y)).size > 1)
})

test('parallel conditions get distinct paths without using the rear face', () => {
  const a = box(0, 50),
    b = box(230, 50)
  const paths = Array.from({ length: 5 }, (_, i) => {
    const layout = arrangedWire(a, b, 'LR', 5, { label: { x: 7, y: 4 } }, i)
    assert.deepEqual(layout.label, { x: 7, y: 4 })
    assert.notEqual(layout.start, 'left')
    return JSON.stringify(resolveWire({ from: a, to: b, autoPoints: [a, b], obstacles: [] }, layout, 1))
  })
  assert.equal(new Set(paths).size, 5)
})

test('straightening minimizes displacement, supports unequal cards and fixed endpoints', () => {
  const a = box(0, 10),
    b = box(240, 32, 180, 80)
  const p = straightConnection(a, b, [], canMove)
  assert.equal(p.item, b)
  assert.deepEqual(p.pos, { x: 240, y: 2 })
  assert.deepEqual(p.faces, ['right', 'left'])
  const other = straightConnection(a, b, [], (item) => item === a)
  assert.equal(other.item, a)
  const vertical = straightConnection(a, box(4, 240), [], canMove)
  assert.deepEqual(vertical.faces, ['bottom', 'top'])
  assert.equal(straightConnection(a, box(240, 10), [], () => false).distance, 0)
  assert.equal(straightConnection(a, a, [], canMove), undefined)
})

test('a blocked corridor cannot be straightened through another card', () => {
  const a = box(0, 0),
    b = box(440, 20),
    block = box(155, -50, 270, 160)
  assert.equal(
    straightConnection(a, b, [block], () => false),
    undefined,
  )
  const p = straightConnection(a, b, [block], canMove)
  if (p) {
    assert.equal(overlapsAt(p.item, p.pos, block), false)
    assert.ok(p.faces.includes('top'))
  }
})

test('independent staggered wires sharing a gap choose separate middle lanes', () => {
  const prior = []
  const first = { start: 'right', end: 'left' },
    second = { ...first }
  reserveTracks(box(0, 0), box(240, 100), first, 1, [], prior)
  reserveTracks(box(0, 40), box(240, 180), second, 1, [], prior)
  assert.notEqual(first.lanes[0].at, second.lanes[0].at)
})

test('branches reaching unequal ranks and widths turn at exactly the same distance', () => {
  const from = box(0, 100)
  const targets = [box(186, 10, 200), box(395, 230, 118)]
  const turns = targets.map((to) => {
    const layout = arrangedWire(from, to, 'LR', 2)
    return resolveWire({ from, to, autoPoints: [from, to], obstacles: [] }, layout, 1)[1].x
  })
  assert.equal(turns[0], turns[1])
})
