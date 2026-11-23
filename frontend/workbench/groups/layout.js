import { editState } from '../editing/state.js'
import { isFrameNode } from '../graph/nodeTypes.js'

import { graphModel } from '../graph/model.js'
import { $ } from '../ui/dom.js'

import { diagramState } from '../diagram/state.js'
import { layoutGraph } from '../layout/dagre.js'
import { positionFootprint } from '../layout/inlineFlows.js'
import { gridPlacement } from '../layout/grid.js'

function setupGroups(n) {
  editState.groupDraft = new Map(Object.values(graphModel.nodes).map((item) => [item.group, 'auto']))
  for (const g of graphModel.document.layoutGroups || []) editState.groupDraft.set(g.name, g.direction)
  if (!editState.groupDraft.has(n.group)) editState.groupDraft.set(n.group, 'auto')
  const picker = $('node-group')
  picker.replaceChildren()
  for (const name of editState.groupDraft.keys()) picker.add(new Option(name, name))
  picker.value = n.group
  $('group-direction').value = editState.groupDraft.get(n.group)
  $('group-name').value = ''
  $('group-message').textContent = ''
}

function applyLayoutEdits(nodes, links) {
  if (!nodes.length) return
  const active = (graphModel.document.layoutGroups || []).filter(
    (g) => g.direction !== 'auto' && nodes.some((i) => graphModel.nodes[i.id].group === g.name),
  )
  const moved = nodes
    .filter((i) => graphModel.nodes[i.id].layoutOffset)
    .sort((a, b) => (graphModel.nodes[a.id].layoutOrder || 0) - (graphModel.nodes[b.id].layoutOrder || 0))
  if (!active.length && !moved.length) return
  const occupied = nodes
    .filter(
      (i) =>
        !active.some((g) => g.name === graphModel.nodes[i.id].group) &&
        !isFrameNode(graphModel.nodes[i.id]),
    )
    .map((i) => i.inlineFlow || i)
  const gap = 36 * diagramState.readingScale
  for (const g of active) {
    const members = nodes.filter((i) => graphModel.nodes[i.id].group === g.name),
      set = new Set(members)
    const inner = links.filter((l) => set.has(l.from) && set.has(l.to))
    const startX = Math.min(...members.map((i) => (i.inlineFlow || i).x)),
      startY = Math.min(...members.map((i) => (i.inlineFlow || i).y))
    const bounds = layoutGraph(members, inner, g.direction === 'TD' ? 'TB' : g.direction, true)
    const x = Math.max(0, startX)
    let y = Math.max(0, startY)
    for (const box of [...occupied].sort((a, b) => a.y - b.y)) {
      if (
        x < box.x + box.w + gap &&
        x + bounds.width + gap > box.x &&
        y < box.y + box.h + gap &&
        y + bounds.height + gap > box.y
      )
        y = box.y + box.h + gap
    }
    for (const i of members) positionFootprint(i, x + i.x, y + i.y)
    occupied.push({ x, y, w: bounds.width, h: bounds.height })
  }
  const blocked = nodes
    .filter((i) => !graphModel.nodes[i.id].layoutOffset && !isFrameNode(graphModel.nodes[i.id]))
    .map((i) => i.inlineFlow || i)
  for (const i of moved) {
    const offset = graphModel.nodes[i.id].layoutOffset,
      b = i.inlineFlow || i,
      baseX = b.x,
      baseY = b.y
    const pos = gridPlacement(
      baseX + offset.x * diagramState.readingScale,
      baseY + offset.y * diagramState.readingScale,
      b.w,
      b.h,
      blocked,
    )
    positionFootprint(i, pos.x, pos.y)
    i.appliedOffset = {
      x: (pos.x - baseX) / diagramState.readingScale,
      y: (pos.y - baseY) / diagramState.readingScale,
    }
    if (!isFrameNode(graphModel.nodes[i.id])) blocked.push(b)
  }
  const changed = new Set([
    ...moved,
    ...nodes.filter((i) => active.some((g) => g.name === graphModel.nodes[i.id].group)),
  ])
  const affected = links.filter((l) => changed.has(l.from) || changed.has(l.to))
  const boxes = nodes.map((i) => i.inlineFlow || i)
  return {
    affected,
    width: Math.max(...boxes.map((b) => b.x + b.w)),
    height: Math.max(...boxes.map((b) => b.y + b.h)),
  }
}

export { applyLayoutEdits, setupGroups }
