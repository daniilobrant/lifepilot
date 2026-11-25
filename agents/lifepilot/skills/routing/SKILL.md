---
name: routing
description: Entscheidungstabelle, welcher Skill zu welchem Anliegen gehört, und Regeln für verknüpfte Anliegen.
---

# Welcher Skill für welches Anliegen

Lies zuerst die ganze Nachricht, `analyse` und `directory`. Ordne jedes Anliegen genau einer Zeile zu. Mehrere Anliegen → je eines in `parts`.

| Signal in der Nachricht | Skill / Ausgabe | Beispiel |
|---|---|---|
| Frist, Abgabe, „muss ich … erledigen“, Präsentation, Klausur | `tasks` (kind task, date = Frist, link = Termin/Projekt) | „Morgen in B2B Marketing präsentieren“ |
| Einmaliger Termin mit Datum und Uhrzeit | `tasks` (kind appointment mit blocks) oder `appointment` bei fehlenden Angaben | „Zahnarzt am 3.12. um 10 Uhr“ |
| „jeden“, „wöchentlich“, Wochentage im Plural | `calendar_series` | „Jeden Dienstag 18 Uhr Volleyball“ |
| Vorhandene Aufgabe ändern (verschieben, umbenennen, erledigen, löschen) | `actions` mit ID aus context | „Verschieb die Steuererklärung auf Freitag“ |
| Projekt, Bachelorarbeit, Meilenstein, Schritt | `projects` | „Füg der Bachelorarbeit den Schritt Literatur hinzu“ |
| Freie Zeit suchen | `smart_planning` | „Wann habe ich diese Woche 2 Stunden?“ |
| Einkaufsliste, Vorrat, „ist leer“, kaufen | `grocery` (stock/list/shop) | „Setz Milch auf die Liste“ |
| Rezept, kochen, Portionen | `grocery` (recipe/ideas) | „Was koche ich heute mit meinem Vorrat?“ |
| Betrag in €, ausgegeben, Abo, Budget | `finance` | „12 € fürs Kino gestern“ |
| Bestellung, Paket, behalten, zurückschicken, Retoure | `orders` (orderIntent decide) oder ohne skillData zum Prüfen | „Die Weekday-Jeans schicke ich zurück“ |
| Beworben, Vorstellungsgespräch, Zusage, Absage | `applications` (applicationIntent) | „Ich habe mich bei Bosch beworben“ |
| Outfit, anziehen, Look, Parfüm | `outfit` | „Was ziehe ich zum Date an?“ |
| Reise, Urlaub, Flug, Unterkunft | `travel` | „Plan 4 Tage Lissabon im März“ |
| Mails prüfen | `inbox_refresh` | „Schau in meine Mails“ |
| Frage zu eigenen Daten | `summary` aus `directory` | „Was steht in der Bachelorarbeit als Nächstes an?“ |

## Verknüpfte Anliegen (Ketten)

- **Abgabe zu einem Termin:** Aufgabe mit Frist = Datum des Termins und `link` = Termin-ID.
- **Vorstellungsgespräch:** `applications` mit interviewDate/interviewTime (LifePilot legt den Termin an). Wünscht die Person ein Outfit „dafür“, zusätzlich ein `outfit`-Teil mit Anlass „Vorstellungsgespräch“ am selben Tag.
- **Reise mit Datum:** `travel`; ein Outfit- oder Packwunsch „dafür“ als eigener Teil mit Ort und Datum der Reise.
- **Rezept an einem Tag:** `grocery` recipe (fehlende Zutaten landen auf der Liste); ein Kochtermin als eigener Aufgaben-Teil mit Zeitblock.
- **Zahlung zu einer Bestellung oder Reise:** `finance` mit dem Namen aus `directory`.

Übernimm Namen, IDs und Daten aus `directory`, nie geraten. Bleiben zwei Deutungen, frage einmal mit beiden Möglichkeiten.
