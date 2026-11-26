import { unmappedTag } from './constants.js'
import { categoryNames } from '../options/catalog.js'
import { graphModel } from '../graph/model.js'
import { cloneGraph } from '../graph/json.js'

const legendState = {}

let originalNames = new Set()

function useCategories(graph) {
  const sourceItems = graph.sourceLegend?.items || []
  originalNames = new Set(sourceItems.map((x) => x.name))
  legendState.legendItems = [
    ...sourceItems,
    ...(graph.customCategories || []).map((c) => ({
      name: c.name,
      value: c.color.slice(1),
      kind: 'outline',
      custom: true,
    })),
  ]
  legendState.legendNames = categoryNames(graph)
}

useCategories(graphModel.document)

function categoryTags(n) {
  return [...new Set((n.tags || []).filter((tag) => legendState.legendNames.has(tag)))]
}

const workbookAudit = graphModel.document.sourceLegend

const sourceEvidence = new Map(
  Object.values(graphModel.nodes)
    .filter((n) => n.legendEvidence)
    .map((n) => [n.sourceId, n.legendEvidence]),
)

function normalizedLegend(graph) {
  const previouslyAudited = !!graph.sourceLegend
  const verified =
    workbookAudit && graph.sourceData?.sources?.some((s) => s.sha256 === workbookAudit.sha256)
  if (verified && !graph.sourceLegend) graph.sourceLegend = cloneGraph(workbookAudit)
  for (const n of Object.values(graph.nodes)) {
    if (n.legendEvidence || previouslyAudited) continue
    const known = verified && sourceEvidence.get(n.sourceId)
    if (known) {
      n.legendEvidence = cloneGraph(known)
      const canonical = known.categories.find((c) =>
        legendState.legendItems.some((i) => i.kind === 'outline' && i.name === c),
      )
      if (
        canonical &&
        (!n.group || n.group === '未分組' || n.group === 'Source notes' || /^#[0-9a-f]{6}$/i.test(n.group))
      )
        n.group = canonical
      n.tags = [
        ...new Set([
          n.group,
          ...(known.categories.length ? known.categories : [unmappedTag]),
          ...(n.tags || []).filter((c) => !legendState.legendNames.has(c)),
        ]),
      ]
    }
  }
  return graph
}

export { legendState, unmappedTag, originalNames, useCategories, categoryTags, normalizedLegend }
