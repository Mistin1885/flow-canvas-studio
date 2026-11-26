import { $ } from '../ui/dom.js'
import { groupConnections, optionCounts, reservedOption, validateName } from './catalog.js'
import { annotateOptions, choices, controlFor, updateControls } from './controls.js'
import { optionEdits, optionGraph, restoreOptionEdits, stageOptionEdit } from './draft.js'

export function showOptionStatus() {
  $('option-changes').textContent = optionEdits.length ? '待套用的共用選項變更：' + optionEdits.length + ' 筆' : ''
}

export function bindOptionManager() {
  const form = $('node-form'), dialog = $('option-dialog'), picker = $('managed-option'), input = $('option-name')
  $('node-editor').addEventListener('close', () => {
    if (!$('node-editor').open) restoreOptionEdits()
  })
  let kind
  function impact() {
    const name = picker.value, graph = optionGraph(), count = optionCounts(graph, kind).get(name) || 0
    input.value = name
    const field = kind.startsWith('field:')
    $('option-add').hidden = !field
    input.disabled = !name && !field
    for (const id of ['option-rename', 'option-delete']) $(id).disabled = !name
    const multi = kind === 'badge' || kind === 'category'
    const links = kind === 'group' ? groupConnections(graph, name).length : 0
    $('option-impact').textContent = name
      ? '目前畫布有 ' + count + ' 個節點使用此項目。改名會更新全部引用。' +
        (multi ? '刪除只會移除此項目，其他已選項目會保留。' : '刪除後，這些節點的此欄位會變為未指定。') +
        (links ? '刪除也會移除 ' + links + ' 條群組連線。' : '')
      : '目前沒有可管理的選項。'
    $('option-error').textContent = ''
  }
  form.addEventListener('click', e => {
    const trigger = e.target.closest('[data-manage-options]')
    if (!trigger) {
      if (e.target.closest('#add-category,#add-group,#badge-style-apply,#badge-assignments')) annotateOptions()
      return
    }
    kind = trigger.dataset.manageOptions
    $('option-title').textContent = '管理' + trigger.dataset.optionLabel
    const counts = optionCounts(optionGraph(), kind)
    picker.replaceChildren(...choices(kind).filter(o => !reservedOption(kind, o.value))
      .map(o => new Option(o.value + ' · ' + (counts.get(o.value) || 0) + ' 個節點', o.value)))
    const selected = kind === 'category' ? choices(kind).find(c => c.checked)?.value : controlFor(kind).value
    if (selected && [...picker.options].some(o => o.value === selected)) picker.value = selected
    impact()
    dialog.showModal()
  })
  form.addEventListener('change', e => {
    if (['badge-picker', 'node-role', 'node-where'].includes(e.target.id)) annotateOptions()
  })
  picker.onchange = impact
  $('option-close').onclick = () => dialog.close()
  function stage(from, to) {
    try {
      if (from === null && !kind.startsWith('field:')) return
      if (from === to) { dialog.close(); return }
      validateName(kind, from, to, choices(kind).map(o => o.value))
      // An imported tag without a catalog entry should never be merged implicitly.
      if (kind === 'category' && to && optionCounts(optionGraph(), kind).has(to))
        throw Error('此名稱已用於其他節點標籤。')
      const edit = { kind, from, to }
      stageOptionEdit(edit)
      updateControls(edit)
      showOptionStatus()
      form.dispatchEvent(new Event('change', { bubbles: true }))
      dialog.close()
    } catch (e) { $('option-error').textContent = e.message }
  }
  $('option-form').onsubmit = e => { e.preventDefault(); stage(picker.value || null, input.value.trim()) }
  $('option-add').onclick = () => stage(null, input.value.trim())
  $('option-delete').onclick = () => stage(picker.value, null)
}
