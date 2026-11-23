import { safeData } from '../graph/json.js'
import { portableDocument } from './template.js'
import { downloadFile, exportGraph } from './graph.js'
import { displayState, displayDefaults, studioFrame } from '../display/preferences.js'
import { diagramState } from '../diagram/state.js'
import { $ } from '../ui/dom.js'
import { say } from '../ui/toast.js'

function snapshotWorkspace() {
  const page = portableDocument()
  const preferences = {
    ...(studioFrame ? displayDefaults : displayState.prefs),
    theme: studioFrame ? 'light' : diagramState.theme,
    copyId: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2),
  }
  page.querySelector('#playbook-data').textContent = safeData(exportGraph())
  page.querySelector('#display-preferences').textContent = safeData(preferences)
  return '<!DOCTYPE html>\n' + page.outerHTML
}

function saveWorkspaceHtml() {
  downloadFile(snapshotWorkspace(), 'dfx-project-workbench.html', 'text/html;charset=utf-8')
  diagramState.debugDirty = false
  $('workspace-save-state').textContent = '已下載目前流程'
  say('已下載流程、來源資料與顯示設定')
}

function bindExports() {
  window.T1Workbench = { saveHtml: saveWorkspaceHtml, snapshot: snapshotWorkspace }
  $('workspace-save').onclick = saveWorkspaceHtml
  $('debug-export').onclick = () => {
    downloadFile(safeData(exportGraph()), 'dfx-project-flow.json', 'application/json;charset=utf-8')
    say('已匯出節點詳情與完整流程連線')
  }
  $('debug-help').onclick = () => $('graph-help').showModal()
  $('help-close').onclick = () => $('graph-help').close()
}

export { bindExports }
