import { graphModel } from '../graph/model.js'
import { diagramState } from '../diagram/state.js'
import { dockProjectLinks } from './ports.js'
import { layoutGraph } from './dagre.js'
import { applyLayoutEdits } from '../groups/layout.js'
import { expandedFlows, expandFlowMembers } from '../diagram/visibleGraph.js'
import { draw } from '../diagram/render.js'
import { setHash, tweenView } from '../diagram/navigation.js'
import { $ } from '../ui/dom.js'

// In the workbook each test occupies a box inside the L10 assembly.
// Reserve that box before laying out the sheet, then place its contents inside.
// A flow frame reserves space for its members. The header and its children
// retain the dimensions measured from their own text, at every reading size.
function prepareInlineFlow(sf) {
  const host = diagramState.instanceMap.get(sf.parent),
    nodes = diagramState.instances.filter((i) => i.scope === sf.id)
  if (!host || !nodes.length) return
  const links = diagramState.graphLinks.filter((l) => l.from.scope === sf.id && l.to.scope === sf.id)
  const out = new Map(),
    seen = new Set(),
    order = []
  for (const l of links) {
    if (!out.has(l.from)) out.set(l.from, [])
    out.get(l.from).push(l)
  }
  let at = diagramState.instanceMap.get(sf.root)
  while (at && !seen.has(at)) {
    seen.add(at)
    order.push(at)
    const exits = out.get(at) || []
    at = exits.length === 1 ? exits[0].to : null
  }
  const custom = Array.isArray(sf.memberOrder)
  if (custom) {
    const rank = new Map(sf.memberOrder.map((id, k) => [id, k]))
    order.splice(
      0,
      order.length,
      ...[...nodes].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity)),
    )
  }
  const chain =
    order.length === nodes.length &&
    links.length === nodes.length - 1 &&
    links.every((l) => !l.edge.label)
  const pad = 24 * diagramState.readingScale,
    gap = 40 * diagramState.readingScale
  let bounds
  if (chain || custom) {
    const col = (k) => (Math.floor(k / 2) % 2 === 0 ? k % 2 : 1 - (k % 2))
    const widths = [0, 0]
    order.forEach((i, k) => {
      i.column = col(k)
      widths[i.column] = Math.max(widths[i.column], i.w)
    })
    let y = 0
    for (let k = 0; k < order.length; k += 2) {
      const row = order.slice(k, k + 2),
        height = Math.max(...row.map((i) => i.h + i.badgeTop + i.badgeBottom))
      for (const i of row) {
        i.x = (i.column ? widths[0] + gap : 0) + (widths[i.column] - i.w) / 2
        i.y = y + i.badgeTop + (height - i.h - i.badgeTop - i.badgeBottom) / 2
      }
      y += height + gap
    }
    for (const l of links) {
      const a = l.from,
        b = l.to
      if (a.column === b.column)
        l.points = [
          { x: a.x + a.w / 2, y: a.y + a.h },
          { x: b.x + b.w / 2, y: b.y },
        ]
      else {
        const right = b.column > a.column
        l.points = [
          { x: a.x + (right ? a.w : 0), y: a.y + a.h / 2 },
          { x: b.x + (right ? 0 : b.w), y: b.y + b.h / 2 },
        ]
      }
      l.lines = []
    }
    if (custom) dockProjectLinks(links)
    bounds = { width: widths[0] + (widths[1] ? gap + widths[1] : 0), height: y - gap }
  } else {
    bounds = layoutGraph(nodes, links, 'TB')
    dockProjectLinks(links)
  }
  const editedBounds = applyLayoutEdits(nodes, links)
  if (editedBounds) {
    bounds = editedBounds
    dockProjectLinks(editedBounds.affected)
  }
  const headerSpace = host.badgeTop + host.h + host.badgeBottom + gap
  host.inlineFlow = {
    nodes,
    links,
    id: sf.id,
    pad,
    headerSpace,
    w: Math.max(host.w, bounds.width) + 2 * pad,
    h: headerSpace + bounds.height + 2 * pad,
  }
}

function placeInlineFlows() {
  for (const host of diagramState.instances.filter((i) => i.inlineFlow)) {
    const f = host.inlineFlow,
      dx = f.x + f.pad,
      dy = f.y + f.pad + f.headerSpace
    const moved = new Set()
    const origin = { x: dx, y: dy }
    for (const i of f.nodes) {
      i.scopeOrigin = origin
      const pos = graphModel.nodes[i.id].layoutPosition
      if (pos) {
        i.appliedOffset = { x: pos.x - i.x / diagramState.readingScale, y: pos.y - i.y / diagramState.readingScale }
        i.x = pos.x * diagramState.readingScale
        i.y = pos.y * diagramState.readingScale
        moved.add(i)
      }
      i.x += dx
      i.y += dy
    }
    // Grow the outline after positioning its host. Resizing it during automatic
    // layout would move the origin during the very drop that enlarged the flow.
    if (moved.size) {
      const right = Math.max(f.x + f.w, ...[...moved].map(i => i.x + i.w + f.pad))
      const bottom = Math.max(f.y + f.h, ...[...moved].map(i => i.y + i.h + f.pad))
      f.x = Math.min(f.x, ...[...moved].map(i => i.x - f.pad))
      f.y = Math.min(f.y, ...[...moved].map(i => i.y - f.pad))
      f.w = right - f.x
      f.h = bottom - f.y
      diagramState.totalW = Math.max(diagramState.totalW, right + f.pad)
      diagramState.totalH = Math.max(diagramState.totalH, bottom + f.pad)
    }
    for (const l of f.links) {
      l.points = l.points.map((p) => ({ x: p.x + dx, y: p.y + dy }))
      if (l.lines.length) {
        l.labelX += dx
        l.labelY += dy
      }
    }
    if (moved.size) dockProjectLinks(f.links.filter(l => moved.has(l.from) || moved.has(l.to)))
  }
}

function positionFootprint(i, x, y) {
  const f = i.inlineFlow
  if (f) {
    f.x = x
    f.y = y
    i.x = x + (f.w - i.w) / 2
    i.y = y + f.pad + i.badgeTop
  } else {
    i.x = x
    i.y = y
  }
}

function toggleInlineFlow(sf) {
  const closing = expandedFlows.has(sf.id),
    parent = diagramState.instanceMap.get(sf.parent)
  if (!parent) return
  if (closing) expandedFlows.delete(sf.id)
  else {
    expandedFlows.add(sf.id)
    expandFlowMembers(sf)
  }
  diagramState.selected = parent
  draw(sf.parent)
  setHash(sf.parent)
  if (matchMedia('(max-width:850px)').matches) $('inspector').classList.remove('open')
  const i = diagramState.instanceMap.get(sf.parent),
    r = $('canvas').getBoundingClientRect(),
    x = diagramState.tx + i.x * diagramState.scale,
    y = diagramState.ty + i.y * diagramState.scale
  if (x < 10 || x > r.width - 85 || y < 38 || y > r.height - 130) {
    tweenView(
      Math.max(16, Math.min(x, r.width * 0.15)) - i.x * diagramState.scale,
      Math.max(44, Math.min(y, r.height * 0.24)) - i.y * diagramState.scale,
    )
  }
}

export { placeInlineFlows, positionFootprint, prepareInlineFlow, toggleInlineFlow }
