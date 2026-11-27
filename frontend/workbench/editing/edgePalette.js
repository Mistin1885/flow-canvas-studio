import { defaultLabelColor, edgeColors, storeEdgeColors } from '../appearance/edgeColors.js'
import { $ } from '../ui/dom.js'
import { markColorSelection, renderColorPalette, usedColors } from '../appearance/colorPalette.js'
import { graphModel } from '../graph/model.js'

const channels = [
  { key: 'line', picker: 'line-color', auto: 'line-auto', name: '線段顏色' },
  { key: 'background', picker: 'line-label-color', auto: 'line-label-auto', name: '條件文字底色' },
]

function markSelection(channel) {
  const value = $(channel.auto).checked ? null : $(channel.picker).value.toLowerCase()
  markColorSelection($(channel.picker + '-palette'), value)
}

function renderSwatches(channel, colors) {
  renderColorPalette($(channel.picker + '-palette'), colors, {
    name: channel.name,
    value: $(channel.auto).checked ? null : $(channel.picker).value,
    onSelect: color => {
      $(channel.picker).value = color
      $(channel.auto).checked = false
    },
  })
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
  const presets = new Map(), labelCounts = new Map()
  for (const item of edges) {
    const colors = edgeColors(item)
    if (!item.label) continue
    const key = JSON.stringify([item.label, colors.line?.toLowerCase(), colors.background?.toLowerCase()])
    if (presets.has(key)) continue
    presets.set(key, item)
    labelCounts.set(item.label, (labelCounts.get(item.label) || 0) + 1)
  }
  const colors = usedColors(graphModel.document)
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
