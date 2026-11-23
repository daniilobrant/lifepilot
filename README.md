# LifePilot

LifePilot ist eine lokale macOS-App für persönliche Organisation. Startseite, Kalender, Aufgaben und Projekte greifen auf denselben SQLite-Datenbestand zu. Pilot hilft bei Rückfragen und bereitet Änderungsvorschläge vor. Der erste öffentliche Release **v1.0.0** enthält den Quellstand der Runtime **0.25.16**.

![LifePilot-Startseite und Pilot-Chat im synthetischen Testprofil](docs/screenshots/01-start.png)

[Installation](#installation) · [Funktionen](#funktionen) · [Screenshot-Galerie](docs/SCREENSHOTS.md) · [Versionsverlauf](CHANGELOG.md) · [Sicherheit und Daten](docs/SICHERHEIT.md)

## Installation

Vorausgesetzt sind macOS, Node.js 24 ab 24.13, npm, Git und die Xcode Command Line Tools. Dieser Stand wurde auf einem Mac mit Apple Silicon geprüft. Der Download enthält Quellcode, aus dem auch die nativen Helfer gebaut werden.

    git clone --branch v1.0.0 https://github.com/daniilobrant/lifepilot.git
    cd lifepilot
    xcode-select -p
    node --version
    npm ci
    npm run build
    npm test

Fehlen die Xcode Command Line Tools, installiere sie mit **xcode-select --install**. Node muss im PATH liegen.

### Einstieg im Testprofil

    ./bin/lifepilot --acceptance start
    ./bin/lifepilot --acceptance open

Öffne **Projekte**, lege ein fiktives Projekt mit Unterpunkten an und setze für einen Punkt eine Frist. Die Frist erscheint in **Aufgaben & Fristen**. Probiere danach eine erfundene Frage als Pilot-Entwurf aus. Die Galerie verwendet keinen Modellaufruf. Das Testprofil trennt die Daten lokal, kann aber bei freigegebenen Modellaufrufen oder einem Reiseguide externe Dienste kontaktieren. Dafür ausschließlich fiktive Daten verwenden.

    ./bin/lifepilot --acceptance stop

Für das Hauptprofil verwende dieselben Befehle ohne **--acceptance**. Die App öffnet sich lokal auf Port 45137, das Testprofil auf Port 45138. Der Checkout enthält keine Berechtigung für den persönlichen Chat und keine Kontodaten. Google und Codex sind optionale Integrationen. [Einrichtung, Datenspeicher und Grenzen](docs/SICHERHEIT.md)

## Funktionen

| Bereich | Was LifePilot unterstützt |
| --- | --- |
| Start und Pilot | Wochenübersicht, Aufgaben, Fristen, nächste Termine, wichtige Nachrichten, Rückfragen und Vorschläge zur Bestätigung |
| Kalender | Woche und Monat, Zeitfenster, Serientermine, Feiertage und gesonderte Bestätigung von Kollisionen |
| Aufgaben & Fristen | Aufgaben und Abgaben in Uni, Privat und Arbeit, mit Priorität, Datum und Projektbezug |
| Projekte | Projektkarten, Phasen, Unterpunkte, Checkpoints, Fortschritt, Archiv und Wiederherstellung |
| Posteingang | Relevante Nachrichten, gezielte Mail-Tiefenprüfung, Gmail-Kategorien und Vorschläge für Folgeaktionen |
| Bestellungstracker | Lieferungen, Retouren, Behalten und Rückerstattungen je Artikel. Behaltene Kleidung kann in den Kleiderschrank übernommen werden |
| Finanzen & Abos | Monatsübersicht, Einnahmen und Ausgaben, Abo-Vorschläge, PayPal-Absender und -Empfänger sowie Abgleich doppelter Buchungsvorschläge |
| Urlaubsplaner | Vorschau für Städte und Inseln, Reisezeiträume, Buchungen, Vorbereitung und Packlisten |
| Outfit-Assistent | Styling, Kleiderschrank, Produktlink- und Fotoimport, Looks, Urlaubsgarderobe, Verkauf und Parfüm |
| Vorrat & Einkauf | Vorratsverwaltung, kategorisierte Einkaufsliste, Belegscan und Rezeptideen |
| Bewerbungen | Bewerbungsstatus, Verlauf, Gespräche und passende Vorschläge aus E-Mails |

[Alle Skills und ihre Verknüpfungen](docs/SKILLS.md)

## Technik

Das React-Frontend und der CLI-Adapter greifen auf denselben Node.js-Hub zu. SQLite speichert Daten je Profil. Die Laufzeit prüft Agentenantworten gegen ein Schema und übernimmt bestätigte Änderungen. Mit **./bin/lifepilot help** findest du die Terminalaktionen. [Hub](hub) · [Agenten und Tests](agents)

Die ursprünglichen Entwicklungsetappen sind im [Versionsverlauf](CHANGELOG.md) beschrieben. Der öffentliche Git-Verlauf beginnt mit einem bereinigten Import. Dieser Release erteilt keine zusätzliche Open-Source-Lizenz.
