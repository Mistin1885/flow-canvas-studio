import { selectionState } from './state.js'
import { graphModel } from '../graph/model.js'
import { effectiveType, nodeTypes } from '../graph/nodeTypes.js'
import { el } from '../ui/dom.js'

export function nodeChoiceLabel(node) {
  const type = node.jumpTo ? 'return' : effectiveType(node)
  return `${nodeTypes[type]} | ${node.id} · ${node.title}`
}

function attachSearch(select, value, description, rows = Object.values(graphModel.nodes)) {
  // The select retains the form value. The visible combobox lets the browser handle IME and soft keyboards.
  const box = el('span', 'node-picker'),
    input = el('input'),
    list = el('span', 'picker-options')
  const id = 'picker-' + ++selectionState.pickerSequence
  list.id = id
  list.setAttribute('role', 'listbox')
  list.hidden = true
  input.type = 'text'
  input.autocomplete = 'off'
  input.spellcheck = false
  input.setAttribute('role', 'combobox')
  input.setAttribute('aria-label', description)
  input.setAttribute('aria-controls', id)
  input.setAttribute('aria-expanded', 'false')
  input.setAttribute('aria-autocomplete', 'list')
  select.required = false
  select.hidden = true
  select.setAttribute('aria-hidden', 'true')
  const choices = rows.map(row => {
    // Group and subflow endpoints already include their kind in the supplied title.
    const label = graphModel.nodes[row.id] ? nodeChoiceLabel(row) : row.title + ' · ' + row.id
    const search = [row.id, row.title, row.group, label].join(' ').toLowerCase()
    return { id: row.id, label, search }
  })
  const byId = new Map(choices.map(choice => [choice.id, choice]))
  let results = [],
    active = -1,
    query = ''
  function display() {
    input.value = byId.get(select.value)?.label || ''
    input.placeholder = '選擇' + description
    input.title = input.value || input.placeholder
    input.setCustomValidity(select.value ? '' : '請選擇' + description)
  }
  function choose(n) {
    select.replaceChildren(new Option(n.label, n.id, true, true))
    close()
    input.focus()
    input.select()
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }
  function mark(k) {
    active = k
    ;[...list.children].forEach((o, i) => o.setAttribute('aria-selected', String(k === i)))
    if (results[k]) {
      input.setAttribute('aria-activedescendant', id + '-' + k)
      const o = list.children[k]
      if (o) {
        if (o.offsetTop < list.scrollTop) list.scrollTop = o.offsetTop
        else if (o.offsetTop + o.offsetHeight > list.scrollTop + list.clientHeight)
          list.scrollTop = o.offsetTop + o.offsetHeight - list.clientHeight
      }
    } else input.removeAttribute('aria-activedescendant')
  }
  function render() {
    const q = query.trim().toLowerCase()
    results = choices.filter(choice => choice.search.includes(q))
    list.replaceChildren()
    for (const [i, n] of results.entries()) {
      const o = el('span', 'picker-option', n.label)
      o.id = id + '-' + i
      o.setAttribute('role', 'option')
      o.onpointerdown = (e) => e.preventDefault()
      o.onclick = (e) => {
        // An option inside a label would otherwise activate the input and reopen the list.
        e.preventDefault()
        choose(n)
      }
      list.append(o)
    }
    if (!results.length) list.append(el('span', 'picker-option', '無符合節點'))
    mark(
      results.length
        ? q
          ? 0
          : Math.max(
              0,
              results.findIndex((n) => n.id === select.value),
            )
        : -1,
    )
  }
  function close() {
    list.hidden = true
    query = ''
    input.setAttribute('aria-expanded', 'false')
    input.removeAttribute('aria-activedescendant')
    display()
    if (selectionState.closeCurrentPicker === close) selectionState.closeCurrentPicker = null
  }
  function open() {
    if (list.hidden) {
      selectionState.closeCurrentPicker?.()
      selectionState.closeCurrentPicker = close
      list.hidden = false
      input.setAttribute('aria-expanded', 'true')
      render()
    }
  }
  input.onfocus = () => input.select()
  input.onclick = () => {
    if (list.hidden) {
      open()
      input.select()
    } else close()
  }
  input.oninput = () => {
    open()
    query = input.value
    render()
  }
  input.onblur = close
  input.onkeydown = (e) => {
    if (e.isComposing) return
    if (e.key === 'Escape' && !list.hidden) {
      e.preventDefault()
      e.stopPropagation()
      close()
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (list.hidden) {
        open()
        input.select()
        return
      }
      if (results.length)
        mark(Math.max(0, Math.min(results.length - 1, active + (e.key === 'ArrowDown' ? 1 : -1))))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (list.hidden) {
        open()
        input.select()
      } else if (results[active]) choose(results[active])
      return
    }
    if (e.key === 'Tab') {
      close()
      return
    }
  }
  select.replaceChildren(
    new Option(value && byId.has(value) ? byId.get(value).label : '', value || '', true, true),
  )
  display()
  box.append(input, list, select)
  return box
}

export { attachSearch }
