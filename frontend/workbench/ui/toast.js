import { diagramState } from '../diagram/state.js'
import { $ } from './dom.js'

function say(t) {
  clearTimeout(diagramState.toastTimer)
  $('toast').textContent = t
  $('toast').hidden = false
  diagramState.toastTimer = setTimeout(() => ($('toast').hidden = true), 2800)
}

export { say }
