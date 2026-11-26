import assert from 'node:assert/strict'
import { test } from 'node:test'
import { movingWirePoints } from '../workbench/layout/movingWire.js'
import { removeBacktracks } from '../workbench/layout/backtracks.js'
import { clearRoute } from '../workbench/layout/routing.js'
import { resolveWire, straightPoints } from '../workbench/layout/wireGeometry.js'

const xy = (x, y) => ({ x, y })
const jog = [xy(92, 226), xy(175, 226), xy(175, 162), xy(132, 162), xy(132, 97), xy(1250, 97)]

test('moving one end of a split branch keeps each run orthogonal throughout the drag', () => {
  const base = [xy(-37, 226), xy(89, 226), xy(89, 97), xy(1250, 97)]
  for (const factor of [0, 0.25, 0.5, 0.75, 1]) {
    const delta = xy(129 * factor, 0)
    const path = movingWirePoints(base, delta, xy(0, 0))
    assert.equal(path.length, 4)
    assert.deepEqual(straightPoints(path), path)
    assert.deepEqual(path[0], xy(-37 + delta.x, 226))
    assert.deepEqual(path.at(-1), base.at(-1))
    assert.equal(path[1].x, path[2].x)
  }
})

test('a local shortcut preserves the first branching lane, rotates and reverses correctly', () => {
  for (const flip of [false, true]) {
    const transform = p => flip ? xy(p.y, p.x) : p
    for (const reverse of [false, true]) {
      const path = (reverse ? jog.toReversed() : jog).map(transform)
      const reduced = removeBacktracks(path, () => true)
      assert.equal(reduced.length, 4)
      assert.deepEqual(reduced.slice(0, 2), path.slice(0, 2))
      assert.deepEqual(reduced.at(-1), path.at(-1))
      assert.deepEqual(straightPoints(reduced), reduced)
    }
  }
})

test('jogs still route around cards when one or both shorter lanes are blocked', () => {
  const obstacles = [{ x: 170, y: 110, w: 10, h: 12 }]
  const fits = path => clearRoute(path, obstacles)
  const alternate = removeBacktracks(jog, fits)
  assert.deepEqual(alternate, [jog[0], xy(132, 226), jog[4], jog[5]])
  obstacles.push({ x: 127, y: 180, w: 10, h: 12 })
  assert.equal(removeBacktracks(jog, fits), jog)
  assert.ok(fits(jog))
})

test('old generated lanes simplify while explicitly pinned turns survive a JSON round trip', () => {
  const view = {from:{x:-8,y:201,w:100,h:50},to:{x:1250,y:72,w:100,h:50},
    autoPoints:[jog[0],jog.at(-1)]}
  const midpoint = xy(671, 161.5)
  const lanes = [{axis:'x', at:175-midpoint.x}, {axis:'y', at:162-midpoint.y}, {axis:'x', at:132-midpoint.x}]
  const layout = { start:'right',end:'left',lanes }
  assert.deepEqual(resolveWire(view, layout, 1), [jog[0], jog[1], xy(175,97), jog.at(-1)])
  const manual = { ...layout, lanes:lanes.map(lane => ({ ...lane, exact:true })) }
  assert.deepEqual(resolveWire(view, JSON.parse(JSON.stringify(manual)), 1), jog)
})
