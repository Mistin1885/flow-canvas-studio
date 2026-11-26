import KnowledgeLibrary from '../knowledge/KnowledgeLibrary'
import type {Picker} from '../knowledge/types'
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { ArrowLeft, GitFork, Activity, X, Download, Copy } from 'lucide-react'
import { api, errorText, type Canvas, type Graph, type Snapshot } from '../api'
import { DisplayControls } from '../display/DisplayControls'
import { type useDisplayPreferences } from '../display/useDisplayPreferences'
import { useCanvasSession } from './useCanvasSession'
import type { Workbench } from './WorkbenchWindow'
import { downloadJson } from '../import/file'
import { ImportDialog } from '../import/ImportDialog'
import { DraftReview } from './DraftReview'
import { ActivityDialog,useLastVisit } from './ActivityDialog'
const Overview = import.meta.env.MODE === 'core' ? null : lazy(() => import('./Overview'))
export default function Editor({
  canvas,
  workspace,
  display,
  targetNode, identity,
  open,
  back,
}: {
  canvas: Canvas
  workspace: string
  display: ReturnType<typeof useDisplayPreferences>
  targetNode?: string
  identity: string
  open: (id: string) => void
  back: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [library,setLibrary]=useState<true|Picker|null>(null)
  const [loaded, setLoaded] = useState(false)
  const [map, setMap] = useState<{graph:Graph;rev:number} | null>(null)
  const [showActivity,setActivity]=useState(false)
  const [review,setReview]=useState(false)
  const [mapBusy,setMapBusy]=useState(false)
  const visit=useLastVisit(canvas.id,identity)
  const [importResult, setImportResult] = useState('')
  const [exportError, setExportError] = useState('')
  const [importBase, setImportBase] = useState<Snapshot | null>(null)
  const { canvasName, remoteRev, status, issue, draft, busy, ready, current, actions, fork, download } = useCanvasSession(
    canvas,
    identity,
    frame,
    loaded,
    open,
  )
  const conflictId = draft?.confirmedConflict ? draft.operation_id : undefined
  useEffect(() => {
    if (conflictId) setReview(true)
  }, [conflictId])
  useEffect(()=>{
    const win=frame.current?.contentWindow
    if(!loaded || !win)return
    const pick=(e:Event)=>setLibrary((e as CustomEvent<Picker>).detail)
    const navigate=()=>setLibrary(null)
    window.addEventListener('hashchange',navigate)
    win.addEventListener('studio-knowledge',pick)
    return ()=>{win.removeEventListener('studio-knowledge',pick);window.removeEventListener('hashchange',navigate)}
  },[loaded])
  useEffect(()=>{
    if(ready && targetNode && current.current?.graph.nodes[targetNode])
      (frame.current?.contentWindow as Workbench)?.T1Playbook.go(targetNode,true)
  },[ready,targetNode,current])
  useEffect(() => {
    if (loaded) (frame.current?.contentWindow as Workbench)?.T1Playbook?.setCanvasTitle(canvasName)
  }, [loaded, canvasName])
  useEffect(() => {
    if (loaded)
      (frame.current?.contentWindow as Workbench)?.T1Playbook?.setDisplayPreferences(display.prefs)
  }, [loaded, display.prefs])
  useEffect(() => {
    const win = frame.current?.contentWindow
    if (!loaded || !win || busy || draft) return
    const show = () => {
      if (current.current) setImportBase(structuredClone(current.current))
    }
    function exportFile(event: Event) {
      event.preventDefault()
      setExportError('')
      void downloadJson(canvas.id).catch((e) => setExportError(errorText(e)))
    }
    win.addEventListener('studio-export', exportFile)
    win.addEventListener('studio-import', show)
    return () => {
      win.removeEventListener('studio-import', show)
      win.removeEventListener('studio-export', exportFile)
    }
  }, [loaded, busy, draft, current, canvas.id])
  useEffect(() => {
    if (!importResult) return
    const timer = window.setTimeout(() => setImportResult(''), 5500)
    return () => window.clearTimeout(timer)
  }, [importResult])
  useEffect(()=>{
    const mark=()=>{if(current.current)visit.seen(current.current.canvas.rev)}
    window.addEventListener('pagehide',mark)
    return ()=>{mark();window.removeEventListener('pagehide',mark)}
  },[canvas.id,identity,current])
  async function updateMap(){
    setMapBusy(true)
    try {const s=await api<Snapshot>('canvases/'+canvas.id);setMap(previous => previous && previous.rev < s.canvas.rev ? {graph:s.graph,rev:s.canvas.rev} : previous)}
    catch(e){setExportError(errorText(e))}
    finally{setMapBusy(false)}
  }
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
        <b>{canvasName}</b>
        <div className="editorTools">
          {!map && <DisplayControls {...display} />}
          <span className="live">
            <Activity size={14} />
            {status}
          </span>
          <button disabled={!ready || busy || !!draft} onClick={()=>setLibrary(true)}>畫布知識</button>
          <button disabled={!ready || !!draft} onClick={()=>setActivity(true)}>變更紀錄</button>
          {Overview && (
            <button
              onClick={() => current.current && setMap({graph:current.current.graph,rev:current.current.canvas.rev})}
              disabled={!ready || busy || !!draft}
            >
              <GitFork size={15} />
              節點總覽
            </button>
          )}
        </div>
      </header>
      {exportError && (
        <aside className="warning" role="alert">
          {exportError}
        </aside>
      )}
      {issue && (
        <aside className="warning" role="alert">
          <b>{issue}</b>
          {draft && (
            <div>
              <span>你的草稿已保留。</span>
              {(!(draft.createdNode || draft.strict) || draft.confirmedConflict) &&
                <button disabled={busy} onClick={()=>setReview(true)}>比對並合併草稿</button>}
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
      {importResult && (
        <p role="status" className="importResult">
          {importResult}
        </p>
      )}
      {library && <KnowledgeLibrary identity={identity} name={workspace+' / '+canvasName} space={canvas.workspace} canvas={canvas.id} close={()=>setLibrary(null)} picker={library===true?undefined:library}/>}
      {showActivity && <ActivityDialog canvas={canvas.id} after={visit.last} close={()=>setActivity(false)}
        exists={id=>!!current.current?.graph.nodes[id]} locate={id=>{setActivity(false);(frame.current?.contentWindow as Workbench).T1Playbook.go(id,true)}}/>}
      {review && draft && <DraftReview submit={actions.current.submitReview} canvas={canvas.id} draft={draft} revision={remoteRev} close={()=>setReview(false)}
        done={()=>{setReview(false);actions.current.discard()}}/>}
      {importBase && (
        <ImportDialog
          base={importBase}
          remoteRev={remoteRev}
          open={open}
          close={() => setImportBase(null)}
          applied={(rev, count) => {
            setImportResult(count ? '已套用 ' + count + ' 項變更 · v' + rev : '已完成比對，畫布沒有變更')
            actions.current.refreshTo(rev)
            setImportBase(null)
          }}
        />
      )}
      {map && Overview && (
        <section className="mapOverlay">
          <header>
            <h2>節點總覽 · v{map.rev}</h2>
            {remoteRev>map.rev && <button disabled={mapBusy} onClick={updateMap}>有新版 · 更新總覽</button>}
            <DisplayControls {...display} />
            <button onClick={() => setMap(null)} aria-label="關閉總覽">
              <X size={18} />
            </button>
          </header>
          <Suspense fallback={<p>正在載入總覽…</p>}>
            <Overview
              graph={map.graph}
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
