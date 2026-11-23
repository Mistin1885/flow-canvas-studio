import { legendState } from './model.js'
import { $, el } from '../ui/dom.js'

const categoryDraft = {}

categoryDraft.items = []

function editorLegend(n) {
  const wrap = $('legend-fields')
  wrap.replaceChildren()
  for (const name of [...legendState.legendNames, ...categoryDraft.items.map((c) => c.name)]) {
    const label = el('label'),
      input = el('input')
    input.type = 'checkbox'
    input.value = name
    input.checked = (n.tags || []).includes(name)
    label.append(input, document.createTextNode(name))
    wrap.append(label)
  }
}

export { categoryDraft, editorLegend }
