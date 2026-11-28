import type { GroceryCategory } from './grocery-types.ts'

export const groceryCatalog = [
  'Gurke','Salatgurke','Paprika','Rote Paprika','Chili','Frühlingszwiebeln','Lauchzwiebeln','Paprikapulver','Karotte','Knoblauch','Frischer Ingwer','Ingwer','Tomaten',
  'Kartoffeln','Zwiebeln','Eisbergsalat','Spinat','Apfel','Äpfel','Bananen','Zitronen','Erdbeeren','Champignons','Brokkoli','Petersilie',
  'Hackfleisch','Hähnchen','Hähnchenfleisch','Hähnchenbrustfilet','Rinderhackfleisch','Lachs','Eier','Milch','Hafermilch','Quark','Joghurt','Butter',
  'Nudeln','Mie-Nudeln','Reis','Mehl','Linsen','Haferflocken','Pfeffer','Salz','Passierte Tomaten','Kichererbsen',
  'Honig','Marmelade','Müsli','Erdnussbutter','Rapsöl','Olivenöl','Sesamöl','Reisessig','Apfelessig','Sojasoße','Ketchup','Senf','Mayonnaise',
  'Tofu','Tempeh','Veganes Hack','Tortilla-Wraps','Toastbrot','Cornflakes','Mineralwasser','Kaffee','Tee','Orangensaft','Kopfsalat',
  'Zahnpasta','Zahnbürste','Zahnseide','Deodorant','Shampoo','Duschgel','Sonnencreme','Handseife','Kontaktlinsenlösung',
  'Spülmittel','Waschmittel','Allzweckreiniger','Müllbeutel','Toilettenpapier','Küchenrolle','Taschentücher','Gefrierbeutel','Backpapier','Alufolie',
  'Hundefutter','Katzenfutter','Katzenstreu','Tiefkühlpizza','Schokolade','Haferdrink',
  // Alltagsartikel für Suche und Schnellerfassung
  'Schinken','Kochschinken','Salami','Speck','Bacon','Aufschnitt','Putenbrust','Hähnchenschenkel','Schweinefilet','Rindersteak','Bratwurst','Wiener Würstchen','Thunfisch','Garnelen','Fischstäbchen',
  'Gouda','Emmentaler','Mozzarella','Feta','Parmesan','Frischkäse','Schmand','Saure Sahne','Sahne','Crème fraîche','Skyr','Mascarpone','Halloumi',
  'Brötchen','Vollkornbrot','Baguette','Croissants','Bagels','Knäckebrot',
  'Zucchini','Aubergine','Avocado','Limetten','Orangen','Trauben','Blaubeeren','Himbeeren','Birnen','Mango','Ananas','Süßkartoffeln','Blumenkohl','Rotkohl','Weißkohl','Lauch','Sellerie','Radieschen','Mais','Erbsen','Rucola','Feldsalat','Pilze','Thai-Chilis','Frühlingsrollen',
  'Basilikum','Thai-Basilikum','Koriander','Schnittlauch','Dill','Minze','Rosmarin','Thymian',
  'Spaghetti','Penne','Fusilli','Lasagneplatten','Basmatireis','Jasminreis','Couscous','Bulgur','Quinoa','Gnocchi','Rote Linsen','Kidneybohnen','Weiße Bohnen','Mais (Dose)','Gehackte Tomaten','Tomatenmark','Kokosmilch','Gemüsebrühe','Hühnerbrühe',
  'Zucker','Puderzucker','Backpulver','Hefe','Vanillezucker','Kakao','Speisestärke','Paniermehl',
  'Oregano','Curry','Kurkuma','Kreuzkümmel','Zimt','Chiliflocken','Muskat','Knoblauchpulver','Paprikapulver edelsüß',
  'Austernsoße','Fischsauce','Sriracha','Pesto','BBQ-Soße','Tabasco','Balsamico','Sonnenblumenöl',
  'Nutella','Butterkekse','Chips','Nüsse','Mandeln','Gummibärchen','Müsliriegel','Popcorn',
  'Apfelsaft','Cola','Bier','Wein','Sprudelwasser','Eistee','Energy Drink',
  'Spülmaschinentabs','Weichspüler','Schwämme','Glasreiniger','Badreiniger','WC-Reiniger','Handtuchpapier','Frischhaltefolie','Rasierer','Rasierschaum','Bodylotion','Wattepads','Pflaster','Ibuprofen','Paracetamol',
]


/** Weitere Alltagsartikel, damit die Schnellsuche möglichst viel direkt erkennt. */
const moreCatalog = [
  // Obst und Gemüse
  'Kürbis','Hokkaido-Kürbis','Spargel','Grüner Spargel','Fenchel','Kohlrabi','Rosenkohl','Grünkohl','Chinakohl','Spitzkohl','Pak Choi','Mangold','Rote Bete','Pastinaken','Petersilienwurzel','Schalotten','Porree','Knollensellerie','Staudensellerie','Mini-Gurken','Cherrytomaten','Strauchtomaten','Romatomaten','Snackpaprika','Spitzpaprika','Jalapeños','Peperoni','Edamame','Zuckerschoten','Brechbohnen','Grüne Bohnen','Maiskolben','Auberginen','Okra','Artischocken','Oliven','Kapern','Frische Minze','Salbei','Lorbeerblätter','Zitronengras','Zitronenmelisse','Kresse','Sprossen','Babyspinat','Eichblattsalat','Romanasalat','Endivien','Radicchio','Chicorée','Wassermelone','Honigmelone','Kiwi','Pfirsiche','Nektarinen','Pflaumen','Kirschen','Aprikosen','Feigen','Datteln','Granatapfel','Passionsfrucht','Papaya','Litschi','Kokosnuss','Grapefruit','Mandarinen','Clementinen','Johannisbeeren','Brombeeren','Rhabarber','Rosinen','Cranberrys','Trockenfrüchte','Kokosraspeln',
  // Fleisch, Fisch, Ersatzprodukte
  'Hähnchenbrust','Hähnchenkeule','Hähnchenflügel','Putenschnitzel','Putenhack','Gehacktes gemischt','Schweineschnitzel','Schweinebauch','Nackensteak','Kasseler','Rinderfilet','Rindergulasch','Rinderbraten','Entrecôte','Lammkeule','Lammkoteletts','Leberwurst','Mettwurst','Cabanossi','Chorizo','Currywurst','Frikadellen','Hähnchenspieße','Lachsfilet','Forelle','Kabeljau','Seelachs','Thunfischsteak','Heringe','Räucherlachs','Matjes','Krabben','Muscheln','Tintenfisch','Sardinen','Makrele','Veganes Schnitzel','Vegane Burger','Seitan','Falafel','Räuchertofu','Haferbarista',
  // Milch, Eier, Käse
  'Laktosefreie Milch','Sojadrink','Mandeldrink','Kondensmilch','Schlagsahne','Kochsahne','Buttermilch','Kefir','Naturjoghurt','Griechischer Joghurt','Fruchtjoghurt','Pudding','Margarine','Eier Freiland','Camembert','Brie','Bergkäse','Raclettekäse','Gorgonzola','Ziegenkäse','Hirtenkäse','Scheibenkäse','Reibekäse','Ricotta','Burrata','Schafskäse',
  // Backwaren und Frühstück
  'Dinkelbrot','Roggenbrot','Mehrkornbrötchen','Laugenbrezeln','Laugenbrötchen','Ciabatta','Fladenbrot','Pita','Naan','Brioche','Toast','Zwieback','Reiswaffeln','Haferkekse','Pancake-Mix','Ahornsirup','Agavendicksaft','Frühstücksflocken','Granola','Overnight Oats','Chia-Samen','Leinsamen','Sonnenblumenkerne','Kürbiskerne','Sesam','Haselnüsse','Walnüsse','Cashewkerne','Erdnüsse','Pistazien','Pinienkerne','Nuss-Nougat-Creme',
  // Vorrat und Konserven
  'Dinkelnudeln','Vollkornnudeln','Reisnudeln','Glasnudeln','Soba-Nudeln','Udon-Nudeln','Ramen-Nudeln','Tagliatelle','Farfalle','Rigatoni','Tortellini','Ravioli','Spätzle','Semmelknödel','Kartoffelknödel','Kartoffelpüree','Vollkornreis','Risottoreis','Milchreis','Polenta','Hirse','Buchweizen','Graupen','Dinkel','Haferkleie','Weizenmehl','Vollkornmehl','Dinkelmehl','Maismehl','Kichererbsenmehl','Grieß','Kidneybohnen (Dose)','Schwarze Bohnen','Kichererbsen (Dose)','Linsen (Dose)','Gemüsemais','Erbsen und Möhren','Sauerkraut','Rotkohl (Glas)','Gewürzgurken','Essiggurken','Silberzwiebeln','Tomatensoße','Pizzasoße','Pastasoße','Currysoße','Erdnusssoße','Hoisinsoße','Teriyakisoße','Worcestersoße','Meerrettich','Sambal Oelek','Harissa','Tahini','Hummus','Kokosöl','Traubenkernöl','Leinöl','Walnussöl','Weißweinessig','Rotweinessig','Balsamicoessig','Himbeeressig','Zitronensaft','Limettensaft','Kokoswasser','Kokosblütenzucker','Rohrzucker','Brauner Zucker','Stevia','Süßstoff','Gelierzucker','Vanilleschote','Backaroma','Backkakao','Kuvertüre','Zartbitterschokolade','Vollmilchschokolade','Schokostreusel','Mürbeteig','Blätterteig','Pizzateig','Hefeteig','Tortillachips','Salzstangen','Erdnussflips','Cracker','Reiscracker','Studentenfutter','Fruchtgummi','Lakritz','Eis','Vanilleeis','Tiefkühlgemüse','Tiefkühlbeeren','Tiefkühlspinat','Pommes','Kroketten','Rösti','Fischstäbchen (TK)','Hähnchen-Nuggets','Tiefkühlpizza Salami','Blattspinat (TK)','Suppengemüse','Gemüsebrühe (Pulver)','Rinderbrühe','Fond','Instantnudeln','Fertigsuppe','Tütensuppe','Ketchup Tomate','Currypulver','Garam Masala','Ras el Hanout','Paprika geräuchert','Pfefferkörner','Meersalz','Knoblauchsalz','Italienische Kräuter','Kräuter der Provence','Majoran','Estragon','Salbei getrocknet','Lorbeer','Nelken','Kardamom','Anis','Fenchelsamen','Ingwerpulver','Safran','Vanillepulver','Muskatnuss','Wacholderbeeren',
  // Getränke
  'Apfelschorle','Orangensaft (frisch)','Multivitaminsaft','Traubensaft','Tomatensaft','Smoothie','Limonade','Fanta','Sprite','Ginger Ale','Tonic Water','Mate','Eiskaffee','Kaffeebohnen','Kaffeepads','Kaffeekapseln','Instantkaffee','Espresso','Früchtetee','Kräutertee','Grüner Tee','Schwarzer Tee','Kamillentee','Pfefferminztee','Kakaopulver','Hafer-Barista','Weißwein','Rotwein','Sekt','Prosecco','Rosé','Radler','Pils','Weizenbier','Alkoholfreies Bier','Gin','Wodka','Rum','Whisky','Likör','Saftschorle','Protein-Shake','Proteinpulver','Kreatin',
  // Haushalt und Drogerie
  'Geschirrspülmittel','Geschirrspülmaschinensalz','Klarspüler','Maschinenreiniger','Entkalker','Bodenreiniger','Fensterreiniger','Küchenreiniger','Desinfektionsspray','Putzlappen','Mikrofasertücher','Spülbürste','Müllsäcke','Biomüllbeutel','Gelbe Säcke','Kerzen','Streichhölzer','Feuerzeug','Batterien AA','Batterien AAA','Glühbirnen','Teelichter','Servietten','Küchenpapier','Frischhaltebeutel','Brotdose','Kaffeefilter','Teefilter','Backformen','Muffinförmchen','Zahnpasta Whitening','Mundspülung','Interdentalbürsten','Zungenreiniger','Handcreme','Gesichtscreme','Gesichtsreiniger','Make-up-Entferner','Tagescreme','Nachtcreme','Lippenpflege','Haargel','Haarspray','Spülung','Haarkur','Trockenshampoo','Haarbürste','Haargummis','Rasierklingen','Aftershave','Parfüm','Nagellack','Nagellackentferner','Nagelschere','Feuchttücher','Tampons','Binden','Slipeinlagen','Kondome','Tempos','Wattestäbchen','Sonnenmilch','After Sun','Insektenspray','Mückenschutz','Hustensaft','Halsschmerztabletten','Nasenspray','Vitamin D','Magnesium','Zink','Elektrolyte','Erkältungstee','Wärmepflaster','Fieberthermometer','Verbandszeug','Desinfektionsmittel','Kontaktlinsen','Brillenputztücher','Babynahrung','Windeln','Babytücher','Tierfutter','Vogelfutter','Hundeleckerli','Katzenleckerli','Futternapf',
]

export function grocerySearchKey(name:string) {
  return name.toLocaleLowerCase('de-DE').normalize('NFD').replace(/\p{M}/gu,'').replace(/ß/g,'ss')
    .replace(/[^\p{L}\p{N}]+/gu,' ').trim()
}

const aliases = new Map(Object.entries({
  eier:'ei',aepfel:'apfel',apfel:'apfel',bananen:'banane',tomaten:'tomate',zwiebeln:'zwiebel',kartoffeln:'kartoffel',
  krapsel:'rapsol',rapsoel:'rapsol',sojasosse:'sojasauce','soja sauce':'sojasauce','soja sosse':'sojasauce','frischer ingwer':'ingwer',mohren:'karotte',mohre:'karotte',karotten:'karotte',gurken:'gurke',zitronen:'zitrone',hafermilch:'haferdrink',
  'schwarzer pfeffer':'pfeffer', 'tomaten passiert':'passierte tomaten','passierte tomate':'passierte tomaten',
}))
/**
 * Eindeutige Produkt-ID: Einkaufsliste, Vorrat und Rezepte vergleichen immer diese ID, nicht den Anzeigenamen.
 * Die Gruppen fassen Schreibweisen, Mehrzahl und gleichwertige Bezeichnungen zusammen (erster Eintrag = ID).
 */
const productGroups:string[][]=[
  ['ei','eier','huhnereier','freilandeier','bio eier','eier freiland'],['karotte','karotten','mohre','mohren','mohrruben','mohrrube','moehren'],
  ['zwiebel','zwiebeln','speisezwiebel','speisezwiebeln','gemusezwiebel','gelbe zwiebel','rote zwiebel','rote zwiebeln'],
  ['kartoffel','kartoffeln','speisekartoffeln','festkochende kartoffeln','mehligkochende kartoffeln'],
  ['tomate','tomaten','strauchtomaten','strauchtomate','romatomaten','cherrytomaten','cocktailtomaten'],
  ['gurke','gurken','salatgurke','salatgurken','schlangengurke'],['sahne','schlagsahne','kochsahne','rahm'],
  ['joghurt','naturjoghurt','joghurt natur','griechischer joghurt'],['knoblauch','knoblauchzehe','knoblauchzehen','knoblauchknolle'],
  ['zitrone','zitronen','bio zitrone'],['limette','limetten'],['milch','vollmilch','frischmilch','h milch','haltbare milch','laktosefreie milch'],
  ['mehl','weizenmehl','mehl typ 405','mehl 405'],['zucker','haushaltszucker','kristallzucker','weisser zucker'],
  ['fruhlingszwiebel','fruhlingszwiebeln','lauchzwiebel','lauchzwiebeln'],['spinat','blattspinat','babyspinat'],
  ['champignon','champignons','braune champignons','weisse champignons'],['paprika','paprikaschote','paprikaschoten','rote paprika','gelbe paprika','grune paprika','spitzpaprika'],
  ['hahnchen','hahnchenfleisch','hahnchenbrust','hahnchenbrustfilet','hahnchenfilet','putenbrust'],
  ['hackfleisch','rinderhack','rinderhackfleisch','gemischtes hack','gehacktes','gehacktes gemischt','hack'],
  ['spaghetti','spaghettini'],['nudeln','pasta','penne','fusilli','farfalle','tagliatelle','rigatoni','makkaroni','vollkornnudeln','dinkelnudeln'],
  ['olivenol','natives olivenol','olivenol extra vergine'],['rapsol','speiseol','pflanzenol','sonnenblumenol'],
  ['sojasauce','sojasosse','soja sauce','soja sosse'],['butter','susrahmbutter','sussrahmbutter','markenbutter'],
  ['parmesan','parmigiano','parmigiano reggiano','grana padano'],['mozzarella','mozzarella kugel'],['feta','schafskase','hirtenkase'],
  ['haferflocken','kernige haferflocken','zarte haferflocken'],['reis','basmatireis','basmati reis','jasminreis','jasmin reis','langkornreis','parboiled reis'],
  ['passierte tomaten','tomaten passiert','passierte tomate','passata','tomatenpassata','stuckige tomaten','gehackte tomaten','dosentomaten'],
  ['apfel','apfel','aepfel','aepfel'],['banane','bananen'],['erdbeere','erdbeeren'],['avocado','avocados'],['aubergine','auberginen'],['zucchini','zucchinis'],
  ['salz','speisesalz','meersalz','jodsalz'],['pfeffer','schwarzer pfeffer','pfeffer schwarz','gemahlener pfeffer'],['ingwer','frischer ingwer','ingwerwurzel'],
  ['petersilie','glatte petersilie','krause petersilie'],['basilikum','frisches basilikum'],['minze','frische minze','pfefferminze'],
  ['thunfisch','thunfisch dose','thunfisch in wasser'],['lachs','lachsfilet'],['eisbergsalat','eisberg'],['brokkoli','broccoli'],
]
for(const [id,...names] of productGroups) for(const name of names) aliases.set(name,id)
export function groceryKey(name:string) { const key=grocerySearchKey(name);return aliases.get(key)??key }
/** Stabile Produkt-ID für Vorrat, Einkaufsliste und Rezepte. */
export const productId=groceryKey

const alternatives=new Map([
  ['chilis','Chili'],['thai chilis','Chili'],['thai chili','Chili'],['thaichilis','Chili'],['thaichili','Chili'],
  ['soja sosse','Sojasoße'],['soja sauce','Sojasoße'],['sojasauce','Sojasoße'],
  ['krapsel','Rapsöl'],['rapsoel','Rapsöl'],['haehnchen','Hähnchen'],['gefrierbeutel','Gefrierbeutel'],
])
const catalog=new Map([...groceryCatalog,...moreCatalog].map(name=>[grocerySearchKey(name),name]))

function editDistance(a:string,b:string) {
  let prev=Array.from({length:b.length+1},(_,i)=>i), before=prev
  for (let i=1;i<=a.length;i++) {
    const next=[i]
    for (let j=1;j<=b.length;j++) {
      let distance=Math.min(prev[j]+1,next[j-1]+1,prev[j-1]+Number(a[i-1]!==b[j-1]))
      if (i>1 && j>1 && a[i-1]===b[j-2] && a[i-2]===b[j-1]) distance=Math.min(distance,before[j-2]+1)
      next.push(distance)
    }
    before=prev;prev=next
  }
  return prev[b.length]
}

export function grocerySuggestions(value:string,known:string[]=[]) {
  const key=grocerySearchKey(value)
  if (key.length<2) return []
  const exact=alternatives.get(key)??catalog.get(key)
  const options=new Map(catalog)
  for (const word of known) {
    const candidate=grocerySearchKey(word)
    if (!options.has(candidate)) options.set(candidate,canonicalGroceryName(word,false))
  }
  const matches=[...options].flatMap(([word,label])=>{
    if (word===key) return [{label,score:0}]
    if (word.startsWith(key)) return [{label,score:1}]
    if (word.includes(key)) return [{label,score:2}]
    if (key.length<4 || Math.abs(key.length-word.length)>2) return []
    const distance=editDistance(key,word)
    return distance<=(key.length>=8?2:1) ? [{label,score:distance+2}] : []
  }).sort((a,b)=>a.score-b.score || a.label.length-b.label.length)
  return [...new Set([...(exact?[exact]:[]),...matches.map(row=>row.label)])].slice(0,6)
}

export function knownGroceryName(value:string) {
  const key=grocerySearchKey(value)
  return alternatives.get(key)??catalog.get(key)
}

export function canonicalGroceryName(value:string,correctTypos=true) {
  const key=grocerySearchKey(value)
  const exact=knownGroceryName(value)
  if (exact) return exact
  if (correctTypos && key.length>=4 && !key.includes(' ')) {
    const close=[...catalog].filter(([word])=>Math.abs(word.length-key.length)<=1 &&
      !word.startsWith(key) && !key.startsWith(word) && editDistance(key,word)===1)
    if (close.length===1) return close[0][1]
  }
  return value.trim().replace(/^\p{Ll}/u,letter=>letter.toLocaleUpperCase('de-DE'))
}

const rules: [GroceryCategory,RegExp][] = [
  ['herbs',/basilikum|krapao|koriander|schnittlauch|petersilie|\bdill\b|minze|rosmarin|thymian|salbei|zitronengras/u],
  ['canned',/(?:\(dose\)|dose)|kidneybohnen|weisse bohnen|kichererbs|linsen|kokosmilch|gehackte tomaten|thunfisch|mais/u],
  ['baking',/backpulver|hefe|vanillezucker|puderzucker|kakao|speisestarke|paniermehl|^zucker$|mehl/u],
  ['pets',/katzenstreu|tierfutter|hundefutter|katzenfutter|hundekeks/u],
  ['paper',/toilettenpapier|kuchenrolle|taschentuch|backpapier|alufolie|gefrierbeutel|mullbeutel/u],
  ['frozen',/tiefkuhl|tiefgefroren|gefrier|^tk\b|pizza|fertiggericht/u],
  ['home',/spulmittel|schwamm|waschmittel|reiniger|mullbeutel|kuchenrolle|toilettenpapier/u],
  ['dental',/zahnpasta|zahnburste|zahnseide|mundspulung/u],
  ['plant',/tofu|tempeh|veganes hack|seitan/u],
  ['care',/zahnpasta|zahnburste|duschgel|shampoo|taschentuch|deodorant|seife/u],
  ['drinks',/wasser|kaffee|^tee|saft|bier|haferdrink|hafermilch|getrank|cola/u],
  ['bakery',/brot|brotchen|toast|wraps?|baguette|croissant/u],
  ['meat',/hackfleisch|hahnchen|lachs|fisch|rind|schwein|wurst|wurstchen|speck|bacon|aufschnitt|schinken|salami|pute|garnele|shrimp|steak|schnitzel|mortadella|chorizo/u],
  ['dairy',/milch|joghurt|yogurt|quark|butter|kase|mozzarella|parmesan|gouda|emmentaler|^ei(?:er)?$|sahne|schmand|creme fraiche|skyr|feta|mascarpone|halloumi/u],
  ['breakfast',/honig|marmelad|konfitur|musli|porridge|aufstrich/u],
  ['oil',/essig|olivenol|rapsol|sonnenblumenol|sesamol|^speiseol/u],
  ['sauce',/sauce|sosse|ketchup|senf|mayonnaise|sojasos|tabasco|sriracha|pesto|bruhe|balsamico/u],
  ['pantry',/passiert|tomatenmark|nudel|spaghetti|pasta|reis|mehl|olivenol|linsen|haferflock|gewurz|pfeffer|paprikapulver|^salz|zucker|essig|bohnen|kichererbs|pesto|couscous|bulgur/u],
  ['snacks',/nuss|nusse|schokolade|chips|riegel|keks|mandel|gummib/u],
  ['produce',/apfel|banane|tomat|zwiebel|knoblauch|salat|gurke|lauchzwiebel|paprika|zucchini|sellerie|kartoff|karotte|mohre|brokkoli|spinat|zitrone|avocado|birne|beere|orange|pilz|champignon|ingwer|chili|zucchini|aubergine|lauch|kohl|radieschen|rucola|feldsalat|mango|ananas|trauben|limette|mais/u],
]

export function groceryCategory(name:string) {
  const key=grocerySearchKey(name)
  return rules.find(([,pattern])=>pattern.test(key))?.[0]??'other'
}
