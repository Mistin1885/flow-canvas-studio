import test from 'node:test'
import assert from 'node:assert/strict'
import { straightConnection } from '../workbench/layout/straightConnection.js'
import { overlapsAt } from '../workbench/layout/nodePlacement.js'
const box = (x, y, w = 140, h = 64) => ({ x, y, w, h })
const canMove = () => true

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
