import { confirmImageTransfer } from './image-consent.ts'
import {DateInput} from './presentation.tsx'
import { GroceryIcon } from './grocery-icon.tsx'
import {legacyRecipeServings,maxRecipeServings,scaleRecipeIngredients,ingredientStock,hasRecipeQuantity,measured,validRecipeServings,type RecipeStockStatus} from '../runtime/recipe-portions.ts'
import { canonicalGroceryName, groceryCategory, groceryKey, grocerySuggestions } from '../runtime/grocery-catalog.ts'
import { defaultUnit, formatQuantity, groceryUnits, parseQuantity } from '../runtime/grocery-units.ts'
import { useEffect, useState, type FormEvent } from 'react'
import { groceryCategories, locations, stockStates, type GroceryAnswer, type GroceryInput, type GroceryOverview, type StockItem, type ShoppingItem, type SavedRecipe, type RecipeChoice } from '../runtime/grocery-types.ts'
import { dateInBerlin, shiftDay } from '../runtime/values.ts'

type Api=<T>(path:string,payload?:object,timeout?:number)=>Promise<T>
type PhotoScan={rows:GroceryInput[],totalCents:number|null,text:string,expiry?:string|null,date?:string|null,operation?:string}
type Editor={place:'stock'|'shopping',item?:StockItem|ShoppingItem,prefill?:GroceryInput}
const errorText=(cause:unknown)=>cause instanceof Error?cause.message:'Die Änderung konnte nicht gespeichert werden.'
const formats='image/jpeg,image/png,image/webp,image/heic,.heic,.heif'
const empty:GroceryOverview={stock:[],shopping:[],recent:[]}
const euro=new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'})

export async function scanGroceryFile(file:File, receipt=false, item=false,codex=false):Promise<PhotoScan> {
  if(file.size>16*1024*1024) throw Error('Das Foto darf höchstens 16 MB groß sein.')
  const response=await fetch('/api/grocery/scan'+(receipt?'?kind=receipt':item?'?kind=item':''),{
    method:'POST',headers:{'Content-Type':'application/octet-stream','X-LifePilot-Confirm':codex?'codex-image':'image'},
    body:file,signal:AbortSignal.timeout(codex?105_000:62_000),
  })
  const data=await response.json()
  if(!response.ok) throw Error(data.error)
  return data
}

function RecipeStockLabel({item,status}:{item:GroceryInput,status?:RecipeStockStatus}){
  const label=!hasRecipeQuantity(item.quantity)?'Rezeptmenge fehlt':!measured(item.quantity)?null:
    status==='short'?'Zu wenig im Vorrat':status==='unknown'?'Vorratsmenge prüfen':status==='missing'?'Fehlt im Vorrat':null
  return label?<small className="recipe-stock-label">{label}</small>:null
}

export function GroceryAnswerCard({answer,hideTitle=false,statuses}:{answer:GroceryAnswer,hideTitle?:boolean,statuses?:RecipeStockStatus[]}) {
  const available=new Set(answer.available.map(name=>name.split(' · ')[0]))
  return <section className="note grocery-answer" aria-label="Ergebnis">
    {!hideTitle&&<strong>{answer.title}</strong>}
    {answer.sourceUrl?<p><a href={answer.sourceUrl} target="_blank" rel="noreferrer">Originalrezept ansehen</a></p>:null}
    {answer.ingredients?.length?<ul className="recipe-ingredient-status">{answer.ingredients.map((item,index)=><li key={item.name}>
      <input type="checkbox" checked={statuses?statuses[index]==='enough':available.has(item.name)} disabled aria-label={item.name+' im Vorrat'}/>
      <span>{[item.name,item.quantity].filter(Boolean).join(' · ')}<RecipeStockLabel item={item} status={statuses?.[index]}/></span>
    </li>)}</ul>:null}
    {!answer.ingredients?.length&&answer.available.length>0&&<div><h4>{answer.steps.length||answer.missing.length?'Vorhanden':'Artikel'}</h4>
      <p>{answer.available.join(' · ')}</p></div>}
    {!answer.ingredients?.length&&answer.missing.length>0&&<div><h4>Fehlt</h4><p>{answer.missing.map(item=>[item.name,item.quantity].filter(Boolean).join(' · ')).join(', ')}</p></div>}
    {(answer.write==='stock'||answer.write==='receipt'||answer.write==='remove')&&<div><h4>{answer.write==='remove'?'Ausgewählt':'Zur Übernahme'}</h4><p>{answer.rows.map(item=>[item.name,item.quantity].filter(Boolean).join(' · ')).join(', ')}</p></div>}
    {answer.stockRows?.length ? <div><h4>In den Vorrat</h4><p>{answer.stockRows.map(item=>item.name).join(' · ')}</p></div> : null}
    {answer.totalCents!==undefined&&<p>Bonbetrag {euro.format(answer.totalCents/100)}</p>}
    {answer.steps.length>0&&<details><summary>Zubereitung</summary><ol>{answer.steps.map((step,i)=><li key={i}>{step}</li>)}</ol></details>}
    {!answer.available.length&&!answer.missing.length&&!answer.rows.length&&!answer.steps.length&&<p>Keine Artikel gefunden.</p>}
  </section>
}

function RecipePortions({value,onChange,disabled=false}:{value:number,onChange:(value:number)=>void,disabled?:boolean}){
  const [text,setText]=useState(String(value))
  return <label className="recipe-portions">Portionen<input type="number" min={1} max={maxRecipeServings} step={1} disabled={disabled}
    value={text} onChange={event=>{
      setText(event.currentTarget.value)
      if(validRecipeServings(event.currentTarget.valueAsNumber))onChange(event.currentTarget.valueAsNumber)
    }} onBlur={()=>setText(String(value))}/></label>
}

export function ChatRecipe({answer,api,disabled,decide}:{answer:GroceryAnswer,api:Api,disabled:boolean,
  decide:(choice:RecipeChoice)=>Promise<unknown>}){
  const base=answer.baseServings??answer.servings??legacyRecipeServings
  const [servings,setServings]=useState(answer.recipeDecision?.servings??answer.servings??base)
  const [stock,setStock]=useState<StockItem[]>()
  const [save,setSave]=useState<boolean>()
  const [shop,setShop]=useState<boolean>()
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{
    let active=true
    void api<GroceryOverview>('/grocery').then(view=>{if(active)setStock(view.stock)}).catch(()=>{})
    return ()=>{active=false}
  },[api])
  const ingredients=scaleRecipeIngredients(answer.baseIngredients??answer.ingredients??[],base,servings)
  const statuses=stock?ingredientStock(ingredients,stock):ingredients.map(()=>'unknown' as const)
  const preview={...answer,stockRows:undefined,ingredients}
  const hasMissing=ingredients.some((item,index)=>Boolean(measured(item.quantity))&&['missing','short'].includes(statuses[index]))
  async function submit(cancelled=false){
    if(busy||disabled)return
    setBusy(true);setError('')
    try{
      if(!await decide({servings,save:!cancelled&&save===true,shop:!cancelled&&hasMissing&&shop===true,cancelled}))
        setError('Die Auswahl konnte nicht gespeichert werden.')
    }catch(cause){setError(errorText(cause))}
    finally{setBusy(false)}
  }
  function decision(label:string,value:boolean|undefined,change:(value:boolean)=>void){
    return <fieldset className="recipe-choice"><legend>{label}</legend>
      <div className="actions">{([true,false] as const).map(choice=><button type="button" key={String(choice)} disabled={busy||disabled}
        aria-pressed={value===choice} onClick={()=>change(choice)}>{choice?'Ja':'Nein'}</button>)}</div>
    </fieldset>
  }
  const done=answer.recipeDecision
  return <div className="chat-recipe">
    <GroceryAnswerCard answer={preview} statuses={statuses}/>
    {done?<p role="status">{done.cancelled?'Rezeptvorgang abgebrochen.':
      [done.save?'Rezept gespeichert.':'',done.shop?(done.added?done.added+(done.added===1?' Zutat':' Zutaten')+' zur Einkaufsliste hinzugefügt.':
        'Alle fehlenden Zutaten stehen bereits auf der Einkaufsliste.'):''].filter(Boolean).join(' ')||'Rezeptvorschlag abgeschlossen.'}</p>:<>
      <RecipePortions value={servings} disabled={busy||disabled} onChange={setServings}/>
      {decision('Rezept speichern?',save,setSave)}
      {hasMissing?decision('Fehlende Zutaten auf die Einkaufsliste?',shop,setShop):null}
      <div className="actions recipe-submit">
        <button type="button" disabled={busy||disabled} onClick={()=>void submit(true)}>Abbrechen</button>
        <button type="button" className="primary" disabled={busy||disabled||save===undefined||hasMissing&&shop===undefined}
          onClick={()=>void submit()}>Auswahl übernehmen</button>
      </div>
    </>}
    {error?<p role="alert">{error}</p>:null}
  </div>
}

export function ChatRecipeOptions({answer,api,disabled,decide,refine}:{answer:GroceryAnswer,api:Api,disabled:boolean,
  decide:(choice:RecipeChoice,option:number)=>Promise<unknown>,refine?:(ingredient:string)=>void}){
  const [selected,setSelected]=useState<number>()
  const [stock,setStock]=useState<StockItem[]>([])
  const [ingredient,setIngredient]=useState('')
  useEffect(()=>{
    if(!refine)return
    let active=true
    void api<GroceryOverview>('/grocery').then(view=>{if(active)setStock(view.stock)}).catch(()=>{})
    return ()=>{active=false}
  },[api,Boolean(refine)])
  const option=answer.recipeDecision?.option??selected
  const recipe=option===undefined?undefined:answer.options?.[option]
  return <section className="recipe-recommendations" aria-label="Rezeptvorschläge">
    <strong>{answer.title}</strong>
    {answer.recipeNotice?<p>{answer.recipeNotice}</p>:null}
    {recipe&&option!==undefined?<div>
      {!answer.recipeDecision?<button type="button" className="quiet" disabled={disabled} onClick={()=>setSelected(undefined)}>‹ Alle Rezeptvorschläge</button>:null}
      <ChatRecipe key={option} answer={{...recipe,recipeDecision:answer.recipeDecision}} api={api} disabled={disabled}
        decide={choice=>decide(choice,option)}/>
    </div>:<ul>{answer.options?.map((item,index)=><li key={item.title}>
      <strong>{item.title}</strong>
      {item.sourceUrl?<p><a href={item.sourceUrl} target="_blank" rel="noreferrer">Originalrezept ansehen</a></p>:null}
      {item.missing.length?<p>Noch zu prüfen oder einzukaufen: {item.missing.map(ingredient=>[ingredient.name,ingredient.quantity].filter(Boolean).join(' · ')).join(', ')}</p>:
        <p>Mit dem Vorrat machbar</p>}
      <button type="button" disabled={disabled} onClick={()=>setSelected(index)}
        aria-label={item.title+' auswählen'}>Rezept auswählen</button>
    </li>)}</ul>}
    {refine&&!answer.recipeDecision?<div className="recipe-refinement">
      <label>Zutat für die nächste Suche<select disabled={disabled} value={ingredient} onChange={event=>setIngredient(event.currentTarget.value)}>
        <option value="">Zutat wählen</option>
        {stock.filter(item=>item.status!=='empty').map(item=><option key={item.id}>{item.name}</option>)}
      </select></label>
      <button type="button" disabled={disabled||!ingredient} onClick={()=>refine(ingredient)}>Zutat in den Chat übernehmen</button>
    </div>:null}
  </section>
}

/** Menge als Zahl plus Einheit. Die Einheit richtet sich nach dem Produkt (Gramm, Milliliter, Stück …). */
function QuantityField({name,initial,label='Menge'}:{name:string,initial?:string,label?:string}) {
  const parsed=parseQuantity(initial??'')
  const free=Boolean(initial && !parsed.amount)
  const [unit,setUnit]=useState<string>(parsed.unit || (parsed.rest&&parsed.amount ? '' : defaultUnit(name)))
  const [amount,setAmount]=useState(parsed.amount)
  const [text,setText]=useState(free || parsed.rest ? initial??'' : '')
  useEffect(()=>{if(!initial)setUnit(defaultUnit(name))},[name,initial])
  const value=text || formatQuantity(amount,unit)
  return <div className="grocery-quantity" role="group" aria-label={label}><span>{label}</span><div className="grocery-quantity-inputs">
    <input type="hidden" name="quantity" value={value}/>
    {text ? <input aria-label={label} maxLength={50} value={text} onChange={event=>setText(event.target.value)}/> : <>
      <input aria-label={label+' (Zahl)'} inputMode="decimal" maxLength={8} placeholder="–" value={amount}
        onChange={event=>setAmount(event.target.value.replace(/[^\d.,½¼¾]/gu,''))}/>
      <select aria-label="Einheit" value={unit} onChange={event=>setUnit(event.target.value)}>
        <option value="">–</option>{groceryUnits.map(entry=><option key={entry}>{entry}</option>)}</select>
    </>}
  </div></div>
}

function EditItem({editor,save,cancel,remove,busy}:{editor:Editor,save:(item:GroceryInput)=>Promise<void>,
  cancel:()=>void,remove:()=>Promise<void>,busy:boolean}) {
  const item=editor.item
  const draft=item??editor.prefill
  const stock=editor.place==='stock'
  const details=draft&&'location' in draft?draft:undefined
  const [confirmDelete,setDelete]=useState(false)
  function submit(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const f=new FormData(event.currentTarget)
    void save({
      name:String(f.get('name')??''), quantity:String(f.get('quantity')??''), note:String(f.get('note')??''),
      category:(f.get('category')||undefined) as GroceryInput['category'],
      ...(stock?{location:(f.get('location')||undefined) as GroceryInput['location'],
        status:f.get('status') as GroceryInput['status']}:{}),
      expiry:String(f.get('expiry')??'')||null,
    })
  }
  return <form className="card settings grocery-edit" onSubmit={submit}><h2>{item?'Artikel bearbeiten':'Artikel hinzufügen'}</h2>
    <div className={"grocery-fields grocery-row"+(stock?" grocery-row-stock":"")}>
      <label>Name <input name="name" required maxLength={90} autoFocus defaultValue={draft?.name}/></label>
      <QuantityField key={draft?.name??'neu'} name={draft?.name??''} initial={draft?.quantity}/>
      <label>Kategorie <select name="category" defaultValue={draft?.category??''}><option value="">Automatisch</option>
        {groceryCategories.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
      {stock&&<><label>Lagerort <select name="location" defaultValue={details?.location??''}><option value="">Automatisch</option>
        {Object.entries(locations).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        <label>Bestand <select name="status" defaultValue={details?.status??'stocked'}>
          {Object.entries(stockStates).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
        </>}
      <label>MHD (optional) <DateInput name="expiry"  defaultValue={draft?.expiry??''}/></label>
      <input type="hidden" name="note" value={draft?.note??''}/>
    </div>
    <div className="actions"><button type="submit" className="primary" disabled={busy}>Speichern</button>
      <button type="button" onClick={cancel}>Abbrechen</button>
      {item&&<button type="button" disabled={busy} onClick={()=>confirmDelete?void remove():setDelete(true)}>{confirmDelete?'Entfernen bestätigen':'Entfernen'}</button>}</div>
  </form>
}

function ScanForm({busy,commit,initialKind,cloudImages}:{busy:boolean,commit:(value:object)=>Promise<void>,initialKind:'stock'|'receipt',cloudImages:boolean}) {
  const kind=initialKind
  const [scanning,setScanning]=useState(false)
  const [rows,setRows]=useState<(GroceryInput&{selected:boolean})[]>([])
  const [notice,setNotice]=useState('')
  const [amount,setAmount]=useState<number|null>(null)
  const [scanned,setScanned]=useState(false)
  const [receiptDay,setReceiptDay]=useState(dateInBerlin())
  const [operation,setOperation]=useState('')
  async function read(files:File[]) {
    if(!files.length)return
    if(files.length>(kind==='receipt'?1:4)) {setNotice(kind==='receipt'?'Wähle einen Kassenbon.':'Wähle bis zu vier Fotos.');return}
    setScanning(true);setRows([]);setNotice('');setAmount(null);setScanned(false);setReceiptDay(dateInBerlin());setOperation('')
    const found=new Map<string,GroceryInput>()
    let failed=0
    const codex=cloudImages && confirmImageTransfer(files.length)
    for(const file of files) {
      try {
        const scan=await scanGroceryFile(file,kind==='receipt',false,codex)
        for(const row of scan.rows) found.set(row.name.toLocaleLowerCase('de-DE'),row)
        if(kind==='receipt'){
          setAmount(scan.totalCents);setReceiptDay(scan.date??dateInBerlin())
          setOperation(scan.operation??crypto.randomUUID());setScanned(true)
        }
      } catch(cause) {failed++;setNotice(errorText(cause))}
    }
    setRows([...found.values()].slice(0,30).map(row=>({...row,selected:true})))
    if(!found.size&&!failed)setNotice('Keine Artikel erkannt. Ergänze sie von Hand.')
    if(failed&&found.size)setNotice('Einige Fotos konnten nicht gelesen werden. Prüfe die gefundenen Artikel.')
    setScanning(false)
  }
  return <section className="grocery-scan">
    <label>{kind==='stock'?'Vorratsfotos auswählen':'Kassenbon auswählen'} <input type="file" accept={formats} multiple={kind==='stock'}
      disabled={scanning||busy} onChange={event=>void read(Array.from(event.currentTarget.files??[]))}/></label>
    {scanning&&<div role="status">Foto wird geprüft … <progress aria-label="Fotoanalyse"/></div>}
    {notice&&<p role="status">{notice}</p>}
    {(rows.length>0||scanned)&&<>
      <ul className="grocery-scanned">{rows.map((row,index)=><li key={index}>
        <div className="grocery-scan-choice">
          <button type="button" aria-label={row.name+' übernehmen'} aria-pressed={row.selected}
            onClick={()=>setRows(items=>items.map((item,i)=>i===index?{...item,selected:true}:item))}>✓</button>
          <button type="button" aria-label={row.name+' überspringen'} aria-pressed={!row.selected}
            onClick={()=>setRows(items=>items.map((item,i)=>i===index?{...item,selected:false}:item))}>✕</button>
        </div>
        <input aria-label="Artikelname" maxLength={90} value={row.name}
          onChange={e=>setRows(items=>items.map((item,i)=>i===index?{...item,name:e.target.value}:item))}/>
        <input aria-label={row.name+' Menge'} maxLength={50} value={row.quantity??''} placeholder="Menge"
          onChange={e=>setRows(items=>items.map((item,i)=>i===index?{...item,quantity:e.target.value}:item))}/>
      </li>)}</ul>
      {kind==='receipt' && <div className="grocery-fields">
        <label>Gesamtbetrag in Euro <input type="number" step=".01" min=".01" max="10000" value={amount===null?'':amount/100}
          onChange={event=>setAmount(event.target.value?Math.round(event.target.valueAsNumber*100):null)}/></label>
        <label>Belegdatum <DateInput value={receiptDay} onChange={event=>setReceiptDay(event.target.value)}/></label>
      </div>}
      <div className="actions"><button type="button" className="primary" disabled={busy||(kind==='receipt'?
        !amount||amount<1||amount>1_000_000||!receiptDay:!rows.some(x=>x.selected&&x.name.trim()))} onClick={()=>void (async()=>{
        await commit({action:'scan',place:kind,items:rows.filter(r=>r.selected&&r.name.trim()).map(({selected,...row})=>row),
          ...(kind==='receipt'?{receipt:{title:'Gesamtrechnung Einkauf',cents:amount,date:receiptDay},operation}:{})})
        setRows([]);setAmount(null);setScanned(false);setNotice('Übernommen.')
      })().catch(cause=>setNotice(errorText(cause)))}>{kind==='receipt'?'Artikel übernehmen & Einkauf buchen':'Auswahl übernehmen'}</button></div>
    </>}
  </section>
}

const tabs = ['Einkaufsliste','Mein Vorrat','Meine Rezepte'] as const
type GroceryTab = typeof tabs[number]

function RecipesPanel({api,onAsk,notice,changed,refreshKey,stock,shopping}:{api:Api,onAsk:(servings:number)=>void,stock:StockItem[],shopping:ShoppingItem[],notice:(message:string)=>void,
  changed:()=>void,refreshKey:string}) {
  const [portions,setPortions]=useState(1)
  const [recipePortions,setRecipePortions]=useState<Record<string,number>>({})
  const [ideaPortions,setIdeaPortions]=useState<Record<string,number>>({})
  const [quantityEdit,setQuantityEdit]=useState<{id:string,values:string[]}>()
  const [recipes,setRecipes]=useState<SavedRecipe[]>([])
  const [ideas,setIdeas]=useState<GroceryAnswer[]>([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [removing,setRemoving]=useState<string>()
  const [version,setVersion]=useState(0)
  useEffect(()=>{
    let current=true
    void api<SavedRecipe[]>('/grocery/recipes').then(value=>{if(current)setRecipes(value)})
      .catch(cause=>{if(current)setError(errorText(cause))})
    return ()=>{current=false}
  },[api,refreshKey,version])
  async function act(payload:object,feedback?:string) {
    setBusy(true);setError('')
    try {await api('/grocery/recipes',{...payload,confirm:true});setVersion(value=>value+1);if(feedback)notice(feedback);return true}
    catch(cause){setError(errorText(cause))}
    finally{setBusy(false)}
  }
  async function getIdeas(servings:number) {
    setBusy(true);setError('')
    try {setIdeas(await api<GroceryAnswer[]>('/grocery/recipes/ideas?'+new URLSearchParams({servings:String(servings)})));setIdeaPortions({})}
    catch(cause){setError(errorText(cause))}
    finally{setBusy(false)}
  }
  async function shop(idea:GroceryAnswer) {
    setBusy(true);setError('')
    try {await api('/grocery/change',{action:'ingredients',items:idea.rows,draft:idea.title,confirm:true});changed();notice('Fehlende Zutaten zur Einkaufsliste hinzugefügt.')}
    catch(cause){setError(errorText(cause))}
    finally{setBusy(false)}
  }
  const shoppingKeys=new Set(shopping.map(item=>groceryKey(item.name)))
  const previews=ideas.map(idea=>{
    const servings=ideaPortions[idea.title]??idea.servings??portions
    const ingredients=scaleRecipeIngredients(idea.baseIngredients??idea.ingredients??[],idea.baseServings??idea.servings??1,servings)
    const statuses=ingredientStock(ingredients,stock)
    const missing=ingredients.filter((item,index)=>statuses[index]!=='enough'&&
      (Boolean(measured(item.quantity))||!hasRecipeQuantity(item.quantity)))
    return {...idea,servings,ingredients,missing,statuses,
      rows:ingredients.filter((item,index)=>['missing','short'].includes(statuses[index])&&Boolean(measured(item.quantity))&&!shoppingKeys.has(groceryKey(item.name)))}
  })
  return <section className="card settings grocery-recipes">
    <div className="grocery-recipe-actions">
      <button type="button" className="primary" disabled={busy} onClick={()=>void getIdeas(portions)}>Aus meinem Vorrat kochen</button>
      <button type="button" onClick={()=>onAsk(portions)}>Pilot nach Rezepten fragen</button>
    </div>
    <RecipePortions value={portions} disabled={busy} onChange={setPortions}/>
    {error&&<p role="alert">{error}</p>}
    {previews.length>0&&<div className="grocery-recipe-ideas"><h2>Rezeptideen</h2>{previews.map(idea=><details key={idea.title}>
      <summary><strong>{idea.title}</strong><small>{idea.missing.length?idea.missing.length+(idea.missing.length===1?' Zutat offen':' Zutaten offen'):'Mit Vorrat machbar'}</small></summary>
      <RecipePortions value={idea.servings} disabled={busy} onChange={value=>setIdeaPortions(previous=>({...previous,[idea.title]:value}))}/>
      <GroceryAnswerCard answer={idea} hideTitle statuses={idea.statuses}/>
      <div className="actions"><button type="button" disabled={busy} onClick={()=>void act({action:'save',recipe:idea},'Rezept gespeichert.')}>Rezept speichern</button>
        {idea.rows.length>0&&<button type="button" disabled={busy} onClick={()=>void shop(idea)}>Fehlende Zutaten auf die Liste</button>}</div>
    </details>)}</div>}
    {recipes.map(recipe=>{
      const base=recipe.baseServings??recipe.servings??legacyRecipeServings
      const servings=recipePortions[recipe.id]??recipe.servings??base
      const originals=recipe.baseIngredients??recipe.ingredients
      const ingredients=scaleRecipeIngredients(originals,base,servings)
      const statuses=ingredientStock(ingredients,stock)
      const checks=statuses.map((status,index)=>recipe.ingredientOverrides?.[index]??(status==='enough'))
      const edits=quantityEdit?.id===recipe.id?quantityEdit:undefined
      async function savePortions(){
        if(await act({action:'portions',recipeId:recipe.id,servings,quantities:edits?.values},'Rezept aktualisiert.')){
          setQuantityEdit(undefined)
        }
      }
      return <details className="grocery-saved-recipe" key={recipe.id}>
      <summary><strong>{recipe.title}</strong><small>{statuses.filter(status=>status==='enough').length}/{recipe.ingredients.length} Zutaten ausreichend</small>
        <button type="button" className="quiet recipe-remove" aria-label={recipe.title+' entfernen'} title="Rezept entfernen" disabled={busy}
          onClick={event=>{event.preventDefault();event.stopPropagation();if(window.confirm('„'+recipe.title+'“ aus deinen Rezepten entfernen?'))void act({action:'remove',recipeId:recipe.id},'Rezept entfernt.')}}>×</button></summary>
      {recipe.sourceUrl?<p><a href={recipe.sourceUrl} target="_blank" rel="noreferrer">Originalrezept ansehen</a></p>:null}
      <RecipePortions value={servings} disabled={busy} onChange={value=>setRecipePortions(previous=>({...previous,[recipe.id]:value}))}/>
      {edits?<div className="recipe-quantity-editor">
        <p>Gib die Mengen für die Rezeptbasis von {base} {base===1?'Portion':'Portionen'} ein.</p>
        <div className="profile-grid">{originals.map((item,index)=><label key={index}>{item.name}
          <input value={edits.values[index]} maxLength={50} placeholder="z. B. 100 g" onChange={event=>{
            const value=event.currentTarget.value
            setQuantityEdit({...edits,values:edits.values.map((quantity,i)=>i===index?value:quantity)})
          }}/></label>)}</div>
      </div>:null}
      <div className="actions recipe-submit">
        {servings!==(recipe.servings??base)||edits?<button type="button" className="primary" disabled={busy} onClick={()=>void savePortions()}>
          {edits?'Rezept speichern':'Portionen speichern'}
        </button>:null}
        <button type="button" disabled={busy} onClick={()=>setQuantityEdit(edits?undefined:{id:recipe.id,values:originals.map(item=>item.quantity??'')})}>
          {edits?'Abbrechen':'Zutatenmengen bearbeiten'}
        </button>
      </div>
      <div className="grocery-recipe-checklists">
        <div><h3>Zutaten</h3><ul>{ingredients.map((item,index)=><li key={index}><label>
          <input type="checkbox" checked={checks[index]} disabled={busy} onChange={event=>void act({
            action:'check',recipeId:recipe.id,part:'ingredients',index,checked:event.target.checked,
          })}/><span>{[item.name,item.quantity].filter(Boolean).join(' · ')}</span>
        </label><RecipeStockLabel item={item} status={statuses[index]}/></li>)}</ul></div>
        <div><h3>Zubereitung</h3><ol>{recipe.steps.map((step,index)=><li key={index}><label>
          <input type="checkbox" checked={recipe.stepChecks[index]} disabled={busy} onChange={event=>void act({
            action:'check',recipeId:recipe.id,part:'steps',index,checked:event.target.checked,
          })}/><span>{step}</span>
        </label></li>)}</ol></div>
      </div>
      {removing===recipe.id?<div className="actions"><button type="button" disabled={busy} onClick={()=>void act({action:'remove',recipeId:recipe.id},'Rezept entfernt.')}>Entfernen bestätigen</button>
        <button type="button" onClick={()=>setRemoving(undefined)}>Abbrechen</button></div>:
        <button type="button" className="quiet" onClick={()=>setRemoving(recipe.id)}>Rezept entfernen</button>}
    </details>})}
  </section>
}

export function GroceryPanel({api,refreshKey,onAsk,recipeVersion,cloudImages}:{api:Api,refreshKey:string,onAsk:(servings:number)=>void,recipeVersion:number,cloudImages:boolean}) {
  const [tab,setTab]=useState<GroceryTab>('Einkaufsliste')
  const [view,setView]=useState(empty)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  const [editor,setEditor]=useState<Editor>()
  const [showScan,setShowScan]=useState(false)
  const [choosing,setChoosing]=useState(false)
  const [quick,setQuick]=useState('')
  const [quickArticle,setQuickArticle]=useState('')
  const [quickActive,setQuickActive]=useState(false)
  const [quickIndex,setQuickIndex]=useState(-1)
  const [search,setSearch]=useState('')
  const [filter,setFilter]=useState('')
  const [change,setChange]=useState(0)
  const [photowait,setPhotowait]=useState(false)
  const [photoRows,setPhotoRows]=useState<GroceryInput[]>([])
  const isShopping=tab==='Einkaufsliste'
  const place=isShopping?'shopping':'stock'
  useEffect(()=>{
    let current=true
    void api<GroceryOverview>('/grocery').then(data=>{if(current)setView(data)})
      .catch(cause=>{if(current)setError(errorText(cause))}).finally(()=>{if(current)setLoading(false)})
    return ()=>{current=false}
  },[api,refreshKey,change,recipeVersion])
  function chooseTab(next:GroceryTab) {
    setTab(next);setSearch('');setFilter('');setEditor(undefined);setShowScan(false)
    setChoosing(false);setPhotoRows([]);setError('');setNotice('');setQuickArticle('')
  }
  async function act(payload:object) {
    setBusy(true);setError('');setNotice('')
    try {await api('/grocery/change',{...payload,confirm:true});setChange(value=>value+1)}
    catch(cause){setError(errorText(cause));throw cause}
    finally{setBusy(false)}
  }
  const fire=(payload:object)=>void act(payload).catch(()=>{})
  function beginEdit(prefill?:GroceryInput) {
    setPhotoRows([]);setChoosing(false);setEditor({place,prefill})
  }
  async function photo(file:File) {
    setPhotowait(true);setError('');setPhotoRows([])
    try {
      const result=await scanGroceryFile(file,false,true,cloudImages && confirmImageTransfer())
      if(result.rows.length>1)setPhotoRows(result.rows)
      else {
        beginEdit(result.rows[0]??{name:'',expiry:result.expiry})
        setNotice(result.rows.length?'Prüfe die erkannten Angaben vor dem Speichern.':
          result.expiry?'Datum erkannt. Ergänze den Artikelnamen.':'Ergänze die Angaben zum Artikel.')
      }
    } catch(cause) {setError(errorText(cause))}
    finally {setPhotowait(false)}
  }
  const cart=view.shopping.filter(item=>item.checked)
  const today=dateInBerlin()
  const expiry=shiftDay(today,2)
  const soon=view.stock.filter(item=>item.status!=='empty'&&item.expiry&&item.expiry<=expiry)
  const match=(item:ShoppingItem|StockItem)=>item.name.toLocaleLowerCase('de-DE').includes(search.trim().toLocaleLowerCase('de-DE'))
  const visible=view.stock.filter(item=>match(item)&&(!filter||(filter==='low'?item.status!=='stocked':item.location===filter)))
  const shownShopping=view.shopping.filter(match)
  const suggestions=grocerySuggestions(quick,[...view.stock,...view.recent,...view.shopping].map(item=>item.name))
  return <div className="grocery-page">
    <nav className="grocery-tabs" aria-label="Vorrat & Einkauf">
      {tabs.map(name=><button type="button" key={name} disabled={photowait} aria-pressed={tab===name} onClick={()=>chooseTab(name)}>{name}</button>)}
    </nav>
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    {loading&&<p role="status">Vorrat wird geladen …</p>}
    {tab==='Meine Rezepte'?<RecipesPanel api={api} onAsk={onAsk} stock={view.stock} shopping={view.shopping} notice={setNotice} changed={()=>setChange(value=>value+1)}
      refreshKey={refreshKey+':'+recipeVersion}/>:<>
      <div className="grocery-toolbar grocery-top-tools">
        <label><span className="sr-only">Artikel suchen</span><input type="search" value={search} placeholder="Artikel suchen …"
          onChange={event=>setSearch(event.target.value)}/></label>
        {isShopping&&<button type="button" className="secondary" aria-expanded={showScan}
          onClick={()=>{setShowScan(value=>!value);setChoosing(false)}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 3l2 2 2-2 3 2 3-2 2 2 2-2v18l-2-2-2 2-3-2-3 2-2-2-2 2zM8 9h8m-8 4h8"/></svg>
          Kassenbon einscannen
        </button>}
        <button type="button" className="primary" disabled={busy||photowait} aria-expanded={choosing}
          onClick={()=>{setChoosing(value=>!value);setEditor(undefined);setShowScan(false)}}>+ Artikel</button>
      </div>
      {choosing&&<section className="card settings grocery-source-choice" aria-label="Artikel hinzufügen">
        <div className="actions"><button type="button" disabled={photowait} onClick={()=>beginEdit()}>Selbst eintragen</button>
          <label>Foto auswählen <input type="file" accept={formats} disabled={photowait}
            onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void photo(file)}}/></label></div>
        {photowait&&<div role="status">Artikel wird erkannt … <progress aria-label="Artikel wird erkannt"/></div>}
        {photoRows.length>0&&<div className="actions">{photoRows.map(row=><button key={row.name} type="button" onClick={()=>beginEdit(row)}>{row.name}</button>)}</div>}
      </section>}
      {editor&&<EditItem key={editor.place+':'+(editor.item?.id??'new')} editor={editor} busy={busy} cancel={()=>setEditor(undefined)} save={async draft=>{
        try {await act({action:'put',place:editor.place,item:editor.item?.id,draft});setEditor(undefined)} catch { /* Shown above. */ }
      }} remove={async()=>{try{await act({action:'remove',place:editor.place,item:editor.item?.id});setEditor(undefined)}catch{ /* Shown above. */ }}}/>}
      {isShopping?<section className="card settings grocery-shopping"><div className="grocery-stock-head">
        <small>{view.shopping.length-cart.length} offen{cart.length?' · '+cart.length+' im Wagen':''}</small>

      </div>
        {showScan&&<ScanForm cloudImages={cloudImages} busy={busy} commit={act} initialKind="receipt"/>}
        <form className="grocery-quick" onSubmit={event=>{
          event.preventDefault()
          if(!quick.trim()||busy)return
          const name=quickIndex>=0 ? suggestions[quickIndex] ?? canonicalGroceryName(quick) : canonicalGroceryName(quick)
          setQuick(name);setQuickArticle(name);setQuickActive(false);setQuickIndex(-1)
        }}>
          <div className="grocery-quick-field"><label><span className="sr-only">Artikel schnell hinzufügen</span>
            <input value={quick} maxLength={90} placeholder="Artikel schnell hinzufügen …" autoComplete="off"
              role="combobox" aria-expanded={quickActive&&suggestions.length>0} aria-controls="grocery-quick-suggestions"
              aria-autocomplete="list" aria-activedescendant={quickIndex>=0?'grocery-suggestion-'+quickIndex:undefined}
              onFocus={()=>setQuickActive(true)} onBlur={()=>{setQuickActive(false);setQuickIndex(-1)}}
              onChange={event=>{setQuick(event.target.value);setQuickIndex(-1);setQuickArticle('')}}
              onKeyDown={event=>{
                if (event.key==='Escape') {setQuickActive(false);setQuickIndex(-1)}
                else if (['ArrowDown','ArrowUp'].includes(event.key) && suggestions.length) {
                  event.preventDefault();setQuickActive(true)
                  setQuickIndex(index=>Math.max(0,Math.min(suggestions.length-1,index+(event.key==='ArrowDown'?1:-1))))
                }
              }}/></label>
            {quickActive&&suggestions.length ? <ul role="listbox" id="grocery-quick-suggestions">
              {suggestions.map((label,index)=><li key={label} role="option" aria-selected={quickIndex===index} id={'grocery-suggestion-'+index}>
                <button type="button" onMouseDown={event=>event.preventDefault()} onClick={()=>{
                  setQuick(label);setQuickArticle(label);setQuickActive(false);setQuickIndex(-1)
                }}>{label}</button>
              </li>)}
            </ul>:null}
          </div>
          <button type="submit" className="quiet" disabled={!quick.trim()||busy} aria-label="Schnell hinzufügen">+</button>
        </form>
        {quickArticle&&<form className="grocery-quick" key={quickArticle} onSubmit={event=>{
          event.preventDefault()
          const quantity=new FormData(event.currentTarget).get('quantity')
          void act({action:'put',place:'shopping',draft:{name:quickArticle,quantity}})
            .then(()=>{setQuick('');setQuickArticle('');setQuickIndex(-1)}).catch(()=>{})
        }}>
          <QuantityField name={quickArticle} label={'Menge für '+quickArticle+' (optional)'}/>
          <div className="actions"><button type="submit" className="primary" disabled={busy}>Hinzufügen</button>
            <button type="button" className="quiet" onClick={()=>setQuickArticle('')}>Abbrechen</button></div>
        </form>}
        {!shownShopping.length&&<p>{search?'Keine passenden Artikel.':'Deine Einkaufsliste ist leer.'}</p>}
        {groceryCategories.map(([id,label,icon])=>{
          const items=shownShopping.filter(item=>item.category===id)
          if (!items.length) return null
          return <section className="grocery-group" key={id} aria-label={label}>
            <h3>{label}</h3>
            <div className="grocery-tiles grocery-shopping-grid">
              {items.map(item=><div key={item.id} className="grocery-tile" data-checked={item.checked}>
                <button type="button" className="grocery-check" disabled={busy} aria-pressed={item.checked}
                  onClick={()=>fire({action:'check',item:item.id,checked:!item.checked})}>
                  <span className="grocery-tile-symbol" aria-hidden="true">
                    {item.checked ? '✓' : <GroceryIcon name={item.name} fallback={icon}/>}
                  </span>
                  <strong title={item.name}>{item.name}</strong>
                  <small title={[item.quantity,item.note].filter(Boolean).join(' · ')}>
                    {[item.quantity,item.note].filter(Boolean).join(' · ')}
                  </small>
                </button>
                <button type="button" className="icon-button grocery-edit-tile" aria-label={item.name+' bearbeiten'}
                  onClick={()=>{setEditor({place:'shopping',item});setChoosing(false)}}>⋯</button>
              </div>)}
            </div>
          </section>
        })}
        {cart.length>0&&<button type="button" className="primary" disabled={busy} onClick={()=>void act({action:'checkout',items:cart.map(x=>x.id)})
          .then(()=>setNotice('Einkauf in den Vorrat übernommen.')).catch(()=>{})}>Einkauf abschließen ({cart.length})</button>}
        {view.recent.length>0&&<div className="grocery-group"><h3>Kürzlich gekauft</h3><div className="grocery-tiles">
          {view.recent.filter(match).map(item=><button type="button" key={item.id}
            disabled={busy||view.shopping.some(x=>x.name===item.name)} onClick={()=>fire({action:'put',place:'shopping',draft:item})}>+ {item.name}</button>)}</div></div>}
      </section>:<section className="card settings grocery-stock-panel">
        <div className="grocery-stock-head"><small>{view.stock.filter(item=>item.status!=='empty').length} vorrätig{soon.length?' · '+soon.length+' mit nahem oder vergangenem MHD':''}</small>
          <button type="button" className="quiet" aria-expanded={showScan} onClick={()=>{setShowScan(value=>!value);setChoosing(false)}}>Vorrat scannen</button>
        </div>
        {showScan&&<ScanForm cloudImages={cloudImages} busy={busy} commit={act} initialKind="stock"/>}
        <div className="actions grocery-filters" aria-label="Lagerort und Bestand filtern">{[['','Alle'],...Object.entries(locations),['low','Knapp & leer']].map(([key,title])=>
          <button type="button" key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{title}</button>)}</div>
        {!visible.length&&<p>Hier sind keine passenden Artikel.</p>}
        {groceryCategories.map(([id,label,icon])=>{
          const rows=visible.filter(item=>item.category===id)
          if(!rows.length)return null
          return <div className="grocery-group" key={id}><h3><span aria-hidden>{icon} </span>{label}</h3><ul className="grocery-stock">
            {rows.map(item=><li key={item.id}><div className="grocery-stock-details">
              <button type="button" className="quiet grocery-name" onClick={()=>{setEditor({item,place:'stock'});setChoosing(false)}}>
                <GroceryIcon name={item.name} fallback={icon}/>{item.name}
              </button>
              <small>{[item.quantity,locations[item.location],item.expiry?'MHD '+item.expiry.split('-').reverse().join('.'):''].filter(Boolean).join(' · ')}</small>
            </div><div className="grocery-stock-actions">
              <button type="button" className="grocery-status" data-status={item.status} disabled={busy} onClick={()=>fire({
              action:'put',place:'stock',item:item.id,draft:{...item,status:item.status==='stocked'?'low':item.status==='low'?'empty':'stocked'},
            })}>{stockStates[item.status]}</button>
              {item.status!=='stocked'&&<button type="button" className="quiet" disabled={busy} onClick={()=>fire({
                action:'put',place:'shopping',draft:{name:item.name,category:item.category},
              })}>+ Liste</button>}
                <button type="button" disabled={busy} aria-label={item.name+' bearbeiten'} onClick={()=>{setEditor({item,place:'stock'});setChoosing(false)}}>Bearbeiten</button>
                <button type="button" disabled={busy} aria-label={item.name+' entfernen'} onClick={()=>{
                  if (window.confirm(item.name+' aus dem Vorrat entfernen?')) fire({action:'remove',place:'stock',item:item.id})
                }}>Entfernen</button>
              </div></li>)}</ul></div>
        })}
      </section>}
    </>}
  </div>
}
