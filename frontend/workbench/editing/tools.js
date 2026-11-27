import { editFrameObject } from '../frames/mutations.js'
import { resetResize } from './resizeNodes.js'
import { createFrameFromSelection } from '../frames/create.js'
import { initGroupManager } from '../groups/manager.js'
import { ungrouped } from '../options/catalog.js'
import { showEndpointTarget } from './endpointFeedback.js'
import { duplicateSelectedNode } from './duplicateNode.js'
import { selectionState, editState } from './state.js'
import { $ } from '../ui/dom.js'
import { editContext, preferredFrame, setEditTarget } from './selection.js'
import { editMembers } from '../frames/memberDialog.js'
import { openEdge, saveEdge } from './edges.js'
import { initGroupTools } from '../groups/visibility.js'
import { diagramState } from '../diagram/state.js'
import { historyStep, updateHistory } from './history.js'
import { replaceGraph } from '../graph/replace.js'
import { removeGraphNode } from '../graph/removeNode.js'
import { exportGraph } from '../io/graph.js'
import { nodeForm } from './nodeForm.js'
import { say } from '../ui/toast.js'
import { initGestures } from './gestures.js'
import { restoreWireDrag } from './wireDrag.js'
import { canvas } from '../diagram/viewport.js'
import { clearBox } from './boxSelection.js'
import { resetMove } from './moveNodes.js'

import { straightenEdge } from './straightenEdge.js'

function setBoxMode(on) {
  editState.boxMode = on
  $('canvas-box').setAttribute('aria-pressed', String(on))
  canvas.classList.toggle('box-mode', on)
}

function initGraphTools() {
  $('create-subflow').onclick = () => {
    $('tools-menu').open = false
    try { editFrameObject('flow:', 'create', 'flow', '新子流程') }
    catch (error) { say(error.message) }
  }
  $('canvas-straighten').onclick = straightenEdge
  $('canvas-box').onclick = () => setBoxMode(!editState.boxMode)
  $('canvas-duplicate').onclick = duplicateSelectedNode
  $('canvas-properties').onclick = editContext
  $('canvas-create-frame').onclick = createFrameFromSelection
  $('canvas-members').onclick = () => { const key = preferredFrame(); if (key) editMembers(key) }
  initGroupManager()
  $('canvas-connect').onclick = () =>
    openEdge(selectionState.editTarget?.node || diagramState.selected?.id || '', '', null)
  $('history-undo').onclick = () => historyStep(false)
  $('history-redo').onclick = () => historyStep(true)
  $('canvas-edit').onclick = () => {
    setBoxMode(false)
    editState.enabled = !editState.enabled
    $('canvas-edit').setAttribute('aria-pressed', String(editState.enabled))
    $('canvas').classList.toggle('edit-mode', editState.enabled)
    $('edit-tools-list').hidden = !editState.enabled
    $('edit-hint').hidden = !editState.enabled
    cancelGesture()
    const selected = diagramState.selected
    setEditTarget(editState.enabled && selected ? { node: selected.id } : null)
  }
  document.addEventListener('keydown', (e) => {
    if (
      document.querySelector('dialog[open]') ||
      e.target.closest('input,textarea,select,[contenteditable=true]') ||
      !(e.metaKey || e.ctrlKey) ||
      e.altKey
    )
      return
    const k = e.key.toLowerCase()
    if (k === 'z' || k === 'y') {
      e.preventDefault()
      historyStep(k === 'y' || e.shiftKey)
    }
  })
  $('node-group').onchange = () => {
    $('group-direction').value = editState.groupDraft.get($('node-group').value)
  }
  $('group-direction').onchange = () =>
    editState.groupDraft.set($('node-group').value, $('group-direction').value)
  $('add-group').onclick = () => {
    const typed = $('group-name').value.trim(),
      name = typed === '未指定' ? ungrouped : typed,
      picker = $('node-group')
    if (!name) {
      $('group-message').textContent = '請輸入群組名稱'
      return
    }
    if (!editState.groupDraft.has(name)) {
      editState.groupDraft.set(name, 'auto')
      picker.add(new Option(name, name))
    }
    picker.value = name
    picker.onchange()
    $('group-name').value = ''
    $('group-message').textContent = '已選取 ' + name + '，套用後儲存。'
  }
  $('delete-node').onclick = () => {
    try {
      replaceGraph(removeGraphNode(exportGraph(), nodeForm.node), { keepView: true })
      $('node-editor').close()
      say('已刪除節點及相關連線，可按復原還原')
    } catch (err) {
      $('editor-error').textContent = err.message
    }
  }
  $('line-close').onclick = () => $('line-dialog').close()
  $('line-form').onsubmit = (e) => {
    e.preventDefault()
    try {
      saveEdge()
    } catch (err) {
      $('line-error').textContent = err.message
    }
  }
  updateHistory()
  initGestures()
  initGroupTools()
}

function cancelGesture() {
  canvas.classList.remove('choosing-endpoint')
  const g = editState.gesture
  if (!g) return
  editState.gesture = null
  if (g.resize) resetResize(g)
  else if (g.box) clearBox(g)
  else if (g.wire) restoreWireDrag(g)
  else if (g.moving) resetMove(g)
  else g.preview?.remove()
  if (g.target) showEndpointTarget(g, null)
  if (g.capture?.hasPointerCapture(g.pointer)) g.capture.releasePointerCapture(g.pointer)
}

export { cancelGesture, initGraphTools }
