import {useEffect,useRef,useState,type ComponentProps} from 'react'

const dayFormat=new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'})
const monthFormat=new Intl.DateTimeFormat('de-DE',{month:'long',year:'numeric',timeZone:'UTC'})

export function displayDay(value:string) {
  const date=new Date(value+'T00:00:00Z')
  return Number.isNaN(date.valueOf())?'':dayFormat.format(date)
}

export function monthAtOffset(month:string,offset:number) {
  const date=new Date(month+'-01T00:00:00Z')
  date.setUTCMonth(date.getUTCMonth()+offset)
  return date.toISOString().slice(0,7)
}

export function MonthStepper({month,onChange,max,disabled}:{month:string,onChange:(month:string)=>void,max?:string,disabled?:boolean}){
  return <div className="month-stepper" role="group" aria-label="Monat">
    <button className="icon-button" type="button" aria-label="Vorheriger Monat" disabled={disabled}
      onClick={()=>onChange(monthAtOffset(month,-1))}>‹</button>
    <output aria-live="polite">{monthFormat.format(new Date(month+'-01T00:00:00Z'))}</output>
    <button className="icon-button" type="button" aria-label="Nächster Monat" disabled={disabled||Boolean(max&&month>=max)}
      onClick={()=>onChange(monthAtOffset(month,1))}>›</button>
  </div>
}

type DateTimeProps=Omit<ComponentProps<'input'>,'type'|'value'|'defaultValue'>&{
  value?:string, defaultValue?:string,
}
function DateTimeInput({value,defaultValue,onChange,kind,...props}:DateTimeProps&{kind:'date'|'time'}){
  const [uncontrolled,setUncontrolled]=useState(defaultValue??'')
  const inputRef=useRef<HTMLInputElement>(null)
  useEffect(()=>{
    const form=inputRef.current?.form
    if(value!==undefined||!form)return
    function reset(){setUncontrolled(defaultValue??'')}
    form.addEventListener('reset',reset)
    return ()=>form.removeEventListener('reset',reset)
  },[value,defaultValue])
  const current=value??uncontrolled
  return <span className="fixed-date-input">
    <input {...props} ref={inputRef} type={kind} value={value} defaultValue={value===undefined?defaultValue:undefined} onChange={event=>{
      if(value===undefined)setUncontrolled(event.target.value)
      onChange?.(event)
    }}/>
    <span className="fixed-date-text" aria-hidden="true">{kind==='date'?displayDay(current)||'TT.MM.JJJJ':current.slice(0,5)||'HH:MM'}</span>
  </span>
}

export function DateInput(props:DateTimeProps){return <DateTimeInput {...props} kind="date"/>}
export function TimeInput(props:DateTimeProps){return <DateTimeInput {...props} kind="time"/>}

const vendorNames:Record<string,string>={asos:'ASOS',uniqlo:'UNIQLO',weekday:'Weekday',paypal:'PayPal',amazon:'Amazon',zalando:'Zalando',dhl:'DHL'}
export function displayIdentity(value:string,payPalPayment=false){
  const trimmed=value.trim()
  const address=/<([^<>\s]+@[^<>\s]+)>/u.exec(trimmed)?.[1]??trimmed
  const domain=/^(?:[\w.%+-]+@)?([a-z0-9][a-z0-9.-]+\.[a-z]{2,})$/iu.exec(address)?.[1]
  if(!domain)return trimmed
  const parts=domain.toLowerCase().split('.')
  const base=parts.at(-2)??domain
  if(base==='paypal'&&payPalPayment)return 'PayPal-Zahlung'
  return vendorNames[base]??base.replace(/[-_]+/gu,' ').replace(/\b[a-z]/gu,letter=>letter.toUpperCase())
}

export function productDisplayName(value:string) {
  return value.replace(/\s+\|\s.*$/u,'').replace(/#[\da-f]{6}\b/giu,'').replace(/\s{2,}/gu,' ').trim()||'Kleidungsstück'
}

const colorPalette:Record<string,string>={braun:'#765342',bordeaux:'#782d44',burgunder:'#782d44',schwarz:'#252625',weiß:'#fffdf8',
  grau:'#93958f',grün:'#467057',blau:'#3d6087',rot:'#a8413e',beige:'#c7b598',rosa:'#bf8191',gelb:'#d5b550'}
export function displayColor(value:string){
  const swatch=/#([\da-f]{6})\b/iu.exec(value)?.[0]
  const label=value.replace(/#[\da-f]{6}\b/giu,'').replace(/[|(),]+$/u,'').trim()
  const named=Object.keys(colorPalette).find(color=>label.toLocaleLowerCase('de-DE').includes(color))
  if(label||!swatch)return {label,swatch:swatch??(named?colorPalette[named]:undefined)}
  const rgb=swatch.slice(1).match(/../gu)!.map(channel=>parseInt(channel,16))
  const closest=Object.entries(colorPalette).map(([name,hex])=>({
    name,distance:hex.slice(1).match(/../gu)!.reduce((sum,channel,index)=>sum+(parseInt(channel,16)-rgb[index])**2,0),
  })).sort((a,b)=>a.distance-b.distance)[0].name
  return {label:closest.charAt(0).toUpperCase()+closest.slice(1),swatch}
}
