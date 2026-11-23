import {scanProjectMails} from './project-mail.ts'
import {createHash} from 'node:crypto'
import type {GoogleConnector} from '../connectors/google.ts'
import {scanClothingOrders} from './clothing-orders.ts'
import {scanInbox,scanTicketEvents,scanHfuCancellations} from './inbox.ts'
import {scanMailFinances} from './mail-finance.ts'
import {Problem} from './settings.ts'
import type {Store} from './store.ts'

type Cursor={account:string,after_epoch:number,before_epoch:number|null,page_token:string|null}
const second=()=>Math.floor(Date.now()/1000)

export async function confirmedMailAccount(google:Pick<GoogleConnector,'mailboxAddress'>) {
  const address=await google.mailboxAddress()
  return address?.trim().toLowerCase() || undefined
}
export const mailAccountKey=(address:string)=>createHash('sha256').update(address).digest('hex')

export async function enableMailCategorization(store:Store,google:GoogleConnector,address:string, afterEpoch?:unknown) {
  const earliest=second()-30*86400
  if(afterEpoch!==undefined && (typeof afterEpoch!=='number' || !Number.isSafeInteger(afterEpoch) || afterEpoch<earliest || afterEpoch>second())) throw new Problem(400,'Ungültiger Start für den Gmail-Abgleich.')
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/u.test(address)||address.length>320) throw new Problem(400,'Gib eine gültige Gmail-Adresse ein.')
  if(await confirmedMailAccount(google)!==address.toLowerCase()) throw new Problem(409,'Das verknüpfte Gmail-Konto stimmt nicht überein.')
  const account=mailAccountKey(address.toLowerCase())
  store.db.prepare(`INSERT INTO gmail_categorization(singleton,account,after_epoch) VALUES (1,?,?)
    ON CONFLICT(singleton) DO UPDATE SET account=excluded.account,after_epoch=excluded.after_epoch,
    before_epoch=NULL,page_token=NULL WHERE gmail_categorization.account<>excluded.account`).run(account,typeof afterEpoch==='number' ? afterEpoch : earliest)
}

export async function syncCategorizedMail(store:Store,google:GoogleConnector) {
  const cursor=store.db.prepare('SELECT * FROM gmail_categorization WHERE singleton=1').get() as Cursor|undefined
  if(!cursor) return
  const statuses=google.status().filter(entry=>entry.connected)
  if(!statuses.some(entry=>entry.service==='gmail-content') || !statuses.some(entry=>entry.service==='gmail-sort')) return
  const before=cursor.before_epoch ?? second()
  if(before<=cursor.after_epoch+1) return
  if(!cursor.before_epoch) store.db.prepare('UPDATE gmail_categorization SET before_epoch=? WHERE singleton=1 AND account=?').run(before,cursor.account)
  let pageToken=cursor.page_token
  let labeled=0
  for(let page=0;page<3;page++){
    const batch=await google.recentInbox(account=>account===cursor.account && pageToken
      ? {afterEpoch:cursor.after_epoch,pageToken} : undefined,false,{afterEpoch:cursor.after_epoch,beforeEpoch:before,account:cursor.account})
    if(batch.account!==cursor.account) throw new Problem(409,'Automatische Gmail-Kategorien sind für ein anderes Konto eingerichtet.')
    scanClothingOrders(store,batch.mails,batch.account)
    scanMailFinances(store,batch.mails,batch.account)
    scanTicketEvents(store,batch.mails,batch.account)
    scanHfuCancellations(store,batch.mails,batch.account)
    scanProjectMails(store,batch.mails,batch.account)
    scanInbox(store,batch.mails)
    labeled+=await google.sortInboxPage(batch.account,batch.mails)
    pageToken=batch.next?.pageToken??null
    if(!pageToken){
      store.db.prepare('UPDATE gmail_categorization SET after_epoch=?,before_epoch=NULL,page_token=NULL WHERE singleton=1 AND account=?')
        .run(before-1,cursor.account)
      break
    }
    store.db.prepare('UPDATE gmail_categorization SET page_token=? WHERE singleton=1 AND account=?').run(pageToken,cursor.account)
  }
  return {labeled,more:Boolean(pageToken)}
}
