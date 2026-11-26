// A reviewer can keep a newly assigned reference and the team definition it needs
// while accepting the original edit on the other nodes.
import { assignments, declaredOptions } from './catalog.js'

export function keepDefinition(graph, team, kind, name) {
  if (declaredOptions(graph, kind).includes(name)) return
  if (kind === 'badge') {
    if (team.badgeStyles?.[name]) (graph.badgeStyles ??= {})[name] = structuredClone(team.badgeStyles[name])
  } else if (kind === 'category') {
    const original = team.sourceLegend?.items?.filter(item => item.name === name)
    if (original?.length) {
      graph.sourceLegend ??= { ...structuredClone(team.sourceLegend), items: [] }
      ;(graph.sourceLegend.items ??= []).push(...structuredClone(original))
    } else {
      const custom = team.customCategories?.find(item => item.name === name)
      if (custom) (graph.customCategories ??= []).push(structuredClone(custom))
    }
  } else if (kind === 'group') {
    const group = team.layoutGroups?.find(g => g.name === name)
    if (group) {
      const copy = structuredClone(group)
      if (copy.memberOrder) copy.memberOrder = copy.memberOrder.filter(id => graph.nodes[id]?.group === name)
      ;(graph.layoutGroups ??= []).push(copy)
    }
  } else {
    const list = assignments.find(a => a.control === kind)?.list
    if (list) (graph[list] ??= []).push(name)
    else {
      const field = graph.fieldDefinitions?.find(f => kind === 'field:' + f.id)
      if (field) (field.options ??= []).push(name)
    }
  }
}
