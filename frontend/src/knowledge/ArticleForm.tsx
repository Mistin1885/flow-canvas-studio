import { useState } from 'react'
import { Eye, FilePenLine, Plus, Trash2 } from 'lucide-react'
import { ArticleView } from './ArticleView'
import { newKey, type Article, type Entry } from './types'

export function ArticleForm({
  entry,
  busy,
  save,
  cancel,
}: {
  entry?: Entry
  busy: boolean
  save: (doc: Article) => void
  cancel: () => void
}) {
  const [doc, setDoc] = useState<Article>(() =>
    structuredClone(entry?.doc || { title: '', summary: '', sections: [] }),
  )
  const [preview, setPreview] = useState(false)
  function edit(id: string, field: 'title' | 'body', value: string) {
    setDoc({ ...doc, sections: doc.sections.map((s) => (s.id === id ? { ...s, [field]: value } : s)) })
  }
  return (
    <form
      className="kbEditor kbForm"
      onSubmit={(event) => {
        event.preventDefault()
        if (doc.title.trim()) save(doc)
      }}
    >
      <header className="kbEditorBar">
        <h2>{entry ? '編輯條目' : '新增條目'}</h2>
        <button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)}>
          {preview ? <FilePenLine size={15} /> : <Eye size={15} />}
          {preview ? '繼續編輯' : '預覽條目'}
        </button>
      </header>
      {preview ? (
        <ArticleView doc={doc} />
      ) : (
        <>
          <div className="kbEditorIntro">
            <label>
              名稱
              <input
                className="kbTitleInput"
                autoFocus
                required
                maxLength={120}
                value={doc.title}
                placeholder="條目名稱"
                onChange={(e) => setDoc({ ...doc, title: e.target.value })}
              />
            </label>
            <label>
              摘要
              <textarea
                rows={2}
                maxLength={600}
                value={doc.summary}
                placeholder="讀者停留在引用文字上時，會先看到這段摘要。"
                onChange={(e) => setDoc({ ...doc, summary: e.target.value })}
              />
            </label>
          </div>
          <div className="kbSectionList">
            {doc.sections.map((s, i) => (
              <section className="kbSectionEditor" key={s.id}>
                <header>
                  <label>
                    <span>小節 {i + 1}</span>
                    <input
                      aria-label={'小節 ' + (i + 1) + ' 名稱'}
                      placeholder="小節名稱"
                      maxLength={120}
                      value={s.title}
                      onChange={(e) => edit(s.id, 'title', e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="kbRemoveSection"
                    title="移除小節"
                    aria-label={'移除小節 ' + (i + 1)}
                    onClick={() =>
                      setDoc({ ...doc, sections: doc.sections.filter((x) => x.id !== s.id) })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </header>
                <textarea
                  aria-label={'小節 ' + (i + 1) + ' 內容'}
                  rows={5}
                  maxLength={50000}
                  value={s.body}
                  onChange={(e) => edit(s.id, 'body', e.target.value)}
                  placeholder="輸入內容，或直接貼上試算表。"
                />
              </section>
            ))}
            <button
              className="kbAddSection"
              type="button"
              disabled={doc.sections.length >= 50}
              onClick={() =>
                setDoc({ ...doc, sections: [...doc.sections, { id: newKey(), title: '', body: '' }] })
              }
            >
              <Plus size={15} /> 加入小節
            </button>
          </div>
        </>
      )}
      <footer className="kbEditorFooter">
        {!!entry?.uses.length && <small>儲存後，{entry.uses.length} 張引用畫布會同步更新。</small>}
        <button type="button" onClick={cancel} disabled={busy}>
          取消
        </button>
        <button className="primary" disabled={busy || !doc.title.trim()}>
          儲存條目
        </button>
      </footer>
    </form>
  )
}
