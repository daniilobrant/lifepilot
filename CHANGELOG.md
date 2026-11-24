# Versionsverlauf

Die Entwicklungsetappen stammen aus lokalen Versionsnotizen. Für frühe Stände dient die Versionsnummer als zeitliche Einordnung. Der öffentliche Git-Verlauf beginnt mit dem bereinigten Import. [Planung und offene Vorhaben](docs/ROADMAP.md)

## v1.0.2 · 24. November 2026

- Der private Pilot-Chat verwendet die lokale, versionsgebundene Freigabe mit Prüfsummen. Eine separate Release-Signatur und ein systemweit installierter Prüfschlüssel entfallen.

## v1.0.1 · 24. November 2026

- Der Kleiderschrank gruppiert aktive Teile nach Kategorien und zeigt leere Abschnitte an.
- „Teile hinzufügen“ bündelt Foto, Produktlink und Namenssuche. Ausgewählte Suchtreffer können mit Produktbild gespeichert werden.
- Aktionen am Kleidungsstück speichern Packlisten- und Verkaufsstatus. Für dauerhaftes Entfernen fragt LifePilot vorher nach.
- Die Werkzeuge im Pilot-Chat haben getrennte Klickflächen. Spracheingabe ist auch zum Vorbereiten der nächsten Nachricht verfügbar.

## v1.0 · 24. November 2026

- Google-Kalender-Schreibzugriff wird an das bestätigte Google-Konto gebunden. Private Starts prüfen die Release-Signatur und das Dateimanifest.
- Modellgestützte Bildanalyse läuft über Codex CLI mit Freigabe. Das Testprofil sperrt externe Modellaufrufe und den Cloud-Reiseguide.
- Fünf Kernansichten direkt in der README und eine verlinkte Galerie mit allen 13 Aufnahmen.
- Skill-Beschreibungen um Entscheidungskriterien, Beispiele und Zuständigkeiten ergänzt. Der Reisechat lädt seine Anweisungen aus dem Urlaubsplaner-Skill.
- Planungsentscheidungen und Abnahmekriterien in der Roadmap dokumentiert.

## v1.0.0 · 24. November 2026

Erster öffentlicher Quellrelease. Grundlage ist die Runtime 0.25.16. Der Release enthält die Installationsanleitung und die synthetische Galerie. [Release v1.0.0](https://github.com/daniilobrant/lifepilot/releases/tag/v1.0.0)

## Entwicklung vor der öffentlichen Veröffentlichung

| Stand | Einführung |
| --- | --- |
| 0.1–0.3 | Lokaler Hub und SQLite, gemeinsam für Browser und CLI. Aufgaben, Fristen, Erinnerungen, Dialoge und Freigaben. |
| 0.4–0.6 | Wochenplanung, Textquellen und lokal bearbeitbare Aufgaben und Termine. |
| 0.7–0.8 | Getrennte Google-Anbindungen, Bewerbungsmanager und persönlicher Chat. |
| 0.9–0.11 | Kleiderschrank, Bild- und Linkimport, Lookbook und Urlaubsplaner. Überarbeitung der Oberfläche und Kalenderfarben. |
| 0.12–0.13 | Relevanter Posteingang, Gmail-Labels, Mikrofon und Anhänge sowie Outfit-Einstellungen. |
| 0.14–0.16 | Finanzen, Monatsansicht, Abos, eigene Looks, Vorrat, Einkaufsliste, Rezepte und Dialoge mit mehreren Anliegen. |
| 0.17–0.19 | Bestellungen und Retouren, Reisevorbereitung, native Fotoverarbeitung und Diktat. |
| 0.20–0.23 | Parfümsammlung, Styling-Dialog, feste Navigation, Reisevorschau und Produktlink-Import. |
| 0.24 | Gmail-Kategorien, Finanzvorschläge und getrennte Angaben für Studium und Beruf im Profil. |
| 0.25.0 | Eigener Bestellungstracker mit Lieferstatus, Entscheidungen je Artikel, Retourenfristen und separater Abrechnung. |
| 0.25.1 | PayPal-Gegenpartei und Verwendungszweck aus Belegen übernehmen. |
| 0.25.2 | Lange Reiseanfragen abschnittsweise lesen und Eckpunkte über Rückfragen hinweg bewahren. |
| 0.25.3 | Gemeinsamer Seitenkopf und konsistente Steuerelemente für die Hauptansichten. |
| 0.25.4 | Veranstaltungstickets können getrennte Termin- und Ausgabenvorschläge erzeugen. Passende Zahlungsbelege werden abgeglichen. |
| 0.25.5 | Mail-Tiefenprüfung erweitert. Bestellsummen und wiederkehrende Zahlungen als Vorschläge erfassen. |
| 0.25.6 | Weitergeleitete Hochschulnachrichten einordnen und eindeutig zugeordnete Vorlesungsausfälle zur Bestätigung vorlegen. |
| 0.25.7 | Wöchentliche Serien an mehreren Wochentagen mit regionalen Feiertagen und fortlaufenden Erinnerungen. |
| 0.25.8 | Projektplaner mit Unterpunkten, Checkpoints und Fristen ergänzen. |
| 0.25.9 | Terminkollisionen beim Namen nennen und separat bestätigen lassen. Tagesansicht zeigt parallele Termine. |
| 0.25.10 | Projektphasen, Notizen und Fortschritt pflegen. Startseite zeigt das Briefing automatisch. |
| 0.25.11 | Aktuelle Nachricht und frühere Vorschläge getrennt auswerten. Datumsänderungen im Chat erhalten Vorrang. |
| 0.25.12 | Eigenes Aufgaben- und Fristenboard. Projekteditor und Archiv mit Wiederherstellung. |
| 0.25.13 | Monatsfilter, Kassenbonbuchung und konsistentere Styling-, Profil- und Startansichten. |
| 0.25.14 | Einkauf nach Kategorien, Vorratsaktionen und Rezeptübersicht. |
| 0.25.15 | Reisesuche nach Stadt, Land oder Insel, Kalenderfelder und Auswahl für Interessen und Ausschlüsse. |
| 0.25.16 | Produktbilder, lokale Vorratserkennung und Verbesserungen an Formularen und Übersichten. |
