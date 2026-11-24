import { graphModel } from '../graph/model.js'
import { exportGraph } from '../io/graph.js'
import { replaceGraph } from '../graph/replace.js'
import { editState } from '../editing/state.js'
import { el } from '../ui/dom.js'
import { badgeChip } from './chip.js'

function bindDrag(chip, card, name, side) {
  let pointer = null
  const sideAt = y => {
    const rect = card.getBoundingClientRect()
    return y < rect.top + rect.height / 2 ? 'top' : 'bottom'
  }
  function clear() {
    pointer = null
    delete card.dataset.badgeDrop
    chip.classList.remove('badge-dragging')
  }
  chip.onpointerdown = event => {
    if (!editState.enabled || event.button !== 0 || !event.isPrimary) return
    event.preventDefault()
    event.stopPropagation()
    pointer = event.pointerId
    chip.setPointerCapture(pointer)
    card.dataset.badgeDrop = side
    chip.classList.add('badge-dragging')
  }
  chip.onpointermove = event => {
    if (pointer === event.pointerId) card.dataset.badgeDrop = sideAt(event.clientY)
  }
  chip.onpointerup = event => {
    if (pointer !== event.pointerId) return
    const target = sideAt(event.clientY)
    clear()
    if (side === target || !editState.enabled) return
    const graph = exportGraph()
    graph.nodes[card.dataset.nodeId].badges[name] = target
    replaceGraph(graph, { keepView: true })
  }
  chip.onpointercancel = chip.onlostpointercapture = clear
}

export function renderBadges(card, node, interactive = true) {
  for (const rail of card.querySelectorAll('.badge-rail')) rail.remove()
  const styles = graphModel.document.badgeStyles
  for (const [name, side] of Object.entries(node.badges || {})) {
    let rail = card.querySelector('.badge-rail-' + side)
    if (!rail) {
      rail = el('div', 'badge-rail badge-rail-' + side)
      card.append(rail)
    }
    const chip = badgeChip(name, styles[name])
    rail.append(chip)
    if (interactive) bindDrag(chip, card, name, side)
  }
}
