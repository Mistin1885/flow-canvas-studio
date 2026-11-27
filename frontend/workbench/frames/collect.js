import { setEditTarget } from '../editing/selection.js'
import { graphModel } from '../graph/model.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { diagramState } from '../diagram/state.js'
import { hiddenGroups } from '../groups/visibility.js'
import { sourceMembers } from './membership.js'
import { foldedFrames } from './folding.js'
import { exportGraph } from '../io/graph.js'
import { replaceGraph } from '../graph/replace.js'
import { storeDisplayedPosition, pinDisplayedNodes } from '../editing/nodePosition.js'
import { say } from '../ui/toast.js'
import { containedMembers } from './containment.js'

export function collectFrameMembers(id) {
  const node = graphModel.nodes[id], frame = diagramState.instanceMap.get(id)
  if (!node || !isFrameNode(node) || !frame) return
  if (foldedFrames.has(id)) { say('請先展開框內步驟，再納入節點'); return }
  const candidates = diagramState.instances.filter(i => !hiddenGroups.has(graphModel.nodes[i.id].group))
  const found = containedMembers(frame, candidates, graphModel.nodes)
  const current = sourceMembers(node)
  const added = found.filter(key => !current.includes(key))
  if (!added.length) { say('沒有可新增的框內節點；節點需完整位於外框範圍內'); return }
  const graph = exportGraph(), draft = graph.nodes[id]
  pinDisplayedNodes(graph, diagramState.layoutInstances, diagramState.readingScale)
  draft.frameMembers = [...current, ...added]
  draft.layoutSize = { width: frame.w / diagramState.readingScale, height: frame.h / diagramState.readingScale }
  storeDisplayedPosition(draft, frame, frame, diagramState.readingScale)
  replaceGraph(graph, { keepView: true, selection: id })
  setEditTarget({ node: id })
  say('已納入 ' + added.length + ' 個框內節點，保留原排版，可復原')
}
