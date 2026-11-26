import { $, el } from '../ui/dom.js'
import { badgeDraft, showBadges } from '../badges/editor.js'
import { categoryDraft, editorLegend } from '../categories/editor.js'
import { editState } from '../editing/state.js'
import { pendingOptions } from '../modeling/assignmentOptions.js'
import { assignments, optionCounts, replaceKey, replaceNames, ungrouped } from './catalog.js'
import { optionGraph } from './draft.js'

const ids = { group: 'node-group', badge: 'badge-picker', role: 'node-role', where: 'node-where' }
export function controlFor(kind) {
  return ids[kind] ? $(ids[kind]) :
    [...$('custom-values').querySelectorAll('select')].find(s => 'field:' + s.dataset.field === kind)
}

export function choices(kind) {
  return kind === 'category' ? [...$('legend-fields').querySelectorAll('input')] : [...controlFor(kind).options].filter(o => o.value)
}

export function annotateOptions() {
  const kinds = [...Object.keys(ids), 'category',
    ...[...$('custom-values').querySelectorAll('select')].map(s => 'field:' + s.dataset.field)]
  for (const kind of kinds) {
    const counts = optionCounts(optionGraph(), kind)
    for (const choice of choices(kind)) {
      const name = choice.value
      const text = (kind === 'group' && name === ungrouped ? '未指定' : name) + ' · ' + (counts.get(name) || 0) + ' 個節點'
      const target = kind === 'category' ? choice.parentElement.lastChild : choice
      if (target.textContent !== text) target.textContent = text
    }
  }
}

export function manageButton(kind, label) {
  const button = el('button', 'manage-options', '管理選項')
  button.type = 'button'
  button.dataset.manageOptions = kind
  button.dataset.optionLabel = label
  button.setAttribute('aria-label', '管理' + label + '選項')
  return button
}

export function updateControls({ kind, from, to }) {
  if (kind === 'category') {
    const tags = choices(kind).filter(i => i.checked).map(i => i.value)
    categoryDraft.items = categoryDraft.items.filter(c => c.name !== from || to !== null)
    for (const c of categoryDraft.items) if (c.name === from) c.name = to
    editorLegend({ tags: replaceNames(tags, from, to) })
  } else if (kind === 'badge') {
    const saved = badgeDraft()
    replaceKey(saved.placements, from, to)
    replaceKey(saved.styles, from, to)
    if (saved.edit?.existing && saved.edit.name === from) {
      if (to === null) saved.edit = null
      else saved.edit.name = to
    }
    showBadges({}, saved)
  } else {
    const select = controlFor(kind), current = select.value
    const entry = [...select.options].find(o => o.value === from)
    if (from === null) select.add(new Option(to, to))
    else if (to === null) entry.remove()
    else { entry.value = to; entry.textContent = to }
    if (kind === 'group') {
      const direction = editState.groupDraft.get(from)
      editState.groupDraft.delete(from)
      if (to !== null) editState.groupDraft.set(to, direction)
      else if (!editState.groupDraft.has(ungrouped)) {
        editState.groupDraft.set(ungrouped, 'auto')
        select.add(new Option('未指定', ungrouped))
      }
    } else {
      const spec = assignments.find(a => a.control === kind)
      if (spec) pendingOptions[spec.list] = replaceNames(pendingOptions[spec.list], from, to)
    }
    select.value = current !== from ? current : to ?? (kind === 'group' ? ungrouped : '')
    if (kind === 'group') $('group-direction').value = editState.groupDraft.get(select.value)
  }
  annotateOptions()
}
