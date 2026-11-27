import { isFrameNode } from '../graph/nodeTypes.js'

export function containedMembers(frame, items, nodes) {
  return items.filter(item => {
    if (item.id === frame.id || item.scope !== frame.scope || isFrameNode(nodes[item.id])) return false
    const box = item.inlineFlow || item
    return box.x >= frame.x - .01 && box.y >= frame.y - .01 &&
      box.x + box.w <= frame.x + frame.w + .01 && box.y + box.h <= frame.y + frame.h + .01
  }).sort((a, b) => a.y - b.y || a.x - b.x).map(item => item.id)
}
