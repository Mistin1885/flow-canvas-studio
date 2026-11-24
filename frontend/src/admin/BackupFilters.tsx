import type { Workspace } from '../api'

export const emptyFilters = { q: '', workspace: '', canvas: '', kind: '' }
export type Filters = typeof emptyFilters
export type CanvasOption = Workspace & { workspace: string }

export function BackupFilters({ value, change, spaces, canvases, disabled }: {
  value: Filters; change: (value: Filters) => void; spaces: Workspace[]
  canvases: CanvasOption[]; disabled: boolean
}) {
  const names = new Map(spaces.map(w => [w.id, w.name]))
  return <fieldset className="backupFilters" disabled={disabled} aria-label="搜尋與篩選備份">
    <label>搜尋備份<input type="search" placeholder="工作區、畫布名稱或備份編號"
      value={value.q} onChange={e => change({ ...value, q: e.target.value })} /></label>
    <label>工作區<select value={value.workspace}
      onChange={e => change({ ...value, workspace: e.target.value, canvas: '' })}>
      <option value="">所有工作區</option>
      {value.workspace && !names.has(value.workspace) && <option value={value.workspace}>所選工作區（無備份）</option>}
      {spaces.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
    </select></label>
    <label>備份類型<select value={value.kind}
      onChange={e => change({ ...value, kind: e.target.value, canvas: e.target.value === 'workspace' ? '' : value.canvas })}>
      <option value="">全部類型</option><option value="workspace">工作區</option><option value="canvas">畫布</option>
    </select></label>
    <label>畫布<select value={value.canvas} disabled={value.kind === 'workspace'}
      onChange={e => change({ ...value, canvas: e.target.value })}>
      <option value="">所有畫布</option>
      {value.canvas && !canvases.some(c => c.id === value.canvas) && <option value={value.canvas}>所選畫布（無備份）</option>}
      {canvases.filter(c => !value.workspace || c.workspace === value.workspace).map(c =>
        <option key={c.id} value={c.id}>{value.workspace ? c.name : names.get(c.workspace) + ' / ' + c.name}</option>)}
    </select></label>
    {Object.values(value).some(Boolean) && <button onClick={() => change(emptyFilters)}>清除篩選</button>}
  </fieldset>
}
