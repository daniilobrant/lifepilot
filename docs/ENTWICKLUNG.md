# Entwicklungsverlauf von LifePilot

Ein persönlicher Alltagsassistent, gebaut in kleinen Schritten gemeinsam mit KI-Assistenten. Diese Zeitleiste zeigt in der richtigen Reihenfolge, was wann passiert ist, was ich jeweils beauftragt habe und was dabei herauskam. Zu jedem Eintrag stehen mein Auftrag, das Vorgehen und das Ergebnis.

Dieselbe Zeitleiste gibt es als [HTML-Ansicht](entwicklungsverlauf.html) mit aufklappbaren Aufträgen (Datei herunterladen und im Browser öffnen).

**über 100** Versionen · **14** Skills · **45** Migrationen · **283** Tests · **2** Modellanbieter

## Der Ablauf bei jeder Version

1. **Wunsch.** Ich beschreibe ein Problem oder eine Idee, oft per Sprache und mit Bildschirmfoto.
2. **Verstehen.** Der Assistent fasst zusammen und legt bei großen Vorhaben einen Plan vor.
3. **Bauen.** Umsetzung mit Typprüfung, Tests und statischer Analyse.
4. **Installieren.** Die Version läuft in meinem privaten Profil und liegt auf GitHub.
5. **Ausprobieren.** Ich teste mit eigenen Daten. Die Rückmeldung ist der nächste Auftrag.

## Zeitleiste

### Vor dem 24. November 2026

#### Lokaler Hub und erster Agent (Version 0.1 bis 0.3)

*ChatGPT und Codex* · Erst die Bestandsaufnahme des Rechners, dann Dienst, Datenbank, Freigaben, Kommandozeile und Weboberfläche.

Schwerpunkte: Hintergrunddienst, Migrationen, Freigaben, Echte Codex-Läufe

- **Mein Auftrag:** Ich ließ zuerst prüfen, was auf dem Rechner vorhanden ist (Betriebssystem, Git, Node, Codex-Anmeldung) und gab das Oberflächenkonzept „Nocturne V7“ frei. Danach wollte ich einen lauffähigen Kern mit echter Modellausführung. Mein erster Skill-Wunsch: Der Agent soll aus unstrukturiertem Alltagstext prüfbare Aufgaben machen, Rechtschreibfehler verbessern und den Kontext verstehen.
- **Vorgehen:** Dienst, Datenbank mit Migrationen, Auftragsverwaltung mit Freigaben, CLI und Weboberfläche mit gemeinsamem Speicher. Aus meiner Rückmeldung folgten Rückfragen im selben Vorgang, Dialogtests, ein Rückweg bei fehlgeschlagenen Updates und eine Ansicht, die vor jeder Analyse zeigt, welche Daten ans Modell gehen.
- **Ergebnis:** Ein Hub mit Sicherung, Wiederherstellung, Sperren und erfolgreichen echten Modellläufen.

#### Bedienbarkeit mit echten Daten (Version 0.4 bis 0.6)

*ChatGPT und Codex* · Die erste Oberfläche war kaum benutzbar. Jetzt lassen sich Aufgaben und Termine anlegen und behalten.

Schwerpunkte: Texteingabe, Wochenplanung, Dauerhaft gespeichert

- **Mein Auftrag:** Ich meldete zurück: Text lässt sich nicht einfügen, Ergebnisse werden nicht gespeichert. Dazu die Frage, warum der KI-Chat noch fehlt.
- **Vorgehen:** Texteingabe und freie Aufträge, Wochenplanung, bearbeitbare Aufgaben und Termine. Eine Prüfung gegen die Trinity-Anforderungen fand einen Fehler, der behoben wurde.
- **Ergebnis:** Aus dem Prüfstand wurde eine nutzbare Verwaltung. Meine Chat-Frage lenkte die Planung auf den Agenten als Kern.

#### Google-Anbindung und Postfach (Version 0.7 bis 0.13)

*ChatGPT und Codex* · Kalender und Gmail anbinden, Mails sortieren, wichtige Nachrichten hervorheben.

Schwerpunkte: Google Kalender, Gmail-Labels, Pilot-Chat, Bewerbungsmanager

- **Mein Auftrag:** Der Agent sollte Kalender und Mails kennen, Termine eintragen und Mails sortieren, ohne dass ich Einrichtungsdateien bearbeite. Getestet wurde zunächst mit einem Testkonto, dann stellte ich das Projekt auf mein normales Konto um.
- **Vorgehen:** Getrennte Anmeldungen, vereinfachte Einrichtung (nur noch bestätigen), Gmail-Labels für sieben Kategorien, Aktualisieren-Knopf, Auswahl relevanter Nachrichten, Bewerbungsmanager und der persönliche Pilot-Chat, der Aufträge selbst erkennt.
- **Ergebnis:** Ein Postfach, das Mails kategorisiert und Vorschläge für Termine und Aufgaben macht. Jede Übernahme bleibt meine Entscheidung.

#### Design und Navigation (Version 0.9 bis 0.25.3)

*Gemini und Antigravity* · Die Oberfläche wirkte überladen. Ein neues Design wurde erarbeitet und auf alle Bereiche übertragen.

Schwerpunkte: Helles Design, Feste Navigation, Einheitlicher Seitenkopf, Kalenderfarben

- **Mein Auftrag:** Ich erarbeitete mit Gemini und Antigravity ein neues Design und ließ es Bereich für Bereich umsetzen: einheitliche Kacheln, deutlich unterscheidbare Farben für Arbeit, Uni und Freizeit, feste Plätze für Navigation und Pilot-Chat.
- **Vorgehen:** Die Entwürfe kamen als Markdown-Anleitung, der Assistent setzte sie schrittweise um. Die Startseite zeigt die Woche mit Aufgaben, Fristen und dem nächsten Termin.
- **Ergebnis:** Eine durchgängige Oberfläche. Spätere Versionen verfeinerten sie bereichsweise.

#### Fachbereiche mit Markdown-Plänen (Version 0.5 bis 0.25)

*Gemini und Antigravity* · Finanzen, Vorrat und Einkauf, Bestellungen, Serien, Projekte und Fristen entstanden nach nummerierten Anleitungen.

Schwerpunkte: Finanz-Skill, Projektseite, Bestellungstracker, Serientermine

- **Mein Auftrag:** Für große Bereiche ließ ich zuerst mit Gemini und Antigravity eine Markdown-Anleitung in nummerierten Schritten schreiben (Finanz-Skill, Projektseite, Kleiderschrank-Lebenszyklus, Sicherheitscheckliste). Diese Datei schickte ich dann an Codex und ließ sie Schritt für Schritt abarbeiten. Beispiele: Einkaufsliste ähnlich der App „Bring“, Bestellungstracker für „was kommt an, was geht zurück“, wiederkehrende Termine per Satz („Arbeit montags und freitags von 8 bis 16 Uhr“).
- **Vorgehen:** Pro Schritt umsetzen, testen, installieren, ich prüfe im Browser. Die Freigabe der Finanzversion 0.14 gab ich ausdrücklich.
- **Ergebnis:** Finanzen mit Vorschlägen aus Mails, Vorrat und Rezepte mit Mengenabgleich, Bestellungen mit Entscheidung je Artikel, Serientermine mit Feiertagen, Projekte mit Phasen und ein eigenes Fristenboard.

#### Kleiderschrank, Outfit und Reisen (Version 0.9 bis 1.0.10)

*ChatGPT und Codex* · Outfits nach Anlass, Wetter und Passform. Reisen per Formular oder Chat.

Schwerpunkte: Bild- und Linkimport, Lookbook, Parfümsammlung, Reisevorschau, Packliste

- **Mein Auftrag:** Ein eigener Skill für Kleidung und Düfte, der Outfits nach Anlass, Wetter und Passform vorschlägt. Und der Urlaubsplaner mit Tagesplan, Karten-Verknüpfungen und Packliste, ohne Budgetrechner. Eine sehr lange Testreise scheiterte an der Länge der Anfrage, das war mein Fehlerbericht.
- **Vorgehen:** Import per Bild und Link, Schichtung und Jackenwahl nach Temperatur, Reisevorschau erst nach Annahme, abschnittsweises Lesen langer Reiseanfragen.
- **Ergebnis:** Looks aus dem Bestand, übernommene Käufe aus Bestellungen, Reisen aus kurzen oder sehr ausführlichen Eingaben.

#### Mailverständnis (Version 0.25.4 bis 0.25.6)

*ChatGPT und Codex* · Beispiele aus meinem echten Postfach, die nicht erkannt wurden, wurden zu Regeln.

Schwerpunkte: Tickets, PayPal-Abgleich, Weitergeleitete Hochschulmails

- **Mein Auftrag:** Ich nannte echte Beispiele: eine Comedy-Show als Termin mit Ausgabe, Amazon-Bestellungen, wiederkehrende Abbuchungen, weitergeleitete Uni-Mails, Gutschriften. Der Assistent las sie und leitete die Regel ab.
- **Vorgehen:** Tiefenprüfung für Belege, getrennte Vorschläge für Termin und Ausgabe, Abgleich mit PayPal, Zuordnung zu Vorlesungen.
- **Ergebnis:** Aus Mails entstehen belegbare Vorschläge, die ich übernehme oder ablehne. Die Regeln stehen in den Skill-Dateien.

### 24. November 2026

#### Sicherheitsprüfung und Veröffentlichung (Version 1.0)

*ChatGPT und Codex* · Vor dem Veröffentlichen wurde die ganze App auf Hintertüren geprüft. Das öffentliche Repository entstand.

Schwerpunkte: Checkliste, Pull Requests, Google an Konto gebunden, Prüfsummen

- **Mein Auftrag:** Ich wollte vor der Veröffentlichung die gesamte App auf Hintertüren prüfen lassen. Der Professor sollte Stand und Verlauf einsehen können.
- **Vorgehen:** Prüfung nach Checkliste, Befunde als Pull Requests behoben und nach bestandenen Prüfungen zusammengeführt. Google-Anbindung ans bestätigte Konto gebunden, private Releases gegen Prüfsummen geprüft. Dazu Installationsanleitung, README, Screenshot-Galerie, Skill-Beschreibungen und Änderungsverlauf.
- **Ergebnis:** Version 1.0 als öffentlicher Quellstand mit dokumentierten Sicherheitsgrenzen. Ab jetzt wird jede Änderung im Profil installiert und nach GitHub übertragen.

### 25. November 2026

#### Weiterbau mit Claude Code (Version 1.0.11 bis 1.0.35)

*Claude Code* · Rund 25 Versionen an einem Tag, jede getestet, installiert und dokumentiert.

Schwerpunkte: Zahlungen und Erstattungen, Outfit-Palette, Amazon-Bestellungen, Reiseguide parallel, Fünf Mengeneinheiten

- **Mein Auftrag:** Ich wechselte für den Weiterbau zu Claude Code und gab die Projektinformationen weiter. Aufträge kamen als kurze Wünsche und Listen, meist mit Bildschirmfoto: Händlererstattungen, Apple-Abos, Outfit mit Basisschicht und Farbpalette, Looks als Kacheln, Amazon-Bestellungen, Reiseguide mit Währungsrechner und Notrufnummer, Vorrat mit Einheiten.
- **Vorgehen:** Jede Liste wurde als eine Version umgesetzt. Die statische Analyse lief lokal, damit Prüfungen vor dem Hochladen bestehen, vor Änderungen an Daten gab es eine Sicherung.
- **Ergebnis:** Viele Bereiche wurden alltagstauglich: Zahlungserkennung, Bestellungen, Reisen, Vorrat und Outfit.

### 25. und 26. November 2026

#### Den Agenten verbessern (Version 1.0.34 bis 1.0.42)

*Claude Code* · Ziel: möglichst viele Anfragen verstehen, auch kombinierte und diktierte.

Schwerpunkte: Verzeichnis aller Bereiche, Nachrichten zerlegen, Entscheidungstabelle, 48 Beispielsätze, Claude als zweiter Anbieter

- **Mein Auftrag:** Der Agent sollte für die Bewertung durch den Professor viele Anfragen verstehen, auch kombinierte über mehrere Skills und mit Spracheingabe. Ich bat zuerst um eine Analyse: Was kann der Agent heute, was fehlt?
- **Vorgehen:** Analyse aus dem Code (wenig Aufgaben, kein Wissen über Projekte oder Finanzen, keine Verbindungen zwischen Skills). Daraus vier Schritte: Verzeichnis der Bereiche mit fehlertoleranter Suche, Zerlegung langer Nachrichten, Entscheidungstabelle der Skills, Testsatz mit 48 Beispielsätzen. Wegen knappen Kontingents kam Claude Code als umschaltbarer Anbieter dazu, ohne Werkzeuge im leeren Ordner.
- **Ergebnis:** 47 von 48 Beispielsätzen bestanden, der Fehlfall wurde behoben. Die README beschreibt beide Anbieter.

### 26. November 2026

#### Sicherheit und Bereinigung (Version 1.0.43 bis 1.0.59)

*Claude Code* · Hintertüren- und Datenleck-Prüfung, ohne Funktionen einzuschränken.

Schwerpunkte: npm audit, Semgrep, Gitleaks, Sicherheitsbericht, Verlauf bereinigt

- **Mein Auftrag:** Ich wollte das Gesamtprojekt auf Hintertüren und Datenlecks prüfen lassen, ohne Funktionen zu beschneiden, und ein Repository ohne interne Dokumente und private Daten.
- **Vorgehen:** Prüfung 1.0.43 fand keine Hintertüren, behob aber zu offene Dateirechte und einen Abruf mit Weiterleitungen. Aufgeräumt wurden interne Berichte und Prüfskripte. Danach der Audit nach Vorgabe des Professors mit Mustersuche nach privaten Daten. Der Git-Verlauf wurde nach Sicherung und meiner Freigabe bereinigt.
- **Ergebnis:** Ein Sicherheitsbericht und ein Befehl, der die Prüfung jederzeit lokal wiederholt.

#### Feinschliff im Alltag (Version 1.0.44 bis 1.0.88)

*Claude Code* · Fehler und Wünsche aus dem täglichen Gebrauch.

Schwerpunkte: Terminvorschläge unter dem Kalender, Farbvorausschau im Outfit, Tiefere Mailprüfung, Wetterfragen

- **Mein Auftrag:** Kleine Rückmeldungen per Bildschirmfoto: Aufgabe mit Uhrzeit erscheint doppelt, Zutaten gelten nicht als vorhanden, Bestellmails mit Warenkorb-Blöcken, Blau und Weinrot im Outfit.
- **Vorgehen:** Jede Rückmeldung wurde eine eigene kleine Version. Parallel lieferte Codex tiefere Mailprüfung, Löschen mit Bestätigung, Wetterfragen und schonenderen Mailabruf. In 1.0.58 liefen beide Stränge zusammen.
- **Ergebnis:** Nach einer Präsentation (1.2.1), in der Pilot ein neues Anliegen nach einer Terminfrage nicht erkannte, entstanden Dialogfälle, Kurzantworten zum Anklicken und eine einmalige Selbstkorrektur.

### 27. November 2026

#### Kartenexport für Google My Maps (Version 1.1.0 bis 1.2.1)

*Claude Code* · Orte einer Reise nach Kategorien auswählen und für My Maps herunterladen.

Schwerpunkte: CSV, ZIP, KML, Kartenname mit Flagge, Unterkunft nur mit Freigabe, Outfit im Urlaub

- **Mein Auftrag:** Ich gab einen ausführlichen Umsetzungs-Prompt als Markdown-Datei: Button im Urlaubsplaner, feste Kategorien mit Emojis, Auswahl pro Ort, Exportformate, Hinweise zum Import. Wichtig war mir, dass private Unterkunftsadressen nur nach ausdrücklicher Freigabe exportiert werden.
- **Vorgehen:** Umsetzung nach der Datei, danach mehrere Korrekturen durch meinen Test mit dem echten Import. Außerdem Outfit-Vorschläge während der Reise und ein eigener Bereich „Urlaub“ bei den Looks.
- **Ergebnis:** Export, der sich in Google My Maps importieren lässt. Später zog ich den Button ins Aktionen-Menü.

### 27. und 28. November 2026

#### News-Briefing (Version 1.3.0 bis 1.3.6)

*Claude Code* · Sechs Kacheln mit aktuellen Meldungen und Link zur Quelle.

Schwerpunkte: Wirtschaft, Technik, Politik, Aktien, Regional, Sport, Hintergrund-Auftrag, Einstellungen je Bereich

- **Mein Auftrag:** Ich wünschte ein kurzes tägliches Briefing im Programm, nach Bereichen getrennt, mit Einstellungen für Themen, Vereine und Werte.
- **Vorgehen:** Statt eines großen Suchauftrags laufen sechs kleine parallel, fällt eine Kachel aus, bleibt der letzte Stand sichtbar. Die Websuche wurde als zweite dokumentierte Ausnahme der Sicherheitsgrenze mit meiner ausdrücklichen Freigabe aufgenommen.
- **Ergebnis:** Ein Briefing, das bis zur nächsten Aktualisierung gespeichert bleibt. Zugeklappt nur die Schlagzeile, aufgeklappt Einordnung und Quelle.

### 28. November 2026

#### Sparplan und Depot (Version 1.4)

*Claude Code* · Monatliches Sparen einplanen und das Depot im Blick behalten.

Schwerpunkte: Sparplan, Positionen mit Kaufkurs, Screenshot-Erkennung, Kreisdiagramm und Verlauf, Schlagzeilen und Ausblick

- **Mein Auftrag:** Ich beschrieb den Wunsch zuerst frei: Sparplan in den Einstellungen, der vom Budget abgeht, ein Depot-Bereich mit Screenshot-Upload, Kreisdiagramm, Verlauf, Aktualisieren-Knopf und später Empfehlungen. Dann bat ich, vor dem Bauen noch einmal nachzufragen, ob alles richtig verstanden wurde. Vier Rückfragen klärten Reihenfolge, Kursquelle, Empfehlungen und Sparplan. Während des Baus kamen weitere Wünsche: Position mit Suche und Kaufkurs eintragen, Einzelpositionen bearbeiten, Kreisdiagramm nach Branche, eine seriöse Kursquelle, Chart wie bei Trade Republic, aktives Testen mit Beispielwerten.
- **Vorgehen:** Kurs-Quellen wurden vorab getestet, nur finanzen.net lieferte für alle Werte Preise. Suche, Kursabruf, Screenshot-Erkennung und Meldungen liefen live gegen das echte Modell mit Beispielwerten, das Chart wurde im Browser geprüft. Dazu kleine Änderungen derselben Runde: Rezepte-Mengen-Editor, Profil mit anklickbaren Interessen, Bewerbung löschen.
- **Ergebnis:** Depot-Release 1.4 mit neuer Sicherheitsdokumentation für die Websuche. Reine Überarbeitungen vorhandener Bereiche laufen künftig als kleine Schritte, nur neue Bereiche springen eine Minor-Version weiter.

#### Sicherheitsrunde und saubere Doku (Version 1.4)

*Claude Code* · Alle Prüfungen wiederholt, Verlauf bereinigt, Screenshots mit erfundener Testperson.

Schwerpunkte: 0 Schwachstellen, Frische Kopie geprüft, Testperson Max Mustermann

- **Mein Auftrag:** Ich bat darum, nach dem Release alle Sicherheits- und Hintertüren-Checks zu wiederholen, nachzusehen, dass keine privaten Daten das Gerät verlassen oder im Repository liegen, und die Dokumentation samt Screenshots mit einer erkennbar fiktiven Person zu aktualisieren.
- **Vorgehen:** Tests, npm audit, Semgrep, Mustersuche, Zugangsprüfung der laufenden App (ohne Anmeldung, falscher Host, fremde Herkunft, Pfadtricks) und ein Blick auf alle ausgehenden Verbindungen. Mit meiner Freigabe wurde der Git-Verlauf erneut umgeschrieben und in einer frischen Kopie geprüft. Die Galerie zeigt jetzt Max Mustermann.
- **Ergebnis:** README, Changelog, Entwicklungsverlauf, Sicherheitsbericht und Screenshots stehen auf dem Stand von 1.4.

## Wie ich die Assistenten gebrieft habe

| Muster | Beschreibung |
|---|---|
| Fehler mit Bildschirmfoto | Ein Satz und ein Bild genügen. So entstand der neu geordnete Termineditor. |
| Echtes Beispiel | Eine nicht erkannte Mail oder Bestellung als Vorlage. Der Assistent leitet die Regel ab und schreibt einen Test mit erfundenen Daten. |
| Anforderungsliste | Mehrere Punkte in einer Nachricht, die nacheinander als eine Version umgesetzt werden. |
| Markdown-Plan | Große Vorhaben als nummerierte Schritte, vorab mit Gemini und Antigravity ausgearbeitet und dann in Codex oder Claude Code abgearbeitet. |
| Erst fragen, dann bauen | Der Assistent erklärt zuerst, was möglich ist und was fehlt. Erst danach gebe ich frei. |
| Freigabe und Sparsamkeit | Ausdrückliche Freigaben für Versionen, Datenfreigaben und Löschungen. Wenig Modellkontingent heißt: Prüfungen ohne Modellaufruf. |

## Leitlinien, die ich vorgegeben habe

- **Funktion vor Oberfläche:** Erst funktioniert es, dann wird es schön gemacht.
- **Der Agent erkennt selbst:** Auch bei Tippfehlern, Diktat und langen Nachrichten. Nachfragen nur bei echter Unklarheit.
- **Ich bestätige, der Rest läuft:** Einmalige Freigaben statt ständiger Rückfragen.
- **Keine privaten Daten im Repository:** Profil, Zugangsdaten und Datenbank bleiben lokal.
- **Sicherheitsgrenzen nur nach Rückfrage:** Der Assistent sagt direkt, wenn etwas nicht stimmt.

---

Alle Daten in dieser Übersicht sind aus dem öffentlichen Entwicklungsverlauf des Projekts zusammengefasst. Zugangsdaten, private Netzwerkangaben und persönliche Inhalte sind nicht enthalten. Die frühen 0.x-Versionen sind im Arbeitsprotokoll nicht datiert und nach Reihenfolge eingeordnet.
