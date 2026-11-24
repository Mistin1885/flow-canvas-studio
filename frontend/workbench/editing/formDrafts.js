import { $, el } from '../ui/dom.js'
import { nodeForm, populateEditor, appendContentBlock, appendEditorEdge, appendIncoming } from './nodeForm.js'
import { categoryDraft, editorLegend } from '../categories/editor.js'
import { editState } from './state.js'

import { pendingOptions, showAssignments } from '../modeling/assignmentOptions.js'
import { suggestNodeId } from '../graph/nodeIds.js'

let context, active, baseKey, initial, lastSaved, pending
const valueIds = [
  'node-id', 'node-title', 'node-type', 'node-description', 'node-where', 'node-expect', 'node-note',
  'node-role', 'role-name', 'where-name', 'node-gateway', 'node-group', 'group-name', 'category-name', 'category-color',
]

function scope() { return JSON.stringify([context.user, context.canvas]) }
function draftPrefix() { return 'flow-form:' + scope() + ':' }
function targetKey() { return draftPrefix() + JSON.stringify([nodeForm.adding, nodeForm.node, nodeForm.parent]) }
function read(key) { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }

function keys() {
  const list = [], prefix = draftPrefix()
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(prefix) && !key.endsWith(':base')) list.push(key)
  }
  return list
}

function menu() {
  try { $('recover-form').hidden = !context || keys().length === 0 }
  catch { $('recover-form').hidden = true }
}

function remove(key) {
  if (!key) return
  try {
    const shared = read(key)?.baseKey
    localStorage.removeItem(key)
    localStorage.removeItem(key + ':base')
    if (shared && !keys().some(k => read(k)?.baseKey === shared)) localStorage.removeItem(shared)
  } catch { /* The browser may disable storage after opening the form. */ }
  menu()
}

// Forms at the same canvas revision share their baseline. Access the full graph only on the
// first meaningful edit, and compare once in case a concurrent save used the same revision.
function storeBase(base) {
  const canonical = 'flow-form-base:' + scope() + ':' + base.canvas.rev
  const json = JSON.stringify(base)
  const previous = localStorage.getItem(canonical)
  if (previous === json) return canonical
  const key = previous === null ? canonical : canonical + ':' + crypto.randomUUID()
  localStorage.setItem(key, json)
  return key
}

function contentRows() {
  return [...$('content-editor').children].map(row => {
    const block = { ...row._block, value: row.querySelector('.block-value').value }
    if (block.type === 'code') {
      block.label = row.querySelector('.block-label').value
      block.radio = row.querySelector('.block-options').value.split('\n')
      block['radio-default'] = row.querySelector('.block-default').value
    }
    return block
  })
}

export function formValues() {
  return {
    adding: nodeForm.adding, node: nodeForm.node, parent: nodeForm.parent,
    fields: Object.fromEntries(valueIds.map(id => [id, $(id).value])),
    options: pendingOptions, autoId: nodeForm.autoId,
    groups: [...editState.groupDraft], categories: categoryDraft.items,
    tags: [...$('legend-fields').querySelectorAll('input')].filter(i => i.checked).map(i => i.value),
    values: Object.fromEntries([...$('custom-values').querySelectorAll('[data-field]')].map(i => [i.dataset.field, i.value])),
    content: contentRows(),
    incoming: [...$('added-incoming').children].map(row => [row.querySelector('select').value, row.querySelector('.incoming-condition').value]),
    edges: [...$('edge-editor').children].map(row => ({
      original: row._edge, to: row.querySelector('.edge-target').value,
      kind: row.querySelector('.edge-kind').value, label: row.querySelector('.edge-condition').value,
      fallbackText: row.querySelector('.edge-fallback').value,
    })),
  }
}

function capture() {
  if (!active || pending || !$('node-editor').open) return
  const values = formValues(), json = JSON.stringify(values)
  if (json === lastSaved) return
  try {
    if (json === initial) {
      remove(active)
      baseKey = null
      $('form-draft-status').textContent = ''
    } else {
      if (!baseKey) {
        const base = context.snapshot()
        if (!base) return
        baseKey = storeBase(base)
      }
      const contentSources = [...$('content-editor').children].map(row => row._sourceIndex)
      localStorage.setItem(active, JSON.stringify({ ...values, contentSources, baseKey }))
      $('form-draft-status').textContent = '草稿已存在此瀏覽器'
      $('recover-form').hidden = false
    }
    lastSaved = json
  } catch {
    $('form-draft-status').textContent = '瀏覽器無法暫存，關閉前請先套用變更。'
  }
}

function prompt(visible) {
  pending = visible
  const banner = $('draft-prompt')
  banner.hidden = !visible
  for (const section of banner.parentElement.children) {
    if (section !== banner && section !== $('form-draft-status')) section.inert = visible
  }
  $('node-form').querySelector('footer').inert = visible
}

function resume(key) {
  const saved = read(key), base = saved && read(saved.baseKey || key + ':base')
  if (!saved || !base) {
    $('form-draft-status').textContent = '無法讀取草稿所使用的畫布版本。'
    return
  }
  context.restore(base)
  populateEditor(saved.adding ? saved.parent : saved.node, saved.adding)
  editState.groupDraft = new Map(saved.groups)
  $('node-group').replaceChildren(...saved.groups.map(([name]) => new Option(name, name)))
  showAssignments({ ownerRole: saved.fields['node-role'], where: saved.fields['node-where'] }, saved.options)
  if (saved.adding) nodeForm.suggestion = suggestNodeId(saved.fields['node-type'], base.graph.nodes)
  for (const id of valueIds) $(id).value = saved.fields[id] ?? ''
  $('group-direction').value = editState.groupDraft.get($('node-group').value) || 'auto'
  $('node-id').dispatchEvent(new Event('input'))
  nodeForm.autoId = saved.autoId ?? (saved.adding && saved.fields['node-id'] === nodeForm.suggestion)
  categoryDraft.items = saved.categories
  editorLegend({ tags: saved.tags })
  for (const i of $('custom-values').querySelectorAll('[data-field]')) i.value = saved.values[i.dataset.field] ?? ''
  $('content-editor').replaceChildren()
  saved.content.forEach((block, index) => {
    const source = saved.contentSources?.[index] ?? null
    appendContentBlock(block, source)
    const row = $('content-editor').lastElementChild
    if (source !== null) row._block = base.graph.nodes[saved.node].content[source]
    else if (block.type === 'code') {
      // Draft controls keep even incomplete radio input. Use the controls to validate it on apply.
      delete row._block.radio
      delete row._block['radio-default']
    }
  })
  $('edge-editor').replaceChildren()
  for (const { fallbackText, original, ...edge } of saved.edges) {
    appendEditorEdge({ ...original, ...edge })
    const row = $('edge-editor').lastElementChild
    if (original) row._edge = original
    row.querySelector('.edge-fallback').value = fallbackText
  }
  for (const [id, label] of saved.incoming) appendIncoming(id, label)
  baseKey = saved.baseKey || key + ':base'
  lastSaved = JSON.stringify(formValues())
  prompt(false)
  $('form-draft-status').textContent = '已恢復草稿，套用後才會發佈'
  if (!$('node-editor').open) $('node-editor').showModal()
}

export function draftOpened() {
  active = context ? targetKey() : null
  baseKey = null
  initial = JSON.stringify(formValues())
  nodeForm.initial = JSON.parse(initial)
  lastSaved = initial
  prompt(!!(active && read(active)))
  $('form-draft-status').textContent = ''
}

export function draftApplied() {
  remove(active)
  active = null
  prompt(false)
}

export function configureDrafts(options) {
  if ($('node-editor').open) $('node-editor').close()
  if ($('draft-list').open) $('draft-list').close()
  context = options
  active = null
  prompt(false)
  menu()
  $('recover-form').onclick = () => {
    const list = $('saved-forms')
    list.replaceChildren()
    for (const key of keys()) {
      const saved = read(key)
      if (!saved) continue
      const row = el('div', 'field-row')
      const button = el('button', '', saved.fields['node-title'] || saved.fields['node-id'] || '未命名節點')
      button.onclick = () => { $('draft-list').close(); resume(key) }
      const discard = el('button', '', '捨棄')
      discard.onclick = () => {
        if (!confirm('捨棄此節點的未發佈草稿？')) return
        remove(key)
        row.remove()
        if (!list.children.length) $('draft-list').close()
      }
      row.append(button, discard)
      list.append(row)
    }
    $('draft-list').showModal()
  }
  $('draft-list-close').onclick = () => $('draft-list').close()
  $('draft-resume').onclick = () => resume(active)
  $('draft-discard').onclick = () => { remove(active); prompt(false) }
}

export function bindFormDrafts() {
  const form = $('node-form')
  form.addEventListener('input', capture)
  form.addEventListener('change', capture)
  // The picker dispatches a non-bubbling change for pointer and keyboard selections.
  form.addEventListener('change', e => { if (e.target.matches('.node-picker select')) capture() }, true)
  form.addEventListener('click', e => {
    if (e.target.closest('#draft-prompt,#editor-close,#new-node,#delete-node,button[type=submit]')) return
    if (e.target.closest('button,[role=option]')) capture()
  })
  form.addEventListener('click', e => {
    if (pending && !e.target.closest('#draft-prompt,#editor-close')) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }, true)
  form.addEventListener('submit', e => {
    if (!pending) return
    e.preventDefault()
    e.stopImmediatePropagation()
    $('form-draft-status').textContent = '請先選擇恢復或捨棄草稿。'
  }, true)
}
