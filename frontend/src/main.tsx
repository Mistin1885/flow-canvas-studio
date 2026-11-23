import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Boxes,
  ChevronsUpDown,
  ChevronRight,
  CirclePlus,
  Copy,
  Folder,
  FolderOpen,
  GitFork,
  Grid2X2,
  Layers3,
  LayoutDashboard,
  List,
  Network,
  Pencil,
  Plus,
  Search,
  SquareDashed,
  Waypoints,
  X,
} from 'lucide-react'
import { api, errorText, type Canvas, type Catalog, type Workspace } from './api'
import Editor from './Editor'
import { DisplayControls, useDisplayPreferences } from './DisplayPreferences'
import './style.css'

type Modal = { action: 'space' | 'canvas' | 'copy' | 'renameSpace' | 'renameCanvas'; item?: Workspace }
function route() {
  return location.hash.slice(1).split('/')
}
function go(type: string, id: string) {
  location.hash = type + '/' + id
}
function Brand() {
  return (
    <span className="brand">
      <span className="brandMark">
        <Waypoints size={23} strokeWidth={2.2} />
      </span>
      Flow Canvas <strong>Studio</strong>
    </span>
  )
}
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
function App() {
  const [catalog, setCatalog] = useState<Catalog>({ workspaces: [], canvases: [] })
  const [ready, setReady] = useState(false)
  const [user, setUser] = useState('')
  const display = useDisplayPreferences(user)
  const [error, setError] = useState('')
  const [[type, id], setRoute] = useState(route)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('updated')
  const [list, setList] = useState(false)
  const [modal, setModal] = useState<Modal | null>(null)
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  const sequence = useRef(0)
  const refresh = useCallback(async () => {
    const lookup = ++sequence.current
    const data = await api<Catalog>('catalog')
    if (lookup === sequence.current) {
      setCatalog(data)
      setReady(true)
      setError('')
    }
  }, [])
  useEffect(() => {
    const report = (e: unknown) => setError(errorText(e))
    void api<{ label: string }>('session')
      .then((s) => setUser(s.label))
      .catch(report)
    void refresh().catch(report)
    const update = () => {
      setRoute(route())
      setQuery('')
      void refresh().catch(report)
    }
    const focus = () => {
      void refresh().catch(report)
    }
    const timer = window.setInterval(() => {
      if (!document.hidden && route()[0] !== 'canvas') focus()
    }, 12000)
    window.addEventListener('hashchange', update)
    window.addEventListener('focus', focus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('hashchange', update)
      window.removeEventListener('focus', focus)
    }
  }, [refresh])
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal()
  }, [modal])
  const opened = type === 'canvas' ? catalog.canvases.find((c) => c.id === id) : undefined
  const workspace = opened
    ? catalog.workspaces.find((w) => w.id === opened.workspace)
    : type === 'workspace'
      ? catalog.workspaces.find((w) => w.id === id)
      : catalog.workspaces[0]
  const canvases = catalog.canvases.filter((c) => c.workspace === workspace?.id)
  const shown = canvases
    .filter((c) => c.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) =>
      sort === 'name' ? a.name.localeCompare(b.name, 'zh-TW') : b.updated.localeCompare(a.updated),
    )
  function form(action: Modal['action'], item?: Workspace) {
    setModal({ action, item })
    setFormError('')
    setName(
      action === 'copy'
        ? (item?.name || '').slice(0, 115) + ' 副本'
        : action.startsWith('rename')
          ? item?.name || ''
          : '',
    )
    setTarget(workspace?.id || '')
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!modal || saving) return
    setSaving(true)
    setFormError('')
    try {
      const clean = name.trim()
      if (!clean) throw new Error('請輸入名稱')
      let navigate: [string, string] | null = null
      if (modal.action === 'space') {
        const result = await api<Workspace>('workspaces', 'POST', { name: clean })
        navigate = ['workspace', result.id]
      } else if (modal.action.startsWith('rename')) {
        const kind = modal.action === 'renameSpace' ? 'workspaces' : 'canvases'
        await api(kind + '/' + modal.item!.id, 'PATCH', { name: clean, previous: modal.item!.name })
      } else {
        const result = await api<Canvas>('workspaces/' + target + '/canvases', 'POST', {
          name: clean,
          source: modal.action === 'copy' ? modal.item?.id : undefined,
        })
        navigate = ['canvas', result.id]
      }
      await refresh()
      setModal(null)
      if (navigate) go(...navigate)
    } catch (e) {
      setFormError(errorText(e))
    } finally {
      setSaving(false)
    }
  }
  if (opened && workspace && user)
    return (
      <Editor
        key={opened.id}
        canvas={opened}
        workspace={workspace.name}
        identity={user}
        display={display}
        open={(key) => go('canvas', key)}
        back={() => go('workspace', workspace.id)}
      />
    )
  const badRoute = ready && !!id && ((type === 'workspace' && !workspace) || (type === 'canvas' && !opened))
  const formTitle =
    modal &&
    {
      space: '建立工作區',
      canvas: '建立畫布',
      copy: '複製畫布',
      renameSpace: '重新命名工作區',
      renameCanvas: '重新命名畫布',
    }[modal.action]
  return (
    <div className="shell">
      <header className="top">
        <Brand />
        <span className="topRule" />
        <span className="topSection">
          <LayoutDashboard size={15} /> 工作區
        </span>
        <DisplayControls {...display} />
        <span className="account">
          <span className="avatar">{user ? user.slice(0, 1).toUpperCase() : '·'}</span>
          {user || '連線中'}
        </span>
      </header>
      <aside className="sidebar">
        <div className="sideHeading">
          工作區{' '}
          <button className="icon" onClick={() => form('space')} aria-label="新增工作區">
            <Plus size={17} />
          </button>
        </div>
        <nav>
          {catalog.workspaces.map((w) => (
            <button
              key={w.id}
              className={'workspaceItem ' + (workspace?.id === w.id ? 'selected' : '')}
              onClick={() => go('workspace', w.id)}
            >
              {workspace?.id === w.id ? <FolderOpen size={17} /> : <Folder size={17} />}
              <span>{w.name}</span>
              <small>{catalog.canvases.filter((c) => c.workspace === w.id).length}</small>
            </button>
          ))}
        </nav>
        <button className="addSpace" onClick={() => form('space')}>
          <CirclePlus size={16} /> 建立工作區
        </button>
      </aside>
      <main className="content">
        <div className="breadcrumb">
          <Boxes size={14} /> 工作區 <ChevronRight size={13} />
          {workspace?.name || '總覽'}
        </div>
        {error && (
          <p className="warning" role="alert">
            {error} <button onClick={() => location.reload()}>重新載入</button>
          </p>
        )}
        {badRoute ? (
          <section className="empty">
            <h1>找不到此項目</h1>
            <button onClick={() => (location.hash = '')}>返回工作區</button>
          </section>
        ) : !ready ? (
          <p>正在載入工作區…</p>
        ) : !workspace ? (
          <section className="empty">
            <span className="emptyIcon">
              <Boxes />
            </span>
            <h1>建立第一個工作區</h1>
            <button className="primary" onClick={() => form('space')}>
              <Plus size={16} />
              建立工作區
            </button>
          </section>
        ) : (
          <>
            <section className="hero">
              <div className="spaceIcon">
                <Layers3 size={29} />
              </div>
              <div className="heroTitle">
                <h1>{workspace.name}</h1>
                <p>
                  {canvases.length} 張畫布 <span>·</span> {canvases.reduce((n, c) => n + c.nodes, 0)} 個節點
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
              <button className="primary createCanvas" onClick={() => form('canvas')}>
                <Plus size={17} /> 建立畫布
              </button>
            </section>
            <div className="collectionHeading">
              <h2>
                <Layers3 size={17} />
                全部畫布 <span className="pill">{canvases.length}</span>
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
            {shown.length ? (
              <div className={list ? 'cards rows' : 'cards'}>
                {shown.map((c, i) => (
                  <article key={c.id} className="card">
                    <button className="cardOpen" onClick={() => go('canvas', c.id)}>
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
          </>
        )}
      </main>
      {modal && (
        <dialog
          className="dialog"
          ref={dialog}
          onCancel={(e) => {
            if (saving) e.preventDefault()
            else setModal(null)
          }}
        >
          <form onSubmit={submit}>
            <header>
              <h2>{formTitle}</h2>
              <button
                type="button"
                className="icon"
                disabled={saving}
                aria-label="關閉"
                onClick={() => setModal(null)}
              >
                <X size={18} />
              </button>
            </header>
            {modal.action === 'copy' && (
              <label>
                目的工作區
                <select value={target} onChange={(e) => setTarget(e.target.value)}>
                  {catalog.workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              名稱
              <input
                autoFocus
                required
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={modal.action === 'space' ? '例如：伺服器驗證' : '輸入名稱'}
              />
            </label>
            {formError && <p role="alert">{formError}</p>}
            <footer>
              <button type="button" disabled={saving} onClick={() => setModal(null)}>
                取消
              </button>
              <button className="primary" disabled={saving}>
                {saving ? '儲存中…' : formTitle}
              </button>
            </footer>
          </form>
        </dialog>
      )}
    </div>
  )
}
createRoot(document.getElementById('root')!).render(<App />)
