import assert from 'node:assert/strict'
import { test } from 'node:test'
import { proseSegments, referenceIssue, references } from '../workbench/knowledge/references.js'

const lookup = (key) => (key === 'guide' ? { sections: [{ id: 'review' }] } : null)
const check = (text) => referenceIssue(text, lookup, ['流程'])

test('valid references, ordinary brackets, URLs, and intentional removal', () => {
  for (const text of [
    '[流程](kb:guide)',
    '一、[流程](kb:guide#review)。',
    '流程',
    '',
    '[可選]',
    '[外部](https://example.com/kb:article)',
    'KB:128',
    '[檔案](kb-notes.md)',
  ])
    assert.equal(check(text), null, text)
  assert.equal([...references('[甲](kb:guide)／[乙](kb:guide#review)')].length, 2)
})

test('damaged punctuation, prefix, unknown targets and titles with only whitespace', () => {
  for (const text of [
    '流程](kb:guide)',
    '[流程(kb:guide)',
    '[流程]kb:guide)',
    '[流程](kb:guide',
    '[流程](k:guide)',
    '[流程](kbg uide)',
    '[流程](guide)',
    '[流程](kb:)',
    '[流程]',
    '[流程',
    '[流程](kb:gone)',
    '[流程](kb:guide#gone)',
    '[流程](kb:guide#)',
    '[ ](kb:guide)',
    '[](kb:guide)',
    '[甲](kb:guide)\n[乙](kb:guide#review',
  ])
    assert.ok(check(text)?.reason, text)
})

test('inline code examples remain literal and backticks in link captions remain clickable', () => {
  const text = '`[example](kb:missing)` and [the `command`](kb:guide)'
  const parts = [...proseSegments(text)]
  assert.equal(parts[0].code, true)
  assert.equal(parts[2].text, '[the `command`](kb:guide)')
  assert.equal(parts[2].code, false)
})

test('import and backlinks follow the same knowledge target contract', async () => {
  const { readFile } = await import('node:fs/promises')
  const { nodeKnowledgeTargets, newMissingTarget } = await import('../workbench/knowledge/targets.js')
  const { node, targets } = JSON.parse(await readFile(new URL('../../tests/fixtures/knowledge-targets.json', import.meta.url)))
  assert.deepEqual([...nodeKnowledgeTargets(node)].map(r => [r.field, r.key, r.section ?? null]), targets)
  const g = { nodes: { A: node } }
  for (const [, key] of targets) g['knowledge.' + key] = { title: key, sections: [{ id: 'check' }] }
  assert.equal(newMissingTarget(g), null)
  const removed = { ...g, 'knowledge.guide': { title: 'guide', sections: [] } }
  assert.match(newMissingTarget(removed, g).message, /節點 A.*文字步驟 1.*guide#check/)
  assert.equal(newMissingTarget(removed, removed), null)
  assert.equal(newMissingTarget({ ...removed, nodes: {} }, g), null)
  const shifted = structuredClone(removed)
  shifted.nodes.A.content.unshift({ type: 'text', value: 'Intro' })
  assert.equal(newMissingTarget(shifted, removed), null)
  shifted.nodes.A.content.push({ type: 'text', value: '[Extra](kb:guide#check)' })
  assert.match(newMissingTarget(shifted, removed).message, /guide#check/)
})
