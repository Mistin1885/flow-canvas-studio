import { foldedFrames } from '../frames/folding.js'
import { graphModel } from '../graph/model.js'
import { isFrameNode } from '../graph/nodeTypes.js'
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
  const node = graphModel.nodes[item.id]
  const frame = isFrameNode(node) && node.frameMembers?.length > 0
  const multiple = [item.hasBranch, flow, frame].filter(Boolean).length > 1
  const captions = { 'frame-toggle': '框內', 'branch-toggle': '後續', 'flow-toggle': '子流程' }
  let controls = card.querySelector('.fold-controls')
  if (!item.hasBranch && !flow && !frame) {
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
      (kind === 'frame-toggle' || multiple ? captions[kind] : '')
    control.setAttribute('aria-expanded', String(open))
    control.title = control.ariaLabel = (open ? '收合 ' : '展開 ') + label
    control.onclick = action
  }
  button('frame-toggle', frame, !foldedFrames.has(item.id), title + ' 的框內步驟', () => {
    if (foldedFrames.has(item.id)) foldedFrames.delete(item.id)
    else foldedFrames.add(item.id)
    diagramState.selected = item
    draw(item.id)
    setHash(item.id)
  })
  button('flow-toggle', flow, expandedFlows.has(flow?.id), flow?.title + ' 子流程', () => toggleInlineFlow(flow))
  button('branch-toggle', item.hasBranch, item.open, title + ' 的後續節點', () => toggleBranch(item.id))
}
