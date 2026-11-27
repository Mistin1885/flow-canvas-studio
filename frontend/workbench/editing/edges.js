import { edgeLineStyle, storeEdgeLineStyle } from '../appearance/edgeStyle.js'
import { editConnection } from '../graph/edgeMutation.js'
import { openEdgePalette, saveEdgePalette } from './edgePalette.js'
import { editState } from './state.js'
import { $ } from '../ui/dom.js'

import { endpointControls } from './selection.js'
import { graphModel } from '../graph/model.js'
import { exportGraph } from '../io/graph.js'
import { replaceGraph } from '../graph/replace.js'
import { say } from '../ui/toast.js'

function openEdge(from, to, edge) {
  if ($('line-dialog').open) return
  editState.edgeDraft = { from, to, edge }
  endpointControls(from, to)
  $('edge-heading').textContent = edge ? '編輯連線' : '建立連線'
  $('edge-endpoints').textContent = '可連接節點、外框節點或子流程。排版群組僅用於分類與樣式。'
  $('line-style').value = edgeLineStyle(edge)
  const layout = edge?.wireLayout
  $('line-reset-layout').checked = false
  $('line-reset-row').hidden = !layout
  for (const key of ['start', 'end']) {
    const control = $('line-' + key + '-side')
    control.disabled = false
    control.value = layout?.[key] || ''
  }
  $('line-reset-layout').onchange = () => {
    for (const key of ['start', 'end']) {
      const control = $('line-' + key + '-side')
      control.disabled = $('line-reset-layout').checked
      control.value = control.disabled ? '' : layout?.[key] || ''
    }
  }
  openEdgePalette(edge || {}, [...graphModel.edges, ...(graphModel.document.groupLinks || [])])
  $('line-error').textContent = ''
  $('line-dialog').showModal()
  $('line-text').focus()
}

function saveEdge() {
  const from = $('edge-from-control').value,
    to = $('edge-to-control').value,
    old = editState.edgeDraft.edge
  const g = exportGraph()
  const { edge: e } = editConnection(g, graphModel.document, old, from, to, $('line-text').value.trim())
  const layout = $('line-reset-layout').checked ? {} : { ...e.wireLayout }
  for (const key of ['start', 'end']) {
    const side = $('line-' + key + '-side').value
    if (side !== layout[key]) delete layout[key + 'Ratio']
    if (side) layout[key] = side
    else delete layout[key]
  }
  if (Object.keys(layout).length) e.wireLayout = layout
  else delete e.wireLayout
  storeEdgeLineStyle(e, $('line-style').value)
  saveEdgePalette(e)
  replaceGraph(g, { keepView: true })
  $('line-dialog').close()
  say(old ? '已更新連線' : '已建立連線')
}

export { openEdge, saveEdge }
