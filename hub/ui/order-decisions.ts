import type {ClothingOrderView} from '../runtime/clothing-orders.ts'
import {dateInBerlin} from '../runtime/values.ts'

/** Bestellungen, die eine Entscheidung brauchen: Ankunft bestätigen, Behalten oder Zurücksenden, Retoure abgeben. */
export function orderDecisions(orders:readonly ClothingOrderView[],today=dateInBerlin()){
  return orders.flatMap(order=>{
    if(order.status==='cancelled'||order.status==='closed')return []
    const pending=order.items.filter(item=>item.arrived&&item.decision==='pending')
    const returns=order.items.filter(item=>item.decision==='return')
    const due=order.status==='shipping'||order.status==='ordered'?Boolean(order.estimatedOn&&order.estimatedOn<=today)||order.status==='shipping'&&!!order.shippedOn&&order.shippedOn<=today:false
    return pending.length||returns.length||due?[{order,pending,returns,due}]:[]
  })
}

