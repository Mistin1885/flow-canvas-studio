import { manageButton } from '../options/controls.js'
import { optionCounts } from '../options/catalog.js'
import { $, el } from '../ui/dom.js'
import { graphModel } from '../graph/model.js'

export const rules = {
  'split-all': '分流 · 同時進行', 'split-one': '分流 · 擇一進行',
  'join-all': '匯合 · 全部完成', 'join-any': '匯合 · 任一完成',
}
export function definitions(graph) {
  return Array.isArray(graph.fieldDefinitions) ? graph.fieldDefinitions.filter(f =>
    f && typeof f.id === 'string' && typeof f.name === 'string' && ['text', 'number', 'select'].includes(f.type)) : []
}
export function properties(node, graph = graphModel.document) {
  return definitions(graph).filter(f => Object.hasOwn(node.fieldValues || {}, f.id)).map(f =>
    [f.name, String(node.fieldValues[f.id]) + (f.unit ? ' ' + f.unit : '')])
}
export function showNodeFields(n, graph = graphModel.document) {
  $('node-gateway').value = n.gatewayRule || ''
  $('custom-values').replaceChildren()
  for (const f of definitions(graph)) {
    const label = el('label', '', f.name + (f.unit ? ' (' + f.unit + ')' : ''))
    const input = el(f.type === 'select' ? 'select' : 'input')
    if (f.type === 'select') {
      const names = new Set([...(f.options || []), ...optionCounts(graph, 'field:' + f.id).keys()])
      input.append(new Option('未指定',''), ...[...names].map(v => new Option(v,v)))
    }
    else { input.type = f.type; if (f.type === 'number') input.step = 'any' }
    input.dataset.field = f.id
    input.value = n.fieldValues?.[f.id] ?? ''
    label.append(input)
    const wrap = el('div', 'custom-value-field')
    wrap.append(label)
    if (f.type === 'select') wrap.append(manageButton('field:' + f.id, f.name))
    $('custom-values').append(wrap)
  }
}
export function readNodeFields(n, before) {
  for (const [key,id] of [['ownerRole','node-role'],['gatewayRule','node-gateway']]) {
    if (before?.fields[id] === $(id).value) continue
    const value = $(id).value.trim()
    if (value) n[key] = value
    else delete n[key]
  }
  const values = { ...n.fieldValues }
  let changed = false
  for (const input of $('custom-values').querySelectorAll('[data-field]')) {
    if (before?.values[input.dataset.field] === input.value) continue
    changed = true
    if (input.value === '') delete values[input.dataset.field]
    else values[input.dataset.field] = input.type === 'number' ? Number(input.value) : input.value
  }
  if (!changed) return
  if (Object.keys(values).length) n.fieldValues = values
  else delete n.fieldValues
}
