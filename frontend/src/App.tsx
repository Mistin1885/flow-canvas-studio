import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Boxes,
  ChevronRight,
  CirclePlus,
  Folder,
  FolderOpen,
  LayoutDashboard,
  Plus,
  Waypoints,
} from 'lucide-react'
import { api, errorText, type Catalog, type Workspace } from './api'
import Editor from './editor/Editor'
import { DisplayControls } from './display/DisplayControls'
import { useDisplayPreferences } from './display/useDisplayPreferences'
import { CatalogDialog, type Modal } from './catalog/CatalogDialog'
import { CanvasCollection } from './catalog/CanvasCollection'
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
export default function App() {
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
  const opened = type === 'canvas' ? catalog.canvases.find((c) => c.id === id) : undefined
  const workspace = opened
    ? catalog.workspaces.find((w) => w.id === opened.workspace)
    : type === 'workspace'
      ? catalog.workspaces.find((w) => w.id === id)
      : catalog.workspaces[0]

  const badRoute =
    ready && !!id && ((type === 'workspace' && !workspace) || (type === 'canvas' && !opened))
  const canvases = catalog.canvases.filter((c) => c.workspace === workspace?.id)
  function form(action: Modal['action'], item?: Workspace) {
    setModal({ action, item })
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
          <CanvasCollection
            workspace={workspace}
            canvases={canvases}
            form={form}
            open={(id) => go('canvas', id)}
            sort={sort}
            setSort={setSort}
            list={list}
            setList={setList}
            query={query}
            setQuery={setQuery}
          />
        )}
      </main>
      {modal && (
        <CatalogDialog
          modal={modal}
          workspaces={catalog.workspaces}
          workspaceId={workspace?.id || ''}
          refresh={refresh}
          close={() => setModal(null)}
          go={go}
        />
      )}
    </div>
  )
}
