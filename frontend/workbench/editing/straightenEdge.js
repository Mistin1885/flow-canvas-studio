import { equalJson } from '../../shared/jsonComparison.js'
import { storeDisplayedPosition } from './nodePosition.js'
import { diagramState } from '../diagram/state.js'
import { graphModel } from '../graph/model.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { replaceGraph } from '../graph/replace.js'
import { exportGraph } from '../io/graph.js'
import { straightConnection } from '../layout/straightConnection.js'
import { $ } from '../ui/dom.js'
import { say } from '../ui/toast.js'
import { setEditTarget } from './selection.js'

export function straightenEdge() {
  const wire = $('paths').querySelector('.edge-route.edit-picked')?.wireGeometry
  if (!wire) return
  const { from, to, edge } = wire
  if (from === to) return say('自迴圈的起點與終點相同，無法拉成直線')
  const scale = diagramState.readingScale
  const allowed = (item, pos) => {
    const node = graphModel.nodes[item.id],
      origin = item.scopeOrigin
    return (
      node &&
      !isFrameNode(node) &&
      !item.inlineFlow &&
      (!origin || (pos.x >= origin.x && pos.y >= origin.y))
    )
  }
  const plan = straightConnection(from, to, wire.obstacles, allowed, scale)
  if (!plan) return say('目前沒有可安全對齊的位置，請先移開中間的節點或調整端點')
  const graph = exportGraph()
  const field = graphModel.edges.includes(edge) ? 'edges' : 'groupLinks'
  const index = graphModel.document[field].indexOf(edge)
  const layout = {
    ...(edge.wireLayout?.label ? { label: edge.wireLayout.label } : {}),
    start: plan.faces[0],
    end: plan.faces[1],
  }
  if (!plan.distance && equalJson(layout, edge.wireLayout)) return say('這條連線已經是直線')
  if (plan.distance) {
    const { item, pos } = plan
    storeDisplayedPosition(graph.nodes[item.id], item, pos, scale)
  }
  graph[field][index].wireLayout = layout
  replaceGraph(graph, { keepView: true })
  setEditTarget({ edge: graphModel.document[field][index] })
  say(plan.distance ? '已對齊節點並拉直連線，可按復原還原' : '已拉直連線，可按復原還原')
}
