import { equalJson } from '../../shared/jsonComparison.js'
import { graphModel } from '../graph/model.js'
import { storePosition } from './nodePosition.js'
import { diagramState } from '../diagram/state.js'
import { branchIndex } from '../diagram/branches.js'
import { expandedFlows, sheetFor } from '../diagram/visibleGraph.js'
import { sourceMembers } from '../frames/membership.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { replaceGraph } from '../graph/replace.js'
import { fitVisible } from '../groups/visibility.js'
import { exportGraph } from '../io/graph.js'
import { arrangeConnections } from '../layout/arrangeConnections.js'
import { arrangeSheet } from '../layout/arrangeSheet.js'
import { sizeReadableNodes } from '../layout/nodeSize.js'
import { $ } from '../ui/dom.js'
import { say } from '../ui/toast.js'

function arrangeCanvas(chosen) {
  const graph = exportGraph()
  const scale = diagramState.readingScale
  const nodes = Object.values(graph.nodes)
  const branches = branchIndex(nodes, graph.edges, sheetFor, graph.subflows || [])
  const items = nodes.map((n) => ({
    id: n.id,
    key: n.id,
    scope: branches.sheets.get(n.id),
    hasBranch: branches.children.get(n.id).length > 0 && !n.jumpTo,
  }))
  if (!items.length) return say('畫布上還沒有節點')
  sizeReadableNodes(items)
  const direction = chosen === 'auto' ? 'LR' : chosen
  const groups = new Map(
    (graph.layoutGroups || [])
      .filter((g) => g.direction !== 'auto')
      .map((g) => [g.name, chosen === 'auto' ? g.direction : direction]),
  )
  const footprints = new Map(),
    boxes = new Map()
  const links = [...graph.edges, ...(graph.groupLinks || [])]
  function layoutScope(scope) {
    const cards = items
      .filter((i) => i.scope === scope)
      .map((i) => {
        const n = graph.nodes[i.id]
        const card = {
          id: i.id,
          group: n.group,
          w: i.w / scale,
          h: (i.h + i.badgeTop + i.badgeBottom) / scale,
          offsetY: i.badgeTop / scale,
        }
        if (isFrameNode(n)) {
          card.members = sourceMembers(n)
          if (!n.frameMembers && n.drawingBox) n.frameMembers = card.members
        }
        const children = footprints.get(i.id)
        if (children) {
          const width = Math.max(card.w, children.w) + 48
          card.offsetX = (width - card.w) / 2
          card.w = width
          card.h += children.h + 88
          card.offsetY += 24
        }
        boxes.set(i.id, { w: i.w / scale, h: i.h / scale, scope })
        return card
      })
    const packed = arrangeSheet(cards, links, direction, groups)
    for (const [id, p] of packed.positions) {
      const node = graph.nodes[id],
        margin = scope === 'project' ? 32 : 0
      storePosition(node, { x: p.x + margin, y: p.y + margin })
      Object.assign(boxes.get(id), node.layoutPosition)
    }
    return packed
  }
  for (const flow of graph.subflows || []) {
    const packed = layoutScope(flow.id)
    if (packed.positions.size && expandedFlows.has(flow.id)) footprints.set(flow.parent, packed)
  }
  layoutScope('project')
  arrangeConnections(graph, links, boxes, groups, direction)
  if (equalJson(graph, graphModel.document)) return say('目前已是此排版')
  replaceGraph(graph, { keepView: true })
  fitVisible()
  say('已自動排版，可按復原還原')
}

export function initAutoArrange() {
  const dialog = $('arrange-dialog')
  $('canvas-arrange').onclick = () => {
    $('arrange-error').textContent = ''
    dialog.showModal()
  }
  $('arrange-cancel').onclick = () => dialog.close()
  $('arrange-form').onsubmit = (e) => {
    e.preventDefault()
    try {
      arrangeCanvas($('arrange-direction').value)
      dialog.close()
    } catch (error) {
      $('arrange-error').textContent = error.message
    }
  }
}
