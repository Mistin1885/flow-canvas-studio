import { suggestNodeId } from '../graph/nodeIds.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { $, el } from '../ui/dom.js'
import { flowKey, frameObjects, getMembers } from './membership.js'
import { graphModel } from '../graph/model.js'

import { sheetFor } from '../diagram/visibleGraph.js'
import { exportGraph } from '../io/graph.js'
import { editFrameObject, packSourceSteps, relatedLinks } from './mutations.js'
import { replaceGraph } from '../graph/replace.js'
import { say } from '../ui/toast.js'

function editMembers(initial) {
  const dialog = $('members-dialog'),
    picker = $('member-object'),
    objects = frameObjects()
  picker.replaceChildren(...objects.map(([id, label]) => new Option(label, id)))
  picker.value = objects.some(([id]) => id === initial) ? initial : objects[0][0]
  let key, ids, draft, dirty
  const type = () => (key.startsWith('group:') ? 'group' : key.startsWith('flow:') ? 'flow' : 'source')
  function refresh() {
    const rows = $('member-chosen'),
      options = $('member-options')
    rows.replaceChildren()
    options.replaceChildren()
    $('member-count').textContent = ids.length
    $('member-apply').disabled = !dirty
    picker.disabled = dirty
    $('frame-actions').hidden = dirty
    $('member-links').hidden = dirty
    const make = (id, actions) => {
      const row = el('div', 'member-row'),
        n = draft.nodes[id]
      row.append(el('span', '', n.title + ' · ' + id))
      for (const [text, title, fn, disabled] of actions) {
        const b = el('button', '', text)
        b.ariaLabel = title + ' ' + n.title
        b.title = title
        b.disabled = !!disabled
        b.onclick = () => {
          fn()
          dirty = true
          $('member-error').textContent = ''
          refresh()
        }
        row.append(b)
      }
      return row
    }
    ids.forEach((id, k) =>
      rows.append(
        make(id, [
          [
            '↑',
            '上移',
            () => {
              ;[ids[k - 1], ids[k]] = [id, ids[k - 1]]
            },
            k === 0,
          ],
          [
            '↓',
            '下移',
            () => {
              ;[ids[k + 1], ids[k]] = [id, ids[k + 1]]
            },
            k === ids.length - 1,
          ],
          [
            '−',
            '移出',
            () => {
              ids.splice(k, 1)
              if (!graphModel.nodes[id]) delete draft.nodes[id]
            },
          ],
        ]),
      ),
    )
    const q = $('member-search').value.trim().toLowerCase()
    for (const n of Object.values(draft.nodes)) {
      if (ids.includes(n.id) || !(n.title + ' ' + n.id).toLowerCase().includes(q)) continue
      if (type() === 'source' && (isFrameNode(n) || sheetFor(n.id) !== sheetFor(key))) continue
      if (
        type() === 'flow' &&
        (isFrameNode(n) ||
          graphModel.document.subflows.some((f) => f.parent === n.id) ||
          sheetFor(n.id) !== 'project')
      )
        continue
      options.append(make(n.id, [['＋', '加入', () => ids.push(n.id)]]))
    }
    if (!rows.children.length) rows.append(el('p', 'member-note', '框內尚無步驟'))
    if (!options.children.length) options.append(el('p', 'member-note', '沒有符合的步驟'))
  }
  function load() {
    key = picker.value
    ids = getMembers(key).slice()
    draft = exportGraph()
    dirty = false
    $('pack-label').hidden = type() !== 'source' || sheetFor(key) !== 'project'
    $('member-pack').checked = true
    $('frame-actions').open = false
    $('object-name').value =
      type() === 'group'
        ? key.slice(6)
        : type() === 'flow'
          ? graphModel.document.subflows.find((f) => flowKey(f.id) === key).title
          : graphModel.nodes[key].title
    $('object-type').value = type()
    $('frame-remove').textContent =
      type() === 'source'
        ? '移除外框及外框連線'
        : type() === 'group'
          ? '解散群組及移除群組連線'
          : '展平子流程及移除子流程連線'
    const links = relatedLinks(key, true)
    $('member-links').replaceChildren(...(links ? [links] : []))
    $('member-search').value = $('member-new').value = $('member-error').textContent = ''
    $('member-rule').textContent =
      {
        source: '調整外框包含的步驟與詳情清單順序。外框會包住成員。',
        group: '加入會更改該節點的排版群組。移出會歸到「未分組」。順序用於成員清單。',
        flow: '加入的步驟會在展開此子流程時顯示。移出後回到專案畫布。清單首項為入口。',
      }[type()] + ' 成員順序不會建立箭頭。'
    refresh()
  }
  for (const [id, action] of [
    ['frame-create', 'create'],
    ['frame-rename', 'rename'],
    ['frame-remove', 'remove'],
  ])
    $(id).onclick = () => {
      try {
        editFrameObject(key, action, $('object-type').value, $('object-name').value.trim())
      } catch (e) {
        $('member-error').textContent = e.message
      }
    }
  $('member-search').oninput = refresh
  picker.onchange = load
  $('member-create').onclick = () => {
    const title = $('member-new').value.trim()
    if (!title) {
      $('member-new').focus()
      return
    }
    const memberType = type() === 'flow' ? 'shared' : 'action'
    const id = suggestNodeId(memberType, draft.nodes)
    draft.nodes[id] = {
      id,
      type: memberType,
      title,
      group:
        type() === 'group'
          ? key.slice(6)
          : type() === 'flow'
            ? graphModel.document.subflows.find((f) => flowKey(f.id) === key).title
            : '未分組',
      sheetId: 'project',
      decision: false,
      content: [],
      tags: [],
      description: '',
    }
    if (type() === 'source') draft.nodes[id].sheetId = sheetFor(key)
    ids.push(id)
    dirty = true
    $('member-new').value = ''
    refresh()
  }
  $('member-apply').onclick = () => {
    try {
      const old = getMembers(key),
        kind = type()
      if (kind === 'source') draft.nodes[key].frameMembers = [...ids]
      else if (kind === 'group') {
        const name = key.slice(6)
        for (const id of new Set([...old, ...ids])) {
          const n = draft.nodes[id]
          if (graphModel.nodes[id]) n.sheetId = sheetFor(id)
          n.group = ids.includes(id) ? name : name === '未分組' ? '其他步驟' : '未分組'
        }
        let record = (draft.layoutGroups ??= []).find((x) => x.name === name)
        if (!record) {
          record = { name, direction: 'auto' }
          draft.layoutGroups.push(record)
        }
        record.memberOrder = [...ids]
      } else {
        if (!ids.length) throw Error('子流程需要至少一個入口步驟。')
        const f = draft.subflows.find((f) => flowKey(f.id) === key)
        for (const n of Object.values(graphModel.nodes))
          if (n.sourceKind === 'subflow') draft.nodes[n.id].sheetId = sheetFor(n.id)
        for (const id of new Set([...old, ...ids])) {
          const n = draft.nodes[id]
          n.sheetId = ids.includes(id) ? f.id : 'project'
          delete n.layoutOffset
        }
        f.root = ids[0]
        f.memberOrder = [...ids]
        for (const n of Object.values(draft.nodes))
          if (n.frameMembers) n.frameMembers = n.frameMembers.filter((id) => !ids.includes(id))
      }
      replaceGraph(draft, { keepView: true })
      if (kind === 'source' && sheetFor(key) === 'project' && ids.length && $('member-pack').checked) {
        const arranged = exportGraph()
        packSourceSteps(arranged, key, ids)
        replaceGraph(arranged, { keepView: true, record: false })
      }
      dialog.close()
      say('已更新框內步驟，可復原')
    } catch (e) {
      $('member-error').textContent = e.message
    }
  }
  $('members-close').onclick = $('member-cancel').onclick = () => dialog.close()
  load()
  dialog.showModal()
}

export { editMembers }
