import { sheetInGraph } from '../graph/nodeSheet.js'
import { validBadgeName } from '../badges/model.js'
import { unmappedTag } from '../categories/constants.js'

export const ungrouped = '未分組'
export const assignments = [
  { control: 'role', field: 'ownerRole', list: 'ownerRoleOptions' },
  { control: 'where', field: 'where', list: 'locationOptions' },
]
const assignment = kind => assignments.find(item => item.control === kind)
const field = (graph, kind) => graph.fieldDefinitions?.find(f => kind === 'field:' + f.id && f.type === 'select')
const members = graph => Object.values(graph.nodes)

export function reservedOption(kind, name) {
  return (kind === 'group' && name === ungrouped) || (kind === 'category' && name === unmappedTag)
}

export function nodeOptionNames(node, kind) {
  if (kind === 'category') return node.tags || []
  if (kind === 'badge') return Object.keys(node.badges || {})
  const value = kind.startsWith('field:') ? node.fieldValues?.[kind.slice(6)] : node[assignment(kind)?.field ?? kind]
  return value ? [value] : []
}

export function optionCounts(graph, kind) {
  const counts = new Map()
  for (const node of members(graph))
    for (const name of new Set(nodeOptionNames(node, kind))) counts.set(name, (counts.get(name) || 0) + 1)
  return counts
}

export function validateName(kind, from, to, names) {
  if (reservedOption(kind, from)) throw Error('此項目為系統預設值。')
  if (to === null) return
  const limit = { group: 80, category: 64, role: 80, where: 500 }[kind]
  if (!to || (limit && to.length > limit) || (kind === 'badge' && !validBadgeName(to)))
    throw Error('請輸入有效的名稱。' + (limit ? '最多 ' + limit + ' 字。' : ''))
  if (reservedOption(kind, to) || (kind === 'group' && to === '未指定') ||
      names.some(name => name !== from && name.toLowerCase() === to.toLowerCase()))
    throw Error('此名稱已使用或為系統保留名稱。')
}

export function groupConnections(graph, name) {
  const key = 'group:' + name
  return (graph.groupLinks || []).filter(e => e.from === key || e.to === key)
}

export function replaceNames(names, from, to) {
  return [...new Set(names.flatMap(name => name !== from ? [name] : to === null ? [] : [to]))]
}

export function replaceKey(record, from, to) {
  if (!record || !Object.hasOwn(record, from)) return
  if (to !== null && !Object.hasOwn(record, to)) record[to] = record[from]
  delete record[from]
}

export function categoryNames(graph) {
  const source = graph.sourceLegend?.items || []
  const names = new Set([...source, ...(graph.customCategories || [])].map(c => c.name))
  if (graph.sourceLegend) names.add(unmappedTag)
  return names
}

export function declaredOptions(graph, kind) {
  if (kind === 'group') return (graph.layoutGroups || []).map(g => g.name)
  if (kind === 'category') return [...categoryNames(graph)]
  if (kind === 'badge') return Object.keys(graph.badgeStyles || {})
  const spec = assignment(kind)
  return spec ? graph[spec.list] || [] : field(graph, kind)?.options || []
}

function editGroup(graph, from, to) {
  const categories = categoryNames(graph)
  const affected = members(graph).filter(n => n.group === from)
  const sheets = affected.map(n => sheetInGraph(graph, n.id))
  affected.forEach((n, i) => {
    n.sheetId = sheets[i]
    n.group = to ?? ungrouped
    if (n.tags?.includes(from) && !categories.has(from))
      n.tags = replaceNames(n.tags, from, categories.has(to) ? null : to)
  })
  const entry = graph.layoutGroups?.find(g => g.name === from)
  if (to === null) {
    if (entry) graph.layoutGroups = graph.layoutGroups.filter(g => g !== entry)
  } else if (entry) entry.name = to
  else if (!declaredOptions(graph, 'group').includes(to)) (graph.layoutGroups ??= []).push({ name: to, direction: 'auto' })
  const links = new Set(groupConnections(graph, from))
  if (links.size && to === null) graph.groupLinks = graph.groupLinks.filter(e => !links.has(e))
  else for (const edge of links)
    for (const end of ['from', 'to']) if (edge[end] === 'group:' + from) edge[end] = 'group:' + to
}

// Both editing surfaces use the same graph mutation. Each caller supplies a private graph copy.
export function applyOptionEdit(graph, { kind, from, to }) {
  if (from === to) return
  if (kind === 'group') return editGroup(graph, from, to)
  if (kind === 'category') {
    for (const [owner, key] of [[graph, 'customCategories'], [graph.sourceLegend, 'items']]) {
      const entries = owner?.[key]
      if (!entries) continue
      if (to === null) owner[key] = entries.filter(c => c.name !== from)
      else for (const entry of entries) if (entry.name === from) entry.name = to
    }
    for (const n of members(graph)) if (n.tags?.includes(from)) n.tags = replaceNames(n.tags, from, to)
  } else if (kind === 'badge') {
    replaceKey(graph.badgeStyles, from, to)
    for (const n of members(graph)) replaceKey(n.badges, from, to)
  } else {
    const spec = assignment(kind), definition = field(graph, kind)
    if (!spec && !definition) throw Error('找不到自訂欄位，請重新開啟編輯器。')
    if (spec) {
      const options = replaceNames(graph[spec.list] || [], from, to)
      if (to !== null && !options.includes(to)) options.push(to)
      if (graph[spec.list] || options.length) graph[spec.list] = options
    } else {
      definition.options = replaceNames(definition.options || [], from, to)
      if (to !== null && !definition.options.includes(to)) definition.options.push(to)
      if (from === null) return
    }
    for (const node of members(graph)) {
      const owner = spec ? node : node.fieldValues, key = spec?.field ?? definition.id
      if (owner?.[key] !== from) continue
      if (to === null) delete owner[key]
      else owner[key] = to
      if (!spec && !Object.keys(owner).length) delete node.fieldValues
    }
  }
}
