import { legendState, useCategories } from '../categories/model.js'
import { diagramState } from '../diagram/state.js'
import { graphModel, setGraphDocument } from './model.js'
import { validateGraph } from './validate.js'
import { $ } from '../ui/dom.js'
import { redoStack, undoStack, updateHistory } from '../editing/history.js'
import { expandedFlows } from '../diagram/visibleGraph.js'
import { setEditTarget } from '../editing/selection.js'
import { selectedCategories } from '../categories/legend.js'
import { draw } from '../diagram/render.js'
import { centerInstance, rebuildGraphNavigation, select } from '../diagram/navigation.js'
import { markDebugChanged } from '../io/graph.js'

const sync = { receiving: false }

function replaceGraph(
  value,
  { record = true, keepView = false, selection = diagramState.selected?.key } = {},
) {
  const previous = graphModel.document,
    next = validateGraph(value),
    oldKey = selection,
    open = $('inspector').classList.contains('open')
  if (record) {
    undoStack.push({
      graph: graphModel.document,
      selected: diagramState.selected?.key,
      expanded: [...expandedFlows],
    })
    if (undoStack.length > 30) undoStack.shift()
    redoStack.length = 0
  }
  setEditTarget(null)
  setGraphDocument(next)
  useCategories(graphModel.document)
  for (const name of selectedCategories)
    if (!legendState.legendNames.has(name)) selectedCategories.delete(name)
  diagramState.stableKeys.clear()
  for (const id of expandedFlows)
    if (!graphModel.document.subflows?.some((s) => s.id === id)) expandedFlows.delete(id)
  diagramState.selected = null
  diagramState.lastDetailKey = null
  diagramState.copied.clear()
  diagramState.revision++
  for (const dom of diagramState.domNodes.values()) dom.remove()
  diagramState.domNodes.clear()
  draw()
  diagramState.selected = diagramState.instanceMap.get(oldKey) || diagramState.instances[0]
  rebuildGraphNavigation()
  if (diagramState.selected) {
    select(diagramState.selected.key)
    if (!keepView) centerInstance(diagramState.selected)
    else $('inspector').classList.toggle('open', open)
  } else {
    $('detail').replaceChildren()
    $('detail-id').textContent = ''
    $('inspector').classList.remove('open')
  }
  updateHistory()
  markDebugChanged()
  if (!sync.receiving)
    window.dispatchEvent(
      new CustomEvent('studio-change', { detail: { previous, next: graphModel.document } }),
    )
}

export { replaceGraph, sync }
