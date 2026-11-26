import { optionGraph } from '../options/draft.js'
import { categoryNames } from '../options/catalog.js'
import { $, el } from '../ui/dom.js'

const categoryDraft = {}

categoryDraft.items = []

function editorLegend(n) {
  const wrap = $('legend-fields')
  wrap.replaceChildren()
  const names = categoryNames(optionGraph())
  for (const item of categoryDraft.items) names.add(item.name)
  for (const name of names) {
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
