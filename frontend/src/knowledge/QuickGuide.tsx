import { useState } from 'react'

export function QuickGuide({ identity }: { identity: string }) {
  const key = 'flow-knowledge-guide:' + identity
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(key)
    } catch {
      return true
    }
  })
  function toggle() {
    setOpen(!open)
    try {
      if (open) localStorage.setItem(key, 'seen')
    } catch {
      /* Private browsing can disable storage. */
    }
  }
  return (
    <section className="kbGuide">
      <button type="button" aria-expanded={open} onClick={toggle}>
        {open ? '收合使用指引' : '知識庫使用指引'}
      </button>
      {open && (
        <ol>
          <li>
            <b>閱讀流程</b>　在節點詳情點選底線文字，讀完按「返回節點」。
          </li>
          <li>
            <b>加入說明</b>　在節點編輯器選取文字，按「引用知識條目」。
          </li>
          <li>
            <b>與團隊共用</b>　畫布專用條目可加入工作區共用，再選擇要分享給哪些工作區。
          </li>
        </ol>
      )}
    </section>
  )
}
