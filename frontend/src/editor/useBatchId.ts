import { useRef } from 'react'

// A second click after a lost response must reuse the ID. A changed review is a new edit.
export function useBatchId() {
  const last = useRef({ payload: '', id: '' })
  return (batch: object) => {
    const payload = JSON.stringify(batch)
    if (payload !== last.current.payload) last.current = { payload, id: crypto.randomUUID() }
    return { ...batch, operation_id: last.current.id }
  }
}
