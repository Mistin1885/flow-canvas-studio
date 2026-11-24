import { useEffect, useState } from 'react'
import { api, errorText, type Graph } from '../api'

type Entry = { revision: number; created: string; editor: string }

export function ImportHistory({
  path,
  review,
  copy,
  setBusy,
}: {
  setBusy: (busy: boolean) => void
  path: string
  review: (graph: Graph, label: string) => void
  copy: (graph: Graph, revision: number) => Promise<void>
}) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let active = true
    api<Entry[]>(path)
      .then((rows) => {
        if (active) setEntries(rows)
      })
      .catch((e) => {
        if (active) setError(errorText(e))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [path])
  async function restore(rev: number, asCopy: boolean) {
    setBusy(true)
    setError('')
    try {
      const graph = await api<Graph>(path + '/' + rev)
      if (asCopy) await copy(graph, rev)
      else review(graph, '匯入前版本 v' + rev)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="importHistory">
      <summary>匯入前的版本</summary>
      {error && <p role="alert">{error}</p>}
      {!entries.length && <p>{loading ? '載入中…' : '尚無匯入紀錄'}</p>}
      {entries.map((row) => (
        <div key={row.revision}>
          <span>
            v{row.revision} · {new Date(row.created).toLocaleString()} · {row.editor}
          </span>
          <button disabled={loading} onClick={() => restore(row.revision, false)}>
            比對此版本
          </button>
          <button disabled={loading} onClick={() => restore(row.revision, true)}>
            另存新畫布
          </button>
        </div>
      ))}
    </details>
  )
}
