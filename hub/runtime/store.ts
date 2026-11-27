import {applyProjectChange,checkProject,prepareProjectChange} from './projects.ts'
import {timeframeNames,type ProjectChange} from './project-types.ts'
import type {TaskRow} from './workspace.ts'
import {CalendarConfirmations,type CalendarWindow,type ExternalConflicts} from './calendar-conflicts.ts'
import {adoptSeries,prepareSeries} from './calendar-series.ts'
import type {SeriesChange} from './calendar-series-types.ts'
import { refreshLegacyGroceryCatalog } from './grocery.ts'
import { adoptGrocery, applyRecipeChoice, groceryAnswer, normalizeRecipeAnswer, recipeRecommendations } from './grocery.ts'
import { receiptTotal, type GroceryAnswer, type RecipeChoice, type RecipeSource } from './grocery-types.ts'
import { financeChatResult, financeDraft, prepareFinanceChange, sameRecurringFinance, saveFinance } from './finance.ts'
import type { FinanceChange } from './finance-types.ts'
import { mkdirSync, readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { acceptance, audit, chatMode, APPROVAL_MS, data, database, fixtures, Problem, version, schemaVersion } from './settings.ts'
import { berlinInstant, expandBlock, verifyOutput, type Result } from '../../agents/lifepilot/tools/validate.ts'
import { Workspace, type Priority, type TaskContext } from './workspace.ts'
import { boundedDialogue, MAX_CHAT_APPROVAL_BYTES, MAX_CHAT_INPUT, type ModelMessage, type ModelPayload, type ModelPreview } from './model-payload.ts'
import { dateInBerlin } from './values.ts'
import { relevance, searchTerms } from './relevance.ts'
import { sourceNote, type SourceNote } from './source-note.ts'
import { directoryWords, titleMatch } from './agent-directory.ts'
import { changeClothingOrder, clothingOrders } from './clothing-orders.ts'
import { applicationOverview, saveApplication } from './applications.ts'
import { applicationStatuses, emptyApplication } from './application-types.ts'
import type { ApplicationPlan, OrderDecisionPlan } from '../../agents/lifepilot/tools/validate.ts'
import type { ChatMode } from './chat-release.ts'

export type Channel = 'ui' | 'cli'
export type MemoryScope = 'lifepilot' | 'owner' | 'trinity-probe'
type State = 'permission' | 'queued' | 'running' | 'review' | 'accepted' | 'denied' | 'cancelled' | 'failed'
type Action = 'model' | 'adopt'
type Memory = {
  id: string, content: string, source: string, scope: MemoryScope, status: string,
  reader: string, writer: string, synthetic: number, expires_at: string | null, created_at: string, replaces: string | null, tags: string
}
type Run = {
  id: string, idempotency_key: string, agent: string, version: string, input: string, origin: Channel,
  state: State, memory_snapshot: string, result: string | null, error: string | null, metrics: string | null,
  created_at: string, updated_at: string, context_snapshot: string, synthetic: number, reference_day: string | null
  source_note: string | null, previous_run:string|null, conversation_context:string, parent_run:string|null
}
type Followup = { idempotency_key: string, run_id: string, turn: number, input: string, origin: Channel,
  reference_day: string, previous_result: string | null, share_previous: number, previous_approvals: string, created_at: string }

type Approval = { id: string, run_id: string, action: Action, digest: string, state: string, expires_at: string }
export type ModelMetrics = { wallMs: number, model: string | null, usage: unknown, cost: null }

const now = () => new Date().toISOString()
const digest = (content: unknown) => createHash('sha256').update(JSON.stringify(content)).digest('hex')
export class Store {
  readonly db: DatabaseSync

  readonly workspace: Workspace
  readonly calendarConfirmations: CalendarConfirmations

  readonly chat: ChatMode

  constructor(path = database, mode = chatMode) {
    this.chat = mode
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1500; PRAGMA trusted_schema=OFF; PRAGMA secure_delete=ON;')
    const current = Number(this.db.prepare('PRAGMA user_version').get()?.user_version)
    this.workspace = new Workspace(this.db)
    this.calendarConfirmations = new CalendarConfirmations(this.db)
    const migrations = ['001-initial.sql', '002-workspace.sql', '003-proposal-history.sql', '004-dialogue.sql', '005-memory-scopes.sql', '006-memory-tags.sql', '007-source-note.sql', '008-calendar-exports.sql', '009-inbox-proposals.sql', '010-gmail-pages.sql', '011-google-calendar-test.sql', '012-task-categories.sql', '013-google-sync.sql', '014-applications.sql', '015-google-event-changes.sql', '016-outfit-studio.sql','017-travel.sql','018-trip-chat-decisions.sql','019-personal-profile-and-completion.sql','020-finance.sql','021-outfit-import-and-look-photos.sql','022-grocery.sql','023-chat-continuity.sql','024-recipes.sql','025-trips-and-wardrobe.sql','026-clothing-orders.sql','027-wardrobe-extras.sql','028-wardrobe-retailer.sql','029-mail-workflows.sql','030-order-tracker.sql','031-skill-links.sql','032-calendar-series.sql','033-projects.sql','034-project-tasks.sql','035-tasks-board.sql','036-order-activity.sql','037-resale-asking-price.sql', '038-application-source-details.sql', '039-resale-estimate.sql', '040-mail-triage.sql','041-mail-label-overrides.sql','042-trip-maps.sql','043-news.sql']
    if (current > schemaVersion) throw new Error('Diese Datenbank benötigt eine neuere Hub-Version.')
    for (let index = current; index < migrations.length; index++) {
      this.transaction(() => {
        const migration = readFileSync(new URL('../migrations/' + migrations[index], import.meta.url), 'utf8')
        if (migrations[index] === '038-application-source-details.sql') {
          // Antigravity previews may have created these columns before this numbered migration.
          const existing = new Set(this.db.prepare('PRAGMA table_info(application_sources)').all().map(row=>row.name))
          for (const statement of migration.trim().split('\n')) {
            const column = statement.match(/ADD COLUMN (\w+)/u)?.[1]
            if (column && !existing.has(column)) this.db.exec(statement)
          }
        } else this.db.exec(migration)
        this.db.exec('PRAGMA user_version=' + (index + 1))
        if (index===26) refreshLegacyGroceryCatalog(this)
        if (index === 3 || index === 4) {
          this.db.prepare("UPDATE runs SET state='failed', error=? WHERE state IN ('permission','queued','running','review')")
            .run('Der Auftrag kann mit einer Nachricht im selben Vorgang fortgesetzt werden.')
          this.db.exec("UPDATE approvals SET state='revoked' WHERE state='pending'")
        }
        if (index === 1) {
          const warning = 'Dieser ältere offene Auftrag benötigt wegen des Updates eine neue Freigabe.'
          this.db.prepare("UPDATE runs SET state='cancelled', error=? WHERE state IN ('permission','queued','running','review')").run(warning)
          this.db.exec("UPDATE approvals SET state='revoked' WHERE state='pending'")
          this.db.prepare('UPDATE memory SET synthetic=1 WHERE scope=? AND content=?').run('lifepilot', fixtures.memory)
          const adopted = this.db.prepare("SELECT id,input,result FROM runs WHERE state='accepted' AND result IS NOT NULL").all()
          for (const row of adopted) {
            const result = verifyOutput(JSON.parse(String(row.result)), String(row.input))
            for (const task of result.tasks) this.workspace.add(String(row.id), { ...task, detail: task.doneWhen }, 'Migration')
          }
        }
      })
    }
  }

  transaction<T>(fn: () => T): T {
    // Verschachtelt (z. B. Chat-Übernahme ruft Bestell- oder Bewerbungsfunktionen): Savepoint statt neuer Transaktion.
    if (this.db.isTransaction) {
      this.db.exec('SAVEPOINT nested')
      try {
        const result = fn()
        this.db.exec('RELEASE nested')
        return result
      } catch (error) {
        this.db.exec('ROLLBACK TO nested')
        this.db.exec('RELEASE nested')
        throw error
      }
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  recover() {
    this.transaction(() => {
      // The next release preserves the existing series contract and rebinds its unchanged pending review.
      const series=this.db.prepare(`SELECT r.* FROM runs r JOIN approvals a ON a.run_id=r.id
        WHERE r.version IN ('0.25.9','0.25.11') AND r.state='review' AND json_extract(r.result,'$.skill')='calendar_series'
        AND a.action='adopt' AND a.state='pending' AND a.expires_at>?`).all(now()) as Run[]
      for(const row of series){
        const approval=this.db.prepare("SELECT id,digest FROM approvals WHERE run_id=? AND action='adopt' AND state='pending'").get(row.id)
        if(!approval||!this.permits(row)||approval.digest!==digest(this.approvalPayload(row,'adopt')))continue
        const current={...row,version}
        this.db.prepare('UPDATE runs SET version=? WHERE id=?').run(version,row.id)
        this.db.prepare('UPDATE approvals SET digest=? WHERE id=?').run(digest(this.approvalPayload(current,'adopt')),approval.id)
      }
      this.db.prepare(`UPDATE approvals SET state='revoked' WHERE state='pending' AND run_id IN
        (SELECT id FROM runs WHERE version!=? AND state IN ('permission','review'))`).run(version)
      this.db.prepare(`UPDATE runs SET state='failed', error=?, updated_at=?
        WHERE state IN ('running','queued') OR (version!=? AND state IN ('permission','review'))`)
        .run('Der Dienst wurde unterbrochen oder aktualisiert. Du kannst den Vorgang mit einer neuen Nachricht fortsetzen.', now(), version)
    })
  }

  expire() {
    this.transaction(() => {
      const at = now()
      this.db.prepare(`UPDATE runs SET state='denied', error='Freigabe abgelaufen.', updated_at=?
        WHERE state IN ('permission','review') AND id IN
        (SELECT run_id FROM approvals WHERE state='pending' AND expires_at<=?)`).run(at, at)
      this.db.prepare("UPDATE approvals SET state='expired' WHERE state='pending' AND expires_at<=?").run(at)
      this.db.prepare(`UPDATE runs SET state=CASE WHEN json_array_length(result,'$.questions')>0 THEN 'review' ELSE 'accepted' END,
        error=NULL,updated_at=? WHERE state='denied' AND error='Freigabe abgelaufen.' AND result IS NOT NULL
        AND json_array_length(result,'$.tasks')=0 AND COALESCE(json_array_length(result,'$.actions'),0)=0
        AND COALESCE(json_extract(result,'$.skill'),'') NOT IN ('inbox_refresh','finance','grocery')`).run(at)
    })
  }

  run(id: string): Run {
    const row = this.db.prepare('SELECT * FROM runs WHERE id=?').get(id) as Run | undefined
    if (!row) throw new Problem(404, 'Vorgang nicht gefunden.')
    return row
  }

  private followups(id: string): Followup[] {
    return this.db.prepare('SELECT * FROM followups WHERE run_id=? ORDER BY turn').all(id) as Followup[]
  }

  private dialogue(row: Run, rows = this.followups(row.id)): ModelMessage[] {
    return [{input:row.input,referenceDay:row.reference_day},...rows.map(message=>{
      const previous=message.previous_result?JSON.parse(message.previous_result) as Result:null
      const questions=previous?.questions
      const allowed=message.share_previous?previous:
        previous && (previous.skill==='finance'||previous.skill==='grocery') && questions?.length?
          {tasks:[],questions,skill:previous.skill}:null
      return {input:message.input,referenceDay:message.reference_day,previousResult:allowed}
    })]
  }

  private conversation(row:Run, rows=this.followups(row.id)) {
    return boundedDialogue([...(JSON.parse(row.conversation_context) as ModelMessage[]),...this.dialogue(row,rows)])
  }

  private outcome(row:Run) {
    if (!row.result) return {state:row.state}
    const result=JSON.parse(row.result) as Result
    const details={
      skill:result.skill, questions:result.questions, tasks:result.tasks.map(task=>({title:task.title,date:task.date})),
      ...(result.skill==='finance'?{entries:this.financeChanges(row.id,this.followups(row.id).length).map(({draft,month})=>
        ({title:draft.title,kind:draft.kind,cycle:draft.cycle,month}))}:
        result.skill==='grocery'?{plan:result.skillData}:
        {plan:result.skillData,summary:result.summary}),
    }
    return {state:row.state,details}
  }

  private continuation(previous:string|null,synthetic:boolean) {
    if (!previous) return []
    const row=this.run(previous)
    const primary=row.parent_run?this.run(row.parent_run):row
    if(!this.permits(row)||row.synthetic!==Number(synthetic) ||
       ['permission','queued','running'].includes(row.state)) throw new Problem(409,'Dieser Chat kann nicht fortgesetzt werden. Beginne einen neuen Chat.')
    const messages=this.conversation(primary)
    const children=this.db.prepare('SELECT * FROM runs WHERE parent_run=? ORDER BY rowid').all(primary.id) as Run[]
    const last=messages.at(-1)!
    messages[messages.length-1]={...last,outcome:children.length?{state:primary.state,details:children.map(child=>this.outcome(child))}:this.outcome(primary)}
    if(row.parent_run) {
      messages.push(...this.followups(row.id).map(message=>({input:message.input,referenceDay:message.reference_day})))
    }
    return boundedDialogue(messages)
  }

  private groceryChange(runId:string,turn:number) {
    const row=this.db.prepare('SELECT data FROM grocery_chat WHERE run_id=? AND turn=?').get(runId,turn)
    return row?JSON.parse(String(row.data)) as GroceryAnswer:undefined
  }
  previousRecipePlan(id:string) {
    const row=this.run(id)
    const previous=this.followups(id).at(-1)?.previous_result
    const parent=row.previous_run?this.run(row.previous_run).result:null
    const result=previous??parent
    if(!result)return
    const plan=(JSON.parse(result) as Result).skillData
    if(plan&&'groceryIntent' in plan&&plan.groceryIntent==='ideas')return plan
  }

  recipeFromRun(id:string,option?:number) {
    const row=this.run(id)
    const proposal=this.groceryChange(id,this.followups(id).length)
    const result=proposal?.options?option===undefined?undefined:proposal.options[option]:option===undefined?proposal:undefined
    if(!this.permits(row)||!['review','accepted'].includes(row.state)||!result?.ingredients?.length||!result.steps.length) {
      throw new Problem(409,'In diesem Vorgang gibt es kein speicherbares Rezept.')
    }
    return normalizeRecipeAnswer(result)
  }

  decideRecipe(id:string,turn:number,choice:RecipeChoice,channel:Channel,option?:number) {
    const row=this.run(id)
    if(turn!==this.followups(id).length)throw new Problem(409,'Das Rezept wurde inzwischen geändert.')
    const prior=this.groceryChange(id,turn)?.recipeDecision
    if(prior&&this.permits(row))return prior
    const answer=this.recipeFromRun(id,option)
    const proposal=this.groceryChange(id,turn)!
    const apply=()=>{
      const outcome={...applyRecipeChoice(this,answer,choice),...(option===undefined?{}:{option})}
      this.db.prepare('UPDATE grocery_chat SET data=? WHERE run_id=? AND turn=?')
        .run(JSON.stringify({...proposal,recipeDecision:outcome}),id,turn)
      return outcome
    }
    if(row.state==='accepted')return this.transaction(apply)
    const approval=this.db.prepare("SELECT id FROM approvals WHERE run_id=? AND action='adopt' AND state='pending'").get(id)
    if(!approval)throw new Problem(409,'Die Rezeptfreigabe ist nicht mehr offen.')
    return this.decide(id,String(approval.id),choice.cancelled?'deny':'approve',channel,false,undefined,undefined,apply).groceryChange?.recipeDecision
  }

  private financeChanges(runId:string,turn:number): FinanceChange[] {
    const row=this.db.prepare('SELECT data FROM finance_chat_changes WHERE run_id=? AND turn=?').get(runId,turn)
    if(!row)return []
    const data=JSON.parse(String(row.data)) as FinanceChange|FinanceChange[]
    return Array.isArray(data)?data:[data]
  }

  projectChange(run:string,turn:number){
    const row=this.db.prepare('SELECT data FROM project_chat_changes WHERE run_id=? AND turn=?').get(run,turn)
    return row?JSON.parse(String(row.data)) as ProjectChange:undefined
  }

  seriesChange(run:string,turn:number){
    const row=this.db.prepare('SELECT data FROM calendar_series_changes WHERE run_id=? AND turn=?').get(run,turn)
    return row?JSON.parse(String(row.data)) as SeriesChange:undefined
  }

  present(row: Run) {
    const approvals = this.db.prepare('SELECT id, action, state, expires_at, decided_at, decided_via FROM approvals WHERE run_id=? ORDER BY rowid')
      .all(row.id)
    const followups = this.followups(row.id).map(({ turn, input, origin, reference_day, previous_result, share_previous, created_at }) =>
      ({ turn, input, origin, referenceDay: reference_day, sharesPrevious: share_previous === 1, previousResult: previous_result ? JSON.parse(previous_result) as Result : null, created_at }))
    const financeChanges=this.financeChanges(row.id,followups.length)
    const synced = this.db.prepare('SELECT event_id,pending_op,removed FROM google_appointment_sync WHERE run_id=?').get(row.id)
    const googleSync = synced ? synced.pending_op ? 'pending' as const : synced.removed ? 'removed' as const :
      synced.event_id ? 'saved' as const : 'pending' as const : null
    const { memory_snapshot, context_snapshot, conversation_context: _conversation, result, metrics, source_note, idempotency_key: _key, ...view } = row
    const grocery=this.groceryChange(row.id,followups.length)
    return { ...view, googleSync, followups, seriesChange:this.seriesChange(row.id,followups.length),projectChange:this.projectChange(row.id,followups.length),turn: followups.length, financeChange:financeChanges[0], financeChanges, groceryChange:grocery?normalizeRecipeAnswer(grocery):undefined, result: result ? JSON.parse(result) as Result : null,
      sourceName: source_note ? (JSON.parse(source_note) as SourceNote).name : null,
      context: JSON.parse(context_snapshot) as TaskContext[], memory: JSON.parse(memory_snapshot) as Memory[], metrics: metrics ? JSON.parse(metrics) as ModelMetrics : null, approvals }
  }

  list() {
    return (this.db.prepare('SELECT * FROM runs ORDER BY created_at DESC, parent_run IS NOT NULL, rowid DESC LIMIT 150').all() as Run[])
      .map(row => this.present(row))
  }

  memory(scope: MemoryScope, query: string, principal: MemoryScope = 'owner'): Memory[] {
    if ((scope === 'trinity-probe' && !audit) || (principal !== 'owner' && scope !== principal)) throw new Problem(403, 'Kein Zugriff auf diesen Memory-Bereich.')
    const words = searchTerms(query)
    const entries = this.db.prepare(`SELECT * FROM memory WHERE scope=? AND status='verified'
      AND (expires_at IS NULL OR expires_at>?) AND (?='owner' OR (reader=? AND synthetic=1)) ORDER BY rowid DESC LIMIT 1000`)
      .all(scope, now(), principal, principal) as Memory[]
    if (!query) return entries.slice(0, 100)
    return entries.map(entry => ({ entry, score: relevance(words, entry.content + ' ' + entry.tags) }))
      .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score)
      .slice(0, 5).map(({ entry }) => entry)
  }

  addMemory(content: string, scope: Memory['scope'], source: Channel, expires: string | null, replaces: string | null, synthetic = false) {
    if (scope === 'trinity-probe' && !audit) throw new Problem(403, 'Interner Memory-Bereich gesperrt.')
    if (acceptance && !synthetic && ![fixtures.memory, 'Synthetischer Test: Eigentümernotiz.'].includes(content)) {
      throw new Problem(403, 'Die Testinstanz akzeptiert ausschließlich hinterlegte Testdaten.')
    }
    return this.transaction(() => {
      if (replaces) {
        const change = this.db.prepare("UPDATE memory SET status='superseded' WHERE id=? AND scope=? AND status='verified'")
          .run(replaces, scope)
        if (change.changes !== 1) throw new Problem(409, 'Der Memory-Eintrag kann nicht ersetzt werden.')
        this.invalidateSnapshots(replaces)
      }
      return this.recordMemory(content, scope, source, expires, replaces, synthetic || (acceptance && content === fixtures.memory))
    })
  }

  private recordMemory(content: string, scope: Memory['scope'], source: Channel, expires: string | null, replaces: string | null, synthetic: boolean, tags: string[] = []) {
    const id = randomUUID()
    this.db.prepare(`INSERT INTO memory (id,content,source,scope,reader,writer,status,created_at,expires_at,replaces,synthetic,tags)
      VALUES (?,?,?,?,?,'owner','verified',?,?,?,?,?)`)
      .run(id, content, `Bestätigt über ${source === 'ui' ? 'Oberfläche' : 'CLI'}`, scope, scope, now(), expires, replaces, Number(synthetic), JSON.stringify(tags))
    return this.db.prepare('SELECT * FROM memory WHERE id=?').get(id)
  }

  private invalidateSnapshots(id: string, exceptRun: string | null = null) {
    const sql = `SELECT id FROM runs WHERE state IN ('permission','queued','running','review')
      AND (? IS NULL OR id<>?) AND EXISTS (SELECT 1 FROM json_each(runs.memory_snapshot) WHERE json_extract(value,'$.id')=?)`
    const at = now()
    this.db.prepare(`UPDATE approvals SET state='revoked', decided_at=?, decided_via='memory'
      WHERE state='pending' AND run_id IN (${sql})`).run(at, exceptRun, exceptRun, id)
    this.db.prepare(`UPDATE runs SET state='cancelled', error='Eine verwendete Erinnerung wurde widerrufen.', updated_at=?
      WHERE id IN (${sql})`).run(at, exceptRun, exceptRun, id)
  }

  forget(id: string, remove: boolean) {
    this.transaction(() => {
      this.invalidateSnapshots(id)
      const change = this.db.prepare(`UPDATE memory SET status='revoked', content=CASE WHEN ? THEN '' ELSE content END,
        tags=CASE WHEN ? THEN '[]' ELSE tags END WHERE id=?`).run(Number(remove), Number(remove), id)
      if (change.changes !== 1) throw new Problem(404, 'Memory-Eintrag nicht gefunden.')
      if (remove) this.db.prepare(`UPDATE runs SET memory_snapshot=(
        SELECT coalesce(json_group_array(json(value)), '[]') FROM json_each(runs.memory_snapshot)
        WHERE json_extract(value,'$.id')<>?)`).run(id)
    })
  }

  private editContext(input:string):TaskContext[]{
    if(/\b(?:serie[n]?|serientermine?|wiederkehrend\w*)\b/iu.test(input)||
      !/(?:^|\s)(?:ändere|änder|verschiebe|verschieb|korrigiere|benenne|lösche|lösch|entferne|archiviere|erledige|aktualisiere|markiere|setze|setz|plane|erinnere|priorisiere|verlängere|hake|verlege|streiche|sag ab|absagen)\b/iu.test(input))return []
    // Aufgaben und Termine, die die Nachricht nennt, auch bei Tipp- oder Diktatfehlern („Kai und Data Science“).
    const words=directoryWords(input)
    const ids=this.workspace.list().filter(task=>task.status==='open'&&task.title.trim().length>=3)
      .map(task=>({id:task.id,score:titleMatch(words,task.title)})).filter(({score})=>score>=0.5)
      .sort((a,b)=>b.score-a.score).slice(0,8).map(({id})=>id)
    return this.workspace.contextOf(ids).map(task=>({...task,detail:''}))
  }


  private permits(row: Pick<Run, 'synthetic' | 'memory_snapshot' | 'context_snapshot'>) {
    if (this.chat === 'synthetic') return row.synthetic === 1
    return this.chat === 'private' && row.synthetic === 0 &&
      row.memory_snapshot === '[]' && (JSON.parse(row.context_snapshot) as TaskContext[]).length<=4
  }

  private modelPayload(row: Run, entries = JSON.parse(row.memory_snapshot) as Memory[]): ModelPayload {
    const messages=this.conversation(row)
    return {
      day: messages.at(-1)?.referenceDay??row.reference_day, timeZone: 'Europe/Berlin', messages,
      ...(row.synthetic === 0 && { mode: 'personal' as const }),
      memory: entries.map(({ id, content, source, tags }) => ({ id, content, source, tags: JSON.parse(tags) as string[] })),
      context: JSON.parse(row.context_snapshot) as TaskContext[],
      ...(row.source_note && { sourceNote: JSON.parse(row.source_note) as SourceNote }),
    }
  }

  previewModel(id: string, approvalId: string): ModelPreview {
    const row = this.run(id)
    const approval = this.db.prepare(`SELECT id,expires_at,digest FROM approvals
      WHERE id=? AND run_id=? AND action='model' AND state='pending' AND expires_at>?`).get(approvalId, id, now())
    if (!this.permits(row) || row.state !== 'permission' || row.version !== version || !approval ||
        approval.digest !== digest(this.approvalPayload(row, 'model'))) {
      throw new Problem(409, 'Die Analysefreigabe ist nicht mehr aktuell.')
    }
    return { approval: approvalId, expiresAt: String(approval.expires_at), payload: this.modelPayload(row) }
  }

  private approvalPayload(row: Run, action: Action) {
    return action === 'model'
      ? [this.modelPayload(row), row.memory_snapshot, row.synthetic, row.agent, row.version]
      : [row.result, row.context_snapshot, row.source_note, row.version, this.conversation(row), this.financeChanges(row.id,this.followups(row.id).length), ...(JSON.parse(row.result??'null')?.skill==='projects'?[this.projectChange(row.id,this.followups(row.id).length)]:[]), ...(JSON.parse(row.result??'null')?.skill==='calendar_series'?[this.seriesChange(row.id,this.followups(row.id).length)]:[]), ...(JSON.parse(row.result??'null')?.skill==='grocery'?[this.groceryChange(row.id,this.followups(row.id).length)]:[])]
  }

  private approval(row: Run, action: Action) {
    const payload = this.approvalPayload(row, action)
    if (action === 'model' && Buffer.byteLength(JSON.stringify(payload[0])) > MAX_CHAT_APPROVAL_BYTES) {
      throw new Problem(413, 'Der Analysekontext ist zu groß. Beginne mit einer kürzeren Anfrage.')
    }
    const expires = new Date(Date.now() + APPROVAL_MS).toISOString()
    this.db.prepare("INSERT INTO approvals (id,run_id,action,digest,state,expires_at) VALUES (?,?,?,?,'pending',?)")
      .run(randomUUID(), row.id, action, digest(payload), expires)
  }

  private submitModelTurn(row: Run, channel: Channel, directTest = false) {
    this.approval(row, 'model')
    if (row.source_note || (this.chat==='private'&&row.context_snapshot!=='[]') || (this.chat !== 'private' && !(this.chat==='synthetic' && directTest && row.synthetic))) return this.present(row)
    if (!this.permits(row)) throw new Problem(403, 'Unzulässige Daten für den persönlichen Chat.')
    const at = now()
    this.db.prepare(`UPDATE approvals SET state='approved',decided_at=?,decided_via=?
      WHERE run_id=? AND action='model' AND state='pending'`).run(at,channel,row.id)
    this.db.prepare("UPDATE runs SET state='queued',updated_at=? WHERE id=?").run(at,row.id)
    return this.present(this.run(row.id))
  }

  create(input: string, agent: string, key: string, channel: Channel, synthetic = false, note?: unknown, directTest = false, previous:string|null=null) {
    if(input.length>MAX_CHAT_INPUT)throw new Problem(413,'Die Nachricht überschreitet das Limit von 200.000 Zeichen.')
    if (agent !== 'lifepilot') throw new Problem(403, 'Dieser Helfer ist nicht freigegeben.')
    if (this.chat === 'disabled') throw new Problem(423, 'Der persönliche KI-Chat wartet auf seine Trinity-Freigabe.')
    if (this.chat === 'private' && synthetic) throw new Problem(400, 'Testdaten gehören in das Testprofil.')
    if (this.chat === 'synthetic' && !synthetic && (note !== undefined || ![fixtures.ui, fixtures.cli].includes(input))) throw new Problem(403, 'Bestätige, dass diese Eingabe synthetische Testdaten enthält.')
    let encodedNote: string | null = null
    try {
      const checked = sourceNote(note)
      if (checked) encodedNote = JSON.stringify(checked)
    } catch (cause) { throw new Problem(400, cause instanceof Error ? cause.message : 'Ungültige Textquelle.') }
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM runs WHERE idempotency_key=?').get(key) as Run | undefined
      if (existing) {
        if (existing.input !== input || existing.agent !== agent || existing.source_note !== encodedNote || existing.previous_run!==previous) throw new Problem(409, 'Diese Wiederholungs-ID gehört zu einem anderen Auftrag.')
        return this.present(existing)
      }

      const history=this.continuation(previous,this.chat==='synthetic')
      const id = randomUUID()
      const snapshot = this.chat === 'synthetic' ? this.memory('lifepilot', input, 'lifepilot') : []
      const at = now()
      this.db.prepare(`INSERT INTO runs (id,idempotency_key,agent,version,input,origin,state,memory_snapshot,created_at,updated_at,context_snapshot,synthetic,reference_day,source_note,previous_run,conversation_context)
        VALUES (?,?,?,?,?,?,'permission',?,?,?,?,?,?,?,?,?)`)
        .run(id, key, agent, version, input, channel, JSON.stringify(snapshot), at, at,
          JSON.stringify(this.chat === 'synthetic' ? this.workspace.context(input) : this.editContext(input)), Number(this.chat === 'synthetic'), dateInBerlin(), encodedNote,previous,JSON.stringify(history))
      return this.submitModelTurn(this.run(id), channel,directTest)
    })
  }

  followup(id: string, input: string, key: string, expectedTurn: number, channel: Channel, synthetic: boolean,directTest = false) {
    if (this.chat === 'disabled') throw new Problem(423, 'Der persönliche KI-Chat wartet auf seine Trinity-Freigabe.')
    if(input.length>MAX_CHAT_INPUT)throw new Problem(413,'Die Nachricht überschreitet das Limit von 200.000 Zeichen.')
    if (synthetic !== (this.chat === 'synthetic')) throw new Problem(403, 'Die Nachricht passt nicht zum aktiven Chatprofil.')
    this.expire()
    return this.transaction(() => {
      const row = this.run(id)
      const existing = this.db.prepare('SELECT run_id,input FROM followups WHERE idempotency_key=?').get(key)
      if (existing) {
        if (existing.run_id !== id || existing.input !== input) throw new Problem(409, 'Diese Wiederholungs-ID gehört zu einer anderen Nachricht.')
        return this.present(row)
      }
      const rows = this.followups(id)
      const previous = row.result ? JSON.parse(row.result) as Result : null
      const acknowledgedAnswer = row.state === 'accepted' && previous &&
        previous.tasks.length === 0 && !previous.actions?.length && !this.financeChanges(id,rows.length).length && !this.groceryChange(id,rows.length)?.write
      if (!this.permits(row) || (!['review', 'failed'].includes(row.state) && !acknowledgedAnswer) || rows.length !== expectedTurn) {
        throw new Problem(409, 'Der Vorgang kann in seinem aktuellen Stand nicht fortgesetzt werden.')
      }
      const sources = this.dialogue(row, rows).map(message => message.input)
      if (rows.length >= 24) {
        throw new Problem(413, 'Dieser Dialog hat sein Längenlimit erreicht.')
      }
      const query = this.chat==='synthetic' ? [input, ...sources.toReversed()].join('\n') : ''
      const approvals = this.db.prepare('SELECT * FROM approvals WHERE run_id=?').all(id)
      const sentDay = dateInBerlin()
      const at = now()
      this.db.prepare('INSERT INTO followups VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(key, id, rows.length + 1, input, channel, sentDay, row.result, Number(row.memory_snapshot === '[]' && previous?.skill !== 'finance' && previous?.skill !== 'grocery' && (row.result?.length ?? 0) <= 6000 || previous?.skill==='travel' && row.memory_snapshot==='[]'), JSON.stringify(approvals), at)
      this.db.prepare('DELETE FROM approvals WHERE run_id=?').run(id)
      this.db.prepare(`UPDATE runs SET state='permission', version=?, result=NULL, error=NULL, metrics=NULL,
        memory_snapshot=?, context_snapshot=?, updated_at=? WHERE id=?`)
        .run(version, JSON.stringify(this.chat === 'synthetic' ? this.memory('lifepilot', query, 'lifepilot') : []),
          JSON.stringify(this.chat === 'synthetic' ? this.workspace.context(query) : this.editContext(input)), at, id)
      return this.submitModelTurn(this.run(id), channel,directTest)
    })
  }

  calendarWindows(id:string, approvalId:string):CalendarWindow[] {
    const row=this.run(id)
    if(row.state!=='review'||!row.result||!this.permits(row)||!this.db.prepare(
      "SELECT 1 FROM approvals WHERE id=? AND run_id=? AND action='adopt' AND state='pending'").get(approvalId,id))return []
    const result=JSON.parse(row.result) as Result
    if(result.skill==='calendar_series'){
      const change=this.seriesChange(id,this.followups(id).length)
      return change?.operation==='create'?change.blocks.flatMap(block=>block.end?
        [{title:change.definition.title,at:block.at,endsAt:block.end}]:[]):[]
    }
    const context=JSON.parse(row.context_snapshot) as TaskContext[]
    const windows:CalendarWindow[]=result.tasks.flatMap(task=>(task.blocks??[]).flatMap(block=>expandBlock(block).flatMap(
      block=>block.endsAt?[{title:task.title,at:block.at,endsAt:block.endsAt}]:[])))
    for(const action of result.actions??[]){
      if(action.kind==='plan'&&action.duration){
        const task=context.find(task=>task.id===action.target)
        if(!task)continue
        const at=berlinInstant(action.value)
        windows.push({title:task.title,at,endsAt:new Date(Date.parse(at)+action.duration*60_000).toISOString()})
      }
      if(action.kind==='reschedule'){
        const task=context.find(task=>task.schedule.some(slot=>slot.id===action.target))
        const slot=task?.schedule.find(slot=>slot.id===action.target)
        if(!task||!slot?.ends_at)continue
        const at=berlinInstant(action.value)
        const endsAt=new Date(Date.parse(at)+Date.parse(slot.ends_at)-Date.parse(slot.at)).toISOString()
        windows.push({title:task.title,at,endsAt,exclude:slot.id})
      }
    }
    return windows
  }

  decide(id: string, approvalId: string, decision: 'approve' | 'deny', channel: Channel, syncGoogle = false,
    overlapToken?:unknown, external?:ExternalConflicts, applyRecipe?:()=>unknown) {
    this.expire()
    return this.transaction(() => {
      const row = this.run(id)
      const approval = this.db.prepare('SELECT * FROM approvals WHERE id=? AND run_id=?').get(approvalId, id) as Approval | undefined
      if (!approval) throw new Problem(404, 'Freigabe nicht gefunden.')
      const expected = approval.action === 'model' ? 'permission' : 'review'
      const payload = this.approvalPayload(row, approval.action)
      if (!this.permits(row) || row.state !== expected || approval.state !== 'pending' || approval.digest !== digest(payload)) {
        throw new Problem(409, 'Diese Freigabe ist nicht mehr gültig.')
      }
      const at = now()
      if (syncGoogle && (decision !== 'approve' || approval.action !== 'adopt' || row.synthetic || !row.result ||
          (JSON.parse(row.result) as Result).skill !== 'appointment')) throw new Problem(409, 'Nur ein vollständiger Termin kann mit Google gespeichert werden.')
      const confirmationKey=JSON.stringify([approvalId,channel,syncGoogle])
      if (decision === 'approve' && approval.action === 'adopt') {
        const windows=this.calendarWindows(id,approvalId)
        const calendarConfirmation=this.calendarConfirmations.check(confirmationKey,windows,overlapToken,external)
        if(calendarConfirmation)return {...this.present(row),calendarConfirmation}
        if(!applyRecipe)this.adopt(row,channel,windows.length>0)
      }
      if (syncGoogle) {
        const slots = this.db.prepare(`SELECT schedule.id, title, at, ends_at FROM schedule JOIN tasks ON tasks.id=schedule.task_id
          WHERE tasks.run_id=? AND tasks.kind='appointment' AND schedule.kind='slot'`).all(id)
        if (slots.length !== 1) throw new Problem(409, 'Bestätige genau einen Termin für Google.')
        const slot = slots[0]
        this.db.prepare('INSERT INTO google_appointment_sync (run_id,slot_id,title,starts_at,ends_at,event_id) VALUES (?,?,?,?,?,NULL)')
          .run(id, slot.id, slot.title, slot.at, slot.ends_at)
      }
      if(applyRecipe)applyRecipe()
      const newState = decision === 'deny' ? 'denied' : approval.action === 'model' ? 'queued' : 'accepted'
      this.db.prepare('UPDATE approvals SET state=?, decided_at=?, decided_via=? WHERE id=?')
        .run(decision === 'deny' ? 'denied' : 'approved', at, channel, approvalId)
      this.db.prepare('UPDATE runs SET state=?, updated_at=? WHERE id=?').run(newState, at, id)
      this.calendarConfirmations.finish(confirmationKey)
      return this.present(this.run(id))
    })
  }

  revise(id: string, candidate: unknown, actor: Channel) {
    if (this.chat === 'disabled') throw new Problem(423, 'Der persönliche KI-Chat wartet auf seine Trinity-Freigabe.')
    this.expire()
    return this.transaction(() => {
      const row = this.run(id)
      const approval = this.db.prepare("SELECT * FROM approvals WHERE action='adopt' AND state='pending' AND run_id=?")
        .get(id) as Approval | undefined
      if (row.state !== 'review' || !this.permits(row) || !row.result || !approval) throw new Problem(409, 'Der Vorschlag ist nicht mehr bearbeitbar.')
      let result: Result
      try { result = verifyOutput(candidate, this.conversation(row).map(message => message.input), JSON.parse(row.context_snapshot), false,
        (JSON.parse(row.memory_snapshot) as Memory[]).map(entry => entry.id), row.source_note ? (JSON.parse(row.source_note) as SourceNote).text : undefined) }
      catch { throw new Problem(400, 'Die Änderungen passen nicht zum Vorschlag.') }
      if (!row.synthetic && result.actions?.some(action=>action.kind==='remember'||action.kind==='correct_memory')) throw new Problem(403,'Memory wird in diesem Chat separat verwaltet.')
      const previous = JSON.parse(row.result) as Result
      if (result.tasks.length !== previous.tasks.length || result.tasks.some((task, index) =>
        task.kind !== previous.tasks[index].kind || task.evidence !== previous.tasks[index].evidence) ||
        (result.actions?.length ?? 0) !== (previous.actions?.length ?? 0) ||
        result.actions?.some((action, index) => action.kind !== previous.actions?.[index].kind || action.target !== previous.actions[index].target) ||
        JSON.stringify([result.questions, result.advice, result.summary, result.correctedInput, result.skill, result.skillData,result.parts]) !== JSON.stringify([previous.questions, previous.advice, previous.summary, previous.correctedInput, previous.skill, previous.skillData,previous.parts])) {
        throw new Problem(400, 'Aufgabenbezug, Quellen und ungeänderte Antwortbestandteile müssen erhalten bleiben.')
      }
      this.db.prepare('INSERT INTO proposal_history VALUES (?,?,?,?,?,?,?)')
        .run(randomUUID(), id, approval.id, approval.digest, row.result, actor, now())
      this.db.prepare('DELETE FROM approvals WHERE id=?').run(approval.id)
      this.db.prepare('UPDATE runs SET result=?,updated_at=? WHERE id=?').run(JSON.stringify(result), now(), id)
      this.approval(this.run(id), 'adopt')
      return this.present(this.run(id))
    })
  }

  reviseFinance(runId:string, value:unknown, actor:Channel, index=0) {
    this.expire()
    return this.transaction(()=>{
      const row=this.run(runId)
      const turn=this.followups(runId).length
      const changes=this.financeChanges(runId,turn)
      const change=changes[index]
      const approval=this.db.prepare("SELECT id,digest FROM approvals WHERE run_id=? AND action='adopt' AND state='pending'").get(runId)
      if(!this.permits(row)||row.version!==version||row.state!=='review'||!change||!approval) throw new Problem(409,'Der Finanzentwurf ist nicht mehr aktuell.')
      const draft=financeDraft(value)
      if(draft.kind!==change.draft.kind) throw new Problem(400,'Die Eintragsart bleibt an diesen Entwurf gebunden.')
      this.db.prepare('INSERT INTO proposal_history VALUES (?,?,?,?,?,?,?)')
        .run(randomUUID(),runId,approval.id,approval.digest,JSON.stringify(change),actor,now())
      changes[index]={...change,draft}
      this.db.prepare('UPDATE finance_chat_changes SET data=? WHERE run_id=? AND turn=?')
        .run(JSON.stringify(changes),runId,turn)
      this.db.prepare('DELETE FROM approvals WHERE id=?').run(approval.id)
      this.approval(row,'adopt')
      return this.present(row)
    })
  }

  private adopt(row: Run, actor: Channel, allowOverlap = false) {
    if (!this.permits(row) || row.version !== version || !row.result) throw new Problem(403, 'Dieser Vorschlag ist nicht zur Übernahme freigegeben.')
    const context = JSON.parse(row.context_snapshot) as TaskContext[]
    const result = verifyOutput(JSON.parse(row.result), this.conversation(row).map(message => message.input), context, false,
      (JSON.parse(row.memory_snapshot) as Memory[]).map(entry => entry.id), row.source_note ? (JSON.parse(row.source_note) as SourceNote).text : undefined)
    if(result.skill==='projects'){
      const change=this.projectChange(row.id,this.followups(row.id).length)
      if(!change)throw new Problem(409,'Der Projektentwurf ist nicht verfügbar.')
      applyProjectChange(this,change)
      return
    }
    if(result.skill==='calendar_series'){
      const change=this.seriesChange(row.id,this.followups(row.id).length)
      if(!change)throw new Problem(409,'Der Serienentwurf ist nicht verfügbar.')
      adoptSeries(this,row.id,change,actor,allowOverlap)
      return
    }
    if(result.skill==='grocery') {
      const proposal=this.groceryChange(row.id,this.followups(row.id).length)
      if(!proposal) throw new Problem(409,'Der Einkaufsentwurf ist nicht mehr verfügbar.')
      adoptGrocery(this,proposal)
      return
    }
    if((result.skill==='orders'||result.skill==='applications')&&result.skillData&&('orderIntent' in result.skillData||'applicationIntent' in result.skillData)){
      this.adoptRecord(result.skillData,actor)
      return
    }
    if(result.skill==='finance') {
      const changes=this.financeChanges(row.id,this.followups(row.id).length)
      if(!changes.length) throw new Problem(409,'Der Finanzentwurf ist nicht mehr verfügbar.')
      for(const change of changes) if(!sameRecurringFinance(this,change)) saveFinance(this,change.draft,change.month,change.entry)
      return
    }
    if (!row.synthetic && result.actions?.some(action=>action.kind==='remember'||action.kind==='correct_memory')) throw new Problem(403,'Memory wird in diesem Chat separat verwaltet.')
    for (const action of result.actions ?? []) {
      if (action.target === null) continue
      if (action.kind === 'correct_memory') {
        const entry = this.db.prepare(`SELECT id FROM memory WHERE id=? AND scope='lifepilot' AND reader='lifepilot'
          AND synthetic=1 AND status='verified' AND (expires_at IS NULL OR expires_at>?)`).get(action.target, now())
        if (!entry) throw new Problem(409, 'Die Erinnerung wurde inzwischen geändert.')
        continue
      }
      const seen = context.find(task => action.kind === 'reschedule'
        ? task.schedule.some(slot => slot.id === action.target) : task.id === action.target)
      if(seen&&['archive','reschedule','rename','deadline','complete'].includes(action.kind)&&this.db.prepare(`SELECT 1
        FROM google_appointment_sync g JOIN schedule s ON s.id=g.slot_id WHERE s.task_id=? AND g.removed=0`).get(seen.id))
        throw new Problem(409,'Bearbeite diesen verknüpften Google-Termin über seine Google-Aktion.')
      if (!seen || this.workspace.get(seen.id).revision !== seen.revision) {
        throw new Problem(409, 'Die Aufgabe wurde inzwischen geändert. Erstelle einen neuen Vorschlag.')
      }
    }
    for (const task of result.tasks) {
      const saved = this.workspace.add(row.id, { ...task, detail: task.doneWhen }, actor)
      if (saved.run_id !== row.id || saved.title !== task.title) throw new Error('Aufgabe konnte nicht bestätigt werden.')
      for (const block of task.blocks ?? []) for (const instance of expandBlock(block)) {
        this.workspace.addSchedule(saved.id, instance.endsAt ? 'slot' : 'reminder', instance.at, instance.endsAt, actor,allowOverlap)
      }
    }
    for (const action of result.actions ?? []) {
      if (action.kind === 'remember') {
        this.recordMemory(action.value, 'lifepilot', actor, null, null, true, action.tags)
        continue
      }
      if (action.target === null) throw new Problem(400, 'Bezug der Änderung fehlt.')
      if (action.kind === 'correct_memory') {
        const changed = this.db.prepare("UPDATE memory SET status='superseded' WHERE id=? AND scope='lifepilot' AND reader='lifepilot' AND synthetic=1 AND status='verified'")
          .run(action.target)
        if (changed.changes !== 1) throw new Problem(409, 'Die Erinnerung wurde inzwischen geändert.')
        this.invalidateSnapshots(action.target, row.id)
        this.recordMemory(action.value, 'lifepilot', actor, null, action.target, true, action.tags)
        continue
      }
      if (action.kind === 'reschedule') {
        const seen = context.find(task => task.schedule.some(slot => slot.id === action.target))
        const slot = seen?.schedule.find(slot => slot.id === action.target)
        if (!seen || !slot?.ends_at) throw new Problem(409, 'Zeitblock nicht gefunden.')
        const at = berlinInstant(action.value)
        const end = new Date(Date.parse(at) + Date.parse(slot.ends_at) - Date.parse(slot.at)).toISOString()
        this.workspace.moveSlot(action.target, seen.id, slot.at, slot.ends_at, at, end, actor,allowOverlap)
        continue
      }
      const task = this.workspace.get(action.target)
      if(action.kind==='rename')this.workspace.update(task.id,task.revision,{title:action.value},actor)
      if(action.kind==='description')this.workspace.update(task.id,task.revision,{detail:action.value},actor)
      if(action.kind==='category')this.workspace.update(task.id,task.revision,{category:action.value as TaskRow['category']},actor)
      if(action.kind==='archive')this.workspace.update(task.id,task.revision,{status:'archived'},actor)
      if (action.kind === 'deadline') this.workspace.update(task.id, task.revision, { due_date: action.value }, actor)
      if (action.kind === 'priority') this.workspace.update(task.id, task.revision, { priority: action.value as Priority }, actor)
      if (action.kind === 'complete') this.workspace.update(task.id, task.revision, { status: 'done' }, actor)
      if (action.kind === 'plan' || action.kind === 'reminder') {
        const at = berlinInstant(action.value)
        const end = action.duration ? new Date(Date.parse(at) + action.duration * 60000).toISOString() : null
        this.workspace.addSchedule(task.id, action.kind === 'plan' ? 'slot' : 'reminder', at, end, actor,allowOverlap)
      }
    }
  }

  cancel(id: string, channel: Channel) {
    return this.transaction(() => {
      if (!['permission', 'queued', 'running', 'review'].includes(this.run(id).state)) throw new Problem(409, 'Dieser Vorgang kann nicht mehr abgebrochen werden.')
      this.db.prepare("UPDATE approvals SET state='revoked', decided_at=?, decided_via=? WHERE run_id=? AND state='pending'")
        .run(now(), channel, id)
      this.db.prepare("UPDATE runs SET state='cancelled', updated_at=? WHERE id=?").run(now(), id)
      return this.present(this.run(id))
    })
  }

  next() {
    return this.transaction(() => {
      const candidate = this.db.prepare("SELECT * FROM runs WHERE state='queued' ORDER BY created_at,rowid LIMIT 1").get() as Run | undefined
      if (!candidate) return
      const at = now()
      const entries = JSON.parse(candidate.memory_snapshot) as Memory[]
      const permitted = this.db.prepare(`SELECT 1 FROM approvals WHERE run_id=? AND action='model'
        AND state='approved' AND expires_at>? AND digest=?`)
        .get(candidate.id, at, digest(this.approvalPayload(candidate, 'model')))
      if (!this.permits(candidate) || !permitted || entries.some(entry => entry.expires_at && entry.expires_at <= at)) {
        this.db.prepare("UPDATE runs SET state='failed', error=?, updated_at=? WHERE id=?")
          .run('Analysefreigabe oder verwendete Erinnerung ist nicht mehr gültig.', at, candidate.id)
        return
      }
      this.db.prepare("UPDATE runs SET state='running', updated_at=? WHERE id=?").run(at, candidate.id)
      return { ...candidate, payload: this.modelPayload(candidate, entries),
        memory: entries.map(({ id, content, source, synthetic }) => ({ id, content, source, synthetic })) }
    })
  }

  finish(id: string, result: Result | null, error: string | null, metrics: ModelMetrics, webRecipes:RecipeSource[]=[]) {
    this.transaction(() => {
      const row = this.run(id)
      if (row.state !== 'running') return
      if (!this.permits(row) || (!row.synthetic && result?.actions?.some(action=>action.kind==='remember'||action.kind==='correct_memory'))) {
        result = null
        error = 'Der Vorschlag enthält eine für dieses Profil nicht verfügbare Aktion.'
      }
      if (result?.parts?.length) {
        const input=this.followups(row.id).at(-1)?.input??row.input
        const reference=this.dialogue(row).at(-1)?.referenceDay??row.reference_day
        const history=JSON.stringify(this.conversation(row).slice(0,-1))
        const insert=this.db.prepare(`INSERT INTO runs
          (id,idempotency_key,agent,version,input,origin,state,memory_snapshot,created_at,updated_at,context_snapshot,synthetic,reference_day,source_note,parent_run,conversation_context)
          VALUES (?,?,?,?,?,?,'running',?,?,?,?,?,?,?,?,?)`)
        for (const part of result.parts) {
          const key=randomUUID()
          insert.run(key,key,row.agent,row.version,input,row.origin,row.memory_snapshot,row.created_at,now(),row.context_snapshot,
            row.synthetic,reference,row.source_note,id,history)
          this.finishResult(this.run(key),part,null,null)
        }
        this.finishResult(row,{...result,parts:[],summary:result.summary??'Ich habe die Aufträge einzeln vorbereitet.'},null,metrics)
      } else this.finishResult(row,result,error,metrics,webRecipes)
    })
  }

  private finishResult(row:Run,result:Result|null,error:string|null,metrics:ModelMetrics|null,webRecipes:RecipeSource[]=[]) {
    const id=row.id
    if (result?.actions?.some(action=>action.kind==='remember'||action.kind==='correct_memory') && !row.synthetic) {
      result=null
      error='Der Vorschlag enthält eine für dieses Profil nicht verfügbare Aktion.'
    }
    let financeWrite=false
    let projectWrite=false
    let seriesWrite=false
    let groceryWrite=false
    const plan=result?.skillData
    if(result?.skill==='finance' && plan && ('financeIntent' in plan||'financeBatch' in plan) && !result.questions.length) {
      try {
        const day=this.dialogue(row).at(-1)?.referenceDay ?? dateInBerlin()
        const writes='financeBatch' in plan?plan.financeBatch:plan.financeIntent==='add'||plan.financeIntent==='edit'?[plan]:null
        if(writes) {
          const changes=writes.map(entry=>prepareFinanceChange(this,entry,day)).filter(change=>!sameRecurringFinance(this,change))
          const edits=changes.flatMap(change=>change.entry?[change.entry.id]:[])
          if(new Set(edits).size!==edits.length) throw new Problem(409,'Ein Eintrag soll mehrmals geändert werden. Nenne den gewünschten Endstand.')
          if(changes.length) {
            this.db.prepare('INSERT INTO finance_chat_changes VALUES (?,?,?)')
              .run(id,this.followups(id).length,JSON.stringify(changes))
            financeWrite=true
          }
          result={...result,summary:changes.length< writes.length?'Bereits vorhandene wiederkehrende Einträge werden übersprungen.':null}
        } else if('financeIntent' in plan) result={...result,summary:financeChatResult(this,plan,day)}
      } catch (reason) {
        if(!(reason instanceof Problem)) throw reason
        result={...result,skillData:null,summary:null,questions:[reason.message]}
      }
    }
    if(result?.skill==='grocery' && plan && 'groceryIntent' in plan && !result.questions.length) {
      const checked=plan.groceryIntent==='receipt' && row.source_note ?
        {...plan,totalCents:receiptTotal((JSON.parse(row.source_note) as SourceNote).text)}:plan
      const answer=checked.groceryIntent==='ideas'?recipeRecommendations(this,checked,webRecipes,parseInt(id.slice(0,4),16)):groceryAnswer(this,checked)
      this.db.prepare('INSERT INTO grocery_chat VALUES (?,?,?)').run(id,this.followups(id).length,JSON.stringify(answer))
      groceryWrite=!!answer.write
      result={...result,summary:null}
    }
    if(result?.skill==='calendar_series'&&plan&&'seriesIntent' in plan&&!result.questions.length){
      try{
        const day=this.dialogue(row).at(-1)?.referenceDay??dateInBerlin()
        const change=prepareSeries(this,plan,day)
        this.db.prepare('INSERT INTO calendar_series_changes VALUES (?,?,?)')
          .run(id,this.followups(id).length,JSON.stringify(change))
        seriesWrite=true
      }catch(reason){
        if(!(reason instanceof Problem))throw reason
        result={...result,summary:null,questions:[reason.message]}
      }
    }
    if(result?.skill==='projects'&&plan&&'projectIntent' in plan&&!result.questions.length){
      try{
        if(plan.projectIntent==='check'){
          const {project,work}=checkProject(this,plan.project)
          result={...result,skillData:{...plan,step:work?.title??null,date:work?.date??null},summary:project.title+' · '+timeframeNames[project.timeframe]+
            (work?' · Freie Zeit für „'+work.title+'“ finden oder die Checkpoints mit Pilot anpassen.':'')}
        }else{
          const change=prepareProjectChange(this,plan)
          this.db.prepare('INSERT INTO project_chat_changes VALUES (?,?,?)')
            .run(id,this.followups(id).length,JSON.stringify(change))
          projectWrite=true
          result={...result,summary:null}
        }
      }catch(reason){
        if(!(reason instanceof Problem))throw reason
        result={...result,summary:null,questions:[reason.message]}
      }
    }
    let recordWrite=false
    if(result?.skill==='orders'&&plan&&'orderIntent' in plan&&!result.questions.length){
      try{result={...result,summary:this.describeOrderDecision(plan)};recordWrite=true}
      catch(reason){if(!(reason instanceof Problem))throw reason;result={...result,skillData:null,summary:null,questions:[reason.message]}}
    }
    if(result?.skill==='applications'&&plan&&'applicationIntent' in plan&&!result.questions.length){
      try{result={...result,summary:this.describeApplication(plan)};recordWrite=true}
      catch(reason){if(!(reason instanceof Problem))throw reason;result={...result,skillData:null,summary:null,questions:[reason.message]}}
    }
    const changes = Boolean(result && (financeWrite || groceryWrite || seriesWrite || projectWrite || recordWrite || result.tasks.length || result.actions?.length))
    const review = Boolean(result && (changes || result.questions.length || result.skill === 'inbox_refresh'))
    this.db.prepare('UPDATE runs SET state=?, result=?, error=?, metrics=?, updated_at=? WHERE id=?')
      .run(result ? review ? 'review' : 'accepted' : 'failed', result ? JSON.stringify(result) : null, error, metrics?JSON.stringify(metrics):null, now(), id)
    if (result && changes) this.approval(this.run(id), 'adopt')
  }

  private orderTarget(plan:OrderDecisionPlan){
    const order=clothingOrders(this,undefined,plan.order).find(entry=>entry.id===plan.order)
    if(!order)throw new Problem(404,'Diese Bestellung finde ich nicht. Nenne Shop und Artikel.')
    if(plan.decision==='received')return {order,item:undefined}
    const wanted=plan.decision==='returned'?['return']:['pending','kept','return']
    const candidates=order.items.filter(item=>plan.item?item.id===plan.item:wanted.includes(item.decision)&&(plan.decision==='returned'||item.arrived))
    if(candidates.length!==1)throw new Problem(409,candidates.length?'Welches Teil aus der Bestellung '+order.merchant+' meinst du?':'Dieses Teil ist noch nicht als angekommen bestätigt.')
    return {order,item:candidates[0]}
  }
  private describeOrderDecision(plan:OrderDecisionPlan){
    const {order,item}=this.orderTarget(plan)
    const labels={kept:'behalten',return:'zur Rücksendung vormerken',returned:'Retoure als abgegeben markieren',received:'als angekommen markieren'}
    return `${order.merchant}${item?' · '+item.draft.name:' · Bestellung '+order.reference}: ${labels[plan.decision]}`
  }
  private describeApplication(plan:ApplicationPlan){
    const existing=plan.application?applicationOverview(this).items.find(item=>item.id===plan.application):undefined
    if(plan.applicationIntent==='update'&&!existing)throw new Problem(404,'Diese Bewerbung finde ich nicht. Nenne Firma und Stelle.')
    const interview=plan.interviewDate?` · Vorstellungsgespräch ${plan.interviewDate}${plan.interviewTime?' '+plan.interviewTime:''} als Termin`:''
    return `${existing?'Bewerbung ändern':'Bewerbung anlegen'}: ${plan.company||existing?.company} · ${plan.role||existing?.role} · ${applicationStatuses[plan.status]}${interview}`
  }
  private adoptRecord(plan:OrderDecisionPlan|ApplicationPlan,actor:Channel){
    if('orderIntent' in plan){
      const {order,item}=this.orderTarget(plan)
      if(plan.decision==='received')changeClothingOrder(this,order.id,'received')
      else{
        if(plan.decision!=='returned'&&item&&!item.arrived)changeClothingOrder(this,order.id,'received')
        changeClothingOrder(this,order.id,plan.decision,item!.id)
      }
      return
    }
    const existing=plan.application?applicationOverview(this).items.find(item=>item.id===plan.application):undefined
    const notes=[existing?.notes,plan.note].filter(Boolean).join('\n').slice(0,2000)
    const draft={...emptyApplication,...(existing??{}),company:plan.company||existing?.company||'',role:plan.role||existing?.role||'',status:plan.status,
      applied_on:plan.appliedOn??existing?.applied_on??null,notes}
    const saved=saveApplication(this,draft,existing?{id:existing.id,revision:existing.revision}:undefined) as {id:string}
    if(plan.interviewDate){
      const task=this.workspace.add(null,{title:'Vorstellungsgespräch '+draft.company,detail:(draft.role?draft.role+' · ':'')+'Bewerbung '+saved.id.slice(0,8),
        date:plan.interviewDate,kind:'appointment',category:'work'},actor)
      if(plan.interviewTime)for(const instance of expandBlock({start:plan.interviewDate+'T'+plan.interviewTime,minutes:60,weeks:1}))
        this.workspace.addSchedule(task.id,'slot',instance.at,instance.endsAt,actor,true)
    }
  }

  backup() {
    const directory = join(data, 'backups')
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const name = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}.sqlite3`
    this.db.prepare('VACUUM INTO ?').run(join(directory, name))
    return { name }
  }
}
