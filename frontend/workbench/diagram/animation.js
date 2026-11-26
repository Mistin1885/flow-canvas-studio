import { editState } from '../editing/state.js'
import { diagramState } from './state.js'
import { rightAnglePath } from './paths.js'
import { hiddenGroups } from '../groups/visibility.js'
import { graphModel } from '../graph/model.js'
import { $, svg } from '../ui/dom.js'
import { nodeFor } from './nodes.js'
import { selectedCategories } from '../categories/legend.js'

// Each frame uses the same interpolated positions for nodes, edge endpoints,
// and labels. A new layout invalidates all callbacks from the previous layout.
function animateDiagram(oldPositions, revision) {
  const started = performance.now(),
    duration =
      matchMedia('(prefers-reduced-motion: reduce)').matches || diagramState.instances.length > 70
        ? 0
        : 200
  const nodes = diagramState.instances.slice(),
    views = diagramState.edgeViews.slice()
  const render = (progress) => {
    if (revision !== diagramState.diagramRevision) return
    const t = 1 - Math.pow(1 - progress, 3),
      positions = new Map()
    for (const i of nodes) {
      const old = oldPositions.get(i.key) || i,
        pos = { x: old.x + (i.x - old.x) * t, y: old.y + (i.y - old.y) * t }
      positions.set(i.key, pos)
      const dom = diagramState.domNodes.get(i.key)
      if (dom && !(editState.gesture?.started && editState.gesture.moving?.has(i))) {
        dom.style.transform = `translate(${pos.x}px,${pos.y}px)`
        dom.style.opacity = oldPositions.has(i.key) ? '1' : String(Math.min(1, progress * 1.6))
      }
    }
    diagramState.displayPositions = positions
    for (const view of views) {
      if (editState.gesture?.started && (editState.gesture.group === view.group ||
          editState.gesture.wires?.includes(view))) continue
      const a = positions.get(view.from.key),
        b = positions.get(view.to.key),
        da = { x: a.x - view.from.x, y: a.y - view.from.y },
        db = { x: b.x - view.to.x, y: b.y - view.to.y },
        last = Math.max(1, view.points.length - 1)
      const points = view.points.map((p, k) => ({
        x: p.x + da.x * (1 - k / last) + (db.x * k) / last,
        y: p.y + da.y * (1 - k / last) + (db.y * k) / last,
      }))
      view.d = rightAnglePath(points)
      view.p.setAttribute('d', view.d)
      view.hit.setAttribute('d', view.d)
      view.label?.setAttribute('transform', `translate(${(da.x + db.x) / 2},${(da.y + db.y) / 2})`)
      view.traceLabel?.setAttribute('transform', `translate(${(da.x + db.x) / 2},${(da.y + db.y) / 2})`)
      view.overlay?.forEach((p) => p.setAttribute('d', view.d))
      view.motion?.setAttribute('path', view.d)
    }
  }
  if (!duration) {
    render(1)
    return
  }
  render(0)
  const tick = (now) => {
    if (revision !== diagramState.diagramRevision) return
    const progress = Math.min(1, Math.max(0, (now - started) / duration))
    render(progress)
    if (progress < 1) diagramState.diagramFrame = requestAnimationFrame(tick)
  }
  diagramState.diagramFrame = requestAnimationFrame(tick)
}

function updateTrace() {
  const trace = diagramState.hoverTrace || diagramState.focusTrace,
    source = trace?.kind === 'node' ? diagramState.instanceMap.get(trace.key) : trace?.view?.from
  const links = source
      ? trace.kind === 'edge'
        ? [trace.view]
        : diagramState.edgeViews.filter(
            (v) => v.from.key === source.key && !hiddenGroups.has(graphModel.nodes[v.to.id].group),
          )
      : [],
    targets = new Set(links.map((v) => v.to.key)),
    active = new Set(links)
  $('world').classList.toggle('is-tracing', !!source)
  $('trace-overlay').replaceChildren()
  for (const [key, dom] of diagramState.domNodes) {
    const origin = source?.key === key,
      target = targets.has(key)
    dom.classList.toggle('trace-source', !!origin)
    dom.classList.toggle('trace-target', !origin && target)
    dom.dataset.traceRole = origin ? '起點' : trace?.kind === 'edge' ? '終點' : '下一步'
  }
  for (const view of diagramState.edgeViews) {
    view.group.classList.toggle('trace-active', active.has(view))
    view.overlay = null
    view.motion = null
    view.traceLabel = null
  }
  const hint = $('connection-hint')
  hint.hidden = !source
  if (!source) return
  const names = [...new Set(links.map((v) => nodeFor(v.to).title))]
  hint.textContent =
    trace.kind === 'edge'
      ? nodeFor(source).title +
        ' → ' +
        names.join('、') +
        (links[0].link?.edge.label ? ' · ' + links[0].link.edge.label : '')
      : nodeFor(source).title +
        ' → ' +
        (names.length
          ? names.slice(0, 3).join('、') + (names.length > 3 ? ' 等 ' + names.length + ' 個後續節點' : '')
          : source.available.length
            ? '可從詳情前往後續步驟'
            : '此分支終點')
  for (const view of links) {
    const alpha = selectedCategories.size
      ? { match: '1', neighbor: '.5', dim: '.19' }[view.group.dataset.legendLevel] || '1'
      : '1'
    const halo = svg('path', { d: view.d, class: 'trace-rail' }),
      flow = svg('path', { d: view.d, class: 'trace-flow', 'marker-end': 'url(#arrow)' })
    halo.style.opacity = alpha
    flow.style.opacity = alpha
    view.overlay = [halo, flow]
    $('trace-overlay').append(halo, flow)
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const particle = svg('circle', { r: 3.5, class: 'trace-particle' }),
        motion = svg('animateMotion', {
          path: view.d,
          dur: '1.15s',
          repeatCount: 'indefinite',
          calcMode: 'paced',
        })
      view.motion = motion
      particle.style.opacity = alpha
      particle.append(motion)
      $('trace-overlay').append(particle)
    }
  }
  for (const view of links)
    if (view.label) {
      view.traceLabel = view.label.cloneNode(true)
      view.traceLabel.removeAttribute('id')
      view.traceLabel.classList.add('trace-label')
      if (selectedCategories.size)
        view.traceLabel.style.opacity = { match: '1', neighbor: '.5', dim: '.19' }[
          view.group.dataset.legendLevel
        ]
      $('trace-overlay').append(view.traceLabel)
    }
}

export { animateDiagram, updateTrace }
