const identifier = /^[a-zA-Z0-9_-]{1,64}$/

export function checkKnowledge(graph, bad) {
  for (const [key, doc] of Object.entries(graph)) {
    if (!key.startsWith('knowledge.')) continue
    if (
      !identifier.test(key.slice(10)) ||
      !doc ||
      typeof doc !== 'object' ||
      typeof doc.title !== 'string' ||
      !doc.title.trim() ||
      doc.title.length > 120 ||
      (doc.summary !== undefined && (typeof doc.summary !== 'string' || doc.summary.length > 600)) ||
      (doc.source !== undefined && (typeof doc.source !== 'string' || !identifier.test(doc.source)))
    )
      bad(key, '條目名稱或摘要格式無效')
    const parts = doc.sections === undefined ? [] : doc.sections
    if (!Array.isArray(parts) || parts.length > 50) bad(key, '每篇最多 50 小節')
    const seen = new Set()
    for (const section of parts) {
      if (
        !section ||
        typeof section.id !== 'string' ||
        !identifier.test(section.id) ||
        seen.has(section.id) ||
        typeof section.title !== 'string' ||
        section.title.length > 120 ||
        typeof section.body !== 'string' ||
        section.body.length > 50000
      )
        bad(key, '知識小節格式無效')
      seen.add(section.id)
    }
  }
  const pins = graph.knowledgePins
  if (
    pins !== undefined &&
    (!Array.isArray(pins) ||
      pins.some((id) => typeof id !== 'string' || !Object.hasOwn(graph, 'knowledge.' + id)))
  )
    bad('knowledgePins', '畫布參考資料缺少對應條目')
}
