import { useEffect, useRef, useState } from 'react'
import { BookOpen, Search, X } from 'lucide-react'
import { useKnowledgeLibrary } from './useKnowledgeLibrary'
import { ArticleForm } from './ArticleForm'
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
  const [form, setForm] = useState<'new' | 'edit' | null>(null),
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
  function save(doc: Article, shares: string[]) {
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
        shares,
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
      <header>
        <div>
          <small>{name}</small>
          <h1 id="kb-title">
            <BookOpen size={21} />
            {picker ? '引用知識條目' : canvas ? '畫布知識與參考資料' : '工作區知識庫'}
          </h1>
        </div>
        <button aria-label="關閉知識庫" onClick={close}>
          <X size={18} />
        </button>
      </header>
      {!picker && <QuickGuide identity={identity} />}
      {error && (
        <p role="alert" className="warning">
          {error} <button onClick={() => reload((n) => n + 1)}>重新讀取</button>
        </p>
      )}
      <div className="kbGrid">
        <aside>
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
            disabled={busy || !!form}
            onClick={() => {
              setBase(undefined)
              setForm('new')
            }}
          >
            ＋ 新增條目
          </button>
          <nav aria-label="知識條目">
            {lib?.entries
              .filter((e) => (e.doc.title + e.doc.summary).toLowerCase().includes(query.toLowerCase()))
              .map((e) => (
                <button
                  disabled={!!form || busy}
                  aria-current={e.id === selected ? 'true' : undefined}
                  key={e.id}
                  onClick={() => choose(e.id)}
                >
                  <b>{e.doc.title}</b>
                  <small>{scopeLabel(e, lib.spaces)}</small>
                </button>
              ))}
          </nav>
        </aside>
        <main>
          {form && lib ? (
            <ArticleForm
              key={form + base?.id}
              entry={form === 'edit' ? base : undefined}
              busy={busy}
              shared={form === 'edit' ? base?.scope === 'workspace' : !canvas}
              spaces={lib.spaces}
              owner={space}
              save={save}
              cancel={() => setForm(null)}
            />
          ) : entry && lib ? (
            <>
              <small className="kbScope">{scopeLabel(entry, lib.spaces)}</small>
              <ArticleView entry={entry} />
              {picker ? (
                <div className="kbForm">
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
                <>
                  <div className="kbActions">
                    {entry.scope !== 'shared' && (
                      <button
                        onClick={() => {
                          setBase(entry)
                          setForm('edit')
                        }}
                      >
                        {entry.scope === 'canvas' ? '編輯條目' : '編輯原文與共用範圍'}
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
                      <h3>可引用的工作區</h3>
                      <p>
                        {lib.spaces
                          .filter((s) => s.id === entry.owner || entry.shares.includes(s.id))
                          .map((s) => s.name)
                          .join('、')}
                      </p>
                    </div>
                  )}
                  <Locations entry={entry} />
                </>
              )}
            </>
          ) : (
            <p>{lib ? '新增第一篇條目，或從其他工作區分享條目到這裡。' : '載入中…'}</p>
          )}
        </main>
      </div>
    </dialog>
  )
}
