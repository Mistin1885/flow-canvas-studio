import { useEffect, useRef, useState, type RefObject } from 'react'
import { api, ApiError, differences, records, errorText, type Canvas, type Graph, type Snapshot } from '../api'
import type { Workbench } from './WorkbenchWindow'
import { nodePresence } from './nodePresence'
import type { SharedOptionEdit } from './sharedOptionReview'
import type { Draft } from './draftMerge'

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
  const [canvasName, setCanvasName] = useState(canvas.name)
  const [remoteRev, setRemoteRev] = useState(0)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const current = useRef<Snapshot | null>(null)
  const recovered = useRef<Draft | null>(null)
  const actions = useRef({ submitReview: (_item: Draft) => {}, retry: () => {}, discard: () => {}, refreshTo: (_rev: number) => {} })
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
      wanted = 0,
      missingAt = -1
    let socket: WebSocket | undefined, timer: number | undefined, retryTimer: number | undefined

    const presence = nodePresence(win, node => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ editing: node }))
    })
    current.current = null
    setReady(false)
    editor.configureDrafts({ user: identity, canvas: canvas.id, snapshot: () => current.current })
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
        missingAt >= 0 ? '畫布已刪除' : writing ? '儲存中' : recovered.current ? '草稿待處理' : connected ? '即時同步' : '重新連線中',
      )
    }
    async function refresh() {
      if (!active || fetching || writing || recovered.current || (current.current && editor.editing(true)))
        return
      if (missingAt >= wanted || (current.current && current.current.canvas.rev >= wanted)) return
      fetching = true
      try {
        const snap = await api<Snapshot>('canvases/' + canvas.id)
        if (!active || writing || recovered.current || (current.current && editor.editing(true))) return
        if (current.current && snap.canvas.rev <= current.current.canvas.rev) return
        missingAt = -1
        editor.receive(snap.graph)
        current.current = snap
        editor.refreshTeamForm()
        setReady(true)
        setCanvasName(snap.canvas.name)
        win.document.body.inert = false
        setIssue('')
        statusText()
      } catch (err) {
        if (active) {
          if (err instanceof ApiError && err.status === 404) {
            missingAt = wanted
            setReady(false)
            win.document.body.inert = true
            setIssue('這張畫布已刪除，管理員可在備份管理中還原。')
            statusText()
            return
          }
          setIssue(errorText(err))
          clearTimeout(retryTimer)
          retryTimer = window.setTimeout(refresh, 3500)
        }
      } finally {
        fetching = false
        if (
          active &&
          current.current &&
          missingAt < wanted && current.current.canvas.rev < wanted &&
          !editor.editing(true) &&
          !recovered.current &&
          !writing
        )
          retryTimer = window.setTimeout(refresh, 500)
      }
    }
    async function save(item: Draft, fromCurrentView = false) {
      if (writing) return
      writing = true
      setBusy(true)
      win.document.body.inert = true
      statusText()
      try {
        const result = await api<{ rev: number }>('canvases/' + canvas.id + '/changes', 'POST', {
          operation_id: item.operation_id,
          strict: item.strict,
          base: item.base,
          ops: item.ops,
        })
        if (!active) return
        const base = current.current
        if (!fromCurrentView) {
          // Detached form submissions and reviews must reload the confirmed team graph.
          current.current = null
          setReady(false)
        } else if (base) {
          const versions = { nodes: { ...base.versions.nodes }, edges: { ...base.versions.edges }, meta: { ...base.versions.meta } }
          for (const op of item.ops) {
            if (op.remove) delete versions[op.table][op.key]
            else versions[op.table][op.key] = result.rev
          }
          // When peers intervened, keep the old revision until the full snapshot arrives.
          const rev = result.rev === item.base + 1 ? result.rev : base.canvas.rev
          current.current = { graph: item.graph, versions, canvas: { ...base.canvas, rev } }
          editor.saved()
          win.document.body.inert = false
        }
        wanted = Math.max(wanted, result.rev)
        keep(null)
        setIssue('')
      } catch (err) {
        if (active) {
          if (err instanceof ApiError && err.status === 409)
            keep({ ...item, confirmedConflict: true })
          setIssue(errorText(err))
        }
      } finally {
        writing = false
        if (active) {
          setBusy(false)
          statusText()
          void refresh()
        }
      }
    }
    async function clearCanvas() {
      const snap = current.current
      if (!snap || writing || recovered.current || editor.editing() || missingAt >= 0) return
      if (!window.confirm('清空「' + snap.canvas.name + '」的所有節點、連線與畫布設定？畫布名稱會保留，管理員可在 7 天內還原。')) return
      writing = true
      setBusy(true)
      win.document.body.inert = true
      try {
        const result = await api<{ rev: number }>('canvases/' + canvas.id + '/clear', 'POST', { base: snap.canvas.rev })
        wanted = Math.max(wanted, result.rev)
      } catch (err) {
        if (active) setIssue(errorText(err))
      } finally {
        writing = false
        if (active) {
          setBusy(false)
          win.document.body.inert = false
          void refresh()
        }
      }
    }
    function change(event: Event) {
      if (!current.current || writing || recovered.current) return
      const { previous, next, createdNode, optionEdits, formBase } = (event as CustomEvent<{ previous: Graph; next: Graph; formBase?: Snapshot; optionEdits?: SharedOptionEdit[]; createdNode?: string }>).detail
      const base = formBase ?? current.current
      const ops = differences(previous, next, base.versions)
      if (!ops.length) {
        editor.saved()
        return
      }
      const originals = records(previous)
      const item = { createdNode, ...(optionEdits?.length ? { strict: true, optionEdits } : {}), operation_id: crypto.randomUUID(), graph: next, ops, originals:ops.map(op=>originals[op.table][op.key] ?? null), base: base.canvas.rev }
      keep(item)
      void save(item, !formBase)
    }
    function connect() {
      if (!active) return
      const url = new URL('/api/canvases/' + canvas.id + '/live', location.href)
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
      socket = new WebSocket(url)
      socket.onopen = () => presence.connected()
      socket.onmessage = (event) => {
        if (!active) return
        const msg = JSON.parse(event.data)
        if (Array.isArray(msg.editors)) presence.receive(msg.editing, msg.editors)
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
        presence.clear()
        statusText()
        timer = window.setTimeout(connect, 1800)
      }
    }
    try {
      const raw = sessionStorage.getItem(cacheKey)
      if (raw) {
        const item = JSON.parse(raw)
        item.operation_id ??= crypto.randomUUID()
        keep(item)
        setIssue('已找回此分頁上次尚未確認儲存的草稿')
      }
    } catch {
      setIssue('無法讀取本機草稿')
    }
    actions.current = {
      submitReview: item => {
        if (writing) return
        keep(item)
        void save(item)
      },
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
        setReady(false)
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
    win.addEventListener('studio-clear', clearCanvas)
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
      presence.close()
      socket?.close()
      win.removeEventListener('studio-clear', clearCanvas)
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
        name: canvasName.slice(0, 110) + ' · 草稿',
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
    link.download = canvasName + '-draft.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return { canvasName, remoteRev, status, issue, draft, busy, ready, current, actions, fork, download }
}
