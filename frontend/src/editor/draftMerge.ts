import { records, type Graph, type Snapshot, type NodeData, differences } from '../api'
import { equalJson, signature } from '../../shared/jsonComparison.js'
import { reviewSharedOptions, type SharedOptionEdit } from './sharedOptionReview'
import { compare, resolve, type Choices } from '../import/merge'

export type Draft = { operation_id?: string; strict?: boolean; optionEdits?: SharedOptionEdit[]; createdNode?: string; confirmedConflict?: boolean; graph: Graph; base: number; ops: ReturnType<typeof differences>; originals?: unknown[] }
type Question = { token: string; label: string; mine: unknown; team: unknown }
type Fields = Record<string, unknown>

const fieldNames: Record<string, string> = {
  badges: '醒目標籤', title: '名稱', description: '說明', content: '步驟內容', note: '備註', expect: '預期結果',
  where: '位置', ownerRole: '負責角色/負責人', fieldValues: '自訂欄位', group: '群組', gatewayRule: '分流與匯合',
}

function isFields(value: unknown): value is Fields {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeFields(
  old: Fields, local: Fields, remote: Fields, path: string[], label: string,
  choices: Choices, questions: Question[], customNames: Map<string, string>,
) {
  const merged = { ...remote }
  for (const field of new Set([...Object.keys(old), ...Object.keys(local)])) {
    if (equalJson(old[field], local[field]) || equalJson(local[field], remote[field])) continue
    const itemPath = [...path, field]
    if (path.length === 1 && ['fieldValues', 'badges'].includes(field) &&
        [old[field], local[field], remote[field]].every(value => value === undefined || isFields(value))) {
      const values = mergeFields((old[field] ?? {}) as Fields, (local[field] ?? {}) as Fields,
        (remote[field] ?? {}) as Fields, itemPath, label, choices, questions, customNames)
      if (Object.keys(values).length) merged[field] = values
      else delete merged[field]
      continue
    }
    if (!equalJson(remote[field], old[field])) {
      const token = signature([itemPath, local[field], remote[field]])
      const name = path.length === 1 ? fieldNames[field] : path[1] === 'fieldValues' ? customNames.get(field) : field
      questions.push({ token, label: label + ' · ' + (name || field), mine: local[field], team: remote[field] })
      if (choices[token] !== 'file') continue
    }
    if (Object.hasOwn(local, field)) merged[field] = local[field]
    else delete merged[field]
  }
  return merged
}

export function draftPlan(draft: Draft, latest: Snapshot, choices: Choices) {
  const original = records(draft.graph)
  // records() returns the graph's node map. Reconstructing the baseline must preserve the draft.
  original.nodes = { ...original.nodes }
  const team = records(latest.graph)
  const legacyConflicts = new Set<string>()
  draft.ops.forEach((op, i) => {
    const value = draft.originals ? draft.originals[i] : team[op.table][op.key]
    if (value == null) delete original[op.table][op.key]
    else original[op.table][op.key] = value
    if (!draft.originals && (latest.versions[op.table][op.key] ?? null) !== op.version)
      legacyConflicts.add(JSON.stringify([op.table, op.key]))
  })
  const base = { ...original.meta, nodes: original.nodes, edges: Object.values(original.edges) } as Graph
  const groups = compare(base, draft.graph, latest)
  const questions: Question[] = []
  const automatic: Choices = { ...choices }
  const customNames = new Map<string, string>()
  if (Array.isArray(latest.graph.fieldDefinitions)) {
    for (const def of latest.graph.fieldDefinitions)
      if (typeof def?.id === 'string' && typeof def.name === 'string') customNames.set(def.id, def.name)
  }
  for (const group of groups) {
    if (group.rows.some(r => legacyConflicts.has(r.id))) group.conflict = true
    if (!group.conflict) continue
    const row = group.rows[0]
    if (draft.originals && group.rows.length === 1 && row.table === 'meta' &&
        ['ownerRoleOptions', 'locationOptions'].includes(row.key) && Array.isArray(row.file)) {
      const prior = original.meta[row.key] ?? [], teamOptions = row.team ?? []
      const mine = row.file
      if (Array.isArray(prior) && Array.isArray(teamOptions) && prior.every(name => mine.includes(name))) {
        row.file = [...new Set([...teamOptions, ...mine.filter(name => !prior.includes(name))])]
        automatic[group.token] = 'file'
        continue
      }
    }
    if (draft.originals && group.rows.length === 1 && row.table === 'meta' && row.key === 'badgeStyles' &&
        isFields(row.file) && isFields(row.team)) {
      row.file = mergeFields((original.meta.badgeStyles ?? {}) as Fields, row.file, row.team,
        ['badgeStyles', 'styles'], '醒目標籤樣式', choices, questions, customNames)
      automatic[group.token] = 'file'
      continue
    }
    const old = original[row.table][row.key] as NodeData
    if (draft.originals && group.rows.length === 1 && row.table === 'nodes' && old && row.file && row.team) {
      const local = row.file as NodeData
      row.file = mergeFields(old, local, row.team as NodeData, [row.key], local.title, choices, questions, customNames)
      automatic[group.token] = 'file'
    } else {
      const format = (side: 'file' | 'team') =>
        group.rows.length === 1 ? row[side] : group.rows.map(r => ({ item: r.key, value: r[side] }))
      questions.push({ token: group.token, label: group.rows.map(r => r.key).join('、'), mine: format('file'), team: format('team') })
    }
  }
  const plan = resolve(latest, groups, automatic)
  const reviewed = draft.optionEdits?.length
    ? reviewSharedOptions(plan.graph, draft.graph, draft.optionEdits, choices, latest) : plan
  if ('questions' in reviewed) questions.push(...reviewed.questions)
  return { graph: reviewed.graph, ops: differences(latest.graph, reviewed.graph, latest.versions), questions }
}
