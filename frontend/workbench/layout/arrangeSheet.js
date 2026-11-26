import { compactLayers } from './compactLayers.js'

// Collapse a frame or a directional layout group to one box in its parent's
// ranking graph. Internal links still determine the order of its members.
export function arrangeSheet(cards, edges, direction, groupDirections) {
  const byId = new Map(cards.map((c) => [c.id, c]))
  const parent = new Map()
  for (const c of cards)
    for (const member of c.members || []) {
      if (member !== c.id && byId.has(member) && !byId.get(member).members && !parent.has(member))
        parent.set(member, c.id)
    }
  const groups = new Map()
  for (const c of cards) {
    if (!groupDirections.has(c.group) || parent.has(c.id)) continue
    if (!groups.has(c.group)) groups.set(c.group, Symbol(c.group))
    parent.set(c.id, groups.get(c.group))
  }
  const blocks = new Map(cards.map((c) => [c.id, c]))
  for (const [group, key] of groups) blocks.set(key, { group })
  const children = new Map()
  for (const key of blocks.keys()) {
    const owner = parent.get(key)
    if (!children.has(owner)) children.set(owner, [])
    children.get(owner).push(key)
  }
  function pack(owner, inherited) {
    const dirs = groupDirections.get(blocks.get(owner)?.group) || inherited
    const members = children.get(owner) || []
    const reps = new Map(),
      parts = new Map()
    const rows = members.map((key, index) => {
      const c = blocks.get(key),
        id = String(index)
      const nested = children.has(key) ? pack(key, dirs) : null
      const frame = nested && byId.has(key)
      const px = frame ? 22 : 0,
        py = frame ? 48 : 0
      const positions = new Map()
      if (nested)
        for (const [child, p] of nested.positions) positions.set(child, { x: p.x + px, y: p.y + py })
      if (byId.has(key)) positions.set(key, { x: c.offsetX || 0, y: c.offsetY || 0 })
      for (const child of positions.keys()) reps.set(child, id)
      parts.set(id, positions)
      return {
        id,
        w: nested ? Math.max(c.w || 0, nested.w + 2 * px) : c.w,
        h: nested ? nested.h + py + px : c.h,
      }
    })
    const links = edges
      .filter((e) => reps.has(e.from) && reps.has(e.to) && reps.get(e.from) !== reps.get(e.to))
      .map((e) => ({ ...e, from: reps.get(e.from), to: reps.get(e.to) }))
    const layout = compactLayers(rows, links, dirs)
    const positions = new Map()
    for (const [id, origin] of layout.positions)
      for (const [key, p] of parts.get(id)) {
        positions.set(key, { x: origin.x + p.x, y: origin.y + p.y })
      }
    return { ...layout, positions }
  }
  return pack(undefined, direction)
}
