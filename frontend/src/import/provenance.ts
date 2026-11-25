import { records, type Graph, type Snapshot } from '../api'
import { signature } from '../../shared/jsonComparison.js'

const marker = 'flowCanvasStudioExport'
type Manifest = {
  format: 'sha256-v1'
  canvas: string
  revision: number
  hashes: Record<string, string>
}
export type Origin = { revision: number; modified: Set<string>; original: Set<string> }

async function digests(graph: Graph): Promise<Record<string, string>> {
  const encoder = new TextEncoder()
  const rows = records(graph)
  const entries = Object.entries(rows).flatMap(([table, items]) =>
    Object.entries(items).map(async ([key, value]) => {
      const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(signature(value)))
      const hash = Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
      return [JSON.stringify([table, key]), hash] as const
    }),
  )
  return Object.fromEntries(await Promise.all(entries))
}

export async function exportDocument(snapshot: Snapshot): Promise<Graph> {
  const { graph, canvas } = snapshot
  if (!crypto.subtle || Object.hasOwn(graph, marker)) return graph
  const manifest: Manifest = {
    format: 'sha256-v1',
    canvas: canvas.id,
    revision: canvas.rev,
    hashes: await digests(graph),
  }
  return { ...graph, [marker]: manifest }
}

export function unpackDocument(graph: Graph): { graph: Graph; manifest?: Manifest } {
  const candidate = graph[marker] as Partial<Manifest> | null
  if (candidate?.format !== 'sha256-v1') return { graph }
  if (
    typeof candidate.canvas !== 'string' ||
    !Number.isSafeInteger(candidate.revision) ||
    !candidate.hashes ||
    typeof candidate.hashes !== 'object' ||
    Array.isArray(candidate.hashes) ||
    !Object.values(candidate.hashes).every(
      (hash) => typeof hash === 'string' && /^[0-9a-f]{64}$/.test(hash),
    )
  )
    throw new Error('匯出版本資訊不完整，請使用原始匯出檔')
  const { [marker]: _manifest, ...flow } = graph
  return { graph: flow, manifest: candidate as Manifest }
}

export async function identifyChanges(
  graph: Graph,
  manifest: Manifest | undefined,
  snapshot: Snapshot,
): Promise<Origin | undefined> {
  if (
    !manifest ||
    manifest.canvas !== snapshot.canvas.id ||
    manifest.revision > snapshot.canvas.rev ||
    !crypto.subtle
  )
    return undefined
  const hashes = await digests(graph)
  const original = new Set(Object.keys(manifest.hashes))
  const modified = new Set<string>()
  for (const key of new Set([...original, ...Object.keys(hashes)])) {
    if (manifest.hashes[key] !== hashes[key]) modified.add(key)
  }
  return { revision: manifest.revision, original, modified }
}
