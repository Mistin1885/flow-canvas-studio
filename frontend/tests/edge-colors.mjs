import assert from 'node:assert/strict'
import { test } from 'node:test'
import { edgeColors, labelColor, storeEdgeColors, validLabelBackground } from '../workbench/appearance/edgeColors.js'

test('legacy edges keep their original colors and JSON on an unchanged save', () => {
  const edge = {label: 'yes', conditionColor: '#AA5599'}
  assert.equal(labelColor(edge), '#AA5599')
  storeEdgeColors(edge, '#aa5599', '#aa5599')
  assert.deepEqual(edge, {label:'yes', conditionColor:'#AA5599'})
  storeEdgeColors(edge, '#223344', '#aa5599')
  assert.deepEqual(edgeColors(edge), {line:'#223344', background:'#aa5599'})
})

test('the stroke and label can independently use automatic or custom colors', () => {
  const edge = {label:'fail'}
  for (const line of [null, '#aabbcc'])
    for (const background of [null, '#ffffff']) {
      storeEdgeColors(edge, line, background)
      const saved = JSON.parse(JSON.stringify(edge))
      assert.deepEqual(edgeColors(saved), {line, background})
      assert.equal(labelColor(saved), background || '#a34935')
    }
  storeEdgeColors(edge, null, null)
  assert.deepEqual(edge, {label:'fail'})
  for (const invalid of [null, 123, '#abc', 'red']) assert.equal(validLabelBackground(invalid), false)
})
