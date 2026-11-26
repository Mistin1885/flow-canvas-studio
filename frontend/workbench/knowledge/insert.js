import { $, el } from '../ui/dom.js'
import { formGraph } from '../editing/formSource.js'
import { studioFrame } from '../display/preferences.js'

export const pendingKnowledge = { docs: {} }

export function bindInsert() {
  const form = $('node-form'),
    button = $('insert-knowledge')
  let field
  window.addEventListener('studio-edit-target', () => {
    field = undefined
  })
  const eligible = '#node-description,#node-note,#node-expect,textarea.block-value'
  form.addEventListener('focusin', (e) => {
    if (e.target.matches(eligible) && e.target.closest('.editor-block')?._block?.type !== 'code')
      field = e.target
  })
  button.onclick = () => {
    const target =
      field && field.isConnected && field.closest('#content-editor > *')?._block?.type !== 'code'
        ? field
        : $('node-description')
    const start = target.selectionStart,
      end = target.selectionEnd
    const label = target.value.slice(start, end)
    const insert = (key, doc, alias, section) => {
      if (!formGraph()['knowledge.' + key]) pendingKnowledge.docs['knowledge.' + key] = doc
      const token =
        '[' + alias.replace(/[\]\n]/g, ' ') + '](kb:' + key + (section ? '#' + section : '') + ')'
      target.setRangeText(token, start, end, 'end')
      target.dispatchEvent(new Event('input', { bubbles: true }))
      target.focus()
    }
    if (studioFrame) {
      window.dispatchEvent(
        new CustomEvent('studio-knowledge', {
          detail: { label, insert, pending: pendingKnowledge.docs },
        }),
      )
    } else {
      const menu = el('dialog'),
        close = el('button', '', '關閉')
      menu.append(el('h3', '', '引用知識'), close)
      close.onclick = () => menu.close()
      for (const [key, doc] of Object.entries(formGraph()).filter(([key]) =>
        key.startsWith('knowledge.'),
      )) {
        const b = el('button', '', doc.title)
        b.onclick = () => {
          menu.close()
          insert(key.slice(10), doc, label || doc.title, '')
        }
        menu.append(b)
      }
      menu.onclose = () => menu.remove()
      document.body.append(menu)
      menu.showModal()
    }
  }
}
