import type { Graph } from '../api'

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

// An unversioned file may predate modeling fields. Only inherit omitted values on matching nodes.
export function preserveFields(file: Graph, team: Graph): Graph {
  let graph = file
  for (const [id, incoming] of Object.entries(file.nodes)) {
    const current = team.nodes[id]
    if (!current) continue
    const patch: Record<string, unknown> = {}
    for (const field of ['ownerRole', 'gatewayRule', 'fieldValues', 'badges']) {
      if (!Object.hasOwn(incoming, field) && Object.hasOwn(current, field)) patch[field] = current[field]
    }
    const values = incoming.fieldValues
    if (isRecord(values) && isRecord(current.fieldValues) &&
        Object.keys(current.fieldValues).some(key => !Object.hasOwn(values, key)))
      patch.fieldValues = { ...current.fieldValues, ...values }
    if (!Object.keys(patch).length) continue
    if (graph === file) graph = { ...file, nodes: { ...file.nodes } }
    graph.nodes[id] = { ...incoming, ...patch }
  }
  for (const [key, value] of Object.entries(team)) {
    if ((key.startsWith('knowledge.') || key === 'knowledgePins') && !Object.hasOwn(file, key))
      graph = { ...graph, [key]: value }
  }
  for (const key of ['ownerRoleOptions', 'locationOptions']) {
    const current = team[key], incoming = file[key]
    if (!Array.isArray(current)) continue
    if (incoming === undefined) graph = { ...graph, [key]: current }
    else if (Array.isArray(incoming) && current.some(value => !incoming.includes(value)))
      graph = { ...graph, [key]: [...new Set([...incoming, ...current])] }
  }
  if (isRecord(team.badgeStyles)) {
    if (!Object.hasOwn(file, 'badgeStyles')) graph = { ...graph, badgeStyles: team.badgeStyles }
    else if (isRecord(file.badgeStyles)) {
      const incoming = file.badgeStyles
      if (Object.keys(team.badgeStyles).some(name => !Object.hasOwn(incoming, name)))
        graph = { ...graph, badgeStyles: { ...team.badgeStyles, ...incoming } }
    }
  }
  if (!Object.hasOwn(file, 'fieldDefinitions') && Object.hasOwn(team, 'fieldDefinitions'))
    return { ...graph, fieldDefinitions: team.fieldDefinitions }
  if (Array.isArray(file.fieldDefinitions) && Array.isArray(team.fieldDefinitions)) {
    const ids = new Set(file.fieldDefinitions.map(def => def?.id))
    const missing = team.fieldDefinitions.filter(def => !ids.has(def?.id))
    if (missing.length) return { ...graph, fieldDefinitions: [...file.fieldDefinitions, ...missing] }
  }
  return graph
}
