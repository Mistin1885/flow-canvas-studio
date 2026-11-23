const edgeLabelCache = new Map()

function edgeLabelLines(text, max = 224) {
  if (!text) return []
  const key = max + '|' + text
  if (edgeLabelCache.has(key)) return edgeLabelCache.get(key)
  const lines = []
  let line = '',
    width = 0
  for (const token of text.match(/[A-Za-z0-9_./{}-]+|\s+|./gu) || []) {
    const measure = (s) => Array.from(s).reduce((n, ch) => n + (/[^\x00-\xff]/.test(ch) ? 12 : 7), 0),
      tw = measure(token)
    if (tw > max) {
      for (const ch of token) {
        const cw = measure(ch)
        if (width + cw > max) {
          lines.push(line.trim())
          line = ''
          width = 0
        }
        line += ch
        width += cw
      }
      continue
    }
    if (line && width + tw > max) {
      lines.push(line.trim())
      line = ''
      width = 0
    }
    if (!line && !token.trim()) continue
    line += token
    width += tw
  }
  if (line.trim()) lines.push(line.trim())
  edgeLabelCache.set(key, lines)
  return lines
}

export { edgeLabelCache, edgeLabelLines }
