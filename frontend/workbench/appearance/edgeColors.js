export function defaultLabelColor(label) {
  if (/^(yes|pass)$/i.test(label)) return '#247148'
  if (/^(no|fail)\b/i.test(label)) return '#a34935'
  return '#476a91'
}

// Older documents used conditionColor for both the stroke and the label.
export function edgeColors(edge) {
  const line = edge.conditionColor || null
  const background = edge.labelBackgroundColor ?? line
  return { line, background: background === 'auto' ? null : background }
}

export function labelColor(edge) {
  return edgeColors(edge).background || defaultLabelColor(edge.label)
}

export function validLabelBackground(value) {
  return value === undefined || value === 'auto' || (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value))
}

export function storeEdgeColors(edge, line, background) {
  const previous = edgeColors(edge)
  // Opening and applying a legacy style should not rewrite an otherwise identical edge.
  if (previous.line?.toLowerCase() === line?.toLowerCase() &&
      previous.background?.toLowerCase() === background?.toLowerCase()) return
  if (line) edge.conditionColor = line
  else delete edge.conditionColor
  if (background) edge.labelBackgroundColor = background
  else if (line) edge.labelBackgroundColor = 'auto'
  else delete edge.labelBackgroundColor
}
