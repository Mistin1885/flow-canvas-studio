import { effectiveType, nodeTypes } from '../graph/nodeTypes.js'

export function typeKey(node) {
  return node.customType || (node.jumpTo ? 'return' : effectiveType(node))
}

export function typeDefinitions(graph) {
  const overrides = graph.nodeTypeDefinitions || []
  return [
    ...Object.entries(nodeTypes).map(([id, name]) => ({ id, name, baseType: id,
      ...overrides.find(item => item.id === id) })),
    ...overrides.filter(item => !Object.hasOwn(nodeTypes, item.id)),
  ]
}

export function typeDefinition(graph, id) {
  return typeDefinitions(graph).find(item => item.id === id)
}

export function typeLabel(graph, node) {
  return typeDefinition(graph, typeKey(node))?.name || nodeTypes[effectiveType(node)]
}

export function typeStyle(graph, node) {
  return graph.nodeTypeDefinitions?.find(item => item.id === typeKey(node))?.nodeStyle
}

export function setTypeDefinition(graph, definition) {
  const name = definition.name.trim()
  if (!name || name.length > 64 || typeDefinitions(graph).some(item =>
    item.id !== definition.id && item.name.toLowerCase() === name.toLowerCase()))
    throw Error('請輸入未重複的類型名稱，最多 64 字。')
  if (!Object.hasOwn(nodeTypes, definition.baseType)) throw Error('請選擇有效的基本行為。')
  const previous = typeDefinition(graph, definition.id)
  if (previous && previous.baseType !== definition.baseType) throw Error('既有類型的基本行為不可變更。')
  graph.nodeTypeDefinitions ??= []
  const index = graph.nodeTypeDefinitions.findIndex(item => item.id === definition.id)
  if (index < 0 && graph.nodeTypeDefinitions.length >= 100) throw Error('最多可設定 100 個節點類型。')
  const next = { ...definition, name }
  if (index < 0) graph.nodeTypeDefinitions.push(next)
  else graph.nodeTypeDefinitions[index] = next
  return next
}

export function deleteTypeDefinition(graph, id) {
  if (Object.hasOwn(nodeTypes, id)) throw Error('內建類型可調整樣式，不能刪除。')
  graph.nodeTypeDefinitions = (graph.nodeTypeDefinitions || []).filter(item => item.id !== id)
  for (const node of Object.values(graph.nodes)) if (node.customType === id) delete node.customType
}

export function checkNodeTypes(graph, bad, checkStyles) {
  const definitions = graph.nodeTypeDefinitions
  if (definitions !== undefined && (!Array.isArray(definitions) || definitions.length > 100))
    bad('nodeTypeDefinitions', '請提供最多 100 個類型定義')
  const ids = new Set(), names = new Set()
  for (const item of definitions || []) {
    if (!item || typeof item.id !== 'string' ||
        !(Object.hasOwn(nodeTypes, item.id) || /^type-[a-zA-Z0-9_-]{1,64}$/.test(item.id)) ||
        ids.has(item.id) || typeof item.name !== 'string' || !item.name.trim() ||
        item.name !== item.name.trim() || item.name.length > 64 ||
        !Object.hasOwn(nodeTypes, item.baseType) ||
        (Object.hasOwn(nodeTypes, item.id) && item.baseType !== item.id))
      bad('nodeTypeDefinitions', '類型名稱、識別碼或基本行為無效')
    ids.add(item.id)
    checkStyles(item.nodeStyle, item.name, false)
  }
  for (const item of typeDefinitions(graph)) {
    if (names.has(item.name.toLowerCase())) bad('nodeTypeDefinitions', '類型名稱重複')
    names.add(item.name.toLowerCase())
  }
  for (const node of Object.values(graph.nodes)) {
    if (node.customType === undefined) continue
    const definition = typeDefinition(graph, node.customType)
    if (!definition || Object.hasOwn(nodeTypes, node.customType) || definition.baseType !== node.type)
      bad(node.id, '自訂節點類型不存在或基本行為不一致')
  }
}
