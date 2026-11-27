import { typeLabel } from '../modeling/nodeTypeCatalog.js'
import { linkText, pinnedEntries, readingEntry } from '../knowledge/reader.js'
import { proseSegments } from '../knowledge/references.js'
import { properties, rules } from '../modeling/fields.js'
import { groupStyle } from '../appearance/schema.js'
import { categoryTags } from '../categories/model.js'

import { isFrameNode, kindLabels } from '../graph/nodeTypes.js'
import { $, el, icon } from '../ui/dom.js'
import { diagramState } from '../diagram/state.js'
import { say } from '../ui/toast.js'
import { edgesFor, followReturn, nodeKind, returnTarget } from '../diagram/nodes.js'
import { graphModel } from '../graph/model.js'
import { go } from '../diagram/navigation.js'
import { expandedFlows, sheetFor, tagList } from '../diagram/visibleGraph.js'
import { flowKey, groupKey, sourceMembers } from '../frames/membership.js'

import { editMembers } from '../frames/memberDialog.js'
import { toggleInlineFlow } from '../layout/inlineFlows.js'
import { relatedLinks } from '../frames/mutations.js'
import { openSourceReview } from '../ui/sourceReview.js'

function prose(t) {
  const p = el('p', 'prose')
  for (const part of proseSegments(t))
    p.append(part.code ? el('code', '', part.text.slice(1, -1)) : document.createTextNode(part.text))
  return p
}

async function copy(value, key, button) {
  const version = diagramState.revision
  try {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(value)
      } catch {
        fallback(value)
      }
    } else fallback(value)
    if (version !== diagramState.revision) return
    diagramState.copied.add(key)
    button.replaceChildren(icon('check'), document.createTextNode('已複製'))
    button.closest('.cmd').classList.add('copied')
    say('指令已複製')
  } catch {
    say('無法存取剪貼簿，請選取指令並按 Ctrl+C。')
  }
}

function fallback(text) {
  const active = document.activeElement,
    x = el('textarea')
  x.value = text
  x.style.cssText = 'position:fixed;left:-10000px;top:0'
  document.body.append(x)
  x.select()
  const result = document.execCommand('copy')
  x.remove()
  active?.focus({ preventScroll: true })
  if (!result) throw Error('copy')
}

function codeCard(c, index) {
  const value = c.value,
    key = [diagramState.rack, diagramState.cm, diagramState.selected.id, index, value].join('|'),
    card = el('div', 'cmd' + (diagramState.copied.has(key) ? ' copied' : '')),
    head = el('div', 'cmd-head')
  head.append(el('span', '', c.label || 'Command'))
  const b = el('button', '')
  b.type = 'button'
  b.append(
    icon(diagramState.copied.has(key) ? 'check' : 'copy'),
    document.createTextNode(diagramState.copied.has(key) ? '已複製' : '複製'),
  )
  b.setAttribute('aria-label', '複製指令 ' + (index + 1))
  let activeValue = value,
    activeKey = key
  b.addEventListener('click', () => copy(activeValue, activeKey, b))
  head.append(b)
  card.append(head)
  const pre = el('pre'),
    code = el('code', '', value)
  code.translate = false
  pre.append(code)
  card.append(pre)
  if (Array.isArray(c.radio) && c.radio.length) {
    const row = el('div', 'target'),
      label = el('label', '', '測試項目'),
      select = el('select')
    select.id = 'test-choice-' + index
    label.htmlFor = select.id
    for (const opt of c.radio) {
      const option = el('option', '', typeof opt === 'string' ? opt : opt.label || opt.value)
      option.value = typeof opt === 'string' ? opt : opt.value
      select.append(option)
    }
    select.value = c['radio-default'] || select.options[0].value
    const update = () => {
      activeValue = c.value.replaceAll('{radio-choose}', select.value)
      activeKey = key + '|' + select.value
      code.textContent = activeValue
      card.classList.toggle('copied', diagramState.copied.has(activeKey))
      b.replaceChildren(
        icon(diagramState.copied.has(activeKey) ? 'check' : 'copy'),
        document.createTextNode(diagramState.copied.has(activeKey) ? '已複製' : '複製'),
      )
    }
    select.addEventListener('change', update)
    update()
    row.append(label, select)
    card.insertBefore(row, pre)
  }

  return card
}

function branchButton(e, i) {
  const b = el('button'),
    t = el('span')
  if (e.label) t.append(el('small', '', e.label))
  t.append(document.createTextNode(graphModel.nodes[e.to].title))
  b.append(t, el('span', 'chev', '›'))
  b.onclick = () => go(e.to)
  return b
}

function outputCard(c) {
  const box = el(
    'details',
    'output-card' +
      (c.label?.startsWith('異常範例')
        ? ' output-warning'
        : c.label?.startsWith('正常範例')
          ? ' output-success'
          : ''),
  )
  box.open = c.value.split('\n').length <= 6
  box.append(el('summary', '', c.label || '輸出範例'))
  const pre = el('pre'),
    body = el('code', '', c.value)
  body.translate = false
  pre.append(body)
  box.append(pre)
  return box
}

function renderDetail() {
  const i = diagramState.selected
  if (!i || readingEntry()) return
  const n = graphModel.nodes[i.id],
    frag = document.createDocumentFragment()
  $('detail-id').textContent = ''
  frag.append(
    el('span', 'detail-type ' + nodeKind(i), i.isExit ? kindLabels.return : typeLabel(graphModel.document, n)),
    el('h2', 'detail-title', n.title),
  )
  const target = returnTarget(i)
  if (target) {
    const jump = el('button', 'return-button', '跳轉到 ' + graphModel.nodes[target].title)
    jump.type = 'button'
    jump.onclick = () => followReturn(i)
    frag.append(jump)
  }
  if (n.description) frag.append(el('p', 'description', n.description))
  const sf = (graphModel.document.subflows || []).find(
    (s) => s.parent === i.id || s.id === sheetFor(n.id),
  )
  const inside = sf && sf.parent !== n.id ? sf : null
  const owners = Object.values(graphModel.nodes).filter(
    (f) =>
      isFrameNode(f) && f.id !== n.id && sourceMembers(f).some((k) => k === n.id || k === inside?.parent),
  )
  const memberships = []
  if (inside) memberships.push(['子流程 · ' + inside.title, () => go(inside.parent)])
  for (const f of owners) memberships.push([f.title, () => go(f.id)])
  if ({ ...graphModel.document.nodeStyle, ...groupStyle(graphModel.document, n.group) }.frame === 'on')
    memberships.push(['排版群組 · ' + n.group, () => editMembers(groupKey(n.group))])
  if (memberships.length) {
    const section = el('section', 'frame-membership'),
      label = el('strong', '', '所屬外框')
    section.setAttribute('aria-label', '所屬外框')
    section.append(label)
    for (const [name, action] of memberships) {
      const b = el('button', '', name)
      b.type = 'button'
      b.onclick = action
      section.append(b)
    }
    frag.append(section)
  }
  const layout = el('p', 'source-meta', '排版群組 · ' + n.group)
  frag.append(layout)
  for (const [label, value] of [['負責角色/負責人', n.ownerRole], ['規則', rules[n.gatewayRule]], ...properties(n)]) {
    if (value) frag.append(el('p','detail-property', label + ' · ' + value))
  }
  const meta = el('div', 'detail-meta')
  for (const t of categoryTags(n)) meta.append(el('span', 'meta-chip', t))
  if (n.where && !/^來源 S\d+$/.test(n.where) && !tagList(n).includes(n.where))
    meta.append(el('span', 'meta-chip', n.where))
  frag.append(meta)
  if (n.expect) frag.append(el('div', 'callout', '預期結果：' + n.expect))
  if (n.note) frag.append(el('div', 'callout note', n.note))
  if (n.content?.length) {
    frag.append(el('h3', 'section-title', '內容與步驟'))
    n.content.forEach((c, k) =>
      frag.append(
        c.type === 'code' ? (c.language === 'text' ? outputCard(c) : codeCard(c, k)) : prose(c.value),
      ),
    )
  }
  const frameEdit = el('button', 'return-button', '編輯框內步驟')
  frameEdit.onclick = () =>
    editMembers(
      isFrameNode(n)
        ? n.id
        : inside
          ? flowKey(inside.id)
          : owners[0]?.id || (sf ? flowKey(sf.id) : groupKey(n.group)),
    )
  frag.append(frameEdit)
  if (sf) {
    const b = el(
      'button',
      'return-button',
      sf.parent === i.id
        ? (expandedFlows.has(sf.id) ? '收合 ' : '展開 ') + sf.title + ' 子流程'
        : '定位到 ' + graphModel.nodes[sf.parent]?.title,
    )
    b.onclick = () => (sf.parent === i.id ? toggleInlineFlow(sf) : go(sf.parent))
    frag.append(b)
    const source = (graphModel.document.sourceData?.subflows || []).find((s) => s.id === sf.id)
    if (source?.source_image_data_uri?.startsWith('data:image/png;base64,')) {
      const detail = el('details', 'source-image')
      detail.append(el('summary', '', '查看子流程原圖'))
      const img = el('img')
      img.src = source.source_image_data_uri
      img.alt = sf.title + ' 原始流程圖'
      detail.append(img)
      frag.append(detail)
    }
  }
  if (isFrameNode(n)) {
    const members = sourceMembers(n)
      .map((id) => graphModel.nodes[id])
      .filter(Boolean)
    if (members.length) {
      frag.append(el('h3', 'section-title', '框內步驟'))
      const list = el('div', 'branch-list')
      for (const child of members) {
        const b = el('button', '', child.title)
        b.onclick = () => go(child.id)
        list.append(b)
      }
      frag.append(list)
    }
  }
  const extraLinks = relatedLinks(i.id)
  if (extraLinks) frag.append(extraLinks)
  const inbound = graphModel.edges.filter((e) => e.to === i.id)
  if (inbound.length) {
    const details = el('details', 'incoming-details')
    details.append(el('summary', '', '前序節點 · ' + inbound.length))
    const list = el('div', 'branch-list')
    for (const e of inbound) {
      const b = el('button', '', graphModel.nodes[e.from].title)
      b.onclick = () => go(e.from)
      list.append(b)
    }
    details.append(list)
    frag.append(details)
  }
  const branches = edgesFor(i).filter((e) => e.kind === 'next')
  if (branches.length) {
    frag.append(el('h3', 'section-title', '沿流程繼續'))
    const list = el('div', 'branch-list')
    for (const e of branches) list.append(branchButton(e, i))
    frag.append(list)
  }
  const exits = edgesFor(i).filter((e) => e.kind === 'return' || e.kind === 'retry')
  if (exits.length) {
    frag.append(el('h3', 'section-title', '返回／重試'))
    for (const e of exits) {
      const b = el(
        'button',
        'return-button',
        (e.label ? e.label + ' · ' : '') + graphModel.nodes[e.to].title,
      )
      b.onclick = () => go(e.to, true)
      frag.append(b)
    }
  }
  const pending = (graphModel.document.review || []).filter(
    (r) => !r.resolved && (r.sourceId === n.sourceId || r.targetId === n.sourceId),
  )
  if (pending.length) {
    const b = el('button', 'review-link', '相關待確認連線 · ' + pending.length)
    b.onclick = () => openSourceReview(n.sourceId)
    frag.append(b)
  }
  linkText(frag)
  frag.append(pinnedEntries())
  $('detail').replaceChildren(frag)
  if (diagramState.lastDetailKey !== i.key) {
    $('detail').scrollTop = 0
    diagramState.lastDetailKey = i.key
  }
  $('caption').textContent = i.scope === 'project' ? graphModel.document.title || '流程畫布' : n.group
}

export { renderDetail }
