import { signature, type Choices, type Group, type Row, type Side } from './merge'

function valueText(value: unknown) {
  if (value === undefined) return '（無）'
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function title(row: Row) {
  if (row.table === 'meta') return '畫布設定 · ' + row.key
  if (row.table === 'nodes') return '節點 ' + row.key
  const [from, to, kind, label] = JSON.parse(row.key)
  return from + ' → ' + to + ' · ' + (label || kind)
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function RowDiff({ row, conflict }: { row: Row; conflict: boolean }) {
  const { team, file } = row
  const fields =
    record(team) && record(file)
      ? [...new Set([...Object.keys(team), ...Object.keys(file)])].filter(
          (k) => signature(team[k]) !== signature(file[k]),
        )
      : null
  const change = team === undefined ? '新增' : file === undefined ? '移除' : '修改'
  return (
    <details className="importDiff" open={conflict || change === '移除' || undefined}>
      <summary>
        <b>{change}</b> {title(row)} {fields && <small> · {fields.join('、')}</small>}
      </summary>
      <div className="importColumns">
        {(
          [
            ['目前團隊版本', team],
            ['JSON 版本', file],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <strong>{label}</strong>
            {fields && record(value) ? (
              fields.map((field) => (
                <div key={field}>
                  <small>{field}</small>
                  <pre>{valueText(value[field])}</pre>
                </div>
              ))
            ) : (
              <pre>{valueText(value)}</pre>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}

export function ChangeReview({
  groups,
  choices,
  choose,
  showTeam,
}: {
  groups: Group[]
  choices: Choices
  choose: (token: string, side: Side) => void
  showTeam: boolean
}) {
  return (
    <div className="importRows">
      {groups
        .filter((g) => showTeam || g.defaultSide === 'file')
        .map((group) => {
          const side = choices[group.token] ?? (group.conflict ? undefined : group.defaultSide)
          return (
            <section key={group.token} className={group.conflict ? 'conflict' : ''}>
              {group.conflict && (
                <strong className="conflictLabel">共編衝突 · {side ? '已選擇版本' : '請選擇版本'}</strong>
              )}
              {group.rows.length > 1 && <small>以下項目有節點參照，將一起套用</small>}
              {group.rows.map((row) => (
                <RowDiff key={row.id} row={row} conflict={group.conflict} />
              ))}
              <div className="importChoices" role="group" aria-label={title(group.rows[0])}>
                {(['team', 'file'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={side === option}
                    onClick={() => choose(group.token, option)}
                  >
                    {option === 'team' ? '保留團隊版本' : '採用 JSON'}
                  </button>
                ))}
              </div>
            </section>
          )
        })}
    </div>
  )
}
