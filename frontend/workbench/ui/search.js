import { $, el } from './dom.js'
import { graphModel, groupNames } from '../graph/model.js'
import { go } from '../diagram/navigation.js'

function bindSearch() {
  $('search').addEventListener('input', () => {
    const q = $('search').value.trim().toLowerCase()
    const list = $('search-results')
    list.replaceChildren()
    list.hidden = !q
    $('search').setAttribute('aria-expanded', String(!!q))
    if (!q) return
    const matches = Object.values(graphModel.nodes)
      .filter((n) =>
        (
          n.title +
          ' ' +
          n.description +
          ' ' +
          n.group +
          ' ' +
          n.id +
          ' ' +
          (n.content || []).map((c) => c.value).join(' ')
        )
          .toLowerCase()
          .includes(q),
      )
      .slice(0, 18)
    if (!matches.length) list.append(el('p', 'search-empty', '找不到節點，試試 Layout、RFP 或 DFx。'))
    for (const n of matches) {
      const b = el('button', '', n.title)
      b.append(el('small', '', groupNames[n.group] || n.group))
      b.addEventListener('click', () => {
        go(n.id)
        $('search').value = ''
      })
      list.append(b)
    }
  })
  $('search').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      $('search-results').querySelector('button')?.focus()
      e.preventDefault()
    }
    if (e.key === 'Enter') {
      $('search-results').querySelector('button')?.click()
      e.preventDefault()
    }
    if (e.key === 'Escape') {
      $('search-results').hidden = true
      $('search').setAttribute('aria-expanded', 'false')
    }
  })
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) {
      $('search-results').hidden = true
      $('search').setAttribute('aria-expanded', 'false')
    }
  })
}

export { bindSearch }
