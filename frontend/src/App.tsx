import { useEffect, useRef, useState } from 'react'
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
import { api, errorText, type Canvas, type Session, type Workspace } from './api'
import Editor from './editor/Editor'
import { DisplayControls } from './display/DisplayControls'
import { useDisplayPreferences } from './display/useDisplayPreferences'
import { CatalogDialog, type Modal } from './catalog/CatalogDialog'
import { CanvasCollection } from './catalog/CanvasCollection'
import { useListing, type Page } from './paging/useListing'

type Directory = {
  workspaces: (Workspace & { canvases: number })[]
  opened?: Canvas | null
  workspace?: string
  nodes?: number
  listing?: Page<Canvas>
}

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
  const [session, setSession] = useState<Session | null>(null)
  const user = session?.label || ''
  const display = useDisplayPreferences(session?.storage_key || '')
  const [error, setError] = useState('')
  const [[type, id], setRoute] = useState(route)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('updated')
  const [list, setList] = useState(false)
  const [modal, setModal] = useState<Modal | null>(null)
  const [page, setPage] = useState(1)
  const params = type === 'canvas' && id
    ? new URLSearchParams({ canvas: id })
    : new URLSearchParams({ workspace: type === 'workspace' ? id : '', page: String(page), q: query, sort })
  const listing = useListing<Directory>('catalog/page?' + params, type === 'canvas' ? 0 : 12000)
  const { data: catalog, refresh } = listing
  const lastWorkspace = useRef('')
  const firstWorkspace = useRef('')
  useEffect(() => {
    if (!catalog) return
    firstWorkspace.current = catalog.workspaces[0]?.id ?? ''
    if (catalog.workspace) lastWorkspace.current = catalog.workspace
  }, [catalog])
  useEffect(() => {
    void api<Session>('session/login', 'POST').then(setSession).catch(e => setError(errorText(e)))
    const update = () => {
      const next = route()
      setRoute(next)
      if (next[0] !== 'canvas' && (next[1] || firstWorkspace.current) !== lastWorkspace.current) {
        setQuery('')
        setPage(1)
        lastWorkspace.current = next[1] || firstWorkspace.current
      }
    }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  useEffect(() => {
    if (listing.current && catalog?.listing && catalog.listing.page !== page) setPage(catalog.listing.page)
  }, [listing.current, catalog, page])
  const opened = type === 'canvas' && catalog?.opened?.id === id ? catalog.opened : undefined
  const workspace = opened
    ? catalog?.workspaces.find((w) => w.id === opened.workspace)
    : type === 'workspace'
      ? catalog?.workspaces.find((w) => w.id === id)
      : catalog?.workspaces[0]

  const badRoute =
    listing.current && !!id && ((type === 'workspace' && !workspace) || (type === 'canvas' && !opened))
  function form(action: Modal['action'], item?: Workspace) {
    setModal({ action, item })
  }
  if (opened && workspace && session)
    return (
      <Editor
        key={opened.id}
        canvas={opened}
        workspace={workspace.name}
        identity={session.storage_key}
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
        {session?.admin && <a className="adminLink" href="/admin">備份管理</a>}
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
          {catalog?.workspaces.map((w) => (
            <button
              key={w.id}
              className={'workspaceItem ' + (workspace?.id === w.id ? 'selected' : '')}
              onClick={() => go('workspace', w.id)}
            >
              {workspace?.id === w.id ? <FolderOpen size={17} /> : <Folder size={17} />}
              <span>{w.name}</span>
              <small>{w.canvases}</small>
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
        {(error || listing.error) && (
          <p className="warning" role="alert">
            {error || listing.error} <button onClick={() => location.reload()}>重新載入</button>
          </p>
        )}
        {badRoute ? (
          <section className="empty">
            <h1>找不到此項目</h1>
            <button onClick={() => (location.hash = '')}>返回工作區</button>
          </section>
        ) : !catalog || (type === 'canvas' && !opened) || (!listing.current && catalog.workspace !== workspace?.id) ? (
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
            result={listing.current ? catalog.listing : undefined}
            nodeCount={catalog.nodes ?? 0}
            changePage={setPage}
            form={form}
            open={(id) => go('canvas', id)}
            sort={sort}
            setSort={value => { setSort(value); setPage(1) }}
            list={list}
            setList={setList}
            query={query}
            setQuery={value => { setQuery(value); setPage(1) }}
          />
        )}
      </main>
      {modal && (
        <CatalogDialog
          modal={modal}
          workspaces={catalog?.workspaces ?? []}
          workspaceId={workspace?.id || ''}
          refresh={refresh}
          close={() => setModal(null)}
          go={go}
        />
      )}
    </div>
  )
}
