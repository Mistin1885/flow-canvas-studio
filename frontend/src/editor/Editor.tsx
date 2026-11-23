import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowLeft, GitFork, Activity, X, Download, Copy } from 'lucide-react'
import type { Canvas, Graph } from '../api'
import { DisplayControls } from '../display/DisplayControls'
import { type useDisplayPreferences } from '../display/useDisplayPreferences'
import { useCanvasSession } from './useCanvasSession'
import type { Workbench } from './WorkbenchWindow'
const Overview = import.meta.env.MODE === 'core' ? null : lazy(() => import('./Overview'))
export default function Editor({
  canvas,
  workspace,
  display,
  identity,
  open,
  back,
}: {
  canvas: Canvas
  workspace: string
  display: ReturnType<typeof useDisplayPreferences>
  identity: string
  open: (id: string) => void
  back: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [loaded, setLoaded] = useState(false)
  const [map, setMap] = useState<Graph | null>(null)
  const { status, issue, draft, busy, current, actions, fork, download } = useCanvasSession(
    canvas,
    identity,
    frame,
    loaded,
    open,
  )
  useEffect(() => {
    if (loaded)
      (frame.current?.contentWindow as Workbench)?.T1Playbook?.setDisplayPreferences(display.prefs)
  }, [loaded, display.prefs])
  function leave() {
    const editing = (frame.current?.contentWindow as Workbench)?.T1Playbook?.editing()
    if (!busy && (!editing || confirm('離開後會關閉目前的編輯表單，確定返回？'))) back()
  }
  return (
    <main className="editor">
      <header className="editorBar">
        <button className="icon" onClick={leave} disabled={busy} aria-label="返回工作區">
          <ArrowLeft size={19} />
        </button>
        <span className="crumb">{workspace}</span>
        <span className="slash">/</span>
        <b>{canvas.name}</b>
        <div className="editorTools">
          {!map && <DisplayControls {...display} />}
          <span className="live">
            <Activity size={14} />
            {status}
          </span>
          {Overview && (
            <button
              onClick={() => current.current && setMap(current.current.graph)}
              disabled={busy || !!draft}
            >
              <GitFork size={15} />
              節點總覽
            </button>
          )}
        </div>
      </header>
      {issue && (
        <aside className="warning" role="alert">
          <b>{issue}</b>
          {draft && (
            <div>
              <span>你的草稿已保留。可複製成新畫布，再與團隊版本對照。</span>
              <button disabled={busy} onClick={fork}>
                <Copy size={15} />
                另存草稿畫布
              </button>
              <button onClick={download}>
                <Download size={15} />
                下載草稿
              </button>
              <button disabled={busy} onClick={() => actions.current.retry()}>
                重試儲存
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (confirm('捨棄這份草稿並載入團隊版本？')) actions.current.discard()
                }}
              >
                載入團隊版本
              </button>
            </div>
          )}
        </aside>
      )}
      <iframe
        ref={frame}
        title="流程工作台"
        src="/workbench.html?studio"
        onLoad={() => setLoaded(true)}
      />
      {map && Overview && (
        <section className="mapOverlay">
          <header>
            <h2>節點總覽</h2>
            <DisplayControls {...display} />
            <button onClick={() => setMap(null)} aria-label="關閉總覽">
              <X size={18} />
            </button>
          </header>
          <Suspense fallback={<p>正在載入總覽…</p>}>
            <Overview
              graph={map}
              prefs={display.prefs}
              locate={(id) => {
                setMap(null)
                ;(frame.current?.contentWindow as Workbench).T1Playbook.go(id, true)
              }}
            />
          </Suspense>
        </section>
      )}
    </main>
  )
}
