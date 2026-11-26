import assert from 'node:assert/strict'
import { test } from 'node:test'
import { alignNodeDrag, centerPeers } from '../workbench/layout/nodeAlignment.js'
import { cardCenter, centerConnection } from '../workbench/layout/cardCenters.js'
import { placeDock } from '../workbench/layout/dockSnap.js'
import { dropPositions } from '../workbench/layout/nodePlacement.js'
import { clearRoute } from '../workbench/layout/routing.js'
import { resolveWire } from '../workbench/layout/wireGeometry.js'

const a = { x: 40.5, y: 81.5, w: 165, h: 75, scope: 'project' }
const b = { x: 320, y: 120, w: 280, h: 140, scope: 'project' }
const shifted = (card, delta) => ({ ...card, x: card.x + delta.x, y: card.y + delta.y })
const close = (x, y) => assert.ok(Math.abs(x - y) < 1e-7, x + ' vs ' + y)

for (const axis of ['x', 'y']) {
  test('grab either card and align its ' + axis + ' center from either direction at different scales', () => {
    const peer = axis === 'y' ? b : {...b, x: 80, y: 380}
    for (const reading of [0.8, 1, 1.35]) for (const zoom of [0.35, 0.86, 1, 2]) {
      const cards = [a, peer].map(c => ({...c, x:c.x*reading, y:c.y*reading, w:c.w*reading, h:c.h*reading}))
      for (const [grabbed, target] of [cards, [...cards].reverse()]) {
        for (const approach of [-7, 7]) {
          const displacement = (cardCenter(target)[axis] - cardCenter(grabbed)[axis]) * zoom + approach
          const dx = axis === 'x' ? displacement : 0, dy = axis === 'y' ? displacement : 0
          const peers = centerPeers(grabbed, [target], new Set([target]))
          const {delta, guides} = alignNodeDrag(grabbed, dx, dy, reading, zoom, peers)
          assert.deepEqual(guides.map(g => g.axis), [axis])
          const placed = shifted(grabbed, delta)
          close(cardCenter(placed)[axis], cardCenter(target)[axis])
          const wire = centerConnection(placed, target)
          assert.equal(wire.points.length, 2)
          close(wire.points[0][axis], cardCenter(target)[axis])
          close(wire.points[1][axis], cardCenter(target)[axis])
        }
      }
    }
  })
}

test('connected row wins over a closer unrelated card; distant unconnected rows and other sheets are ignored', () => {
  const distractor = {...a, x: 130, y: a.y + 4}
  const remote = {...a, x:-920}
  const otherSheet = {...a, scope:'detail'}
  const deltaY = cardCenter(a).y - cardCenter(b).y
  const drag = peers => alignNodeDrag(b, 0, deltaY + 4, 1, 1, peers)
  for (const items of [[a, distractor], [distractor, a]]) {
    const {delta} = drag(centerPeers(b, items, new Set([a])))
    close(cardCenter(shifted(b, delta)).y, cardCenter(a).y)
  }
  assert.equal(drag(centerPeers(b, [otherSheet, remote], new Set())).guides.length, 0)
  assert.equal(drag(centerPeers(b, [remote], new Set([remote]))).guides.length, 1)
  assert.equal(drag(centerPeers(b, [distractor], new Set())).guides.length, 1)
})

test('release outside eight pixels, overlapping targets, and a multi-selection with a blocked member', () => {
  const dy = cardCenter(a).y - cardCenter(b).y
  const peers = centerPeers(b, [a], new Set([a]))
  const move = alignNodeDrag(b, 0, dy - 9, 1, 1, peers)
  assert.equal(move.guides.length, 0)
  assert.equal((b.y + move.delta.y) % 20, 0)
  assert.equal(alignNodeDrag(b, a.x-b.x, dy, 1, 1, peers).guides.length, 0)
  const {delta} = alignNodeDrag(b, 2, dy+3, 1, 1, peers)
  const second = {...b, x:700, y:260}
  const positions = dropPositions([b, second], delta, [a], () => false)
  close(positions[1].y - positions[0].y, second.y-b.y)
  assert.equal(dropPositions([b, second], delta, [shifted(second, delta)], () => false), null)
})

const centered = {...b, y:cardCenter(a).y-b.h/2}
test('aligned automatic and compatible fixed docks can run straight without changing authored settings', () => {
  const center = cardCenter(a).y
  for (const layout of [{}, {start:'right',end:'left'}]) {
    const saved = JSON.stringify(layout)
    const path = centerConnection(a, centered, layout).points
    close(path[0].y, center)
    close(path[0].y, path[1].y)
    assert.equal(JSON.stringify(layout), saved)
  }
  const at = a.y+a.h*0.75
  const both = {start:'right',end:'left',startRatio:0.75,endRatio:(at-centered.y)/centered.h}
  assert.ok(centerConnection(a,centered,both))
  assert.equal(centerConnection(a,centered,{...both,endRatio:0.1}), undefined)
  assert.equal(centerConnection(a,centered,{start:'bottom'}), undefined)
  assert.equal(centerConnection(centered,a,{start:'left',startRatio:0.02}), undefined)
  assert.equal(centerConnection(a,centered,{lanes:[{axis:'y',at:35}]}), undefined)
  assert.equal(centerConnection(a,a), undefined)
})

test('routing respects blockers and manual detours even with matching centers', () => {
  const autoPoints = centerConnection(a,centered).points
  const obstacle = {x:226,y:99,w:38,h:45}
  const view = {from:a,to:centered,autoPoints,obstacles:[obstacle]}
  const path = resolveWire(view,{start:'right',end:'left'},1)
  assert.ok(path.length > 2 && clearRoute(path,[obstacle]))
  const lane = resolveWire({...view,obstacles:[]},{start:'right',end:'left',lanes:[{axis:'y',at:35}]},1)
  assert.ok(lane.length > 2)
})

test('dragging a single endpoint can set a free ratio or return it to the face midpoint', () => {
  const layout = {}, right = a.x+a.w, center = cardCenter(a).y
  placeDock(layout,'start',a,'right',{x:right,y:center+17},[],6)
  assert.ok(layout.startRatio > 0.5)
  assert.equal(centerConnection(a,centered,layout), undefined)
  placeDock(layout,'start',a,'right',{x:right,y:center+4},[],6)
  assert.equal(layout.startRatio,0.5)
  assert.ok(centerConnection(a,centered,layout))
})

test('automatic branches share all four midpoints and an imported edge keeps its original face', async () => {
  const { linkPorts } = await import('../workbench/layout/linkPorts.js')
  const center = cardCenter(a)
  const peers = [
    [{...a, x:-350}, {x:a.x,y:center.y}],
    [{...a, x:400}, {x:a.x+a.w,y:center.y}],
    [{...a, y:-200}, {x:center.x,y:a.y}],
    [{...a, y:300}, {x:center.x,y:a.y+a.h}],
  ]
  for (const [peer, tip] of peers) {
    for (const dy of [-16,0,16]) {
      const next = {...peer, y:peer.y+dy}
      assert.deepEqual(linkPorts(a,next,{},null,null,null,12)[0].at,tip)
      assert.deepEqual(linkPorts(next,a,{},null,null,null,12)[1].at,tip)
    }
  }
  const raw = [[20,0],[20,-20],[299,40],[300,40]]
  const imported = linkPorts(a,b,{},raw,[0,0,80,50],[300,30,120,80],12)
  assert.deepEqual(imported[0].at,{x:center.x,y:a.y})
  assert.deepEqual(imported[1].at,{x:b.x,y:cardCenter(b).y})
  const [start,end] = linkPorts(a,a,{},null,null,null,12)
  assert.notDeepEqual(start.at,end.at)
})
