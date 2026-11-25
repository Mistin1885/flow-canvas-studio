import { peerStyle } from '../appearance/groupPalette.js'

export function addNode(graph, node) {
  if (Object.keys(peerStyle(graph, node)).length) node.inheritPeerStyle = true
  graph.nodes[node.id] = node
}
