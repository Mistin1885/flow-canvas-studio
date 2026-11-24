// Only announce an existing node when its form opens, changes target, or closes.
export function nodePresence(win: Window, send: (node: string | null) => void) {
  const dialog = win.document.querySelector<HTMLDialogElement>('#node-editor')!
  const id = win.document.querySelector<HTMLInputElement>('#node-id')!
  const hint = win.document.getElementById('node-presence')!
  let previous: string | null = null
  const current = () => dialog.open && id.readOnly ? id.value : null
  function clear() {
    hint.hidden = true
    hint.textContent = ''
  }
  function update() {
    const node = current()
    if (node === previous) return
    previous = node
    clear()
    send(node)
  }
  const observer = new MutationObserver(update)
  observer.observe(dialog, { attributes: true, attributeFilter: ['open'] })
  win.addEventListener('studio-edit-target', update)
  return {
    connected() {
      previous = current()
      if (previous) send(previous)
    },
    clear,
    receive(node: string | null, editors: string[]) {
      if (!node || node !== current() || !editors.length) return clear()
      hint.textContent = editors.join('、') + ' 也正在編輯此節點'
      hint.hidden = false
    },
    close() {
      observer.disconnect()
      win.removeEventListener('studio-edit-target', update)
      clear()
    },
  }
}
