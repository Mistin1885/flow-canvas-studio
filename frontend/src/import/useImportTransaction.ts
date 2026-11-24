import { useEffect, useState } from 'react'
import { api, ApiError, errorText, type Graph, type Snapshot } from '../api'
import { compare, resolve, type Choices } from './merge'
import type { Origin } from './provenance'
import { validate } from './file'

export function useImportTransaction(
  base: Snapshot,
  remoteRev: number,
  applied: (rev: number, count: number) => void,
) {
  const [latest, setLatest] = useState(base)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const path = 'canvases/' + base.canvas.id
  useEffect(() => {
    let active = true
    if (remoteRev > latest.canvas.rev)
      api<Snapshot>(path)
        .then((snap) => {
          if (active) setLatest((old) => (old.canvas.rev < snap.canvas.rev ? snap : old))
        })
        .catch((e) => {
          if (active) setError(errorText(e))
        })
    return () => {
      active = false
    }
  }, [path, remoteRev, latest.canvas.rev])
  async function apply(file: Graph | null, origin: Origin | undefined, choices: Choices) {
    if (!file || busy) return
    setBusy(true)
    setError('')
    try {
      let snapshot = latest
      for (let attempt = 0; attempt < 4; attempt++) {
        const next = resolve(snapshot, compare(base.graph, file, snapshot, origin), choices)
        if (next.unresolved) return
        validate(next.graph)
        if (!next.ops.length) {
          applied(snapshot.canvas.rev, 0)
          return
        }
        try {
          const result = await api<{ rev: number }>(path + '/imports', 'POST', {
            base: snapshot.canvas.rev,
            ops: next.ops,
          })
          applied(result.rev, next.ops.length)
          return
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 412) throw e
          snapshot = await api<Snapshot>(path)
          const refreshed = snapshot
          setLatest((old) => (old.canvas.rev < refreshed.canvas.rev ? refreshed : old))
        }
      }
      setError('畫布仍持續更新，已保留你的選擇。請再次套用。')
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return { path, latest, busy, setBusy, error, setError, apply }
}
