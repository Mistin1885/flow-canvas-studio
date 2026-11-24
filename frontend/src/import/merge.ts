import { records, type Graph, type Snapshot, type Table, type Link } from '../api'

import { preserveFields } from './preserveFields'
import type { Origin } from './provenance'

export type Side = 'team' | 'file'
export type Choices = Record<string, Side>
export type Row = {
  id: string
  table: Table
  key: string
  team: unknown
  file: unknown
  order: number
  intent: boolean
  concurrent: boolean
}
export type Group = { token: string; rows: Row[]; conflict: boolean; defaultSide: Side }

// Object property order has no meaning in JSON. Array order (e.g. steps) does.
export function signature(value: unknown): string {
  return (
    JSON.stringify(value, (_, item) =>
      item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(
            Object.keys(item)
              .sort()
              .map((key) => [key, item[key]]),
          )
        : item,
    ) ?? 'undefined'
  )
}

function nodeRefs(row: Row, value: unknown): string[] {
  if (!value) return []
  if (row.table === 'meta') {
    if (!Array.isArray(value)) return []
    if (row.key === 'navigation') return value
    if (row.key === 'subflows' || row.key === 'layoutGroups')
      return value.flatMap((item) => [item.root, item.parent, ...(item.memberOrder ?? [])])
    if (row.key === 'groupLinks') return value.flatMap((edge) => [edge.from, edge.to])
    return []
  }
  const item = value as {
    from?: string
    to?: string
    jumpTo?: string
    jumpScope?: string
    resume?: string
    frameMembers?: string[]
    scopeOverrides?: Record<string, { to?: string; resume?: string }>
  }
  return [
    item.from,
    item.to,
    item.jumpTo,
    item.jumpScope,
    item.resume,
    ...(item.frameMembers ?? []),
    ...Object.entries(item.scopeOverrides ?? {}).flatMap(([scope, patch]) => [
      scope,
      patch.to,
      patch.resume,
    ]),
  ].filter((id): id is string => typeof id === 'string')
}

export function compare(base: Graph, incoming: Graph, latest: Snapshot, origin?: Origin, protectMissing = false): Group[] {
  const original = records(base),
    file = records(protectMissing ? preserveFields(incoming, latest.graph) : incoming),
    atBase = protectMissing ? records(preserveFields(incoming, base)) : file,
    team = records(latest.graph)
  const rows = new Map<string, Row>()
  const rowId = (table: Table, key: string) => JSON.stringify([table, key])
  for (const table of ['nodes', 'edges', 'meta'] as const) {
    for (const key of new Set([...Object.keys(file[table]), ...Object.keys(team[table])])) {
      const get = (data: typeof team) => (Object.hasOwn(data[table], key) ? data[table][key] : undefined)
      const f = get(file),
        t = get(team),
        b = signature(get(original))
      const fromFile = signature(f),
        fromTeam = signature(t)
      if (fromFile === fromTeam) continue
      const id = rowId(table, key)
      const intent = origin ? origin.modified.has(id) : b !== (atBase === file ? fromFile : signature(get(atBase)))
      const concurrent = origin
        ? t === undefined
          ? origin.original.has(id)
          : latest.versions[table][key] > origin.revision
        : b !== fromTeam
      rows.set(id, { id, table, key, order: rows.size, team: t, file: f, intent, concurrent })
    }
  }

  // A node and a reference that requires its existence must be reviewed together.
  const links = new Map<string, Set<string>>()
  for (const row of rows.values()) {
    for (const side of ['team', 'file'] as const) {
      for (const id of nodeRefs(row, row[side])) {
        const node = rows.get(rowId('nodes', id))
        if (!node || (!node.intent && !row.intent) || node[side === 'team' ? 'file' : 'team'] !== undefined)
          continue
        for (const [a, b] of [
          [row.id, node.id],
          [node.id, row.id],
        ]) {
          if (!links.has(a)) links.set(a, new Set())
          links.get(a)!.add(b)
        }
      }
    }
  }

  const seen = new Set<string>(),
    groups: Group[] = []
  for (const row of rows.values()) {
    if (seen.has(row.id)) continue
    const members: Row[] = [],
      pending = [row.id]
    while (pending.length) {
      const id = pending.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      members.push(rows.get(id)!)
      pending.push(...(links.get(id) ?? []))
    }
    members.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const intended = members.some((r) => r.intent)
    const conflict = intended && members.some((r) => r.concurrent)
    // Only decisions about the exact reviewed content survive a refresh.
    const token = signature(members.map((r) => [r.id, latest.versions[r.table][r.key] ?? null]))
    groups.push({ token, rows: members, conflict, defaultSide: intended ? 'file' : 'team' })
  }
  return groups.sort((a, b) => Number(b.conflict) - Number(a.conflict))
}

export function resolve(latest: Snapshot, groups: Group[], choices: Choices) {
  const result = records(latest.graph)
  result.nodes = { ...result.nodes }
  const ops = []
  const selected: Row[] = []
  let unresolved = 0
  for (const group of groups) {
    const choice = choices[group.token]
    if (!choice && group.conflict) unresolved++
    if ((choice ?? (group.conflict ? 'team' : group.defaultSide)) !== 'file') continue
    selected.push(...group.rows)
  }
  // Dependency groups are sorted for display. Persist new records in document order.
  for (const { table, key, file } of selected.sort((a, b) => a.order - b.order)) {
    if (file === undefined) delete result[table][key]
    else result[table][key] = file
    ops.push({
      table,
      key,
      value: file,
      remove: file === undefined,
      version: latest.versions[table][key] ?? null,
    })
  }
  const graph = {
    ...result.meta,
    nodes: result.nodes as Graph['nodes'],
    edges: Object.values(result.edges) as Link[],
  }
  return { unresolved, ops, graph }
}
