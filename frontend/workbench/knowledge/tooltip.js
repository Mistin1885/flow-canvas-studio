// A manual popover escapes the inspector's scrolling and clipping ancestors.
let active
let activeTimer

function dismiss() {
  if (!active) return
  const { bubble, events, observer } = active
  active = null
  clearTimeout(activeTimer)
  events.abort()
  observer.disconnect()
  bubble.remove()
}

function place() {
  if (!active) return
  const { link, bubble } = active
  if (!link.isConnected || !link.getClientRects().length) return dismiss()
  const anchor = link.getBoundingClientRect()
  const { clientWidth: width, clientHeight: height } = document.documentElement
  const margin = 8
  const clamp = (value, max) => Math.max(margin, Math.min(value, max - margin))
  const { width: w, height: h } = bubble.getBoundingClientRect()
  const below = anchor.bottom + margin
  const top =
    below + h + margin <= height || height - anchor.bottom >= anchor.top
      ? below
      : anchor.top - h - margin
  bubble.style.left = clamp(anchor.left + (anchor.width - w) / 2, width - w) + 'px'
  bubble.style.top = clamp(top, height - h) + 'px'
}

function show(link, summary, hint) {
  if (active?.link === link) {
    clearTimeout(activeTimer)
    return
  }
  dismiss()
  const bubble = document.createElement('div')
  bubble.className = 'knowledgeTooltip'
  bubble.setAttribute('role', 'group')
  bubble.setAttribute('aria-label', '條目摘要')
  const eyebrow = document.createElement('small')
  eyebrow.textContent = '條目摘要'
  const excerpt = document.createElement('p')
  excerpt.textContent = summary
  const open = document.createElement('button')
  open.type = 'button'
  open.textContent = hint() + ' →'
  // The inline reference already provides the same action in keyboard order.
  open.tabIndex = -1
  open.onpointerdown = (event) => event.preventDefault()
  open.onclick = () => link.click()
  bubble.append(eyebrow, excerpt, open)
  bubble.onpointerenter = () => clearTimeout(activeTimer)
  bubble.onpointerleave = () => scheduleDismiss(link)
  bubble.setAttribute('popover', 'manual')
  document.body.append(bubble)
  bubble.showPopover?.()
  const events = new AbortController()
  const observer = new MutationObserver(() => {
    if (!link.isConnected) dismiss()
  })
  observer.observe(document.getElementById('detail'), { childList: true, subtree: true })
  active = { bubble, link, events, observer }
  place()
  const options = { signal: events.signal }
  window.addEventListener('resize', place, options)
  window.addEventListener('scroll', dismiss, { ...options, capture: true })
  window.addEventListener('blur', dismiss, options)
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') dismiss()
    },
    options,
  )
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (!bubble.contains(event.target) && event.target !== link) dismiss()
    },
    options,
  )
}

function scheduleDismiss(link) {
  clearTimeout(activeTimer)
  activeTimer = setTimeout(() => {
    if (active?.link === link) dismiss()
  }, 220)
}

export function attachPreview(link, summary, hint) {
  link.setAttribute('aria-description', '摘要：' + summary + '。開啟可閱讀完整條目。')
  link.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'touch') show(link, summary, hint)
  })
  link.addEventListener('focus', () => {
    if (link.matches(':focus-visible')) show(link, summary, hint)
  })
  const leave = () => {
    if (active?.link === link) dismiss()
  }
  link.addEventListener('pointerleave', () => scheduleDismiss(link))
  link.addEventListener('blur', leave)
  link.addEventListener('click', leave)
}
