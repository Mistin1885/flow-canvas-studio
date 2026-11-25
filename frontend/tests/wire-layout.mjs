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
import { straightenAutomaticWire } from '../workbench/layout/dockPoints.js'
import { rightAnglePath } from '../workbench/diagram/paths.js'

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
  for (const end of [{ x: 100, y: 30 }, { x: -10, y: -80 }, { x: 40, y: 40 }]) {
    const input = [{ x: 0, y: 0 }, end]
    assert.equal(rightAnglePath(input), rightAnglePath(straightPoints(input)))
  }
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

test('near-aligned opposite faces share one axis for both directions, zoom-independent', () => {
  for (const scale of [0.8, 1, 1.4]) {
    for (const orientation of ['horizontal', 'vertical']) {
      const flip = orientation === 'vertical'
      const point = (x, y) => flip ? { x: y * scale, y: x * scale } : { x: x * scale, y: y * scale }
      const rect = (x, y, w, h) => ({ ...point(x, y), w: scale * (flip ? h : w), h: scale * (flip ? w : h) })
      const near = rect(0, 0, 80, 50), far = rect(200, -3, 60, 80)
      const dogleg = [point(80, 25), point(145, 25), point(145, 37), point(200, 37)]
      const straight = [point(80, 31), point(200, 31)]
      assert.deepEqual(straightenAutomaticWire(near, far, dogleg, scale, undefined, () => true), straight)
      assert.deepEqual(straightenAutomaticWire(far, near, dogleg.toReversed(), scale, {}, () => true), straight.toReversed())
      const pinnedSides = { start: flip ? 'bottom' : 'right', end: flip ? 'top' : 'left' }
      const view = { from: near, to: far, autoPoints: dogleg }
      assert.deepEqual(resolveWire(view, pinnedSides, scale), straight)
    }
  }
})

test('automatic straightening respects route clearance, intended detours, manual lanes and the tolerance', () => {
  const near = from, far = { ...to, y: 10 }
  const dogleg = [{ x: 100, y: 25 }, { x: 150, y: 25 }, { x: 150, y: 35 }, { x: 200, y: 35 }]
  const blocked = [{ x: 125, y: 28, w: 10, h: 4 }]
  assert.equal(straightenAutomaticWire(near, far, dogleg, 1, {}, ps => clearRoute(ps, blocked)), dogleg)
  assert.equal(straightenAutomaticWire(near, far, dogleg, 1, { lanes: [{ axis: 'y', at: 25 }] }, () => true), dogleg)
  assert.deepEqual(straightenAutomaticWire(near, far, dogleg, 1, { label: { x: 4, y: 8 } }, () => true),
    [{ x: 100, y: 30 }, { x: 200, y: 30 }])
  const wide = [dogleg[0], { x: 150, y: 25 }, { x: 150, y: 41 }, { x: 200, y: 41 }]
  assert.equal(straightenAutomaticWire(near, { ...to, y: 16 }, wide, 1, {}, () => true), wide)
  const detour = [dogleg[0], { x: 125, y: 25 }, { x: 125, y: -10 }, { x: 175, y: -10 }, { x: 175, y: 35 }, dogleg.at(-1)]
  assert.equal(straightenAutomaticWire(near, far, detour, 1, {}, () => true), detour)
  const adjacent = [dogleg[0], { x: 250, y: 10 }]
  assert.equal(straightenAutomaticWire(near, far, adjacent, 1, {}, () => true), adjacent)
  const narrow = { x: 200, y: 34, w: 50, h: 4 }
  assert.equal(straightenAutomaticWire(near, narrow, dogleg, 1, {}, () => true), dogleg)
})

test('a lane dragged back into the snap radius becomes a straight line; an intentional offset survives', () => {
  const view = {
    from, to: { ...to, y: 10 },
    autoPoints: [{ x: 100, y: 25 }, { x: 150, y: 25 }, { x: 150, y: 35 }, { x: 200, y: 35 }],
  }
  const layout = { start: 'right', end: 'left' }
  const ports = wirePorts(view, layout, 1)
  const offset = { ...layout, lanes: [{ axis: 'y', at: 32 }] }
  const path = resolveWire(view, offset, 1)
  const index = path.findIndex((p, i) => p.y === 62 && path[i + 1]?.y === 62)
  assert.notEqual(index, -1)
  const lanes = dragLanes(path, index, { x: 0, y: -32 }, ports, 1)
  assert.deepEqual(resolveWire(view, { ...layout, lanes }, 1), [{ x: 100, y: 30 }, { x: 200, y: 30 }])
  assert.deepEqual(resolveWire(view, { lanes }, 1), [{ x: 100, y: 30 }, { x: 200, y: 30 }])
  const autoView = {
    ...view, originalPorts: [view.autoPoints[0], view.autoPoints.at(-1)],
    autoPoints: [{ x: 100, y: 30 }, { x: 200, y: 30 }],
  }
  // The first drag previews on the snapped geometry. Reload sees the underlying
  // automatic geometry and the saved manual lane. They must render identically.
  assert.deepEqual(resolveWire(autoView, { lanes: offset.lanes }, 1),
    resolveWire(view, { lanes: offset.lanes }, 1))
  const blocked = { ...view, obstacles: [{ x: 125, y: 28, w: 10, h: 4 }] }
  const detour = resolveWire(blocked, { ...layout, lanes }, 1)
  assert.ok(detour.length > 2 && clearRoute(detour, blocked.obstacles))
})
