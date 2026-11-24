import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorText } from '../api'

export type Page<T> = { items: T[]; total: number; page: number; pages: number; size: number }

export function useListing<T>(path: string, interval: number, enabled = true) {
  const [result, setResult] = useState<{ path: string; data: T } | null>(null)
  const [failure, setFailure] = useState({ path: '', message: '' })
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    const serial = ++sequence.current
    try {
      const data = await api<T>(path)
      if (sequence.current === serial) {
        setResult({ path, data })
        setFailure({ path: '', message: '' })
      }
    } catch (e) {
      if (sequence.current === serial) setFailure({ path, message: errorText(e) })
    }
  }, [path])
  useEffect(() => {
    if (!enabled) return
    // Coalesce requests while typing, without delaying the visible input.
    const initial = window.setTimeout(refresh, 150)
    const visible = () => { if (!document.hidden) void refresh() }
    const timer = interval ? window.setInterval(visible, interval) : undefined
    window.addEventListener('focus', visible)
    return () => {
      sequence.current++
      window.clearTimeout(initial)
      window.clearInterval(timer)
      window.removeEventListener('focus', visible)
    }
  }, [refresh, interval, enabled])
  return { data: result?.data, current: result?.path === path, refresh,
    error: failure.path === path ? failure.message : '' }
}
