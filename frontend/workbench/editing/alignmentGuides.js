import { $, svg } from '../ui/dom.js'

export function showAlignmentGuides(guides, delta, zoom) {
  const layer = $('node-alignment')
  for (const axis of ['x', 'y']) {
    const guide = guides.find(g => g.axis === axis)
    let line = layer.querySelector('.align-' + axis)
    if (!guide) {
      line?.remove()
      continue
    }
    if (!line) {
      line = svg('line', { class: 'align-' + axis, 'vector-effect': 'non-scaling-stroke' })
      layer.append(line)
    }
    const { along, direction, source, target } = guide
    const margin = 20 / zoom * direction
    line.setAttribute(axis + '1', target[axis])
    line.setAttribute(axis + '2', target[axis])
    line.setAttribute(along + '1', source[along] + delta[along] - margin)
    line.setAttribute(along + '2', target[along] + margin)
  }
}

export function clearAlignmentGuides() {
  $('node-alignment').replaceChildren()
}
