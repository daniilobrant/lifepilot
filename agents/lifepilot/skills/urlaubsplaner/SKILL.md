---
name: urlaubsplaner
description: Erfasst Reisewünsche und Korrekturen und bereitet bestätigbare lokale Reisevorschläge vor.
---

## Reiseaufträge im Chat

- `travel` für Reisewunsch, Ferien und Brückentage, Reiseplan öffnen, gezielte Änderungen oder Buchung zuordnen. Setze `skillData` auf `{intent,destination,departure,start,end,people,maxLeave,detail,transport,luggage,brief,stay,stayAddress,exclusions,tempo}` mit intent `draft|windows|open|change|booking`. Unbekannte Angaben sind null. Bei einer festen Reise mit fehlenden Angaben frage höchstens nach zwei davon zugleich. Reisezeitpunkte sind ISO-Daten, relativ zum Bezugstag. Bei einer Verschiebung verwende das neue Datum als `start` und den ausdrücklich genannten Titel möglichst wortgetreu als `detail`. Sag in höchstens einem kurzen Satz, was du verstanden hast. Behaupte keine Änderung. Die Ja/Nein-Frage zeigt der Hub mit dem gespeicherten Tagespunkt. Adresse, Buchung oder eine Änderung des gesamten Reisezeitraums niemals als Verschiebung eines Tagespunkts behandeln. Bei Reisezeitfenstern sind start/end der Suchzeitraum. Unterstelle keine Arbeitstage oder Buchungen. Setze transport nur, wenn der Nutzer sich ausdrücklich für ein Verkehrsmittel entschieden hat. Bei einer offenen Frage nach der besten Anreise verwende transport und luggage als null. Dann empfiehlt der Hub das Verkehrsmittel und Flughäfen, ohne vorab nach Gepäck zu fragen. Erst bei ausdrücklich gewähltem Flug ohne Gepäck frage „Nur Rucksack, Handgepäck oder Koffer?“. Übernimm in detail bei neuen Reisen nur kurze Interessen (höchstens 220 Zeichen), sonst die gemeinte Aktivität. Für eine neue Reise halte in brief die zusätzlichen genannten Wünsche und Eckpunkte fest, insbesondere mehrere Unterkünfte, Ortswechsel, feste Zeitangaben und bereits genannte Buchungen. brief darf bis zu 6000 Zeichen enthalten. Fülle Unterkunft, Adresse, Ausschlüsse und Tempo separat, wenn sie klar sind. Ergänze Rückfragen anhand der bisherigen Reise; stelle sie nur für fehlende Pflichtangaben oder echte Widersprüche. Gib bei langen Nachrichten correctedInput als null aus. Der Hub kann eine lokale Reisevorschau erzeugen. Reiseaufträge erzeugen keine Budgetberechnung. Überschreibe keine bestehende Reise, erfinde keine Preise/Links und lege keine Aufgabe an. Ein separater Auftrag „Erinnere mich ans Einchecken“ bleibt beim Alltagsskill.

### Entscheidung bei kurzer Folgeantwort

„Doch erst ab dem 12.“ ersetzt den Start im selben Entwurf, sofern Monat und Jahr eindeutig feststehen. Übernimm weiter gültige Eckpunkte. Bei einer mehrdeutigen Änderung frage nach dem betroffenen Datum oder Tagespunkt. Ein Vorschlag enthält keine Aussage über verfügbare Tickets oder ausgeführte Buchungen.

### Zuständigkeit der Runtime

Der Hub erstellt die lokale Vorschau mit leichter An- und Abreise, Vorbereitung und Packliste. Er berechnet freie Reisezeiträume aus den bestätigten Arbeits- und Urlaubsdaten. Speichern und Änderungen passieren über die LifePilot-Freigaben. Der optionale Reiseguide hat eigene Modellanweisungen.

### Einheitlicher Reiseguide

Jede Reise hat denselben Aufbau: Überblick, für jeden Tag ein Schwerpunkt mit Vormittag, Nachmittag und Abend, danach immer die acht Tipp-Themen Sicherheit, Gesundheit, Kultur, Lokales Essen, Apps & Transport, Sehenswürdigkeiten, Häufige Betrugsmaschen und Nützliche Sätze. Der Hub erzeugt Tipps und Tagesabschnitte von höchstens sechs Tagen parallel und wiederholt einen unvollständigen Teil einmal. Das Ziel kann jeder Ort der Erde sein: bei Regionen oder Ländern wird eine Basis gewählt, bei kleinen Orten die Umgebung genutzt, Jahreszeit und Klima der Reisedaten fließen ein, die Sätze stehen in der Alltagssprache des Ziels.

[Fachregeln, Codepfade und Beispiele](references/reiseablauf.md)
