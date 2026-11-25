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

const offsetWire = {
  ...wire, to: { ...to, y: 65 },
  autoPoints: [wire.autoPoints[0], { x: 200, y: 90 }],
}
const bottomToLeft = { start: 'bottom', end: 'left' }

test('bottom-to-left uses a single elbow, including the two docking legs', () => {
  assert.deepEqual(resolveWire(offsetWire, bottomToLeft, 1), [
    { x: 50, y: 50 }, { x: 50, y: 90 }, { x: 200, y: 90 },
  ])
})

test('redragging a segment discards intermediate steps and snaps back to the dock line', () => {
  const ports = wirePorts(offsetWire, bottomToLeft, 1)
  const steps = [{ x: 50, y: 50 }, { x: 50, y: 77 }, { x: 90, y: 77 },
    { x: 90, y: 73 }, { x: 180, y: 73 }, { x: 180, y: 90 }, { x: 200, y: 90 }]
  const move = (points, index, dy) => {
    const lanes = dragLanes(points, index, { x: 0, y: dy }, ports, 1)
    assert.equal(lanes.length, 1)
    return resolveWire(offsetWire, { ...bottomToLeft, lanes }, 1)
  }
  const pinned = move(steps, 3, 2)
  assert.equal(pinned.length - 2, 3)
  assert.ok(pinned.some((p, i) => i && p.y === 75 && pinned[i - 1].y === 75))
  const index = pinned.findIndex((p, i) => p.y === 75 && pinned[i + 1]?.y === 75)
  assert.deepEqual(move(pinned, index, 12), resolveWire(offsetWire, bottomToLeft, 1))
})

test('a blocking card forces a detour with four bends and preserves both dock directions', () => {
  const block = { x: 135, y: -55, w: 30, h: 165 }
  const view = { ...wire, obstacles: [block] }
  const layout = { start: 'right', end: 'left' }
  const path = resolveWire(view, layout, 1)
  assert.ok(clearRoute(path, [from, to, block]))
  assert.equal(path.length - 2, 4)
  assert.equal(path[0].y, path[1].y)
  assert.equal(path.at(-1).y, path.at(-2).y)
  assert.ok(path.some(p => p.y === -55), 'choose the shorter of the two equal-bend detours')
  const pinned = resolveWire(view, { ...layout, lanes: [{ axis: 'y', at: 90 }] }, 1)
  assert.ok(clearRoute(pinned, [from, to, block]))
  assert.ok(pinned.some((p, i) => i && p.y === 115 && pinned[i - 1].y === 115))
})

test('old staircase coordinates lose a small jog but keep a deliberately offset main lane', () => {
  const legacy = { ...bottomToLeft, lanes: [
    { axis: 'x', at: 'start' }, { axis: 'y', at: 7 }, { axis: 'x', at: -35 },
    { axis: 'y', at: 3 }, { axis: 'x', at: 37 }, { axis: 'y', at: 'end' },
  ] }
  const path = resolveWire(offsetWire, legacy, 1)
  assert.equal(path.length - 2, 3)
  assert.deepEqual(path.slice(1, -1), [{ x: 50, y: 73 }, { x: 162, y: 73 }, { x: 162, y: 90 }])
})
