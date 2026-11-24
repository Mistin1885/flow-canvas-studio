const prefixes = {
  action: 'STEP', decision: 'DEC', frame: 'FRAME', main: 'MAIN',
  fault: 'FAULT', note: 'NOTE', shared: 'SUB',
}

export function suggestNodeId(type, nodes) {
  const prefix = prefixes[type] || prefixes.action
  let number = 1
  while (Object.hasOwn(nodes, prefix + number)) number++
  return prefix + number
}
