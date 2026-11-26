import { graphModel } from '../graph/model.js'
import { cloneGraph } from '../graph/json.js'
import { applyOptionEdit } from './catalog.js'

export let optionEdits = []
let preview
export function optionGraph() { return preview ?? graphModel.document }

export function restoreOptionEdits(edits = []) {
  optionEdits = [...edits]
  preview = edits.length ? cloneGraph(graphModel.document) : null
  for (const edit of edits) applyOptionEdit(preview, edit)
}

export function stageOptionEdit(edit) {
  preview ??= cloneGraph(graphModel.document)
  applyOptionEdit(preview, edit)
  optionEdits.push(edit)
}
