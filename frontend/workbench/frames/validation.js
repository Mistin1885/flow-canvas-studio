import { validLabelBackground } from '../appearance/edgeColors.js'
import { validateWireLayout } from '../layout/wireGeometry.js'

function validateFrameData(g) {
  const groups = new Set([
    ...Object.values(g.nodes).map((n) => n.group),
    ...(g.layoutGroups || []).map((r) => r.name),
  ])
  const flows = new Set((g.subflows || []).map((f) => f.id))
  const endpoint = (k) =>
    typeof k === 'string' &&
    (Object.hasOwn(g.nodes, k) ||
      (k.startsWith('group:') && groups.has(k.slice(6))) ||
      (k.startsWith('flow:') && flows.has(k.slice(5))))
  for (const [n, ids] of [
    ...Object.values(g.nodes).map((n) => [n, n.frameMembers]),
    ...[...(g.layoutGroups || []), ...(g.subflows || [])].map((r) => [r, r.memberOrder]),
  ]) {
    if (
      ids !== undefined &&
      (!Array.isArray(ids) ||
        new Set(ids).size !== ids.length ||
        ids.some((id) => !Object.hasOwn(g.nodes, id) || id === n.id))
    )
      throw Error('框內步驟清單包含重複或不存在的節點')
  }
  if (g.groupLinks !== undefined) {
    if (!Array.isArray(g.groupLinks) || g.groupLinks.length > 1000) throw Error('群組連線資料無效')
    const seen = new Set()
    for (const e of g.groupLinks) {
      const key = JSON.stringify([e?.from, e?.to, e?.label])
      if (
        !e ||
        !endpoint(e.from) ||
        !endpoint(e.to) ||
        e.from === e.to ||
        (g.nodes[e.from] && g.nodes[e.to]) ||
        typeof e.label !== 'string' ||
        e.label.length > 200 ||
        (e.conditionColor && !/^#[a-f0-9]{6}$/i.test(e.conditionColor)) ||
        !validLabelBackground(e.labelBackgroundColor) ||
        seen.has(key)
      )
        throw Error('群組連線端點、條件或顏色無效，或已有相同連線')
      validateWireLayout(e.wireLayout)
      seen.add(key)
    }
  }
}

export { validateFrameData }
