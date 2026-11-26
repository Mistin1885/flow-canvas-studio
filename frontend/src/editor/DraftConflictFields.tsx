import { History, LockKeyhole, Users } from 'lucide-react'
import type { Side } from '../import/merge'
import type { CompatibleField, DraftQuestion } from './draftMerge'

function readable(value: unknown): string {
  if (value === undefined) return '（未設定）'
  if (value === '') return '（空白）'
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

// Highlight the changed span without splitting a Unicode code point. The full value
// stays readable for deletions, structured data and older drafts without a baseline.
function ComparedValue({ value, original }: { value: unknown; original: unknown }) {
  if (typeof value !== 'string' || typeof original !== 'string' || !value)
    return <span>{readable(value)}</span>
  const before = Array.from(original), after = Array.from(value)
  const length = Math.min(before.length, after.length)
  let start = 0, end = 0
  while (start < length && before[start] === after[start]) start++
  while (end < length - start && before[before.length - 1 - end] === after[after.length - 1 - end]) end++
  const change = after.slice(start, after.length - end).join('')
  return <>{after.slice(0, start).join('')}{change && <mark>{change}</mark>}{after.slice(after.length - end).join('')}</>
}

export function DraftConflictField({ question, index, choice, choose }: {
  question: DraftQuestion; index: number; choice?: Side; choose: (side: Side) => void
}) {
  return <fieldset className="draftConflict">
    <legend>{question.subject && <code>{question.subject}</code>}{question.label}</legend>
    {Object.hasOwn(question, 'original') &&
      <div className="draftOriginal"><strong><History size={15} aria-hidden="true"/>編輯前</strong>
        <div className="draftValue">{readable(question.original)}</div></div>}
    <div className="draftSides">
      {(['team', 'file'] as const).map(side => {
        const Icon = side === 'team' ? Users : LockKeyhole
        return <label key={side} className={'draftSide ' + side}>
          <span className="draftSideHeading"><Icon size={16} aria-hidden="true"/>
            <strong>{side === 'team' ? '保留團隊版本' : '採用我的草稿'}</strong>
            <input type="radio" name={'draft-choice-' + index} checked={choice === side} onChange={() => choose(side)}/>
          </span>
          <span className="draftValue"><ComparedValue original={question.original}
            value={side === 'team' ? question.team : question.mine}/></span>
        </label>
      })}
    </div>
  </fieldset>
}

export function CompatibleFields({ fields }: { fields: CompatibleField[] }) {
  if (!fields.length) return null
  return <details className="draftCompatible">
    <summary>可自動合併的欄位（{fields.length}）</summary>
    <dl>{fields.map((field, i) => <div key={i}>
      <dt>{field.subject} · {field.label}<small>{field.source === 'team' ? '團隊版本' : '我的草稿'}</small></dt>
      <dd className="draftValue">{readable(field.value)}</dd>
    </div>)}</dl>
  </details>
}
