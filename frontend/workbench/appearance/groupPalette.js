import { typeKey } from '../modeling/nodeTypeCatalog.js'

const palettes = new WeakMap()

// Imported graphs can describe an entire group's palette as individual card styles.
// Use a majority for each property so exceptions and tied colours do not become defaults.
function majority(peers) {
  const votes = new Map(), style = {}
  for (const peer of peers) {
    for (const [key, raw] of Object.entries(peer.nodeStyle)) {
      const value = raw.toLowerCase()
      if (!votes.has(key)) votes.set(key, new Map())
      const counts = votes.get(key)
      const count = (counts.get(value) || 0) + 1
      counts.set(value, count)
      if (count > peers.length / 2) style[key] = value
    }
  }
  return style
}

export function peerStyle(graph, node) {
  let groups = palettes.get(graph)
  if (!groups) palettes.set(graph, groups = new Map())
  if (!groups.has(node.group)) {
    const peers = Object.values(graph.nodes).filter(n =>
      n.group === node.group && !n.inheritPeerStyle && n.nodeStyle && Object.keys(n.nodeStyle).length)
    const byType = new Map()
    for (const peer of peers) {
      const type = typeKey(peer)
      if (!byType.has(type)) byType.set(type, [])
      byType.get(type).push(peer)
    }
    groups.set(node.group, {
      common: majority(peers),
      byType: new Map([...byType].map(([type, items]) => [type, majority(items)])),
    })
  }
  const group = groups.get(node.group)
  return group.byType.get(typeKey(node)) ?? group.common
}

export function invalidatePeerStyles(graph) {
  palettes.delete(graph)
}
