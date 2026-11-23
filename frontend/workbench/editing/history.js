import { $ } from '../ui/dom.js'
import { graphModel } from '../graph/model.js'
import { diagramState } from '../diagram/state.js'
import { expandedFlows } from '../diagram/visibleGraph.js'
import { replaceGraph } from '../graph/replace.js'
import { say } from '../ui/toast.js'

const undoStack = []

const redoStack = []

function updateHistory() {
  $('history-undo').disabled = !undoStack.length
  $('history-redo').disabled = !redoStack.length
  $('edit-node').disabled = !Object.keys(graphModel.nodes).length
}

function historyStep(redo) {
  const from = redo ? redoStack : undoStack,
    to = redo ? undoStack : redoStack
  if (!from.length) return
  const target = from.at(-1)
  const previous = {
    graph: graphModel.document,
    selected: diagramState.selected?.id,
    expanded: [...expandedFlows],
  }
  expandedFlows.clear()
  for (const id of target.expanded) expandedFlows.add(id)
  replaceGraph(target.graph, { record: false, keepView: true, selection: target.selected })
  from.pop()
  to.push(previous)
  updateHistory()
  say(redo ? '已重做' : '已復原')
}

export { historyStep, redoStack, undoStack, updateHistory }
