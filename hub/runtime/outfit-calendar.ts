import type {OutfitDaypart,OutfitStyle} from './outfit-types.ts'

const clock=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})

export function outfitCalendarContext(title:string,at?:string,category?:string|null):{
  occasion:string,style:OutfitStyle,daypart?:OutfitDaypart,time?:string
}{
  const text=title.toLocaleLowerCase('de-DE')
  const [dress,style]=/training|sport|fitness|gym|fußball|volleyball|laufen|joggen/u.test(text)?['Sport & Bewegung','Schlicht'] as const:
    category==='work'||/arbeit|meeting|büro|business|office|werkstudent/u.test(text)?['Business Casual','Schlicht'] as const:
    /hochzeit|gala|date|dinner|empfang/u.test(text)?['Schicker Anlass','Eleganz'] as const:
    /freunde|freizeit|draußen|konzert/u.test(text)?['Freizeit','Streetwear'] as const:
    category==='university'||/hochschule|vorlesung|seminar|\buni\b/u.test(text)?['Uni & Alltag','Schlicht'] as const:['Alltag','Schlicht'] as const
  const time=at&&Number.isFinite(Date.parse(at))?clock.format(new Date(at)):undefined
  const evening=time?time>='17:30':/abend|dinner|nacht/u.test(text)
  const daypart:OutfitDaypart|undefined=evening?'Abends':time?time<'11:30'?'Morgens':'Mittags':undefined
  return {occasion:(dress+' · '+title.replace(/[\x00-\x1f\x7f]+/gu,' ')).slice(0,110),style,daypart,time}
}
