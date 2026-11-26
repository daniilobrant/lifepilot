import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Store } from '../../../hub/runtime/store.ts'
import { financeOverview } from '../../../hub/runtime/finance.ts'
import { decidePayPal, paypalOverview, pendingMailFinances } from '../../../hub/runtime/mail-finance.ts'

function add(store:Store,draft:object,fingerprint:string){
  const id=randomUUID()
  store.db.prepare('INSERT INTO gmail_finance_suggestions (id,account,fingerprint,draft) VALUES (?,?,?,?)').run(id,'a',fingerprint,JSON.stringify(draft))
  return id
}
test('PayPal-Zahlungen zählen nur nach Zuordnen und lassen sich umkehren',()=>{
  const store=new Store(':memory:')
  try {
    const incoming=add(store,{title:'Anna Beispiel',cents:4000,date:'2026-11-05',refund:false,mailDate:false,direction:'incoming',counterparty:'Anna Beispiel',sourceKey:'k1',paypal:{reference:''}},'k1')
    const outgoing=add(store,{title:'Ben Muster',cents:2000,date:'2026-11-06',refund:false,mailDate:false,direction:'outgoing',counterparty:'Ben Muster',sourceKey:'k2',paypal:{reference:''}},'k2')
    assert.equal(pendingMailFinances(store,'a',false).length,0)
    const card=add(store,{title:'Kartenzahlung Café',cents:900,date:'2026-11-07',refund:false,mailDate:true,direction:'outgoing',sourceKey:'k3',merchantPayment:{reference:''}},'k3')
    assert.equal(paypalOverview(store,'a').length,3)
    decidePayPal(store,'a',card,false)
    assert.equal(paypalOverview(store,'a','2026-10').length,0)
    assert.equal(paypalOverview(store,'a','2026-11').length,3)
    assert.equal(financeOverview(store,'2026-11').totals.balance,0)
    decidePayPal(store,'a',incoming,true)
    decidePayPal(store,'a',outgoing,false)
    let totals=financeOverview(store,'2026-11').totals
    assert.equal(totals.variableIncome,4000)
    assert.equal(totals.variable,0)
    assert.deepEqual(paypalOverview(store,'a').map(row=>row.state).sort(),['assigned','ignored','ignored'])
    decidePayPal(store,'a',incoming,false)
    decidePayPal(store,'a',outgoing,true)
    totals=financeOverview(store,'2026-11').totals
    assert.equal(totals.variableIncome,0)
    assert.equal(totals.variable,2000)
  } finally {store.db.close()}
})
