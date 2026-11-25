import { useEffect, useRef, useState } from 'react'
import { BookOpen, Search, X, FileText, Plus, BookMarked, FolderOpen, Share2 } from 'lucide-react'
import { useKnowledgeLibrary } from './useKnowledgeLibrary'
import { ArticleForm } from './ArticleForm'
import { SharingForm } from './SharingForm'
import { QuickGuide } from './QuickGuide'
import { ArticleView, Locations } from './ArticleView'
import { scopeLabel, newKey, type Entry, type Picker, type Article } from './types'
import './knowledge.css'

export default function KnowledgeLibrary({
  space,
  canvas = '',
  name,
  close,
  picker,
  identity,
}: {
  space: string
  canvas?: string
  name: string
  identity: string
  close: () => void
  picker?: Picker
}) {
  const shell = useRef<HTMLDialogElement>(null)
  const { lib, selected, select, reload, error, setError, busy, mutate } = useKnowledgeLibrary(
    space,
    canvas,
    picker,
  )
  const [query, search] = useState('')
  const [form, setForm] = useState<'new' | 'edit' | 'sharing' | null>(null),
    [base, setBase] = useState<Entry>()
  const [section, setSection] = useState(''),
    [alias, setAlias] = useState(picker?.label || '')
  useEffect(() => {
    const dialog = shell.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  const entry = lib?.entries.find((e) => e.id === selected)
  function choose(id: string) {
    select(id)
    setSection('')
    setError('')
    setForm(null)
  }
  function save(doc: Article) {
    if (picker && form === 'new') {
      const id = newKey()
      picker.insert(id, doc, alias.trim() || doc.title, '')
      close()
      return
    }
    const old = form === 'edit' ? base : undefined
    void mutate(
      {
        action: 'save',
        entry: old && old.scope !== 'canvas' ? old.id : '',
        local: old?.local || '',
        localVersion: old?.version,
        version: old?.version || 0,
        doc,
      },
      choose,
    )
  }
  const localFields = {
    entry: entry?.scope === 'canvas' ? '' : entry?.id,
    local: entry?.local || '',
    localVersion: entry?.scope === 'canvas' ? entry.version : entry?.localVersion,
  }
  function insert() {
    if (!picker || !entry) return
    const doc = entry.scope === 'canvas' ? entry.doc : { ...entry.doc, source: entry.id }
    const preferred = 'src_' + entry.id
    const key = entry.local || (lib?.entries.some((e) => e.local === preferred) ? newKey() : preferred)
    picker.insert(key, doc, alias.trim() || entry.doc.title, section)
    close()
  }
  const visibleEntries = lib?.entries.filter((e) =>
    (e.doc.title + e.doc.summary).toLowerCase().includes(query.trim().toLowerCase()),
  )
  return (
    <dialog
      ref={shell}
      className="kbDialog"
      aria-labelledby="kb-title"
      onCancel={(e) => {
        e.preventDefault()
        if (!busy) close()
      }}
    >
      <header className="kbHeader">
        <span className="kbMark" aria-hidden="true">
          <BookOpen size={24} />
        </span>
        <div className="kbHeading">
          <small>
            <FolderOpen size={13} />
            {name}
          </small>
          <h1 id="kb-title">
            {picker ? '引用知識條目' : canvas ? '畫布知識與參考資料' : '工作區知識庫'}
          </h1>
        </div>
        {!picker && <QuickGuide identity={identity} />}
        <button className="icon kbClose" aria-label="關閉知識庫" onClick={close}>
          <X size={18} />
        </button>
      </header>
      {error && (
        <p role="alert" className="warning">
          {error} <button onClick={() => reload((n) => n + 1)}>重新讀取</button>
        </p>
      )}
      <div className="kbGrid">
        <aside className="kbIndex">
          <div className="kbIndexHeading">
            <BookMarked size={16} />
            <strong>條目目錄</strong>
            <span className="pill">{lib?.entries.length ?? '…'}</span>
          </div>
          <label className="kbSearch">
            <Search size={16} />
            <input
              aria-label="搜尋知識"
              placeholder="搜尋條目或摘要"
              value={query}
              onChange={(e) => search(e.target.value)}
            />
          </label>
          <button
            className="primary kbCreate"
            disabled={busy || !!form}
            onClick={() => {
              setBase(undefined)
              setForm('new')
            }}
          >
            <Plus size={15} /> 新增條目
          </button>
          <nav aria-label="知識條目">
            {lib &&
              visibleEntries?.map((e) => (
                <button
                  disabled={!!form || busy}
                  aria-current={e.id === selected ? 'true' : undefined}
                  key={e.id}
                  onClick={() => choose(e.id)}
                >
                  <FileText aria-hidden="true" size={16} />
                  <b>{e.doc.title}</b>
                  <small>{scopeLabel(e, lib.spaces)}</small>
                </button>
              ))}
            {query && visibleEntries?.length === 0 && (
              <small className="kbNoMatches">找不到符合的條目</small>
            )}
          </nav>
        </aside>
        <main className="kbDetail">
          {form === 'sharing' && base && lib ? (
            <SharingForm
              entry={base}
              spaces={lib.spaces}
              busy={busy}
              cancel={() => setForm(null)}
              save={(shares) =>
                void mutate({ action: 'share', entry: base.id, version: base.version, shares }, choose)
              }
            />
          ) : form && lib ? (
            <ArticleForm
              key={form + base?.id}
              entry={form === 'edit' ? base : undefined}
              busy={busy}
              save={save}
              cancel={() => setForm(null)}
            />
          ) : entry && lib ? (
            <div className={picker ? 'kbPage kbPicking' : 'kbPage'}>
              <div className="kbReading">
                <small className="kbScope">{scopeLabel(entry, lib.spaces)}</small>
                <ArticleView doc={entry.doc} />
              </div>
              {picker ? (
                <div className="kbForm kbPickForm">
                  <label>
                    引用位置
                    <select value={section} onChange={(e) => setSection(e.target.value)}>
                      <option value="">整篇條目</option>
                      {entry.doc.sections.map((s, i) => (
                        <option key={s.id} value={s.id}>
                          {s.title || '小節 ' + (i + 1)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    節點顯示文字
                    <input
                      maxLength={120}
                      value={alias}
                      placeholder={entry.doc.title}
                      onChange={(e) => setAlias(e.target.value)}
                    />
                  </label>
                  <button className="primary" onClick={insert}>
                    {entry.scope === 'canvas' ? '引用此條目' : '引用原文 · 跟隨來源更新'}
                  </button>
                </div>
              ) : (
                <aside className="kbContext">
                  <div className="kbActions">
                    {entry.actions?.includes('edit') && (
                      <button
                        onClick={() => {
                          setBase(entry)
                          setForm('edit')
                        }}
                      >
                        {entry.scope === 'canvas' ? '編輯條目' : '編輯原文'}
                      </button>
                    )}
                    {entry.scope === 'canvas' && (
                      <button
                        disabled={busy}
                        onClick={() => void mutate({ action: 'promote', ...localFields }, choose)}
                      >
                        加入工作區共用
                      </button>
                    )}
                    {entry.scope !== 'canvas' && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            { action: canvas && entry.local ? 'detach' : 'copy', ...localFields },
                            choose,
                          )
                        }
                      >
                        {canvas && entry.local
                          ? '此畫布改用獨立副本'
                          : canvas
                            ? '複製到此畫布'
                            : '建立工作區副本'}
                      </button>
                    )}
                    {canvas && (
                      <button
                        disabled={busy}
                        onClick={() =>
                          void mutate({ action: 'pin', ...localFields, pinVersion: lib.pinVersion })
                        }
                      >
                        {lib.pins.includes(entry.local || '') ? '取消釘選' : '釘選至畫布參考資料'}
                      </button>
                    )}
                  </div>
                  {entry.scope !== 'canvas' && (
                    <div className="kbUsage">
                      <h3>
                        <Share2 size={15} />
                        可引用的工作區
                      </h3>
                      {entry.actions?.includes('share') && (
                        <button
                          className="kbManageSharing"
                          disabled={busy}
                          onClick={() => {
                            setBase(entry)
                            setForm('sharing')
                          }}
                        >
                          管理共用範圍
                        </button>
                      )}
                      <ul className="kbSpaces">
                        {lib.spaces
                          .filter((s) => s.id === entry.owner || entry.shares.includes(s.id))
                          .map((s) => (
                            <li key={s.id}>
                              <FolderOpen size={13} />
                              {s.name}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                  <Locations entry={entry} />
                </aside>
              )}
            </div>
          ) : (
            <p>{lib ? '新增第一篇條目，或從其他工作區分享條目到這裡。' : '載入中…'}</p>
          )}
        </main>
      </div>
    </dialog>
  )
}
