import { graphModel } from '../graph/model.js'
import { pendingKnowledge } from './insert.js'
import { references, referenceIssue, proseSegments } from './references.js'
import { $ } from '../ui/dom.js'

const fields = '#node-description,#node-expect,#node-note,.block-value:not(.code-value)'
let labels = new WeakMap()
let messageId = 0

function check(field) {
  // Inline code in a text step is displayed literally by the inspector.
  const value = field.matches('.block-value')
    ? Array.from(proseSegments(field.value), part => part.code ? ' '.repeat(part.text.length) : part.text).join('')
    : field.value
  const known = labels.get(field) || new Set()
  for (const [, label] of references(value)) known.add(label)
  labels.set(field, known)
  const lookup = (id) =>
    pendingKnowledge.docs['knowledge.' + id] || graphModel.document['knowledge.' + id]
  const issue = referenceIssue(value, lookup, [...known])
  let message = field.nextElementSibling
  if (!message?.classList.contains('referenceError')) message = null
  if (!issue) {
    if (message) {
      message.remove()
      field.removeAttribute('aria-invalid')
      field.removeAttribute('aria-describedby')
      field.setCustomValidity('')
    }
    return true
  }
  if (!message) {
    message = document.createElement('small')
    message.id = 'knowledge-error-' + ++messageId
    message.className = 'referenceError'
    message.setAttribute('aria-live', 'polite')
    field.after(message)
  }
  const line = value.slice(0, issue.index).split('\n').length
  const hint = '第 ' + line + ' 行 · ' + issue.reason
  if (message.textContent !== hint) message.textContent = hint
  field.setAttribute('aria-invalid', 'true')
  field.setAttribute('aria-describedby', message.id)
  field.setCustomValidity(hint)
  return false
}

function updateButtons() {
  const invalid = !!$('node-form').querySelector('.referenceError')
  $('node-form').querySelector('[type="submit"]').disabled = invalid
  $('new-node').disabled = invalid
}

export function validateReferences() {
  const form = $('node-form')
  for (const field of form.querySelectorAll(fields)) check(field)
  updateButtons()
  return !form.querySelector('.referenceError')
}

export function bindReferenceValidation() {
  const form = $('node-form')
  form.addEventListener('input', (e) => {
    if (e.target.matches(fields)) {
      check(e.target)
      updateButtons()
    }
  })
  window.addEventListener('studio-edit-target', () => {
    labels = new WeakMap()
    validateReferences()
  })
  new MutationObserver(validateReferences).observe($('content-editor'), { childList: true })
}
