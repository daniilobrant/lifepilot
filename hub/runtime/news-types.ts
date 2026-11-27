/* Reine Daten und Typen des News-Bereichs, auch für die Oberfläche (keine Node-Abhängigkeiten). */
export const newsCategories = ['wirtschaft','technik','politik','aktien','regional','sport'] as const
export type NewsCategory = typeof newsCategories[number]
export const newsTitles:Record<NewsCategory,string> = {wirtschaft:'Wirtschaft',technik:'Technik',politik:'Politik',aktien:'Aktien & Depot',regional:'Regional',sport:'Sport'}
export type NewsItem = { headline:string, summary:string, details:string, source:string, url:string, published:string|null }
export type NewsBriefing = { created:string, location:string, overview:string, categories:Record<NewsCategory,NewsItem[]>, missing?:NewsCategory[] }
export type CategoryPreference = { general:boolean, topics:string[], custom:string }
export type NewsPreferences = Record<NewsCategory,CategoryPreference>
export type NewsState = { briefing:NewsBriefing|null, running:boolean, error:string|null, preferences:NewsPreferences }


/** Auswahlkästchen im Fragebogen; „Allgemeiner Überblick“ ist je Kategorie ein eigener Schalter, dazu ein Freitextfeld. */
export const newsOptions:Record<NewsCategory,string[]> = {
  wirtschaft:['Konjunktur & Arbeitsmarkt','Unternehmen & Start-ups','Preise & Inflation','Immobilien & Bauen','Energie & Rohstoffe','Steuern & Verbraucher'],
  technik:['Künstliche Intelligenz','Software & Apps','Smartphones & Geräte','IT-Sicherheit','Datenschutz & Netzpolitik','Mobilität & E-Autos','Raumfahrt & Wissenschaft'],
  politik:['Deutschland','Europäische Union','Weltlage & Konflikte','USA','Klima & Energiepolitik','Bildung & Soziales'],
  aktien:['DAX & Deutschland','USA & Wall Street','Zinsen & Notenbanken','ETFs & Fonds','Rohstoffe & Gold','Kryptowährungen'],
  regional:['Mein Wohnort','Nahe Großstadt','Landkreis','Bundesland','Verkehr & ÖPNV','Veranstaltungen','Bauen & Wohnen'],
  sport:['Fußball','Formel 1','Tennis','Basketball','Handball','Wintersport','Radsport','Football & NBA'],
}
export const defaultPreferences=():NewsPreferences=>Object.fromEntries(newsCategories.map(key=>[key,{general:true,topics:[],custom:''}])) as unknown as NewsPreferences
