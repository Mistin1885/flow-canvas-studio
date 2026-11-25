import { checkKnowledge } from '../knowledge/validate.js'
import { checkBadges } from '../badges/model.js'
import { directions } from '../editing/state.js'
import { unmappedTag } from '../categories/constants.js'
import { checkNodeStyles } from '../appearance/schema.js'
import { nodeTypes } from './nodeTypes.js'
import { adaptDfxDraft } from './dfx.js'

import { validateFrameData } from '../frames/validation.js'

function readGraph(value) {
  const bad = (path, message) => {
      throw new Error(path + '：' + message)
    },
    obj = (x, p) => {
      if (!x || typeof x !== 'object' || Array.isArray(x)) bad(p, '應為物件')
    },
    str = (x, p, max = 100000) => {
      if (typeof x !== 'string' || x.length > max) bad(p, '應為不超過 ' + max + ' 字的文字')
    }
  if (value?.schema === 'dfx-flow-extraction/0.1') value = adaptDfxDraft(value)
  obj(value, 'JSON')
  if (['constructor', 'prototype', '__proto__'].some((key) => Object.hasOwn(value, key)))
    bad('JSON', '含有保留的欄位名稱')
  if (value.schemaVersion !== 1 || value.documentType !== 'dfx-project-flow')
    bad('格式', '請選擇流程畫布匯出的 JSON')
  obj(value.nodes, 'nodes')
  const ids = Object.keys(value.nodes),
    has = (id) => Object.hasOwn(value.nodes, id)
  if (ids.length > 300) bad('nodes', '最多 300 個節點')
  let blocks = 0
  for (const id of ids) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id) || ['constructor', 'prototype', '__proto__'].includes(id))
      bad(id, '節點 ID 格式無效')
    const n = value.nodes[id]
    obj(n, id)
    if (n.id !== id) bad(id + '.id', '必須與 nodes 的索引一致')
    if (n.type === 'return' && !n.jumpTo) bad(id, '返回節點需要目標')
    if (n.jumpTo !== undefined) {
      if (!has(n.jumpTo) || n.jumpTo === id || value.nodes[n.jumpTo].jumpTo)
        bad(id + '.jumpTo', '請指向存在且非跳轉入口的節點')
      if (n.jumpScope !== undefined && (!has(n.jumpScope) || value.nodes[n.jumpScope].jumpTo))
        bad(id + '.jumpScope', '請提供有效的主流程目標')
    }
    str(n.title, id + '.title', 200)
    str(n.group, id + '.group', 80)
    if (!n.title.trim() || !n.group.trim()) bad(id, '名稱與 subgraph 不可空白')
    if (typeof n.decision !== 'boolean') bad(id + '.decision', '應為 true 或 false')
    for (const k of ['description', 'expect', 'note', 'where'])
      if (n[k] !== undefined) str(n[k], id + '.' + k)
    if (!Array.isArray(n.content) || n.content.length > 100)
      bad(id + '.content', '請提供最多 100 個內容區塊')
    for (const [index, c] of n.content.entries()) {
      const path = id + '.content[' + index + ']'
      obj(c, path)
      if (++blocks > 3000) bad('content', '內容區塊總數超過 3000')
      if (!['text', 'code'].includes(c.type)) bad(path + '.type', '僅支援 text 或 code')
      str(c.value, path + '.value')
      for (const k of ['label', 'language']) if (c[k] !== undefined) str(c[k], path + '.' + k, 300)
      if (c.radio !== undefined) {
        if (c.type !== 'code' || !Array.isArray(c.radio) || !c.radio.length || c.radio.length > 100)
          bad(path + '.radio', '請提供指令選項陣列')
        c.radio.forEach((x) => str(x, path + '.radio', 300))
        if (!c.radio.includes(c['radio-default'])) bad(path + '.radio-default', '必須是選項之一')
      }
      if (c.value.includes('{radio-choose}') && !c.radio) bad(path + '.radio', '此指令需要提供選項與預設值')
    }
  }
  for (const n of Object.values(value.nodes)) {
    if (n.tags !== undefined && (!Array.isArray(n.tags) || n.tags.some((t) => typeof t !== 'string')))
      bad(n.id, '分類標籤格式錯誤')
    if (
      n.drawingBox !== undefined &&
      (!Array.isArray(n.drawingBox) ||
        n.drawingBox.length !== 4 ||
        !n.drawingBox.every(Number.isFinite) ||
        n.drawingBox[2] <= 0 ||
        n.drawingBox[3] <= 0)
    )
      bad(n.id, '原圖位置無效')
  }
  if (!Array.isArray(value.edges) || value.edges.length > 800) bad('edges', '請提供最多 800 條連線')
  const edgeKeys = new Set()
  for (const [index, e] of value.edges.entries()) {
    const p = 'edges[' + index + ']'
    obj(e, p)
    str(e.from, p + '.from', 64)
    str(e.to, p + '.to', 64)
    if (!has(e.from)) bad(p + '.from', '找不到來源節點 ' + e.from)
    if (!['next', 'return', 'retry', 'spine'].includes(e.kind))
      bad(p + '.kind', '請使用 next、return、retry 或 spine')
    if (e.to === '$caller') {
      if (e.kind !== 'return') bad(p, '自動返回來源測項必須使用 return')
      if (
        !Array.isArray(e.fallback) ||
        !e.fallback.length ||
        e.fallback.some((id) => typeof id !== 'string' || !has(id))
      )
        bad(p + '.fallback', '請提供有效的備用復測節點')
    } else if (!has(e.to)) bad(p + '.to', '找不到目標節點 ' + e.to)
    str(e.label, p + '.label', 200)
    if (e.resume !== undefined && !has(e.resume)) bad(p + '.resume', '找不到接續節點')
    if (e.merge !== undefined && typeof e.merge !== 'boolean') bad(p + '.merge', '應為 true 或 false')
    if (e.dashed !== undefined && typeof e.dashed !== 'boolean') bad(p + '.dashed', '應為 true 或 false')
    const key = JSON.stringify([e.from, e.to, e.kind, e.label])
    if (edgeKeys.has(key)) bad(p, '重複連線')
    edgeKeys.add(key)
  }
  for (const e of value.edges) {
    const r = e.drawingRoute
    if (
      r &&
      (!Array.isArray(r.points) ||
        r.points.length < 2 ||
        r.points.some((p) => !Array.isArray(p) || p.length !== 2 || !p.every(Number.isFinite)))
    )
      bad('drawingRoute', '線路座標無效')
  }
  const scopes = new Set()
  const checkScopes = (item, path, allowed) => {
    if (item.scopeOverrides === undefined) return
    obj(item.scopeOverrides, path + '.scopeOverrides')
    for (const [scope, patch] of Object.entries(item.scopeOverrides)) {
      if (!has(scope)) bad(path + '.scopeOverrides', '找不到主流程 ' + scope)
      obj(patch, path + '.scopeOverrides.' + scope)
      for (const key of Object.keys(patch))
        if (!allowed.includes(key)) bad(path + '.scopeOverrides.' + scope, '不支援覆寫 ' + key)
      scopes.add(scope)
    }
  }
  for (const [id, n] of Object.entries(value.nodes))
    checkScopes(n, id, ['title', 'description', 'expect', 'note', 'where', 'content'])
  value.edges.forEach((e, k) => checkScopes(e, 'edges[' + k + ']', ['to', 'label', 'resume']))
  for (const scope of scopes) {
    const materialize = (item) => {
      const { scopeOverrides, ...base } = item
      return { ...base, ...scopeOverrides?.[scope] }
    }
    readGraph({
      ...value,
      nodes: Object.fromEntries(Object.entries(value.nodes).map(([id, n]) => [id, materialize(n)])),
      edges: value.edges.map(materialize),
    })
  }
  if (value.edges.some((e) => e.to === '$caller' || e.kind === 'spine'))
    bad('edges', 'DFx 流程請使用明確目標與 next／return／retry')
  if (
    value.navigation !== undefined &&
    (!Array.isArray(value.navigation) || value.navigation.some((id) => !has(id)))
  )
    bad('navigation', '捷徑應指向有效節點')
  if (value.subflows !== undefined) {
    if (!Array.isArray(value.subflows)) bad('subflows', '應為陣列')
    for (const s of value.subflows) {
      obj(s, 'subflow')
      if (!has(s.root) || !has(s.parent)) bad('subflow', '父節點或入口不存在')
      str(s.id, 'subflow.id', 80)
      str(s.title, 'subflow.title', 200)
    }
  }
  if (value.review !== undefined) {
    if (!Array.isArray(value.review) || value.review.length > 1000) bad('review', '應為最多 1000 筆的陣列')
    for (const r of value.review) {
      obj(r, 'review')
      str(r.id, 'review.id', 100)
      if (r.sourceId !== null) str(r.sourceId, 'review.sourceId', 100)
      if (r.targetId !== null) str(r.targetId, 'review.targetId', 100)
      if (typeof r.resolved !== 'boolean') bad('review.resolved', '應為 true 或 false')
    }
  }
  if (value.sourceData !== undefined) {
    obj(value.sourceData, 'sourceData')
    if (
      value.sourceData.schema !== 'dfx-flow-extraction/0.1' ||
      !Array.isArray(value.sourceData.shapes) ||
      !Array.isArray(value.sourceData.connectors) ||
      !Array.isArray(value.sourceData.subflows)
    )
      bad('sourceData', '來源草稿格式無效')
  }
  const originalNames = new Set((value.sourceLegend?.items || []).map((item) => item.name))
  for (const n of Object.values(value.nodes)) {
    if (n.tags?.includes(unmappedTag) && n.tags.some((c) => c !== unmappedTag && originalNames.has(c)))
      bad(n.id, '原圖未對應圖例不能和其他圖例分類並用')
    if (n.type !== undefined && !Object.hasOwn(nodeTypes, n.type)) bad(n.id, '節點類型無效')
    if (n.nodeRole !== undefined && !['main', 'action', 'decision', 'fault'].includes(n.nodeRole))
      bad(n.id, '節點角色無效')
    const ev = n.legendEvidence
    if (
      ev !== undefined &&
      (!ev ||
        !Array.isArray(ev.categories) ||
        ev.categories.some((c) => typeof c !== 'string') ||
        (ev.image !== undefined && typeof ev.image !== 'string') ||
        (ev.noteText !== undefined &&
          (!Array.isArray(ev.noteText) || ev.noteText.some((t) => typeof t !== 'string'))))
    )
      bad(n.id, '原圖分類依據無效')
  }
  if (value.customCategories !== undefined) {
    if (!Array.isArray(value.customCategories)) bad('customCategories', '需要分類清單')
    const used = new Set((value.sourceLegend?.items || []).map((x) => x.name.toLowerCase()))
    for (const c of value.customCategories) {
      if (
        !c ||
        typeof c.name !== 'string' ||
        !c.name.trim() ||
        c.name !== c.name.trim() ||
        c.name.length > 64 ||
        used.has(c.name.toLowerCase()) ||
        !/^#[0-9a-f]{6}$/i.test(c.color)
      )
        bad('customCategories', '分類名稱或顏色無效、或名稱已重複')
      used.add(c.name.toLowerCase())
    }
  }
  if (value.sourceLegend !== undefined) {
    const notes = value.sourceLegend?.standaloneNotes
    obj(notes, 'sourceLegend.standaloneNotes')
    for (const v of Object.values(notes)) str(v, 'standaloneNotes')
  }
  if (value.layoutGroups !== undefined) {
    if (!Array.isArray(value.layoutGroups)) bad('layoutGroups', '需要群組清單')
    const names = new Set()
    for (const g of value.layoutGroups) {
      if (
        !g ||
        typeof g.name !== 'string' ||
        !g.name.trim() ||
        g.name.length > 80 ||
        names.has(g.name) ||
        !directions.has(g.direction)
      )
        bad('layoutGroups', '群組名稱或方向無效')
      names.add(g.name)
    }
  }
  for (const n of Object.values(value.nodes))
    if (
      n.layoutOffset !== undefined &&
      (!n.layoutOffset || ![n.layoutOffset.x, n.layoutOffset.y].every(Number.isFinite))
    )
      bad(n.id, '手動位置無效')
  for (const e of value.edges)
    if (e.conditionColor !== undefined && !/^#[0-9a-f]{6}$/i.test(e.conditionColor))
      bad('edges', '條件顏色無效')
  for (const n of Object.values(value.nodes))
    if (n.layoutOrder !== undefined && (!Number.isSafeInteger(n.layoutOrder) || n.layoutOrder < 0))
      bad(n.id, '拖曳順序無效')
  for (const key of ['ownerRoleOptions', 'locationOptions']) {
    const options = value[key]
    if (options !== undefined && (!Array.isArray(options) || options.some(s => typeof s !== 'string' || !s.trim())))
      bad(key, '選項必須是非空白文字')
  }
  checkKnowledge(value, bad)
  checkBadges(value, bad)
  validateFrameData(value)
  checkNodeStyles(value.nodeStyle, '全圖', true)
  for (const g of value.layoutGroups || []) checkNodeStyles(g.nodeStyle, g.name, true)
  for (const n of Object.values(value.nodes)) checkNodeStyles(n.nodeStyle, n.id, false)
  return value
}

export { readGraph }
