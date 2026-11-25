import { useEffect, useMemo, useRef, useState } from 'react'
import { api, errorText, type Graph, type Snapshot } from '../api'
import { compare, resolve, type Choices } from './merge'
import { readFile, validate } from './file'
import { identifyChanges, unpackDocument, type Origin } from './provenance'
import { useImportTransaction } from './useImportTransaction'
import { preserveFields } from './preserveFields'
import { ChangeReview } from './ChangeReview'
import { ImportHistory } from './ImportHistory'

export function ImportDialog({
  base,
  remoteRev,
  close,
  applied,
  open,
}: {
  base: Snapshot
  remoteRev: number
  close: () => void
  applied: (rev: number, count: number) => void
  open: (id: string) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const { path, latest, busy, setBusy, error, setError, apply } = useImportTransaction(
    base,
    remoteRev,
    applied,
  )
  const [file, setFile] = useState<Graph | null>(null)
  const [label, setLabel] = useState('')
  const [origin, setOrigin] = useState<Origin>()
  const [choices, setChoices] = useState<Choices>({})
  const [unversionedUpload, setUnversionedUpload] = useState(false)
  const [allowRemoval, setAllowRemoval] = useState(false)
  const protectMissing = unversionedUpload && !allowRemoval
  const omissions = useMemo(() => {
    const labels = new Set<string>()
    if (unversionedUpload && file) preserveFields(file, latest.graph, labels)
    return [...labels]
  }, [unversionedUpload, file, latest.graph])
  const [team, setTeam] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  const groups = useMemo(
    () => (file ? compare(base.graph, file, latest, origin, protectMissing) : []),
    [base, file, latest, origin, protectMissing],
  )
  const plan = useMemo(() => resolve(latest, groups, choices), [latest, groups, choices])
  const invalid = useMemo(() => {
    if (!file || plan.unresolved) return ''
    try {
      validate(plan.graph, latest.graph)
      return ''
    } catch (e) {
      return errorText(e)
    }
  }, [file, plan, latest.graph])
  function review(graph: Graph, name: string, source?: Origin, upload = false) {
    setUnversionedUpload(upload && !source)
    setAllowRemoval(false)
    setOrigin(source)
    setFile(graph)
    setLabel(name)
    setChoices({})
    setTeam(false)
    setError('')
  }
  async function select(input: File) {
    setBusy(true)
    try {
      const { graph, manifest } = unpackDocument(await readFile(input, true))
      review(graph, input.name, await identifyChanges(graph, manifest, latest), true)
    } catch (e) {
      setFile(null)
      setLabel(input.name)
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const items = groups.filter((g) => g.defaultSide === 'file').flatMap((g) => g.rows)
  const added = items.filter((r) => r.team === undefined).length
  const deleted = items.filter((r) => r.file === undefined).length
  return (
    <dialog
      ref={dialog}
      className="dialog importDialog"
      aria-labelledby="import-title"
      onCancel={(e) => {
        if (busy) e.preventDefault()
        else close()
      }}
    >
      <h2 id="import-title">從 JSON 更新畫布</h2>
      <p>
        {base.canvas.name} · 比對開始時 v{base.canvas.rev} · 目前 v{latest.canvas.rev}
      </p>
      <fieldset disabled={busy}>
        <label>
          選擇流程 JSON
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const input = e.target.files?.[0]
              e.target.value = ''
              if (input) void select(input)
            }}
          />
        </label>
        <ImportHistory
          path={path + '/imports'}
          setBusy={setBusy}
          review={review}
          copy={async (graph, rev) => {
            const result = await api<{ id: string }>(
              'workspaces/' + base.canvas.workspace + '/canvases',
              'POST',
              {
                name: base.canvas.name.slice(0, 96) + ' · v' + rev,
                graph,
              },
            )
            open(result.id)
          }}
        />
        {file && (
          <>
            <h3>{label}</h3>
            <p>
              {origin
                ? '以此檔案匯出時的 v' + origin.revision + ' 為基準，已保留之後的獨立修改。'
                : '以開啟比對時的畫布為基準。請確認檔案中缺少的項目是否要移除。'}
            </p>
            {omissions.length > 0 && (
              <label className="teamToggle">
                <input type="checkbox" checked={allowRemoval} onChange={e => {
                  setAllowRemoval(e.target.checked)
                  setChoices({})
                }} />
                移除 JSON 未提供的{omissions.join('、')}（預設保留）
              </label>
            )}
            <p aria-live="polite">
              新增 {added} · 修改 {items.length - added - deleted} · 移除 {deleted}
              {plan.unresolved > 0 && <strong> · {plan.unresolved} 組衝突待選擇</strong>}
            </p>
            {!items.length && <p>這份 JSON 沒有待套用的差異。</p>}
            {groups.some((g) => g.defaultSide === 'team') && (
              <label className="teamToggle">
                <input
                  type="checkbox"
                  checked={team || !!invalid}
                  disabled={!!invalid}
                  onChange={(e) => setTeam(e.target.checked)}
                />
                顯示其他團隊修改（預設保留）
              </label>
            )}
            <ChangeReview
              groups={groups}
              choices={choices}
              showTeam={team || !!invalid}
              choose={(key, side) => {
                setError('')
                setChoices((old) => ({ ...old, [key]: side }))
              }}
            />
          </>
        )}
      </fieldset>
      {invalid && <p role="alert">選擇的版本組合無法套用。{invalid}</p>}
      {error && <p role="alert">{error}</p>}
      <footer>
        <button disabled={busy} onClick={close}>
          取消
        </button>
        <button
          className="primary"
          disabled={!file || busy || !!invalid || !!plan.unresolved}
          onClick={() => apply(file, origin, choices, protectMissing)}
        >
          {busy ? '處理中…' : plan.ops.length ? '套用 ' + plan.ops.length + ' 項變更' : '完成比對'}
        </button>
      </footer>
    </dialog>
  )
}
