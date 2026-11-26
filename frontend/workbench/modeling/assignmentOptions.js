import { $ } from '../ui/dom.js'
import { assignments as lists } from '../options/catalog.js'
import { optionGraph } from '../options/draft.js'
export let pendingOptions = {}

export function showAssignments(node, pending = {}) {
  pendingOptions = {}
  for (const { control, field, list } of lists) {
    pendingOptions[list] = [...(pending[list] ?? [])]
    const names = new Set([
      ...(optionGraph()[list] || []), ...Object.values(optionGraph().nodes).map(n => n[field]),
      ...pendingOptions[list], node[field],
    ].filter(name => typeof name === 'string' && name))
    const select = $('node-' + control)
    select.replaceChildren(new Option('未指定', ''), ...[...names].sort((a,b) => a.localeCompare(b, 'zh-TW')).map(name => new Option(name, name)))
    select.value = node[field] || ''
    const input = $(control + '-name')
    input.value = ''
    $(control + '-message').textContent = ''
    const add = $('add-' + control)
    input.onkeydown = e => {
      if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add.click() }
    }
    add.onclick = () => {
      const name = input.value.trim()
      if (!name) { input.focus(); return }
      const existing = [...select.options].find(o => o.value.toLowerCase() === name.toLowerCase())
      if (!existing) {
        pendingOptions[list].push(name)
        select.add(new Option(name, name))
      }
      select.value = existing?.value || name
      input.value = ''
      $(control + '-message').textContent = existing ? '已選取現有項目' : '已選取，套用後會加入此畫布的選單'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    }
  }
}

export function saveAssignmentOptions(graph) {
  for (const { list } of lists)
    if (pendingOptions[list]?.length) graph[list] = [...new Set([...(graph[list] || []), ...pendingOptions[list]])]
}
