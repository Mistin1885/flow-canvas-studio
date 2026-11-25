import assert from 'node:assert/strict'
import { test } from 'node:test'
import { equalJson, signature } from '../shared/jsonComparison.js'

test('compare nested records by value while preserving ordered steps and export hashes', () => {
  const original = { title: 'Step', content: [{ type: 'text', value: 'First' }, { type: 'text', value: 'Second' }] }
  const reordered = { content: [{ value: 'First', type: 'text' }, { value: 'Second', type: 'text' }], title: 'Step' }
  assert.equal(equalJson(original, reordered), true)
  assert.equal(signature(reordered), '{"content":[{"type":"text","value":"First"},{"type":"text","value":"Second"}],"title":"Step"}')
  assert.equal(signature(original), signature(reordered))
  reordered.content.reverse()
  assert.equal(equalJson(original, reordered), false)
  assert.notEqual(signature(original), signature(reordered))
  assert.equal(equalJson({ key: undefined }, {}), true)
  assert.equal(equalJson({ key: null }, {}), false)
  assert.equal(equalJson([1, 2], { 0: 1, 1: 2 }), false)
})
