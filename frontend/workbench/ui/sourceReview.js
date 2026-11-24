import { safeData } from '../graph/json.js'
import { $, el } from './dom.js'
import { graphModel } from '../graph/model.js'
import { downloadFile, exportGraph } from '../io/graph.js'
import { replaceGraph } from '../graph/replace.js'
import { say } from './toast.js'

let sourceTab = 'connections'

let sourceFilter = ''

function openSourceReview(filter = '') {
  sourceFilter = filter
  sourceTab = 'connections'
  renderSourceReview()
  $('source-dialog').showModal()
}

function renderSourceReview() {
  const host = $('source-body')
  host.replaceChildren()
  for (const tab of ['connections', 'notes', 'info'])
    $('source-' + tab).setAttribute('aria-pressed', String(sourceTab === tab))
  const raw = graphModel.document.sourceData,
    shapes = new Map((raw?.shapes || []).map((s) => [s.id, s]))
  const sourceTitle = (id) =>
    id ? (shapes.get(id)?.text?.split('\n')[0] || '原圖外框') + ' [' + id + ']' : '端點未連接'
  if (sourceTab === 'connections') {
    const all = graphModel.document.review || [],
      rows = all
        .filter((r) => !sourceFilter || r.sourceId === sourceFilter || r.targetId === sourceFilter)
        .sort((a, b) => Number(a.resolved) - Number(b.resolved)),
      pending = all.filter((r) => !r.resolved)
    host.append(
      el(
        'p',
        'source-intro',
        pending.length +
          ' 條待確認 · ' +
          all.filter((r) => r.reason === 'missing_endpoint').length +
          ' 條原始端點不完整，' +
          all.filter((r) => r.reason === 'container_endpoint').length +
          ' 條指向外框。此處的選擇需依原圖人工確認；確認後才會加入流程並隨 HTML／JSON 保存。',
      ),
    )
    host.append(el('p', 'source-intro', '已核對的條件顯示於箭頭。其他原圖文字可在「原圖註記」查閱。'))
    if (sourceFilter) {
      const b = el('button', '', '顯示全部連線')
      b.onclick = () => {
        sourceFilter = ''
        renderSourceReview()
      }
      host.append(b)
    }
    if (!rows.length) host.append(el('p', '', '目前沒有符合的待確認連線。'))
    for (const r of rows) {
      const row = el('section', 'review-row')
      row.append(
        el(
          'h3',
          '',
          r.id +
            ' · ' +
            (r.resolved
              ? '已人工確認'
              : r.reason === 'container_endpoint'
                ? '外框端點待確認'
                : '端點待確認'),
        ),
        el('p', 'source-meta', sourceTitle(r.sourceId) + ' → ' + sourceTitle(r.targetId)),
      )
      if (r.resolved) {
        row.append(
          el(
            'p',
            '',
            graphModel.nodes[r.resolution?.from]?.title +
              ' → ' +
              graphModel.nodes[r.resolution?.to]?.title,
          ),
        )
        const undo = el('button', '', '撤回這次確認')
        undo.onclick = () => {
          const graph = exportGraph(),
            review = graph.review.find((x) => x.id === r.id)
          if (review.resolution?.added) {
            const edge = graph.edges.find((e) => e.reviewedConnectorId === r.id)
            if (edge) review.previousEdge = edge
            graph.edges = graph.edges.filter((e) => e.reviewedConnectorId !== r.id)
          }
          review.resolved = false
          delete review.resolution
          replaceGraph(graph)
          renderSourceReview()
        }
        row.append(undo)
        host.append(row)
        continue
      }
      const fields = el('div', 'review-fields'),
        selectFor = (label, sourceId) => {
          const wrap = el('label', '', label),
            select = el('select')
          const empty = el('option', '', '請選擇確認後的節點')
          empty.value = ''
          select.append(empty)
          for (const n of Object.values(graphModel.nodes)) {
            const option = el('option', '', (n.sourceId || n.id) + ' · ' + n.title)
            option.value = n.id
            select.append(option)
          }
          select.value =
            (sourceId && Object.values(graphModel.nodes).find((n) => n.sourceId === sourceId)?.id) || ''
          wrap.append(select)
          fields.append(wrap)
          return select
        }
      const from = selectFor('來源', r.sourceId),
        to = selectFor('目標', r.targetId)
      row.append(fields)
      const actions = el('div', 'review-actions'),
        confirm = el('button', '', '確認並加入連線'),
        error = el('span', 'review-error')
      confirm.disabled = !from.value || !to.value
      from.onchange = to.onchange = () => (confirm.disabled = !from.value || !to.value)
      confirm.onclick = () => {
        try {
          if (!from.value || !to.value) throw new Error('請先選擇兩個端點')
          const graph = exportGraph(),
            review = graph.review.find((x) => x.id === r.id),
            saved = review.previousEdge,
            edge =
              saved?.from === from.value && saved.to === to.value
                ? saved
                : {
                    from: from.value,
                    to: to.value,
                    kind: 'next',
                    label: '',
                    dashed: false,
                    reviewedConnectorId: r.id,
                    sourceConnectorIds: [r.id],
                  },
            exists = graph.edges.some(
              (e) =>
                e.from === edge.from &&
                e.to === edge.to &&
                e.kind === edge.kind &&
                e.label === edge.label,
            )
          if (!exists) graph.edges.push(edge)
          delete review.previousEdge
          review.resolved = true
          review.resolution = { from: from.value, to: to.value, added: !exists }
          replaceGraph(graph)
          renderSourceReview()
          say('已確認 ' + r.id + '；請下載 HTML 或 JSON 保存')
        } catch (e) {
          error.textContent = e.message
        }
      }
      actions.append(confirm, error)
      row.append(actions)
      host.append(row)
    }
  } else if (sourceTab === 'notes') {
    host.append(
      el(
        'p',
        'source-intro',
        '完整保留原圖註記與圖例文字；不會自行將文字配到相鄰箭頭。原文拼字沿用來源。',
      ),
    )
    const input = el('input', 'source-filter')
    input.placeholder = '搜尋註記或來源 ID…'
    input.setAttribute('aria-label', '搜尋原圖註記')
    host.append(input)
    const list = el('div')
    host.append(list)
    const render = () => {
      list.replaceChildren()
      for (const s of raw?.shapes || []) {
        if (
          s.kind === 'node' ||
          !s.text ||
          !(s.id + ' ' + s.text).toLowerCase().includes(input.value.toLowerCase())
        )
          continue
        const item = el('div', 'source-annotation')
        item.append(el('small', '', s.id + ' · ' + s.kind), document.createTextNode(s.text))
        list.append(item)
      }
    }
    input.oninput = render
    render()
  } else {
    const info = el('div', 'source-info')
    info.append(
      el('p', '', graphModel.document.title || '流程畫布'),
      el(
        'p',
        '',
        Object.keys(graphModel.nodes).length +
          ' 個可瀏覽節點 · ' +
          graphModel.edges.length +
          ' 條目前連線',
      ),
      el(
        'p',
        '',
        raw
          ? '原始草稿：' +
              raw.shapes.length +
              ' 個圖形（含節點、註記、圖例與外框）· ' +
              raw.connectors.length +
              ' 條連線。'
          : '此 JSON 未附原始來源資料。',
      ),
    )
    for (const s of raw?.sources || []) info.append(el('p', '', s.filename))
    info.append(
      el(
        'p',
        '',
        '子流程以詳情按鈕連結到父節點，這是導覽關係，不代表額外新增的原圖箭頭。側邊分類參考原圖圖例。',
      ),
      el(
        'p',
        '',
        '此檔為可編輯草稿。請特別核對未確認端點與分支條件；未匯出的編輯不會自動存回本機 HTML。',
      ),
    )
    if (raw) {
      const b = el('button', '', '下載原始擷取 JSON')
      b.onclick = () =>
        downloadFile(safeData(raw), 'dfx_project_flow_draft.json', 'application/json;charset=utf-8')
      info.append(b)
    }
    host.append(info)
  }
}

function bindSourceReview() {
  $('source-review').onclick = () => openSourceReview()
  $('source-close').onclick = () => $('source-dialog').close()
  for (const tab of ['connections', 'notes', 'info'])
    $('source-' + tab).onclick = () => {
      sourceTab = tab
      sourceFilter = ''
      renderSourceReview()
    }
}

export { bindSourceReview, openSourceReview }
