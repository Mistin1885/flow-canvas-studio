import { useEffect, useRef, useState, type RefObject } from 'react'
import { api, differences, errorText, type Canvas, type Graph, type Snapshot } from '../api'
import type { Workbench } from './WorkbenchWindow'
type Draft = { graph: Graph; base: number; ops: ReturnType<typeof differences> }

export function useCanvasSession(
  canvas: Canvas,
  identity: string,
  frame: RefObject<HTMLIFrameElement | null>,
  loaded: boolean,
  open: (id: string) => void,
) {
  const [status, setStatus] = useState('連線中')
  const [issue, setIssue] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [remoteRev, setRemoteRev] = useState(0)
  const [busy, setBusy] = useState(false)
  const current = useRef<Snapshot | null>(null)
  const recovered = useRef<Draft | null>(null)
  const actions = useRef({ retry: () => {}, discard: () => {}, refreshTo: (_rev: number) => {} })
  const cacheKey = 'flow-draft:' + identity + ':' + canvas.id
  useEffect(() => {
    if (!loaded) return
    const win = frame.current?.contentWindow as Workbench
    const editor = win.T1Playbook
    if (!editor) {
      setIssue('工作台載入失敗，請重新整理')
      return
    }
    let active = true,
      fetching = false,
      writing = false,
      connected = false,
      wanted = 0
    let socket: WebSocket | undefined, timer: number | undefined, retryTimer: number | undefined

    current.current = null
    function keep(value: Draft | null) {
      recovered.current = value
      setDraft(value)
      try {
        if (value) sessionStorage.setItem(cacheKey, JSON.stringify(value))
        else sessionStorage.removeItem(cacheKey)
      } catch {
        if (value) setIssue('瀏覽器暫存空間不足，請在離開前下載草稿')
      }
    }
    function statusText() {
      if (!active) return
      setStatus(
        writing ? '儲存中' : recovered.current ? '草稿待處理' : connected ? '即時同步' : '重新連線中',
      )
    }
    async function refresh() {
      if (!active || fetching || writing || recovered.current || (current.current && editor.editing()))
        return
      if (current.current && current.current.canvas.rev >= wanted) return
      fetching = true
      try {
        const snap = await api<Snapshot>('canvases/' + canvas.id)
        if (!active || writing || recovered.current || (current.current && editor.editing())) return
        if (current.current && snap.canvas.rev <= current.current.canvas.rev) return
        editor.receive(snap.graph)
        current.current = snap
        win.document.body.inert = false
        setIssue('')
        statusText()
      } catch (err) {
        if (active) {
          setIssue(errorText(err))
          clearTimeout(retryTimer)
          retryTimer = window.setTimeout(refresh, 3500)
        }
      } finally {
        fetching = false
        if (
          active &&
          current.current &&
          current.current.canvas.rev < wanted &&
          !editor.editing() &&
          !recovered.current &&
          !writing
        )
          retryTimer = window.setTimeout(refresh, 500)
      }
    }
    async function save(item: Draft) {
      if (writing) return
      writing = true
      setBusy(true)
      win.document.body.inert = true
      statusText()
      try {
        const result = await api<{ rev: number }>('canvases/' + canvas.id + '/changes', 'POST', {
          base: item.base,
          ops: item.ops,
        })
        if (!active) return
        const base = current.current
        if (base) {
          for (const op of item.ops) {
            if (op.remove) delete base.versions[op.table][op.key]
            else base.versions[op.table][op.key] = result.rev
          }
          base.graph = item.graph
          // When peers intervened, keep the old revision until the full snapshot arrives.
          if (result.rev === item.base + 1) base.canvas.rev = result.rev
          editor.saved()
          win.document.body.inert = false
        }
        wanted = Math.max(wanted, result.rev)
        keep(null)
        setIssue('')
      } catch (err) {
        if (active) setIssue(errorText(err))
      } finally {
        writing = false
        if (active) {
          setBusy(false)
          statusText()
          void refresh()
        }
      }
    }
    function change(event: Event) {
      if (!current.current || writing || recovered.current) return
      const { previous, next } = (event as CustomEvent<{ previous: Graph; next: Graph }>).detail
      const ops = differences(previous, next, current.current.versions)
      if (!ops.length) {
        editor.saved()
        return
      }
      const item = { graph: next, ops, base: current.current.canvas.rev }
      keep(item)
      void save(item)
    }
    function connect() {
      if (!active) return
      const url = new URL('/api/canvases/' + canvas.id + '/live', location.href)
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(url)
      socket.onmessage = (event) => {
        if (!active) return
        const msg = JSON.parse(event.data)
        if (msg.rev) {
          setRemoteRev((rev) => Math.max(rev, msg.rev))
          wanted = Math.max(wanted, msg.rev)
          void refresh()
        }
        connected = true
        statusText()
      }
      socket.onclose = () => {
        if (!active) return
        connected = false
        statusText()
        timer = window.setTimeout(connect, 1800)
      }
    }
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        keep(JSON.parse(raw))
        setIssue('已找回此分頁上次尚未確認儲存的草稿')
      }
    } catch {
      setIssue('無法讀取本機草稿')
    }
    actions.current = {
      refreshTo: (rev) => {
        wanted = Math.max(wanted, rev)
        void refresh()
      },
      retry: () => {
        if (recovered.current) {
          void save(recovered.current)
        }
      },
      discard: () => {
        keep(null)
        current.current = null
        void refresh()
      },
    }
    function unload(e: BeforeUnloadEvent) {
      if (recovered.current || editor.editing()) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    function resume() {
      if (active) void refresh()
    }
    win.document.body.inert = true
    win.addEventListener('studio-change', change)
    win.document.addEventListener('close', resume, true)
    win.document.addEventListener('pointerup', resume)
    window.addEventListener('beforeunload', unload)
    connect()
    void refresh()
    return () => {
      active = false
      clearTimeout(timer)
      clearTimeout(retryTimer)
      socket?.close()
      win.removeEventListener('studio-change', change)
      win.document.removeEventListener('close', resume, true)
      win.document.removeEventListener('pointerup', resume)
      window.removeEventListener('beforeunload', unload)
    }
  }, [loaded, canvas.id, cacheKey])

  async function fork() {
    if (!draft) return
    setBusy(true)
    try {
      const { id } = await api<{ id: string }>('workspaces/' + canvas.workspace + '/canvases', 'POST', {
        name: canvas.name.slice(0, 110) + ' · 草稿',
        graph: draft.graph,
      })
      sessionStorage.removeItem(cacheKey)
      recovered.current = null
      open(id)
    } catch (err) {
      setIssue(errorText(err))
    } finally {
      setBusy(false)
    }
  }
  function download() {
    if (!draft) return
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(draft.graph, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = canvas.name + '-draft.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return { remoteRev, status, issue, draft, busy, current, actions, fork, download }
}
