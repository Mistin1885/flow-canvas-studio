import { defaultLabelColor, edgeColors, labelColor, storeEdgeColors } from '../appearance/edgeColors.js'
import { $, el } from '../ui/dom.js'

const channels = [
  { key: 'line', picker: 'line-color', auto: 'line-auto', name: '線段顏色' },
  { key: 'background', picker: 'line-label-color', auto: 'line-label-auto', name: '條件文字底色' },
]

function markSelection(channel) {
  const value = $(channel.auto).checked ? null : $(channel.picker).value.toLowerCase()
  for (const b of $(channel.picker + '-palette').querySelectorAll('.edge-swatch'))
    b.setAttribute('aria-pressed', String(b.value === value))
}

function renderSwatches(channel, colors) {
  const host = $(channel.picker + '-palette')
  host.replaceChildren()
  host.hidden = !colors.length
  host.append(el('span', 'palette-caption', '已用色'))
  for (const [i, color] of colors.entries()) {
    const swatch = el('button', 'edge-swatch')
    swatch.type = 'button'
    swatch.value = color
    swatch.title = color
    swatch.setAttribute('aria-label', channel.name + ' ' + color)
    swatch.style.setProperty('--swatch', color)
    swatch.hidden = i >= 6
    swatch.onclick = () => {
      $(channel.picker).value = color
      $(channel.auto).checked = false
      markSelection(channel)
    }
    host.append(swatch)
  }
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

function loadControls(edge) {
  const colors = edgeColors(edge)
  for (const channel of channels) {
    $(channel.auto).checked = !colors[channel.key]
    $(channel.picker).value = colors[channel.key] || defaultLabelColor(edge.label)
  }
}

export function openEdgePalette(edge, edges) {
  const text = $('line-text'), preset = $('line-preset')
  text.value = edge.label || ''
  loadControls(edge)
  const counts = new Map(), presets = new Map(), labelCounts = new Map()
  for (const item of edges) {
    const colors = edgeColors(item)
    for (const color of new Set([colors.line?.toLowerCase(), item.label && labelColor(item).toLowerCase()])) {
      if (color) counts.set(color, (counts.get(color) || 0) + 1)
    }
    if (!item.label) continue
    const key = JSON.stringify([item.label, colors.line?.toLowerCase(), colors.background?.toLowerCase()])
    if (presets.has(key)) continue
    presets.set(key, item)
    labelCounts.set(item.label, (labelCounts.get(item.label) || 0) + 1)
  }
  const colors = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b))
  for (const channel of channels) {
    renderSwatches(channel, colors)
    markSelection(channel)
    $(channel.picker).oninput = () => {
      $(channel.auto).checked = false
      markSelection(channel)
    }
    $(channel.auto).onchange = () => {
      if ($(channel.auto).checked) $(channel.picker).value = defaultLabelColor(text.value)
      markSelection(channel)
    }
  }
  text.oninput = () => {
    for (const channel of channels)
      if ($(channel.auto).checked) $(channel.picker).value = defaultLabelColor(text.value)
  }
  preset.replaceChildren(new Option('套用既有條件…', ''))
  const items = [...presets.values()].sort((a, b) => a.label.localeCompare(b.label))
  items.forEach((item, index) => {
    const { line, background } = edgeColors(item)
    const suffix = labelCounts.get(item.label) > 1 ? '（線 ' + (line || '自動') + '／底 ' + (background || '自動') + '）' : ''
    preset.append(new Option(item.label + suffix, String(index)))
  })
  preset.hidden = !items.length
  preset.onchange = () => {
    if (!preset.value) return
    const item = items[Number(preset.value)]
    text.value = item.label
    loadControls(item)
    channels.forEach(markSelection)
    preset.value = ''
  }
}

export function saveEdgePalette(edge) {
  const [line, background] = channels.map(channel => $(channel.auto).checked ? null : $(channel.picker).value)
  storeEdgeColors(edge, line, background)
}
