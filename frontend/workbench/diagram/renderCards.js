import { renderBadges } from '../badges/canvas.js'
import { rules } from '../modeling/fields.js'
import { editState } from '../editing/state.js'
import { effectiveStyle } from '../appearance/schema.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { diagramState } from './state.js'
import { tagList } from './visibleGraph.js'
import { graphModel } from '../graph/model.js'
import { renderFoldControls } from './foldControls.js'
import { $, el } from '../ui/dom.js'
import { activateNode, nodeFor, nodeGroup, nodeKind, returnTarget } from './nodes.js'
import { scrollState } from './navigation.js'
import { updateTrace } from './animation.js'
import { applyLegendStyle, paintCard } from '../appearance/styles.js'

import { editContext, setEditTarget } from '../editing/selection.js'

export function renderCards(oldPositions, pathSet) {
  const keep = new Set()
  for (const i of diagramState.instances) {
    keep.add(i.key)
    let dom = diagramState.domNodes.get(i.key),
      fresh = !dom
    if (fresh) {
      dom = el('div', 'node')
      const body = el('button', 'node-body')
      body.type = 'button'
      const kicker = el('span', 'node-kicker'),
        title = el('span', 'node-title')
      body.append(kicker, title)
      body.addEventListener('click', () => activateNode(i.key))
      dom.addEventListener('pointermove', (e) => {
        if (
          e.pointerType !== 'touch' &&
          performance.now() >= scrollState.resumeHoverAt &&
          !(diagramState.hoverTrace?.kind === 'node' && diagramState.hoverTrace.key === i.key) &&
          !$('canvas').classList.contains('dragging')
        ) {
          diagramState.hoverTrace = { kind: 'node', key: i.key }
          updateTrace()
        }
      })
      dom.addEventListener('pointerleave', () => {
        if (diagramState.hoverTrace?.kind === 'node' && diagramState.hoverTrace.key === i.key) {
          diagramState.hoverTrace = null
          updateTrace()
        }
      })
      dom.addEventListener('focusin', () => {
        if (diagramState.traceWithKeyboard) {
          diagramState.focusTrace = { kind: 'node', key: i.key }
          updateTrace()
        }
      })
      dom.addEventListener('focusout', (e) => {
        if (!dom.contains(e.relatedTarget)) {
          diagramState.focusTrace = null
          updateTrace()
        }
      })
      const port = el('button', 'connect-port', '+')
      port.type = 'button'
      port.title = port.ariaLabel = '拖到另一個節點建立連線'
      port.tabIndex = -1
      dom.append(body, port)
      $('nodes').append(dom)
      diagramState.domNodes.set(i.key, dom)
    }
    const n = nodeFor(i),
      type = nodeKind(i),
      boundary = i.parent && !i.isExit && nodeGroup(i.id) !== nodeGroup(i.parent.id)
    dom.style.pointerEvents = ''
    dom.className =
      'node ' +
      type +
      (diagramState.selected?.key === i.key ? ' selected' : '') +
      (pathSet.has(i.key) ? ' active-path' : '')
    dom.dataset.key = i.key
    dom.dataset.nodeId = i.id
    dom.dataset.kind = type
    dom.classList.toggle('gateway', !!boundary)
    dom.dataset.group = nodeGroup(i.id)
    dom.dataset.nodeIds = [...i.nodeIds].join(' ')
    dom.dataset.scope = i.scope
    dom.dataset.context = i.context || ''
    dom.dataset.incoming = i.incoming.length
    dom.classList.toggle('merged', i.incoming.length > 1)
    const tags = tagList(n)
    dom.classList.toggle('inline-step', i.scope !== 'project')
    applyLegendStyle(dom, n)
    dom.classList.toggle('frame-node', isFrameNode(n))
    dom.style.width = (i.w || diagramState.W) + 'px'
    dom.style.height = (i.h || diagramState.H) + 'px'
    dom.querySelector('.node-kicker').textContent =
      [rules[n.gatewayRule], type === 'decision' ? '◇ 決策' : '', n.ownerRole, ...tags].filter(Boolean).join(' · ')
    dom.querySelector('.node-title').textContent =
      (type === 'return' ? '↩ ' : n.jumpTo ? '↗ ' : '') + n.title
    dom
      .querySelector('.node-body')
      .setAttribute(
        'aria-label',
        n.title +
          (n.jumpTo
            ? '：跳轉到 ' + graphModel.nodes[n.jumpTo].title
            : returnTarget(i)
              ? '：返回原節點並查看詳情'
              : '：查看詳情'),
      )
    dom
      .querySelector('.node-body')
      .setAttribute('aria-pressed', String(diagramState.selected?.key === i.key))
    const sf = graphModel.document.subflows?.find((s) => s.parent === i.id)
    dom.ondblclick = (e) => {
      if (editState.enabled && !e.target.closest('.connect-port,.toggle,.highlight-badge')) {
        setEditTarget({ node: i.id })
        editContext()
      }
    }
    if (isFrameNode(n) && !dom.querySelector('.frame-rim'))
      for (const side of ['top', 'bottom', 'left', 'right']) {
        const rim = el('span', 'frame-rim')
        rim.dataset.side = side
        dom.append(rim)
      }
    renderFoldControls(dom, i, sf, n.title)
    renderBadges(dom, n)
    paintCard(dom, effectiveStyle(graphModel.document, n))
    const start = oldPositions.get(i.key) || { x: i.x, y: i.y }
    dom.style.transform = `translate(${start.x}px,${start.y}px)`
    dom.style.opacity = fresh ? '0' : '1'
  }
  for (const [key, dom] of diagramState.domNodes)
    if (!keep.has(key)) {
      dom.classList.add('is-leaving')
      dom.style.opacity = '0'
      dom.style.pointerEvents = 'none'
      diagramState.domNodes.delete(key)
      setTimeout(() => dom.remove(), 180)
    }
}
