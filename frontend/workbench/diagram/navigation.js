import { DX, diagramState } from './state.js'
import { canvas } from './viewport.js'
import { $, el } from '../ui/dom.js'
import { updateTrace } from './animation.js'
import { revealNode, startId } from './visibleGraph.js'
import { ancestors } from './paths.js'
import { renderDetail } from '../inspector/details.js'
import { graphModel } from '../graph/model.js'
import { hiddenGroups, renderGroupPanel, syncGroups } from '../groups/visibility.js'
import { draw } from './render.js'
import { renderLegend } from '../categories/legend.js'

const scrollState = {}

function transform() {
  const grid = 20 * diagramState.readingScale * diagramState.scale
  canvas.style.setProperty('--edit-grid', Math.max(3, grid) + 'px')
  canvas.style.setProperty('--edit-origin', diagramState.tx + 'px ' + diagramState.ty + 'px')
  $('world').style.setProperty('--port-scale', Math.min(2.4, 1 / diagramState.scale))
  $('world').style.transform =
    `translate(${diagramState.tx}px,${diagramState.ty}px) scale(${diagramState.scale})`
  $('zoom-label').textContent = Math.round(diagramState.scale * 100) + '%'
}

scrollState.resumeHoverAt = 0

function tweenView(x, y, z = diagramState.scale) {
  cancelAnimationFrame(diagramState.frame)
  const start = performance.now(),
    ox = diagramState.tx,
    oy = diagramState.ty,
    os = diagramState.scale,
    duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240
  scrollState.resumeHoverAt = start + duration + 50
  if (diagramState.hoverTrace) {
    diagramState.hoverTrace = null
    updateTrace()
  }
  function tick(now) {
    const t = duration ? Math.min(1, (now - start) / duration) : 1,
      e = 1 - Math.pow(1 - t, 3)
    diagramState.tx = ox + (x - ox) * e
    diagramState.ty = oy + (y - oy) * e
    diagramState.scale = os + (z - os) * e
    transform()
    if (t < 1) diagramState.frame = requestAnimationFrame(tick)
  }
  diagramState.frame = requestAnimationFrame(tick)
}

function showStart() {
  const i = diagramState.instanceMap.get(startId()),
    r = $('canvas').getBoundingClientRect()
  if (i)
    tweenView(Math.min(64, r.width * 0.1) - i.x * 0.83, Math.min(100, r.height * 0.19) - i.y * 0.83, 0.83)
}

function centerInstance(i) {
  const r = $('canvas').getBoundingClientRect(),
    z = Math.max(0.75, Math.min(diagramState.scale, 1))
  tweenView(
    Math.max(12, (r.width - (i.w || diagramState.W) * z) / 2) - i.x * z,
    Math.max(45, (r.height - (i.h || diagramState.H) * z) / 2) - i.y * z,
    z,
  )
}

function focusInstance(i) {
  const r = $('canvas').getBoundingClientRect()
  const z = Math.max(0.75, Math.min(diagramState.scale, 1))
  tweenView(
    (i.level === 0
      ? 40
      : Math.min(DX * z + 32, Math.max(32, (r.width - (i.w || diagramState.W) * z) * 0.45))) -
      i.x * z,
    Math.max(65, r.height * 0.28) - i.y * z,
    z,
  )
}

function select(key, focus = false) {
  const i = diagramState.instanceMap.get(key)
  if (!i) return
  diagramState.selected = i
  const path = new Set(ancestors(i))
  for (const [k, dom] of diagramState.domNodes) {
    dom.classList.toggle('selected', k === key)
    dom.classList.toggle('active-path', path.has(k))
    dom.querySelector('.node-body').setAttribute('aria-pressed', String(k === key))
  }
  for (const view of diagramState.edgeViews) {
    const active = path.has(view.from.key) && path.has(view.to.key)
    view.p.classList.toggle('active', active)
    view.label?.classList.toggle('active', active)
  }
  updateNav()
  if (focus) focusInstance(diagramState.instanceMap.get(key))
  $('inspector').classList.add('open')
  renderDetail()
  setHash(i.id)
}

function setHash(id) {
  try {
    history.replaceState(null, '', '#' + id)
  } catch {}
}

function updateNav() {
  for (const b of document.querySelectorAll('[data-nav]'))
    b.classList.toggle('active', diagramState.selected?.path.includes(b.dataset.nav))
}

function go(id, center = false) {
  if (!graphModel.nodes[id]) return
  if (hiddenGroups.delete(graphModel.nodes[id].group)) {
    renderGroupPanel()
    syncGroups()
  }
  if (!diagramState.instanceMap.has(id)) {
    revealNode(id)
    draw()
  }
  const i = diagramState.instanceMap.get(id)
  if (i) {
    select(i.key)
    centerInstance(i)
  }
  $('search-results').hidden = true
  $('search').setAttribute('aria-expanded', 'false')
}

function syncCanvasTitle() {
  const workspace = $('debug-workspace')
  const title = workspace.dataset.canvasName || graphModel.document.title || '流程畫布'
  document.querySelector('.project-identity h1').textContent = title
  document.title = title
  workspace.setAttribute('aria-label', title)
}

function setCanvasTitle(name) {
  $('debug-workspace').dataset.canvasName = name
  syncCanvasTitle()
}

function rebuildGraphNavigation() {
  syncCanvasTitle()
  const hasSource = !!(graphModel.document.sourceData || graphModel.document.review?.length)
  $('source-review').hidden = !hasSource
  $('source-note').hidden = !hasSource
  renderLegend()
  renderGroupPanel()
  $('stage-nav').replaceChildren()
  for (const [index, id] of (graphModel.document.navigation || []).entries()) {
    const b = el('button')
    b.dataset.nav = id
    b.setAttribute('aria-label', graphModel.nodes[id].title)
    b.title = graphModel.nodes[id].title
    b.append(
      el('span', 'nav-num', String(index + 1).padStart(2, '0')),
      el('span', 'nav-label', graphModel.nodes[id].title),
    )
    b.onclick = () => go(id)
    $('stage-nav').append(b)
  }
  $('shared-nav').replaceChildren()
  for (const sf of graphModel.document.subflows || []) {
    const b = el('button')
    b.dataset.nav = sf.root
    b.append(el('span', 'nav-symbol', '↳'), el('span', 'nav-label', sf.title))
    b.onclick = () => {
      go(sf.root)
      if (matchMedia('(max-width:850px)').matches) $('inspector').classList.remove('open')
    }
    $('shared-nav').append(b)
  }
  const pending = (graphModel.document.review || []).filter((r) => !r.resolved).length
  $('project-summary').textContent =
    Object.keys(graphModel.nodes).length +
    ' 節點 · ' +
    (graphModel.edges.length + (graphModel.document.groupLinks?.length || 0)) +
    ' 連線'
  $('source-review').textContent = '來源與待確認' + (pending ? ' · ' + pending : '')
}

export {
  centerInstance,
  go,
  rebuildGraphNavigation,
  scrollState,
  select,
  setCanvasTitle,
  setHash,
  showStart,
  transform,
  tweenView,
  updateNav,
}
