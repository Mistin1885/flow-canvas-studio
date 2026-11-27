import { bindColorPalette } from '../appearance/colorPalette.js'
import { categoryDraft } from '../categories/editor.js'
import { optionGraph } from '../options/draft.js'
import { $, el } from '../ui/dom.js'
import { badgeChip } from './chip.js'
import { defaultBadge, validBadgeName } from './model.js'

let placements, changedStyles
const catalog = () => ({ ...optionGraph().badgeStyles, ...changedStyles })

function currentStyle() {
  return { color: $('badge-color').value, style: $('badge-style').value, icon: $('badge-icon').value }
}

function preview() {
  $('badge-preview').replaceChildren(badgeChip($('badge-name').value.trim() || '標籤預覽', currentStyle()))
}

function render() {
  const styles = catalog()
  $('badge-picker').replaceChildren(new Option('選擇已有的標籤', ''),
    ...Object.keys(styles).map(name => new Option(name, name)))
  const rows = $('badge-assignments')
  rows.replaceChildren()
  for (const [name, side] of Object.entries(placements)) {
    const row = el('div', 'badge-assignment'), position = el('select')
    position.ariaLabel = name + '的位置'
    position.append(new Option('上方', 'top'), new Option('下方', 'bottom'))
    position.value = side
    position.onchange = () => { placements[name] = position.value }
    const remove = el('button', '', '從此節點移除')
    remove.type = 'button'
    remove.ariaLabel = '移除標籤 ' + name
    remove.onclick = () => { delete placements[name]; render() }
    const styleButton = el('button', 'badge-style-button')
    styleButton.type = 'button'
    styleButton.dataset.badgeStyle = name
    styleButton.ariaLabel = styleButton.title = '編輯共用樣式 ' + name
    styleButton.append(badgeChip(name, styles[name]))
    row.append(styleButton, position, remove)
    rows.append(row)
  }
}

function editStyle(name = '', spec = defaultBadge) {
  $('badge-style-editor').hidden = false
  $('badge-name').readOnly = !!name
  $('badge-name').value = name
  $('badge-color').value = spec.color
  const graph = optionGraph()
  bindColorPalette($('badge-color'), $('badge-color-palette'),
    { ...graph, badgeStyles: catalog(), customCategories: [...(graph.customCategories || []), ...categoryDraft.items] }, '標籤顏色')
  $('badge-icon').value = spec.icon
  $('badge-style').value = spec.style
  $('badge-style-apply').textContent = name ? '更新共用樣式' : '建立並加入'
  $('badge-message').textContent = name ? '樣式會套用到此畫布使用這個標籤的所有節點。' : ''
  preview()
}

export function badgeDraft() {
  const edit = $('badge-style-editor').hidden ? null : {
    name: $('badge-name').value, existing: $('badge-name').readOnly, ...currentStyle(),
  }
  return { placements: { ...placements }, styles: { ...changedStyles }, edit }
}

export function showBadges(node, saved) {
  placements = { ...(saved?.placements ?? node.badges) }
  changedStyles = { ...saved?.styles }
  $('badge-style-editor').hidden = true
  $('badge-message').textContent = ''
  render()
  if (saved?.edit) {
    editStyle(saved.edit.existing ? saved.edit.name : '', saved.edit)
    $('badge-name').value = saved.edit.name
    preview()
  }
}

export function saveBadges(graph, node, before) {
  if (Object.keys(changedStyles).length) graph.badgeStyles = { ...graph.badgeStyles, ...changedStyles }
  if (JSON.stringify(placements) !== JSON.stringify(before.placements)) node.badges = { ...placements }
}

function finishStyle() {
  const name = $('badge-name').value.trim()
  if (!validBadgeName(name) || (!$('badge-name').readOnly && Object.hasOwn(catalog(), name))) {
    $('badge-message').textContent = '請輸入有效且未使用的標籤名稱（最多 32 字）。'
    $('badge-name').focus()
    return false
  }
  changedStyles[name] = currentStyle()
  if (!$('badge-name').readOnly) placements[name] = 'top'
  $('badge-style-editor').hidden = true
  $('badge-message').textContent = ''
  render()
  return true
}

export function finishBadgeEditor() {
  if (!$('badge-style-editor').hidden && !finishStyle()) throw Error('請完成或取消醒目標籤編輯。')
}

export function bindBadges() {
  $('badge-picker').onchange = () => {
    const name = $('badge-picker').value
    if (name) {
      if (!Object.hasOwn(placements, name)) placements[name] = 'top'
      render()
    }
  }
  $('badge-new').onclick = () => { editStyle(); $('badge-name').focus() }
  $('badge-assignments').addEventListener('click', event => {
    const button = event.target.closest('[data-badge-style]')
    if (button) editStyle(button.dataset.badgeStyle, catalog()[button.dataset.badgeStyle])
  })
  $('badge-style-editor').addEventListener('input', preview)
  $('badge-style-apply').onclick = finishStyle
  $('badge-style-cancel').onclick = () => {
    $('badge-style-editor').hidden = true
    $('badge-message').textContent = ''
  }
}
