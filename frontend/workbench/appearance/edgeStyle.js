export const lineStyles = ['solid', 'dashed', 'dotted']
export function edgeLineStyle(edge = {}) {
  return lineStyles.includes(edge?.lineStyle) ? edge.lineStyle : edge?.dashed ? 'dashed' : 'solid'
}
export function storeEdgeLineStyle(edge, style) {
  if (!lineStyles.includes(style)) throw Error('請選擇有效的線段樣式')
  if (edgeLineStyle(edge) === style) return
  edge.lineStyle = style
  edge.dashed = style === 'dashed'
}
export function paintEdgeLine(path, edge) {
  const style = edgeLineStyle(edge)
  path.setAttribute('stroke-dasharray', { solid: 'none', dashed: '5 4', dotted: '1 4' }[style])
  path.setAttribute('stroke-linecap', style === 'dotted' ? 'round' : 'butt')
}
