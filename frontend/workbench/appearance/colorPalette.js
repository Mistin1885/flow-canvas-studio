import { el } from '../ui/dom.js'
import { edgeColors, labelColor } from './edgeColors.js'
import { defaultColors } from './schema.js'

// A canvas-wide palette lets every color field reuse the same visual language.
export function usedColors(graph) {
  const counts = new Map()
  const add = value => {
    if (!/^#[0-9a-f]{6}$/i.test(value || '')) return
    const color = value.toLowerCase()
    counts.set(color, (counts.get(color) || 0) + 1)
  }
  for (const item of [graph, ...(graph.layoutGroups || []), ...(graph.nodeTypeDefinitions || []), ...Object.values(graph.nodes || {})]) {
    for (const key of Object.keys(defaultColors)) add(item.nodeStyle?.[key])
    add(item.group)
  }
  for (const item of graph.customCategories || []) add(item.color)
  for (const item of graph.sourceLegend?.items || [])
    if (['outline', 'fill'].includes(item.kind)) add('#' + item.value)
  for (const item of Object.values(graph.badgeStyles || {})) add(item.color)
  for (const edge of [...(graph.edges || []), ...(graph.groupLinks || [])]) {
    const colors = edgeColors(edge)
    for (const color of new Set([colors.line, colors.background, edge.label && labelColor(edge)])) add(color)
  }
  return [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b))
}

export function markColorSelection(host, value) {
  for (const button of host.querySelectorAll('.edge-swatch'))
    button.setAttribute('aria-pressed', String(button.value === value?.toLowerCase()))
}

export function renderColorPalette(host, colors, { name, value, onSelect }) {
  host.replaceChildren()
  host.classList.add('edge-swatches')
  host.setAttribute('role', 'group')
  host.setAttribute('aria-label', name + '已用色')
  host.hidden = !colors.length
  host.append(el('span', 'palette-caption', '已用色'))
  for (const [i, color] of colors.entries()) {
    const button = el('button', 'edge-swatch')
    button.type = 'button'
    button.value = color
    button.title = color.toUpperCase()
    button.setAttribute('aria-label', name + ' ' + color)
    button.style.setProperty('--swatch', color)
    button.hidden = i >= 6
    button.onclick = () => { onSelect(color); markColorSelection(host, color) }
    host.append(button)
  }
  markColorSelection(host, value)
  if (colors.length <= 6) return
  const toggle = el('button', 'swatch-more', '+' + (colors.length - 6))
  toggle.type = 'button'
  toggle.setAttribute('aria-label', '更多已用色')
  toggle.setAttribute('aria-expanded', 'false')
  toggle.onclick = () => {
    const expand = toggle.getAttribute('aria-expanded') === 'false'
    toggle.setAttribute('aria-expanded', String(expand))
    toggle.textContent = expand ? '收合' : '+' + (colors.length - 6)
    host.querySelectorAll('.edge-swatch').forEach((button, i) => { button.hidden = !expand && i >= 6 })
  }
  host.append(toggle)
}

export function bindColorPalette(input, host, graph, name) {
  renderColorPalette(host, usedColors(graph), {
    name, value: input.value,
    onSelect: color => {
      input.value = color
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    },
  })
  input.oninput = () => markColorSelection(host, input.value)
}
