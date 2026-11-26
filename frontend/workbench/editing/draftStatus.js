import { $ } from '../ui/dom.js'

export function draftStatus(mode, adding, hosted) {
  const state = mode === 'clean' && adding ? 'new' : mode
  const privateForm = state === 'new' || state === 'private'
  const [label, note] = {
    clean: hosted ? ['團隊版本', '已發佈到團隊畫布'] : ['畫布版本', '套用後可匯出 JSON 或 HTML 保存'],
    new: ['新節點 · 私人', hosted ? '套用後團隊才看得到' : '套用後加入畫布'],
    private: ['私人草稿', hosted ? '已暫存於此瀏覽器 · 套用後團隊才看得到' : '僅在此表單 · 套用後可匯出保存'],
    error: ['草稿暫存失敗', '最新修改只在此表單，請在離開前套用'],
    unreadable: ['草稿讀取失敗', '無法載入草稿原始版本，請捨棄後重新編輯'],
  }[state]
  $('node-editor').dataset.draftState = state
  $('draft-badge-label').textContent = label
  $('draft-team-icon').style.display = state === 'clean' ? '' : 'none'
  $('draft-lock-icon').style.display = privateForm ? '' : 'none'
  $('draft-error-icon').style.display = ['error', 'unreadable'].includes(state) ? '' : 'none'
  if ($('form-draft-status').textContent !== note) $('form-draft-status').textContent = note
  $('draft-discard').hidden = mode === 'clean'
}
