import { isFrameNode } from '../graph/nodeTypes.js'
import { sheetInGraph } from '../graph/nodeSheet.js'

export const foldedFrames = new Set()
export function hiddenFrameMembers(graph, folded = foldedFrames) {
  const hidden = new Set()
  const pending = [...folded]
  const visited = new Set()
  for (const id of pending) {
    if (visited.has(id)) continue
    visited.add(id)
    const node = graph.nodes[id]
    if (!node) continue
    if (isFrameNode(node)) {
      for (const member of node.frameMembers || []) {
        if (member === id || !graph.nodes[member]) continue
        hidden.add(member)
        pending.push(member)
      }
    }
    if (hidden.has(id)) for (const flow of graph.subflows || []) {
      if (flow.parent !== id) continue
      for (const member of Object.values(graph.nodes)) if (sheetInGraph(graph, member.id) === flow.id) {
        hidden.add(member.id)
        pending.push(member.id)
      }
    }
  }
  return hidden
}

export function revealFrameMember(graph, id) {
  for (const frame of foldedFrames) {
    if (!graph.nodes[frame] || hiddenFrameMembers(graph, new Set([frame])).has(id)) foldedFrames.delete(frame)
  }
}
