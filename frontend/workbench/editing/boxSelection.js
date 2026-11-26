import { diagramState } from '../diagram/state.js'
import { el } from '../ui/dom.js'

export function beginBox(canvas, e) {
  const rect = canvas.getBoundingClientRect()
  const candidates = []
  for (const [key, card] of diagramState.domNodes) {
    if (!card.classList.contains('group-off')) candidates.push([key, card.getBoundingClientRect()])
  }
  const box = el('div', 'selection-box')
  box.hidden = true
  canvas.append(box)
  canvas.setPointerCapture(e.pointerId)
  return { box, candidates, rect, pointer: e.pointerId, capture: canvas, x: e.clientX, y: e.clientY }
}

export function updateBox(g, e) {
  const x = Math.max(g.rect.left, Math.min(g.rect.right, e.clientX))
  const y = Math.max(g.rect.top, Math.min(g.rect.bottom, e.clientY))
  const left = Math.min(g.x, x), top = Math.min(g.y, y)
  Object.assign(g.box.style, {
    left: left - g.rect.left + 'px', top: top - g.rect.top + 'px',
    width: Math.abs(x - g.x) + 'px', height: Math.abs(y - g.y) + 'px',
  })
  g.box.hidden = false
  const keys = new Set()
  for (const [key, r] of g.candidates) {
    const inside = r.left >= left && r.right <= Math.max(g.x, x) &&
      r.top >= top && r.bottom <= Math.max(g.y, y)
    diagramState.domNodes.get(key)?.classList.toggle('box-candidate', inside)
    if (inside) keys.add(key)
  }
  return keys
}

export function clearBox(g) {
  g.box.remove()
  for (const card of diagramState.domNodes.values()) card.classList.remove('box-candidate')
}
