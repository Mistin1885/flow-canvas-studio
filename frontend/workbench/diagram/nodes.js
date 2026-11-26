import { editState } from '../editing/state.js'
import { effectiveType } from '../graph/nodeTypes.js'
import { graphModel, outgoing } from '../graph/model.js'
import { diagramState } from './state.js'
import { setEditTarget } from '../editing/selection.js'
import { go, select } from './navigation.js'
function nodeGroup(id) {
  return graphModel.nodes[id].group
}

function isOpen(i) {
  return (
    i.open ??
    (diagramState.overrides.has(i.key)
      ? diagramState.overrides.get(i.key) !== false
      : i.level < diagramState.depth)
  )
}

function returnTarget(i) {
  return i.isExit ? i.id : nodeFor(i).jumpTo
}

function followReturn(i) {
  const target = returnTarget(i)
  if (!target) return
  go(target, true)
  if (editState.enabled) setEditTarget({ node: target })
}

function nodeKind(i) {
  return i.isExit ? 'return' : effectiveType(nodeFor(i))
}

function activateNode(key) {
  const i = diagramState.instanceMap.get(key)
  if (!i) return
  if (editState.enabled) {
    setEditTarget({ node: i.id })
    if (!returnTarget(i)) return
  }
  select(key)
}

function nodeFor(i) {
  return graphModel.nodes[i.id]
}

function edgesFor(i) {
  return outgoing.get(i.id) || []
}

export { activateNode, edgesFor, followReturn, isOpen, nodeFor, nodeGroup, nodeKind, returnTarget }
