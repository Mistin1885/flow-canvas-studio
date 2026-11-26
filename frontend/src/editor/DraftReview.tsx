import { GitMerge, X } from 'lucide-react'
import { CompatibleFields, DraftConflictField } from './DraftConflictFields'
import { useState,useEffect,useRef } from 'react'
import { api, records, errorText, type Snapshot } from '../api'
import { type Choices } from '../import/merge'
import { validate } from '../import/file'
import { draftPlan,type Draft } from './draftMerge'

import { resolveCreation } from './creationConflict'

export function DraftReview({canvas,draft,revision,done,close,submit}:{submit:(item:Draft)=>void;canvas:string;draft:Draft;revision:number;done:()=>void;close:()=>void}){
  const ref=useRef<HTMLDialogElement>(null)
  const [latest,setLatest]=useState<Snapshot|null>(null),[choices,setChoices]=useState<Choices>({})
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  useEffect(()=>{ref.current?.showModal()},[])
  useEffect(()=>{
    let active=true
    api<Snapshot>('canvases/'+canvas).then(s=>{if(active)setLatest(s)}).catch(e=>active&&setError(errorText(e)))
    return ()=>{active=false}
  },[canvas,revision,retry])
  const creation = latest && resolveCreation(draft, latest)
  const plan = latest && creation && draftPlan(creation.draft, latest, choices)
  async function apply(){
    if(!plan || !latest || busy) return
    setBusy(true);setError('')
    try {
      validate(plan.graph, latest.graph)
      if (plan.ops.length) {
        const before = records(latest.graph)
        submit({ graph: plan.graph, base: latest.canvas.rev, ops: plan.ops, strict: true, optionEdits: draft.optionEdits,
          operation_id: crypto.randomUUID(), createdNode: creation?.replacement ?? draft.createdNode,
          originals: plan.ops.map(op => before[op.table][op.key] ?? null) })
        close()
        return
      } else {
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
    }finally{setBusy(false)}
  }
  const remaining = plan?.questions.filter(q => !choices[q.token]).length ?? 0
  return <dialog ref={ref} className="dialog importDialog draftReview" aria-labelledby="draft-review-title"
    onCancel={event => busy ? event.preventDefault() : close()}>
    <header className="draftReviewHead">
      <span className="draftReviewIcon"><GitMerge size={22} aria-hidden="true"/></span>
      <div><h2 id="draft-review-title">比對草稿與團隊版本</h2>
        {latest && <p>草稿基於 v{draft.base}<span aria-hidden="true"> · </span>團隊目前 v{latest.canvas.rev}</p>}</div>
      <button type="button" className="icon" aria-label="關閉" onClick={close} disabled={busy}><X size={19}/></button>
    </header>
    <div className="draftReviewBody">
      {latest && plan ? <>
        {creation?.replacement && <p>節點 ID「{draft.createdNode}」已有人使用。套用後將改用「{creation.replacement}」，並更新相關連線。</p>}
        {plan.questions.length > 0
          ? <p className="draftInstruction">為每個衝突選擇要保留的內容。</p>
          : <p>沒有需要選擇的衝突，可以直接確認。</p>}
        {plan.questions.map((question, index) =>
          <DraftConflictField key={question.token} question={question} index={index} choice={choices[question.token]}
            choose={side => setChoices(current => ({ ...current, [question.token]: side }))}/>)}
        <CompatibleFields fields={plan.compatible}/>
      </> : <p>讀取團隊版本…</p>}
      {error && <p role="alert">{error} <button onClick={() => setRetry(n => n + 1)}>重新讀取</button></p>}
    </div>
    <footer>
      <span role="status">{remaining ? <><b>{remaining}</b> 處衝突待選擇</> : plan ? <><b>{plan.ops.length}</b> 項待套用</> : '讀取中'}</span>
      <button className="primary" disabled={busy || !latest || !plan || latest.canvas.rev < revision || remaining > 0} onClick={apply}>確認並套用</button>
    </footer>
  </dialog>
}
