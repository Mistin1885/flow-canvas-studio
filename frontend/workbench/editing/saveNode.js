import { applyTypeEdits } from '../modeling/nodeTypeDraft.js'
import { typeDefinition } from '../modeling/nodeTypeCatalog.js'
import { nodeTypes } from '../graph/nodeTypes.js'
import { optionEdits } from '../options/draft.js'
import { applyOptionEdit } from '../options/catalog.js'
import { alignedBaseline } from '../options/baseline.js'
import { equalJson } from '../../shared/jsonComparison.js'
import { addNode } from '../graph/addNode.js'
import { bindReferenceValidation, validateReferences } from '../knowledge/formValidation.js'
import { finishBadgeEditor, saveBadges } from '../badges/editor.js'
import { draftApplied, publishForm } from './formDrafts.js'
import { saveAssignmentOptions } from '../modeling/assignmentOptions.js'
import { readNodeFields } from '../modeling/fields.js'
import { editState } from './state.js'
import { unmappedTag } from '../categories/model.js'
import { savedBlock } from './contentValues.js'
import { applyEdgeEdits } from './saveEdges.js'
import { $ } from '../ui/dom.js'
import { nodeForm, populateEditor } from './nodeForm.js'
import { graphModel } from '../graph/model.js'
import { cloneGraph } from '../graph/json.js'
import { formGraph } from './formSource.js'
import { sheetInGraph } from '../graph/nodeSheet.js'

import { categoryDraft } from '../categories/editor.js'

import { formValues } from './formValues.js'
import { go } from '../diagram/navigation.js'
import { say } from '../ui/toast.js'

function applyEditor() {
  if (!validateReferences()) throw new Error('請修正標紅欄位中的知識引用。')
  const id = $('node-id').value.trim()
  if (nodeForm.adding && Object.hasOwn(formGraph().nodes, id)) throw new Error('節點 ID 已存在')
  const graph = cloneGraph(formGraph()),
    n = nodeForm.adding ? { id } : graph.nodes[id]
  finishBadgeEditor()
  applyTypeEdits(graph)
  for (const edit of optionEdits) applyOptionEdit(graph, edit)
  const before = alignedBaseline(nodeForm.initial, optionEdits), after = formValues()
  const differs = (key) => !equalJson(before[key], after[key])
  const edited = (key) => nodeForm.adding || before.fields[key] !== after.fields[key]
  for (const key of ['group', 'title', 'description', 'where', 'expect', 'note']) {
    if (edited('node-' + key)) n[key] = after.fields['node-' + key].trim()
  }
  Object.assign(graph, after.knowledge)
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
      if (member.group === name) {
        delete member.layoutPosition
        delete member.layoutOffset
      }
  }
  if (categoryDraft.items.length)
    graph.customCategories = [...(graph.customCategories || []), ...categoryDraft.items]
  const originalNames = new Set(graph.sourceLegend?.items?.map(item => item.name))
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
  const typeId = after.fields['node-type']
  const type = typeDefinition(graph, typeId)?.baseType
  if (!type) throw Error('節點類型已不存在，請重新選擇。')
  if (type === 'return') n.jumpTo = after.fields['node-return-target']
  else if (n.jumpTo || n.type === 'return') {
    delete n.jumpTo
    delete n.jumpScope
  }
  if (edited('node-type')) {
    n.type = type
    if (Object.hasOwn(nodeTypes, typeId)) delete n.customType
    else n.customType = typeId
    if (n.originalDecision === undefined) n.originalDecision = !!n.decision
    delete n.nodeRole
    n.decision = type === 'decision'
    if (type !== 'frame') delete n.frameMembers
    if (type === 'frame') {
      n.frameMembers ??= []
      for (const owner of Object.values(graph.nodes))
        if (owner.frameMembers?.includes(id))
          owner.frameMembers = owner.frameMembers.filter((k) => k !== id)
    }
  }
  if (nodeForm.adding || differs('content'))
    n.content = [...$('content-editor').children].map(savedBlock)
  if (nodeForm.adding && nodeForm.parent && sheetInGraph(graph, nodeForm.parent) !== 'project') {
    n.sheetId = sheetInGraph(graph, nodeForm.parent)
    n.sourceKind = 'subflow'
  }
  if (nodeForm.adding) addNode(graph, n)
  if (differs('edges') || after.incoming.length || nodeForm.parent)
    applyEdgeEdits(graph, id, after, nodeForm.parent)
  if (!equalJson(graph, formGraph()))
    publishForm(graph, { optionEdits, createdNode: nodeForm.adding ? id : undefined })
  draftApplied()
  if (graphModel.nodes[id]) go(id)
  return id
}

function bindNodeActions() {
  bindReferenceValidation()
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
