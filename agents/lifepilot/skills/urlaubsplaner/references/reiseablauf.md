# Reiseablauf in LifePilot

Der Urlaubsplaner übernimmt fachliche Ideen aus dem separaten Triply-Projekt. Die veröffentlichte App verarbeitet die Regeln im eigenen Hub und im Reiseguide. Für diese Planung lädt sie keine Regeln oder Reisen von Triply.

| Situation | Entscheidung | Fundstelle |
| --- | --- | --- |
| Ein neuer Reisewunsch | Ziel, Abreiseort und Zeitraum erfassen. Weitere Aufenthalte, Zeitpunkte und Ortswechsel in der Reisebeschreibung festhalten. Rückfragen auf bis zu zwei fehlende Angaben begrenzen. | [Reiseaufnahme](../../../../../hub/runtime/trip-intake.ts) |
| Erste Vorschau | Bis zu 31 Tage einschließlich Start und Ende. Anreise und Rückfahrt erhalten Puffer. Der Entwurf enthält sechs Vorbereitungsthemen, sieben Packkategorien und acht Tipp-Themen. | [Lokale Planung](../../../../../hub/runtime/trips.ts) · [Kategorien](../../../../../hub/runtime/trip-types.ts) |
| Freie Reisezeiträume | Bestätigte Arbeitstage, genehmigten Urlaub, Schichten, Bundesland und bei Auswahl Kalenderkonflikte berücksichtigen. Ohne Arbeitstage Rückfrage statt behaupteter Verfügbarkeit. | [Zeitfenstersuche](../../../../../hub/runtime/trip-windows.ts) |
| Optionaler Reiseguide | Jeden Reisetag in Reihenfolge ausgeben. Vormittag, Nachmittag und Abend mit je einer Aktivität füllen. Feste Zeiten respektieren. Acht Tipp-Themen liefern. Unsichere Öffnungszeiten, Tarife und Preise weglassen. Der Hub prüft Form, Datumsreihenfolge und Vollständigkeit des Entwurfs. | [Guide-Prompt und Schema](../../../../../hub/runtime/trip-guide.ts) |
| Gespeicherte Reise ändern | Reise und betroffenen Eintrag eindeutig auflösen. Der Hub zeigt die konkrete Änderung vor der Bestätigung und prüft beim Schreiben die Revision. | [Änderungsvorschau](../../../../../hub/runtime/trip-chat-change.ts) |
| Buchung zuordnen | Die bereits vorhandene Buchung dem richtigen Tag oder Aufenthalt zuordnen. LifePilot kann Buchungen dokumentieren. Eine Reservierung oder Zahlung bei Anbietern ist keine Funktion dieses Ablaufs. | [Buchungsdaten](../../../../../hub/runtime/trips.ts) |

„Lissabon vom 6. bis 9. Mai ab Hamburg“ ergibt vier Kalendertage. „Doch bis zum 10.“ verlängert denselben Entwurf bei eindeutigem Datumsbezug auf fünf Tage. „Verschiebe das Museum“ braucht eine Rückfrage, falls mehrere gespeicherte Tagespunkte passen.

Die Referenz beschreibt die Implementierung für Entwickler und Prüfer. Der Chat lädt die zugehörige Skill-Datei. Der Reiseguide verwendet seinen separaten Prompt. [Reisetests](../../../tests/travel.test.ts) · [Tests zur Reiseaufnahme](../../../tests/trip-intake.test.ts)
