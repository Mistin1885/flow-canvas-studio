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
