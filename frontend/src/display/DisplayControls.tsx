import { useRef, useId } from 'react'
import { Moon, SlidersHorizontal, Sun, X } from 'lucide-react'
import { colors, levels, defaults, type DisplayPrefs } from './preferences'
import type { useDisplayPreferences } from './useDisplayPreferences'
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
        <div className="cursorColors" role="group" aria-label="效果顏色">
          <span>效果顏色</span>
          {(Object.entries(colors) as [DisplayPrefs['color'], string][]).map(([key, color]) => (
            <button type="button" key={key} aria-pressed={prefs.color === key}
              onClick={() => update({ color: key })}>
              <i aria-hidden="true" style={{ backgroundColor: color }} />
              {{ cyan: '青藍', yellow: '亮黃', pink: '粉紅' }[key]}
            </button>
          ))}
        </div>
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
