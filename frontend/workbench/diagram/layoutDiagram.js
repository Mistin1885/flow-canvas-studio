import { diagramState } from './state.js'
import { expandedFlows, visibleGraph } from './visibleGraph.js'
import { sizeReadableNodes } from '../layout/nodeSize.js'
import { graphModel } from '../graph/model.js'
import { placeInlineFlows, positionFootprint, prepareInlineFlow } from '../layout/inlineFlows.js'
import { workbookLayout } from '../layout/worksheet.js'
import { layoutGraph } from '../layout/dagre.js'
import { dockProjectLinks } from '../layout/ports.js'
import { applyLayoutEdits } from '../groups/layout.js'
import { explicitFrameBounds, reserveFrameHeaders } from '../frames/handles.js'
import { edgeLabelLines } from '../layout/labels.js'
import { clearCardRoutes } from '../layout/cardRoutes.js'

import { wireGeometry, routedPoints } from '../layout/editedWires.js'

export function layoutDiagram() {
  diagramState.instances = []
  diagramState.instanceMap = new Map()
  diagramState.graphLinks = []
  visibleGraph()
  sizeReadableNodes()
  for (const sf of graphModel.document.subflows || [])
    if (expandedFlows.has(sf.id)) prepareInlineFlow(sf)
  const projectNodes = diagramState.instances.filter((i) => i.scope === 'project'),
    projectLinks = diagramState.graphLinks.filter(
      (l) => l.from.scope === 'project' && l.to.scope === 'project',
    )
  if (projectNodes.some((i) => graphModel.nodes[i.id].drawingBox))
    workbookLayout(projectNodes, projectLinks)
  else if (projectNodes.length) {
    const bounds = layoutGraph(projectNodes, projectLinks, 'LR', true)
    for (const i of projectNodes) positionFootprint(i, i.x, i.y)
    dockProjectLinks(projectLinks)
    diagramState.totalW = bounds.width + 30
    diagramState.totalH = bounds.height + 30
  }
  if (!projectNodes.length) {
    diagramState.totalW = 600
    diagramState.totalH = 400
  }
  const editedBounds = applyLayoutEdits(projectNodes, projectLinks)
  if (editedBounds) {
    diagramState.totalW = editedBounds.width + 45
    diagramState.totalH = editedBounds.height + 45
    dockProjectLinks(editedBounds.affected)
  }
  placeInlineFlows()
  explicitFrameBounds()
  reserveFrameHeaders()
  diagramState.totalW = Math.max(diagramState.totalW, ...diagramState.instances.map(i => i.x + i.w + 45))
  diagramState.totalH = Math.max(diagramState.totalH, ...diagramState.instances.map(i => i.y + i.h + 45))
  // An editor may add explicit links between levels. Only draw actual data edges.
  for (const l of diagramState.graphLinks.filter((l) => l.from.scope !== l.to.scope)) {
    const a = l.from,
      b = l.to
    l.points = [
      { x: a.x + (a.w || diagramState.W) / 2, y: a.y + (a.h || diagramState.H) },
      { x: b.x + (b.w || diagramState.W) / 2, y: b.y },
    ]
    l.lines = edgeLabelLines(l.edge.label)
    l.labelWidth =
      Math.min(250, Math.max(0, ...l.lines.map((v) => v.length * 9 + 18))) * diagramState.readingScale
    l.labelHeight = (l.lines.length * 17 + 10) * diagramState.readingScale
    l.labelX = (l.points[0].x + l.points[1].x - l.labelWidth) / 2
    l.labelY = (l.points[0].y + l.points[1].y - l.labelHeight) / 2
  }
  clearCardRoutes()
  for (const link of diagramState.graphLinks) {
    link.geometry = wireGeometry(link.edge, link.from, link.to, link.points, { originalPorts: link.originalPorts })
    link.points = routedPoints(link.geometry)
  }
  return projectNodes
}
