import { moveToSheet } from '../graph/nodeSheet.js'
import { addNode } from '../graph/addNode.js'
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
  if (initial?.startsWith('group:')) return
  const dialog = $('members-dialog'),
    picker = $('member-object'),
    kind = initial?.startsWith('flow:') ? 'flow' : 'source',
    objects = frameObjects(kind)
  if (!objects.length) {
    say(kind === 'source' ? '尚無可管理的外框，請先使用「建立外框」。' : '尚無子流程，請先使用工具中的「建立子流程」。')
    return
  }
  const labels = { source: '框內步驟', flow: '子流程步驟' }
  $('members-heading').textContent = '管理' + labels[kind]
  $('member-list-title').textContent = labels[kind]
  $('members-close').ariaLabel = '關閉' + labels[kind]
  $('member-apply').textContent = '套用步驟'
  $('object-type').replaceChildren(new Option({ source: '外框', flow: '子流程' }[kind], kind))
  picker.replaceChildren(...objects.map(([id, label]) => new Option(label, id)))
  picker.value = objects.some(([id]) => id === initial) ? initial : objects[0][0]
  let key, ids, draft, dirty
  const type = () => (key.startsWith('flow:') ? 'flow' : 'source')
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
    if (!rows.children.length) rows.append(el('p', 'member-note', '尚無步驟'))
    if (!options.children.length) options.append(el('p', 'member-note', '沒有符合的步驟'))
  }
  function load() {
    key = picker.value
    ids = getMembers(key).slice()
    draft = exportGraph()
    dirty = false
    $('pack-label').hidden = type() !== 'source' || sheetFor(key) !== 'project'
    $('member-pack').checked = false
    $('frame-actions').open = false
    $('object-name').value =
      type() === 'flow'
          ? graphModel.document.subflows.find((f) => flowKey(f.id) === key).title
          : graphModel.nodes[key].title
    $('frame-rename').disabled = $('frame-remove').disabled = false
    $('object-type').value = type()
    $('frame-remove').textContent =
      type() === 'source'
        ? '移除外框及外框連線'
        : '展平子流程及移除子流程連線'
    const links = relatedLinks(key, true)
    $('member-links').replaceChildren(...(links ? [links] : []))
    $('member-search').value = $('member-new').value = $('member-error').textContent = ''
    $('member-rule').textContent =
      {
        source: '調整外框包含的步驟與詳情清單順序。可包含不同排版群組的節點，不會更改節點的群組歸屬。',
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
    addNode(draft, {
      id,
      type: memberType,
      title,
      group:
        type() === 'flow'
            ? graphModel.document.subflows.find((f) => flowKey(f.id) === key).title
            : '未分組',
      sheetId: type() === 'source' ? sheetFor(key) : 'project',
      decision: false,
      content: [],
      tags: [],
      description: '',
    })
    ids.push(id)
    dirty = true
    $('member-new').value = ''
    refresh()
  }
  $('member-apply').onclick = () => {
    try {
      const old = getMembers(key),
        kind = type()
      if (kind === 'source') {
        if (!isFrameNode(draft.nodes[key])) throw Error('只有外框類型可設定框內步驟。')
        draft.nodes[key].frameMembers = [...ids]
        // Explicitly changing membership refits the frame; direct resize remains manual.
        delete draft.nodes[key].layoutSize
      }
      else {
        if (!ids.length) throw Error('子流程需要至少一個入口步驟。')
        const f = draft.subflows.find((f) => flowKey(f.id) === key)
        for (const n of Object.values(graphModel.nodes))
          if (n.sourceKind === 'subflow') draft.nodes[n.id].sheetId = sheetFor(n.id)
        for (const id of new Set([...old, ...ids])) {
          const n = draft.nodes[id]
          moveToSheet(n, sheetFor(id), ids.includes(id) ? f.id : 'project')
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
      say('已更新' + labels[kind] + '，可復原')
    } catch (e) {
      $('member-error').textContent = e.message
    }
  }
  $('members-close').onclick = $('member-cancel').onclick = () => dialog.close()
  load()
  dialog.showModal()
}

export { editMembers }
