export const groceryCategories = [
  ['produce','Obst & Gemüse','🥦'], ['bakery','Brot & Gebäck','🥖'], ['dairy','Milch & Käse','🧀'],
  ['meat','Fleisch & Fisch','🥩'], ['breakfast','Frühstück & Aufstriche','🍯'],
  ['oil','Öle & Essig','🫒'], ['sauce','Soßen & Würzmittel','🧂'], ['pantry','Zutaten & Gewürze','🍝'], ['frozen','Tiefkühl & Fertiggerichte','❄️'],
  ['plant','Pflanzliche Alternativen','🌱'], ['snacks','Snacks & Süßwaren','🍫'], ['drinks','Getränke','🥤'], ['home','Haushalt & Reinigung','🧼'],
  ['paper','Papier, Folien & Beutel','🧻'], ['dental','Zahnpflege','🪥'], ['care','Körperpflege & Gesundheit','🧴'], ['pets','Tierbedarf','🐾'], ['other','Sonstiges','📦'],
] as const
export const locations = { fridge:'Kühlschrank', freezer:'Gefrierfach', pantry:'Speisekammer', home:'Haushalt & Bad' } as const
export const stockStates = { stocked:'Vorrätig',low:'Wird knapp',empty:'Leer' } as const
export type GroceryCategory = typeof groceryCategories[number][0]
export type Location = keyof typeof locations
export type StockState = keyof typeof stockStates
export type GroceryInput = { name:string, quantity?:string, category?:GroceryCategory, location?:Location, status?:StockState, expiry?:string|null, note?:string }
export type StockItem = Required<GroceryInput> & { id:string }
export type ShoppingItem = Pick<StockItem,'id'|'name'|'quantity'|'category'|'note'> & { checked:boolean, expiry?:string|null }
export type GroceryOverview = { stock:StockItem[], shopping:ShoppingItem[], recent:ShoppingItem[] }
export type GroceryPlan = { groceryIntent:'stock_read'|'list_read'|'shop_add'|'shop_remove'|'stock_add'|'recipe'|'ideas'|'receipt', title:string|null,
  items:{name:string,quantity:string|null,status:StockState|null}[], onHand?:{name:string,quantity:string|null,save:boolean}[], steps:string[], totalCents:number|null }
export type GroceryAnswer = { title:string, available:string[], missing:GroceryInput[], steps:string[], write:'shop'|'remove'|'stock'|'receipt'|'recipe'|null, rows:(GroceryInput&{id?:string})[], totalCents?:number, ingredients?:GroceryInput[], stockRows?:GroceryInput[] }

export function receiptTotal(text:string) {
  const matches=[...text.matchAll(/(?:^|\n)\s*(?:gesamtsumme|gesamtbetrag|zu zahlen|endbetrag|summe|gesamt)\s*[:€ ]*\n?\s*(\d{1,5})[,.](\d{2})(?=\s|€|$)/giu)]
  const amounts=new Set(matches.map(match=>Number(match[1])*100+Number(match[2])))
  return amounts.size===1?[...amounts][0]:null
}

export type SavedRecipe = { id:string, title:string, ingredients:GroceryInput[], steps:string[],
  ingredientChecks:boolean[], stepChecks:boolean[], savedAt:string }
