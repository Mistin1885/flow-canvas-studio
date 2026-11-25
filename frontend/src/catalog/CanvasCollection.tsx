import {
  Network,
  SquareDashed,
  Layers3,
  Plus,
  ChevronsUpDown,
  Grid2X2,
  List,
  GitFork,
  Pencil,
  Search,
  Copy, Trash2,
} from 'lucide-react'
import { useState } from 'react'
import { api, errorText, type Canvas, type Workspace } from '../api'
import type { Modal } from './CatalogDialog'
import { Pagination } from '../paging/Pagination'
import type { Page } from '../paging/useListing'

function Thumbnail({ item, index }: { item: Canvas; index: number }) {
  return (
    <div className={'thumb hue' + (index % 4)} aria-hidden="true">
      <span className="thumbIcon">
        {item.nodes ? (
          <Network size={40} strokeWidth={1.4} />
        ) : (
          <SquareDashed size={38} strokeWidth={1.4} />
        )}
      </span>
      <span className="thumbCount">{item.nodes} 節點</span>
    </div>
  )
}

export function CanvasCollection({
  workspace,
  result, nodeCount, changePage,
  form, refresh,
  open,
  query,
  setQuery,
  list,
  setList,
  sort,
  setSort,
}: {
  workspace: Workspace & { canvases: number }
  result?: Page<Canvas>
  nodeCount: number
  refresh: () => Promise<void>
  changePage: (page: number) => void
  form: (action: Modal['action'], item?: Workspace) => void
  open: (id: string) => void
  list: boolean
  setList: (list: boolean) => void
  sort: string
  setSort: (sort: string) => void
  query: string
  setQuery: (query: string) => void
}) {
  const [deleting, setDeleting] = useState('')
  const [error, setError] = useState('')
  async function remove(canvas: Canvas) {
    if (!window.confirm('刪除「' + canvas.name + '」？所有使用者都將無法開啟這張畫布。管理員可在 7 天內從備份管理還原。')) return
    setDeleting(canvas.id)
    setError('')
    try {
      await api('canvases/' + canvas.id, 'DELETE', { base: canvas.rev })
    } catch (e) {
      setError(errorText(e))
    } finally {
      await refresh()
      setDeleting('')
    }
  }
  return (
    <>
      <section className="hero">
        <div className="spaceIcon">
          <Layers3 size={29} />
        </div>
        <div className="heroTitle">
          <h1>{workspace.name}</h1>
          <p>
            {workspace.canvases} 張畫布 <span>·</span> {nodeCount} 個節點
          </p>
        </div>
        <button
          className="icon renameSpace"
          title="重新命名工作區"
          aria-label="重新命名工作區"
          onClick={() => form('renameSpace', workspace)}
        >
          <Pencil size={15} />
        </button>
        <div className="canvasActions">
          <button onClick={()=>{location.hash='knowledge/'+workspace.id}}>工作區知識庫</button>
          <button onClick={() => form('import')}>從 JSON 建立</button>
          <button className="primary" onClick={() => form('canvas')}>
            <Plus size={17} /> 建立畫布
          </button>
        </div>
      </section>
      <div className="collectionHeading">
        <h2>
          <Layers3 size={17} />
          全部畫布 <span className="pill">{workspace.canvases}</span>
        </h2>
      </div>
      <div className="toolbar">
        <label className="search">
          <Search size={16} />
          <input
            aria-label="搜尋畫布"
            placeholder="搜尋畫布…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="sort">
          <ChevronsUpDown size={14} />
          <select aria-label="畫布排序" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="updated">最近編輯</option>
            <option value="name">依名稱</option>
          </select>
        </label>
        <div className="switch">
          <button
            className={!list ? 'active' : ''}
            aria-label="格狀檢視"
            aria-pressed={!list}
            onClick={() => setList(false)}
          >
            <Grid2X2 size={15} />
          </button>
          <button
            className={list ? 'active' : ''}
            aria-label="清單檢視"
            aria-pressed={list}
            onClick={() => setList(true)}
          >
            <List size={16} />
          </button>
        </div>
      </div>
      {error && <p className="warning" role="alert">{error}</p>}
      {!result ? <p>正在載入畫布…</p> : result.items.length ? (
        <div className={list ? 'cards rows' : 'cards'}>
          {result.items.map((c, i) => (
            <article key={c.id} className="card">
              <button className="cardOpen" onClick={() => open(c.id)}>
                <Thumbnail item={c} index={i} />
                <div className="cardTitle">
                  <h3>{c.name}</h3>
                  <p>
                    <GitFork size={13} />
                    {c.edges} 條連線 <span>·</span> {new Date(c.updated).toLocaleDateString('zh-TW')}
                  </p>
                </div>
              </button>
              <footer>
                <span title={c.editor}>{c.editor}</span>
                <button
                  className="icon"
                  aria-label={'重新命名 ' + c.name}
                  title="重新命名"
                  onClick={() => form('renameCanvas', c)}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon"
                  aria-label={'複製 ' + c.name}
                  title="複製畫布"
                  onClick={() => form('copy', c)}
                >
                  <Copy size={15} />
                </button>
                <button className="icon" aria-label={'刪除 ' + c.name} title="刪除畫布"
                  disabled={!!deleting} onClick={() => void remove(c)}>
                  <Trash2 size={15} />
                </button>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <section className="empty">
          <span className="emptyIcon">{query ? <Search size={28} /> : <GitFork size={28} />}</span>
          <h3>{query ? '找不到符合的畫布' : '工作區尚無畫布'}</h3>
          <p>{query ? '試試其他名稱。' : '建立畫布後，就能新增節點或匯入現有流程。'}</p>
          <button onClick={() => (query ? setQuery('') : form('canvas'))}>
            {!query && <Plus size={15} />} {query ? '清除搜尋' : '建立第一張畫布'}
          </button>
        </section>
      )}
      {result && <Pagination result={result} change={changePage} label="畫布分頁" />}
    </>
  )
}
