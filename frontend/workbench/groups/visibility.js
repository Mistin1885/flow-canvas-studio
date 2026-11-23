import { selectionState } from '../editing/state.js'
import { graphModel } from '../graph/model.js'
import { $, el } from '../ui/dom.js'
import { expandedFlows, sheetFor } from '../diagram/visibleGraph.js'
import { draw } from '../diagram/render.js'
import { groupKey } from '../frames/membership.js'
import { diagramState } from '../diagram/state.js'
import { canvas } from '../diagram/viewport.js'
import { tweenView } from '../diagram/navigation.js'
import { syncFrameControls } from '../frames/handles.js'
import { deleteEditTarget, setEditTarget } from '../editing/selection.js'
import { updateTrace } from '../diagram/animation.js'
import { mobileNav } from '../bootstrap.js'

const hiddenGroups = new Set()

function groupNamesInGraph() {
  return [
    ...new Set([
      ...Object.values(graphModel.nodes).map((n) => n.group),
      ...(graphModel.document.layoutGroups || []).map((g) => g.name),
    ]),
  ]
}

function renderGroupPanel() {
  const names = groupNamesInGraph(),
    list = $('group-checks')
  list.replaceChildren()
  for (const name of names) {
    const wrap = el('label'),
      input = el('input')
    input.type = 'checkbox'
    input.checked = !hiddenGroups.has(name)
    input.onchange = () => {
      if (input.checked) hiddenGroups.delete(name)
      else hiddenGroups.add(name)
      let expand = false
      for (const flow of graphModel.document.subflows || []) {
        if (expandedFlows.has(flow.id)) continue
        const isolated = hiddenGroups.has(graphModel.nodes[flow.parent].group)
        if (
          Object.values(graphModel.nodes).some(
            (n) =>
              sheetFor(n.id) === flow.id &&
              !hiddenGroups.has(n.group) &&
              (isolated || (input.checked && n.group === name)),
          )
        ) {
          expandedFlows.add(flow.id)
          expand = true
        }
      }
      if (expand) draw()
      syncGroups()
      if (names.filter((g) => !hiddenGroups.has(g)).length === 1) fitVisible()
    }
    wrap.dataset.endpoint = groupKey(name)
    wrap.append(input, document.createTextNode(name))
    list.append(wrap)
  }
}

function fitVisible() {
  const items = diagramState.instances.filter((i) => !hiddenGroups.has(graphModel.nodes[i.id].group))
  if (!items.length) return
  const x = Math.min(...items.map((i) => i.x)),
    y = Math.min(...items.map((i) => i.y))
  const w = Math.max(...items.map((i) => i.x + i.w)) - x,
    h = Math.max(...items.map((i) => i.y + i.h)) - y
  const r = canvas.getBoundingClientRect(),
    z = Math.max(0.005, Math.min(1, (r.width - 50) / Math.max(1, w), (r.height - 85) / Math.max(1, h)))
  tweenView((r.width - w * z) / 2 - x * z, (r.height - h * z) / 2 - y * z, z)
}

function syncGroups() {
  syncFrameControls()
  for (const box of $('paths').querySelectorAll('.style-group-frame'))
    box.classList.toggle('group-off', hiddenGroups.has(box.dataset.layoutGroup))
  const hide = (i) => hiddenGroups.has(graphModel.nodes[i.id].group)
  let shown = 0
  for (const i of diagramState.instances) {
    const hidden = hide(i)
    diagramState.domNodes.get(i.key)?.classList.toggle('group-off', hidden)
    if (!hidden) shown++
  }
  for (const v of diagramState.edgeViews)
    v.group.classList.toggle('group-off', hide(v.from) || hide(v.to))
  for (const outline of $('paths').querySelectorAll('.flow-outline')) {
    const host = diagramState.instances.find((i) => i.inlineFlow?.id === outline.dataset.flow)
    outline.classList.toggle('group-off', !host || hide(host))
  }
  if (
    (selectionState.editTarget?.node &&
      hiddenGroups.has(graphModel.nodes[selectionState.editTarget.node]?.group)) ||
    (selectionState.editTarget?.edge &&
      [selectionState.editTarget.edge.from, selectionState.editTarget.edge.to].some((id) =>
        hiddenGroups.has(graphModel.nodes[id]?.group),
      ))
  )
    setEditTarget(null)
  diagramState.hoverTrace = null
  diagramState.focusTrace = null
  updateTrace()
  $('visible-count').textContent =
    shown + ' 個可見節點 / ' + Object.keys(graphModel.nodes).length + ' 個流程節點'
  const names = groupNamesInGraph(),
    enabled = names.filter((g) => !hiddenGroups.has(g)).length
  $('group-status').textContent = enabled + ' / ' + names.length + ' 組'
  $('group-toggle').textContent = enabled === names.length ? '排版群組' : '排版群組 · ' + enabled
  $('group-empty').hidden = shown > 0 || !diagramState.instances.length
}

function releaseNarrowCanvas() {
  if (
    matchMedia('(max-width:850px)').matches &&
    (!$('group-panel').hidden || !$('legend-panel').hidden)
  ) {
    $('inspector').classList.remove('open')
    mobileNav(false)
  }
}

function initGroupTools() {
  matchMedia('(max-width:850px)').addEventListener('change', releaseNarrowCanvas)
  $('canvas-delete').onclick = deleteEditTarget
  $('group-toggle').onclick = () => {
    const p = $('group-panel')
    p.hidden = !p.hidden
    $('group-toggle').setAttribute('aria-expanded', String(!p.hidden))
    releaseNarrowCanvas()
  }
  function showAll(on) {
    hiddenGroups.clear()
    if (!on) for (const name of groupNamesInGraph()) hiddenGroups.add(name)
    renderGroupPanel()
    syncGroups()
  }
  $('groups-all').onclick = () => showAll(true)
  $('groups-none').onclick = () => showAll(false)
  $('empty-all').onclick = () => showAll(true)
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.node-picker')) selectionState.closeCurrentPicker?.()
  })
}

export {
  fitVisible,
  groupNamesInGraph,
  hiddenGroups,
  initGroupTools,
  releaseNarrowCanvas,
  renderGroupPanel,
  syncGroups,
}
