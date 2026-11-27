import { categoryTags, legendState } from '../categories/model.js'

import { readableInk } from './contrast.js'


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
  card.style.setProperty('--category-outline', colorOf(outline))
  card.toggleAttribute('data-category-outline', !!colorOf(outline))
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

export { applyLegendStyle, paintCard }
