import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effectiveStyle, checkNodeStyles } from '../workbench/appearance/schema.js'
import { usedColors } from '../workbench/appearance/colorPalette.js'
import { checkNodeTypes, deleteTypeDefinition, setTypeDefinition, typeKey, typeLabel } from '../workbench/modeling/nodeTypeCatalog.js'

const fixture = () => ({
  nodes: { A: { id: 'A', title: 'Check', group: 'QA', type: 'action', customType: 'type-check',
    decision: false, content: [{ type: 'text', value: 'Keep this content' }], nodeStyle: { edge: '#111111' } } },
  edges: [{ from: 'A', to: 'A', label: 'yes', conditionColor: '#ABCDEF', labelBackgroundColor: '#fedcba' }],
  nodeStyle: { edge: '#222222', light: '#eeeeee', dark: '#202020' },
  layoutGroups: [{ name: 'QA', direction: 'TD', nodeStyle: { edge: '#333333', light: '#cccccc' } }],
  nodeTypeDefinitions: [{ id: 'type-check', name: 'Checks', baseType: 'action', nodeStyle: { edge: '#444444' } }],
})
const validate = graph => checkNodeTypes(graph, (path, message) => { throw Error(path + ': ' + message) }, checkNodeStyles)

test('styles resolve each field in node > type > group > diagram order', () => {
  const graph = fixture(), node = graph.nodes.A
  assert.deepEqual(effectiveStyle(graph, node), { edge: '#111111', light: '#cccccc', dark: '#202020' })
  delete node.nodeStyle.edge
  assert.equal(effectiveStyle(graph, node).edge, '#444444')
  delete graph.nodeTypeDefinitions[0].nodeStyle.edge
  assert.equal(effectiveStyle(graph, node).edge, '#333333')
  delete graph.layoutGroups[0].nodeStyle.edge
  assert.equal(effectiveStyle(graph, node).edge, '#222222')
})

test('rename preserves assignment; deleting a custom type retains behavior, content and individual styles', () => {
  const graph = fixture(), before = structuredClone(graph.nodes.A)
  setTypeDefinition(graph, { ...graph.nodeTypeDefinitions[0], name: 'Inspections' })
  validate(graph)
  assert.equal(typeLabel(graph, graph.nodes.A), 'Inspections')
  assert.equal(typeKey(graph.nodes.A), 'type-check')
  deleteTypeDefinition(graph, 'type-check')
  delete before.customType
  assert.deepEqual(graph.nodes.A, before)
  assert.equal(typeKey(graph.nodes.A), 'action')
  assert.equal(typeLabel(graph, graph.nodes.A), '一般步驟')
  validate(graph)
})

test('JSON round trip keeps type catalog, inherited colors and custom assignments', () => {
  const graph = fixture(), copy = JSON.parse(JSON.stringify(graph))
  validate(copy)
  assert.deepEqual(copy, graph)
  assert.deepEqual(effectiveStyle(copy, copy.nodes.A), effectiveStyle(graph, graph.nodes.A))
  const legacy = { nodes: { A: { id: 'A', decision: true, group: 'QA' } } }
  validate(legacy)
  assert.equal(typeKey(legacy.nodes.A), 'decision')
  assert.deepEqual(legacy, { nodes: { A: { id: 'A', decision: true, group: 'QA' } } })
})

test('invalid catalogs and dangling custom types cannot be imported', () => {
  for (const mutate of [
    g => { g.nodeTypeDefinitions.push({ ...g.nodeTypeDefinitions[0] }) },
    g => { g.nodeTypeDefinitions[0].name = '一般步驟' },
    g => { g.nodeTypeDefinitions[0].baseType = 'missing' },
    g => { g.nodeTypeDefinitions[0].nodeStyle = { frame: 'on' } },
    g => { g.nodes.A.customType = 'type-missing' },
    g => { g.nodes.A.type = 'decision' },
  ]) { const graph = fixture(); mutate(graph); assert.throws(() => validate(graph)) }
  assert.throws(() => deleteTypeDefinition(fixture(), 'action'))
  assert.throws(() => setTypeDefinition(fixture(), { id: 'type-check', name: 'Checks', baseType: 'return' }))
})

test('shared swatches include every canvas color source and normalize duplicates', () => {
  const graph = fixture()
  graph.customCategories = [{ name: 'QA', color: '#ABCDEF' }]
  graph.sourceLegend = { items: [{ kind: 'outline', value: '123456' }, { kind: 'fill', value: '654321' }] }
  graph.badgeStyles = { Attention: { color: '#112233' } }
  graph.groupLinks = [{ label: 'fail', conditionColor: '#abcdef' }]
  const colors = usedColors(graph)
  assert.equal(colors.filter(c => c === '#abcdef').length, 1)
  for (const color of ['#444444', '#123456', '#654321', '#112233', '#fedcba', '#cccccc']) assert.ok(colors.includes(color))
  assert.ok(colors.every(c => /^#[0-9a-f]{6}$/.test(c)))
})
