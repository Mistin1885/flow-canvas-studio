import { displayDefaults, displayState, prefKey, studioFrame } from './preferences.js'
import { $ } from '../ui/dom.js'
import { diagramState } from '../diagram/state.js'
import { edgeLabelCache } from '../layout/labels.js'
import { draw } from '../diagram/render.js'

const cursorDocs = new WeakMap()

const readingNames = ['標準 · 100%', '較大 · 115%', '大 · 130%', '特大 · 150%']

function setupCursorDocument(doc) {
  if (!doc?.body) return
  let state = cursorDocs.get(doc)
  if (!state) {
    const style = doc.createElement('style'),
      halo = doc.createElement('div')
    halo.className = 't1-cursor-halo'
    halo.setAttribute('aria-hidden', 'true')
    style.textContent = `.t1-cursor-halo{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none!important;display:none;border-radius:50%;box-sizing:border-box;will-change:transform}@media(any-pointer:fine){html[data-large-cursor] .canvas,html[data-large-cursor] body,html[data-large-cursor] button,html[data-large-cursor] a,html[data-large-cursor] summary,html[data-large-cursor] select,html[data-large-cursor] label{cursor:var(--large-cursor),auto}html[data-large-cursor] button,html[data-large-cursor] a,html[data-large-cursor] summary,html[data-large-cursor] input[type=range]{cursor:var(--large-pointer),pointer}html[data-large-cursor] input:not([type=range]),html[data-large-cursor] textarea,html[data-large-cursor] pre,html[data-large-cursor] code{cursor:text}html[data-large-cursor] .canvas.dragging{cursor:grabbing}}`
    doc.head.append(style)
    doc.body.append(halo)
    state = { halo, x: 0, y: 0, frame: 0, visible: false }
    cursorDocs.set(doc, state)
    const hide = () => {
      state.visible = false
      halo.style.display = 'none'
    }
    doc.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType === 'touch') {
          hide()
          return
        }
        if (!displayState.prefs.highlight && !displayState.prefs.glow) {
          hide()
          return
        }
        state.x = e.clientX
        state.y = e.clientY
        state.visible = true
        if (state.frame) return
        state.frame = doc.defaultView.requestAnimationFrame(() => {
          state.frame = 0
          if (!state.visible) return
          const host = doc.querySelector('dialog[open]') || doc.body
          if (halo.parentNode !== host) host.append(halo)
          halo.style.transform = `translate(${state.x - state.radius}px,${state.y - state.radius}px)`
          halo.style.display = 'block'
        })
      },
      { passive: true },
    )
    doc.addEventListener('pointerleave', hide)
    doc.addEventListener(
      'pointerdown',
      (e) => {
        if (e.pointerType === 'touch') hide()
      },
      { passive: true },
    )
    doc.defaultView.addEventListener('blur', hide)
    doc.addEventListener('visibilitychange', hide)
  }
  const colors = { cyan: '#00bfe7', yellow: '#ffd43b', pink: '#ff74ce' },
    color = colors[displayState.prefs.color],
    size = [0, 32, 48][displayState.prefs.cursor]
  const arrow = (fill) =>
    `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}' viewBox='0 0 32 32'><path d='M3 2 L3 25 L10 19 L15 30 L20 27 L15 17 L25 17 Z' fill='${fill}' stroke='white' stroke-width='3' stroke-linejoin='round'/><path d='M3 2 L3 25 L10 19 L15 30 L20 27 L15 17 L25 17 Z' fill='${fill}' stroke='#142130' stroke-width='1.2' stroke-linejoin='round'/></svg>`)}") 4 3`
  const root = doc.documentElement
  root.toggleAttribute('data-large-cursor', !!size)
  root.style.setProperty('--large-cursor', arrow('#ffffff'))
  root.style.setProperty('--large-pointer', arrow(color))
  const r = displayState.prefs.highlight ? [20, 20, 28, 36][displayState.prefs.highlight] : 22
  state.radius = r
  Object.assign(state.halo.style, {
    width: 2 * r + 'px',
    height: 2 * r + 'px',
    background: displayState.prefs.highlight ? color + '24' : 'transparent',
    border: displayState.prefs.highlight ? '2px solid ' + color : '0',
    boxShadow: displayState.prefs.glow
      ? `0 0 ${12 * displayState.prefs.glow}px ${4 * displayState.prefs.glow}px ${color}99,inset 0 0 12px ${color}55`
      : 'none',
  })
  if (!displayState.prefs.highlight && !displayState.prefs.glow) state.halo.style.display = 'none'
}

function updateDisplayControls() {
  for (const [id, k, names] of [
    ['reading-size', 'reading', readingNames],
    ['cursor-size', 'cursor', ['標準', '大', '特大']],
    ['cursor-highlight', 'highlight', ['關閉', '小', '中', '大']],
    ['cursor-glow', 'glow', ['關閉', '柔和', '中等', '明亮']],
  ]) {
    const input = $(id)
    input.value = displayState.prefs[k]
    input.setAttribute('aria-valuetext', names[displayState.prefs[k]])
    $(
      id === 'reading-size'
        ? 'reading-value'
        : id === 'cursor-size'
          ? 'cursor-value'
          : id === 'cursor-highlight'
            ? 'highlight-value'
            : 'glow-value',
    ).textContent = names[displayState.prefs[k]]
  }
  $('cursor-color').value = displayState.prefs.color
}

function applyDisplayPreferences(redraw = true) {
  const next = [1, 1.15, 1.3, 1.5][displayState.prefs.reading],
    changed = diagramState.readingScale !== next
  diagramState.readingScale = next
  document.documentElement.style.setProperty('--reading-scale', diagramState.readingScale)
  setupCursorDocument(document)
  updateDisplayControls()
  if (redraw && changed) {
    edgeLabelCache.clear()
    draw(diagramState.selected?.key)
  }
  requestAnimationFrame(() =>
    document.documentElement.style.setProperty(
      '--workspace-top',
      document.querySelector('.workspace-header').getBoundingClientRect().bottom + 'px',
    ),
  )
}

function saveDisplayPreferences() {
  try {
    localStorage.setItem(prefKey, JSON.stringify(displayState.prefs))
  } catch {}
  applyDisplayPreferences()
}

function bindDisplayControls() {
  $('display-settings').onclick = () => {
    $('display-dialog').showModal()
    $('reading-size').focus()
  }
  for (const id of ['display-close', 'display-done']) $(id).onclick = () => $('display-dialog').close()
  $('display-dialog').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') e.stopPropagation()
  })
  $('display-dialog').addEventListener('close', () => {
    $('display-settings').focus()
    const state = cursorDocs.get(document)
    if (state) {
      state.halo.style.display = 'none'
      document.body.append(state.halo)
    }
  })
  for (const [id, k] of [
    ['reading-size', 'reading'],
    ['cursor-size', 'cursor'],
    ['cursor-highlight', 'highlight'],
    ['cursor-glow', 'glow'],
  ])
    $(id).addEventListener('input', (e) => {
      displayState.prefs[k] = Number(e.target.value)
      saveDisplayPreferences()
    })
  $('cursor-color').onchange = (e) => {
    displayState.prefs.color = e.target.value
    saveDisplayPreferences()
  }
  $('display-reset').onclick = () => {
    displayState.prefs = { ...displayDefaults }
    saveDisplayPreferences()
  }
  if (typeof ResizeObserver !== 'undefined')
    new ResizeObserver(() =>
      document.documentElement.style.setProperty(
        '--workspace-top',
        document.querySelector('.workspace-header').getBoundingClientRect().bottom + 'px',
      ),
    ).observe(document.querySelector('.workspace-header'))
  if (studioFrame) {
    $('theme-toggle').style.display = 'none'
    $('display-settings').style.display = 'none'
  }
  applyDisplayPreferences()
}

export { applyDisplayPreferences, bindDisplayControls }
