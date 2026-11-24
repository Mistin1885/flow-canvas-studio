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
export function showNodeFields(n) {
  $('node-role').value = n.ownerRole || ''
  $('role-suggestions').replaceChildren(...[...new Set(Object.values(graphModel.nodes).map(n => n.ownerRole).filter(Boolean))].map(role => new Option(role,role)))
  $('node-gateway').value = n.gatewayRule || ''
  $('custom-values').replaceChildren()
  for (const f of definitions(graphModel.document)) {
    const label = el('label', '', f.name + (f.unit ? ' (' + f.unit + ')' : ''))
    const input = el(f.type === 'select' ? 'select' : 'input')
    if (f.type === 'select') input.append(new Option('未填寫',''), ...(f.options || []).map(v => new Option(v,v)))
    else { input.type = f.type; if (f.type === 'number') input.step = 'any' }
    input.dataset.field = f.id
    input.value = n.fieldValues?.[f.id] ?? ''
    label.append(input)
    $('custom-values').append(label)
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
