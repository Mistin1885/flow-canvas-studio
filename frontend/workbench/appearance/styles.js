import { categoryTags, legendState } from '../categories/model.js'
import { groupStyle, defaultColors } from './schema.js'
import { isFrameNode } from '../graph/nodeTypes.js'

import { readableInk } from '../editing/edges.js'
import { diagramState } from '../diagram/state.js'
import { graphModel } from '../graph/model.js'

import { svg } from '../ui/dom.js'
import { groupKey } from '../frames/membership.js'

function applyLegendStyle(card, node) {
  const categories = categoryTags(node)
    .map((name) => legendState.legendItems.find((item) => item.name === name))
    .filter(Boolean)
  const colorOf = (item) => (/^[0-9a-f]{6}$/i.test(item?.value || '') ? '#' + item.value : '')
  const outline =
    categories.find((item) => item.custom) || categories.find((item) => item.kind === 'outline')
  const fill = categories.find((item) => item.kind === 'fill')
  const stripe =
    colorOf(outline) || colorOf(fill) || (/^#[0-9a-f]{6}$/i.test(node.group) ? node.group : '')
  card.style.setProperty('--stripe', stripe)
  card.style.setProperty('--surface', colorOf(fill))
  card.dataset.surface = fill?.name || ''
  card.classList.toggle(
    'optional',
    categories.some((item) => item.kind === 'dash'),
  )
}

function paintCard(card, s) {
  card.style.borderColor = s.edge || ''
  card.style.borderStyle = s.line || ''
  card.style.borderRadius = s.radius === undefined ? '' : s.radius + 'px'
  card.style.borderWidth = s.width ? s.width + 'px' : ''
  for (const mode of ['dark', 'light']) {
    card.classList.toggle('fill-' + mode, !!s[mode])
    if (s[mode]) {
      card.style.setProperty('--fill-' + mode, s[mode])
      card.style.setProperty('--ink-' + mode, readableInk(s[mode]))
    }
  }
}

function drawStyleFrames(parent) {
  const groups = new Map()
  for (const i of diagramState.instances) {
    const n = graphModel.nodes[i.id]
    if (isFrameNode(n)) continue
    const style = { ...graphModel.document.nodeStyle, ...groupStyle(graphModel.document, n.group) }
    if (style.frame !== 'on') continue
    const key = JSON.stringify([i.scope, n.group])
    let box = groups.get(key)
    if (!box) {
      box = { name: n.group, style, left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }
      groups.set(key, box)
    }
    box.left = Math.min(box.left, i.x)
    box.top = Math.min(box.top, i.y)
    box.right = Math.max(box.right, i.x + i.w)
    box.bottom = Math.max(box.bottom, i.y + i.h)
  }
  for (const box of groups.values()) {
    const g = svg('g', { class: 'style-group-frame' })
    g.dataset.layoutGroup = box.name
    g.dataset.endpoint = groupKey(box.name)
    const x = box.left - 12,
      y = box.top - 23,
      color = box.style.frameColor || defaultColors.frameColor
    const rect = svg('rect', {
      x,
      y,
      width: box.right - box.left + 24,
      height: box.bottom - box.top + 35,
      rx: 9,
      fill: 'none',
      stroke: color,
      'stroke-width': 2,
      'stroke-dasharray': { solid: 'none', dotted: '2 5', dashed: '8 5' }[
        box.style.frameLine || 'dashed'
      ],
    })
    const name = svg('text', { x: x + 8, y: y + 15 })
    name.textContent = box.name
    g.append(rect, name)
    parent.append(g)
  }
}

export { applyLegendStyle, drawStyleFrames, paintCard }
