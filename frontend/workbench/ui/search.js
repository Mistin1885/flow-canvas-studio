import { properties, rules } from '../modeling/fields.js'
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
    let count = 0
    for (const n of Object.values(graphModel.nodes)) {
      const fields = [
        ['名稱',n.title],['ID',n.id],['說明',n.description],['群組',n.group],
        ['預期結果',n.expect],['備註',n.note],['位置',n.where],['角色',n.ownerRole],
        ['規則',rules[n.gatewayRule]],['分類',(n.tags || []).join(' ')],
        ...(n.content || []).flatMap(c => [['標籤',c.label],['內容',c.value]]),
        ...properties(n),
      ]
      const hit = fields.find(([label,value]) => value != null && (label+' '+value).toLowerCase().includes(q))
      if (!hit) continue
      count++
      const b = el('button','',n.title)
      const value = String(hit[1]), pos = Math.max(0,value.toLowerCase().indexOf(q)-25)
      b.append(el('small','search-match',hit[0]+' · '+(pos?'…':'')+value.slice(pos,pos+100)))
      b.addEventListener('click', () => {
        go(n.id)
        $('search').value = ''
      })
      list.append(b)
    }
    if (!count) list.append(el('p', 'search-empty', '找不到符合的節點或內容。'))
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
