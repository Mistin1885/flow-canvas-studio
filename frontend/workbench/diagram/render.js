import { selectionState } from '../editing/state.js'
import { setEditTarget } from '../editing/selection.js'
import { diagramState } from './state.js'
import { ancestors } from './paths.js'
import { transform, updateNav } from './navigation.js'
import { animateDiagram, updateTrace } from './animation.js'
import { updateLegendHighlights } from '../categories/legend.js'
import { syncGroups } from '../groups/visibility.js'
import { renderDetail } from '../inspector/details.js'
import { renderCards } from './renderCards.js'
import { renderWires } from './renderWires.js'
import { layoutDiagram } from './layoutDiagram.js'

import { cancelGesture } from '../editing/tools.js'

function draw(anchorKey) {
  cancelGesture()
  const oldPositions = new Map(diagramState.displayPositions)
  cancelAnimationFrame(diagramState.diagramFrame)
  const renderRevision = ++diagramState.diagramRevision
  if (diagramState.hoverTrace?.kind !== 'node') diagramState.hoverTrace = null
  diagramState.edgeViews = []
  const oldAnchor = anchorKey && diagramState.instanceMap.get(anchorKey)
  const oldXY = oldAnchor ? { x: oldAnchor.x, y: oldAnchor.y } : null
  const projectNodes = layoutDiagram()
  if (oldXY && diagramState.instanceMap.has(anchorKey)) {
    const ni = diagramState.instanceMap.get(anchorKey)
    diagramState.tx += (oldXY.x - ni.x) * diagramState.scale
    diagramState.ty += (oldXY.y - ni.y) * diagramState.scale
  }
  if (diagramState.selected && !diagramState.instanceMap.has(diagramState.selected.key)) {
    let key = diagramState.selected.key
    while (key && !diagramState.instanceMap.has(key))
      key = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : ''
    diagramState.selected = diagramState.instanceMap.get(key) || diagramState.instances[0]
  }
  if (diagramState.selected)
    diagramState.selected =
      diagramState.instanceMap.get(diagramState.selected.key) || diagramState.selected
  const pathSet = new Set(diagramState.selected ? ancestors(diagramState.selected) : [])
  renderCards(oldPositions, pathSet)
  renderWires(projectNodes, pathSet)
  animateDiagram(oldPositions, renderRevision)
  updateLegendHighlights()
  updateTrace()
  const target = selectionState.editTarget
  if ((target?.node && !diagramState.instanceMap.has(target.node)) ||
      (target?.edge && [target.edge.from, target.edge.to].some(id => !diagramState.instanceMap.has(id) && !id.startsWith('flow:')))) setEditTarget(null)
  if (target?.nodes) {
    const nodes = new Set([...target.nodes].filter(id => diagramState.instanceMap.has(id)))
    setEditTarget(nodes.size ? { nodes } : null)
  }
  syncGroups()
  transform()
  updateNav()
  if (diagramState.selected) renderDetail()
}

export { draw }
