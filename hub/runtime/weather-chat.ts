import type { Result } from '../../agents/lifepilot/tools/validate.ts'
import { fetchOutfitWeather, outfitLocation } from '../connectors/outfit-weather.ts'
import { mentionedDates } from './message-analysis.ts'
import { Problem } from './settings.ts'
import { dateInBerlin, isDate, shiftDay } from './values.ts'

const weatherQuestion = /\b(?:wetter(?:vorhersage|bericht)?|temperatur|regnet|schneit|regenwahrscheinlichkeit)\b/iu
const separateAction = /\b(?:outfit|anziehen|reise\s+planen|packliste|erinner(?:e|ung)|aufgabe|trag\s+ein|termin\s+erstellen|buche)\b/iu

export async function weatherFromChat(
  input: string, profileLocation: string, today: string,
  forecast = fetchOutfitWeather,
): Promise<Result | null> {
  const request = input.trim()
  if (!weatherQuestion.test(request) || separateAction.test(request)) return null

  const result = {tasks:[], questions:[]}
  const dates = Object.entries(mentionedDates(request, today))
  const days = [...new Set(dates.map(([, day]) => day))]
  if (days.length > 1 || /\b(?:wochenende|nächste\s+woche)\b/iu.test(request))
    return {...result, questions:['Für welchen einzelnen Tag möchtest du das Wetter wissen?']}
  const day = days[0] ?? today
  if (!isDate(day) || day < dateInBerlin() || day > shiftDay(dateInBerlin(), 15))
    return {...result, questions:['Für welchen Tag von heute bis 15 Tage im Voraus möchtest du das Wetter wissen?']}

  const explicit = /\b(?:in|für|bei)\s+(.+?)\s*[?!.]*$/iu.exec(request)?.[1]?.trim()
  let place = explicit ?? ''
  for (const [label] of dates) {
    if (place.toLocaleLowerCase('de-DE') === label) place = ''
    else if (place.toLocaleLowerCase('de-DE').endsWith(' ' + label)) place = place.slice(0, -label.length).trim()
  }
  if (/^(?:mich|uns|mir|hier|zuhause|(?:meine[rmn]?|dem)\s+(?:aktuellen\s+)?standort)$/iu.test(place)) place = ''
  place ||= profileLocation
  if (!outfitLocation(place))
    return {...result, questions:['Für welchen Ort möchtest du das Wetter wissen? Frag zum Beispiel „Wie wird das Wetter in Stuttgart?“ oder hinterlege deinen Ort im persönlichen Profil.']}

  try {
    const weather = await forecast(place, day)
    const date = day.split('-').reverse().join('.')
    const degrees = (value: number) => value.toLocaleString('de-DE', {maximumFractionDigits:1}) + ' °C'
    const details = [
      weather.current === undefined ? '' : 'aktuell ' + degrees(weather.current),
      'Tiefstwert ' + degrees(weather.min) + ', Höchstwert ' + degrees(weather.max),
      weather.rain === undefined ? '' : 'bis zu ' + weather.rain + ' % Niederschlagswahrscheinlichkeit',
      weather.wind === undefined ? '' : 'Wind bis ' + weather.wind + ' km/h',
    ].filter(Boolean)
    return {...result, summary: `${weather.place} am ${date} · ${details.join(' · ')}. Quelle: Open-Meteo.`}
  } catch (error) {
    return {...result, questions:[error instanceof Problem ? error.message : 'Die Wetterdaten sind gerade nicht erreichbar.']}
  }
}
