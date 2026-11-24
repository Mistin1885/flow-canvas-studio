// Persist only edited controls. A textarea normalizes line endings when it displays a block.
export function savedBlock(row) {
  const block = { ...row._block }
  const value = row.querySelector('.block-value').value
  if (value !== (block.value ?? '').replace(/\r\n?/g, '\n')) block.value = value
  if (block.type !== 'code') return block
  const label = row.querySelector('.block-label').value
  if (label !== (block.label ?? '').replace(/[\r\n]/g, '')) block.label = label
  const options = row.querySelector('.block-options').value
  const selected = row.querySelector('.block-default').value
  if (options !== (block.radio || []).join('\n').replace(/\r\n?/g, '\n') ||
      selected !== (block['radio-default'] || '')) {
    const choices = options.split('\n').map(x => x.trim()).filter(Boolean)
    if (choices.length) {
      block.radio = choices
      block['radio-default'] = selected.trim() || choices[0]
    } else {
      delete block.radio
      delete block['radio-default']
    }
  }
  return block
}
