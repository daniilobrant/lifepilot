import { useEffect, useRef, useState } from 'react'

type Recognition = EventTarget & {
  lang: string
  processLocally: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onend: (() => void) | null
  onerror: ((event: Event & { error: string }) => void) | null
  onresult: ((event: Event & { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
}
type LocalSpeech = {
  new(): Recognition
  available?: (options: { langs: string[], processLocally: true }) => Promise<string>
  install?: (options: { langs: string[], processLocally: true }) => Promise<boolean>
}
const language = { langs: ['de-DE'], processLocally: true } as const
const fallback = 'Klicke ins Nachrichtenfeld und drücke die Mikrofontaste am Mac oder wähle Bearbeiten → Diktat starten.'

function recordingType() {
  if (!navigator.mediaDevices || !window.MediaRecorder) return undefined
  return ['audio/mp4;codecs=mp4a.40.2','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type))
}

function MicrophoneWave({stream}:{stream:MediaStream|null}) {
  const meter=useRef<HTMLSpanElement>(null)
  useEffect(()=>{
    if (!stream || !meter.current || !window.AudioContext) return
    let context:AudioContext|undefined
    let frame=0
    try {
      context=new AudioContext()
      const analyser=context.createAnalyser()
      analyser.fftSize=512
      const input=context.createMediaStreamSource(stream)
      input.connect(analyser)
      const bars=Array.from(meter.current.children) as HTMLElement[]
      const samples=new Float32Array(analyser.fftSize)
      const levels=bars.map(()=>0)
      let last=0
      function draw(now:number) {
        frame=requestAnimationFrame(draw)
        if (now-last<55) return
        last=now
        analyser.getFloatTimeDomainData(samples)
        let sum=0
        for (const sample of samples) sum+=sample*sample
        levels.shift()
        levels.push(Math.min(1,Math.sqrt(sum/samples.length)*7))
        bars.forEach((bar,index)=>bar.style.setProperty('--level',String(0.13+levels[index]*0.87)))
      }
      frame=requestAnimationFrame(draw)
      void context.resume().catch(()=>{})
    } catch { /* The recording remains available when the visual meter cannot start. */ }
    return ()=>{cancelAnimationFrame(frame);void context?.close().catch(()=>{})}
  },[stream])
  return <span ref={meter} className="dictation-wave" aria-hidden="true">
    {Array.from({length:38},(_,index)=><i key={index}/>)}
  </span>
}

export function Dictation({ disabled, append, focus, stopSignal }: {
  disabled: boolean, append: (value: string) => void, focus: () => void, stopSignal: number,
}) {
  const recognition = useRef<Recognition | null>(null)
  const recording = useRef<{recorder:MediaRecorder, stream:MediaStream, timer:number}|undefined>(undefined)
  function releaseRecording() {
    const current=recording.current
    if (!current) return
    recording.current=undefined
    window.clearTimeout(current.timer)
    if (current.recorder.state!=='inactive') current.recorder.stop()
    current.stream.getTracks().forEach(track=>track.stop())
  }

  const generation = useRef(0)
  const transcription=useRef<AbortController|null>(null)
  const [stream,setStream]=useState<MediaStream|null>(null)
  const [active, setActive] = useState(false)
  const [pending, setPending] = useState(false)
  const [canInstall, setCanInstall] = useState(false)
  const [status, setStatus] = useState('')
  useEffect(() => {
    return () => {
      generation.current++
      transcription.current?.abort()
      releaseRecording()
      const current = recognition.current
      recognition.current = null
      if (current) { current.onend = null; current.onerror = null; current.onresult = null; current.abort() }
    }
  }, [])

  useEffect(() => {
    generation.current++
    transcription.current?.abort()
    releaseRecording()
    setStream(null);setActive(false);setPending(false);setStatus('')
    const current = recognition.current
    recognition.current=null
    if (current) {current.onend=null;current.onerror=null;current.onresult=null;current.abort()}
  }, [disabled, stopSignal])

  function restoreFocus() {requestAnimationFrame(focus)}

  function cancel() {
    generation.current++
    transcription.current?.abort()
    releaseRecording()
    const current=recognition.current
    recognition.current=null
    if (current) {current.onend=null;current.onerror=null;current.onresult=null;current.abort()}
    setStream(null);setActive(false);setPending(false);setStatus('')
    restoreFocus()
  }

  async function recordLocally() {
    const mimeType=recordingType()
    if (!mimeType) {setStatus(fallback);return}
    const id=++generation.current
    setPending(true);setStatus('')
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true})
      if (generation.current!==id) {stream.getTracks().forEach(track=>track.stop());return}
      let recorder:MediaRecorder
      try {recorder=new MediaRecorder(stream,{mimeType,audioBitsPerSecond:64000})}
      catch (error) {stream.getTracks().forEach(track=>track.stop());throw error}
      const chunks:Blob[]=[]
      recorder.ondataavailable=event=>{if(event.data.size) chunks.push(event.data)}
      recorder.onstop=()=>{
        if(recording.current?.recorder===recorder) releaseRecording()
        if (generation.current!==id) return
        setStream(null);setActive(false);setPending(true);setStatus('Diktat wird auf dem Mac erkannt …')
        const controller=new AbortController()
        transcription.current=controller
        void (async()=>{
          try {
            const audio=new Blob(chunks,{type:'audio/mp4'})
            if (!audio.size) {setStatus('Es wurde keine Sprache erkannt.');return}
            const response=await fetch('/api/chat/dictation',{method:'POST',
              headers:{'Content-Type':'audio/mp4','X-LifePilot-Confirm':'dictation'},body:audio,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(85000)])})
            const result=await response.json()
            if(generation.current!==id) return
            if(!response.ok) throw Error(result.error)
            if(result.text) {append(result.text);setStatus('')}
            else setStatus('Es wurde keine Sprache erkannt.')
          } catch (error) {
            if(generation.current===id) setStatus(error instanceof Error ? error.message : fallback)
          } finally {
            if (transcription.current===controller) transcription.current=null
            if(generation.current===id) setPending(false)
            if(generation.current===id) restoreFocus()
          }
        })()
      }
      recorder.onerror=()=>{
        generation.current++
        releaseRecording()
        setStream(null);setActive(false);setPending(false);setStatus('Die Mikrofonaufnahme wurde unterbrochen.')
      }
      recording.current={recorder,stream,timer:window.setTimeout(()=>releaseRecording(),90_000)}
      recorder.start()
      setStream(stream);setActive(true);setStatus('Pilot hört zu …')
    } catch (error) {
      releaseRecording()
      if (generation.current===id) setStatus(error instanceof DOMException && error.name==='NotAllowedError' ?
        'Mikrofonzugriff wurde nicht erlaubt.' : fallback)
    } finally {if(generation.current===id) setPending(false)}
  }

  async function toggle(install = false) {
    if (recording.current) {releaseRecording();return}
    if (recognition.current) { recognition.current.stop(); return }
    focus()
    const platform = window as Window & { SpeechRecognition?: LocalSpeech, webkitSpeechRecognition?: LocalSpeech }
    const Speech = platform.SpeechRecognition ?? platform.webkitSpeechRecognition
    if (!install && recordingType()) {
      await recordLocally();return
    }
    if (!Speech?.available) { await recordLocally();return }
    const options = { ...language, langs: [...language.langs] }
    const id = ++generation.current
    setPending(true)
    setCanInstall(false)
    setStatus(install ? 'Deutsches Sprachpaket wird geladen …' : '')
    try {
      if (install && !await Speech.install?.(options)) throw new Error(fallback)
      const available = await Speech.available(options)
      if (generation.current !== id) return
      if (available !== 'available') {
        if (available!=='downloadable') { await recordLocally();return }
        setCanInstall(Boolean(Speech.install))
        setStatus(available === 'downloadable' ? 'Deutsche Spracherkennung braucht ein lokales Sprachpaket.' : fallback)
        return
      }
      const current = new Speech()
      if (!('processLocally' in current)) { await recordLocally();return }
      current.lang = options.langs[0]!
      current.processLocally = true
      let transcript=''
      let failed=false
      current.onresult = event => {
        transcript=Array.from(event.results).map(result => result[0]?.transcript ?? '').join(' ').trim()
      }
      current.onend = () => {
        if (generation.current!==id) return
        recognition.current = null
        if (!failed && transcript) append(transcript)
        restoreFocus()
        setActive(false)
        setStatus(previous => previous === 'Pilot hört zu …' ? '' : previous)
      }
      current.onerror = event => {
        failed=true
        setStatus(event.error === 'not-allowed' ? 'Mikrofonzugriff wurde nicht erlaubt. ' + fallback :
          event.error === 'no-speech' ? 'Es wurde keine Sprache erkannt.' : fallback)
      }
      recognition.current = current
      try { current.start() } catch (reason) { recognition.current = null; throw reason }
      setActive(true)
      setStatus('Pilot hört zu …')
    } catch {
      if (generation.current===id) {
        if (install) setStatus(fallback)
        else await recordLocally()
      }
    }
    finally { if (generation.current === id) setPending(false) }
  }
  if (active || pending) return <div className="dictation-capture" role="group" aria-label="Sprachaufnahme">
    <button className="quiet dictation-control" type="button" aria-label="Aufnahme verwerfen" onClick={cancel}>×</button>
    <div className="dictation-signal" role="status">
      <span>{active?'Aufnahme läuft':status || 'Mikrofon wird geöffnet …'}</span>
      {active ? <MicrophoneWave stream={stream}/>:<progress aria-label="Sprachaufnahme wird vorbereitet"/>}
    </div>
    {active ? <button className="dictation-control dictation-stop" type="button" aria-label="Aufnahme beenden und transkribieren"
      onClick={()=>void toggle()}><span aria-hidden="true"/></button>:null}
  </div>
  return <>
    <button className="quiet composer-tool" type="button" disabled={disabled}
      aria-label="Spracheingabe" title="Spracheingabe" onClick={() => void toggle()}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11v1a7 7 0 0 0 14 0v-1M12 19v3m-3 0h6"/>
      </svg>
    </button>
    {status ? <span className="dictation-status" role="status">{status}
      {canInstall ? <button className="quiet" type="button" disabled={disabled || pending} onClick={() => void toggle(true)}>Sprachpaket laden</button> : null}
    </span> : null}
  </>
}
