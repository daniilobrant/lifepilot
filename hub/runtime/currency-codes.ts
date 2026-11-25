/** Landeswährung zum Reiseziel. Die Heimatwährung ist Euro. */
const countries: [RegExp, string][] = [
  [/vereinigte staaten|usa\b|united states|kalifornien|florida|new york|hawaii/iu, 'USD'],
  [/vereinigtes königreich|großbritannien|england|schottland|wales|nordirland|london|united kingdom/iu, 'GBP'],
  [/schweiz|switzerland|zürich|genf|bern\b/iu, 'CHF'],
  [/kanada|canada/iu, 'CAD'], [/australien|australia/iu, 'AUD'], [/neuseeland|new zealand/iu, 'NZD'],
  [/japan/iu, 'JPY'], [/china\b|volksrepublik china/iu, 'CNY'], [/hongkong|hong kong/iu, 'HKD'],
  [/südkorea|korea/iu, 'KRW'], [/thailand/iu, 'THB'], [/vietnam/iu, 'VND'], [/indonesien|bali/iu, 'IDR'],
  [/malaysia/iu, 'MYR'], [/singapur|singapore/iu, 'SGD'], [/philippinen/iu, 'PHP'], [/indien|india/iu, 'INR'],
  [/vereinigte arabische emirate|dubai|abu dhabi/iu, 'AED'], [/katar|qatar|doha/iu, 'QAR'], [/israel/iu, 'ILS'],
  [/türkei|turkey|türkiye|istanbul/iu, 'TRY'], [/marokko|morocco|marrakesch/iu, 'MAD'], [/ägypten|egypt/iu, 'EGP'],
  [/tunesien/iu, 'TND'], [/südafrika|south africa|kapstadt/iu, 'ZAR'], [/kenia|kenya/iu, 'KES'],
  [/mexiko|mexico/iu, 'MXN'], [/brasilien|brazil/iu, 'BRL'], [/argentinien/iu, 'ARS'], [/chile\b/iu, 'CLP'],
  [/kolumbien/iu, 'COP'], [/peru\b/iu, 'PEN'], [/kuba|cuba/iu, 'CUP'], [/dominikanische republik/iu, 'DOP'],
  [/norwegen|norway/iu, 'NOK'], [/schweden|sweden/iu, 'SEK'], [/dänemark|denmark|kopenhagen/iu, 'DKK'],
  [/island\b|iceland/iu, 'ISK'], [/polen|poland/iu, 'PLN'], [/tschechien|czech|prag/iu, 'CZK'],
  [/ungarn|hungary|budapest/iu, 'HUF'], [/rumänien/iu, 'RON'], [/bulgarien/iu, 'BGN'], [/serbien/iu, 'RSD'],
  [/bosnien/iu, 'BAM'], [/albanien/iu, 'ALL'], [/nordmazedonien/iu, 'MKD'], [/georgien/iu, 'GEL'],
]
export const currencyNames: Record<string, string> = {
  EUR:'Euro', USD:'US-Dollar', GBP:'Britisches Pfund', CHF:'Schweizer Franken', CAD:'Kanadischer Dollar', AUD:'Australischer Dollar',
  NZD:'Neuseeland-Dollar', JPY:'Japanischer Yen', CNY:'Chinesischer Yuan', HKD:'Hongkong-Dollar', KRW:'Südkoreanischer Won',
  THB:'Thailändischer Baht', VND:'Vietnamesischer Dong', IDR:'Indonesische Rupiah', MYR:'Malaysischer Ringgit', SGD:'Singapur-Dollar',
  PHP:'Philippinischer Peso', INR:'Indische Rupie', AED:'VAE-Dirham', QAR:'Katar-Riyal', ILS:'Israelischer Schekel', TRY:'Türkische Lira',
  MAD:'Marokkanischer Dirham', EGP:'Ägyptisches Pfund', TND:'Tunesischer Dinar', ZAR:'Südafrikanischer Rand', KES:'Kenia-Schilling',
  MXN:'Mexikanischer Peso', BRL:'Brasilianischer Real', ARS:'Argentinischer Peso', CLP:'Chilenischer Peso', COP:'Kolumbianischer Peso',
  PEN:'Peruanischer Sol', CUP:'Kubanischer Peso', DOP:'Dominikanischer Peso', NOK:'Norwegische Krone', SEK:'Schwedische Krone',
  DKK:'Dänische Krone', ISK:'Isländische Krone', PLN:'Polnischer Złoty', CZK:'Tschechische Krone', HUF:'Ungarischer Forint',
  RON:'Rumänischer Leu', BGN:'Bulgarischer Lew', RSD:'Serbischer Dinar', BAM:'Konvertible Mark', ALL:'Albanischer Lek',
  MKD:'Mazedonischer Denar', GEL:'Georgischer Lari',
}
export function destinationCurrency(destination: string) {
  return countries.find(([pattern]) => pattern.test(destination))?.[1] ?? 'EUR'
}
