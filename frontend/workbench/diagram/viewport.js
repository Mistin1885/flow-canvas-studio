import { includeEditedWires } from '../layout/editedWires.js'
import { diagramState } from './state.js'
import { go, showStart, transform, tweenView } from './navigation.js'
import { $ } from '../ui/dom.js'
import { fitVisible, hiddenGroups } from '../groups/visibility.js'
import { startId } from './visibleGraph.js'
import { updateTrace } from './animation.js'

const pointerState = {}

function zoom(f, x, y) {
  cancelAnimationFrame(diagramState.frame)
  const z = Math.max(0.005, Math.min(2.4, diagramState.scale * f))
  diagramState.tx = x - ((x - diagramState.tx) * z) / diagramState.scale
  diagramState.ty = y - ((y - diagramState.ty) * z) / diagramState.scale
  diagramState.scale = z
  transform()
}

function centerZoom(f) {
  const r = $('canvas').getBoundingClientRect()
  zoom(f, r.width / 2, r.height / 2)
}

const canvas = $('canvas')

pointerState.drag = null

function endDrag(e) {
  const wasDragging = !!pointerState.drag
  pointerState.drag = null
  canvas.classList.remove('dragging')
  if (!wasDragging || e.type !== 'pointerup' || e.pointerType === 'touch') return
  const hit = document.elementFromPoint(e.clientX, e.clientY),
    node = hit?.closest('.node'),
    group = hit?.closest('.edge-route'),
    view = group && diagramState.edgeViews.find((v) => v.group === group)
  diagramState.hoverTrace = node
    ? { kind: 'node', key: node.dataset.key }
    : view
      ? { kind: 'edge', view }
      : null
  updateTrace()
}

const touchPoints = new Map()

let pinch = null

let suppressTouchClickUntil = 0

function bindViewport() {
  $('zoom-in').onclick = () => centerZoom(1.15)
  $('zoom-out').onclick = () => centerZoom(1 / 1.15)
  $('zoom-label').onclick = () => centerZoom(1 / diagramState.scale)
  $('fit').onclick = () => {
    if (hiddenGroups.size) {
      fitVisible()
      return
    }
    const { left, top, right, bottom } = includeEditedWires({
      left: Math.min(0, ...diagramState.instances.map(i => (i.inlineFlow || i).x)),
      top: Math.min(0, ...diagramState.instances.map(i => (i.inlineFlow || i).y)),
      right: diagramState.totalW,
      bottom: diagramState.totalH,
    })
    const w = Math.max(1, right - left),
      h = Math.max(1, bottom - top),
      r = $('canvas').getBoundingClientRect(),
      z = Math.max(0.005, Math.min(1, (r.width - 40) / w, (r.height - 100) / h))
    tweenView((r.width - w * z) / 2 - left * z, 40 - top * z, z)
  }
  $('home').onclick = () => {
    go(startId())
    showStart()
  }
  $('show-detail').onclick = () => {
    if (matchMedia('(min-width:851px)').matches) {
      document.body.classList.toggle('hide-detail')
    } else $('inspector').classList.toggle('open')
  }
  const syncDetailToggle = () => {
    const open = matchMedia('(min-width:851px)').matches ? !document.body.classList.contains('hide-detail') : $('inspector').classList.contains('open')
    const button = $('show-detail')
    button.title = button.ariaLabel = open ? '收合節點詳情' : '展開節點詳情'
    button.setAttribute('aria-expanded', String(open))
  }
  const detailObserver = new MutationObserver(syncDetailToggle)
  for (const target of [document.body, $('inspector')]) detailObserver.observe(target, { attributes: true, attributeFilter: ['class'] })
  matchMedia('(min-width:851px)').addEventListener('change', syncDetailToggle)
  syncDetailToggle()
  $('close-detail').onclick = () => $('inspector').classList.remove('open')
  document.addEventListener(
    'pointerdown',
    () => {
      diagramState.traceWithKeyboard = false
      diagramState.focusTrace = null
      updateTrace()
    },
    { capture: true },
  )
  document.addEventListener(
    'keydown',
    (e) => {
      diagramState.traceWithKeyboard = true
      const node = e.target.closest?.('.node')
      if (
        node &&
        ['Tab', 'Enter', ' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)
      ) {
        diagramState.focusTrace = { kind: 'node', key: node.dataset.key }
        updateTrace()
      }
    },
    { capture: true },
  )
  canvas.addEventListener('pointerdown', (e) => {
    // Keep the native click target on a wire so a double click can open its editor.
    if (e.target.closest('button,a,input,select,.edge-route,.frame-rim,.node-resize,.flow-outline')) return
    cancelAnimationFrame(diagramState.frame)
    pointerState.drag = { x: e.clientX, y: e.clientY, tx: diagramState.tx, ty: diagramState.ty }
    canvas.setPointerCapture(e.pointerId)
    canvas.classList.add('dragging')
    diagramState.hoverTrace = null
    diagramState.focusTrace = null
    updateTrace()
  })
  canvas.addEventListener('pointermove', (e) => {
    if (!pointerState.drag) return
    diagramState.tx = pointerState.drag.tx + e.clientX - pointerState.drag.x
    diagramState.ty = pointerState.drag.ty + e.clientY - pointerState.drag.y
    transform()
  })
  canvas.addEventListener('pointerup', endDrag)
  canvas.addEventListener('pointercancel', endDrag)
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      zoom(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
    },
    { passive: false },
  )
  canvas.addEventListener('keydown', (e) => {
    if (e.target !== canvas) return
    const moves = { ArrowLeft: [50, 0], ArrowRight: [-50, 0], ArrowUp: [0, 50], ArrowDown: [0, -50] }
    if (moves[e.key]) {
      cancelAnimationFrame(diagramState.frame)
      diagramState.tx += moves[e.key][0]
      diagramState.ty += moves[e.key][1]
      transform()
      e.preventDefault()
    }
    if (e.key === '+' || e.key === '=') {
      centerZoom(1.15)
      e.preventDefault()
    }
    if (e.key === '-') {
      centerZoom(1 / 1.15)
      e.preventDefault()
    }
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      diagramState.hoverTrace = null
      diagramState.focusTrace = null
      updateTrace()
      $('inspector').classList.remove('open')
      $('search-results').hidden = true
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault()
      $('search').focus()
    }
  })
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (e.pointerType !== 'touch') return
      touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (touchPoints.size === 2) {
        pointerState.drag = null
        cancelAnimationFrame(diagramState.frame)
        const [a, b] = [...touchPoints.values()],
          r = canvas.getBoundingClientRect(),
          x = (a.x + b.x) / 2 - r.left,
          y = (a.y + b.y) / 2 - r.top
        pinch = {
          distance: Math.hypot(a.x - b.x, a.y - b.y),
          scale: diagramState.scale,
          x: (x - diagramState.tx) / diagramState.scale,
          y: (y - diagramState.ty) / diagramState.scale,
        }
        for (const id of touchPoints.keys()) canvas.setPointerCapture(id)
        e.preventDefault()
      }
    },
    { capture: true },
  )
  canvas.addEventListener(
    'pointermove',
    (e) => {
      if (!touchPoints.has(e.pointerId)) return
      touchPoints.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (!pinch || touchPoints.size < 2) return
      pointerState.drag = null
      const [a, b] = [...touchPoints.values()],
        r = canvas.getBoundingClientRect()
      diagramState.scale = Math.max(
        0.2,
        Math.min(2.4, (pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, pinch.distance)),
      )
      diagramState.tx = (a.x + b.x) / 2 - r.left - pinch.x * diagramState.scale
      diagramState.ty = (a.y + b.y) / 2 - r.top - pinch.y * diagramState.scale
      suppressTouchClickUntil = performance.now() + 500
      transform()
      e.preventDefault()
    },
    { capture: true },
  )
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'])
    canvas.addEventListener(
      type,
      (e) => {
        touchPoints.delete(e.pointerId)
        if (touchPoints.size < 2) pinch = null
      },
      { capture: true },
    )
  canvas.addEventListener(
    'click',
    (e) => {
      if (performance.now() < suppressTouchClickUntil) {
        e.stopImmediatePropagation()
        e.preventDefault()
      }
    },
    { capture: true },
  )
}

export { bindViewport, canvas }
