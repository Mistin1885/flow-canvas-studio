import { prefKey, studioFrame } from './preferences.js'
import { diagramState } from '../diagram/state.js'
import { $ } from '../ui/dom.js'
import { centerInstance } from '../diagram/navigation.js'

function store() {
  try {
    localStorage.setItem(
      prefKey + '-workspace',
      JSON.stringify({
        rack: diagramState.rack,
        depth: diagramState.depth,
        cm: diagramState.cm,
        panelWidth: diagramState.panelWidth,
        ...(studioFrame ? {} : { theme: diagramState.theme, themePreferenceVersion: 2 }),
        navCollapsed: diagramState.navCollapsed,
      }),
    )
  } catch {}
}

function applyTheme() {
  const dark = diagramState.theme === 'dark'
  document.documentElement.dataset.theme = diagramState.theme
  $('theme-toggle').setAttribute('aria-pressed', String(dark))
  $('theme-toggle').setAttribute('aria-label', dark ? '切換淺色模式' : '切換深色模式')
  $('theme-icon').textContent = dark ? '☀' : '☾'
  $('theme-label').textContent = dark ? '淺色模式' : '深色模式'
  document.querySelector('meta[name="theme-color"]').content = dark ? '#142130' : '#edf2f6'
}

const splitter = $('inspector-resize')

let resizeStart = null

function panelBounds() {
  const w = window.innerWidth
  return {
    min: Math.min(300, w - 32),
    max:
      w <= 850
        ? Math.min(900, w - 32)
        : Math.max(
            300,
            Math.min(
              900,
              w - (diagramState.navCollapsed ? 60 : w >= 1600 ? 190 : w <= 1150 ? 145 : 176) - 320,
            ),
          ),
  }
}

function applyPanelWidth() {
  const bounds = panelBounds()
  if (diagramState.panelWidth !== null) {
    const clamped = Math.max(bounds.min, Math.min(bounds.max, diagramState.panelWidth))
    document.documentElement.style.setProperty('--detail-width', clamped + 'px')
  } else document.documentElement.style.removeProperty('--detail-width')
  const width = Math.round($('inspector').getBoundingClientRect().width)
  splitter.setAttribute('aria-valuemin', bounds.min)
  splitter.setAttribute('aria-valuemax', bounds.max)
  splitter.setAttribute('aria-valuenow', width)
  splitter.setAttribute('aria-valuetext', width + ' 像素')
}

function setPanelWidth(value) {
  const bounds = panelBounds()
  diagramState.panelWidth = Math.round(Math.max(bounds.min, Math.min(bounds.max, value)))
  applyPanelWidth()
}

function endPanelResize() {
  if (!resizeStart) return
  resizeStart = null
  document.body.classList.remove('resizing')
  store()
}

function applyNavigation() {
  document.body.classList.toggle('nav-collapsed', diagramState.navCollapsed)
  const label = diagramState.navCollapsed ? '展開左側導覽' : '收合左側導覽'
  $('nav-toggle').setAttribute('aria-label', label)
  $('nav-toggle').setAttribute('aria-expanded', String(!diagramState.navCollapsed))
  $('nav-toggle').title = label
  applyPanelWidth()
}

function bindWorkspaceControls() {
  $('theme-toggle').addEventListener('click', () => {
    diagramState.theme = diagramState.theme === 'dark' ? 'light' : 'dark'
    applyTheme()
    store()
  })
  splitter.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    e.preventDefault()
    resizeStart = { x: e.clientX, width: $('inspector').getBoundingClientRect().width }
    splitter.setPointerCapture(e.pointerId)
    document.body.classList.add('resizing')
  })
  splitter.addEventListener('pointermove', (e) => {
    if (resizeStart) setPanelWidth(resizeStart.width + resizeStart.x - e.clientX)
  })
  splitter.addEventListener('pointerup', endPanelResize)
  splitter.addEventListener('pointercancel', endPanelResize)
  splitter.addEventListener('lostpointercapture', endPanelResize)
  splitter.addEventListener('dblclick', () => {
    diagramState.panelWidth = null
    applyPanelWidth()
    store()
  })
  splitter.addEventListener('keydown', (e) => {
    const bounds = panelBounds(),
      width = $('inspector').getBoundingClientRect().width,
      step = e.shiftKey ? 64 : 24
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    setPanelWidth(
      e.key === 'Home'
        ? bounds.min
        : e.key === 'End'
          ? bounds.max
          : width + (e.key === 'ArrowLeft' ? step : -step),
    )
    store()
  })
  window.addEventListener('resize', applyPanelWidth)
  matchMedia('(max-width:850px)').addEventListener('change', () => {
    if (diagramState.selected) requestAnimationFrame(() => centerInstance(diagramState.selected))
  })
  $('nav-toggle').addEventListener('click', () => {
    diagramState.navCollapsed = !diagramState.navCollapsed
    applyNavigation()
    store()
  })
}

export { applyNavigation, applyTheme, bindWorkspaceControls }
