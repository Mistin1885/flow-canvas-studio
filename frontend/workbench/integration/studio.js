import { configureDrafts, refreshTeamForm } from '../editing/formDrafts.js'
import { editState } from '../editing/state.js'
import { cleanDisplayPrefs, displayState, studioFrame } from '../display/preferences.js'
import { diagramState } from '../diagram/state.js'
import { applyTheme } from '../display/workspace.js'
import { applyDisplayPreferences } from '../display/controls.js'
import { replaceGraph, sync } from '../graph/replace.js'
import { redoStack, undoStack } from '../editing/history.js'
import { importHistory, undoImport } from '../io/importDialog.js'
import { $ } from '../ui/dom.js'
import { graphModel } from '../graph/model.js'
import { validateGraph } from '../graph/validate.js'
import { exportGraph } from '../io/graph.js'
import { go, setCanvasTitle } from '../diagram/navigation.js'

function exposeStudioApi() {
  // Expose immutable data and a small inspection surface for local verification.
  window.T1Playbook = {
    configureDrafts,
    refreshTeamForm,
    setCanvasTitle,
    setDisplayPreferences(value) {
      if (!studioFrame) return
      displayState.prefs = cleanDisplayPrefs(value)
      diagramState.theme = value.theme === 'dark' ? 'dark' : 'light'
      applyTheme()
      applyDisplayPreferences()
    },
    receive(graph, resetHistory = true) {
      sync.receiving = true
      try {
        if (resetHistory) {
          undoStack.length = 0
          redoStack.length = 0
          importHistory.previousGraph = null
          undoImport.hidden = true
        }
        replaceGraph(graph, { record: false, keepView: true })
        diagramState.debugDirty = false
        $('workspace-save-state').textContent = '已同步'
      } finally {
        sync.receiving = false
      }
    },
    editing(allowNodeForm = false) {
      const dialogs = allowNodeForm ? 'dialog[open]:not(#node-editor):not(#option-dialog):not(#discard-draft-dialog)' : 'dialog[open]'
      return !!document.querySelector(dialogs + ', .node[data-badge-drop]') || !!editState.gesture
    },
    saved() {
      diagramState.debugDirty = false
      $('workspace-save-state').textContent = '已同步'
    },
    get data() {
      return graphModel.document
    },
    validateGraph,
    replaceGraph,
    exportGraph,
    getState: () => ({
      rack: diagramState.rack,
      depth: diagramState.depth,
      cm: diagramState.cm,
      selected: diagramState.selected?.id,
      visible: diagramState.instances.length,
      scale: diagramState.scale,
      theme: diagramState.theme,
      panelWidth: diagramState.panelWidth,
      navCollapsed: diagramState.navCollapsed,
      selectedKey: diagramState.selected?.key,
    }),
    go,
  }
}

export { exposeStudioApi }
