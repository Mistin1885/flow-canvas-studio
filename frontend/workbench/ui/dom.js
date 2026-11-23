const $ = (id) => document.getElementById(id)

function el(tag, cls, text) {
  const x = document.createElement(tag)
  if (cls) x.className = cls
  if (text !== undefined) x.textContent = text
  return x
}

function svg(name, attrs) {
  const x = document.createElementNS('http://www.w3.org/2000/svg', name)
  for (const [k, v] of Object.entries(attrs || {})) x.setAttribute(k, v)
  return x
}

function icon(name) {
  const x = svg('svg', { viewBox: '0 0 24 24', class: 'icon', 'aria-hidden': 'true' })
  x.append(svg('path', { d: name === 'check' ? 'm5 12 4 4L19 6' : 'M9 9h11v11H9z M15 5V3H3v12h2' }))
  return x
}

export { $, el, icon, svg }
