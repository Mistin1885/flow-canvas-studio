// This grammar is also used to render links in the inspector.
const linkPattern = /\[([^\]\n]+)\]\(kb:([\w-]+)(?:#([\w-]+))?\)/g

export function references(text) {
  return text.matchAll(linkPattern)
}

// A reference label may contain backticks. Conversely, inline code can show
// a literal reference example. Whichever starts first owns that span.
const prosePattern = new RegExp(linkPattern.source + '|`[^`]+`', 'g')
export function* proseSegments(text) {
  let cursor = 0
  for (const match of text.matchAll(prosePattern)) {
    if (match.index > cursor) yield { text: text.slice(cursor, match.index), code: false }
    yield { text: match[0], code: match[0].startsWith('`') }
    cursor = match.index + match[0].length
  }
  if (cursor < text.length) yield { text: text.slice(cursor), code: false }
}

const syntaxHint = '引用格式不完整。請使用 [顯示文字](kb:條目ID)，或重新插入引用。'

// Check recognizable fragments while leaving ordinary prose, URLs and Markdown alone.
export function referenceIssue(text, lookup, previousLabels = []) {
  let pos = 0
  const spans = []
  for (const match of references(text)) {
    const [, label, key, section] = match
    spans.push([pos, text.slice(pos, match.index)])
    pos = match.index + match[0].length
    const doc = lookup(key)
    let reason
    if (!label.trim()) reason = '請填入引用的顯示文字。'
    else if (!doc) reason = '找不到知識條目「' + key + '」，請重新選取條目。'
    else if (section && !doc.sections?.some((part) => part.id === section))
      reason = '條目內找不到小節「' + section + '」，請重新選取小節或引用整篇。'
    if (reason) return { index: match.index, reason }
  }
  spans.push([pos, text.slice(pos)])
  for (const [start, rest] of spans) {
    const prose = rest.replace(/(?:https?:\/\/|mailto:)[^\s)]+/gi, (url) => ' '.repeat(url.length))
    const marker = /[\](]\s*kb\s*[:：]/i.exec(prose) || /\bkb:(?=[\w#-])/.exec(prose)
    if (marker) return { index: start + marker.index, reason: syntaxHint }
    for (const m of rest.matchAll(/\[([^\]\n]+)\]\s*\(([^)\s]*)/g)) {
      const dest = m[2]
      if (/^(?:https?:\/\/|mailto:|\/|#)/i.test(dest)) continue
      const key = dest.split('#')[0].replace(/^[^:]*:/, '')
      if (/^kb(?:$|[:：])/i.test(dest) || lookup(key) || previousLabels.includes(m[1]))
        return { index: start + m.index, reason: syntaxHint }
    }
    for (const label of previousLabels) {
      const i = rest.indexOf('[' + label)
      if (i < 0) continue
      const tail = rest.slice(i + label.length + 1)
      if (!tail || (tail.startsWith(']') && !tail.startsWith('](')))
        return { index: start + i, reason: syntaxHint }
    }
  }
  return null
}
