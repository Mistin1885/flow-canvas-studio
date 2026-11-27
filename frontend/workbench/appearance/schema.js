import { peerStyle } from './groupPalette.js'
import { typeStyle } from '../modeling/nodeTypeCatalog.js'

// Legacy frame fields remain valid for lossless imports; no UI or renderer uses them.
const styleSpec = {
  edge: ['節點框線色'],
  light: ['淺色底色'],
  dark: ['深色底色'],
  radius: ['卡片形狀', { 0: '直角矩形', 8: '小圓角', 18: '大圓角' }],
  line: ['框線樣式', { solid: '實線', dashed: '虛線', dotted: '點線' }],
  width: ['框線寬度', { 1: '細線 · 1 px', 2: '標準 · 2 px', 3: '粗線 · 3 px' }],
  frame: ['顯示範圍框', { off: '隱藏', on: '顯示' }],
  frameColor: ['範圍框色'],
  frameLine: ['範圍線型', { dashed: '虛線', solid: '實線', dotted: '點線' }],
}

const defaultColors = { edge: '#527898', light: '#e7f2f2', dark: '#214044', frameColor: '#598b91' }

function checkNodeStyles(record, context, allowFrame) {
  if (record === undefined) return
  if (!record || typeof record !== 'object' || Array.isArray(record))
    throw Error(context + '：樣式格式無效')
  for (const [key, v] of Object.entries(record)) {
    if (
      !Object.hasOwn(styleSpec, key) ||
      (!allowFrame && key.startsWith('frame')) ||
      typeof v !== 'string'
    )
      throw Error(context + '：未知的樣式欄位')
    const choices = styleSpec[key][1]
    if (!(choices ? Object.hasOwn(choices, v) : /^#[a-f0-9]{6}$/i.test(v)))
      throw Error(context + '：' + styleSpec[key][0] + ' 無效')
  }
}

function groupStyle(g, name) {
  return g.layoutGroups?.find((item) => item.name === name)?.nodeStyle
}

function effectiveStyle(g, n) {
  return { ...(n.inheritPeerStyle && peerStyle(g, n)), ...g.nodeStyle, ...groupStyle(g, n.group), ...typeStyle(g, n), ...n.nodeStyle }
}

export { styleSpec, defaultColors, checkNodeStyles, groupStyle, effectiveStyle }
