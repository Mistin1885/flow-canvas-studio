export const badgeIcons = { none: '', warning: '⚠', time: '◷', info: 'ⓘ', star: '★' }
export const defaultBadge = { color: '#b45309', style: 'solid', icon: 'warning' }

export function validBadgeName(name) {
  return typeof name === 'string' && !!name.trim() && name === name.trim() &&
    [...name].length <= 32 && !['constructor', 'prototype', '__proto__'].includes(name)
}

export function checkBadges(graph, bad) {
  const record = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  const catalog = graph.badgeStyles === undefined ? {} : graph.badgeStyles
  if (!record(catalog)) bad('badgeStyles', '需要醒目標籤樣式表')
  for (const [name, spec] of Object.entries(catalog)) {
    if (!validBadgeName(name) || !record(spec) || typeof spec.color !== 'string' ||
        !/^#[0-9a-f]{6}$/i.test(spec.color) || !['solid', 'outline'].includes(spec.style) ||
        typeof spec.icon !== 'string' || !Object.hasOwn(badgeIcons, spec.icon))
      bad('badgeStyles', '醒目標籤名稱、色彩、樣式或圖示無效')
  }
  for (const node of Object.values(graph.nodes)) {
    if (node.badges === undefined) continue
    if (!record(node.badges) || Object.entries(node.badges).some(([name, side]) =>
      !Object.hasOwn(catalog, name) || !['top', 'bottom'].includes(side)))
      bad(node.id + '.badges', '醒目標籤不存在或位置無效')
  }
}
