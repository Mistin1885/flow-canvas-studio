import { useState,useEffect,useRef } from 'react'
import { api, ApiError, errorText, type Snapshot } from '../api'
import { type Choices } from '../import/merge'
import { validate } from '../import/file'
import { draftPlan,type Draft } from './draftMerge'

function readable(value:unknown) {
  if(value === undefined) return '（已移除）'
  return typeof value==='string'?value:JSON.stringify(value,null,2)
}
export function DraftReview({canvas,draft,revision,done,close}:{canvas:string;draft:Draft;revision:number;done:()=>void;close:()=>void}){
  const ref=useRef<HTMLDialogElement>(null)
  const [latest,setLatest]=useState<Snapshot|null>(null),[choices,setChoices]=useState<Choices>({})
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  useEffect(()=>{ref.current?.showModal()},[])
  useEffect(()=>{
    let active=true
    api<Snapshot>('canvases/'+canvas).then(s=>{if(active)setLatest(s)}).catch(e=>active&&setError(errorText(e)))
    return ()=>{active=false}
  },[canvas,revision,retry])
  const plan=latest && draftPlan(draft,latest,choices)
  async function apply(){
    if(!plan || !latest || busy) return
    setBusy(true);setError('')
    try {
      validate(plan.graph)
      if(plan.ops.length) await api('canvases/'+canvas+'/changes','POST',{base:latest.canvas.rev,ops:plan.ops,strict:true})
      else {
        const current = await api<Snapshot>('canvases/' + canvas)
        if (current.canvas.rev !== latest.canvas.rev) {
          setLatest(current)
          setError('團隊版本已更新，請確認最新比對')
          return
        }
      }
      done()
    } catch(e){
      setError(errorText(e))
      if(e instanceof ApiError && [409,412].includes(e.status))setRetry(n=>n+1)
    }finally{setBusy(false)}
  }
  return <dialog ref={ref} className="dialog importDialog" aria-labelledby="draft-review-title" onCancel={e=>busy?e.preventDefault():close()}>
    <header><h2 id="draft-review-title">比對草稿與團隊版本</h2><button disabled={busy} onClick={close}>關閉</button></header>
    {latest && plan ? <>
      <p>草稿 v{draft.base} · 團隊 v{latest.canvas.rev} · {plan.ops.length} 項待套用</p>
      {!plan.questions.length && <p>相容的修改已合併，可以套用。</p>}
      {plan.questions.map((q,index)=><fieldset key={q.token}><legend>{q.label}</legend>
        {(['team','file'] as const).map(side=><label key={side}><input type="radio" name={'draft-choice-'+index} checked={choices[q.token]===side} onChange={()=>setChoices(c=>({...c,[q.token]:side}))}/>{side==='team'?'保留團隊版本':'採用我的草稿'}<pre>{readable(side==='team'?q.team:q.mine)}</pre></label>)}</fieldset>)}
      <button className="primary" disabled={busy||latest.canvas.rev<revision||plan.questions.some(q=>!choices[q.token])} onClick={apply}>確認並套用</button>
    </> : <p>讀取團隊版本…</p>}
    {error && <p role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>重新讀取</button></p>}
  </dialog>
}
