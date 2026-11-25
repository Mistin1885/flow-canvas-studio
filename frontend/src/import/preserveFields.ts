import type { Graph } from '../api'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const nodeLabels = {
  ownerRole: '負責角色/負責人', gatewayRule: '分流與匯合規則',
  fieldValues: '自訂欄位值', badges: '醒目標籤',
}

// Collect the review labels at the exact point each omitted field is preserved.
export function preserveFields(file: Graph, team: Graph, omissions?: Set<string>): Graph {
  let graph = file
  const preserveMeta = (key: string, value: unknown, label: string) => {
    if (graph === file) graph = { ...file }
    graph[key] = value
    omissions?.add(label)
  }
  for (const [id, incoming] of Object.entries(file.nodes)) {
    const current = team.nodes[id]
    if (!current) continue
    const patch: Record<string, unknown> = {}
    for (const [field, label] of Object.entries(nodeLabels)) {
      if (!Object.hasOwn(incoming, field) && Object.hasOwn(current, field)) {
        patch[field] = current[field]
        omissions?.add(label)
      }
    }
    const values = incoming.fieldValues
    if (isRecord(values) && isRecord(current.fieldValues) &&
        Object.keys(current.fieldValues).some(key => !Object.hasOwn(values, key))) {
      patch.fieldValues = { ...current.fieldValues, ...values }
      omissions?.add(nodeLabels.fieldValues)
    }
    if (!Object.keys(patch).length) continue
    if (graph === file) graph = { ...file, nodes: { ...file.nodes } }
    graph.nodes[id] = { ...incoming, ...patch }
  }
  for (const [key, value] of Object.entries(team)) {
    if (Object.hasOwn(file, key)) continue
    if (key.startsWith('knowledge.')) preserveMeta(key, value, '知識條目')
    else if (key === 'knowledgePins') preserveMeta(key, value, '畫布知識釘選')
  }
  for (const key of ['ownerRoleOptions', 'locationOptions']) {
    const current = team[key], incoming = file[key]
    if (!Array.isArray(current)) continue
    if (incoming === undefined) preserveMeta(key, current, '選單選項')
    else if (Array.isArray(incoming) && current.some(value => !incoming.includes(value)))
      preserveMeta(key, [...new Set([...incoming, ...current])], '選單選項')
  }
  if (isRecord(team.badgeStyles)) {
    if (!Object.hasOwn(file, 'badgeStyles')) preserveMeta('badgeStyles', team.badgeStyles, '醒目標籤樣式')
    else if (isRecord(file.badgeStyles)) {
      const incoming = file.badgeStyles
      if (Object.keys(team.badgeStyles).some(name => !Object.hasOwn(incoming, name)))
        preserveMeta('badgeStyles', { ...team.badgeStyles, ...incoming }, '醒目標籤樣式')
    }
  }
  if (!Object.hasOwn(file, 'fieldDefinitions') && Object.hasOwn(team, 'fieldDefinitions'))
    preserveMeta('fieldDefinitions', team.fieldDefinitions, '自訂欄位')
  else if (Array.isArray(file.fieldDefinitions) && Array.isArray(team.fieldDefinitions)) {
    const ids = new Set(file.fieldDefinitions.map(def => def?.id))
    const missing = team.fieldDefinitions.filter(def => !ids.has(def?.id))
    if (missing.length) preserveMeta('fieldDefinitions', [...file.fieldDefinitions, ...missing], '自訂欄位')
  }
  return graph
}
