export const levels = {
  reading: { label: '字體大小', names: ['標準 · 100%', '較大 · 115%', '大 · 130%', '特大 · 150%'] },
  cursor: { label: '游標大小', names: ['標準', '大', '特大'] },
  highlight: { label: '游標醒目提示', names: ['關閉', '小', '中', '大'] },
  glow: { label: '游標光暈', names: ['關閉', '柔和', '中等', '明亮'] },
}
export const readingScales = [1, 1.15, 1.3, 1.5]
export type DisplayPrefs = Record<keyof typeof levels, number> & {
  theme: 'dark' | 'light'
  color: keyof typeof colors
}
export const defaults: DisplayPrefs = {
  theme: 'light',
  reading: 0,
  cursor: 0,
  highlight: 0,
  glow: 0,
  color: 'cyan',
}
export function decode(raw: string | null): DisplayPrefs {
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
export const colors = { cyan: '#00bfe7', yellow: '#ffd43b', pink: '#ff74ce' }
