import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { api, errorText, type Workspace, type Canvas } from '../api'
import { unpackDocument } from '../import/provenance'
import { readFile } from '../import/file'
export type Modal = {
  action: 'import' | 'space' | 'canvas' | 'copy' | 'renameSpace' | 'renameCanvas'
  item?: Workspace
}

export function CatalogDialog({
  modal,
  workspaces,
  workspaceId,
  refresh,
  close,
  go,
}: {
  modal: Modal
  workspaces: Workspace[]
  workspaceId: string
  refresh: () => Promise<void>
  close: () => void
  go: (type: string, id: string) => void
}) {
  const [name, setName] = useState(
    modal.action === 'copy'
      ? (modal.item?.name || '').slice(0, 115) + ' 副本'
      : modal.action.startsWith('rename')
        ? modal.item?.name || ''
        : '',
  )
  const [file, setFile] = useState<File | null>(null)
  const [target, setTarget] = useState(workspaceId)
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    dialog.current?.showModal()
  }, [])
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setFormError('')
    try {
      const clean = name.trim()
      if (!clean) throw new Error('請輸入名稱')
      let navigate: [string, string] | null = null
      if (modal.action === 'space') {
        const result = await api<Workspace>('workspaces', 'POST', { name: clean })
        navigate = ['workspace', result.id]
      } else if (modal.action.startsWith('rename')) {
        const kind = modal.action === 'renameSpace' ? 'workspaces' : 'canvases'
        await api(kind + '/' + modal.item!.id, 'PATCH', { name: clean, previous: modal.item!.name })
      } else {
        const result = await api<Canvas>('workspaces/' + target + '/canvases', 'POST', {
          name: clean,
          graph: modal.action === 'import' && file ? unpackDocument(await readFile(file)).graph : undefined,
          source: modal.action === 'copy' ? modal.item?.id : undefined,
        })
        navigate = ['canvas', result.id]
      }
      await refresh()
      close()
      if (navigate) go(...navigate)
    } catch (e) {
      setFormError(errorText(e))
    } finally {
      setSaving(false)
    }
  }
  const formTitle = {
    import: '從 JSON 建立畫布',
    space: '建立工作區',
    canvas: '建立畫布',
    copy: '複製畫布',
    renameSpace: '重新命名工作區',
    renameCanvas: '重新命名畫布',
  }[modal.action]
  return (
    <dialog
      className="dialog"
      ref={dialog}
      onCancel={(e) => {
        if (saving) e.preventDefault()
        else close()
      }}
    >
      <form onSubmit={submit}>
        <header>
          <h2>{formTitle}</h2>
          <button
            type="button"
            className="icon"
            disabled={saving}
            aria-label="關閉"
            onClick={() => close()}
          >
            <X size={18} />
          </button>
        </header>
        {modal.action === 'import' && (
          <label>
            流程 JSON
            <input
              type="file"
              accept=".json,application/json"
              required
              disabled={saving}
              onChange={(e) => {
                const selected = e.target.files?.[0] ?? null
                setFile(selected)
                if (!name && selected) setName(selected.name.replace(/\.json$/i, '').slice(0, 120))
              }}
            />
          </label>
        )}
        {modal.action === 'copy' && (
          <label>
            目的工作區
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          名稱
          <input
            autoFocus
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={modal.action === 'space' ? '例如：伺服器驗證' : '輸入名稱'}
          />
        </label>
        {formError && <p role="alert">{formError}</p>}
        <footer>
          <button type="button" disabled={saving} onClick={() => close()}>
            取消
          </button>
          <button className="primary" disabled={saving}>
            {saving ? '儲存中…' : formTitle}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
