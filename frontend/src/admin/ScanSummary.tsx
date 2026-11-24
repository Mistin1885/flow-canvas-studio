export type ScanStatus = {
  attempted: string | null
  succeeded: string | null
  failed: string | null
  state: 'pending' | 'running' | 'success' | 'failed'
  captured: number
  error: string | null
}
const time = (stamp: string | null) => stamp ? new Date(stamp).toLocaleString('zh-TW', { hour12: false }) : '尚無紀錄'

export function ScanSummary({ scan }: { scan: ScanStatus }) {
  const overdue = scan.attempted && Date.now() - Date.parse(scan.attempted) > 20 * 60 * 1000
  const summary = {
    pending: '等待首次檢查', running: '正在檢查', failed: '檢查失敗',
    success: scan.captured ? '備份完成' : '檢查成功，沒有異動',
  }[scan.state]
  return <div className="scanSummary" aria-label="備份排程狀態">
    <strong>{summary}</strong> · 本輪新增 {scan.captured} 份備份
    {overdue && <p role="alert">排程已超過 20 分鐘沒有開始新一輪檢查。</p>}
    <p>最近檢查 {time(scan.attempted)}　最近成功 {time(scan.succeeded)}</p>
    {scan.failed && <p>最近失敗 {time(scan.failed)} · {scan.error}</p>}
  </div>
}
