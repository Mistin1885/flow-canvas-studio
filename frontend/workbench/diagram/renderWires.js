import { editState } from '../editing/state.js'
import { diagramState } from './state.js'
import { layoutFrameHandles, renderGroupLinks } from '../frames/handles.js'
import { rightAnglePath } from './paths.js'
import { $, svg } from '../ui/dom.js'
import { nodeKind } from './nodes.js'
import { scrollState } from './navigation.js'
import { updateTrace } from './animation.js'
import { drawStyleFrames } from '../appearance/styles.js'

import { flowKey } from '../frames/membership.js'
import { labelColor, openEdge, readableInk } from '../editing/edges.js'
import { placeEdgeLabels } from '../layout/edgeLabels.js'

export function renderWires(projectNodes, pathSet) {
  const fragments = document.createDocumentFragment()
  layoutFrameHandles()
  renderGroupLinks(fragments)
  drawStyleFrames(fragments)
  for (const i of projectNodes) {
    const f = i.inlineFlow
    if (f)
      fragments.append(
        svg('rect', {
          x: f.x,
          y: f.y,
          width: f.w,
          height: f.h,
          rx: 12,
          class: 'flow-outline',
          'data-flow': f.id,
          'data-endpoint': flowKey(f.id),
        }),
      )
  }
  function wire(a, b, main = false, link = null) {
    if (link) {
      link.labelX ??= 0
      link.labelY ??= 0
      link.labelWidth ??= 0
    }
    const points = main
        ? [
            { x: a.x + diagramState.W / 2, y: a.y + diagramState.H },
            { x: b.x + diagramState.W / 2, y: b.y },
          ]
        : link.points,
      d = rightAnglePath(points),
      active = pathSet.has(a.key) && pathSet.has(b.key),
      group = svg('g', { class: 'edge-route' })
    group.dataset.from = a.key
    group.dataset.to = b.key
    const p = svg('path', {
        d,
        class: 'wire ' + (main ? 'main' : nodeKind(b)) + (active ? ' active' : ''),
        'marker-end': 'url(#arrow)',
      }),
      hit = svg('path', { d, class: 'edge-hit' })
    p.dataset.from = a.key
    p.dataset.to = b.key
    hit.dataset.from = a.key
    hit.dataset.to = b.key
    if (b.isExit || link?.edge.dashed) p.setAttribute('stroke-dasharray', '5 4')
    group.append(p, hit)
    fragments.append(group)
    const view = { from: a, to: b, main, link, points, p, hit, group, d, label: null }
    diagramState.edgeViews.push(view)
    if (link) {
      group.wireGeometry = link.geometry
      group.addEventListener('dblclick', (e) => {
        if (editState.enabled) {
          e.stopPropagation()
          openEdge(a.id, b.id, link.edge)
        }
      })
      if (link.edge.conditionColor) {
        group.classList.add('user-color')
        group.style.setProperty('--edge-color', link.edge.conditionColor)
        group.style.setProperty('--edge-ink', readableInk(link.edge.conditionColor))
      }
    }
    group.addEventListener('pointermove', (e) => {
      if (
        e.pointerType !== 'touch' &&
        performance.now() >= scrollState.resumeHoverAt &&
        diagramState.hoverTrace?.view !== view &&
        !$('canvas').classList.contains('dragging')
      ) {
        diagramState.hoverTrace = { kind: 'edge', view }
        updateTrace()
      }
    })
    group.addEventListener('pointerleave', () => {
      if (diagramState.hoverTrace?.view === view) {
        diagramState.hoverTrace = null
        updateTrace()
      }
    })
    if (!main && link.edge.label) {
      group.dataset.condition = /^(yes|pass)$/i.test(link.edge.label)
        ? 'yes'
        : /^(no|fail)\b/i.test(link.edge.label)
          ? 'no'
          : 'note'
      const label = svg('g', { class: 'edge-annotation' + (active ? ' active' : '') }),
        bg = svg('rect', {
          x: link.labelX,
          y: link.labelY,
          width: link.labelWidth,
          height: link.labelHeight,
          rx: 5,
          class: 'edge-label-bg',
        }),
        t = svg('text', {
          x: link.labelX + 8,
          y: link.labelY + 17 * diagramState.readingScale,
          class: 'edge-label',
        })
      label.dataset.from = a.key
      label.dataset.to = b.key
      const title = svg('title')
      title.textContent = link.edge.label
      label.append(title)
      for (const [index, line] of link.lines.entries()) {
        const span = svg('tspan', { x: link.labelX + 8, dy: index ? 16 * diagramState.readingScale : 0 })
        span.textContent = line
        t.append(span)
      }
      label.append(bg, t)
      group.append(label)
      view.label = label
      const color = labelColor(link.edge)
      label.classList.add('user-color')
      bg.style.setProperty('fill', color, 'important')
      t.style.setProperty('fill', readableInk(color), 'important')
    }
  }

  // Entry nodes are not implicitly connected.
  for (const link of diagramState.graphLinks) wire(link.from, link.to, false, link)
  $('paths').replaceChildren(fragments)
  placeEdgeLabels()
  $('wires').style.width = Math.ceil(diagramState.totalW + 32) + 'px'
  $('wires').style.height = Math.ceil(diagramState.totalH + 32) + 'px'
}
