import { legendState, unmappedTag, categoryTags } from './model.js'

import { graphModel } from '../graph/model.js'
import { updateTrace } from '../diagram/animation.js'
import { $, el } from '../ui/dom.js'
import { diagramState } from '../diagram/state.js'
import { releaseNarrowCanvas } from '../groups/visibility.js'

const legendSelection = {}

function selectCategory(name) {
  if (selectedCategories.has(name)) selectedCategories.delete(name)
  else selectedCategories.add(name)
  legendSelection.lastLegendMatch = null
  updateLegendHighlights()
  updateTrace()
}

const selectedCategories = new Set()

let legendMatches = []

legendSelection.lastLegendMatch = null

function swatch(item) {
  const s = el('i', 'legend-swatch ' + item.kind)
  s.setAttribute('aria-hidden', 'true')
  if (item.kind === 'text') {
    s.append(el('b', '', 'A'), el('b', '', 'a'))
  } else if (item.kind === 'outline' || item.kind === 'fill') {
    s.style.setProperty('--sample', '#' + item.value)
  }
  return s
}

function renderLegend() {
  $('legend-other').hidden = !graphModel.document.sourceLegend
  const choices = $('drawing-legend')
  choices.replaceChildren()
  const counts = new Map(legendState.legendItems.map((item) => [item.name, 0]))
  for (const n of Object.values(graphModel.nodes))
    for (const c of categoryTags(n)) counts.set(c, (counts.get(c) || 0) + 1)
  $('legend-other').textContent = unmappedTag + ' ' + (counts.get(unmappedTag) || 0)
  for (const item of legendState.legendItems) {
    const b = el('button', 'legend-choice'),
      count = counts.get(item.name)
    b.type = 'button'
    b.dataset.category = item.name
    b.setAttribute('aria-pressed', String(selectedCategories.has(item.name)))
    b.setAttribute('aria-label', item.name + '，' + count + ' 個節點')
    b.append(swatch(item), el('span', 'legend-name', item.name), el('span', 'legend-count', count))
    b.onclick = () => selectCategory(item.name)
    choices.append(b)
  }
  updateLegendHighlights()
}

function updateLegendHighlights() {
  const active = selectedCategories.size > 0,
    notesActive = legendState.legendItems.some((i) => i.kind === 'text' && selectedCategories.has(i.name))
  const hits = new Set(),
    neighbors = new Set()
  legendMatches = active
    ? Object.values(graphModel.nodes)
        .filter((n) => categoryTags(n).some((c) => selectedCategories.has(c)))
        .map((n) => n.id)
    : []
  for (const id of legendMatches) if (diagramState.instanceMap.has(id)) hits.add(id)
  const sourceNotes = graphModel.document.sourceLegend?.standaloneNotes || {}
  for (const edge of diagramState.edgeViews) {
    const a = edge.from.key,
      b = edge.to.key,
      from = hits.has(a),
      to = hits.has(b)
    const annotated =
      notesActive && edge.link?.edge.sourceAnnotationIds?.some((id) => Object.hasOwn(sourceNotes, id))
    if (from || annotated) neighbors.add(b)
    if (to || annotated) neighbors.add(a)
    if (active)
      edge.group.dataset.legendLevel =
        (from && to) || annotated ? 'match' : from || to ? 'neighbor' : 'dim'
    else delete edge.group.dataset.legendLevel
  }
  for (const id of hits) neighbors.delete(id)
  for (const [key, dom] of diagramState.domNodes) {
    if (active)
      dom.dataset.legendLevel = hits.has(key) ? 'match' : neighbors.has(key) ? 'neighbor' : 'dim'
    else delete dom.dataset.legendLevel
  }
  $('world').classList.toggle('legend-active', active)
  $('legend-other').setAttribute('aria-pressed', String(selectedCategories.has(unmappedTag)))
  for (const b of $('drawing-legend').children)
    b.setAttribute('aria-pressed', String(selectedCategories.has(b.dataset.category)))
  $('legend-clear').disabled = !active
  $('legend-next').disabled = !legendMatches.length
  const hidden = legendMatches.length - hits.size
  $('legend-status').textContent = active
    ? '命中 ' + hits.size + ' · 相鄰 ' + neighbors.size + (hidden ? ' · 收合內 ' + hidden : '')
    : '可複選分類'
  $('legend-toggle').textContent = '分類圖例' + (active ? ' · ' + selectedCategories.size : '')
  $('legend-notes').hidden = !notesActive || !Object.keys(sourceNotes).length
  $('legend-notes').textContent = '查看原圖獨立註記（' + Object.keys(sourceNotes).length + '）'
}

function setLegendOpen(open) {
  $('legend-panel').hidden = !open
  if (open) releaseNarrowCanvas()
  $('legend-toggle').setAttribute('aria-expanded', String(open))
}

export {
  legendMatches,
  legendSelection,
  renderLegend,
  selectCategory,
  selectedCategories,
  setLegendOpen,
  updateLegendHighlights,
}
