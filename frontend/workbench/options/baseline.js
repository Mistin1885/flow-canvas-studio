import { cloneGraph } from '../graph/json.js'
import { replaceKey, replaceNames, ungrouped } from './catalog.js'

// Compare form controls in their new names, so a bulk rename alone never rewrites
// unrelated node data or looks like an edit to the group's layout direction.
export function alignedBaseline(initial, edits) {
  if (!edits.length) return initial
  const base = cloneGraph(initial)
  for (const { kind, from, to } of edits) {
    if (kind === 'badge') replaceKey(base.badges.placements, from, to)
    else if (kind === 'category') base.tags = replaceNames(base.tags, from, to)
    else if (kind.startsWith('field:')) {
      const field = kind.slice(6)
      if (base.values[field] === from) base.values[field] = to ?? ''
    } else {
      const id = 'node-' + kind
      if (base.fields[id] === from) base.fields[id] = to ?? (kind === 'group' ? ungrouped : '')
      if (kind === 'group') {
        const groups = new Map(base.groups), direction = groups.get(from)
        groups.delete(from)
        if (to !== null && direction) groups.set(to, direction)
        if (to === null && !groups.has(ungrouped)) groups.set(ungrouped, 'auto')
        base.groups = [...groups]
      }
    }
  }
  return base
}
