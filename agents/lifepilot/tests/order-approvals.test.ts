import {test} from 'node:test'
import assert from 'node:assert/strict'
import {orderDecisions} from '../../../hub/ui/order-decisions.ts'
import type {ClothingOrderView} from '../../../hub/runtime/clothing-orders.ts'

const item=(id:string,arrived:boolean,decision:'pending'|'kept'|'return'|'returned')=>({id,draft:{name:id} as never,wardrobeId:null,arrived,decision,hasPhoto:false,canLoadPhoto:false,hasExpectedPhoto:false})
const order=(id:string,status:ClothingOrderView['status'],items:ReturnType<typeof item>[],estimatedOn:string|null=null)=>({id,status,items,estimatedOn,
  shippedOn:null,cancelledOn:null,sourceKind:'order',totals:{purchase:null,refund:null,refundOn:null,purchaseBooked:false,refundBooked:false},tracking:[],
  merchant:'Laden',reference:'1',orderedOn:'2026-11-01',deliveredOn:null,deadline:null,taskId:null} as unknown as ClothingOrderView)

test('Orders waiting for a decision reach the start page, finished ones do not',()=>{
  const open=orderDecisions([
    order('review','review',[item('a',true,'pending'),item('b',true,'kept')]),
    order('return','return',[item('c',true,'return')]),
    order('late','shipping',[item('d',false,'pending')],'2026-11-20'),
    order('future','shipping',[item('e',false,'pending')],'2026-12-20'),
    order('done','closed',[item('f',true,'kept')]),
  ],'2026-11-25')
  assert.deepEqual(open.map(entry=>[entry.order.id,entry.pending.length,entry.returns.length,entry.due]),
    [['review',1,0,false],['return',0,1,false],['late',0,0,true]])
})
