// Return/retry links and cycle back-edges lead back to existing steps. They do
// not own a downstream branch. A shared step stays visible via any open path.
export function branchIndex(nodes, edges, sheetFor, flows) {
  const children = new Map(), roots = new Map(), incoming = new Set()
  const sheets = new Map(nodes.map(node => [node.id, sheetFor(node.id)]))
  for (const node of nodes) children.set(node.id, [])
  for (const edge of edges) {
    if (edge.kind !== 'next' && edge.kind !== 'spine') continue
    if (sheets.get(edge.from) !== sheets.get(edge.to)) continue
    children.get(edge.from).push(edge.to)
    incoming.add(edge.to)
  }
  const seen = new Set(), stack = new Set()
  function visit(id) {
    if (seen.has(id)) return
    seen.add(id)
    stack.add(id)
    children.set(id, children.get(id).filter(child => {
      if (stack.has(child)) return false
      visit(child)
      return true
    }))
    stack.delete(id)
  }
  for (const id of children.keys()) if (!incoming.has(id)) visit(id)
  for (const flow of flows) visit(flow.root)
  for (const id of children.keys()) visit(id)
  incoming.clear()
  for (const group of children.values()) for (const child of group) incoming.add(child)
  for (const [id, sheet] of sheets) {
    if (!roots.has(sheet)) roots.set(sheet, [])
    if (!incoming.has(id)) roots.get(sheet).push(id)
  }
  return { children, roots, sheets }
}

export function walkBranches(starts, children, folded = new Set()) {
  const seen = new Set(), pending = [...starts]
  for (const id of pending) {
    if (seen.has(id)) continue
    seen.add(id)
    if (!folded.has(id)) pending.push(...children.get(id))
  }
  return seen
}

// Reveal one route to the target. Other folded branches keep their state.
export function revealBranch(id, index, folded) {
  const pending = [...index.roots.get(index.sheets.get(id))]
  const parent = new Map(pending.map(root => [root, null]))
  for (const step of pending) {
    if (step === id) break
    for (const child of index.children.get(step)) {
      if (parent.has(child)) continue
      parent.set(child, step)
      pending.push(child)
    }
  }
  for (let step = parent.get(id); step != null; step = parent.get(step)) folded.delete(step)
}
