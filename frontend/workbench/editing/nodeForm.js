import { showBadges, bindBadges } from '../badges/editor.js'
import { draftOpened } from './formDrafts.js'
import { suggestNodeId } from '../graph/nodeIds.js'
import { showAssignments } from '../modeling/assignmentOptions.js'
import { showNodeFields } from '../modeling/fields.js'
import { legendState } from '../categories/model.js'
import { selectionState, editState } from './state.js'
import { cloneGraph } from '../graph/json.js'
import { effectiveType, nodeTypes } from '../graph/nodeTypes.js'
import { $, el } from '../ui/dom.js'
import { attachSearch, nodeChoiceLabel } from './searchPicker.js'
import { graphModel, outgoing } from '../graph/model.js'
import { categoryDraft, editorLegend } from '../categories/editor.js'
import { sheetFor, startId } from '../diagram/visibleGraph.js'
import { diagramState } from '../diagram/state.js'
import { setupGroups } from '../groups/layout.js'
import { editContext } from './selection.js'
const nodeForm = { node: null, adding: false, parent: null }

function editorField(tag, label, value, cls) {
  const wrap = el('label', '', label),
    field = el(tag, cls)
  field.value = value || ''
  wrap.append(field)
  return { wrap, field }
}

function appendContentBlock(block, sourceIndex = null) {
  const row = el('section', 'editor-block')
  row._block = cloneGraph(block)
  row._sourceIndex = sourceIndex
  const head = el('div', 'block-head')
  head.append(el('strong', '', block.type === 'code' ? '指令' : '說明'))
  for (const [name, action] of [
    [
      '↑',
      () => {
        if (row.previousElementSibling) row.previousElementSibling.before(row)
      },
    ],
    [
      '↓',
      () => {
        if (row.nextElementSibling) row.nextElementSibling.after(row)
      },
    ],
    ['移除', () => row.remove()],
  ]) {
    const b = el('button', '', name)
    b.type = 'button'
    b.setAttribute('aria-label', name === '↑' ? '上移內容' : name === '↓' ? '下移內容' : '移除內容')
    b.onclick = action
    head.append(b)
  }
  row.append(head)
  if (block.type === 'code') {
    const title = editorField('input', '指令標籤', block.label, 'block-label')
    row.append(title.wrap)
  }
  const value = editorField(
    'textarea',
    block.type === 'code' ? '指令內容' : '處理說明',
    block.value,
    'block-value' + (block.type === 'code' ? ' code-value' : ''),
  )
  value.field.rows = block.type === 'code' ? 4 : 3
  row.append(value.wrap)
  if (block.type === 'code') {
    const details = el('details')
    details.append(el('summary', '', '進階選項'))
    const options = editorField(
        'textarea',
        '選項（每行一項，留空代表無選單）',
        (block.radio || []).join('\n'),
        'block-options',
      ),
      def = editorField('input', '預設選項', block['radio-default'], 'block-default')
    details.append(options.wrap, def.wrap)
    row.append(details)
  }
  $('content-editor').append(row)
}

function appendEditorEdge(edge) {
  const row = el('div', 'editor-edge')
  row._edge = cloneGraph(edge)
  const targetWrap = el('div', '', '目標節點'),
    target = el('select')
  target.className = 'edge-target'
  if (!edge.to) {
    target.prepend(new Option('選擇目標節點', '', true, true))
    target.value = ''
    target.required = true
  }
  targetWrap.append(attachSearch(target, edge.to, '目標節點'))
  const kindWrap = el('label', '', '連線類型'),
    kind = el('select', 'edge-kind')
  for (const [value, label] of [
    ['next', '下一步'],
    ['return', '返回'],
    ['retry', '重試'],
  ]) {
    const o = el('option', '', label)
    o.value = value
    kind.append(o)
  }
  kind.value = edge.kind
  kindWrap.append(kind)
  const label = editorField('input', '條件文字', edge.label, 'edge-condition'),
    remove = el('button', '', '移除')
  remove.type = 'button'
  remove.setAttribute('aria-label', '移除連線')
  remove.onclick = () => row.remove()
  row.append(targetWrap, kindWrap, label.wrap, remove)
  const extras = el('div', 'edge-extra'),
    fallback = editorField(
      'input',
      '獨立開啟時的返回目標 ID（逗號分隔）',
      (edge.fallback || []).join(', '),
      'edge-fallback',
    )
  extras.append(fallback.wrap)
  const update = () => {
    extras.hidden = target.value !== '$caller'
    if (!extras.hidden) kind.value = 'return'
  }
  target.onchange = update
  update()
  row.append(extras)
  if (edge.resume) {
    const info = el(
      'small',
      'edge-extra',
      '完成後接回 ' + edge.resume + ' · ' + graphModel.nodes[edge.resume]?.title,
    )
    row.append(info)
  }
  $('edge-editor').append(row)
}

function appendIncoming(id = '', condition = '') {
  const row = el('div', 'edit-row'),
    select = el('select'),
    label = el('input'),
    remove = el('button', '', '移除')
  select.setAttribute('aria-label', '前序節點')
  label.placeholder = '連線條件（選填）'
  label.ariaLabel = '前序連線條件'
  label.maxLength = 200
  remove.type = 'button'
  remove.onclick = () => row.remove()
  label.className = 'incoming-condition'
  label.value = condition
  row.append(attachSearch(select, id, '前序節點'), label, remove)
  $('added-incoming').append(row)
}

export function showReturnTarget(value, self) {
  const field = $('return-target-field')
  const targets = Object.values(graphModel.nodes).filter(node => node.id !== self && !node.jumpTo)
  const select = $('node-return-target')
  const prior = select.closest('.node-picker')
  field.append(attachSearch(select, value, '返回目標', targets))
  prior?.remove()
}

export function syncReturnField() {
  const enabled = $('node-type').value === 'return'
  $('return-target-field').hidden = !enabled
  $('return-target-field').querySelector('input').disabled = !enabled
}

function populateEditor(id, add = false) {
  nodeForm.adding = add
  nodeForm.parent = add ? id : null
  nodeForm.node = add ? null : id
  const type = add && id && sheetFor(id) !== 'project' ? 'shared' : 'action'
  nodeForm.autoId = add
  nodeForm.suggestion = add ? suggestNodeId(type, graphModel.nodes) : ''
  const n = add
    ? {
        id: nodeForm.suggestion,
        title: '',
        group: graphModel.nodes[id]?.group || 'Custom',
        decision: false,
        description: '',
        content: [],
      }
    : graphModel.nodes[id]
  if (!n) return
  categoryDraft.items = []
  $('category-name').value = ''
  $('category-error').textContent = ''
  editorLegend(n)
  $('added-incoming').replaceChildren()
  const previous = add ? (id ? [id] : []) : graphModel.edges.filter((e) => e.to === id).map((e) => e.from)
  $('current-incoming').textContent = previous.length
    ? '目前前序：' + [...new Set(previous)].map(k => nodeChoiceLabel(graphModel.nodes[k])).join('、')
    : '尚無前序連線'
  $('editor-title').textContent = add ? (id ? '新增後續節點' : '建立獨立節點') : '編輯 ' + n.title
  $('editor-context').textContent = add
    ? id
      ? '套用後會自動從「' + graphModel.nodes[id].title + '」連到這個新節點。'
      : '可先儲存獨立節點，之後再加入前序或後續連線。'
    : '節點 ID 保持不變，其他連線會沿用目前節點。'
  for (const key of ['id', 'group', 'title', 'description', 'where', 'expect', 'note'])
    $('node-' + key).value = n[key] || ''
  $('node-id').readOnly = !add
  $('suggest-id').hidden = !add
  checkNodeId()
  $('node-type').replaceChildren(...Object.entries(nodeTypes).map(([key, name]) => new Option(name, key)))
  $('node-type').value = add ? type : n.jumpTo ? 'return' : effectiveType(n)
  showReturnTarget(n.jumpTo, add ? null : n.id)
  syncReturnField()
  $('content-editor').replaceChildren()
  n.content.forEach((block, index) => appendContentBlock(block, index))
  $('edge-editor').replaceChildren()
  if (!add) (outgoing.get(id) || []).filter((e) => e.kind !== 'spine').forEach(appendEditorEdge)
  setupGroups(n)
  showAssignments(n)
  showBadges(n)
  showNodeFields(n)
  $('delete-node').hidden = add
  $('editor-main-note').textContent = ''
  $('editor-error').textContent = ''
  $('new-node').hidden = add
  window.dispatchEvent(new Event('studio-edit-target'))
  draftOpened()
}

function checkNodeId() {
  const field = $('node-id'),
    id = field.value
  let error = ''
  if (nodeForm.adding) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id))
      error = '請以英文字母開頭，限 64 字，可用數字、底線或連字號。'
    else if (
      Object.hasOwn(graphModel.nodes, id) ||
      ['constructor', 'prototype', '__proto__'].includes(id)
    )
      error = '此 ID 已使用或為保留字，請更換。'
  }
  field.setCustomValidity(error)
  field.setAttribute('aria-invalid', String(!!error))
  $('id-check').textContent = error || (nodeForm.adding ? 'ID 可用' : '')
}

function openNodeEditor() {
  if (editState.enabled && selectionState.editTarget?.edge) {
    editContext()
    return
  }
  const id =
    (editState.enabled && selectionState.editTarget?.node) || diagramState.selected?.id || startId()
  populateEditor(id)
  $('node-editor').showModal()
}

function bindNodeForm() {
  bindBadges()
  $('node-id').oninput = () => {
    nodeForm.autoId = !$('node-id').value
    checkNodeId()
  }
  function updateSuggestion(force) {
    if (!nodeForm.adding) return
    const field = $('node-id')
    if (force) nodeForm.autoId = true
    nodeForm.suggestion = suggestNodeId($('node-type').value, graphModel.nodes)
    if (nodeForm.autoId) field.value = nodeForm.suggestion
    checkNodeId()
  }
  $('node-type').onchange = () => { syncReturnField(); updateSuggestion(false) }
  $('suggest-id').onclick = () => updateSuggestion(true)
  $('create-node').onclick = () => {
    populateEditor(null, true)
    $('node-editor').showModal()
    $('node-id').focus()
  }
  $('add-category').onclick = () => {
    const input = $('category-name'),
      name = input.value.trim(),
      msg = $('category-error')
    const existing = [...legendState.legendNames, ...categoryDraft.items.map((c) => c.name)]
    if (
      !name ||
      existing.some((s) => s.toLowerCase() === name.toLowerCase()) ||
      Object.values(graphModel.nodes).some((n) =>
        [n.group, ...(n.tags || [])].some((t) => t?.toLowerCase() === name.toLowerCase()),
      )
    ) {
      msg.textContent = '此名稱為空或已用於分類、群組或標籤，請換一個名稱。'
      input.focus()
      return
    }
    const checked = [...$('legend-fields').querySelectorAll('input:checked')].map((i) => i.value)
    categoryDraft.items.push({ name, color: $('category-color').value })
    editorLegend({ tags: [...checked, name] })
    input.value = ''
    msg.textContent = ''
  }
  $('add-incoming').onclick = () => appendIncoming()
  $('edit-node').onclick = openNodeEditor
  $('editor-close').onclick = () => $('node-editor').close()
  $('add-text-block').onclick = () => appendContentBlock({ type: 'text', value: '' })
  $('add-code-block').onclick = () =>
    appendContentBlock({ type: 'code', language: 'bash', value: '', label: '' })
  $('add-edge').onclick = () =>
    appendEditorEdge({
      from: nodeForm.node || $('node-id').value,
      to: '',
      kind: 'next',
      label: '',
      dashed: false,
    })
}

export { bindNodeForm, nodeForm, populateEditor, appendContentBlock, appendEditorEdge, appendIncoming }
