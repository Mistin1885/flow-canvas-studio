import { renderBadges } from '../badges/canvas.js'
import { effectiveStyle } from '../appearance/schema.js'
import { diagramState } from '../diagram/state.js'
import { graphModel } from '../graph/model.js'
import { $, el } from '../ui/dom.js'
import { nodeKind } from '../diagram/nodes.js'
import { tagList } from '../diagram/visibleGraph.js'
import { paintCard } from '../appearance/styles.js'

// Presentation preferences do not modify the flow graph or commands.
function sizeReadableNodes() {
  const s = diagramState.readingScale,
    parents = new Set((graphModel.document.subflows || []).map((f) => f.parent))
  diagramState.W = Math.round(280 * s)
  diagramState.H = Math.round(66 * s)
  const probe = el('div')
  probe.style.cssText =
    'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;width:0;height:0;overflow:hidden'
  const samples = diagramState.instances.map((i) => {
    const n = graphModel.nodes[i.id],
      step = i.scope !== 'project',
      card = el('div', 'node'),
      body = el('button', 'node-body')
    card.style.cssText =
      'position:relative;width:max-content;height:auto;min-width:' +
      Math.ceil((step ? 112 : 154) * s) +
      'px;max-width:' +
      Math.ceil((step ? 228 : 280) * s) +
      'px'
    body.append(
      el('span', 'node-kicker', (nodeKind(i) === 'decision' ? '◇ 決策 · ' : '') + tagList(n).join(' · ')),
      el('span', 'node-title', (nodeKind(i) === 'return' ? '↩ ' : n.jumpTo ? '↗ ' : '') + n.title),
    )
    paintCard(card, effectiveStyle(graphModel.document, n))
    card.append(body)
    if (parents.has(i.id)) card.append(el('button', 'toggle', '＋'))
    if (n.badges) renderBadges(card, n, false)
    probe.append(card)
    return card
  })
  $('nodes').append(probe)
  diagramState.instances.forEach((i, k) => {
    const card = samples[k]
    const railHeight = side => {
      const rail = card.querySelector('.badge-rail-' + side)
      return rail ? rail.offsetHeight + 3 : 0
    }
    i.badgeTop = railHeight('top')
    i.badgeBottom = railHeight('bottom')
    i.w = card.offsetWidth
    i.h = Math.max(Math.ceil((i.scope === 'project' ? 64 : 54) * s), card.offsetHeight + 2)
  })
  probe.remove()
  document.documentElement.style.setProperty('--node-w', diagramState.W + 'px')
  document.documentElement.style.setProperty('--node-h', diagramState.H + 'px')
}

export { sizeReadableNodes }
