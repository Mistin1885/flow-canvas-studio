import type { Graph, Snapshot } from '../api'
import { signature } from '../../shared/jsonComparison.js'
import { applyOptionEdit, declaredOptions, groupConnections, nodeOptionNames, optionCounts } from '../../workbench/options/catalog.js'
import { keepDefinition } from '../../workbench/options/keepDefinition.js'
import type { Choices } from '../import/merge'

export type SharedOptionEdit = { kind: string; from: string | null; to: string | null }

// A peer may start using an option on a node outside the original batch.
// Let the reviewer decide whether that reference joins the same bulk edit.
export function reviewSharedOptions(merged: Graph, desired: Graph, edits: SharedOptionEdit[], choices: Choices, latest: Snapshot) {
  let graph = merged
  const questions = []
  for (const edit of edits) {
    const { kind, from, to } = edit
    if (!from || declaredOptions(desired, kind).includes(from) || optionCounts(desired, kind).has(from)) continue
    if (declaredOptions(graph, kind).includes(from)) continue
    const ids = Object.values(graph.nodes).filter(n => nodeOptionNames(n, kind).includes(from)).map(n => n.id)
    const links: { from: string; to: string; label: string }[] = kind === 'group' ? groupConnections(graph, from) : []
    if (!ids.length && !links.length) continue
    if (kind.startsWith('field:') && !(graph.fieldDefinitions as { id: string }[] | undefined)?.some(f => 'field:' + f.id === kind)) continue
    const token = signature(['shared-option', edit, latest.canvas.rev, ids, links.map(e => [e.from, e.to, e.label])])
    const references = ids.length + ' 個節點' + (links.length ? '、' + links.length + ' 條群組連線' : '')
    questions.push({ token, label: '合併後仍引用「' + from + '」的項目', team: '保留 ' + references + ' 的現有引用',
      mine: to === null ? '從 ' + references + ' 移除此項目' : '將 ' + references + ' 一併更新為「' + to + '」' })
    if (choices[token]) {
      if (graph === merged) graph = structuredClone(merged)
      if (choices[token] === 'file') applyOptionEdit(graph, edit)
      else keepDefinition(graph, latest.graph, kind, from)
    }
  }
  return { graph, questions }
}
