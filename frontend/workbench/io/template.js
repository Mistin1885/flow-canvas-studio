// Capture pristine markup before the workbench installs controls or renders a graph.
const template = document.documentElement.cloneNode(true)

export function portableDocument() {
  const copy = template.cloneNode(true)
  const script = copy.querySelector('#workbench-runtime[src]')
  if (script) {
    // startWorkbench encloses the complete build (see build/workbench.js).
    script.removeAttribute('src')
    script.textContent =
      '(' + import.meta.workbenchRuntime.toString().replace(/<\/script/gi, '<\\/script') + ')();'
    const style = document.createElement('style')
    const sheet = document.getElementById('workbench-styles').sheet
    style.textContent = Array.from(sheet.cssRules, (rule) => rule.cssText).join('\n')
    copy.querySelector('#workbench-styles').replaceWith(style)
  }
  return copy
}
