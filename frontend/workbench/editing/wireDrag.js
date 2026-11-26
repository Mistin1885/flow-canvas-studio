import { objectName } from '../frames/membership.js'
import { previewEndpoint } from './wireEndpoint.js'
import { editConnection } from '../graph/edgeMutation.js'
import { say } from '../ui/toast.js'
import { graphModel } from '../graph/model.js'
import { exportGraph } from '../io/graph.js'
import { replaceGraph } from '../graph/replace.js'
import { diagramState } from '../diagram/state.js'
import { rightAnglePath } from '../diagram/paths.js'
import { collectDockGuides, snapTerminalSegment } from '../layout/dockSnap.js'
import { interiorLanes, moveBend, pinnedRoute } from '../layout/pinnedBends.js'
import { routedPoints } from '../layout/editedWires.js'
import {
  closestSegment,
  dragLanes,
  parallelGuides,
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
    ['start', ends[0], '拖曳起點調整位置或改接其他節點'],
    ['end', ends.at(-1), '拖曳終點調整位置或改接其他節點'],
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
  const index = closestSegment(points, start)
  const radius = 6 / diagramState.scale
  const peers = mode === 'label' ? [] : Array.from($('paths').querySelectorAll('.edge-route:not(.group-off)'))
    .filter(other => other !== group && other.wirePoints)
  const guides = mode === 'segment'
    ? parallelGuides(peers.map(other => other.wirePoints), points, index, radius)
    : []
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
    index,
    radius,
    guides,
    peers,
    dockGuides: collectDockGuides(geometry, peers),
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
  const scale = diagramState.readingScale
  const anchor = routeAnchor(g.points)
  if (g.mode === 'label') {
    const layout = { ...g.layout }
    layout.label = {
      x: (g.center.x + delta.x - anchor.x) / scale,
      y: (g.center.y + delta.y - anchor.y) / scale,
    }
    g.label.setAttribute('transform', 'translate(' + delta.x + ' ' + delta.y + ')')
    g.next = layout
  } else {
    let next
    if (g.mode === 'segment') {
      const layout = { ...g.layout }
      // Group links with vertical automatic docks need both faces after their first manual edit.
      if (g.geometry.autoDock && !layout.start && !layout.end && !layout.lanes)
        Object.assign(layout, g.geometry.autoDock)
      const axis = g.points[g.index].x === g.points[g.index + 1]?.x ? 'x' : 'y'
      if (g.points.length < 2 || Math.abs(delta[axis]) < 0.1) {
        g.next = null
        restoreWireDrag(g)
        return
      }
      const snappedDock = snapTerminalSegment(layout, g.geometry, g.points, g.index, delta, g.dockGuides, g.radius)
      const ports = wirePorts(g.geometry, layout, scale)
      if (snappedDock && g.points.length >= 4) {
        // Dock snapping changes the midpoint used to store offsets. Rebase the
        // untouched segments on the new ports to keep them at their visible positions.
        const lanes = interiorLanes(g.points, ports, scale)
        if (!pinnedRoute(ports, lanes, scale, g.geometry)) return
        layout.lanes = lanes
      } else if (!snappedDock) {
        const [moved] = dragLanes(g.points, g.index, delta, ports, scale, g.guides, g.radius)
        const lanes = moveBend(g.points, g.index, moved, ports, scale, g.geometry)
        if (!lanes) return
        layout.lanes = lanes
      }
      g.next = layout
      next = routedPoints(g.geometry, layout)
    } else {
      next = previewEndpoint(g, e, cursor)
    }
    const d = rightAnglePath(next)
    for (const p of g.paths) p.setAttribute('d', d)
    showWireGrips(g.group, next)
    const to = routeAnchor(next)
    g.label?.setAttribute('transform', 'translate(' + (to.x - anchor.x) + ' ' + (to.y - anchor.y) + ')')
  }
}

export function restoreWireDrag(g) {
  for (const p of g.paths) p.setAttribute('d', g.originalPath)
  if (g.labelTransform) g.label?.setAttribute('transform', g.labelTransform)
  else g.label?.removeAttribute('transform')
  showWireGrips(g.group.isConnected ? g.group : null, g.points)
}

export function commitWireDrag(g) {
  if (!g.next || !g.group.isConnected) return
  const old = g.geometry.edge
  const changingStart = g.mode === 'start'
  const reconnect = g.endpoint && g.endpoint !== (changingStart ? old.from : old.to)
  if (!reconnect && JSON.stringify(g.next) === JSON.stringify(g.layout)) return
  const graph = exportGraph()
  try {
    let field = g.group.classList.contains('graph-link') ? 'groupLinks' : 'edges'
    let index = graphModel.document[field]?.indexOf(old) ?? -1
    if (index < 0) return
    if (reconnect) {
      const result = editConnection(graph, graphModel.document, old,
        changingStart ? g.endpoint : old.from, changingStart ? old.to : g.endpoint, old.label)
      field = result.field
      index = result.index
    }
    graph[field][index].wireLayout = g.next
    replaceGraph(graph, { keepView: true })
    setEditTarget({ edge: graphModel.document[field][index] })
    if (reconnect) say((changingStart ? '起點' : '終點') + '已改接至「' + objectName(g.endpoint) + '」')
  } catch (error) {
    say(error.message)
  }
}
