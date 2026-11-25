import { proseSegments, references } from './references.js'

// Text steps render inline code literally. Descriptions and callouts are plain text.
export function* nodeKnowledgeTargets(node) {
  function* scan(text, field) {
    if (typeof text !== 'string' || !text.includes('](kb:')) return
    for (const [, , key, section] of references(text)) yield { field, key, section }
  }
  for (const [key, label] of [['description', '說明'], ['expect', '預期結果'], ['note', '注意事項']])
    yield* scan(node[key], label)
  for (const [index, block] of (node.content || []).entries()) {
    if (block.type !== 'text' || !block.value.includes('](kb:')) continue
    for (const part of proseSegments(block.value)) {
      if (!part.code) yield* scan(part.text, '文字步驟 ' + (index + 1))
    }
  }
}

function* missingTargets(graph) {
  for (const node of Object.values(graph.nodes)) {
    for (const ref of nodeKnowledgeTargets(node)) {
      const doc = graph['knowledge.' + ref.key]
      if (doc && (!ref.section || doc.sections?.some(s => s.id === ref.section))) continue
      const missing = doc ? '小節' : '條目'
      const target = ref.key + (ref.section ? '#' + ref.section : '')
      yield {
        // An existing broken link can move within the node when steps are reordered.
        signature: JSON.stringify([node.id, target, missing]),
        key: ref.key,
        node: node.id,
        message: '節點 ' + node.id + '「' + node.title + '」的' + ref.field + '引用了缺少的' + missing + '「' + target + '」。',
      }
    }
  }
}

// Check the resolved graph. An old, already broken reference should not prevent an
// unrelated import, but adding occurrences or losing another previously valid target should.
export function newMissingTarget(graph, previous) {
  const missing = missingTargets(graph)
  const first = missing.next()
  if (first.done) return null
  const allowed = new Map()
  if (previous) for (const ref of missingTargets(previous))
    allowed.set(ref.signature, (allowed.get(ref.signature) || 0) + 1)
  for (let step = first; !step.done; step = missing.next()) {
    const ref = step.value, count = allowed.get(ref.signature) || 0
    if (!count) return ref
    allowed.set(ref.signature, count - 1)
  }
  return null
}
