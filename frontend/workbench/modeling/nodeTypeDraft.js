import { cloneGraph } from '../graph/json.js'
import { formGraph } from '../editing/formSource.js'
import { setTypeDefinition, deleteTypeDefinition } from './nodeTypeCatalog.js'

export let typeEdits = []
let preview
export function typeDraftGraph() { return preview ?? formGraph() }

export function applyTypeEdits(graph, edits = typeEdits) {
  for (const edit of edits) {
    if (edit.remove) deleteTypeDefinition(graph, edit.remove)
    else setTypeDefinition(graph, cloneGraph(edit.definition))
  }
}

export function restoreTypeEdits(edits = []) {
  typeEdits = cloneGraph(edits)
  preview = edits.length ? cloneGraph(formGraph()) : null
  if (preview) applyTypeEdits(preview)
}

export function stageTypeEdit(edit) {
  const next = cloneGraph(typeDraftGraph())
  applyTypeEdits(next, [edit])
  preview = next
  typeEdits.push(cloneGraph(edit))
}
