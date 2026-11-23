import { diagramState } from './diagram/state.js'
import { initStyleEditor } from './appearance/styleDialog.js'
import { initGraphTools } from './editing/tools.js'
import { initLegend } from './categories/controls.js'
import { $, el } from './ui/dom.js'
import { go, rebuildGraphNavigation, select, showStart } from './diagram/navigation.js'
import { prefKey, studioFrame } from './display/preferences.js'
import { applyNavigation, applyTheme } from './display/workspace.js'
import { draw } from './diagram/render.js'
import { startId } from './diagram/visibleGraph.js'
import { graphModel } from './graph/model.js'

const pages = [...document.querySelectorAll('[data-diagram-page]')]

const tabBar = $('diagram-tabs')

function mobileNav(open) {
  document.body.classList.toggle('mobile-nav-open', open)
  $('mobile-nav').setAttribute('aria-expanded', String(open))
}

const initialTarget = location.hash.slice(1)

function openWorkbench() {
  window.addEventListener('beforeunload', (e) => {
    if (diagramState.debugDirty && window === window.parent) {
      e.preventDefault()
      e.returnValue = ''
    }
  })
  initStyleEditor()
  initGraphTools()
  initLegend()
  if (pages.length > 1) {
    tabBar.hidden = false
    const activate = (page) => {
      for (const p of pages) p.hidden = p !== page
      for (const b of tabBar.children)
        b.setAttribute('aria-pressed', String(b.dataset.page === page.dataset.diagramPage))
    }
    for (const page of pages) {
      const b = el('button', '', page.dataset.pageTitle)
      b.dataset.page = page.dataset.diagramPage
      b.onclick = () => activate(page)
      tabBar.append(b)
    }
    activate(pages[0])
  }
  rebuildGraphNavigation()
  $('mobile-nav').onclick = () => mobileNav(!document.body.classList.contains('mobile-nav-open'))
  $('navigation').addEventListener('click', (e) => {
    if (e.target.closest('[data-nav]')) mobileNav(false)
  })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') mobileNav(false)
  })
  try {
    const saved = JSON.parse(localStorage.getItem(prefKey + '-workspace') || 'null')
    if (saved) {
      if (
        !studioFrame &&
        saved.themePreferenceVersion === 2 &&
        (saved.theme === 'dark' || saved.theme === 'light')
      )
        diagramState.theme = saved.theme
      if (typeof saved.navCollapsed === 'boolean') diagramState.navCollapsed = saved.navCollapsed
      if (Number.isFinite(saved.panelWidth) && saved.panelWidth >= 280)
        diagramState.panelWidth = saved.panelWidth
    }
  } catch {}
  applyTheme()
  applyNavigation()
  draw()
  diagramState.selected = diagramState.instanceMap.get(startId())
  if (diagramState.selected) select(diagramState.selected.key)
  $('inspector').classList.remove('open')
  requestAnimationFrame(() => {
    if (graphModel.nodes[initialTarget] && initialTarget !== startId()) go(initialTarget)
    else showStart()
  })
}

export { mobileNav, openWorkbench }
