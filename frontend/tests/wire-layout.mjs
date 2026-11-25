import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  straightPoints,
  dragLanes,
  wirePorts,
  resolveWire,
  validateWireLayout,
  routeAnchor,
  nearestFace,
} from '../workbench/layout/wireGeometry.js'
import { clearRoute } from '../workbench/layout/routing.js'

const from = { x: 0, y: 0, w: 100, h: 50 },
  to = { ...from, x: 200 }
const wire = {
  from,
  to,
  autoPoints: [
    { x: 100, y: 25 },
    { x: 200, y: 25 },
  ],
}

test('an endpoint dropped beyond a card snaps to the side facing the pointer', () => {
  for (const [x, y, side] of [[-20, 1, 'left'], [119, 49, 'right'], [99, -20, 'top'], [1, 65, 'bottom']])
    assert.equal(nearestFace(from, { x, y }), side)
})

test('the default route stays intact, and dragging a straight wire keeps both ends docked', () => {
  assert.equal(resolveWire(wire, {}, 1), wire.autoPoints)
  const lanes = dragLanes(wire.autoPoints, 0, { x: 0, y: 30 }, wirePorts(wire, {}, 1), 1)
  assert.deepEqual(resolveWire(wire, { lanes }, 1), [
    { x: 100, y: 25 },
    { x: 112, y: 25 },
    { x: 112, y: 55 },
    { x: 188, y: 55 },
    { x: 188, y: 25 },
    { x: 200, y: 25 },
  ])
})
test('all sixteen combinations of sides meet their card without crossing its interior', () => {
  for (const start of ['top', 'right', 'bottom', 'left'])
    for (const end of ['top', 'right', 'bottom', 'left']) {
      const path = resolveWire(wire, { start, end }, 1),
        [a, b] = wirePorts(wire, { start, end }, 1)
      assert.deepEqual(path[0], a.point)
      assert.deepEqual(path.at(-1), b.point)
      assert.ok(clearRoute(path, [from, to]), start + ' to ' + end)
      assert.ok(path.every((p, i) => !i || p.x === path[i - 1].x || p.y === path[i - 1].y))
    }
})
test('orthogonal segments and their midpoint match the displayed path', () => {
  const points = straightPoints([
    { x: 0, y: 0 },
    { x: 100, y: 30 },
  ])
  assert.deepEqual(points, [
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 50, y: 30 },
    { x: 100, y: 30 },
  ])
  assert.deepEqual(routeAnchor(points), { x: 50, y: 15 })
  for (const layout of [{ start: 'east' }, { label: { x: NaN, y: 2 } }, { lanes: [null] }])
    assert.throws(() => validateWireLayout(layout))
})

test('switching dock sides preserves a hand-positioned lane and keeps the wire outside its endpoints', () => {
  const lanes = dragLanes(wire.autoPoints, 0, { x: 0, y: 100 }, wirePorts(wire, {}, 1), 1)
  for (const start of ['top', 'right', 'bottom', 'left'])
    for (const end of ['top', 'right', 'bottom', 'left']) {
      const path = resolveWire(wire, { start, end, lanes }, 1)
      assert.ok(clearRoute(path, [from, to]), start + ' to ' + end)
      const [a, b] = wirePorts(wire, { start, end }, 1)
      assert.ok(path.some((p) => p.y === (a.point.y + b.point.y) / 2 + 100))
    }
})
