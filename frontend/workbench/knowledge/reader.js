import { graphModel } from '../graph/model.js'
import { $, el } from '../ui/dom.js'
import { diagramState } from '../diagram/state.js'
import { renderBody } from './body.js'
import { renderDetail } from '../inspector/details.js'

let opened

export function readingEntry() {
  if (!opened) return false
  if (opened.node !== diagramState.selected?.id || !graphModel.document['knowledge.' + opened.key]) {
    opened = undefined
    return false
  }
  const top = $('detail').scrollTop
  showEntry(opened.key, opened.section, false)
  $('detail').scrollTop = top
  return true
}

function showEntry(key, section, focus = true) {
  const doc = graphModel.document['knowledge.' + key]
  if (!doc) return
  const panel = $('detail')
  const back = el('button', 'return-button', '← 返回節點')
  opened = { key, section, node: diagramState.selected?.id }
  back.onclick = () => {
    opened = undefined
    renderDetail()
  }
  panel.replaceChildren(back, el('h2', 'detail-title', doc.title), el('p', 'description', doc.summary))
  let target
  for (const part of doc.sections || []) {
    const heading = el('h3', 'section-title', part.title)
    panel.append(heading, renderBody(part.body))
    if (part.id === section) target = heading
  }
  panel.scrollTop = 0
  if (focus) {
    target?.scrollIntoView({ block: 'nearest' })
    back.focus({ preventScroll: true })
  }
}

function entryLink(id, section, label) {
  const doc = graphModel.document['knowledge.' + id]
  if (!doc) return document.createTextNode(label)
  const link = el('button', 'knowledgeLink', label)
  link.type = 'button'
  link.setAttribute('aria-description', doc.summary || doc.title)
  if (doc.summary) link.dataset.preview = doc.summary
  link.onclick = () => showEntry(id, section)
  return link
}

export function linkText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  for (const node of nodes) {
    if (
      !node.parentElement?.closest('.description,.prose,.callout') ||
      node.parentElement.closest('pre,code,button')
    )
      continue
    const line = node.textContent,
      result = document.createDocumentFragment()
    let end = 0
    for (const m of line.matchAll(/\[([^\]\n]+)\]\(kb:([\w-]+)(?:#([\w-]+))?\)/g)) {
      result.append(line.slice(end, m.index), entryLink(m[2], m[3], m[1]))
      end = m.index + m[0].length
    }
    if (end) {
      result.append(line.slice(end))
      node.replaceWith(result)
    }
  }
}

export function pinnedEntries() {
  const box = el('section', 'knowledgePins')
  for (const id of graphModel.document.knowledgePins || []) {
    const doc = graphModel.document['knowledge.' + id]
    if (doc) box.append(entryLink(id, '', doc.title))
  }
  if (box.childNodes.length) box.prepend(el('h3', 'section-title', '畫布參考資料'))
  return box
}
