import { editState } from './state.js'
import { categoryTags, legendState, originalNames, unmappedTag } from '../categories/model.js'
import { effectiveType } from '../graph/nodeTypes.js'
import { $ } from '../ui/dom.js'
import { nodeForm, populateEditor } from './nodeForm.js'
import { graphModel } from '../graph/model.js'
import { exportGraph } from '../io/graph.js'
import { sheetFor } from '../diagram/visibleGraph.js'

import { categoryDraft } from '../categories/editor.js'

import { replaceGraph } from '../graph/replace.js'
import { go } from '../diagram/navigation.js'
import { say } from '../ui/toast.js'

function applyEditor() {
  const id = $('node-id').value.trim()
  if (nodeForm.adding && Object.hasOwn(graphModel.nodes, id)) throw new Error('節點 ID 已存在')
  const graph = exportGraph(),
    n = nodeForm.adding ? { id } : graph.nodes[id]
  for (const key of ['group', 'title', 'description', 'where', 'expect', 'note'])
    n[key] = $('node-' + key).value.trim()
  const categories = [...$('legend-fields').querySelectorAll('input:checked')].map((input) => input.value)
  if (n.sourceKind === 'subflow' && !nodeForm.adding) n.sheetId = sheetFor(id)
  const oldDirections = new Map((graph.layoutGroups || []).map((g) => [g.name, g.direction]))
  for (const member of Object.values(graph.nodes))
    if ((oldDirections.get(member.group) || 'auto') !== editState.groupDraft.get(member.group))
      delete member.layoutOffset
  graph.layoutGroups = [...editState.groupDraft].map(([name, direction]) => ({
    ...graph.layoutGroups?.find((g) => g.name === name),
    name,
    direction,
  }))
  if (!nodeForm.adding && sheetFor(id) !== 'project') n.sheetId = sheetFor(id)
  if (categoryDraft.items.length)
    graph.customCategories = [...(graph.customCategories || []), ...categoryDraft.items]
  const oldCategories = categoryTags(n)
  if (
    categories.includes(unmappedTag) &&
    categories.some((c) => c !== unmappedTag && originalNames.has(c))
  )
    throw new Error('已選原圖圖例時，請取消「原圖未對應圖例」。')
  if (
    nodeForm.adding ||
    categories.length !== oldCategories.length ||
    categories.some((c) => !oldCategories.includes(c))
  )
    n.legendEdited = true
  const context = (n.tags || []).filter(
    (t) => !legendState.legendNames.has(t) && t !== graphModel.nodes[id]?.group,
  )
  n.tags = [...new Set([...categories, ...context])]
  const type = $('node-type').value
  if (type !== effectiveType(n) || nodeForm.adding) {
    if (n.originalDecision === undefined) n.originalDecision = !!n.decision
    delete n.nodeRole
    n.decision = type === 'decision'
    if (type === 'frame') {
      n.frameMembers ??= []
      for (const owner of Object.values(graph.nodes))
        if (owner.frameMembers?.includes(id))
          owner.frameMembers = owner.frameMembers.filter((k) => k !== id)
    }
  }
  n.type = type
  n.content = [...$('content-editor').children].map((row) => {
    const c = { ...row._block, value: row.querySelector('.block-value').value }
    if (c.type === 'code') {
      c.label = row.querySelector('.block-label').value
      const options = row
        .querySelector('.block-options')
        .value.split('\n')
        .map((x) => x.trim())
        .filter(Boolean)
      if (options.length) {
        c.radio = options
        c['radio-default'] = row.querySelector('.block-default').value.trim() || options[0]
      } else {
        delete c.radio
        delete c['radio-default']
      }
    }
    return c
  })
  if (nodeForm.adding && nodeForm.parent && sheetFor(nodeForm.parent) !== 'project') {
    n.sheetId = sheetFor(nodeForm.parent)
    n.sourceKind = 'subflow'
  }
  graph.nodes[id] = n
  graph.edges = graph.edges.filter((e) => e.from !== id || e.kind === 'spine')
  for (const row of $('edge-editor').children) {
    const e = {
      ...row._edge,
      from: id,
      to: row.querySelector('.edge-target').value,
      kind: row.querySelector('.edge-kind').value,
      label: row.querySelector('.edge-condition').value.trim(),
    }
    if (row._edge.label !== e.label || row._edge.to !== e.to || row._edge.kind !== e.kind) {
      if (e.sourceAnnotationIds) {
        e.originalSourceAnnotationIds = e.sourceAnnotationIds
        delete e.sourceAnnotationIds
      }
      e.labelStatus = 'user_edited'
    }
    if (e.to === '$caller')
      e.fallback = row
        .querySelector('.edge-fallback')
        .value.split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    else delete e.fallback
    graph.edges.push(e)
  }
  if (nodeForm.adding && nodeForm.parent)
    graph.edges.push({ from: nodeForm.parent, to: id, label: '', kind: 'next', dashed: false })
  for (const row of $('added-incoming').children)
    graph.edges.push({
      from: row.querySelector('select').value,
      to: id,
      label: row.querySelector('.incoming-condition').value.trim(),
      kind: 'next',
      dashed: false,
    })
  for (const r of graph.review || []) {
    if (!r.resolved) continue
    const edge = r.resolution.added
      ? graph.edges.find((e) => e.reviewedConnectorId === r.id)
      : graph.edges.find((e) => e.from === r.resolution.from && e.to === r.resolution.to)
    if (edge) {
      r.resolution.from = edge.from
      r.resolution.to = edge.to
    } else {
      r.resolved = false
      delete r.resolution
    }
  }
  replaceGraph(graph)
  go(id)
  return id
}

function bindNodeActions() {
  $('node-form').onsubmit = (e) => {
    e.preventDefault()
    try {
      applyEditor()
      $('node-editor').close()
      say('已套用節點與連線')
    } catch (error) {
      $('editor-error').textContent = error.message
    }
  }
  $('new-node').onclick = () => {
    if (!$('node-form').reportValidity()) return
    try {
      const id = applyEditor()
      populateEditor(id, true)
      $('node-title').focus()
    } catch (error) {
      $('editor-error').textContent = error.message
    }
  }
}

export { bindNodeActions }
