import { useEffect, useState } from 'react'
import { api, errorText } from '../api'
import type { Library, Picker } from './types'

export function useKnowledgeLibrary(space: string, canvas: string, picker?: Picker) {
  const [lib, setLib] = useState<Library | null>(null),
    [selected, select] = useState('')
  const [epoch, reload] = useState(0),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false)
  const path = 'knowledge/' + space
  useEffect(() => {
    const refresh = () => reload((n) => n + 1)
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  useEffect(() => {
    let active = true
    api<Library>(path + '?' + new URLSearchParams({ canvas, selected }))
      .then((data) => {
        if (!active) return
        for (const item of data.entries) {
          item.doc.sections ??= []
          item.doc.summary ??= ''
        }
        for (const [field, doc] of Object.entries(picker?.pending || {})) {
          const key = field.slice(10),
            existing = data.entries.find((e) => e.id === doc.source || e.local === key)
          if (existing) existing.local = key
          else
            data.entries.push({
              id: key,
              doc,
              local: key,
              version: 0,
              scope: 'canvas',
              owner: space,
              shares: [],
              uses: [],
            })
        }
        setLib(data)
        if (!data.entries.some((e) => e.id === selected)) {
          const label = picker?.label.trim().toLowerCase()
          const match = label && data.entries.find((e) => e.doc.title.toLowerCase().includes(label))
          select((match || data.entries[0])?.id || '')
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e))
      })
    return () => {
      active = false
    }
  }, [canvas, space, path, selected, epoch, picker])
  async function mutate(body: Record<string, unknown>, after?: (id: string) => void) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const res = await api<{ id: string }>(path, 'POST', { canvas, ...body })
      reload((n) => n + 1)
      if (after) after(res.id)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  return { lib, selected, select, reload, error, setError, busy, mutate }
}
