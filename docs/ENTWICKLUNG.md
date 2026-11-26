# Entwicklungsverlauf von LifePilot

Dieses Dokument beschreibt, wie LifePilot von der ersten Idee bis Version 1.0.62 gemeinsam mit KI-Assistenten entstanden ist. Es ordnet die Entwicklung in Meilensteine, nennt zu jedem Anlass, Vorgehen und Ergebnis und erklärt die Arbeitsweise. Die einzelnen Änderungen je Version stehen im [Changelog](../CHANGELOG.md), die kompakte Zeitleiste in der [Versionsübersicht der README](../README.md#versionsübersicht). Kleine Änderungen sind hier zu Meilensteinen zusammengefasst.

Quellen sind zwei Arbeitsprotokolle: ein Chat mit ChatGPT und Codex (Version 0.1 bis 1.0.57) und eine Sitzung mit Claude Code (Version 1.0.11 bis 1.0.59). Die frühen Versionen 0.x sind im Protokoll nicht datiert und nach Reihenfolge und Versionsbereich eingeordnet.

## 1. Ausgangslage und Ziel

Der Auftrag lautete, einen persönlichen Alltagsassistenten als lokalen Hub nach dem Trinity-Leitfaden des Professors zu bauen. Vorgegeben waren:

- ein lokaler Dienst in Node.js und TypeScript mit zentraler SQLite-Datenbank und Migrationen,
- zwei gleichberechtigte Eingänge, eine Kommandozeile und eine lokale Weboberfläche, die dieselbe Runtime, dieselben Kennungen und denselben Speicher nutzen,
- ein erster Agent mit Manifest, Rolle, Workflow, Ausgabeschema, Skills, Tools und Tests,
- Anbindung des vorhandenen Codex-Logins ohne zusätzlichen API-Schlüssel,
- Freigaben des Nutzers vor jeder Änderung (Human in the Loop) und serverseitig erzwungene Berechtigungen,
- keine Veröffentlichung, keine Google-Verbindung und keine externen Dienste ohne gesonderte Freigabe.

Aus diesem Kern entwickelte sich ein Assistent mit Kalender, Aufgaben, Postfach, Finanzen, Bestellungen, Kleiderschrank, Reisen, Vorrat und Projekten, der über einen Chat bedient werden kann.

## 2. Werkzeuge und Rollen

| Werkzeug | Aufgabe im Projekt |
|---|---|
| Entwickler | Anforderungen, Freigaben, Test im eigenen Profil mit echten Daten, Entscheidungen zu Sicherheit und Datenschutz |
| ChatGPT und Codex | Aufbau des Hubs nach dem Trinity-Leitfaden, erste Skills, Google-Anbindung, Oberfläche, erster öffentlicher Release, erste Sicherheitsprüfung, später Mail- und Wetterfunktionen (1.0.53 bis 1.0.57) |
| Antigravity und Gemini | Analyse von Fehlern und Oberfläche, Erstellung von Markdown-Anleitungen (Finanz-Skill, Projektseite, Kleiderschrank-Lebenszyklus, Sicherheitscheckliste), zeitweise direkte Arbeit am Code |
| Claude Code | Weiterbau ab Version 1.0.11: Mail- und Zahlungserkennung, Bestellungen, Reiseguide, Vorrat, Outfit, Verbesserung des Agenten, Claude-Anbindung, Sicherheitsaudit, Bereinigung des Repositories |

Codex und Claude Code arbeiteten abwechselnd und zeitweise gleichzeitig im selben Repository. Gemeinsame Bezugspunkte waren Changelog, Skill-Dateien und Tests. Bei gleichzeitiger Arbeit wurden Versionsnummern und Branches abgestimmt, ungespeicherte Änderungen der jeweils anderen Sitzung blieben unberührt.

## 3. Arbeitsweise

### 3.1 Ablauf einer Version

1. Der Entwickler beschreibt ein Problem oder einen Wunsch, häufig per Spracheingabe und mit einem Bildschirmfoto des Fehlers.
2. Der Assistent bestätigt das Verständnis und legt bei größeren Vorhaben einen Plan vor.
3. Er setzt um, führt Typprüfung, Tests und statische Analyse aus und installiert die Version im privaten Profil.
4. Der Entwickler prüft die Version im Browser mit eigenen Daten.
5. Die Rückmeldung bildet den Auftrag der nächsten Version.

Ab dem 24. November 2026 wird jede Änderung zugleich im privaten Profil installiert und nach GitHub übertragen. Die lokale Version ist maßgeblich, GitHub dient der Nachvollziehbarkeit durch den Professor.

### 3.2 Muster der Eingaben

| Muster | Beschreibung | Beispiel für die Wirkung |
|---|---|---|
| Fehler mit Bildschirmfoto | Ein Satz und ein Bild reichen als Auftrag | Überlappende Felder im Terminformular führten zum neu geordneten Editor |
| Fehler mit eigener Mail oder Bestellung | Der Entwickler nennt ein echtes Beispiel, der Assistent liest es und leitet die Regel ab | Eine nicht erkannte Apple-Rechnung führte zur Erkennung aller Belege dieser Art |
| Anforderungsliste | Mehrere Punkte in einer Nachricht, die nacheinander abgearbeitet werden | Eine Liste mit Look-Kacheln, Verkaufsablauf, Vorratseinheiten und Antwortknöpfen wurde als eine Version umgesetzt |
| Markdown-Plan | Große Vorhaben in nummerierten Schritten, oft mit Gemini und Antigravity erarbeitet | Finanz-Skill, Projektseite, Kleiderschrank-Lebenszyklus (Schritt 5) |
| Frage vor Umsetzung | Der Assistent soll zuerst erklären, was möglich ist oder was fehlt | Analyse des Agenten vor seinem Ausbau, Machbarkeit der Google-Anbindung vor ihrem Bau |
| Freigabe | Ausdrückliche Bestätigung für Version, Pull Request, Datenfreigabe oder Löschung | Freigabe einer Version, Zustimmung zum Zusammenführen, Genehmigung zum Umschreiben des Verlaufs |
| Sparsamkeit | Hinweis auf begrenztes Modellkontingent | Prüfungen ohne Modellaufruf, einmalige Modellprüfung unklarer Mails |

### 3.3 Leitlinien, die der Entwickler vorgab

- Zuerst die Funktion, dann die Oberfläche: Die Oberfläche wurde mehrfach grundlegend überarbeitet, nachdem die Funktionen standen.
- Der Agent erkennt selbst, was verlangt wird, auch bei Tippfehlern, Diktatfehlern und langen Nachrichten, und fragt nur bei echter Unklarheit nach.
- Der Nutzer bestätigt, der Rest läuft: einmalige Freigaben statt ständiger Rückfragen, Sammelbestätigungen für offene Vorschläge.
- Keine Nutzerdaten im Repository. Profil, Tokens und Datenbank bleiben lokal.
- Sicherheitsgrenzen ändert der Assistent nur nach Rückfrage. Neue Benachrichtigungen oder zusätzliche Prüfdienste werden vorher abgestimmt.
- Korrekturen dürfen vorhandene Funktionen nicht einschränken.

## 4. Meilensteine

### Meilenstein 1: Lokaler Hub und erster Agent (0.1 bis 0.3)

**Anlass.** Der Trinity-Bauplan und das Oberflächenkonzept „Nocturne V7“ waren freigegeben, der Entwickler wollte einen lauffähigen Kern mit echter Modellausführung.

**Umsetzung.** Die Bestandsaufnahme des Rechners (Betriebssystem, Git, Node, Codex-Anmeldung) ging dem Bau voraus. Danach entstanden der Hintergrunddienst, die SQLite-Datenbank mit Migrationen, die Auftragsverwaltung mit Freigaben, die Kommandozeile und die Weboberfläche. Der erste Skill verarbeitet unstrukturierten Alltagstext zu prüfbaren Aufgaben. Der Entwickler forderte, der Agent solle Rechtschreibfehler verbessern und Kontext verstehen. Daraus folgten Rückfragen und Folgeaufträge im selben Vorgang (0.3.0), Dialogtests und ein Rückweg bei fehlgeschlagenen Updates (0.3.1) sowie eine Ansicht, die vor jeder Analyse zeigt, welche Daten an das Modell gehen (0.3.2).

**Ergebnis.** Ein Hub mit gemeinsamem Speicher für Weboberfläche und Kommandozeile, Sicherung und Wiederherstellung, serverseitigen Sperren und erfolgreichen echten Codex-Läufen. Offen blieben zunächst die Trinity-Abnahme und die Freigabe für private Aufträge.

### Meilenstein 2: Bedienbarkeit und echte Daten (0.4 bis 0.6)

**Anlass.** Der Entwickler konnte in der ersten Oberfläche kaum etwas ausführen: Text ließ sich nicht einfügen, Ergebnisse wurden nicht gespeichert.

**Umsetzung.** Texteingabe und freie Aufträge, Wochenplanung, bearbeitbare Aufgaben und Termine, Textquellen. Eine Prüfung gegen die Trinity-Anforderungen deckte einen Fehler auf, der behoben wurde (0.5.2). Mit 0.6.0 werden Aufgaben und Termine dauerhaft gespeichert.

**Ergebnis.** Aus dem Prüfstand wurde eine nutzbare Aufgaben- und Terminverwaltung. Die Rückfrage, warum der KI-Chat noch nicht verfügbar sei, richtete die weitere Planung auf den Agenten als Kern des Projekts aus.

### Meilenstein 3: Google-Anbindung und Postfach (0.7 bis 0.13)

**Anlass.** Der Agent sollte Kalender und Mails kennen, Termine eintragen und Mails sortieren, ohne dass der Entwickler Einrichtungsdateien bearbeiten muss.

**Umsetzung.** Anbindung von Google Kalender und Gmail mit getrennten Anmeldungen. Die Einrichtung wurde so vereinfacht, dass nur noch bestätigt werden muss. Getestet wurde zunächst mit einem separaten Testkonto, danach wurde das Projekt vollständig auf das normale Konto umgestellt. Weitere Bausteine: Gmail-Labels für sieben Kategorien, ein Aktualisieren-Knopf im Posteingang, die Auswahl relevanter Nachrichten, der Bewerbungsmanager und der persönliche Pilot-Chat, der ohne wiederholte Freigaben auf alle Skills zugreift und den Auftrag selbst erkennt.

**Ergebnis.** Ein Postfach, das Mails kategorisiert, wichtige Nachrichten hervorhebt und Vorschläge für Termine und Aufgaben macht. Jede Übernahme bleibt eine Entscheidung des Nutzers.

### Meilenstein 4: Oberfläche und Navigation (0.9 bis 0.13, 0.20 bis 0.23, 0.25.3)

**Anlass.** Die Oberfläche wirkte überladen und uneinheitlich. Der Entwickler erarbeitete ein neues Design und ließ es auf alle Bereiche übertragen.

**Umsetzung.** Helles Design mit einheitlichen Kacheln, deutlich unterscheidbaren Kalenderfarben für Arbeit, Uni und Freizeit, feste Plätze für Navigation und Pilot-Chat und ein gemeinsamer Seitenkopf für alle Hauptansichten (0.25.3). Die Startseite zeigt die aktuelle Woche mit Aufgaben, Fristen, laufenden Vorgängen und dem nächsten Termin.

**Ergebnis.** Eine durchgängige Oberfläche. Spätere Versionen verfeinerten sie bereichsweise, zum Beispiel Formulare, Terminbearbeitung und Mailvorschläge.

### Meilenstein 5: Kleiderschrank, Outfit und Düfte (0.9 bis 0.13, 0.20, 1.0.1 bis 1.0.10)

**Anlass.** Ein eigener Skill für den Kleiderschrank, der Kleidung und Düfte kennt und Outfits nach Anlass, Wetter und Passform vorschlägt.

**Umsetzung.** Bild- und Linkimport für Kleidungsstücke, Lookbook, Einstellungen zu Passform und Stil, Parfümsammlung mit Notenprofil und Anwendungshinweisen, Wetter am Standort, Schichtung (T-Shirt unter dem Pullover) und Jackenwahl nach Temperatur. In der Version 1.0 kamen Verkaufsablauf mit Inseratstext, Urlaubsgarderobe, aussortierte Teile mit eigenen Regeln und einheitliche Kacheln hinzu.

**Ergebnis.** Ein Bereich mit eigenem Menü, der aus dem Bestand Looks zusammenstellt und Käufe aus Bestellungen übernimmt.

### Meilenstein 6: Reisen (0.9 bis 0.11, 0.17 bis 0.19, 0.23, 0.25.2, 0.25.15)

**Anlass.** Reisen sollten per Formular oder Chat geplant werden, mit Tagesplan, Karten-Verknüpfungen und Packliste, ohne Budgetrechner und eigene Karte.

**Umsetzung.** Urlaubsplaner mit Reisevorschau, die erst nach Annahme gestartet wird, Bereich „Meine Reisen“ nur für anstehende und laufende Reisen, freie Reisezeiträume, Suche nach Stadt, Land oder Insel, Packliste und Urlaubsgarderobe. Eine Testreise mit vielen Angaben scheiterte an der Länge der Anfrage und führte zum abschnittsweisen Lesen mit Erhalt der Eckdaten (0.25.2).

**Ergebnis.** Reisen entstehen aus kurzen oder sehr ausführlichen Eingaben, Änderungen laufen über Freigaben.

### Meilenstein 7: Finanzen (0.14, 0.16, 0.24, 0.25.1)

**Anlass.** Ein Skill für Einnahmen, Fixkosten und variable Ausgaben, ausgehend von einem mit Gemini erarbeiteten Entwurf.

**Umsetzung.** Monatsansicht, Abos, Budgetangaben, Vorschläge aus Gmail und PayPal-Belegen mit Gegenpartei und Verwendungszweck. Die Freigabe von Version 0.14 erfolgte ausdrücklich durch den Entwickler.

**Ergebnis.** Finanzen & Abos mit Vorschlägen, die erst nach Bestätigung gebucht werden.

### Meilenstein 8: Vorrat, Einkauf und Rezepte (0.15, 0.16, 0.25.14, 1.0.7 bis 1.0.9)

**Anlass.** Die Einkaufsliste sollte der App „Bring“ ähneln, dazu ein Vorrat und ein Kochassistent, der Rezepte aus dem Vorrat vorschlägt.

**Umsetzung.** Einkaufsliste und Vorrat nach Kategorien, Schnellerfassung, Kassenbon-Erkennung, Rezepte mit wählbaren Portionen und Mengen, Abgleich der Zutaten mit dem Vorrat, mehrere Rezeptvorschläge mit Beilagen und Ausschlüssen sowie Online-Rezepte mit Quellen.

**Ergebnis.** Aus einer Anfrage („Was kann ich kochen?“) entstehen mehrere Vorschläge mit Mengenabgleich und Einkaufsentscheidung.

### Meilenstein 9: Bestellungen (0.17, 0.25.0)

**Anlass.** Ein eigener Bestellungstracker: welche Bestellungen ankommen, welche angekommen sind, welche zurückgehen.

**Umsetzung.** Erkennung aus Mails, Lieferstatus, Entscheidung je Artikel (behalten oder zurücksenden), Retourenfristen mit Aufgabe und getrennte Buchung von Ausgabe und Erstattung.

**Ergebnis.** Ein Bereich, der Bestellmails, Versand, Zustellung und Retoure zusammenführt. Behaltene Kleidung gelangt in den Kleiderschrank.

### Meilenstein 10: Serien, Projekte und Fristen (0.25.7 bis 0.25.12)

**Anlass.** Wiederkehrende Termine (zum Beispiel Arbeit montags und freitags von 8 bis 16 Uhr) sollten per Chat angelegt werden können, dazu ein Projektplaner und ein eigenes Fristenboard.

**Umsetzung.** Wöchentliche Serien mit mehreren Wochentagen und regionalen Feiertagen, Kollisionsprüfung mit Namensnennung und zweiter Bestätigung, Projekte mit Unterpunkten, Phasen, Fortschritt und Archiv, ein getrenntes Board für Aufgaben und Fristen. Die Anleitungen dafür entstanden als Markdown-Dateien mit Gemini und Antigravity und wurden Schritt für Schritt abgearbeitet.

**Ergebnis.** Vorlesungen, Arbeitszeiten und Projektfristen lassen sich per Satz eintragen und bleiben bearbeitbar.

### Meilenstein 11: Mailverständnis (0.25.4 bis 0.25.6, 1.0.14 bis 1.0.16, 1.0.31)

**Anlass.** Mehrere Beispiele aus dem echten Postfach wurden nicht erkannt: eine Comedy-Show als Termin und Ausgabe ohne Dopplung mit PayPal, Amazon-Bestellungen, wiederkehrende iCloud-Abbuchungen, weitergeleitete Uni-Mails und Gutschriften.

**Umsetzung.** Eine Tiefenprüfung, die Mails mit Belegcharakter vollständig liest. Tickets erzeugen getrennte Vorschläge für Termin und Ausgabe, Zahlungsbestätigungen von Händlern, Erstattungen und Abos werden mit PayPal abgeglichen, weitergeleitete Hochschulmails ordnen sich Vorlesungen zu und bieten Ausfälle zur Bestätigung an. Ab 1.0.31 werden auch App-Store-Abos und Belege von Fahrdiensten, Unterkünften und Läden erkannt.

**Ergebnis.** Aus Mails entstehen belegbare Vorschläge, die der Nutzer übernimmt oder ablehnt. Die Regeln sind in den Skills beschrieben.

### Meilenstein 12: Sicherheitsprüfung und Veröffentlichung (1.0.0 bis 1.0.2)

**Anlass.** Vor der Veröffentlichung sollte die gesamte App auf Hintertüren geprüft werden. Der Professor sollte den Stand und den Verlauf einsehen können.

**Umsetzung.** Eine Prüfung nach einer Checkliste, deren Befunde in Pull Requests behoben und nach bestandenen Prüfungen zusammengeführt wurden. Die Google-Anbindung wurde an das bestätigte Konto gebunden, private Releases werden gegen Prüfsummen geprüft. Das öffentliche Repository entstand mit Installationsanleitung, README, Screenshot-Galerie, Skill-Beschreibungen und Änderungsverlauf. Die Version wurde als 1.0 veröffentlicht.

**Ergebnis.** Ein öffentlicher Quellstand mit dokumentierten Sicherheitsgrenzen und nachvollziehbarem Verlauf.

### Meilenstein 13: Ausbau mit Claude Code (1.0.11 bis 1.0.35, 25. November 2026)

**Anlass.** Der Entwickler wechselte für den Weiterbau zu Claude Code und gab die Projektinformationen weiter. Die Aufträge kamen als kurze Wünsche und Listen, meist mit Bildschirmfoto.

**Umsetzung (zusammengefasst).**

- *Modellanbindung:* Behebung eines Antwortformat-Fehlers, bei dem der Modellanbieter für jedes Feld einen Schlüssel verlangte (1.0.13).
- *Zahlungen:* Händlererstattungen, Händlerzahlungen ohne PayPal, Freunde und Familie als eigene Kategorie, Apple-Abos und Belege von Fahrdiensten und Unterkünften.
- *Outfit:* Farbpalette mit Neutraltönen, Basisschicht, Anlass je Teil, kurze Überschriften, Duftbeschreibungen, Looks als Kacheln mit allen Teilen, getrennte Bereiche für vorgeschlagene und eigene Looks.
- *Produktlinks:* Farbbilder bei Uniqlo, Bildsuche bei gesperrten Shops, eigenes Foto anhängen.
- *Bestellungen:* Amazon-Erkennung mit allen Artikeln, Zusammenführen doppelter Bestellungen, Ausschluss von Technik, Unterwäsche und Socken aus dem Kleiderschrank, strengere Bildzuordnung.
- *Reisen:* Paralleler Reiseguide in kleinen Abschnitten mit Wiederholung bei Teilfehlern, Währungsrechner, Notrufnummer und Gesundheitshinweise, neue Packliste.
- *Vorrat:* Fünf Einheiten (Stück, g, kg, ml, l) mit Umrechnung von Löffeln, Dosen und Bunden, kompaktes Formular, mehr Kategorien und Artikel, Antwortknöpfe bei Rückfragen im Chat.
- *Bedienung:* Projekte nach Frist sortiert und bearbeitbar, aufgeräumter Termineditor, Verkaufsablauf mit Preisermittlung, Bestellungen unter „Wartet auf dein OK“, Entfernen gespeicherter Rezepte.
- *Qualität:* Statische Analyse lokal installiert, damit Prüfungen vor dem Hochladen bestehen. Vor jeder Änderung an vorhandenen Daten wurde eine Sicherung angelegt.

**Ergebnis.** Rund 25 Versionen an einem Tag, jede getestet, installiert und auf GitHub dokumentiert.

### Meilenstein 14: Verbesserung des Agenten (1.0.34 bis 1.0.42, 25. und 26. November 2026)

**Anlass.** Der Agent sollte für die Bewertung durch den Professor möglichst viele Anfragen verstehen, auch kombinierte Anfragen über mehrere Skills, und mit Spracheingabe zurechtkommen.

**Umsetzung.** Zuerst eine Analyse des Ist-Zustands aus dem Code: Der Agent kannte nur wenige Aufgaben, kein Wissen über Projekte, Finanzen oder Bestellungen, mehrere Skills ohne Werkzeug und keine Verbindungen zwischen Skills. Daraus entstanden vier Schritte:

1. *Verzeichnis* aller Bereiche mit Namen, Daten und Kennungen sowie fehlertoleranter Suche für Diktat- und Tippfehler. Neue Aufgaben können einem Termin oder Projekt zugeordnet werden.
2. *Zerlegung* langer Nachrichten nach Signalwörtern mit Themen und aufgelösten Datumsangaben („morgen“, „am Freitag“).
3. *Entscheidungstabelle* der Skills mit Regeln für verknüpfte Anliegen, drei weitere Skills im Chat und neue Handlungen (Bestellung entscheiden, Bewerbung anlegen).
4. *Testsatz* mit 48 Beispielsätzen, der gegen das gewählte Modell läuft.

Aufgrund des knappen Modellkontingents wurde die Anbindung zusätzlich auf einen umschaltbaren Anbieter erweitert. Claude Code läuft ohne Werkzeuge im leeren Arbeitsordner, die Antwortprüfung bleibt für beide Anbieter dieselbe. Ein erster Aufruf scheiterte an der Anmeldung im Schlüsselbund und am internen Antwortwerkzeug der Kommandozeile, beides wurde behoben.

**Ergebnis.** 47 von 48 Beispielsätzen bestanden, der Fehlfall wurde behoben. Die README beschreibt die Anbindung beider Anbieter und enthält einen Auftrag, mit dem eine KI die Einrichtung selbst übernehmen kann.

### Meilenstein 15: Sicherheit und Bereinigung (1.0.43 bis 1.0.59, 26. November 2026)

**Anlass.** Der Entwickler wollte das Gesamtprojekt auf Hintertüren und Datenlecks prüfen lassen, ohne Funktionen einzuschränken, und ein Repository ohne interne Dokumente und private Daten.

**Umsetzung.**

- *Prüfung 1.0.43:* Keine Hintertüren. Behoben wurden zu offene Dateirechte im Profil und ein Abruf, der Weiterleitungen folgte.
- *Aufräumen:* Entfernen der GitHub-Prüfung (wegen unerwünschter Benachrichtigungen), interner Berichte, der Roadmap und von Prüfskripten.
- *Audit 1.0.59 nach der Vorgabe des Professors:* npm audit, Semgrep, Gitleaks, Python-Werkzeuge (nicht anwendbar) und Mustersuche nach privaten Daten, dazu ein lokaler Prüfbefehl und der Sicherheitsbericht. Gefundene private Werte in Testdaten wurden ersetzt. Der Git-Verlauf wurde bereinigt, sodass nur noch Noreply-Adressen als Autor erscheinen, nach vorheriger Sicherung und Freigabe.

**Ergebnis.** Ein [Sicherheitsbericht](../SECURITY_REPORT.md) mit Prüfumfang, Funden und offenen Risiken sowie ein Prüfbefehl, der sich jederzeit lokal wiederholen lässt.

### Meilenstein 16: Feinschliff im Alltag (1.0.44 bis 1.0.58, 26. November 2026)

**Anlass.** Fehler und Wünsche aus dem täglichen Gebrauch.

**Umsetzung (zusammengefasst).**

- *Kalender:* Eine Aufgabe mit Uhrzeit erscheint einmal statt doppelt. Abgaben werden mit der passenden Vorlesung verknüpft.
- *Rezepte und Vorrat:* Gleichwertige Zutaten (Nudelsorten, Öle, Hackfleisch) gelten als vorhanden, zehn weitere Rezepte, wechselnde Auswahl.
- *Bestellungen:* Bestellmails mit Warenkorb-Blöcken liefern Nummer, Artikel, Größe, Farbe, Preis und Bild.
- *Outfit:* Farbvorausschau, damit Blau und Weinrot nicht kombiniert werden, mehr Abwechslung, nur Teile, die zum Anlass passen.
- *Postfach:* Terminvorschläge aus persönlichen Mails und weitergeleiteten Kursmails, einmalige Prüfung unklarer Mails durch das Modell, aufklappbare Mailvorschläge. Parallel lieferte Codex tiefere Mailprüfung, Löschen von Mails mit Bestätigung, Wetterfragen am Standort, die wichtigen Mails der letzten sieben Tage und schonenderen Mailabruf (1.0.53 bis 1.0.57).

**Ergebnis.** Die Version 1.0.58 führte beide Entwicklungsstränge zusammen.

## 5. Dokumente im Projekt

| Dokument | Zweck |
|---|---|
| [README](../README.md) | Überblick, Installation, Galerie, Anbindung der KI, Versionsübersicht |
| [Changelog](../CHANGELOG.md) | Änderungen je Version |
| [Sicherheit und Datenschutz](SICHERHEIT.md) | Grenzen, Freigaben, Datenweitergabe an externe Dienste |
| [Sicherheitsbericht](../SECURITY_REPORT.md) | Ergebnis des Audits |
| [Skills](SKILLS.md) und `agents/lifepilot/skills/*/SKILL.md` | Anweisungen, Entscheidungskriterien und Beispiele für den Agenten |
| `agents/lifepilot/output.schema.json` | Feste Antwortform, die der Hub vor jeder Speicherung prüft |
| `agents/lifepilot/evals/chat-cases.json` | 48 Beispielsätze für den Agententest |

## 6. Qualitätssicherung

- **Tests:** 228 automatische Tests ohne Modell, darunter Verzeichnis, Zerlegung, Mail- und Bestellerkennung, Kalender und Freigaben.
- **Agentenprüfung:** 48 Beispielsätze gegen das gewählte Modell (`npm run eval:chat`).
- **Sicherheit:** `npm run security:check` führt Abhängigkeitsprüfung, statische Analyse, Geheimnissuche, Prüfung auf private Daten und die Tests aus.
- **Freigaben:** Das Modell schlägt nur vor. Der Hub prüft jede Antwort gegen das Schema und speichert erst nach Bestätigung.
- **Datensicherung:** Vor jeder Änderung an vorhandenen Daten wurde eine Sicherung der Datenbank angelegt.
- **Rückweg:** Jede Version lässt sich im privaten Profil auf die vorherige zurücksetzen.

## 7. Erkenntnisse

- **Kleine, freigegebene Schritte** machen Fehler früh sichtbar. Fast jede Version beantwortet genau eine Rückmeldung.
- **Echte Beispiele schlagen Annahmen.** Erkennungsregeln entstanden aus echten Mails und Bestellungen des Entwicklers, jeweils mit einem Test, der nur erfundene Daten enthält.
- **Das Modell ist ein Vorschlagsgeber.** Schema, Validierung und Freigabe liegen im Hub. So bleibt der Agent kontrollierbar und der Anbieter austauschbar.
- **Mehrere KIs mit klaren Rollen** ergänzen sich: Planung und Analyse in Antigravity und Gemini, Umsetzung in Codex und Claude Code, Prüfung durch Tests und statische Analyse.
- **Dokumentation entsteht mit der Entwicklung.** Changelog, Skill-Dateien, README und dieses Dokument wurden laufend gepflegt, nicht erst am Ende.

## 8. Kennzahlen (Stand 1.0.62)

| Merkmal | Wert |
|---|---|
| Versionen seit der ersten Idee | über 100 |
| Skills | 14 |
| Datenbank-Migrationen | 40 |
| Automatische Tests | 228 |
| Beispielsätze für den Agenten | 48 |
| Modellanbieter | Codex (OpenAI), Claude Code (Anthropic) |
