import { typeDefinition, typeDefinitions, typeKey, typeStyle } from '../modeling/nodeTypeCatalog.js'
import { bindTypeManager } from '../modeling/nodeTypeManager.js'
import { markColorSelection, renderColorPalette, usedColors } from './colorPalette.js'
import { invalidatePeerStyles, peerStyle } from './groupPalette.js'
import { selectionState } from '../editing/state.js'
import { defaultColors, effectiveStyle, groupStyle, styleSpec } from './schema.js'
import { isFrameNode } from '../graph/nodeTypes.js'
import { $, el } from '../ui/dom.js'
import { applyLegendStyle, paintCard } from './styles.js'

import { tagList } from '../diagram/visibleGraph.js'
import { groupNamesInGraph } from '../groups/visibility.js'
import { exportGraph } from '../io/graph.js'
import { diagramState } from '../diagram/state.js'
import { graphModel } from '../graph/model.js'
import { replaceGraph } from '../graph/replace.js'
import { say } from '../ui/toast.js'

function initStyleEditor() {
  const dialog = $('style-dialog'),
    target = $('style-target'),
    fields = $('style-fields')
  let graph, level, anchor, dirty
  const typeManager = bindTypeManager({ graph: () => graph, target, changed: () => { dirty = true }, render })
  const group = (name) => graph.layoutGroups?.find((g) => g.name === name)
  function owner(create = false) {
    if (level === 'diagram') return graph
    if (level === 'node') return graph.nodes[target.value]
    if (level === 'type') {
      let item = graph.nodeTypeDefinitions?.find(item => item.id === target.value)
      if (!item && create) {
        item = { ...typeDefinition(graph, target.value) }
        ;(graph.nodeTypeDefinitions ??= []).push(item)
      }
      return item
    }
    let g = group(target.value)
    if (!g && create) {
      g = { name: target.value, direction: 'auto' }
      ;(graph.layoutGroups ??= []).push(g)
    }
    return g
  }
  function sample() {
    if (level === 'node') return graph.nodes[target.value]
    const n = graph.nodes[anchor]
    if (level === 'type') {
      const definition = typeDefinition(graph, target.value)
      const peer = Object.values(graph.nodes).find(node => typeKey(node) === target.value)
      // Preview this layer without a sample node's individual overrides.
      return { ...peer, id: peer?.id || 'preview', title: definition?.name || '類型預覽',
        type: definition?.baseType || 'action', customType: target.value, group: peer?.group || '', nodeStyle: undefined }
    }
    if (n && (level === 'diagram' || n.group === target.value)) return n
    return Object.values(graph.nodes).find((n) => n.group === target.value)
  }
  function update(key, value) {
    const item = owner(!!value)
    if (!item) return
    if (value) (item.nodeStyle ??= {})[key] = value
    else if (item.nodeStyle) {
      delete item.nodeStyle[key]
      if (!Object.keys(item.nodeStyle).length) delete item.nodeStyle
    }
    invalidatePeerStyles(graph)
    dirty = true
    preview()
  }
  function preview() {
    const n = sample(),
      sampleBox = $('style-sample'),
      local = owner()?.nodeStyle || {}
    sampleBox.replaceChildren()
    sampleBox.dataset.preview = $('preview-mode').value
    $('style-origin').textContent = '此層自訂 ' + Object.keys(local).length + ' 項'
    $('reset-style').disabled = !Object.keys(local).length
    $('apply-style').disabled = !dirty
    if (!n) {
      sampleBox.textContent = '群組尚無節點'
      return
    }
    const s = effectiveStyle(graph, n),
      outer = el('div'),
      card = el('div', 'node'),
      body = el('div', 'node-body')
    if (s.frame === 'on') {
      outer.className = 'sample-frame'
      outer.style.border =
        '2px ' + (s.frameLine || 'dashed') + ' ' + (s.frameColor || defaultColors.frameColor)
      outer.append(el('span', 'frame-name', n.group))
    }
    applyLegendStyle(card, n)
    if (isFrameNode(n)) card.classList.add('preview-container')
    paintCard(card, s)
    body.append(el('span', 'node-kicker', tagList(n).join(' · ')), el('span', 'node-title', n.title))
    card.append(body)
    outer.append(card)
    sampleBox.append(outer)
  }
  function render() {
    fields.replaceChildren()
    $('frame-controls').replaceChildren()
    const local = owner()?.nodeStyle || {},
      n = sample()
    const groupParent = ['node', 'type'].includes(level) ? groupStyle(graph, n?.group) : null
    const typeParent = level === 'node' && n ? typeStyle(graph, n) : null
    const peers = level === 'node' && n?.inheritPeerStyle ? peerStyle(graph, n) : {}
    $('frame-fields').hidden = ['node', 'type'].includes(level)
    const count =
      level === 'diagram'
        ? Object.keys(graph.nodes).length
        : Object.values(graph.nodes).filter((n) => level === 'type' ? typeKey(n) === target.value : n.group === target.value).length
    $('style-impact').textContent =
      level === 'node'
        ? '僅套用至此節點 · ' + (n?.group || '')
        : count +
          ' 個節點 · ' +
          (level === 'type' ? '所有同類型節點共用樣式；個別節點可逐項覆寫。' : level === 'group' ? '新加入此群組的節點也會繼承。' : '群組、類型與個別節點可逐項覆寫。')
    for (const [key, [name, choices]] of Object.entries(styleSpec)) {
      if (['node', 'type'].includes(level) && key.startsWith('frame')) continue
      const inherited = typeParent?.[key] || groupParent?.[key] || (level !== 'diagram' && graph.nodeStyle?.[key]) || peers[key]
      const source = typeParent?.[key] ? '節點類型' : groupParent?.[key]
        ? '群組'
        : level !== 'diagram' && graph.nodeStyle?.[key]
          ? '全圖'
          : peers[key] ? '同群組節點'
          : key.startsWith('frame')
            ? '預設'
            : '原圖'
      const row = el('div', 'style-field'),
        id = 'style-' + key,
        label = el('label', '', name),
        sel = el('select')
      sel.id = id
      label.htmlFor = id
      sel.add(new Option('沿用' + source, ''))
      row.append(label)
      if (choices) {
        for (const [v, text] of Object.entries(choices)) sel.add(new Option(text, v))
        sel.value = local[key] || ''
        sel.onchange = () => update(key, sel.value)
        row.append(sel)
      } else {
        const pair = el('div', 'style-color'),
          color = el('input')
        color.type = 'color'
        color.setAttribute('aria-label', name + ' HEX')
        sel.add(new Option('自訂', 'custom'))
        sel.value = local[key] ? 'custom' : ''
        color.value = local[key] || inherited || defaultColors[key]
        color.disabled = !local[key]
        const palette = el('div', 'edge-swatches')
        palette.id = id + '-palette'
        const choose = value => {
          color.value = value
          color.disabled = false
          sel.value = 'custom'
          update(key, value)
          markColorSelection(palette, value)
        }
        renderColorPalette(palette, usedColors(graph), { name, value: local[key], onSelect: choose })
        sel.onchange = () => {
          color.disabled = !sel.value
          if (!sel.value) color.value = inherited || defaultColors[key]
          update(key, sel.value ? color.value : '')
          markColorSelection(palette, sel.value ? color.value : null)
        }
        color.oninput = () => choose(color.value)
        pair.append(sel, color)
        row.append(pair, palette)
      }
      ;(key.startsWith('frame') ? $('frame-controls') : fields).append(row)
    }
    preview()
  }
  function scope(next) {
    level = next
    target.replaceChildren()
    const n = graph.nodes[anchor]
    if (level === 'group') {
      for (const name of groupNamesInGraph().sort()) target.add(new Option(name, name))
      if (n) target.value = n.group
    }
    if (level === 'node') {
      for (const item of Object.values(graph.nodes))
        target.add(new Option(item.title + ' · ' + item.id, item.id))
      if (n) target.value = n.id
    }
    if (level === 'type') {
      for (const item of typeDefinitions(graph)) target.add(new Option(item.name, item.id))
      if (n) target.value = typeKey(n)
      typeManager.refresh()
    }
    $('type-manager').hidden = level !== 'type'
    target.hidden = level === 'diagram'
    for (const b of dialog.querySelectorAll('[data-level]'))
      b.setAttribute('aria-pressed', String(b.dataset.level === level))
    render()
  }
  function open(next) {
    graph = exportGraph()
    anchor =
      selectionState.editTarget?.node || diagramState.selected?.id || Object.keys(graphModel.nodes)[0]
    dirty = false
    $('preview-mode').value = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
    $('tools-menu').open = false
    scope(next)
    dialog.showModal()
  }
  $('preview-mode').onchange = preview
  $('node-style-launch').onclick = () => open('node')
  $('style-launch').onclick = () => open('diagram')
  $('type-style-launch').onclick = () => open('type')
  $('group-style-launch').onclick = () => open('group')
  for (const b of dialog.querySelectorAll('[data-level]')) b.onclick = () => scope(b.dataset.level)
  target.onchange = () => {
    if (level === 'type') typeManager.refresh()
    else if (level === 'node') anchor = target.value
    else anchor = Object.values(graph.nodes).find((n) => n.group === target.value)?.id
    render()
  }
  $('reset-style').onclick = () => {
    const item = owner()
    if (item) delete item.nodeStyle
    invalidatePeerStyles(graph)
    dirty = true
    render()
  }
  dialog.onkeydown = (e) => {
    if (e.key === 'Escape') e.stopPropagation()
  }
  $('style-close').onclick = $('cancel-style').onclick = () => dialog.close()
  $('apply-style').onclick = () => {
    if (dirty) {
      replaceGraph(graph, { keepView: true })
      say('已套用畫布樣式，可復原此次變更')
    }
    dialog.close()
  }
  dialog.addEventListener('close', () => {
    graph = null
  })
}

export { initStyleEditor }
