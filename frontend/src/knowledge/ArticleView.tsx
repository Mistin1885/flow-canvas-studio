import { useEffect, useRef } from 'react'
import { renderBody } from '../../workbench/knowledge/body.js'
import type { Entry, Section } from './types'

function Body({ section }: { section: Section }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => ref.current?.replaceChildren(renderBody(section.body)), [section.body])
  return (
    <section>
      <h3>{section.title}</h3>
      <div ref={ref} />
    </section>
  )
}
export function ArticleView({ entry }: { entry: Entry }) {
  return (
    <article className="kbArticle">
      <h2>{entry.doc.title}</h2>
      <p>{entry.doc.summary}</p>
      {entry.doc.sections.map((s) => (
        <Body key={s.id} section={s} />
      ))}
    </article>
  )
}
export function Locations({ entry }: { entry: Entry }) {
  return (
    <section className="kbUsage">
      <h3>實際引用位置</h3>
      {!entry.uses.length && <small>尚無畫布引用</small>}
      {entry.uses.map((u) => (
        <div key={u.canvas}>
          <strong>
            {u.workspace} / {u.name}
          </strong>
          {u.pinned && <a href={'#canvas/' + u.canvas}>畫布參考資料</a>}
          {u.nodes.map((n) => (
            <a key={n.id} href={'#canvas/' + u.canvas + '/' + n.id}>
              {n.name}
            </a>
          ))}
        </div>
      ))}
    </section>
  )
}
