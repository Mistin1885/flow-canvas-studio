import { isFrameNode } from '../graph/nodeTypes.js'
import { graphModel } from '../graph/model.js'

import { sheetFor } from '../diagram/visibleGraph.js'

const groupKey = (name) => 'group:' + name

const flowKey = (id) => 'flow:' + id

const frameHandles = new Map()

function objectName(key) {
  if (key.startsWith('group:')) return '排版群組 · ' + key.slice(6)
  if (key.startsWith('flow:'))
    return '子流程 · ' + (graphModel.document.subflows || []).find((f) => f.id === key.slice(5))?.title
  return graphModel.nodes[key]?.title || key
}

function sourceMembers(n) {
  if (!isFrameNode(n)) return []
  if (n.frameMembers) return n.frameMembers
  if (!n.drawingBox) return []
  const [x, y, w, h] = n.drawingBox
  return Object.values(graphModel.nodes)
    .filter((c) => {
      if (isFrameNode(c) || !c.drawingBox || sheetFor(c.id) !== 'project') return false
      const [a, b, cw, ch] = c.drawingBox
      return a + cw / 2 > x && a + cw / 2 < x + w && b + ch / 2 > y && b + ch / 2 < y + h
    })
    .sort((a, b) => a.drawingBox[1] - b.drawingBox[1])
    .map((c) => c.id)
}

function frameObjects(kind) {
  const objects = [
    ...Object.values(graphModel.nodes)
      .filter((n) => isFrameNode(n))
      .map((n) => [
        n.id,
        (n.sourceKind === 'container' && n.sourceId ? '原圖外框' : '自訂外框') + ' · ' + n.title,
      ]),
    ...(graphModel.document.subflows || []).map((f) => [flowKey(f.id), '子流程 · ' + f.title]),
  ]
  return kind ? objects.filter(([key]) => kind === 'flow' ? key.startsWith('flow:') : !!graphModel.nodes[key]) : objects
}

function getMembers(key) {
  if (graphModel.nodes[key]) return sourceMembers(graphModel.nodes[key])
  if (!key.startsWith('flow:')) return []
  const id = key.slice(5)
  const members = Object.values(graphModel.nodes).filter(n => sheetFor(n.id) === id).map(n => n.id)
  const saved = graphModel.document.subflows?.find(f => f.id === id)?.memberOrder || []
  return [...new Set([...saved.filter((k) => members.includes(k)), ...members])]
}

export { flowKey, frameHandles, frameObjects, getMembers, groupKey, objectName, sourceMembers }
