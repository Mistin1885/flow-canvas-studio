import { api, type Snapshot, type Graph } from '../api'
import { readGraph } from '../../workbench/graph/readGraph.js'
import { exportDocument } from './provenance'

export function validate(value: unknown): Graph {
  return readGraph(value) as Graph
}

export async function readFile(file: File) {
  if (file.size > 5 * 1024 * 1024) throw new Error('JSON 請小於 5 MB')
  return validate(JSON.parse(await file.text()))
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
