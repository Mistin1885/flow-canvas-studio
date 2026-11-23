import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { Moon, SlidersHorizontal, Sun, X } from 'lucide-react'

const levels = {
  reading: { label: '字體大小', names: ['標準 · 100%', '較大 · 115%', '大 · 130%', '特大 · 150%'] },
  cursor: { label: '游標大小', names: ['標準', '大', '特大'] },
  highlight: { label: '游標醒目提示', names: ['關閉', '小', '中', '大'] },
  glow: { label: '游標光暈', names: ['關閉', '柔和', '中等', '明亮'] },
}
const colors = { cyan: '#00bfe7', yellow: '#ffd43b', pink: '#ff74ce' }
export const readingScales = [1, 1.15, 1.3, 1.5]
export type DisplayPrefs = Record<keyof typeof levels, number> & {
  theme: 'dark' | 'light'
  color: keyof typeof colors
}
const defaults: DisplayPrefs = {
  theme: 'light',
  reading: 0,
  cursor: 0,
  highlight: 0,
  glow: 0,
  color: 'cyan',
}
function decode(raw: string | null): DisplayPrefs {
  const prefs = { ...defaults }
  if (!raw) return prefs
  try {
    const input = JSON.parse(raw)
    if (input?.theme === 'dark') prefs.theme = 'dark'
    if (typeof input?.color === 'string' && Object.hasOwn(colors, input.color)) prefs.color = input.color
    for (const k of Object.keys(levels) as (keyof typeof levels)[]) {
      const value = input?.[k]
      if (Number.isInteger(value) && value >= 0 && value < levels[k].names.length) prefs[k] = value
    }
  } catch {
    /* An unreadable record uses the display defaults. */
  }
  return prefs
}
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

export function DisplayControls({
  prefs,
  update,
  persisted,
  enabled,
}: ReturnType<typeof useDisplayPreferences>) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useId(),
    dark = prefs.theme === 'dark'
  return (
    <div className="displayControls">
      <button
        type="button"
        aria-label="深色模式"
        aria-pressed={dark}
        title={dark ? '切換淺色模式' : '切換深色模式'}
        disabled={!enabled}
        onClick={() => update({ theme: dark ? 'light' : 'dark' })}
      >
        {dark ? <Sun size={17} /> : <Moon size={17} />}
      </button>
      <button
        type="button"
        aria-label="閱讀與游標"
        title="閱讀與游標"
        aria-haspopup="dialog"
        disabled={!enabled}
        onClick={() => dialog.current?.showModal()}
      >
        <SlidersHorizontal size={17} />
        <span>閱讀與游標</span>
      </button>
      <dialog ref={dialog} className="dialog displayDialog" aria-labelledby={title}>
        <header>
          <h2 id={title}>閱讀與游標</h2>
          <button
            type="button"
            className="icon"
            aria-label="關閉設定"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </header>
        <p>
          {persisted
            ? '設定會儲存在此瀏覽器，套用到你的所有工作區與畫布。'
            : '此瀏覽器目前無法儲存設定，偏好只會套用到本次瀏覽。'}
        </p>
        {(Object.keys(levels) as (keyof typeof levels)[]).map((k) => (
          <label key={k}>
            <span>
              {levels[k].label}
              <output>{levels[k].names[prefs[k]]}</output>
            </span>
            <input
              type="range"
              aria-label={levels[k].label}
              aria-valuetext={levels[k].names[prefs[k]]}
              min={0}
              max={levels[k].names.length - 1}
              step={1}
              value={prefs[k]}
              onChange={(e) => update({ [k]: +e.target.value })}
            />
          </label>
        ))}
        <label>
          效果顏色
          <select
            value={prefs.color}
            onChange={(e) => update({ color: e.target.value as DisplayPrefs['color'] })}
          >
            <option value="cyan">青藍</option>
            <option value="yellow">亮黃</option>
            <option value="pink">粉紅</option>
          </select>
        </label>
        <footer>
          <button type="button" onClick={() => update({ ...defaults, theme: prefs.theme })}>
            還原閱讀與游標
          </button>
          <button type="button" className="primary" onClick={() => dialog.current?.close()}>
            完成
          </button>
        </footer>
      </dialog>
    </div>
  )
}
