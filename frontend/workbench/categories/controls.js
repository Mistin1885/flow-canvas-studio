import { unmappedTag } from './model.js'
import {
  legendMatches,
  legendSelection,
  selectCategory,
  selectedCategories,
  setLegendOpen,
  updateLegendHighlights,
} from './legend.js'
import { $, el } from '../ui/dom.js'
import { updateTrace } from '../diagram/animation.js'
import { go } from '../diagram/navigation.js'
import { graphModel } from '../graph/model.js'

function initLegend() {
  setLegendOpen(false)
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('#tools-menu')) $('tools-menu').open = false
  })
  $('tools-menu').addEventListener('click', (e) => {
    if (e.target.closest('button')) $('tools-menu').open = false
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      if ($('tools-menu').open) {
        $('tools-menu').open = false
        $('tools-menu').querySelector('summary').focus()
      }
    }
  })
  $('legend-other').onclick = () => selectCategory(unmappedTag)
  $('legend-toggle').onclick = () => setLegendOpen($('legend-panel').hidden)
  $('legend-clear').onclick = () => {
    selectedCategories.clear()
    legendSelection.lastLegendMatch = null
    updateLegendHighlights()
    updateTrace()
  }
  $('legend-next').onclick = () => {
    if (!legendMatches.length) return
    legendSelection.lastLegendMatch =
      legendMatches[(legendMatches.indexOf(legendSelection.lastLegendMatch) + 1) % legendMatches.length]
    go(legendSelection.lastLegendMatch)
    if (matchMedia('(max-width:850px)').matches) {
      $('inspector').classList.remove('open')
    }
  }
  $('legend-notes').onclick = () => {
    const list = $('legend-note-list')
    list.replaceChildren()
    for (const [id, text] of Object.entries(graphModel.document.sourceLegend?.standaloneNotes || {})) {
      const row = el('li')
      row.append(el('strong', '', id + ' '), document.createTextNode(text))
      for (const edge of graphModel.edges.filter((e) => e.sourceAnnotationIds?.includes(id))) {
        const b = el(
          'button',
          '',
          graphModel.nodes[edge.from].title + ' → ' + graphModel.nodes[edge.to].title,
        )
        b.onclick = () => {
          $('legend-notes-dialog').close()
          go(edge.from)
        }
        row.append(b)
      }
      list.append(row)
    }
    $('legend-notes-dialog').showModal()
  }
  $('legend-notes-close').onclick = () => $('legend-notes-dialog').close()
}

export { initLegend }
