import { typeEdits, restoreTypeEdits, typeDraftGraph } from '../modeling/nodeTypeDraft.js'
import { showTypeChoices } from '../modeling/nodeTypeManager.js'
import { typeDefinition } from '../modeling/nodeTypeCatalog.js'
import { annotateOptions } from '../options/controls.js'
import { showOptionStatus } from '../options/manager.js'
import { optionEdits, optionGraph, restoreOptionEdits } from '../options/draft.js'
import { showNodeFields } from '../modeling/fields.js'
import { validateReferences } from '../knowledge/formValidation.js'
import { pendingKnowledge } from '../knowledge/insert.js'
import { badgeDraft, showBadges } from '../badges/editor.js'
import { $ } from '../ui/dom.js'
import { nodeForm, showReturnTarget, syncReturnField, appendContentBlock, appendEditorEdge, appendIncoming } from './nodeForm.js'
import { categoryDraft, editorLegend } from '../categories/editor.js'
import { editState } from './state.js'

import { pendingOptions, showAssignments } from '../modeling/assignmentOptions.js'
import { suggestNodeId } from '../graph/nodeIds.js'

const valueIds = [
  'node-id', 'node-title', 'node-type', 'node-return-target', 'node-description', 'node-where', 'node-expect', 'node-note',
  'node-role', 'role-name', 'where-name', 'node-gateway', 'node-group', 'group-name', 'category-name', 'category-color',
]

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
    typeEdits, optionEdits, knowledge: pendingKnowledge.docs, badges: badgeDraft(), options: pendingOptions, autoId: nodeForm.autoId,
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

export function restoreValues(saved, base) {
  restoreOptionEdits(saved.optionEdits)
  restoreTypeEdits(saved.typeEdits)
  showTypeChoices(saved.fields['node-type'])
  showOptionStatus()
  showNodeFields(optionGraph().nodes[saved.node] || {}, optionGraph())
  pendingKnowledge.docs = saved.knowledge || {}
  if (saved.badges) showBadges({}, saved.badges)
  editState.groupDraft = new Map(saved.groups)
  $('node-group').replaceChildren(...saved.groups.map(([name]) => new Option(name, name)))
  showAssignments({ ownerRole: saved.fields['node-role'], where: saved.fields['node-where'] }, saved.options)
  if (saved.adding) nodeForm.suggestion = suggestNodeId(typeDefinition(typeDraftGraph(), saved.fields['node-type'])?.baseType, base.graph.nodes)
  for (const id of valueIds) if (id in saved.fields) $(id).value = saved.fields[id]
  showReturnTarget(saved.fields['node-return-target'], saved.node)
  syncReturnField()
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
  annotateOptions()
  validateReferences()
}
