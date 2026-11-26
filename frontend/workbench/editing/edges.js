import { reconcileEdgeReviews, updateEdge } from '../graph/edgeMutation.js'
import { readableInk } from '../appearance/contrast.js'
import { editState } from './state.js'
import { $, el } from '../ui/dom.js'

import { endpointControls } from './selection.js'
import { graphModel } from '../graph/model.js'
import { exportGraph } from '../io/graph.js'
import { replaceGraph } from '../graph/replace.js'
import { say } from '../ui/toast.js'

function labelColor(e) {
  return (
    e.conditionColor ||
    (/^(yes|pass)$/i.test(e.label) ? '#247148' : /^(no|fail)\b/i.test(e.label) ? '#a34935' : '#476a91')
  )
}

function openEdge(from, to, edge) {
  if ($('line-dialog').open) return
  editState.edgeDraft = { from, to, edge }
  endpointControls(from, to)
  $('edge-heading').textContent = edge ? '編輯連線' : '建立連線'
  $('edge-endpoints').textContent = '可連接節點、原圖外框、排版群組或子流程。'
  const layout = edge?.wireLayout
  $('line-reset-layout').checked = false
  $('line-reset-row').hidden = !layout
  for (const key of ['start', 'end']) {
    const control = $('line-' + key + '-side')
    control.disabled = false
    control.value = layout?.[key] || ''
  }
  $('line-reset-layout').onchange = () => {
    for (const key of ['start', 'end']) {
      const control = $('line-' + key + '-side')
      control.disabled = $('line-reset-layout').checked
      control.value = control.disabled ? '' : layout?.[key] || ''
    }
  }
  $('line-text').value = edge?.label || ''
  $('line-color').value = labelColor(edge || { label: '' })
  $('line-auto').checked = !edge?.conditionColor
  $('line-error').textContent = ''
  const palette = $('line-palette')
  palette.replaceChildren()
  const used = new Set()
  for (const e of [...graphModel.edges, ...(graphModel.document.groupLinks || [])]) {
    if (!e.label && !e.conditionColor) continue
    const label = e.label || '',
      color = labelColor(e).toLowerCase(),
      key = JSON.stringify([label, color])
    if (used.has(key)) continue
    used.add(key)
    const b = el('button', 'color-chip', label || '無條件文字')
    b.type = 'button'
    b.style.backgroundColor = color
    b.style.color = readableInk(color)
    b.title = b.ariaLabel = '套用 ' + (label || '無條件文字') + ' · ' + color
    b.onclick = () => {
      $('line-text').value = label
      $('line-color').value = color
      $('line-auto').checked = false
    }
    palette.append(b)
  }
  if (!used.size) palette.append(el('small', 'source-meta', '尚無已使用的條件'))
  $('line-dialog').showModal()
  $('line-text').focus()
}

function saveEdge() {
  const from = $('edge-from-control').value,
    to = $('edge-to-control').value,
    old = editState.edgeDraft.edge
  if (!from || !to || (from === to && !(old?.from === from && old.to === to)))
    throw Error('請選擇兩個不同的端點。')
  const g = exportGraph(),
    normal = !!(graphModel.nodes[from] && graphModel.nodes[to])
  const oldIndex = old ? graphModel.edges.indexOf(old) : -1
  const owner = oldIndex >= 0 ? g.edges : g.groupLinks
  const oldPos = oldIndex >= 0 ? oldIndex : (graphModel.document.groupLinks || []).indexOf(old)
  if (old && oldPos < 0) throw Error('連線已更新，請重新選取。')
  const e = old ? owner.splice(oldPos, 1)[0] : { from, to, kind: 'next', dashed: false, label: '' }
  updateEdge(e, { from, to, kind: e.kind, label: $('line-text').value.trim() })
  const layout = $('line-reset-layout').checked ? {} : { ...e.wireLayout }
  for (const key of ['start', 'end']) {
    const side = $('line-' + key + '-side').value
    if (side !== layout[key]) delete layout[key + 'Ratio']
    if (side) layout[key] = side
    else delete layout[key]
  }
  if (Object.keys(layout).length) e.wireLayout = layout
  else delete e.wireLayout
  if ($('line-auto').checked) delete e.conditionColor
  else e.conditionColor = $('line-color').value
  for (const key of [from, to])
    if (key.startsWith('group:') && !g.layoutGroups?.some((r) => r.name === key.slice(6)))
      (g.layoutGroups ??= []).push({ name: key.slice(6), direction: 'auto' })
  const dest = normal ? g.edges : (g.groupLinks ??= [])
  if (old && dest === owner) dest.splice(oldPos, 0, e)
  else dest.push(e)
  reconcileEdgeReviews(g)
  replaceGraph(g, { keepView: true })
  $('line-dialog').close()
  say(old ? '已更新連線' : '已建立連線')
}

export { labelColor, openEdge, readableInk, saveEdge }
