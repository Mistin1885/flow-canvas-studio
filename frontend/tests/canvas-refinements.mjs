import assert from 'node:assert/strict'
import { test } from 'node:test'
import { branchIndex, walkBranches } from '../workbench/diagram/branches.js'
import { hiddenFrameMembers } from '../workbench/frames/folding.js'
import { containedMembers } from '../workbench/frames/containment.js'
import { edgeLineStyle, storeEdgeLineStyle } from '../workbench/appearance/edgeStyle.js'

test('return cards fold with their incoming branch without owning their destination', () => {
  const nodes = [{id:'A'}, {id:'B'}, {id:'R', type:'return', jumpTo:'A'}, {id:'C'}]
  const edges = [{from:'A',to:'B',kind:'next'}, {from:'B',to:'R',kind:'return'}, {from:'R',to:'A',kind:'next'}, {from:'C',to:'B',kind:'next'}]
  const index = branchIndex(nodes, edges, () => 'project', [])
  assert.deepEqual([...walkBranches(index.roots.get('project'), index.children, new Set(['A', 'C']))].sort(), ['A', 'C'])
  assert.deepEqual([...walkBranches(index.roots.get('project'), index.children, new Set(['A']))].sort(), ['A','B','C','R'])
  assert.deepEqual(index.children.get('R'), [])
})

test('frame collection requires full containment, same sheet, and non-frame nodes', () => {
  const frame = {id:'F',scope:'project',x:0,y:0,w:500,h:400}
  const box = {scope:'project',x:10,y:60,w:100,h:80}
  const items = [{...box,id:'A'}, {...box,id:'B',x:470}, {...box,id:'C',scope:'child'}, {...box,id:'G'}, {...box,id:'H',inlineFlow:{x:10,y:60,w:700,h:500}}]
  const nodes = Object.fromEntries(['A','B','C','G','H'].map(id => [id,{id,type:id==='G'?'frame':'action'}]))
  assert.deepEqual(containedMembers(frame, items, nodes), ['A'])
})

test('frame folding hides only assigned members and their hosted subflows', () => {
  const graph = {nodes:{F:{id:'F',type:'frame',frameMembers:['A']}, A:{id:'A'}, B:{id:'B'}, S:{id:'S',sheetId:'child'}},subflows:[{id:'child',parent:'A',root:'S'}]}
  const original = JSON.stringify(graph)
  assert.deepEqual([...hiddenFrameMembers(graph, new Set(['F']))].sort(), ['A','S'])
  assert.deepEqual([...hiddenFrameMembers(graph, new Set())], [])
  assert.equal(JSON.stringify(graph), original)
})

test('line style preserves legacy dashed data and round trips all three styles', () => {
  assert.equal(edgeLineStyle(null), 'solid')
  assert.equal(edgeLineStyle(), 'solid')
  const edge = {dashed:true,wireLayout:{start:'left'},conditionColor:'#abcdef'}
  storeEdgeLineStyle(edge, 'dashed')
  assert.equal(Object.hasOwn(edge,'lineStyle'), false)
  for (const style of ['dotted','solid','dashed']) {
    storeEdgeLineStyle(edge,style)
    assert.equal(edgeLineStyle(JSON.parse(JSON.stringify(edge))), style)
    assert.deepEqual(edge.wireLayout,{start:'left'})
  }
})
