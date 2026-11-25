import { foldedNodes, expandedFlows, expandBranch } from './visibleGraph.js'
import { diagramState } from './state.js'
import { draw } from './render.js'
import { setHash } from './navigation.js'
import { toggleInlineFlow } from '../layout/inlineFlows.js'
import { el } from '../ui/dom.js'

function toggleBranch(id) {
  if (foldedNodes.has(id)) expandBranch(id)
  else foldedNodes.add(id)
  diagramState.selected = diagramState.instanceMap.get(id)
  draw(id)
  setHash(id)
}

export function renderFoldControls(card, item, flow, title) {
  let controls = card.querySelector('.fold-controls')
  if (!item.hasBranch && !flow) {
    controls?.remove()
    return
  }
  if (!controls) {
    controls = el('span', 'fold-controls')
    card.append(controls)
  }
  function button(kind, shown, open, label, action) {
    let control = controls.querySelector('.' + kind)
    if (!shown) {
      control?.remove()
      return
    }
    if (!control) {
      control = el('button', 'toggle ' + kind)
      control.type = 'button'
      control.append(el('span'))
      controls.append(control)
    }
    control.firstElementChild.textContent = (open ? '−' : '+') +
      (item.hasBranch && flow ? (kind === 'branch-toggle' ? '後續' : '子流程') : '')
    control.setAttribute('aria-expanded', String(open))
    control.title = control.ariaLabel = (open ? '收合 ' : '展開 ') + label
    control.onclick = action
  }
  button('flow-toggle', flow, expandedFlows.has(flow?.id), flow?.title + ' 子流程', () => toggleInlineFlow(flow))
  button('branch-toggle', item.hasBranch, item.open, title + ' 的後續節點', () => toggleBranch(item.id))
}
