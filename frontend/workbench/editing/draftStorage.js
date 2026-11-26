let scope
export function setDraftScope(user, canvas) { scope = JSON.stringify([user, canvas]) }
function draftPrefix() { return 'flow-form:' + scope + ':' }
export function targetKey(nodeForm) { return draftPrefix() + JSON.stringify([nodeForm.adding, nodeForm.node, nodeForm.parent]) }
export function read(key) { try { return JSON.parse(localStorage.getItem(key)) } catch { return null } }

export function keys() {
  const list = [], prefix = draftPrefix()
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(prefix) && !key.endsWith(':base')) list.push(key)
  }
  return list
}

export function remove(key) {
  if (!key) return
  const shared = read(key)?.baseKey
  localStorage.removeItem(key)
  localStorage.removeItem(key + ':base')
  if (shared && !keys().some(k => read(k)?.baseKey === shared)) localStorage.removeItem(shared)
}

// Forms at the same canvas revision share their baseline. Access the full graph only on the
// first meaningful edit, and compare once in case a concurrent save used the same revision.
export function storeBase(base) {
  const canonical = 'flow-form-base:' + scope + ':' + base.canvas.rev
  const json = JSON.stringify(base)
  const previous = localStorage.getItem(canonical)
  if (previous === json) return canonical
  const key = previous === null ? canonical : canonical + ':' + crypto.randomUUID()
  localStorage.setItem(key, json)
  return key
}
