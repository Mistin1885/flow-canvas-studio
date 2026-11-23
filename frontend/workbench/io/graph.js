import { cloneGraph } from '../graph/json.js'
import { $, el } from '../ui/dom.js'
import { graphModel } from '../graph/model.js'
import { sync } from '../graph/replace.js'
import { diagramState } from '../diagram/state.js'

function downloadFile(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type })),
    a = el('a')
  a.href = url
  a.download = name
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function exportGraph() {
  return cloneGraph({ ...graphModel.document, nodes: graphModel.nodes, edges: graphModel.edges })
}

function markDebugChanged() {
  if (sync.receiving) return
  diagramState.debugDirty = true
  $('workspace-save-state').textContent = '有變更待保存'
}

export { downloadFile, exportGraph, markDebugChanged }
