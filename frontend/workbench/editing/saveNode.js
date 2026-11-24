import { finishBadgeEditor, saveBadges } from '../badges/editor.js'
import { draftApplied, formValues } from './formDrafts.js'
import { saveAssignmentOptions } from '../modeling/assignmentOptions.js'
import { readNodeFields } from '../modeling/fields.js'
import { editState } from './state.js'
import { originalNames, unmappedTag } from '../categories/model.js'
import { savedBlock } from './contentValues.js'
import { applyEdgeEdits } from './saveEdges.js'
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
  finishBadgeEditor()
  const before = nodeForm.initial, after = formValues()
  const differs = (key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])
  const edited = (key) => nodeForm.adding || before.fields[key] !== after.fields[key]
  for (const key of ['group', 'title', 'description', 'where', 'expect', 'note']) {
    if (edited('node-' + key)) n[key] = after.fields['node-' + key].trim()
  }
  saveBadges(graph, n, before.badges)
  saveAssignmentOptions(graph)
  readNodeFields(n, nodeForm.adding ? null : before)
  const categories = after.tags
  const initialGroups = new Map(before.groups)
  for (const [name, direction] of editState.groupDraft) {
    if (initialGroups.get(name) === direction) continue
    const group = graph.layoutGroups?.find(group => group.name === name)
    if (group) group.direction = direction
    else (graph.layoutGroups ??= []).push({ name, direction })
    for (const member of Object.values(graph.nodes))
      if (member.group === name) delete member.layoutOffset
  }
  if (categoryDraft.items.length)
    graph.customCategories = [...(graph.customCategories || []), ...categoryDraft.items]
  if (
    categories.includes(unmappedTag) &&
    categories.some((c) => c !== unmappedTag && originalNames.has(c))
  )
    throw new Error('已選原圖圖例時，請取消「原圖未對應圖例」。')
  if (nodeForm.adding || differs('tags')) {
    n.legendEdited = true
    const retained = (n.tags || []).filter(tag => !before.tags.includes(tag) || categories.includes(tag))
    n.tags = [...retained, ...categories.filter(tag => !retained.includes(tag))]
  }
  const type = after.fields['node-type']
  if (type === 'return') n.jumpTo = after.fields['node-return-target']
  else if (before.fields['node-type'] === 'return') {
    delete n.jumpTo
    delete n.jumpScope
  }
  if (edited('node-type')) {
    n.type = type
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
  if (nodeForm.adding || differs('content'))
    n.content = [...$('content-editor').children].map(savedBlock)
  if (nodeForm.adding && nodeForm.parent && sheetFor(nodeForm.parent) !== 'project') {
    n.sheetId = sheetFor(nodeForm.parent)
    n.sourceKind = 'subflow'
  }
  graph.nodes[id] = n
  if (differs('edges') || after.incoming.length || nodeForm.parent)
    applyEdgeEdits(graph, id, after, nodeForm.parent)
  if (JSON.stringify(graph) !== JSON.stringify(graphModel.document)) replaceGraph(graph, { createdNode: nodeForm.adding ? id : undefined })
  draftApplied()
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
