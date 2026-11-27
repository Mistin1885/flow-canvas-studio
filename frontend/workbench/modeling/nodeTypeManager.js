import { $ } from '../ui/dom.js'
import { nodeTypes } from '../graph/nodeTypes.js'
import { typeDefinitions, typeDefinition, typeKey } from './nodeTypeCatalog.js'
import { typeDraftGraph, typeEdits, stageTypeEdit } from './nodeTypeDraft.js'

export function showTypeChoices(selected = $('node-type').value) {
  const target = $('node-type')
  target.replaceChildren(...typeDefinitions(typeDraftGraph()).map(item => new Option(item.name, item.id)))
  target.value = selected
  $('type-draft-status').textContent = typeEdits.length ? `待套用的節點類型變更：${typeEdits.length} 筆` : ''
}

// Shared definitions are staged with the node form and captured in its private draft.
export function bindTypeManager() {
  const dialog = $('type-manager'), target = $('managed-type')
  const name = $('type-name'), base = $('type-base'), message = $('type-message')
  let creating = false, confirming = false
  base.replaceChildren(...Object.entries(nodeTypes).map(([id, label]) => new Option(label, id)))
  function refresh() {
    creating = confirming = false
    const graph = typeDraftGraph(), item = typeDefinition(graph, target.value)
    name.value = item?.name || ''
    base.value = item?.baseType || 'action'
    base.disabled = true
    $('type-delete').disabled = !item || Object.hasOwn(nodeTypes, item.id)
    $('type-delete').textContent = '刪除類型'
    $('type-save').textContent = '更新名稱'
    const count = Object.values(graph.nodes).filter(node => typeKey(node) === item?.id).length
    $('type-impact').textContent = `目前畫布有 ${count} 個節點使用此類型。改名會更新全部引用。`
    message.textContent = ''
  }
  function options(id) {
    target.replaceChildren(...typeDefinitions(typeDraftGraph()).map(item => new Option(item.name, item.id)))
    target.value = id
    refresh()
  }
  function changed(selected) {
    showTypeChoices(selected)
    $('node-type').dispatchEvent(new Event('change', { bubbles: true }))
  }
  $('manage-node-types').onclick = () => {
    options($('node-type').value)
    dialog.showModal()
  }
  target.onchange = refresh
  $('type-close').onclick = () => dialog.close()
  $('type-new').onclick = () => {
    creating = true
    confirming = false
    name.value = ''
    base.value = 'action'
    base.disabled = false
    $('type-delete').disabled = true
    $('type-save').textContent = '加入類型'
    $('type-impact').textContent = '新增可重複使用的節點類型。'
    message.textContent = '輸入名稱並選擇基本行為，再按「加入類型」。'
    name.focus()
  }
  $('type-save').onclick = () => {
    try {
      const prior = creating ? null : typeDefinition(typeDraftGraph(), target.value)
      const definition = { ...prior, id: prior?.id || 'type-' + crypto.randomUUID(), name: name.value, baseType: base.value }
      stageTypeEdit({ definition })
      changed(creating ? definition.id : $('node-type').value)
      options(definition.id)
      message.textContent = '已加入草稿；請回到節點編輯器按「套用變更」儲存。'
    } catch (error) { message.textContent = error.message }
  }
  $('type-delete').onclick = () => {
    const graph = typeDraftGraph(), item = typeDefinition(graph, target.value)
    if (!item || Object.hasOwn(nodeTypes, item.id)) return
    const count = Object.values(graph.nodes).filter(node => typeKey(node) === item.id).length
    if (!confirming) {
      confirming = true
      $('type-delete').textContent = '確認刪除類型'
      message.textContent = `刪除「${item.name}」會讓 ${count} 個節點恢復為「${nodeTypes[item.baseType]}」，保留節點內容與個別樣式。`
      return
    }
    stageTypeEdit({ remove: item.id })
    changed($('node-type').value === item.id ? item.baseType : $('node-type').value)
    options(item.baseType)
    message.textContent = '刪除已加入草稿；請回到節點編輯器按「套用變更」儲存。'
  }
}
