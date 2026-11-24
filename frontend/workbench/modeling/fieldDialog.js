import { $, el } from '../ui/dom.js'
import { exportGraph } from '../io/graph.js'
import { replaceGraph } from '../graph/replace.js'
import { definitions, rules } from './fields.js'

export function bindFields() {
  $('node-gateway').append(...Object.entries(rules).map(([key,label]) => new Option(label,key)))
  const dialog = $('field-dialog'), type = $('field-type')
  function refresh() {
    const graph = exportGraph()
    $('field-list').replaceChildren(...definitions(graph).map(f => {
      const row = el('div','field-row')
      row.append(el('span','',f.name + ' · ' + ({text:'文字',number:'數字',select:'選項'}[f.type]) + (f.unit ? ' · '+f.unit : '')))
      const remove = el('button','','移除')
      remove.type = 'button'
      remove.onclick = () => {
        if (!confirm('從所有節點移除「'+f.name+'」及其值？')) return
        const latest = exportGraph()
        latest.fieldDefinitions = definitions(latest).filter(item => item.id !== f.id)
        for (const node of Object.values(latest.nodes)) if (node.fieldValues) delete node.fieldValues[f.id]
        replaceGraph(latest)
        dialog.close()
      }
      row.append(remove)
      return row
    }))
  }
  $('manage-fields').onclick = () => {
    refresh(); $('field-form').reset(); type.onchange(); $('field-error').textContent=''; dialog.showModal()
  }
  $('fields-close').onclick = () => dialog.close()
  type.onchange = () => {
    $('field-unit').parentElement.hidden = type.value !== 'number'
    $('field-options').parentElement.hidden = type.value !== 'select'
  }
  $('field-form').onsubmit = event => {
    event.preventDefault()
    const graph = exportGraph(), name = $('field-name').value.trim()
    const options = [...new Set($('field-options').value.split('\n').map(v => v.trim()).filter(Boolean))]
    if (!name || definitions(graph).some(f => f.name === name) || (type.value === 'select' && !options.length)) {
      $('field-error').textContent = '請使用未重複的名稱，並為選項欄位加入至少一個選項。'
      return
    }
    graph.fieldDefinitions = [...definitions(graph), {id:'field-'+crypto.randomUUID(), name, type:type.value,
      ...(type.value === 'number' ? {unit:$('field-unit').value.trim()} : {}),
      ...(type.value === 'select' ? {options} : {})}]
    replaceGraph(graph); dialog.close()
  }
}
