import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { colors, decode, defaults, readingScales, type DisplayPrefs } from './preferences'
function cursorImage(size: number, fill: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32"><path d="M3 2v23l7-6 5 11 5-3-5-10 10 0z" fill="${fill}" stroke="#fff" stroke-width="3"/><path d="M3 2v23l7-6 5 11 5-3-5-10 10 0z" fill="${fill}" stroke="#192631" stroke-width="1.2"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 3`
}
export function useDisplayPreferences(user: string) {
  const key = user && 'flow-studio:display:v1:' + user
  const [prefs, setPrefs] = useState<DisplayPrefs>(defaults)
  const [persisted, setPersisted] = useState(true)
  useLayoutEffect(() => {
    function read() {
      try {
        setPrefs(decode(key ? localStorage.getItem(key) : null))
        setPersisted(true)
      } catch {
        setPrefs(defaults)
        setPersisted(false)
      }
    }
    function sync(event: StorageEvent) {
      if ((event.key === key || event.key === null) && event.storageArea === localStorage) read()
    }
    read()
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [key])
  function update(patch: Partial<DisplayPrefs>) {
    if (!key) return
    const next = { ...prefs, ...patch }
    setPrefs(next)
    try {
      localStorage.setItem(key, JSON.stringify(next))
      setPersisted(true)
    } catch {
      setPersisted(false)
    }
  }
  useLayoutEffect(() => {
    const root = document.documentElement
    root.dataset.theme = prefs.theme
    root.style.setProperty('--reading-scale', String(readingScales[prefs.reading]))
    root.toggleAttribute('data-large-cursor', !!prefs.cursor)
    const size = [0, 32, 48][prefs.cursor]
    if (size) {
      root.style.setProperty('--large-cursor', cursorImage(size, '#fff'))
      root.style.setProperty('--large-pointer', cursorImage(size, colors[prefs.color]))
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', prefs.theme === 'dark' ? '#172028' : '#f7f8fa')
  }, [prefs])
  useEffect(() => {
    if (!prefs.highlight && !prefs.glow) return
    const halo = document.createElement('div'),
      color = colors[prefs.color]
    halo.className = 'cursorHalo'
    halo.setAttribute('aria-hidden', 'true')
    const diameter = [44, 40, 56, 72][prefs.highlight]
    Object.assign(halo.style, {
      width: diameter + 'px',
      height: diameter + 'px',
      border: prefs.highlight ? '2px solid ' + color : 'none',
      background: prefs.highlight ? color + '24' : 'transparent',
      boxShadow: prefs.glow
        ? `0 0 ${12 * prefs.glow}px ${4 * prefs.glow}px ${color}99, inset 0 0 12px ${color}55`
        : 'none',
    })
    function hide() {
      halo.hidden = true
    }
    function move(event: PointerEvent) {
      if (event.pointerType === 'touch') {
        hide()
        return
      }
      const host =
        (event.target instanceof Element && event.target.closest('dialog[open]')) || document.body
      if (halo.parentNode !== host) host.append(halo)
      halo.style.transform = `translate(${event.clientX - diameter / 2}px,${event.clientY - diameter / 2}px)`
      halo.hidden = false
    }
    function leave(event: PointerEvent) {
      if (!event.relatedTarget || event.relatedTarget instanceof HTMLIFrameElement) hide()
    }
    document.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerout', leave)
    window.addEventListener('blur', hide)
    document.addEventListener('close', hide, true)
    return () => {
      document.removeEventListener('pointermove', move)
      document.removeEventListener('pointerout', leave)
      window.removeEventListener('blur', hide)
      document.removeEventListener('close', hide, true)
      halo.remove()
    }
  }, [prefs.color, prefs.highlight, prefs.glow])
  return { prefs, update, persisted, enabled: !!key }
}
