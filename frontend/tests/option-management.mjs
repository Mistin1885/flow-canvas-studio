import { test } from 'node:test'
import assert from 'node:assert/strict'
import { keepDefinition } from '../workbench/options/keepDefinition.js'
import { applyOptionEdit, groupConnections, optionCounts, validateName } from '../workbench/options/catalog.js'

test('group edits preserve legacy sheet membership, coordinates, style, and named endpoints', () => {
  const g = { nodes: { A: { id: 'A', group: 'QA', tags: ['QA'], sourceKind: 'subflow' },
    B: { id: 'B', group: 'QA', sourceKind: 'subflow', layoutPosition: { x: 20, y: 84 } } },
    subflows: [{ id: 'flow1', root: 'A' }], layoutGroups: [{ name: 'QA', direction: 'TD', memberOrder: ['B','A'] }],
    groupLinks: [{ from: 'group:QA', to: 'A' }] }
  applyOptionEdit(g, { kind: 'group', from: 'QA', to: 'Review' })
  assert.equal(g.nodes.B.sheetId, 'flow1')
  assert.deepEqual(g.nodes.A.tags, ['Review'])
  assert.deepEqual(g.layoutGroups, [{ name: 'Review', direction: 'TD', memberOrder: ['B','A'] }])
  assert.equal(groupConnections(g, 'Review').length, 1)
  applyOptionEdit(g, { kind: 'group', from: 'Review', to: null })
  assert.deepEqual(g.groupLinks, [])
  assert.deepEqual(g.nodes.B.layoutPosition, { x: 20, y: 84 })
  assert.equal(g.nodes.B.group, '未分組')
  assert.equal(g.nodes.B.sheetId, 'flow1')
})

test('source and custom categories remain independent from group membership and original evidence', () => {
  const g = { nodes: { A: { id: 'A', group: 'Hot', tags: ['Hot','Hot','Ready'], legendEvidence: { categories: ['Hot'] } } },
    sourceLegend: { items: [{ name: 'Hot', value: 'ff0000' }] }, customCategories: [{ name: 'Ready', color: '#aabbcc' }] }
  assert.equal(optionCounts(g, 'category').get('Hot'), 1)
  applyOptionEdit(g, { kind: 'group', from: 'Hot', to: 'Main' })
  applyOptionEdit(g, { kind: 'category', from: 'Hot', to: 'Risk' })
  applyOptionEdit(g, { kind: 'category', from: 'Ready', to: null })
  assert.deepEqual(g.nodes.A.tags, ['Risk'])
  assert.deepEqual(g.sourceLegend.items, [{ name: 'Risk', value: 'ff0000' }])
  assert.deepEqual(g.nodes.A.legendEvidence.categories, ['Hot'])
})

test('legacy values, unused options and field-specific references survive an edit cycle', () => {
  const g = { nodes: { A: { ownerRole: 'PM', fieldValues: { size: 'L', grade: 'L' } } },
    fieldDefinitions: [{ id: 'size', type: 'select', options: [] }, { id: 'grade', type: 'select', options: ['L'] }] }
  for (const [kind, from, to] of [['role','PM','Owner'], ['field:size','L','Large'], ['field:size',null,'Small']])
    applyOptionEdit(g, { kind, from, to })
  assert.deepEqual(g.ownerRoleOptions, ['Owner'])
  assert.deepEqual(g.fieldDefinitions[0].options, ['Large','Small'])
  applyOptionEdit(g, { kind: 'field:size', from: 'Large', to: null })
  assert.deepEqual(g.nodes.A.fieldValues, { grade: 'L' })
  applyOptionEdit(g, { kind: 'role', from: 'Owner', to: null })
  assert.equal(g.nodes.A.ownerRole, undefined)
  assert.deepEqual(g.ownerRoleOptions, [])
})

test('badge edits carry style and individual placement and reject collisions and reserved names', () => {
  const style = { color: '#112233', icon: 'warning', style: 'solid' }
  const g = { badgeStyles: { Risk: style }, nodes: { A: { badges: { Risk:'bottom' } }, B: { badges: { Risk:'top' } } } }
  applyOptionEdit(g, { kind: 'badge', from: 'Risk', to: 'Alert' })
  assert.deepEqual(g.badgeStyles, { Alert: style })
  assert.equal(g.nodes.A.badges.Alert, 'bottom')
  assert.equal(g.nodes.B.badges.Alert, 'top')
  assert.throws(() => validateName('badge', 'Alert', '__proto__', []))
  assert.throws(() => validateName('role', 'Owner', 'pm', ['Owner','PM']))
  assert.throws(() => validateName('group', '未分組', null, []))
  applyOptionEdit(g, { kind: 'badge', from: 'Alert', to: null })
  assert.equal(optionCounts(g, 'badge').size, 0)
})

test('keeping a concurrent badge reference restores its definition without sharing mutable data', () => {
  const style = { color: '#123456', style: 'outline', icon: 'star' }
  const team = { badgeStyles: { Shared: style } }
  const merged = { nodes: { New: { badges: { Shared: 'top' } } }, badgeStyles: {} }
  keepDefinition(merged, team, 'badge', 'Shared')
  assert.deepEqual(merged.badgeStyles.Shared, style)
  assert.notEqual(merged.badgeStyles.Shared, style)
})

test('duplicate source legend entries retain all of their styles through rename and conflict recovery', () => {
  const items = [{ name: 'QA', kind: 'outline', value: '123456' }, { name: 'QA', kind: 'fill', value: 'abcdef' }]
  const team = { sourceLegend: { items }, nodes: { A: { tags: ['QA'] } } }
  const graph = structuredClone(team)
  applyOptionEdit(graph, { kind: 'category', from: 'QA', to: 'Review' })
  assert.deepEqual(graph.sourceLegend.items, items.map(item => ({ ...item, name: 'Review' })))
  applyOptionEdit(graph, { kind: 'category', from: 'Review', to: null })
  keepDefinition(graph, team, 'category', 'QA')
  assert.deepEqual(graph.sourceLegend.items, items)
})
