import { studioFrame } from '../display/preferences.js'
import { $, el } from '../ui/dom.js'
import { replaceGraph } from '../graph/replace.js'
import { say } from '../ui/toast.js'
import { validateGraph } from '../graph/validate.js'
import { graphModel } from '../graph/model.js'
import { exportGraph } from './graph.js'

const importHistory = {}

let pendingGraph = null

importHistory.previousGraph = null

const undoImport = el('button', '', '復原匯入')

function bindImportDialog() {
  if (studioFrame) {
    $('debug-import').textContent = '從 JSON 更新'
    $('debug-import').onclick = () => window.dispatchEvent(new Event('studio-import'))
    return
  }
  undoImport.id = 'debug-undo'
  undoImport.hidden = true
  $('debug-help').before(undoImport)
  undoImport.onclick = () => {
    if (!importHistory.previousGraph) return
    replaceGraph(importHistory.previousGraph)
    importHistory.previousGraph = null
    undoImport.hidden = true
    say('已復原上次匯入前的 DFx 設定')
  }
  $('debug-import').onclick = () => $('debug-file').click()
  $('debug-file').addEventListener('change', async () => {
    const file = $('debug-file').files[0]
    if (!file) return
    pendingGraph = null
    $('import-confirm').disabled = true
    $('graph-import-error').textContent = ''
    $('import-changes').replaceChildren()
    $('import-summary').textContent = '檢查 ' + file.name + '…'
    $('graph-import-preview').showModal()
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('JSON 請小於 5 MB')
      pendingGraph = validateGraph(JSON.parse(await file.text()))
      const oldIds = Object.keys(graphModel.nodes),
        newIds = Object.keys(pendingGraph.nodes),
        counts = [
          ['新增', newIds.filter((id) => !graphModel.nodes[id]).length],
          [
            '變更',
            newIds.filter(
              (id) =>
                graphModel.nodes[id] &&
                JSON.stringify(graphModel.nodes[id]) !== JSON.stringify(pendingGraph.nodes[id]),
            ).length,
          ],
          ['移除', oldIds.filter((id) => !pendingGraph.nodes[id]).length],
        ]
      for (const [label, count] of counts) {
        const box = el('div', '', label + '節點')
        box.prepend(el('strong', '', count))
        $('import-changes').append(box)
      }
      $('import-summary').textContent =
        file.name +
        ' · ' +
        newIds.length +
        ' 個節點 / ' +
        (pendingGraph.edges.length + (pendingGraph.groupLinks?.length || 0)) +
        ' 條連線'
      $('import-confirm').disabled = false
    } catch (error) {
      $('graph-import-error').textContent = '無法匯入，原設定未變更。\n' + error.message
      $('import-summary').textContent = file.name
    } finally {
      $('debug-file').value = ''
    }
  })
  for (const id of ['import-close', 'import-cancel'])
    $(id).onclick = () => $('graph-import-preview').close()
  $('import-confirm').onclick = () => {
    if (!pendingGraph) return
    const backup = exportGraph()
    replaceGraph(pendingGraph)
    importHistory.previousGraph = backup
    pendingGraph = null
    undoImport.hidden = false
    $('graph-import-preview').close()
    say('已套用流程')
  }
}

export { bindImportDialog, importHistory, undoImport }
