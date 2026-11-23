const displayState = {}

const displayDefaults = { reading: 0, cursor: 0, highlight: 0, glow: 0, color: 'cyan' }

function cleanDisplayPrefs(value) {
  const p = { ...displayDefaults }
  for (const k of ['reading', 'cursor', 'highlight', 'glow'])
    p[k] = Math.max(0, Math.min(k === 'cursor' ? 2 : 3, Math.round(Number(value?.[k]) || 0)))
  if (['cyan', 'yellow', 'pink'].includes(value?.color)) p.color = value.color
  return p
}

const studioFrame = window.parent !== window && new URLSearchParams(location.search).has('studio')

const embeddedPrefs = JSON.parse(document.getElementById('display-preferences').textContent)

const prefKey = studioFrame
  ? 'flow-studio:canvas-view'
  : 'dfx-display-' + (embeddedPrefs.copyId || 'default')

displayState.prefs = cleanDisplayPrefs(embeddedPrefs)

try {
  const saved = !studioFrame && localStorage.getItem(prefKey)
  if (saved) displayState.prefs = cleanDisplayPrefs(JSON.parse(saved))
} catch {}

export { cleanDisplayPrefs, displayDefaults, displayState, embeddedPrefs, prefKey, studioFrame }
