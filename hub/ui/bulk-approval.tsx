import {useId,useRef,useState} from 'react'

type Proposal = {id:string,title:string}
export type BatchResult = {approved:number,failures:{title:string,reason:string}[]}

export async function approveEach<T extends Proposal>(items:readonly T[],approve:(item:T)=>Promise<unknown>):Promise<BatchResult> {
  const result:BatchResult={approved:0,failures:[]}
  for(const item of items){
    try {
      await approve(item)
      result.approved++
    } catch(reason) {
      result.failures.push({title:item.title,reason:reason instanceof Error?reason.message:'Übernahme fehlgeschlagen.'})
    }
  }
  return result
}

export function BulkApproval<T extends Proposal>({items,approve,description,disabled=false}:{
  items:readonly T[],approve:(items:readonly T[])=>Promise<BatchResult>,description:string,disabled?:boolean,
}){
  const [selection,setSelection]=useState<readonly T[]>()
  const [busy,setBusy]=useState(false)
  const [result,setResult]=useState<BatchResult>()
  const [error,setError]=useState('')
  const running=useRef(false)
  const confirmId=useId()
  async function submit(){
    if(!selection || running.current)return
    running.current=true
    setBusy(true);setError('');setResult(undefined)
    try{
      setResult(await approve(selection))
    }catch(cause){
      setError(cause instanceof Error?cause.message:'Vorschläge konnten nicht übernommen werden.')
    }finally{
      running.current=false
      setBusy(false);setSelection(undefined)
    }
  }
  if(!items.length&&!selection&&!result&&!error)return null
  return <footer className="bulk-approval">
    {result ? <p role="status">{result.approved} bestätigt{result.failures.length?' · '+result.failures.length+' offen':''}</p>:null}
    {result?.failures.length ? <ul role="alert">{result.failures.map((entry,index)=><li key={index}>{entry.title} · {entry.reason}</li>)}</ul>:null}
    {error?<p role="alert">{error}</p>:null}
    {selection ? <div aria-labelledby={confirmId}>
      <strong id={confirmId}>{selection.length} {selection.length===1?'Vorschlag':'Vorschläge'} bestätigen?</strong>
      <p>{description}</p>
      <div className="actions">
        <button type="button" disabled={busy} onClick={()=>setSelection(undefined)}>Abbrechen</button>
        <button className="primary" type="button" disabled={busy||disabled} onClick={()=>void submit()}>
          {busy?'Wird übernommen …':'Ja, alle bestätigen'}
        </button>
      </div>
    </div>:items.length>0?<div className="actions">
      <button type="button" disabled={disabled} onClick={()=>{setSelection([...items]);setResult(undefined);setError('')}}>Alle Vorschläge bestätigen</button>
    </div>:null}
  </footer>
}
