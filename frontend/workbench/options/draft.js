import { formGraph } from '../editing/formSource.js'
import { cloneGraph } from '../graph/json.js'
import { applyOptionEdit } from './catalog.js'

export let optionEdits = []
let preview
export function optionGraph() { return preview ?? formGraph() }

export function restoreOptionEdits(edits = []) {
  optionEdits = [...edits]
  preview = edits.length ? cloneGraph(formGraph()) : null
  for (const edit of edits) applyOptionEdit(preview, edit)
}

export function stageOptionEdit(edit) {
  preview ??= cloneGraph(formGraph())
  applyOptionEdit(preview, edit)
  optionEdits.push(edit)
}
