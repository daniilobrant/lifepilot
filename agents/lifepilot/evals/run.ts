/*
 * Live-Auswertung des Pilot-Chats: schickt jeden Fall aus chat-cases.json an das eingestellte Modell
 * (Codex oder Claude Code CLI) und prüft das Ergebnis gegen die Erwartung. Verbraucht Modellkontingent.
 *
 *   node agents/lifepilot/evals/run.ts            alle Fälle
 *   node agents/lifepilot/evals/run.ts kombi      nur Fälle, deren ID „kombi“ enthält
 *
 * Läuft nur in einem Profil mit freigegebenem Chat (installierte Version); der Bericht landet in evals/LAST_RUN.md.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { runCodex } from '../../../hub/adapters/codex.ts'
import { modelProvider } from '../../../hub/adapters/claude.ts'
import { analyseMessage } from '../../../hub/runtime/message-analysis.ts'
import { cloudModel } from '../../../hub/runtime/settings.ts'
import { seriesFromChat } from '../../../hub/runtime/calendar-series-chat.ts'
import { taskBoardFromChat } from '../../../hub/runtime/tasks-board-chat.ts'
import type { ModelMessage } from '../../../hub/runtime/model-payload.ts'
import type { Result } from '../tools/validate.ts'

type Expect = { units?: string[], anyOf?: string[][], notUnits?: string[], question?: boolean, noQuestion?: boolean, choices?: number | string[], dates?: string[], link?: string, titleIncludes?: string, groceryIntent?: string, answerIncludes?: string, questionIncludes?: string, textIncludes?: string }
/** Ein Fall ist eine Nachricht (input) oder ein Dialog (turns); expect gilt für die letzte Nachricht, ein Array je Nachricht (null = ungeprüft). */
type Case = { id: string, input?: string, turns?: string[], expect: Expect | (Expect | null)[], context?: never[] }
const suite = JSON.parse(readFileSync(new URL('./chat-cases.json', import.meta.url), 'utf8')) as { day: string, directory: unknown, cases: Case[] }

/** Zerlegt ein Ergebnis in Einheiten: aufgabe, termin, aktion, frage, antwort oder den Skillnamen. */
export function units(result: Result): string[] {
  const all = [result, ...(result.parts ?? [])]
  const found = new Set<string>()
  for (const part of all) {
    for (const task of part.tasks ?? []) found.add(task.kind === 'appointment' ? 'termin' : 'aufgabe')
    if (part.skill === 'appointment' && part.tasks?.length) found.add('termin')
    else if (part.skill) found.add(part.skill)
    if (part.actions?.length) found.add('aktion')
    if (part.questions?.length) found.add('frage')
  }
  if (![...found].some(unit => unit !== 'frage') && result.summary) found.add('antwort')
  return [...found]
}

export function check(result: Result, expect: Expect): string[] {
  const problems: string[] = []
  const have = units(result)
  const text = JSON.stringify(result)
  const all = [result, ...(result.parts ?? [])]
  const tasks = all.flatMap(part => part.tasks ?? [])
  if (expect.units) for (const unit of expect.units) if (!have.includes(unit)) problems.push(`fehlt: ${unit}`)
  if (expect.anyOf && !expect.anyOf.some(option => option.every(unit => have.includes(unit)))) problems.push(`erwartet eine von: ${expect.anyOf.map(o => o.join('+')).join(' | ')}`)
  if (expect.question && !have.includes('frage')) problems.push('keine Rückfrage')
  for (const day of expect.dates ?? []) if (!text.includes(day)) problems.push(`Datum ${day} fehlt`)
  if (expect.link && !tasks.some(task => task.link === expect.link)) problems.push('keine Verknüpfung mit dem Termin')
  if (expect.titleIncludes && !tasks.some(task => task.title.includes(expect.titleIncludes!))) problems.push(`Titel ohne „${expect.titleIncludes}“`)
  if (expect.groceryIntent && !all.some(part => part.skillData && 'groceryIntent' in part.skillData && part.skillData.groceryIntent === expect.groceryIntent)) problems.push(`groceryIntent ≠ ${expect.groceryIntent}`)
  if (expect.textIncludes && !text.includes(expect.textIncludes)) problems.push(`Antwort ohne „${expect.textIncludes}“`)
  if (expect.notUnits) for (const unit of expect.notUnits) if (have.includes(unit)) problems.push(`unerwartet: ${unit}`)
  const questions = [result.questions, ...(result.parts ?? []).map(part => part.questions)].flat()
  if (expect.noQuestion && questions.length) problems.push('unnötige Rückfrage: ' + questions[0])
  if (expect.questionIncludes && !questions.some(question => question.toLowerCase().includes(expect.questionIncludes!.toLowerCase()))) problems.push(`Rückfrage ohne „${expect.questionIncludes}“`)
  if (expect.choices !== undefined) {
    const offered = [result.choices ?? [], ...(result.parts ?? []).map(part => part.choices ?? [])].flat()
    if (typeof expect.choices === 'number' ? offered.length < expect.choices : !expect.choices.every(wanted => offered.some(entry => entry.toLowerCase().includes(wanted.toLowerCase())))) problems.push('Antwortvorschläge fehlen oder unpassend: ' + JSON.stringify(offered))
  }
  if (expect.answerIncludes && ![result.summary, ...result.questions, ...all.map(part => part.summary)].join(' ').includes(expect.answerIncludes)) problems.push(`Antwort ohne „${expect.answerIncludes}“`)
  return problems
}

async function main() {
  if (!cloudModel) { console.error('Die Live-Auswertung braucht ein Profil mit freigegebenem Chat (installierte Version).'); process.exit(2) }
  const filter = process.argv[2]
  const cases = suite.cases.filter(item => !filter || item.id.includes(filter))
  const rows: { id: string, ok: boolean, ms: number, units: string, problems: string[] }[] = []
  let next = 0
  async function worker() {
    while (next < cases.length) {
      const item = cases[next++]
      const turns = item.turns ?? [item.input ?? '']
      const expects = Array.isArray(item.expect) ? item.expect : [...turns.slice(0, -1).map(() => null), item.expect]
      const messages: ModelMessage[] = []
      const problems: string[] = []
      let wallMs = 0, last: Result | null = null, shown = '–'
      for (const [index, input] of turns.entries()) {
        messages.push({ input, referenceDay: suite.day, previousResult: last })
        const payload = { mode: 'personal' as const, day: suite.day, timeZone: 'Europe/Berlin' as const, messages: structuredClone(messages),
          memory: [], context: item.context ?? [], directory: suite.directory, analyse: analyseMessage(input, suite.day) }
        const local = seriesFromChat(payload) ?? taskBoardFromChat(payload)
        const outcome = local ? { result: local, error: null, metrics: { wallMs: 0 } } : await runCodex(payload, AbortSignal.timeout(170_000))
        wallMs += outcome.metrics.wallMs
        if (!outcome.result) { problems.push(`Fehler in Nachricht ${index + 1}: ${outcome.error}`); break }
        last = outcome.result
        if (process.env.DEBUG) console.log("%s #%d %s", item.id, index + 1, JSON.stringify(last))
        shown = units(last).join('+') + (last.choices?.length ? ' [' + last.choices.join(' | ') + ']' : '') + (last.questions.length ? ' ? ' + last.questions[0] : '')
        const wanted = expects[index]
        if (wanted) problems.push(...check(last, wanted).map(problem => (turns.length > 1 ? `(${index + 1}) ` : '') + problem))
      }
      rows.push({ id: item.id, ok: !problems.length, ms: wallMs, units: shown, problems })
      console.log(`${problems.length ? '✗' : '✓'} ${item.id} (${Math.round(wallMs / 1000)} s) ${problems.join('; ')}${problems.length ? '  → ' + shown : ''}`)
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  rows.sort((a, b) => cases.findIndex(c => c.id === a.id) - cases.findIndex(c => c.id === b.id))
  const passed = rows.filter(row => row.ok).length
  const report = [`# Live-Auswertung Pilot-Chat`, ``, `Modell: ${modelProvider() === 'claude' ? 'Claude Code CLI' : 'Codex'} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC · **${passed}/${rows.length} bestanden**`, ``,
    `| Fall | Ergebnis | Erkannt | Dauer | Abweichung |`, `|---|---|---|---|---|`,
    ...rows.map(row => `| ${row.id} | ${row.ok ? '✓' : '✗'} | ${row.units} | ${Math.round(row.ms / 1000)} s | ${row.problems.join('; ')} |`)].join('\n')
  writeFileSync(new URL('./LAST_RUN.md', import.meta.url), report + '\n')
  console.log(`\n${passed}/${rows.length} bestanden`)
}
if (import.meta.url === `file://${process.argv[1]}`) await main()
