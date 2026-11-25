import { editState } from './state.js'
import { canvas } from '../diagram/viewport.js'

import { setEditTarget } from './selection.js'
import { editMembers } from '../frames/memberDialog.js'
import { diagramState } from '../diagram/state.js'
import { openEdge } from './edges.js'
import { frameHandles } from '../frames/membership.js'
import { $, svg } from '../ui/dom.js'
import { updateTrace } from '../diagram/animation.js'
import { rightAnglePath } from '../diagram/paths.js'
import { frameTargetAt } from '../frames/handles.js'
import { cancelGesture } from './tools.js'
import { exportGraph } from '../io/graph.js'
import { graphModel } from '../graph/model.js'
import { replaceGraph } from '../graph/replace.js'

import { beginWireDrag, moveWireDrag, commitWireDrag } from './wireDrag.js'

function initGestures() {
  let swallowClick = false,
    lastTap = null
  canvas.addEventListener(
    'click',
    (e) => {
      if (swallowClick) {
        swallowClick = false
        if (e.target.closest('.edit-dock,#group-empty')) return
        e.stopImmediatePropagation()
        e.preventDefault()
      }
    },
    true,
  )
  canvas.addEventListener(
    'pointerdown',
    (e) => {
      if (
        !editState.enabled ||
        e.button !== 0 ||
        e.target.closest('.edit-dock,#group-empty,.highlight-badge')
      )
        return
      swallowClick = false
      const card = e.target.closest('.node,.graph-handle'),
        port = e.target.closest('.connect-port,.group-port')
      if (card?.matches('.graph-handle') && !port) return
      if (e.target.closest('.frame-rim')) {
        e.stopImmediatePropagation()
        setEditTarget({ node: card.dataset.key })
        editMembers(card.dataset.key)
        return
      }
      const outline = e.target.closest('.style-group-frame,.flow-outline')
      if (outline) {
        e.stopImmediatePropagation()
        editMembers(outline.dataset.endpoint)
        return
      }
      if (!card) {
        const grip = e.target.closest('.wire-grip,.wire-label-grip')
        const route = grip?.route || e.target.closest('.edge-route')
        if (route) {
          if (editState.gesture || !route.wireGeometry) return
          setEditTarget({ edge: route.wireGeometry.edge })
          editState.gesture = beginWireDrag(route, e, grip?.dataset.grip)
          e.stopImmediatePropagation()
          if (e.pointerType === 'touch' || grip?.dataset.grip === 'label' || e.target.closest('.edge-annotation')) {
            const now = performance.now()
            if (lastTap?.route === route && now - lastTap.at < 400) {
              cancelGesture()
              const { edge } = route.wireGeometry
              openEdge(edge.from, edge.to, edge)
              lastTap = null
            } else lastTap = { route, at: now }
          }
        } else setEditTarget(null)
        return
      }
      if (e.target.closest('.toggle') || editState.gesture) return
      const item =
        diagramState.instanceMap.get(card.dataset.key) || frameHandles.get(card.dataset.endpoint)
      if (!item) return
      e.stopImmediatePropagation()
      swallowClick = false
      editState.gesture = {
        pointer: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        item,
        card,
        port,
        dx: 0,
        dy: 0,
      }
      // Capture on the pressed button so a short tap retains its native click target.
      editState.gesture.wires = diagramState.edgeViews.filter((v) => v.from === item || v.to === item)
      editState.gesture.capture = e.target.closest('button') || card
      editState.gesture.capture.setPointerCapture(e.pointerId)
      if (port) {
        editState.gesture.preview = svg('path', { class: 'draft-wire', fill: 'none' })
        $('wires').append(editState.gesture.preview)
      }
    },
    true,
  )
  canvas.addEventListener(
    'pointermove',
    (e) => {
      const g = editState.gesture
      if (!g || g.pointer !== e.pointerId) return
      e.stopImmediatePropagation()
      const dx = e.clientX - g.x,
        dy = e.clientY - g.y
      if (!g.started && Math.hypot(dx, dy) < 4) return
      if (!g.started) {
        diagramState.hoverTrace = null
        diagramState.focusTrace = null
        updateTrace()
      }
      g.started = true
      if (g.wire) {
        lastTap = null
        moveWireDrag(g, e)
        return
      }
      if (g.port) canvas.classList.add('choosing-endpoint')
      g.dx = dx / diagramState.scale
      g.dy = dy / diagramState.scale
      if (g.port) {
        const r = $('world').getBoundingClientRect(),
          x = (e.clientX - r.left) / diagramState.scale,
          y = (e.clientY - r.top) / diagramState.scale
        const start = { x: g.item.x + g.item.w, y: g.item.y + g.item.h / 2 }
        const lane = Math.max(start.x + 12 * diagramState.readingScale, (start.x + x) / 2)
        g.preview.setAttribute(
          'd',
          rightAnglePath([start, { x: lane, y: start.y }, { x: lane, y }, { x, y }]),
        )
        const target = frameTargetAt(e.clientX, e.clientY)
        g.target?.classList.remove('link-target')
        g.target = target !== g.card ? target : null
        g.target?.classList.add('link-target')
      } else {
        for (const v of g.wires) {
          const last = v.points.length - 1
          const d = rightAnglePath(
            v.points.map((p, k) => {
              const pull = (v.from === g.item ? 1 - k / last : 0) + (v.to === g.item ? k / last : 0)
              return { x: p.x + pull * g.dx, y: p.y + pull * g.dy }
            }),
          )
          v.p.setAttribute('d', d)
          v.hit.setAttribute('d', d)
        }
        g.card.classList.add('being-moved')
        g.card.style.transform = 'translate(' + (g.item.x + g.dx) + 'px,' + (g.item.y + g.dy) + 'px)'
      }
    },
    true,
  )
  canvas.addEventListener(
    'pointerup',
    (e) => {
      const g = editState.gesture
      if (!g || g.pointer !== e.pointerId) return
      if (g.wire) {
        if (g.started) moveWireDrag(g, e)
        cancelGesture()
        if (g.started) {
          e.stopImmediatePropagation()
          e.preventDefault()
          swallowClick = true
          commitWireDrag(g)
        }
        return
      }
      const drop = frameTargetAt(e.clientX, e.clientY),
        target = drop?.dataset.endpoint || drop?.dataset.key
      cancelGesture()
      if (!g.started) return
      e.stopImmediatePropagation()
      e.preventDefault()
      swallowClick = true
      if (g.port) {
        if (target && target !== g.item.key) openEdge(g.item.id, target, null)
        return
      }
      const graph = exportGraph(),
        node = graph.nodes[g.item.id],
        prev = g.item.appliedOffset || { x: 0, y: 0 }
      node.layoutOrder =
        1 + Math.max(0, ...Object.values(graphModel.nodes).map((n) => n.layoutOrder || 0))
      node.layoutOffset = {
        x: prev.x + g.dx / diagramState.readingScale,
        y: prev.y + g.dy / diagramState.readingScale,
      }
      replaceGraph(graph, { keepView: true, selection: g.item.id })
      setEditTarget({ node: g.item.id })
    },
    true,
  )
  for (const name of ['pointercancel', 'lostpointercapture'])
    canvas.addEventListener(
      name,
      (e) => {
        if (editState.gesture?.pointer === e.pointerId) cancelGesture()
      },
      true,
    )
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editState.gesture) cancelGesture()
  })
}

export { initGestures }
