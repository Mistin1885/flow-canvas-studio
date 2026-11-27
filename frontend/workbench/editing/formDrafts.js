import { $, el } from '../ui/dom.js'
import { nodeForm, populateEditor } from './nodeForm.js'
import { formValues, restoreValues } from './formValues.js'
import { replaceGraph } from '../graph/replace.js'
import { equalJson } from '../../shared/jsonComparison.js'
import { graphModel } from '../graph/model.js'
import { validateGraph } from '../graph/validate.js'
import { formBaseline, setFormBaseline } from './formSource.js'
import { keys, read, remove, setDraftScope, storeBase, targetKey } from './draftStorage.js'
import { draftStatus } from './draftStatus.js'
import { say } from '../ui/toast.js'

let context, active, baseKey, initial, lastSaved, loading, unavailable

function menu() {
  try { $('recover-form').hidden = !context || keys().length === 0 }
  catch { $('recover-form').hidden = true }
}

function capture() {
  if (loading || unavailable || !$('node-editor').open) return
  const values = formValues(), json = JSON.stringify(values)
  if (json === lastSaved) return
  try {
    if (json === initial) {
      remove(active)
      baseKey = null
      menu()
      draftStatus('clean', nodeForm.adding, !!context)
      if (context && !nodeForm.adding && formBaseline()?.graph !== graphModel.document) {
        refreshTeamForm()
        return
      }
    } else if (context) {
      const base = currentFormBase()
      if (!base) throw Error('Missing baseline')
      baseKey ??= storeBase(base)
      const contentSources = [...$('content-editor').children].map(row => row._sourceIndex)
      localStorage.setItem(active, JSON.stringify({ ...values, contentSources, baseKey }))
      $('recover-form').hidden = false
      draftStatus('private', nodeForm.adding, true)
    } else draftStatus('private', nodeForm.adding, false)
    lastSaved = json
  } catch {
    lastSaved = null
    draftStatus('error', nodeForm.adding, !!context)
  }
}

function currentFormBase() {
  const snap = context?.snapshot()
  // A follow-up form can open while its parent's optimistic save is being confirmed.
  return snap && snap.graph === formBaseline()?.graph ? snap : formBaseline()
}

export function publishForm(graph, options) {
  if (unavailable) throw Error('此草稿的原始版本無法讀取，請先捨棄草稿。')
  const base = currentFormBase()
  if (context && base && (base.canvas.rev !== context.snapshot()?.canvas.rev ||
      (base.graph !== graphModel.document && !equalJson(base.graph, graphModel.document)))) {
    const next = validateGraph(graph)
    window.dispatchEvent(new CustomEvent('studio-change', {
      detail: { ...options, previous: base.graph, next, formBase: base },
    }))
  } else replaceGraph(graph, options)
}

export function beginDraft() {
  loading = true
  unavailable = false
  active = context ? targetKey(nodeForm) : null
  const saved = active && read(active)
  const base = saved && read(saved.baseKey || active + ':base')
  const snap = context?.snapshot()
  setFormBaseline(base || (snap && { ...snap, graph: graphModel.document }))
  baseKey = base ? saved.baseKey || active + ':base' : null
  unavailable = !!saved && !base
  return base ? saved : null
}

export function draftOpened(saved) {
  initial = JSON.stringify(formValues())
  nodeForm.initial = JSON.parse(initial)
  if (saved) restoreValues(saved, formBaseline())
  lastSaved = JSON.stringify(formValues())
  loading = false
  draftStatus(unavailable ? 'unreadable' : saved ? 'private' : 'clean', nodeForm.adding, !!context)
}

export function refreshTeamForm() {
  const dialog = $('node-editor')
  if (!dialog.open || dialog.dataset.draftState !== 'clean' || $('option-dialog').open || $('type-manager').open) return
  if (!graphModel.nodes[nodeForm.node]) {
    dialog.close()
    say('此節點已由團隊移除。')
  } else populateEditor(nodeForm.node)
}

export function draftApplied() {
  try { remove(active) } catch { /* Publishing can still succeed with storage disabled. */ }
  active = null
  menu()
}

function confirmDiscard(description, onConfirm) {
  const dialog = $('discard-draft-dialog')
  $('discard-draft-description').textContent = description
  $('discard-draft-confirm').onclick = () => {
    dialog.close()
    onConfirm()
  }
  dialog.showModal()
}

function discard() {
  try { remove(active) } catch { draftStatus('error', nodeForm.adding, !!context); return }
  menu()
  const id = nodeForm.adding ? nodeForm.parent : nodeForm.node
  if (id && !graphModel.nodes[id]) {
    $('node-editor').close()
    say('已捨棄草稿。此節點已從畫布移除。')
  } else populateEditor(id, nodeForm.adding)
}

export function configureDrafts(options) {
  if ($('discard-draft-dialog').open) $('discard-draft-dialog').close()
  if ($('node-editor').open) $('node-editor').close()
  if ($('draft-list').open) $('draft-list').close()
  context = options
  setDraftScope(options.user, options.canvas)
  active = null
  menu()
  $('recover-form').onclick = () => {
    const list = $('saved-forms')
    list.replaceChildren()
    for (const key of keys()) {
      const saved = read(key)
      if (!saved) continue
      const row = el('div', 'field-row')
      const button = el('button', '', saved.fields['node-title'] || saved.fields['node-id'] || '未命名節點')
      button.onclick = () => {
        $('draft-list').close()
        populateEditor(saved.adding ? saved.parent : saved.node, saved.adding)
        $('node-editor').showModal()
      }
      const discard = el('button', '', '捨棄')
      discard.onclick = () => confirmDiscard('將移除「' + button.textContent + '」的私人草稿，其他草稿會保留。', () => {
        remove(key)
        menu()
        row.remove()
        if (!list.children.length) $('draft-list').close()
      })
      row.append(button, discard)
      list.append(row)
    }
    $('draft-list').showModal()
  }
  $('draft-list-close').onclick = () => $('draft-list').close()
}

export function bindFormDrafts() {
  const form = $('node-form'), dialog = $('node-editor')
  $('discard-draft-cancel').onclick = () => $('discard-draft-dialog').close()
  $('draft-discard').onclick = () => confirmDiscard(nodeForm.adding
    ? '確認後會清除這個新節點的草稿。'
    : '確認後會載入畫布上的最新版本。', discard)
  dialog.addEventListener('close', () => { if (!dialog.open) setFormBaseline(null) })
  const guardClose = event => {
    if (dialog.dataset.draftState === 'error' && !confirm('瀏覽器未能暫存最新修改，仍要關閉？')) {
      event.preventDefault()
      event.stopImmediatePropagation()
    }
  }
  dialog.addEventListener('cancel', guardClose)
  $('editor-close').addEventListener('click', guardClose, true)
  form.addEventListener('input', capture)
  form.addEventListener('change', capture)
  form.addEventListener('click', e => {
    if (e.target.closest('#draft-discard,#editor-close,#new-node,#delete-node,button[type=submit]')) return
    if (e.target.closest('button,[role=option]')) capture()
  })
}
