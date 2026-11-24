import type { Page } from './useListing'

export function Pagination({ result, change, label }: {
  result: Pick<Page<unknown>, 'page' | 'pages' | 'size' | 'total'>
  change: (page: number) => void
  label: string
}) {
  const { page, pages, size, total } = result
  if (!total) return null
  const numbers = [...new Set([1, page - 1, page, page + 1, pages])]
    .filter(n => n >= 1 && n <= pages).sort((a, b) => a - b)
  return (
    <nav className="pagination" aria-label={label}>
      <span>第 {(page - 1) * size + 1}–{Math.min(total, page * size)} 筆，共 {total} 筆</span>
      {pages > 1 && <div>
        <button disabled={page === 1} onClick={() => change(page - 1)}>上一頁</button>
        {numbers.map((n, i) => <span key={n}>
          {i > 0 && numbers[i - 1] < n - 1 && <span aria-hidden="true">…</span>}
          <button aria-label={'第 ' + n + ' 頁'} aria-current={n === page ? 'page' : undefined}
            onClick={() => change(n)}>{n}</button>
        </span>)}
        <button disabled={page === pages} onClick={() => change(page + 1)}>下一頁</button>
      </div>}
    </nav>
  )
}
