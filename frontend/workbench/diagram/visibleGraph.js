import { categoryTags, legendState, unmappedTag } from '../categories/model.js'
import { graphModel, outgoing } from '../graph/model.js'
import { diagramState } from './state.js'
const expandedFlows = new Set()

function sheetFor(id) {
  const n = graphModel.nodes[id]
  if (!n) return 'project'
  if (n.sheetId === 'project') return 'project'
  if (n.sheetId && (graphModel.document.subflows || []).some((s) => s.id === n.sheetId)) return n.sheetId
  if (n.sourceKind === 'subflow')
    return (
      (graphModel.document.subflows || []).find(
        (s) => s.root === id || graphModel.nodes[s.root]?.group === n.group,
      )?.id || 'project'
    )
  return 'project'
}

function startId() {
  return (
    Object.keys(graphModel.nodes).find((id) => sheetFor(id) === 'project') ||
    Object.keys(graphModel.nodes)[0]
  )
}

function visibleGraph() {
  const nodes = Object.values(graphModel.nodes).filter(
    (n) => sheetFor(n.id) === 'project' || expandedFlows.has(sheetFor(n.id)),
  )
  for (const n of nodes) {
    const i = {
      id: n.id,
      key: n.id,
      level: 0,
      path: [n.id],
      nodeIds: [n.id],
      scope: sheetFor(n.id),
      open: true,
      available: outgoing.get(n.id) || [],
      children: [],
      incoming: [],
      x: 0,
      y: 0,
    }
    diagramState.instances.push(i)
    diagramState.instanceMap.set(i.key, i)
  }
  for (const edge of graphModel.edges) {
    const from = diagramState.instanceMap.get(edge.from),
      to = diagramState.instanceMap.get(edge.to)
    if (!from || !to) continue
    const link = { from, to, edge }
    diagramState.graphLinks.push(link)
    from.children.push(to)
    to.incoming.push(link)
  }
}

function tagList(n) {
  const tags = n.tags || [],
    context = tags.filter((t) => !legendState.legendNames.has(t) && t !== n.group)
  const group = legendState.legendNames.has(n.group) ? [] : [n.group]
  return [
    ...new Set(
      [...group, ...categoryTags(n).filter((t) => t !== unmappedTag), ...context].filter(Boolean),
    ),
  ]
}

export { expandedFlows, sheetFor, startId, tagList, visibleGraph }
