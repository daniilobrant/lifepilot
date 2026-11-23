import { grocerySearchKey } from '../runtime/grocery-catalog.ts'

const products: [RegExp,string][] = [
  [/gurke/u,'🥒'], [/karotte|mohre/u,'🥕'], [/knoblauch/u,'🧄'], [/zwiebel/u,'🧅'], [/ingwer/u,'🫚'],
  [/tomat/u,'🍅'], [/brokkoli/u,'🥦'], [/kartoffel/u,'🥔'], [/salat|spinat/u,'🥬'], [/pilz|champignon/u,'🍄'],
  [/apfel/u,'🍎'], [/banane/u,'🍌'], [/erdbeer/u,'🍓'], [/zitrone/u,'🍋'], [/orange/u,'🍊'],
  [/hahnchen/u,'🍗'], [/hackfleisch|rind/u,'🥩'], [/lachs|fisch|thunfisch/u,'🐟'], [/^ei(?:er)?$/u,'🥚'],
  [/brot|toast/u,'🍞'], [/nudel|spaghetti|pasta/u,'🍝'], [/reis(?!essig)/u,'🍚'],
  [/honig/u,'🍯'], [/milch|haferdrink/u,'🥛'], [/kase/u,'🧀'], [/butter/u,'🧈'], [/salz/u,'🧂'],
  [/kaffee/u,'☕'], [/^tee/u,'🍵'], [/schokolade/u,'🍫'], [/pizza/u,'🍕'], [/zahnburste|zahnpasta/u,'🪥'],
  [/toilettenpapier|kuchenrolle/u,'🧻'], [/seife|spulmittel/u,'🧼'], [/reiniger/u,'🧽'],
]
const sauces=/sojaso|sojasau|ketchup|senf|mayonnaise|sauce|sosse/u
const oils=/rapsol|olivenol|sesamol|speiseol|essig/u

export function GroceryIcon({name,fallback}:{name:string,fallback:string}) {
  const product=grocerySearchKey(name)
  if (/paprika/u.test(product) && !/pulver|gewurz/u.test(product)) {
    const color=/grun/u.test(product)?'#469658':/gelb/u.test(product)?'#e0a626':'#d7483a'
    return <svg className="grocery-item-icon" aria-hidden="true" viewBox="0 0 32 32" data-product="Paprika">
      <path d="M16 12c-1-4 0-7 4-9" fill="none" stroke="#367351" strokeWidth="3" strokeLinecap="round"/>
      <path d="M16 11C9 6 3 12 5 19c1 7 6 10 11 8 5 2 10-1 11-8 2-7-4-13-11-8Z" fill={color}/>
      <path d="M13 13c-3 1-4 5-2 8m9-7c2 2 3 5 1 9" fill="none" stroke="#fff" strokeOpacity=".42" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  }
  if (/fruhlingszwiebel|lauchzwiebel|schalotte grun/u.test(product)) {
    return <svg className="grocery-item-icon" aria-hidden="true" viewBox="0 0 32 32" data-product="Frühlingszwiebel">
      <path d="M7 25C10 22 17 15 21 5M9 26c8-6 13-9 19-17M8 26C11 18 11 12 15 5" fill="none" stroke="#398255" strokeWidth="3" strokeLinecap="round"/>
      <path d="M5 26c2-3 5-7 8-8l3 3c-3 3-7 7-10 8l-1-3Z" fill="#e1e9be" stroke="#709058" strokeWidth="1"/>
      <path d="m6 27-3 2m4-1-2 3" fill="none" stroke="#ae8c63" strokeLinecap="round"/>
    </svg>
  }
  if (sauces.test(product) || oils.test(product)) {
    return <svg className="grocery-item-icon" aria-hidden="true" viewBox="0 0 32 32" data-product={sauces.test(product)?'Soße':'Öl oder Essig'}>
      <path d="M13 4h6v7l4 4v13H9V15l4-4Z" fill={sauces.test(product)?'#844c3b':'#b38b38'} stroke="#493a29" strokeWidth="1.2" strokeLinejoin="round"/>
      <path d="M13 4h6M10 19h12v5H10" fill="none" stroke="#f4e3ba" strokeWidth="2"/>
    </svg>
  }
  return <span className="grocery-item-icon" aria-hidden="true">{products.find(([pattern])=>pattern.test(product))?.[1]??fallback}</span>
}
