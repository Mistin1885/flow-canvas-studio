import { effectiveType } from './nodeTypes.js'

const prefixes = {
  action: 'STEP', decision: 'DEC', frame: 'FRAME', main: 'MAIN',
  return: 'RET', fault: 'FAULT', note: 'NOTE', shared: 'SUB',
}

export function suggestNodeId(type, nodes) {
  const prefix = prefixes[type] || prefixes.action
  let number = 1
  while (Object.hasOwn(nodes, prefix + number)) number++
  return prefix + number
}

export function suggestIdForNode(node, nodes) {
  return suggestNodeId(node.jumpTo ? 'return' : effectiveType(node), nodes)
}
