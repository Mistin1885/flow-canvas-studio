export type NodeData = {
  id: string
  title: string
  group: string
  drawingBox?: number[]
  [field: string]: unknown
}
export type Link = { from: string; to: string; kind: string; label: string; [field: string]: unknown }
export type Graph = { nodes: Record<string, NodeData>; edges: Link[]; [field: string]: unknown }
export type Workspace = { id: string; name: string }
export type Canvas = Workspace & {
  workspace: string
  rev: number
  updated: string
  editor: string
  nodes: number
  edges: number
}
export type Table = 'nodes' | 'edges' | 'meta'
export type Snapshot = { canvas: Canvas; graph: Graph; versions: Record<Table, Record<string, number>> }

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch('/api/' + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('登入可能已逾期，請重新開啟網站')
  const value = await response.json()
  if (!response.ok)
    throw new ApiError(response.status, typeof value.detail === 'string' ? value.detail : '資料格式無效')
  return value
}

export function edgeKey(e: Link) {
  return JSON.stringify([e.from, e.to, e.kind, e.label])
}

export function records(graph: Graph): Record<Table, Record<string, unknown>> {
  const { nodes, edges, ...meta } = graph
  return { nodes, meta, edges: Object.fromEntries(edges.map((e) => [edgeKey(e), e])) }
}

export function differences(previous: Graph, next: Graph, versions: Snapshot['versions']) {
  const before = records(previous),
    after = records(next)
  const ops = []
  for (const table of ['nodes', 'edges', 'meta'] as const) {
    for (const key of new Set([...Object.keys(before[table]), ...Object.keys(after[table])])) {
      if (JSON.stringify(before[table][key]) === JSON.stringify(after[table][key])) continue
      ops.push({
        table,
        key,
        version: versions[table][key] ?? null,
        remove: !Object.hasOwn(after[table], key),
        value: after[table][key],
      })
    }
  }
  return ops
}

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export type Session = { label: string; storage_key: string; admin: boolean }
