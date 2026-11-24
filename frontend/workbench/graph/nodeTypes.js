const nodeTypes = {
  action: '一般步驟',
  decision: '決策節點',
  frame: '外框',
  main: '流程入口',
  return: '返回節點',
  fault: '異常處理',
  note: '註記',
  shared: '子流程步驟',
}

function effectiveType(n) {
  if (n.type) return n.type
  if (n.nodeRole) return n.nodeRole
  if (n.sourceKind === 'container') return 'frame'
  if (n.decision) return 'decision'
  if (n.sourceKind === 'annotation') return 'note'
  return n.sourceKind === 'subflow' ? 'shared' : 'action'
}

function isFrameNode(n) {
  return effectiveType(n) === 'frame'
}

const kindLabels = { ...nodeTypes, return: '返回／重試' }

export { nodeTypes, effectiveType, isFrameNode, kindLabels }
