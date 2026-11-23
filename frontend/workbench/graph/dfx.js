function adaptDfxDraft(raw) {
  if (
    raw?.schema !== 'dfx-flow-extraction/0.1' ||
    !Array.isArray(raw.shapes) ||
    !Array.isArray(raw.connectors) ||
    !Array.isArray(raw.subflows)
  )
    throw new Error('請選擇 DFx 原始草稿或此工作台匯出的 JSON')
  if (raw.shapes.length > 500 || raw.connectors.length > 1000 || raw.subflows.length > 30)
    throw new Error('原始草稿超過支援大小')
  const shapes = new Map(raw.shapes.map((s) => [s.id, s])),
    nodes = {},
    edges = [],
    review = []
  const mapped = (id) => 'DF_' + id
  const linkedNotes = new Set()
  for (const c of raw.connectors)
    if (c.status === 'explicit_endpoints')
      for (const id of [c.source, c.target])
        if (shapes.get(id)?.kind === 'annotation') linkedNotes.add(id)
  const classify = (s) => {
    if (s.kind === 'annotation') return 'Source notes'
    const xml = s.source_xml || '',
      line = xml.match(/<(?:\w+:)?ln\b[\s\S]*?<\/(?:\w+:)?ln>/)?.[0] || '',
      color = line.match(/<(?:\w+:)?srgbClr\b[^>]*val="([A-Fa-f0-9]+)"/)?.[1]
    return s.group || (color ? '#' + color : '未分組')
  }
  for (const s of raw.shapes) {
    if (s.kind !== 'node' && !linkedNotes.has(s.id)) continue
    const text = String(s.text || '').trim(),
      parts = text.split('\n'),
      heading = []
    for (const p of parts) {
      if (/^\d+[.)]/.test(p.trim())) break
      heading.push(p.trim())
    }
    const title = (heading.join(' ') || parts[0] || s.id).slice(0, 200),
      id = mapped(s.id)
    nodes[id] = {
      id,
      title,
      group: classify(s),
      decision: s.preset?.prst === 'diamond',
      description: '',
      where: '來源 ' + s.id,
      note: s.kind === 'annotation' ? '原圖註記；以參考節點呈現。' : '',
      content: [{ type: 'text', value: s.text || '' }],
      sourceId: s.id,
      sourceKind: s.kind,
    }
  }
  const keys = new Set()
  for (const c of raw.connectors) {
    const from = mapped(c.source),
      to = mapped(c.target)
    if (c.status === 'explicit_endpoints' && nodes[from] && nodes[to]) {
      const key = from + '>' + to
      if (keys.has(key)) {
        edges.find((e) => e.from === from && e.to === to).sourceConnectorIds.push(c.id)
        continue
      }
      keys.add(key)
      edges.push({
        from,
        to,
        kind: 'next',
        label: c.label || '',
        dashed: false,
        sourceConnectorIds: [c.id],
        labelStatus: c.label_status || '',
      })
    } else
      review.push({
        id: c.id,
        sourceId: c.source || null,
        targetId: c.target || null,
        reason: c.status === 'explicit_endpoints' ? 'container_endpoint' : 'missing_endpoint',
        resolved: false,
      })
  }
  const subflows = []
  for (const flow of raw.subflows) {
    if (!Array.isArray(flow.nodes) || !Array.isArray(flow.edges)) throw new Error('子流程格式無效')
    for (const n of flow.nodes) {
      const id = mapped(n.id)
      nodes[id] = {
        id,
        title: String(n.text).replace(/\n/g, ' ').slice(0, 200),
        group: flow.title,
        decision: false,
        description: '',
        where: flow.title,
        note: '',
        content: [{ type: 'text', value: n.text }],
        sourceId: n.id,
        sourceKind: 'subflow',
      }
    }
    for (const e of flow.edges)
      edges.push({
        from: mapped(e.source),
        to: mapped(e.target),
        kind: 'next',
        label: e.label || '',
        dashed: false,
      })
    const sf = {
      id: flow.id,
      title: flow.title,
      parent: mapped(flow.parent_node_id),
      root: mapped(flow.nodes[0].id),
    }
    subflows.push(sf)
    if (nodes[sf.parent]) nodes[sf.parent].subflowId = sf.id
  }
  const targets = new Set(edges.map((e) => e.to))
  const roots = Object.keys(nodes).filter((id) => !targets.has(id) && nodes[id].sourceKind !== 'subflow')
  return {
    schemaVersion: 1,
    documentType: 'dfx-project-flow',
    title: raw.title,
    nodes,
    edges,
    navigation: roots,
    subflows,
    review,
    sourceData: raw,
  }
}

export { adaptDfxDraft }
