import { groupStyle } from '../appearance/schema.js'

import { isFrameNode } from '../graph/nodeTypes.js'
import { canvas } from '../diagram/viewport.js'
import { flowKey, frameHandles, groupKey, objectName, sourceMembers } from './membership.js'
import { $, el, svg } from '../ui/dom.js'
import { diagramState } from '../diagram/state.js'

import { graphModel } from '../graph/model.js'
import { gridPlacement } from '../layout/grid.js'
import { editMembers } from './memberDialog.js'
import { labelColor } from '../appearance/edgeColors.js'
import { readableInk } from '../appearance/contrast.js'
import { openEdge } from '../editing/edges.js'
import { groupNamesInGraph, hiddenGroups } from '../groups/visibility.js'

import { facePort, facingSide, straightenAutomaticWire } from '../layout/dockPoints.js'
import { clearRoute, orthogonalRoute } from '../layout/routing.js'
import { dockProjectLinks, simplifyWire } from '../layout/ports.js'
import { rightAnglePath } from '../diagram/paths.js'
import { wireGeometry, routedPoints, pinnedLabel } from '../layout/editedWires.js'
import { edgeLabelLines } from '../layout/labels.js'

function frameTargetAt(x, y) {
  const hit = document.elementFromPoint(x, y),
    direct = hit?.closest('[data-endpoint],.node')
  if (direct) return direct
  if (!hit || !canvas.contains(hit) || hit.closest('button,.edit-dock,.edge-route,#group-empty'))
    return null
  const containing = []
  for (const outline of canvas.querySelectorAll(
    '.frame-node:not(.group-off),.flow-outline:not(.group-off),.style-group-frame:not(.group-off) rect',
  )) {
    const r = outline.getBoundingClientRect()
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom)
      containing.push({ area: r.width * r.height, el: outline.closest('[data-endpoint],.node') })
  }
  return containing.sort((a, b) => a.area - b.area)[0]?.el || null
}

function layoutFrameHandles() {
  frameHandles.clear()
  for (const el of $('world').querySelectorAll('.graph-handle')) el.remove()
  const blocked = diagramState.instances
    .filter((i) => !isFrameNode(graphModel.nodes[i.id]))
    .map((i) => ({ x: i.x, y: i.y, w: i.w, h: i.h }))
  for (const frame of diagramState.instances.filter((i) => isFrameNode(graphModel.nodes[i.id]))) {
    const title = diagramState.domNodes.get(frame.key)?.querySelector('.node-body')
    blocked.push({
      x: frame.x + 6,
      y: frame.y + 4,
      w: title?.offsetWidth || frame.w,
      h: title?.offsetHeight || 24 * diagramState.readingScale,
    })
  }
  const linked = new Set((graphModel.document.groupLinks || []).flatMap((e) => [e.from, e.to]))
  function handle(key, label, anchor, always, group, scope) {
    if (!anchor) return
    const w = Math.max(100, Math.min(240, label.length * 8 + (key.startsWith('group:') ? 94 : 56))),
      h = 26
    const pos = gridPlacement(anchor.x, Math.max(0, anchor.y - h - 12), w, h, blocked)
    const i = { ...pos, w, h, id: key, key, group, scope }
    blocked.push(i)
    frameHandles.set(key, i)
    const box = el('div', 'graph-handle' + (always || linked.has(key) ? '' : ' edit-only-handle'))
    box.dataset.endpoint = key
    box.style.cssText = 'left:' + i.x + 'px;top:' + i.y + 'px;width:' + w + 'px;height:' + h + 'px'
    const title = el('button', 'handle-title', key.startsWith('group:') ? '群組 · ' + label : label),
      port = el('button', 'group-port', '＋')
    title.ariaLabel = '編輯' + objectName(key) + '的步驟'
    title.title = title.ariaLabel
    title.onclick = () => editMembers(key)
    port.title = port.ariaLabel = '從' + objectName(key) + '建立連線'
    port.onclick = () => openEdge(key, '', null)
    box.append(title, port)
    $('world').append(box)
    diagramState.totalW = Math.max(diagramState.totalW, i.x + w + 20)
    diagramState.totalH = Math.max(diagramState.totalH, i.y + h + 20)
  }
  for (const name of groupNamesInGraph()) {
    const items = diagramState.instances.filter((i) => graphModel.nodes[i.id].group === name)
    const groupAnchor =
      items
        .filter((i) => !isFrameNode(graphModel.nodes[i.id]))
        .sort((a, b) => a.y - b.y || a.x - b.x)[0] || items[0]
    const belongs = Object.values(graphModel.nodes).some((n) => n.group === name)
    const anchor = groupAnchor || (!belongs ? { x: 30, y: 55 } : null)
    const enabled =
      { ...graphModel.document.nodeStyle, ...groupStyle(graphModel.document, name) }.frame === 'on'
    handle(groupKey(name), name, anchor, enabled, name, anchor?.scope)
  }
  for (const f of graphModel.document.subflows || []) {
    const p = diagramState.instanceMap.get(f.parent)
    if (!p) continue
    handle(
      flowKey(f.id),
      '子流程 · ' + f.title,
      p.inlineFlow || p,
      !!p.inlineFlow,
      graphModel.nodes[p.id].group,
      p.scope,
    )
  }
}

function renderGroupLinks(frag) {
  const endpoint = (k) => frameHandles.get(k) || diagramState.instanceMap.get(k)
  const edges = graphModel.document.groupLinks || []
  if (!edges.length) return
  const obstacles = [
    ...diagramState.instances.filter(i => !isFrameNode(graphModel.nodes[i.id])),
    ...frameHandles.values(),
  ].map(item => ({
    item, x: item.x - 4, y: item.y - 4, w: item.w + 8, h: item.h + 8,
  }))
  for (const edge of edges) {
    const a = endpoint(edge.from),
      b = endpoint(edge.to)
    if (!a || !b) continue
    const layout = edge.wireLayout
    // Saved group edits are relative to the original horizontal auto ports.
    const side = layout?.start || layout?.end || layout?.lanes
      ? (a.x + a.w / 2 <= b.x + b.w / 2 ? 'right' : 'left')
      : facingSide(a, b)
    const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[side]
    const { point: start, stub: s } = facePort(a, side, 12 * diagramState.readingScale)
    const { point: end, stub: t } = facePort(b, opposite, 12 * diagramState.readingScale)
    const axis = side === 'left' || side === 'right' ? 'x' : 'y'
    const middle = (s[axis] + t[axis]) / 2
    const defaultPath = [s, { ...s, [axis]: middle }, { ...t, [axis]: middle }, t]
    const getObstacles = () => obstacles.filter(r => r.item !== a && r.item !== b)
    const boxes = getObstacles()
    const path = clearRoute(defaultPath, boxes)
      ? defaultPath
      : orthogonalRoute(
          s,
          t,
          boxes,
          {
            left: Math.min(s.x, t.x) - 130,
            right: Math.max(s.x, t.x) + 130,
            min: Math.min(s.y, t.y) - 130,
            max: Math.max(s.y, t.y) + 130,
          },
          [],
          [],
          diagramState.readingScale,
        ) || defaultPath
    const autoPoints = simplifyWire([start, ...path, end])
    const points = straightenAutomaticWire(a, b, autoPoints, diagramState.readingScale, edge.wireLayout,
      straight => clearRoute(straight, boxes))
    const geometry = wireGeometry(edge, a, b, points, {
      getObstacles, originalPorts: points !== autoPoints ? [start, end] : undefined,
    }),
      pts = routedPoints(geometry),
      d = rightAnglePath(pts),
      g = svg('g', { class: 'edge-route graph-link' })
    if (axis === 'y') geometry.autoDock = { start: side, end: opposite }
    g.dataset.from = edge.from
    g.dataset.to = edge.to
    g._edge = edge
    g.wirePoints = pts
    g.wireGeometry = geometry
    g.append(
      svg('path', {
        class: 'wire',
        d,
        'marker-end': 'url(#arrow)',
        style: edge.conditionColor ? 'stroke:' + edge.conditionColor : '',
      }),
      svg('path', { class: 'edge-hit', d }),
    )
    if (edge.label) {
      let length = 0,
        at = start
      for (let k = 1; k < pts.length; k++) {
        const u = pts[k - 1],
          v = pts[k],
          dist = Math.hypot(u.x - v.x, u.y - v.y)
        if (dist > length) {
          length = dist
          at = { x: (u.x + v.x) / 2, y: (u.y + v.y) / 2 }
        }
      }
      at = pinnedLabel(pts, edge.wireLayout) || at
      const lines = edgeLabelLines(edge.label),
        width = Math.max(...lines.map((l) => l.length)) * 9 + 16,
        height = lines.length * 17 + 6
      const color = labelColor(edge),
        label = svg('g', { class: 'edge-annotation' })
      label.style.pointerEvents = 'all'
      const rect = svg('rect', { x: at.x - width / 2, y: at.y - height / 2, width, height, rx: 4 })
      rect.style.fill = color
      const txt = svg('text', { 'text-anchor': 'middle' })
      txt.style.fill = readableInk(color)
      lines.forEach((l, k) => {
        const span = svg('tspan', { x: at.x, y: at.y - height / 2 + 16 + 17 * k })
        span.textContent = l
        txt.append(span)
      })
      label.append(rect, txt)
      g.append(label)
    }
    g.ondblclick = (event) => {
      event.stopPropagation()
      openEdge(edge.from, edge.to, edge)
    }
    frag.append(g)
  }
}

function syncFrameControls() {
  function hidden(k) {
    return hiddenGroups.has(frameHandles.get(k)?.group || graphModel.nodes[k]?.group)
  }
  for (const el of $('world').querySelectorAll('.graph-handle'))
    el.classList.toggle('group-off', hidden(el.dataset.endpoint))
  for (const el of $('paths').querySelectorAll('.graph-link'))
    el.classList.toggle('group-off', hidden(el.dataset.from) || hidden(el.dataset.to))
}

function explicitFrameBounds() {
  const redock = new Set()
  for (const i of diagramState.instances) {
    const n = graphModel.nodes[i.id]
    if (!isFrameNode(n) || !n.frameMembers) continue
    const items = n.frameMembers
        .map((k) => diagramState.instanceMap.get(k))
        .filter(Boolean)
        .map((x) => x.inlineFlow || x),
      pad = 18 * diagramState.readingScale
    if (items.length) {
      i.x = Math.min(...items.map((x) => x.x)) - pad
      i.y = Math.min(...items.map((x) => x.y)) - pad - 26 * diagramState.readingScale
      i.w = Math.max(130, ...items.map((x) => x.x + x.w + pad - i.x))
      i.h = Math.max(52, ...items.map((x) => x.y + x.h + pad - i.y))
    } else {
      i.w = Math.min(340, Math.max(160, n.title.length * 9 + 28)) * diagramState.readingScale
      i.h = 48 * diagramState.readingScale
    }
    redock.add(i)
  }
  if (redock.size)
    dockProjectLinks(diagramState.graphLinks.filter((l) => redock.has(l.from) || redock.has(l.to)))
}

function reserveFrameHeaders() {
  const frames = diagramState.instances.filter((i) => isFrameNode(graphModel.nodes[i.id]))
  if (!frames.length) return
  const probe = el('span', 'frame-heading-measure')
  document.body.append(probe)
  const changed = new Set()
  for (const i of frames) {
    const members = sourceMembers(graphModel.nodes[i.id])
      .map((k) => diagramState.instanceMap.get(k))
      .filter(Boolean)
    i.w = Math.max(i.w, 150 * diagramState.readingScale)
    probe.style.width = Math.max(1, i.w - 16) + 'px'
    probe.textContent = graphModel.nodes[i.id].title
    const header = probe.offsetHeight + 12
    if (members.length) {
      const ceiling = Math.min(...members.map((m) => (m.inlineFlow || m).y)) - header
      if (ceiling < i.y) {
        i.h += i.y - ceiling
        i.y = ceiling
        changed.add(i)
      }
    } else i.h = Math.max(i.h, header + 12)
  }
  probe.remove()
  if (changed.size)
    dockProjectLinks(diagramState.graphLinks.filter((l) => changed.has(l.from) || changed.has(l.to)))
}

export {
  explicitFrameBounds,
  frameTargetAt,
  layoutFrameHandles,
  renderGroupLinks,
  reserveFrameHeaders,
  syncFrameControls,
}
