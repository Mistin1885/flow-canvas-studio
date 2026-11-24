import { useEffect, useRef, useState } from 'react'
import { api, errorText } from '../api'

type Entry = { rev:number; first_rev:number|null; editor:string; created:string; kind:string; items:{id?:string;title?:string;action:string;count?:number}[] }
const labels:Record<string,string> = {added:'新增',removed:'刪除',edited:'修改',connections:'連線變更',settings:'畫布設定',created:'建立畫布',renamed:'重新命名',imported:'套用匯入',restored:'還原快照'}

export function useLastVisit(canvas:string, user:string) {
  const key='flow-visit:'+JSON.stringify([user,canvas])
  const [last] = useState(()=>{ try {return Number(localStorage.getItem(key)) || 0} catch {return 0} })
  function seen(rev:number) {
    try {localStorage.setItem(key,String(Math.max(Number(localStorage.getItem(key)) || 0,rev)))} catch { /* Storage can be disabled. */ }
  }
  return {last,seen}
}

export function ActivityDialog({canvas,after,locate,exists,close}:{canvas:string;after:number;locate:(id:string)=>void;exists:(id:string)=>boolean;close:()=>void}) {
  const ref=useRef<HTMLDialogElement>(null)
  const [entries,setEntries]=useState<Entry[]>([]), [cursor,setCursor]=useState(after)
  const [more,setMore]=useState(false), [error,setError]=useState(''), [loading,setLoading]=useState(true)
  useEffect(()=>{ref.current?.showModal()},[])
  useEffect(()=>{
    let active=true
    setLoading(true)
    api<{entries:Entry[];more:boolean}>(`canvases/${canvas}/activity/${cursor}`).then(r=>{
      if(active){setEntries(prev=>cursor===after?r.entries:[...prev,...r.entries]);setMore(r.more)}
    }).catch(e=>active&&setError(errorText(e))).finally(()=>active&&setLoading(false))
    return ()=>{active=false}
  },[canvas,after,cursor])
  return <dialog ref={ref} className="dialog activityDialog" onCancel={close}>
    <header><h2>變更紀錄</h2><button onClick={close}>關閉</button></header>
    <p>每張畫布最多保留最近 200 筆。相同編輯者在同一個 5 分鐘區間的連續一般修改會合併顯示。</p>
    <p>{after ? '自上次檢視（v'+after+'）以來' : '這個瀏覽器首次檢視，顯示可用紀錄。'}</p>
    {error && <p role="alert">{error}</p>}
    {entries.map(e=><section key={e.rev}><strong>{e.first_rev ? 'v'+e.first_rev+'–' : ''}v{e.rev} · {e.editor} · {labels[e.kind]}</strong> <time>{new Date(e.created).toLocaleString()}</time>
      <ul>{e.items.map((i,k)=><li key={k}>{i.action === 'more' ? '另有 '+i.count+' 項變更' : labels[i.action]} {i.id && exists(i.id) && i.action !== 'removed' ? <button onClick={()=>locate(i.id!)}>{i.title}</button> : i.title}</li>)}</ul></section>)}
    {!loading && !entries.length && !error && <p>沒有新的變更紀錄。</p>}
    {loading && <p>載入中…</p>}
    {more && <button disabled={loading} onClick={()=>setCursor(entries[entries.length-1].rev)}>載入更多</button>}
  </dialog>
}
