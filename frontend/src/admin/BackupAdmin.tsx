import { useEffect, useRef, useState } from 'react'
import { api, errorText, type Session, type Workspace } from '../api'
import { DisplayControls } from '../display/DisplayControls'
import { useDisplayPreferences } from '../display/useDisplayPreferences'
import { ScanSummary, type ScanStatus } from './ScanSummary'
import { BackupFilters, emptyFilters, type CanvasOption, type Filters } from './BackupFilters'
import { Pagination } from '../paging/Pagination'
import { useListing, type Page } from '../paging/useListing'
import './backups.css'

type Point = {
  id: number
  kind: 'workspace' | 'canvas'
  item: string
  name: string
  deleted: boolean
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
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [page, setPage] = useState(1)
  const params = new URLSearchParams({ ...filters, page: String(page) })
  const listing = useListing<Page<Point> & { workspaces: Workspace[]; canvases: CanvasOption[]; scan: ScanStatus }>(
    'admin/backups/page?' + params, 60000, !!storageKey)
  const { data, refresh } = listing
  const ready = listing.current && !listing.error
  const points = ready ? data?.items ?? [] : []
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Point | null>(null)
  const [busy, setBusy] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    void api<Session>('session/login', 'POST')
      .then(s => setStorageKey(s.storage_key))
      .catch(e => setError(errorText(e)))
  }, [])
  useEffect(() => {
    if (ready && data && page !== data.page) setPage(data.page)
  }, [ready, data, page])
  useEffect(() => {
    if (selected) dialog.current?.showModal()
  }, [selected])
  async function restore() {
    if (!selected || busy) return
    setBusy(true)
    setMessage('')
    setError('')
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
          <button onClick={() => { setError(''); void refresh() }} disabled={busy || !storageKey}>
            重新整理
          </button>
        </div>
        <p>每 15 分鐘檢查更新，保留最近 7 天的備份。時間依此裝置的時區顯示。</p>
        {data && <ScanSummary scan={data.scan} />}
        <BackupFilters value={filters} change={value => { setFilters(value); setPage(1) }}
          spaces={data?.workspaces ?? []} canvases={data?.canvases ?? []} disabled={busy || !data} />
        {(error || listing.error) && <p role="alert">{error || listing.error}</p>}
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
                    <td>{date(p.captured)} <small>#{p.id}</small></td>
                    <td>{p.workspace_name}</td>
                    <td>
                      {p.kind === 'canvas' ? '畫布' : '工作區'} · {p.name} {p.deleted && <small>已刪除</small>}
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
          !error && !listing.error && <p>{!ready ? '正在載入備份…' : Object.values(filters).some(Boolean) ? '找不到符合條件的備份。' : '目前沒有保留中的備份。'}</p>
        )}
        {ready && data && <Pagination result={data} change={setPage} label="備份分頁" />}
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
