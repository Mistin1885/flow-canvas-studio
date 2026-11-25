// Render authored text as DOM nodes. HTML in a document stays literal text.
function element(tag, text) {
  const node = document.createElement(tag)
  if (text !== undefined) node.textContent = text
  return node
}

function inline(line, parent) {
  const parts =
    /(!?)\[([^\]]*)\]\((https?:\/\/[^\s)]+|data:image\/(?:png|jpeg|webp);base64,[\w+/=]+)\)|`([^`]+)`/g
  let end = 0
  for (const match of line.matchAll(parts)) {
    parent.append(line.slice(end, match.index))
    if (match[4]) parent.append(element('code', match[4]))
    else if (match[1]) {
      const img = element('img')
      img.src = match[3]
      img.loading = 'lazy'
      img.alt = match[2]
      parent.append(img)
    } else if (/^https?:/.test(match[3])) {
      const a = element('a', match[2])
      a.href = match[3]
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      parent.append(a)
    } else parent.append(match[0])
    end = match.index + match[0].length
  }
  parent.append(line.slice(end))
}

const tableLine = (line) => line.startsWith('|') || line.includes('\t')

export function hasTable(text) {
  let inCode = false
  return text.split('\n').some((line) => {
    if (line.startsWith('```')) inCode = !inCode
    else if (!inCode && tableLine(line)) return true
    return false
  })
}

export function renderBody(text) {
  const root = element('div')
  root.className = 'knowledgeBody'
  const lines = text.replace(/\r/g, '').split('\n')
  for (let i = 0; i < lines.length;) {
    const line = lines[i++]
    if (!line.trim()) continue
    if (line.startsWith('```')) {
      const code = []
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++])
      i++
      root.append(element('pre', code.join('\n')))
    } else if (tableLine(line)) {
      const separator = line.includes('\t') ? '\t' : '|'
      const table = element('table')
      const rows = [line]
      while (i < lines.length && (separator === '|' ? lines[i].startsWith('|') : lines[i].includes('\t')))
        rows.push(lines[i++])
      rows.forEach((row, index) => {
        let cells = row.split(separator)
        if (separator === '|') cells = cells.slice(1, row.endsWith('|') ? -1 : undefined)
        if (cells.every((s) => /^:?-+:?$/.test(s.trim()))) return
        const tr = table.insertRow()
        for (const cell of cells) {
          const td = element(index ? 'td' : 'th')
          inline(cell.trim(), td)
          tr.append(td)
        }
      })
      root.append(table)
    } else {
      const paragraph = element(line.startsWith('## ') ? 'h4' : 'p')
      inline(line.replace(/^## /, '').replace(/^[-*] /, '• '), paragraph)
      root.append(paragraph)
    }
  }
  return root
}
