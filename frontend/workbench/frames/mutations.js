import { applyOptionEdit, ungrouped, validateName } from '../options/catalog.js'
import { moveToSheet } from '../graph/nodeSheet.js'
import { addNode } from '../graph/addNode.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { diagramState } from '../diagram/state.js'

import { graphModel } from '../graph/model.js'
import { gridPlacement } from '../layout/grid.js'
import { $, el } from '../ui/dom.js'
import { flowKey, groupKey, objectName } from './membership.js'
import { openEdge } from '../editing/edges.js'
import { exportGraph } from '../io/graph.js'
import { groupNamesInGraph } from '../groups/visibility.js'
import { sheetFor } from '../diagram/visibleGraph.js'
import { removeGraphNode } from '../graph/removeNode.js'
import { replaceGraph } from '../graph/replace.js'
import { say } from '../ui/toast.js'
import { editMembers } from './memberDialog.js'

function packSourceSteps(graph, frameId, ids) {
  const frame = diagramState.instanceMap.get(frameId)
  const members = ids.map((id) => diagramState.instanceMap.get(id)).filter(Boolean)
  if (!members.length || !frame) return
  const step = 20 * diagramState.readingScale,
    pad = step * 2,
    round = (v) => Math.ceil(v / step) * step
  const columns = members.length > 4 ? 2 : 1,
    widths = Array(columns).fill(0),
    slots = []
  let y = pad
  for (let k = 0; k < members.length; k += columns) {
    let height = 0
    for (let c = 0; c < columns && k + c < members.length; c++) {
      const i = members[k + c],
        box = i.inlineFlow || i
      widths[c] = Math.max(widths[c], round(box.w))
      height = Math.max(height, round(box.h))
      slots.push({ i, box, c, y })
    }
    y += height + pad
  }
  const blocked = diagramState.instances
    .filter((i) => i.scope === 'project' && !isFrameNode(graphModel.nodes[i.id]) && !ids.includes(i.id))
    .map((i) => i.inlineFlow || i)
  const width = widths.reduce((sum, w) => sum + w + pad, pad)
  const base = gridPlacement(frame.x, frame.y, width, y, blocked)
  let serial = Math.max(0, ...Object.values(graph.nodes).map((n) => n.layoutOrder || 0))
  for (const { i, box, c, y: dy } of slots) {
    const x = base.x + pad + (c ? widths[0] + pad : 0),
      y = base.y + dy,
      old = i.appliedOffset || { x: 0, y: 0 }
    const n = graph.nodes[i.id]
    delete n.layoutPosition
    n.layoutOffset = {
      x: old.x + (x - box.x) / diagramState.readingScale,
      y: old.y + (y - box.y) / diagramState.readingScale,
    }
    n.layoutOrder = ++serial
  }
}

function relatedLinks(key, includeNormal = false) {
  const matches = [
    ...(includeNormal ? graphModel.edges : []),
    ...(graphModel.document.groupLinks || []),
  ].filter((e) => e.from === key || e.to === key)
  const box = el('details', 'incoming-details')
  box.append(el('summary', '', '相關連線 · ' + matches.length))
  const list = el('div', 'branch-list')
  for (const e of matches) {
    const b = el(
      'button',
      '',
      objectName(e.from) + ' → ' + objectName(e.to) + (e.label ? ' · ' + e.label : ''),
    )
    b.onclick = () => {
      if ($('members-dialog').open) $('members-dialog').close()
      openEdge(e.from, e.to, e)
    }
    list.append(b)
  }
  box.append(list)
  return matches.length ? box : null
}

function editFrameObject(key, action, kind, name) {
  const g = exportGraph(),
    group = key.startsWith('group:'),
    flow = key.startsWith('flow:')
  const names = groupNamesInGraph(),
    flows = g.subflows || [],
    label = group
      ? key.slice(6)
      : flow
        ? flows.find((f) => flowKey(f.id) === key).title
        : g.nodes[key].title
  const newId = (prefix) => {
    let k = 1
    while (g.nodes[prefix + k] || flows.some((f) => f.id === prefix + k)) k++
    return prefix + k
  }
  const node = (id, title) => ({
    id,
    title,
    group: '未分組',
    sheetId: 'project',
    decision: false,
    description: '',
    tags: [],
    content: [],
  })
  if (action !== 'remove' && !name) throw Error('請輸入名稱。')
  if (action === 'create') {
    if (kind === 'group') {
      validateName('group', null, name, names)
      ;(g.layoutGroups ??= []).push({ name, direction: 'auto', nodeStyle: { frame: 'on' } })
      key = groupKey(name)
    } else if (kind === 'source') {
      const id = newId('FRAME')
      addNode(g, { ...node(id, name), sourceKind: 'container', type: 'frame', frameMembers: [] })
      key = id
    } else {
      const id = newId('FLOW'),
        parent = newId('HOST'),
        root = newId('STEP')
      addNode(g, node(parent, name))
      addNode(g, { ...node(root, '第一個步驟'), sheetId: id })
      ;(g.subflows ??= []).push({ id, title: name, parent, root, memberOrder: [root] })
      key = flowKey(id)
    }
  } else if (group) {
    const to = action === 'remove' ? null : name
    validateName('group', label, to, names)
    applyOptionEdit(g, { kind: 'group', from: label, to })
    key = groupKey(to ?? ungrouped)
  } else if (flow) {
    const f = flows.find((f) => flowKey(f.id) === key)
    if (action === 'rename') {
      if (g.nodes[f.parent].title === f.title) g.nodes[f.parent].title = name
      f.title = name
    } else {
      for (const n of Object.values(g.nodes)) {
        if (sheetFor(n.id) === f.id) moveToSheet(n, f.id, 'project')
        if (n.subflowId === f.id) delete n.subflowId
      }
      g.subflows = flows.filter((r) => r !== f)
      if (g.groupLinks) g.groupLinks = g.groupLinks.filter((e) => e.from !== key && e.to !== key)
    }
  } else if (action === 'rename') {
    g.nodes[key].title = name
  } else removeGraphNode(g, key)
  replaceGraph(g, { keepView: true, optionEdits: group && action !== 'create'
    ? [{ kind: 'group', from: label, to: action === 'remove' ? null : name }] : undefined })
  $('members-dialog').close()
  say('已更新畫布物件，可復原')
  if (action !== 'remove') editMembers(key)
}

export { editFrameObject, packSourceSteps, relatedLinks }
