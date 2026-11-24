import { el } from '../ui/dom.js'
import { readableInk } from '../appearance/contrast.js'
import { badgeIcons } from './model.js'

export function badgeChip(name, spec) {
  const chip = el('span', 'highlight-badge ' + spec.style)
  chip.style.setProperty('--badge-color', spec.color)
  chip.style.setProperty('--badge-ink', readableInk(spec.color))
  if (badgeIcons[spec.icon]) {
    const icon = el('span', 'badge-symbol', badgeIcons[spec.icon])
    icon.setAttribute('aria-hidden', 'true')
    chip.append(icon)
  }
  chip.append(el('span', 'badge-name', name))
  chip.title = name
  return chip
}
