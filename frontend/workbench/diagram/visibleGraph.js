import { revealFrameMember } from '../frames/folding.js'
import { sheetInGraph } from '../graph/nodeSheet.js'
import { categoryTags, legendState, unmappedTag } from '../categories/model.js'
import { graphModel, outgoing } from '../graph/model.js'
import { diagramState } from './state.js'
import { branchIndex, revealBranch, walkBranches } from './branches.js'

export const foldedNodes = new Set()
let index
const expandedFlows = new Set()

function sheetFor(id) { return sheetInGraph(graphModel.document, id) }

function startId() {
  return (
    Object.keys(graphModel.nodes).find((id) => sheetFor(id) === 'project') ||
    Object.keys(graphModel.nodes)[0]
  )
}

function visibleGraph() {
  const nodes = Object.values(graphModel.nodes), flows = graphModel.document.subflows || []
  index = branchIndex(nodes, graphModel.edges, sheetFor, flows)
  for (const id of foldedNodes) {
    if (!index.children.get(id)?.length || graphModel.nodes[id].jumpTo) foldedNodes.delete(id)
  }
  const visible = walkBranches(index.roots.get('project') || [], index.children, foldedNodes)
  // A subflow's members are only visible while its host is on the canvas.
  const hosted = new Map()
  for (const flow of flows) {
    if (!expandedFlows.has(flow.id)) continue
    if (!hosted.has(flow.parent)) hosted.set(flow.parent, [])
    hosted.get(flow.parent).push(flow.id)
  }
  for (const host of visible) {
    for (const scope of hosted.get(host) || []) {
      const members = walkBranches(index.roots.get(scope) || [], index.children, foldedNodes)
      for (const member of members) visible.add(member)
    }
  }
  for (const n of nodes) {
    if (!visible.has(n.id)) continue
    const i = {
      id: n.id,
      key: n.id,
      level: 0,
      path: [n.id],
      nodeIds: [n.id],
      scope: sheetFor(n.id),
      open: !foldedNodes.has(n.id),
      hasBranch: index.children.get(n.id).length > 0 && !n.jumpTo,
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
    if (foldedNodes.has(from.id) && (edge.kind === 'next' || edge.kind === 'spine') &&
        index.children.get(from.id).includes(to.id)) continue
    const link = { from, to, edge }
    diagramState.graphLinks.push(link)
    from.children.push(to)
    to.incoming.push(link)
  }
}

function openDescendants(starts, exceptHost) {
  const reachable = walkBranches(starts, index.children)
  const flows = graphModel.document.subflows || []
  for (const id of reachable) {
    foldedNodes.delete(id)
    if (id === exceptHost) continue
    for (const flow of flows) {
      if (flow.parent !== id) continue
      expandedFlows.add(flow.id)
      for (const member of walkBranches(index.roots.get(flow.id) || [], index.children)) reachable.add(member)
    }
  }
}

export function expandBranch(id) {
  openDescendants([id], id)
}

export function expandFlowMembers(flow) {
  openDescendants(index.roots.get(flow.id) || [])
}

export function revealNode(id) {
  revealFrameMember(graphModel.document, id)
  const seen = new Set()
  while (!diagramState.instanceMap.has(id) && !seen.has(id)) {
    seen.add(id)
    revealBranch(id, index, foldedNodes)
    const scope = sheetFor(id)
    const flow = graphModel.document.subflows?.find(s => s.id === scope)
    if (!flow || scope === 'project') break
    expandedFlows.add(flow.id)
    id = flow.parent
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
