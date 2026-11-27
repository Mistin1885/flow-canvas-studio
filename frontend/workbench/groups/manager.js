import { $ } from '../ui/dom.js'
import { graphModel } from '../graph/model.js'
import { exportGraph } from '../io/graph.js'
import { replaceGraph } from '../graph/replace.js'
import { applyOptionEdit, reservedOption, validateName } from '../options/catalog.js'
import { say } from '../ui/toast.js'

// Groups classify nodes and control layout. They are never canvas containers or endpoints.
export function initGroupManager() {
  const dialog = $('groups-dialog'), picker = $('group-manager-target'), name = $('group-manager-name')
  const direction = $('group-manager-direction')
  const names = () => [...new Set([
    ...(graphModel.document.layoutGroups || []).map(g => g.name),
    ...Object.values(graphModel.nodes).map(n => n.group),
  ])].sort()
  function refresh(selected = picker.value) {
    picker.replaceChildren(...names().map(n => new Option(n, n)))
    if ([...picker.options].some(o => o.value === selected)) picker.value = selected
    const current = picker.value, reserved = reservedOption('group', current)
    name.value = current
    name.disabled = reserved || !current
    direction.value = graphModel.document.layoutGroups?.find(g => g.name === current)?.direction || 'auto'
    direction.disabled = !current
    $('group-manager-save').disabled = !current
    $('group-manager-remove').disabled = reserved || !current
    const nodes = Object.values(graphModel.nodes).filter(n => n.group === current)
    $('group-manager-impact').textContent = current
      ? `${nodes.length} 個節點使用此群組。改名會更新引用；移除後歸為「未分組」，保留節點、節點間連線與外框成員關係。`
      : '尚無排版群組，請先新增。'
    $('group-manager-error').textContent = ''
  }
  function apply(action) {
    try {
      const graph = exportGraph(), from = action === 'add' ? null : picker.value
      const to = action === 'remove' ? null : (action === 'add' ? $('group-manager-new') : name).value.trim()
      const edits = []
      if (action === 'add') {
        validateName('group', null, to, names())
        ;(graph.layoutGroups ??= []).push({ name: to, direction: 'auto' })
      } else {
        if (from !== to) {
          validateName('group', from, to, names())
          const edit = { kind: 'group', from, to }
          applyOptionEdit(graph, edit)
          edits.push(edit)
        }
        if (action !== 'remove') {
          let record = (graph.layoutGroups ??= []).find(g => g.name === to)
          if (!record) graph.layoutGroups.push(record = { name: to })
          record.direction = direction.value
        }
      }
      replaceGraph(graph, { keepView: true, optionEdits: edits })
      $('group-manager-new').value = ''
      refresh(to)
      say('已更新排版群組，可復原；外框成員關係不變。')
    } catch (error) { $('group-manager-error').textContent = error.message }
  }
  $('manage-groups').onclick = () => { refresh(); dialog.showModal() }
  picker.onchange = () => refresh()
  $('group-manager-save').onclick = () => apply('save')
  $('group-manager-add').onclick = () => apply('add')
  $('group-manager-remove').onclick = () => apply('remove')
  $('groups-close').onclick = $('groups-done').onclick = () => dialog.close()
  $('group-manager-style').onclick = () => {
    const selected = picker.value
    dialog.close()
    $('group-style-launch').click()
    $('style-target').value = selected
    $('style-target').dispatchEvent(new Event('change'))
  }
}
