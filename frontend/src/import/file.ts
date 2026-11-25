import { api, type Snapshot, type Graph } from '../api'
import { readGraph } from '../../workbench/graph/readGraph.js'
import { newMissingTarget } from '../../workbench/knowledge/targets.js'
import { exportDocument } from './provenance'

export function validate(value: unknown, previous?: Graph): Graph {
  const graph = readGraph(value) as Graph
  const issue = newMissingTarget(graph, previous)
  if (issue) throw new Error(issue.message + '請保留對應的知識條目或調整引用。')
  return graph
}

export async function readFile(file: File, forMerge = false) {
  if (file.size > 5 * 1024 * 1024) throw new Error('JSON 請小於 5 MB')
  const graph = JSON.parse(await file.text())
  return forMerge ? readGraph(graph, { deferKnowledgePins: true }) as Graph : validate(graph)
}

export async function downloadJson(canvas: string) {
  const snapshot = await api<Snapshot>('canvases/' + canvas)
  const flow = await exportDocument(snapshot)
  const url = URL.createObjectURL(new Blob([JSON.stringify(flow, null, 2)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'dfx-project-flow.json'
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 10000)
}
