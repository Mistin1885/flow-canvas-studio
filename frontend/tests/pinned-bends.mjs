import assert from 'node:assert/strict'
import { test } from 'node:test'
import { moveBend } from '../workbench/layout/pinnedBends.js'
import { dragLanes, resolveWire, validateWireLayout, wirePorts } from '../workbench/layout/wireGeometry.js'
import { clearRoute } from '../workbench/layout/routing.js'

const view = {
  from: { x: 0, y: 0, w: 100, h: 50 }, to: { x: 600, y: 0, w: 100, h: 50 },
  autoPoints: [{ x: 100, y: 25 }, { x: 600, y: 25 }],
}
const initial = { start: 'right', end: 'left', lanes: [{ axis: 'y', at: 90 }] }

function move(layout, index, dx, dy, diagram = view) {
  const points = resolveWire(diagram, layout, 1), ports = wirePorts(diagram, layout, 1)
  const [moved] = dragLanes(points, index, { x: dx, y: dy }, ports, 1)
  const lanes = moveBend(points, index, moved, ports, 1, diagram)
  if (!lanes) return layout
  const saved = JSON.parse(JSON.stringify({ ...layout, lanes }))
  validateWireLayout(saved)
  return saved
}

test('the first turn, lower horizontal run and far turn can each be positioned independently', () => {
  const path = resolveWire(view, initial, 1)
  const left = [1, 10, 0], down = [2, 0, 75], right = [3, -63, 0]
  for (const order of [[left, down, right], [down, right, left], [right, left, down]]) {
    let layout = initial
    for (const [index, dx, dy] of order) layout = move(layout, index, dx, dy)
    const expected = [
      path[0], { x: 122, y: 25 }, { x: 122, y: 190 },
      { x: 525, y: 190 }, { x: 525, y: 25 }, path.at(-1),
    ]
    assert.deepEqual(resolveWire(view, layout, 1), expected)
    assert.deepEqual(resolveWire(view, move(move(layout, 2, 0, 10), 2, 0, -10), 1), expected)
    assert.equal(layout.lanes.length, 3)
  }
})

test('moving the last dock leg leaves the first turn in place; a blocked move retains the previous layout', () => {
  const diagram = { ...view, to: { ...view.to, y: 100 } }
  const layout = { start: 'right', end: 'left', lanes: [{ axis: 'x', at: -220 }] }
  const before = resolveWire(diagram, layout, 1)
  const edited = move(layout, before.length - 2, 0, 70, diagram)
  const path = resolveWire(diagram, edited, 1)
  assert.deepEqual(path.slice(0, 2), before.slice(0, 2))
  assert.ok(path.some((p, i) => i && p.y === 195 && path[i - 1].y === 195))
  const obstacle = { x: 200, y: 138, w: 80, h: 30 }
  assert.equal(move(edited, 2, 0, -40, { ...diagram, obstacles: [obstacle] }), edited)
  assert.ok(clearRoute(path, [obstacle]))
})
