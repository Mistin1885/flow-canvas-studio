import { useState } from 'react'
import { newKey, type Article, type Entry } from './types'
import type { Workspace } from '../api'

export function ArticleForm({
  entry,
  shared,
  spaces,
  owner,
  save,
  cancel,
  busy,
}: {
  entry?: Entry
  shared: boolean
  spaces: Workspace[]
  owner: string
  busy: boolean
  save: (doc: Article, shares: string[]) => void
  cancel: () => void
}) {
  const [doc, setDoc] = useState<Article>(() =>
    structuredClone(entry?.doc || { title: '', summary: '', sections: [] }),
  )
  const [shares, setShares] = useState(entry?.shares || [])
  function edit(id: string, field: 'title' | 'body', value: string) {
    setDoc({ ...doc, sections: doc.sections.map((s) => (s.id === id ? { ...s, [field]: value } : s)) })
  }
  return (
    <form
      className="kbForm"
      onSubmit={(e) => {
        e.preventDefault()
        save(doc, shares)
      }}
    >
      <h2>{entry ? '編輯條目' : '新增知識條目'}</h2>
      <label>
        名稱
        <input
          autoFocus
          required
          maxLength={120}
          value={doc.title}
          onChange={(e) => setDoc({ ...doc, title: e.target.value })}
        />
      </label>
      <label>
        摘要
        <textarea
          rows={2}
          maxLength={600}
          value={doc.summary}
          onChange={(e) => setDoc({ ...doc, summary: e.target.value })}
          placeholder="游標停留在引用文字時顯示"
        />
      </label>
      {doc.sections.map((s, i) => (
        <fieldset key={s.id}>
          <legend>小節 {i + 1}</legend>
          <label>
            小節名稱
            <input
              maxLength={120}
              value={s.title}
              onChange={(e) => edit(s.id, 'title', e.target.value)}
            />
          </label>
          <label>
            內容
            <textarea
              rows={6}
              maxLength={50000}
              value={s.body}
              onChange={(e) => edit(s.id, 'body', e.target.value)}
              placeholder="可直接貼上試算表，或輸入文字、清單、Markdown 表格、圖片與程式碼。"
            />
          </label>
          <button
            type="button"
            onClick={() => setDoc({ ...doc, sections: doc.sections.filter((x) => x.id !== s.id) })}
          >
            移除小節
          </button>
        </fieldset>
      ))}
      <button
        type="button"
        onClick={() =>
          setDoc({ ...doc, sections: [...doc.sections, { id: newKey(), title: '', body: '' }] })
        }
      >
        ＋ 加入小節
      </button>
      {shared && (
        <fieldset>
          <legend>分享給其他工作區</legend>
          {spaces
            .filter((s) => s.id !== owner)
            .map((s) => (
              <label className="kbCheck" key={s.id}>
                <input
                  type="checkbox"
                  checked={shares.includes(s.id)}
                  onChange={(e) =>
                    setShares(e.target.checked ? [...shares, s.id] : shares.filter((id) => id !== s.id))
                  }
                />
                {s.name}
              </label>
            ))}
          <small>勾選後，對方可引用原文。取消分享後，既有引用會保留為畫布副本。</small>
        </fieldset>
      )}
      {entry?.uses.length ? <small>儲存會更新 {entry.uses.length} 張引用畫布。</small> : null}
      <footer>
        <button type="button" onClick={cancel}>
          取消
        </button>
        <button className="primary" disabled={busy}>
          儲存條目
        </button>
      </footer>
    </form>
  )
}
