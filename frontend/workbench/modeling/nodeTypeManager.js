import { $ } from '../ui/dom.js'
import { nodeTypes } from '../graph/nodeTypes.js'
import { typeDefinitions, typeDefinition, typeKey, setTypeDefinition, deleteTypeDefinition } from './nodeTypeCatalog.js'

// Changes live in the style dialog's private graph until its Apply action.
export function bindTypeManager({ graph, target, changed, render }) {
  let creating = false, confirming = false
  const name = $('type-name'), base = $('type-base'), message = $('type-message')
  base.replaceChildren(...Object.entries(nodeTypes).map(([id, label]) => new Option(label, id)))
  function refresh() {
    creating = confirming = false
    const item = typeDefinition(graph(), target.value)
    name.value = item?.name || ''
    base.value = item?.baseType || 'action'
    base.disabled = true
    $('type-delete').disabled = !item || Object.hasOwn(nodeTypes, item.id)
    $('type-delete').textContent = '刪除類型'
    $('type-save').textContent = '更新名稱'
    message.textContent = ''
  }
  function options(id) {
    target.replaceChildren(...typeDefinitions(graph()).map(item => new Option(item.name, item.id)))
    target.value = id
  }
  $('type-new').onclick = () => {
    creating = true
    confirming = false
    name.value = ''
    base.value = 'action'
    base.disabled = false
    $('type-delete').disabled = true
    $('type-save').textContent = '加入類型'
    message.textContent = '輸入名稱並選擇基本行為，加入後即可設定樣式。最後按「套用樣式」保存。'
    name.focus()
  }
  $('type-save').onclick = () => {
    try {
      const prior = creating ? null : typeDefinition(graph(), target.value)
      const item = setTypeDefinition(graph(), {
        ...prior, id: prior?.id || 'type-' + crypto.randomUUID(), name: name.value, baseType: base.value,
      })
      changed()
      options(item.id)
      refresh()
      render()
      message.textContent = '已加入待套用變更；按「套用樣式」保存。'
    } catch (error) { message.textContent = error.message }
  }
  $('type-delete').onclick = () => {
    const item = typeDefinition(graph(), target.value)
    if (!item || Object.hasOwn(nodeTypes, item.id)) return
    const count = Object.values(graph().nodes).filter(node => typeKey(node) === item.id).length
    if (!confirming) {
      confirming = true
      $('type-delete').textContent = '確認刪除類型'
      message.textContent = `刪除「${item.name}」會讓 ${count} 個節點恢復為「${nodeTypes[item.baseType]}」，保留節點內容與個別樣式。`
      return
    }
    deleteTypeDefinition(graph(), item.id)
    changed()
    options(item.baseType)
    refresh()
    render()
    message.textContent = '刪除已加入待套用變更；按「套用樣式」保存。'
  }
  return { refresh }
}
