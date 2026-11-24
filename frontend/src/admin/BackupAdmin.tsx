import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorText, type Session } from '../api'
import { DisplayControls } from '../display/DisplayControls'
import { useDisplayPreferences } from '../display/useDisplayPreferences'
import { ScanSummary, type ScanStatus } from './ScanSummary'
import './backups.css'

type Point = {
  id: number
  kind: 'workspace' | 'canvas'
  item: string
  name: string
  workspace_name: string
  revision: number
  captured: string
  live_updated: string
  live_revision: number | null
}
const date = (stamp: string) => new Date(stamp).toLocaleString('zh-TW', { hour12: false })

export default function BackupAdmin() {
  const [storageKey, setStorageKey] = useState('')
  const display = useDisplayPreferences(storageKey)
  const [scan, setScan] = useState<ScanStatus | null>(null)
  const [points, setPoints] = useState<Point[]>([])
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Point | null>(null)
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    const request = ++sequence.current
    try {
      const [rows, status] = await Promise.all([api<Point[]>('admin/backups'), api<ScanStatus>('admin/backup-status')])
      if (sequence.current === request) {
        setScan(status)
        setPoints(rows)
        setReady(true)
        setError('')
      }
    } catch (e) {
      if (sequence.current === request) {
        setError(errorText(e))
        setReady(false)
      }
    }
  }, [])
  useEffect(() => {
    void api<Session>('session/login', 'POST')
      .then((s) => { setStorageKey(s.storage_key); return refresh() })
      .catch((e) => setError(errorText(e)))
    const timer = window.setInterval(refresh, 60000)
    return () => {
      clearInterval(timer)
      sequence.current++
    }
  }, [refresh])
  useEffect(() => {
    if (selected) dialog.current?.showModal()
  }, [selected])
  async function restore() {
    if (!selected || busy) return
    setBusy(true)
    setMessage('')
    try {
      await api('admin/backups/' + selected.id + '/restore', 'POST', {
        updated: selected.live_updated,
        revision: selected.live_revision,
      })
      setMessage('已還原「' + selected.name + '」至 ' + date(selected.captured))
      await refresh()
    } catch (e) {
      await refresh()
      setError(errorText(e))
    } finally {
      setSelected(null)
      setBusy(false)
    }
  }
  return (
    <main className="backupAdmin">
      <header>
        <a href="/">← 工作區</a>
        <DisplayControls {...display} />
      </header>
      <section>
        <div className="backupHeading">
          <h1>備份管理</h1>
          <button onClick={refresh} disabled={busy}>
            重新整理
          </button>
        </div>
        <p>每 15 分鐘檢查更新，保留最近 7 天的備份。時間依此裝置的時區顯示。</p>
        {ready && scan && <ScanSummary scan={scan} />}
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {ready && points.length > 0 ? (
          <div className="backupTable">
            <table>
              <thead>
                <tr>
                  {['備份時間', '工作區', '備份項目', '版本', '操作'].map((label) => (
                    <th key={label}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {points.map((p) => (
                  <tr key={p.id}>
                    <td>{date(p.captured)}</td>
                    <td>{p.workspace_name}</td>
                    <td>
                      {p.kind === 'canvas' ? '畫布' : '工作區'} · {p.name}
                    </td>
                    <td>{p.kind === 'canvas' ? 'v' + p.revision : '—'}</td>
                    <td>
                      <button onClick={() => setSelected(p)} disabled={busy}>
                        還原
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !error && <p>{ready ? '目前沒有保留中的備份。' : '正在載入備份…'}</p>
        )}
      </section>
      {selected && (
        <dialog
          className="dialog"
          ref={dialog}
          aria-labelledby="restore-title"
          onCancel={(e) => {
            if (busy) e.preventDefault()
            else setSelected(null)
          }}
        >
          <h2 id="restore-title">還原「{selected.name}」？</h2>
          <p>
            {date(selected.captured)} · 備份 #{selected.id}
          </p>
          <p>
            {selected.kind === 'canvas'
              ? '此畫布的內容與名稱將回到所選版本。'
              : '此工作區的名稱將回到所選版本，區內的畫布各自保有目前版本。'}
            此項目較新的備份與尚未備份的修改會轉為冷備份，再保留 7 天。
          </p>
          <footer>
            <button autoFocus disabled={busy} onClick={() => setSelected(null)}>
              取消
            </button>
            <button className="primary" disabled={busy} onClick={restore}>
              {busy ? '還原中…' : '確認還原'}
            </button>
          </footer>
        </dialog>
      )}
    </main>
  )
}
