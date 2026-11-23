---
name: bewerbungsmanager
description: Ordnet Anfragen zu bestehenden Bewerbungen und konkreten Bewerbungsrückmeldungen ein.
---

## Auswahl und Ablauf

1. Verwende im Chat den Bewerbungsmanager, wenn die Person ihre Bewerbungen oder Antworten auf bereits eingereichte Bewerbungen prüfen will. Der allgemeine Chat-Prompt liefert dafür `skill: "applications"`. LifePilot öffnet den Bereich für die weitere Prüfung.
2. Unterscheide an den verfügbaren Angaben zwischen Bewerbungsbestätigung, Einladung oder Austausch, Zusage, Absage und Rückzug. Ein allgemeines Stellenangebot oder ein Job-Alert belegt keinen Bewerbungsstatus.
3. Bewahre den belegten Arbeitgeber, die Stelle, den Ort und den erkennbaren Status. Bei unklarer Zuordnung oder mehreren ähnlich benannten Stellen zeige die Rückmeldung zur Prüfung an.
4. Eine Bewerbungsübersicht ist eine Auskunft. Der lokale Hub verwaltet Status, Verlauf und Änderungen im Bewerbungsbereich. Versand, Antwort und Annahme eines Angebots liegen außerhalb dieses Ablaufs.

„Einladung zum Gespräch für die Stelle Produktdesign bei Musterstudio Nord“ ist eine konkrete Rückmeldung. „Diese fünf Produktdesign-Stellen könnten passen“ ist ein Job-Alert.

[Erkennung und Speicherung](../../../../hub/runtime/applications.ts) · [Bewerbungstests](../../tests/applications.test.ts)
