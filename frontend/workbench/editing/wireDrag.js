import { graphModel } from '../graph/model.js'
import { exportGraph } from '../io/graph.js'
import { replaceGraph } from '../graph/replace.js'
import { diagramState } from '../diagram/state.js'
import { rightAnglePath } from '../diagram/paths.js'
import { routedPoints } from '../layout/editedWires.js'
import {
  closestSegment,
  dragLanes,
  nearestFace,
  routeAnchor,
  straightPoints,
  wirePorts,
} from '../layout/wireGeometry.js'
import { $, el, svg } from '../ui/dom.js'
import { setEditTarget } from './selection.js'

export function showWireGrips(group, points) {
  const host = $('wire-grips')
  const label = group && !group.classList.contains('group-off') && group.querySelector('.edge-annotation')
  const previous = $('selected-wire-label')
  if (previous && previous !== label) previous.removeAttribute('id')
  let labelGrip = host.querySelector('.wire-label-grip')
  if (label) {
    label.id = 'selected-wire-label'
    if (!labelGrip) {
      const layer = svg('svg', { class: 'wire-label-layer', 'aria-hidden': 'true' })
      labelGrip = svg('use', { href: '#selected-wire-label', class: 'wire-label-grip' })
      labelGrip.dataset.grip = 'label'
      layer.append(labelGrip)
      host.prepend(layer)
    }
    labelGrip.route = group
  } else labelGrip?.parentElement.remove()
  if (!group || group.classList.contains('group-off')) {
    host.replaceChildren()
    return
  }
  const ends = points || routedPoints(group.wireGeometry)
  for (const [key, point, title] of [
    ['start', ends[0], '拖動起點接點'],
    ['end', ends.at(-1), '拖動終點接點'],
  ]) {
    let grip = host.querySelector('[data-grip="' + key + '"]')
    if (!grip) {
      grip = el('span', 'wire-grip')
      grip.title = title
      grip.dataset.grip = key
      host.append(grip)
    }
    grip.route = group
    grip.style.left = point.x + 'px'
    grip.style.top = point.y + 'px'
  }
}

function worldPoint(e) {
  const rect = $('world').getBoundingClientRect()
  return {
    x: (e.clientX - rect.left) / diagramState.scale,
    y: (e.clientY - rect.top) / diagramState.scale,
  }
}

export function beginWireDrag(group, e, grip) {
  const geometry = group.wireGeometry,
    layout = geometry.edge.wireLayout || {}
  const points = straightPoints(routedPoints(geometry)),
    start = worldPoint(e)
  const label = group.querySelector('.edge-annotation'),
    rect = label?.querySelector('rect')
  const mode = grip || (e.target.closest('.edge-annotation') ? 'label' : 'segment')
  const capture = e.target
  capture.setPointerCapture(e.pointerId)
  return {
    wire: true,
    pointer: e.pointerId,
    capture,
    group,
    geometry,
    points,
    start,
    mode,
    layout,
    x: e.clientX,
    y: e.clientY,
    index: closestSegment(points, start),
    paths: group.querySelectorAll('.wire,.edge-hit'),
    label,
    originalPath: group.querySelector('.wire').getAttribute('d'),
    labelTransform: label?.getAttribute('transform'),
    center: rect && {
      x: Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) / 2,
      y: Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) / 2,
    },
  }
}

export function moveWireDrag(g, e) {
  if (!g.group.isConnected) return
  const cursor = worldPoint(e),
    delta = { x: cursor.x - g.start.x, y: cursor.y - g.start.y }
  const scale = diagramState.readingScale,
    layout = { ...g.layout }
  const anchor = routeAnchor(g.points)
  if (g.mode === 'label') {
    layout.label = {
      x: (g.center.x + delta.x - anchor.x) / scale,
      y: (g.center.y + delta.y - anchor.y) / scale,
    }
    g.label.setAttribute('transform', 'translate(' + delta.x + ' ' + delta.y + ')')
  } else {
    if (g.mode === 'segment') {
      const axis = g.points[g.index].x === g.points[g.index + 1]?.x ? 'x' : 'y'
      if (g.points.length < 2 || Math.abs(delta[axis]) < 0.1) {
        g.next = null
        restoreWireDrag(g)
        return
      }
      layout.lanes = dragLanes(g.points, g.index, delta, wirePorts(g.geometry, layout, scale), scale)
    } else {
      const side = nearestFace(g.mode === 'start' ? g.geometry.from : g.geometry.to, cursor)
      if (g.next?.[g.mode] === side) return
      layout[g.mode] = side
    }
    const next = routedPoints(g.geometry, layout),
      d = rightAnglePath(next)
    for (const p of g.paths) p.setAttribute('d', d)
    showWireGrips(g.group, next)
    const to = routeAnchor(next)
    g.label?.setAttribute('transform', 'translate(' + (to.x - anchor.x) + ' ' + (to.y - anchor.y) + ')')
  }
  g.next = layout
}

export function restoreWireDrag(g) {
  for (const p of g.paths) p.setAttribute('d', g.originalPath)
  if (g.labelTransform) g.label?.setAttribute('transform', g.labelTransform)
  else g.label?.removeAttribute('transform')
  showWireGrips(g.group.isConnected ? g.group : null, g.points)
}

export function commitWireDrag(g) {
  if (!g.next || !g.group.isConnected || JSON.stringify(g.next) === JSON.stringify(g.layout)) return
  const field = g.group.classList.contains('graph-link') ? 'groupLinks' : 'edges'
  const index = graphModel.document[field]?.indexOf(g.geometry.edge) ?? -1
  if (index < 0) return
  const graph = exportGraph()
  graph[field][index].wireLayout = g.next
  replaceGraph(graph, { keepView: true })
  setEditTarget({ edge: graphModel.document[field][index] })
}
