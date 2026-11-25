import { useState } from 'react'
import { FolderOpen, LockKeyhole, Search, Plus, X } from 'lucide-react'
import type { Workspace } from '../api'
import type { Entry } from './types'

export function SharingForm({
  entry,
  spaces,
  save,
  cancel,
  busy,
}: {
  entry: Entry
  spaces: Workspace[]
  save: (ids: string[]) => void
  cancel: () => void
  busy: boolean
}) {
  const [selected, setSelected] = useState(entry.shares)
  const [search, setSearch] = useState('')
  const recipients = spaces.filter((s) => selected.includes(s.id))
  const available = spaces.filter((s) => s.id !== entry.owner && !selected.includes(s.id))
  const results = available.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase()))
  const removed = entry.shares.some((id) => !selected.includes(id))
  const changed = removed || selected.length !== entry.shares.length
  return (
    <form
      className="kbEditor kbForm kbSharing"
      onSubmit={(e) => {
        e.preventDefault()
        if (changed) save(selected)
      }}
    >
      <header className="kbEditorBar">
        <h2>管理共用範圍</h2>
      </header>
      <div>
        <h3>{entry.doc.title}</h3>
        <p>選擇哪些工作區可以引用原文並接收更新。</p>
      </div>
      <ul className="kbGrantList">
        <li>
          <FolderOpen size={17} />
          <strong>{spaces.find((s) => s.id === entry.owner)?.name}</strong>
          <small>
            <LockKeyhole size={12} /> 來源工作區
          </small>
        </li>
        {recipients.map((s) => (
          <li key={s.id}>
            <FolderOpen size={17} />
            <strong>{s.name}</strong>
            <small>可引用</small>
            <button
              type="button"
              aria-label={'移除 ' + s.name}
              title="移除共用"
              onClick={() => setSelected(selected.filter((id) => id !== s.id))}
            >
              <X size={15} />
            </button>
          </li>
        ))}
      </ul>
      <div className="kbGrantPicker">
        <label>
          <span>加入工作區</span>
          <span className="kbGrantSearch">
            <Search size={15} />
            <input
              type="search"
              placeholder="搜尋工作區名稱"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </span>
        </label>
        <ul>
          {results.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => setSelected([...selected, s.id])}>
                <FolderOpen size={15} />
                <span>{s.name}</span>
                <Plus size={15} aria-label="加入" />
              </button>
            </li>
          ))}
        </ul>
        {!results.length && (
          <small>{available.length ? '找不到符合的工作區' : '沒有其他可加入的工作區'}</small>
        )}
      </div>
      {removed && (
        <p className="kbShareNotice" role="status">
          移除共用後，該工作區已引用的內容會保留為獨立副本，之後不再接收原文更新。
        </p>
      )}
      <footer className="kbEditorFooter">
        <button type="button" disabled={busy} onClick={cancel}>
          取消
        </button>
        <button className="primary" disabled={!changed || busy}>
          套用共用範圍
        </button>
      </footer>
    </form>
  )
}
