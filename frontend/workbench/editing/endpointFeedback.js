import { objectName } from '../frames/membership.js'
import { graphModel } from '../graph/model.js'
import { $ } from '../ui/dom.js'

function alreadyConnected(g, key) {
  const edge = g.geometry.edge
  const from = g.mode === 'start' ? key : edge.from
  const to = g.mode === 'end' ? key : edge.to
  const nodes = graphModel.nodes[from] && graphModel.nodes[to]
  const links = nodes ? graphModel.edges : graphModel.document.groupLinks || []
  return links.some(link => link !== edge && link.from === from && link.to === to &&
    link.label === edge.label && (!nodes || link.kind === (edge.kind || 'next')))
}

export function showEndpointTarget(g, target) {
  if (target === g.target) return
  g.target?.classList.remove('link-target', 'link-blocked')
  g.target = target
  const tip = $('endpoint-feedback')
  tip.hidden = !target
  if (!target) return
  const key = target.dataset.endpoint || target.dataset.key
  const blocked = g.wire && alreadyConnected(g, key)
  target.classList.add(blocked ? 'link-blocked' : 'link-target')
  tip.classList.toggle('blocked', !!blocked)
  tip.textContent = (blocked ? '已有相同連線' : g.wire ? '放開以改接' : '放開選取終點') + ' · ' + objectName(key)
  const canvas = $('canvas').getBoundingClientRect(), card = target.getBoundingClientRect()
  const above = card.top - canvas.top - tip.offsetHeight - 8
  const y = above >= 6 ? above : card.bottom - canvas.top + 8
  const x = (card.left + card.right) / 2 - canvas.left - tip.offsetWidth / 2
  tip.style.left = Math.max(6, Math.min(canvas.width - tip.offsetWidth - 6, x)) + 'px'
  tip.style.top = Math.max(6, Math.min(canvas.height - tip.offsetHeight - 6, y)) + 'px'
}
