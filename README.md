# LifePilot 1.5.1

LifePilot ist eine lokale macOS-App für persönliche Organisation. Startseite, Kalender, Aufgaben und Projekte greifen auf denselben SQLite-Datenbestand zu. Pilot hilft bei Rückfragen und bereitet Änderungsvorschläge vor.

[Installation](#installation) · [Screenshots](#lifepilot-im-einsatz) · [Funktionen](#funktionen) · [Skills](docs/SKILLS.md) · [Versionsübersicht](#versionsübersicht) · [Entwicklungsverlauf](docs/ENTWICKLUNG.md) · [Sicherheitsbericht](SECURITY_REPORT.md)

## LifePilot im Einsatz

Die Aufnahmen zeigen die fiktive Testperson Max Mustermann in einem getrennten Testprofil; alle Namen, Mails, Beträge und Depotwerte sind erfunden (Beispielwerte, keine echten Konten). Die Produktbilder für Kleidung und Düfte wurden für diese Demo erstellt. Klicke auf eine Aufnahme, um sie in voller Größe zu sehen.

### Planung und Pilot

<table>
<tr>
<td width="50%" valign="top"><strong>Startseite</strong><br>Wochenbriefing mit Aufgaben, Fristen, nächsten Terminen und wichtigen Mails.<br><a href="docs/screenshots/01-start.png"><img src="docs/screenshots/01-start.png" alt="Wochenbriefing mit anstehenden Aufgaben und Terminen"></a></td>
<td width="50%" valign="top"><strong>Pilot-Chat</strong><br>Pilot nimmt Aufträge im Chat entgegen. Aus einer einzigen Nachricht entstehen ein Kalendertermin und eine Aufgabe mit Erinnerung; du bestätigst jeden Vorschlag einzeln.<br><a href="docs/screenshots/15-pilot.png"><img src="docs/screenshots/15-pilot.png" alt="Pilot-Chat mit einem Brunchtermin und einer Erinnerung, daneben der Kalender mit den übernommenen Einträgen"></a></td>
</tr>
<tr>
<td width="50%" valign="top"><strong>Kalender</strong><br>Termine und Serien in der Wochen- oder Monatsansicht planen und freie Zeitfenster finden.<br><a href="docs/screenshots/02-kalender.png"><img src="docs/screenshots/02-kalender.png" alt="Monatskalender und Suche nach freien Zeitfenstern"></a></td>
<td width="50%" valign="top"><strong>Aufgaben &amp; Fristen</strong><br>Aufgaben nach Uni, Privat und Arbeit organisieren und bei Bedarf einem Projekt zuordnen.<br><a href="docs/screenshots/03-aufgaben.png"><img src="docs/screenshots/03-aufgaben.png" alt="Aufgabenboard in drei Spalten mit Prioritäten und Fristen"></a></td>
</tr>
<tr>
<td width="50%" valign="top"><strong>Projekte</strong><br>Phasen, Checkpoints, verknüpfte Fristen und Fortschritt auf einer Projektkarte sehen.<br><a href="docs/screenshots/04-projekte.png"><img src="docs/screenshots/04-projekte.png" alt="Projektkarte mit Phasen und Fortschrittsanzeige"></a></td>
<td width="50%" valign="top"><strong>Urlaubsplaner</strong><br>Reiseplan mit Anreise, Unterkunft, Währung und Tagesplan, Tipps und Buchungen für jeden Reisetag.<br><a href="docs/screenshots/08-reise.png"><img src="docs/screenshots/08-reise.png" alt="Reiseplan für Lissabon mit Anreise, Unterkunft und Tagesplan"></a></td>
</tr>
<tr>
<td width="50%" valign="top"><strong>Reisevorbereitung</strong><br>Checkliste und Packliste einer Reise lassen sich abhaken und nach Bedarf anpassen.<br><a href="docs/screenshots/08b-reise-vorbereitung.png"><img src="docs/screenshots/08b-reise-vorbereitung.png" alt="Checkliste und Packliste einer Reise nach Lissabon"></a></td>
<td width="50%" valign="top"><strong>Kartenexport für Google My Maps</strong><br>Orte der Reise nach Kategorien auswählen, den Kartennamen kopieren und als CSV, ZIP oder KML für Google My Maps herunterladen.<br><a href="docs/screenshots/08c-reise-karten.png"><img src="docs/screenshots/08c-reise-karten.png" alt="Exportbereich mit Kartenname, Kategorien und ausgewählten Orten"></a></td>
</tr>
<tr>
<td width="50%" valign="top"><strong>Outfit-Vorschlag im Urlaub</strong><br>Ab einem Tag vor der Abreise bis zum Reiseende: Datum und Tagesabschnitt wählen, Pilot stellt ein Outfit aus dem Kleiderschrank zusammen. Es landet im Styling-Studio und lässt sich unter „Urlaub“ speichern.<br><a href="docs/screenshots/08d-reise-outfit.png"><img src="docs/screenshots/08d-reise-outfit.png" alt="Auswahl von Datum und Tagesabschnitt für einen Outfit-Vorschlag"></a></td>
<td width="50%"></td>
</tr>
</table>

### News

<table>
<tr>
<td width="50%" valign="top"><strong>News-Briefing</strong><br>Auf Knopfdruck sammelt Pilot je Bereich drei bis fünf aktuelle Meldungen aus festen Quellen. Zugeklappt steht nur die Schlagzeile, aufgeklappt die Einordnung mit Link zur Quelle. Das Briefing bleibt bis zur nächsten Aktualisierung gespeichert.<br><a href="docs/screenshots/22-news.png"><img src="docs/screenshots/22-news.png" alt="News-Briefing mit sechs Kacheln für Wirtschaft, Technik, Politik, Aktien, Regional und Sport"></a></td>
<td width="50%" valign="top"><strong>News-Einstellungen</strong><br>Ein kleiner Fragebogen je Bereich: allgemeiner Überblick oder gezielte Schwerpunkte per Kästchen, dazu ein Freitextfeld für Vereine, Werte oder Begriffe.<br><a href="docs/screenshots/22b-news-einstellungen.png"><img src="docs/screenshots/22b-news-einstellungen.png" alt="Einstellungen mit Kästchen und Freitext für jede News-Kategorie"></a></td>
</tr>
</table>

### Posteingang, Bestellungen und Verwaltung

<table>
<tr>
<td width="50%" valign="top"><strong>Posteingang</strong><br>Wichtige Nachrichten priorisieren und begründen, warum sie wichtig sind.<br><a href="docs/screenshots/05-posteingang.png"><img src="docs/screenshots/05-posteingang.png" alt="Posteingang mit ausgewählten fiktiven Nachrichten"></a></td>
<td width="50%" valign="top"><strong>Terminvorschläge</strong><br>Aus Mails abgeleitete Termine, Fristen und Aufgaben stehen unter dem Kalender und lassen sich einzeln oder gesammelt übernehmen.<br><a href="docs/screenshots/05b-mailvorschlaege.png"><img src="docs/screenshots/05b-mailvorschlaege.png" alt="Terminvorschlag für eine Aufgabe mit Bestätigen und Ablehnen"></a></td>
</tr>
<tr>
<td width="50%" valign="top"><strong>Bestellungstracker</strong><br>Lieferstatus verfolgen und je Artikel entscheiden, was behalten oder retourniert wird.<br><a href="docs/screenshots/06-bestellungen.png"><img src="docs/screenshots/06-bestellungen.png" alt="Musterbestellung mit Lieferstatus und Artikelentscheidungen"></a></td>
<td width="50%" valign="top"><strong>Finanzen &amp; Abos</strong><br>Einnahmen, Ausgaben, Fixkosten und Abos im Monatsverlauf prüfen.<br><a href="docs/screenshots/07-finanzen.png"><img src="docs/screenshots/07-finanzen.png" alt="Finanzübersicht mit fiktiven Einnahmen und Ausgaben"></a></td>
</tr>
<tr>
<td width="50%" valign="top"><strong>Sparplan</strong><br>In den Finanz-Einstellungen legst du eine monatliche Sparrate fest. Sie zählt wie Fixkosten, mindert Saldo und Restbudget und erscheint in der Fixkostenliste.<br><a href="docs/screenshots/07c-sparplan.png"><img src="docs/screenshots/07c-sparplan.png" alt="Finanz-Einstellungen mit Sparplan von 150 Euro und Fixkostenliste"></a></td>
<td width="50%" valign="top"><strong>Depot</strong><br>Positionen mit Kaufkurs und Kaufdatum, Depotwert, Gewinn und Verlust, Kreisdiagramm nach Branche, Verlaufs-Chart mit Zeitraumwahl und Positionsliste. Aufnahme mit Beispielwerten.<br><a href="docs/screenshots/23-depot.png"><img src="docs/screenshots/23-depot.png" alt="Depot mit Kreisdiagramm, Verlaufs-Chart und sechs Positionen"></a></td>
</tr>
<tr>
<td width="50%" valign="top"><strong>Depot: Schlagzeilen &amp; Ausblick</strong><br>Pilot sucht aktuelle Meldungen zu deinen Positionen (nur Namen werden gesendet, nie Beträge) und nennt Themen, die das Depot ergänzen könnten.<br><a href="docs/screenshots/23b-depot-news.png"><img src="docs/screenshots/23b-depot-news.png" alt="Schlagzeilen zu Depotpositionen mit Quelle und Ausblick"></a></td>
<td width="50%"></td>
</tr>
<tr>
<td width="50%" valign="top"><strong>Abo-Prüfung</strong><br>Pilot sucht im Web nach günstigeren Tarifen und sagt je Abo, ob es sich lohnt zu wechseln. Gekündigt oder gebucht wird nichts.<br><a href="docs/screenshots/07b-abo-pruefung.png"><img src="docs/screenshots/07b-abo-pruefung.png" alt="Abo-Prüfung mit Empfehlung Behalten oder Wechseln und einer Tarifalternative"></a></td>
<td width="50%" valign="top"><strong>Bewerbungen</strong><br>Bewerbungen nach Status organisieren, Gespräche planen und Vorschläge aus Mails mit „Passt“ bestätigen.<br><a href="docs/screenshots/11-bewerbungen.png"><img src="docs/screenshots/11-bewerbungen.png" alt="Bewerbungsboard mit Bewerbungsvorschlag aus einer Mail"></a></td>
</tr>
</table>

### Outfit, Düfte und Haushalt

<table>
<tr>
<td width="50%" valign="top"><strong>Kleiderschrank</strong><br>Kleidung mit Produktbildern, Kategorien, Farben und Passformen verwalten.<br><a href="docs/screenshots/09-kleiderschrank.png"><img src="docs/screenshots/09-kleiderschrank.png" alt="Fiktive Kleidungsstücke mit Produktbildern"></a></td>
<td width="50%" valign="top"><strong>Parfüm &amp; Düfte</strong><br>Düfte mit Flakonbild, Duftnoten, Größe und passenden Anlässen sammeln.<br><a href="docs/screenshots/14-duefte.png"><img src="docs/screenshots/14-duefte.png" alt="Vier fiktive Düfte mit Flakonbildern und Duftnoten"></a></td>
</tr>
<tr>
<td width="50%" valign="top"><strong>Styling-Studio</strong><br>Ein Outfit nach Anlass, Tageszeit, Wetter und vorhandenen Kleidungsstücken zusammenstellen, passend mit Duft.<br><a href="docs/screenshots/16-styling.png"><img src="docs/screenshots/16-styling.png" alt="Styling-Studio mit Outfitvorschlag für ein Vorstellungsgespräch"></a></td>
<td width="50%" valign="top"><strong>Einkaufsliste</strong><br>Lebensmittel auf einer nach Warengruppen gegliederten Liste abhaken.<br><a href="docs/screenshots/10-einkauf.png"><img src="docs/screenshots/10-einkauf.png" alt="Einkaufsliste mit Kategoriegruppen"></a></td>
</tr>
<tr>
<td width="50%" valign="top"><strong>Meine Looks</strong><br>Kombinationen und eigene Outfit-Fotos als Looks zusammenhalten.<br><a href="docs/screenshots/17-looks.png"><img src="docs/screenshots/17-looks.png" alt="Lookbook mit gespeicherten Outfit-Kombinationen"></a></td>
<td width="50%" valign="top"><strong>Urlaubsgarderobe</strong><br>Kleidungsstücke aus dem Schrank für eine konkrete Reise auswählen und als Packauswahl speichern.<br><a href="docs/screenshots/20-urlaubsgarderobe.png"><img src="docs/screenshots/20-urlaubsgarderobe.png" alt="Urlaubsgarderobe mit bebilderter Packauswahl für eine Musterreise"></a></td>
</tr>
<tr>
<td width="50%" valign="top"><strong>Verkaufen</strong><br>Für ein Kleidungsstück einen Verkaufsentwurf mit Zustand, Preisrahmen und Inseratstext erstellen.<br><a href="docs/screenshots/21-verkaufen.png"><img src="docs/screenshots/21-verkaufen.png" alt="Verkaufsbereich mit einer fiktiven Baseballcap"></a></td>
<td width="50%" valign="top"><strong>Mein Vorrat</strong><br>Vorräte nach Kategorien durchsuchen und den Bestand pflegen.<br><a href="docs/screenshots/18-vorrat.png"><img src="docs/screenshots/18-vorrat.png" alt="Kategorisierte Vorratsverwaltung"></a></td>
</tr>
<tr>
<td width="50%" valign="top"><strong>Meine Rezepte</strong><br>Rezepte speichern, Portionen umstellen und Mengen mit Zahl und Einheit bearbeiten. Der Status je Zutat folgt live dem Vorrat; fehlende Zutaten wandern auf die Einkaufsliste.<br><a href="docs/screenshots/19-rezepte.png"><img src="docs/screenshots/19-rezepte.png" alt="Rezept mit geöffnetem Mengen-Editor, Zahl und Einheit je Zutat"></a></td>
<td width="50%"></td>
</tr>
</table>

### Skills und Einstellungen

<table>
<tr>
<td width="50%" valign="top"><strong>Skills</strong><br>Verfügbare Fähigkeiten und ihre Verknüpfungen mit den Modulen einsehen.<br><a href="docs/screenshots/12-skills.png"><img src="docs/screenshots/12-skills.png" alt="Skill-Übersicht mit verknüpften Modulen"></a></td>
<td width="50%" valign="top"><strong>Einstellungen &amp; Profil</strong><br>Profil der fiktiven Testperson: Angaben zu Person, Studium und Beruf, Interessen zum Anklicken nach Kategorien sowie Alltag, Allergien, Verkehrsmittel und Sprachen.<br><a href="docs/screenshots/13-einstellungen.png"><img src="docs/screenshots/13-einstellungen.png" alt="Profil mit Max Mustermann, Auswahlfeldern und anklickbaren Interessen"></a></td>
</tr>
</table>

[Galerie als eigene Seite](docs/SCREENSHOTS.md)

## Installation

Vorausgesetzt sind macOS, Node.js 24 ab 24.13, npm, Git und die Xcode Command Line Tools. Dieser Stand wurde auf einem Mac mit Apple Silicon geprüft. Der Download enthält Quellcode, aus dem auch die nativen Helfer gebaut werden.

    git clone https://github.com/daniilobrant/lifepilot.git
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

Öffne **Projekte**, lege ein fiktives Projekt mit Unterpunkten an und setze für einen Punkt eine Frist. Die Frist erscheint in **Aufgaben & Fristen**. Probiere danach eine erfundene Frage als Pilot-Entwurf aus. Das Testprofil speichert seine Daten getrennt und sperrt externe Modellaufrufe und den Cloud-Reiseguide. Lokale Planung und Reisevorschauen stehen im Testprofil zur Verfügung. Verwende dort ausschließlich fiktive Daten.

    ./bin/lifepilot --acceptance stop

Für das Hauptprofil verwende dieselben Befehle ohne **--acceptance**. Die App öffnet sich lokal auf Port 45137, das Testprofil auf Port 45138. Der Checkout enthält keine Berechtigung für den persönlichen Chat und keine Kontodaten. Google, Codex und Claude Code sind optionale Integrationen. [Einrichtung, Datenspeicher und Grenzen](docs/SICHERHEIT.md)

## KI-Anbindung: Codex oder Claude Code

Pilot, der Reiseguide und die Bildanalyse nutzen ein Sprachmodell über eine lokal installierte Kommandozeile. LifePilot unterstützt zwei Anbieter, umschaltbar unter **Einstellungen › Übersicht › Agenten-Chat**:

| | Codex (Standard) | Claude Code |
|---|---|---|
| Anbieter | OpenAI | Anthropic |
| Programm | Codex CLI aus der ChatGPT-App für macOS | Claude Code CLI |
| Abrechnung | ChatGPT-Konto bzw. Codex-Kontingent | Claude-Abo (Pro/Max) |

**So funktioniert die Anbindung:** Jede Pilot-Nachricht wird lokal vorbereitet – ein kompaktes Verzeichnis deiner Termine, Aufgaben, Projekte, Abos, Bestellungen, Bewerbungen und Reisen ([agent-directory.ts](hub/runtime/agent-directory.ts)) und eine Vorzerlegung langer, diktierter Nachrichten ([message-analysis.ts](hub/runtime/message-analysis.ts)). Zusammen mit den [Skills](agents/lifepilot/skills) und einer Entscheidungstabelle ([routing](agents/lifepilot/skills/routing/SKILL.md)) geht das an das Modell. Das Modell muss in einem festen JSON-Format antworten ([output.schema.json](agents/lifepilot/output.schema.json)); LifePilot prüft die Antwort ([validate.ts](agents/lifepilot/tools/validate.ts)) und speichert erst nach deiner Freigabe. Das Modell läuft ohne Werkzeuge, ohne Shell, Dateien, Web oder MCP-Server ([codex.ts](hub/adapters/codex.ts), [claude.ts](hub/adapters/claude.ts)).

### Schritt 1: Privaten Chat freigeben

Der Chat im Hauptprofil arbeitet nur mit einer lokalen Freigabe für genau den installierten Build: `user-data/local/private-chat-release.json` mit `version`, `approved: true`, `manifest` (SHA-256 der Datei `SHA256SUMS`) und `ui` (SHA-256 von `dist/app.js`). Ohne gültige Freigabe bleibt der Chat aus. [Details](docs/SICHERHEIT.md)

### Schritt 2a: Codex anbinden

1. ChatGPT-App für macOS installieren und anmelden. Die App bringt die Codex CLI mit (`/Applications/ChatGPT.app/Contents/Resources/codex-cli`).
2. In LifePilot unter **Einstellungen › Übersicht** „Codex (ChatGPT)“ wählen. LifePilot prüft vor jedem Aufruf die Signatur der Codex CLI.

### Schritt 2b: Claude Code anbinden

1. Claude Code CLI installieren (offizieller Installer von Anthropic):

       curl -fsSL https://claude.ai/install.sh | bash

2. Den Installationsordner in den Suchpfad aufnehmen, falls `claude` danach „command not found“ meldet:

       echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc

3. `claude` starten, das Farbschema bestätigen und **„Claude account with subscription“** wählen; die Anmeldung im Browser bestätigen. Mit `/exit` beenden.
4. In LifePilot unter **Einstellungen › Übersicht** „Claude (Claude Code CLI)“ wählen. LifePilot findet die CLI unter `~/.local/bin/claude` und nutzt deren Anmeldung aus dem macOS-Schlüsselbund.

### Schritt 3: Anbindung prüfen

    npm test                 # 219 Tests ohne Modell, u. a. Verzeichnis, Vorzerlegung, Bewertung
    npm run eval:chat        # 48 Beispielsätze live gegen das eingestellte Modell

`npm run eval:chat` läuft im installierten Hauptprofil mit Freigabe und verbraucht Modellkontingent. Es prüft einzelne Skills, Kombinationen aus zwei und drei Skills, Diktatfehler („Kai und Data Science“, „B2Bar.“), Fragen zu eigenen Daten und Rückfragen bei unklaren Aufträgen ([Testfälle](agents/lifepilot/evals/chat-cases.json)). Das Ergebnis steht in `agents/lifepilot/evals/LAST_RUN.md`.

### Die Einrichtung einer KI überlassen

Codex oder Claude Code können die Anbindung selbst übernehmen. Öffne das geklonte Repository in Codex bzw. Claude Code und gib diesen Auftrag:

> Richte LifePilot auf diesem Mac mit **[Codex | Claude Code]** als Modell ein. Lies zuerst README.md und docs/SICHERHEIT.md. Führe `npm ci`, `npm run build` und `npm test` aus. Prüfe, ob die gewählte CLI installiert und angemeldet ist; falls nicht, nenne mir die Befehle, die ich selbst ausführe – Anmeldungen und Passwörter gebe ich selbst ein. Erstelle die private Chat-Freigabe für den gebauten Stand nur nach meiner Bestätigung, starte die App mit `./bin/lifepilot start`, stelle in den Einstellungen den Anbieter ein und führe danach `npm run eval:chat` aus. Fasse zusammen, welche Fälle bestanden haben und welche nicht.

## Funktionen

| Bereich | Was LifePilot unterstützt |
| --- | --- |
| Start und Pilot | Wochenübersicht, Aufgaben, Fristen, nächste Termine, wichtige Nachrichten, Rückfragen und Vorschläge zur Bestätigung |
| Kalender | Woche und Monat, Zeitfenster, Serientermine, Feiertage und gesonderte Bestätigung von Kollisionen |
| Aufgaben & Fristen | Aufgaben und Abgaben in Uni, Privat und Arbeit, mit Priorität, Datum und Projektbezug |
| Projekte | Projektkarten, Phasen, Unterpunkte, Checkpoints, Fortschritt, Archiv und Wiederherstellung |
| News | Briefing mit Wirtschaft, Technik, Politik, Aktien, Regional (nach Wohnort) und Sport: 3 bis 5 Meldungen je Kachel, aufklappbar, mit Link zur Quelle. Läuft im Hintergrund, bleibt bis zur nächsten Aktualisierung gespeichert und richtet sich nach deinen Themenwünschen |
| Posteingang | Relevante Nachrichten, per Klick nach Kategorie filterbar (falsche Zuordnung per Stift korrigierbar), gezielte Mail-Tiefenprüfung und Vorschläge für Folgeaktionen. Auf der Startseite stehen nur wichtige Nachrichten von echten Personen |
| Terminvorschläge | Aus Mails abgeleitete Termine, Fristen und Aufgaben als aufklappbare Liste unter dem Kalender |
| Bestellungstracker | Lieferungen, Retouren, Behalten und Rückerstattungen je Artikel. Behaltene Kleidung kann in den Kleiderschrank übernommen werden |
| Finanzen & Abos | Umschalter Finanzen/Depot (Depot: Positionen mit Kaufkurs, Suche, Screenshot-Erkennung, Kursaktualisierung, Kreisdiagramm nach Branche, Verlaufs-Chart, Schlagzeilen und Ausblick zu den Positionen; ohne Positionen bleiben alle Bereiche mit „Noch keine Infos“ sichtbar), Sparplan als monatliche Rate (zählt wie Fixkosten), Monatsübersicht mit festem Einkommen als Grundlage, Zahlungsliste zum Zuordnen, vereinheitlichte Ausgabenkategorien, Abo-Vorschläge, PayPal-Absender und -Empfänger sowie Abgleich doppelter Buchungsvorschläge |
| Urlaubsplaner | Vorschau für Städte und Inseln, Reisezeiträume, Buchungen, Vorbereitung und Packlisten, Orte-Export für Google My Maps (CSV, ZIP, KML) und Outfit-Vorschlag während der Reise |
| Outfit-Assistent | Styling, Kleiderschrank, Produktlink- und Fotoimport, Looks (auch im Bereich „Urlaub“), Urlaubsgarderobe, Verkauf und Parfüm; Sportkleidung wird nur für Training vorgeschlagen |
| Vorrat & Einkauf | Vorratsverwaltung, kategorisierte Einkaufsliste mit Schnellsuche (über 400 Artikel, auch Zutaten eigener Rezepte), Belegscan, Rezeptideen und eigene Rezepte. Mengen lassen sich mit Zahl und Einheit (Stück, g, kg, ml, l, EL, TL …) bearbeiten und rechnen sich bei anderer Portionszahl um. Jedes Produkt hat eine feste ID, daher stimmen Vorrat, Einkaufsliste und Rezeptstatus überein |
| Profil | Anzeigename, Wohnort, Geburtstag, Körpergröße, Studium, Beruf und Stellenbezeichnung sowie Interessen zum Anklicken nach Kategorien (Sport, Musik, Essen, Reisen, Gaming …), Ernährung, Allergien, Haushalt, Tagesrhythmus, Verkehrsmittel und Sprachen. Alle Angaben sind freiwillig, bleiben lokal und fließen in Outfit- und Reisevorschläge ein |
| Bewerbungen | Bewerbungsstatus, Verlauf, Gespräche und passende Vorschläge aus E-Mails |

[Alle Skills und ihre Verknüpfungen](docs/SKILLS.md)

### Was Pilot im Chat verknüpft

Pilot kennt ein kompaktes Verzeichnis deiner Daten und ordnet jede Nachricht dem passenden Bereich zu. Mehrere Anliegen in einer Nachricht werden getrennt vorgeschlagen und einzeln von dir bestätigt. Jeder Bereich ist mit den anderen verknüpft:

| Du schreibst … | Pilot bereitet vor … | Verknüpft mit |
| --- | --- | --- |
| „Zahnarzt am 3.12. um 10 Uhr“ | Kalendertermin mit Dauer, Kollisionsprüfung | Aufgaben, Freie Zeit, Projekte |
| „Jeden Dienstag 18 Uhr Volleyball“ | Terminserie mit Feiertagsausnahmen | Kalender, Freie Zeit |
| „Morgen präsentieren“, „Abgabe am 15.“ | Aufgabe mit Frist, optional mit Termin oder Projekt verlinkt | Kalender, Projekte, Frist-Wächter |
| „Wann habe ich diese Woche 2 Stunden?“ | Freie Zeitfenster aus Kalender und Fristen | Kalender, Aufgaben |
| „Füg der Bachelorarbeit den Schritt Literatur hinzu“ | Projektschritt mit Phase, Frist und Zeitblöcken | Aufgaben, Kalender |
| „12 € fürs Kino“, „Netflix kostet 13 €“ | Buchung oder Abo, Monatsübersicht, Abgleich doppelter Buchungen | Finanzen, PayPal, Posteingang |
| „Setz Milch auf die Liste“, „Eier sind leer“ | Einkaufsliste und Vorrat | Rezepte, Belegscan |
| „Was koche ich mit meinem Vorrat?“ | Rezeptideen mit Fleisch, vegetarisch oder Zutatenwunsch; fehlende Zutaten auf die Liste | Vorrat, Einkauf |
| „Was ziehe ich zum Vorstellungsgespräch an?“ | Outfit aus dem Kleiderschrank mit Basisschicht, Farbpalette und Duft | Bewerbungen, Kalender, Urlaubsgarderobe |
| „Plan 4 Tage Lissabon im März“ | Reisevorschau, Zeitraum, Packliste, Garderobe | Kalender, Outfit, Finanzen |
| „Ich habe mich bei Bosch beworben“ | Bewerbungsstatus, Gespräch als Termin | Posteingang, Outfit, Aufgaben |
| „Die Jeans schicke ich zurück“ | Entscheidung je Artikel (behalten, Retoure), Kleiderschrank | Bestellungen, Posteingang, Finanzen |
| „Schau in meine Mails“ | Relevante Nachrichten mit Vorschlägen für Termine, Fristen, Bestellungen | Posteingang, Kalender, Aufgaben |
| „Was steht als Nächstes an?“ | Antwort aus deinem Verzeichnis (Termine, Projektschritte, Abos) | alle Bereiche |

**Rückfragen mit Kurzantworten.** Fehlt eine Angabe, stellt Pilot genau eine gezielte Frage und zeigt dazu anklickbare Antworten, etwa „Bis 16 Uhr“, „Bis 17 Uhr“ oder „Ja“ und „Nein“. „Etwas anderes …“ ist immer dabei und führt in das Eingabefeld. Ein Klick sendet die Antwort wie eine getippte Nachricht. Beginnt die Antwort ein neues Anliegen, bearbeitet Pilot es neu und übernimmt nichts aus der offenen Frage. Die Kurzantworten sind reiner Text, werden lokal geprüft und lösen nichts aus, was du nicht auch tippen könntest.

## Versionsübersicht

LifePilot begann mit einem lokalen Kern und wurde anhand konkreter Abläufe gemeinsam mit KI-Assistenten weiterentwickelt. Für die frühen Etappen geben die Versionsbereiche die Reihenfolge an, ab dem öffentlichen Release sind die Tage datiert. Wie die Zusammenarbeit ablief, beschreibt der [Entwicklungsverlauf](docs/ENTWICKLUNG.md).

| Version | Was dazukam und wie wir es aufgebaut haben |
| --- | --- |
| **0.1–0.3** | Der lokale Hub und SQLite bilden die gemeinsame Basis für Browser und CLI. Darauf entstanden Aufgaben, Fristen, Erinnerungen und bestätigungspflichtige Vorschläge. |
| **0.4–0.8** | Aus den ersten Aufgaben und Terminen wurde eine Wochenplanung. Danach kamen bearbeitbare Einträge, getrennte Google-Anbindungen, Bewerbungen und der persönliche Pilot-Chat hinzu. |
| **0.9–0.13** | Outfit und Reisen bekamen eigene Ansichten. Der Kleiderschrank erhielt Bild- und Linkimport, der Posteingang Gmail-Labels und eine Auswahl relevanter Nachrichten. Mikrofon und Anhänge erweiterten den Chat. |
| **0.14–0.19** | Finanzen, Abos, Vorrat und Einkaufen wurden eigene Bereiche. Bestellungen und Retouren kamen dazu, gefolgt von Reisevorbereitung, lokaler Fotoverarbeitung und Diktat. |
| **0.20–0.24** | Wir vereinfachten typische Eingaben mit Reisevorschau und Produktlink-Import. Navigation und Pilot-Chat bekamen feste Plätze. Gmail-Kategorien, Finanzvorschläge und getrennte Profilbereiche für Studium und Beruf ergänzten die App. |
| **0.25.0–0.25.3** | Retouren wanderten aus dem Posteingang in den Bestellungstracker. PayPal-Vorschläge erhielten Gegenpartei und Verwendungszweck. Lange Reiseanfragen wie der Teneriffa-Test wurden zum Anlass, Details über mehrere Rückfragen hinweg zu erhalten. |
| **0.25.4–0.25.6** | Eine gebuchte Veranstaltung kann einen Termin und einen Ausgabenvorschlag erzeugen. Passende Zahlungsbelege werden abgeglichen. Die Mailanalyse wurde für Bestellungen, wiederkehrende Abbuchungen und weitergeleitete Uni-Nachrichten erweitert. |
| **0.25.7–0.25.12** | Werkstudenten-Pläne und Vorlesungen führten zu Kalenderserien mit Feiertagen und zweiter Bestätigung bei Überschneidungen. Neue Datumsangaben im Chat erhielten Vorrang vor früheren Vorschlägen. Projekte bekamen Phasen und Checkpoints. Verknüpfte Fristen erscheinen im eigenen Aufgabenboard. |
| **0.25.13–0.25.16** | Wir überarbeiteten die Übersichten anhand der App-Ansichten. Einkauf wurde nach Kategorien gegliedert, Vorratsaktionen neu ausgerichtet und das Reiseformular um Ortssuche und auswählbare Interessen ergänzt. |
| **1.0 · 24. November 2026** | Die öffentliche Ausgabe bündelt die Module mit einer Anleitung, der Screenshot-Galerie und detaillierten Skills. Die Sicherheitsprüfung führte zur Google-Kontobindung für Kalenderschreibzugriffe, zur Signaturprüfung privater Releases und zur Umstellung der modellgestützten Bildanalyse auf Codex CLI. |
| **1.0.1–1.0.10 · 24./25. November 2026** | Kleiderschrank mit Kategorien, Verkaufskarten und Urlaubsgarderobe, lokale Freigabe des privaten Chats, Rezepte mit Portionen und Mengenabgleich, kompaktere Reiseformulare. |
| **1.0.11–1.0.35 · 25. November 2026** | Zahlungs- und Erstattungserkennung aus Mails (Händler, Apple, Fahrdienste), Bestellungstracker für Amazon und weitere Shops, paralleler Reiseguide mit Währungsrechner, Vorrat mit Einheiten, Outfit mit Farbpalette, Projekte nach Frist, aufgeräumte Bearbeitung von Terminen. |
| **1.0.36–1.0.42 · 25./26. November 2026** | Agent mit Verzeichnis aller Bereiche, Zerlegung langer und diktierter Nachrichten, Entscheidungstabelle der Skills, Bestellungen und Bewerbungen im Chat, umschaltbarer Modellanbieter (Codex oder Claude Code), Testsatz mit 48 Beispielsätzen. |
| **1.0.43–1.0.52 · 26. November 2026** | Sicherheitsprüfung des Gesamtprojekts, Kalender ohne Doppeleinträge, Rezeptauswahl und Zutatenabgleich, Bestellmails mit Warenkorb-Blöcken, Outfits passend zum Anlass, Terminvorschläge aus Mails. |
| **1.0.53–1.0.57 · 26. November 2026** | Tiefere Mailprüfung per Modell, Löschen von Mails mit Bestätigung, Wetterfragen am Standort, wichtige Mails der letzten sieben Tage, schonender Mailabruf. |
| **1.0.58–1.0.88 · 26./27. November 2026** | Weitergeleitete Kurs-Mails als Terminvorschlag, Sicherheitsaudit mit lokalem Prüfbefehl und Bereinigung privater Daten. Pilot versteht Themenwechsel mitten in einer Rückfrage und bietet Kurzantworten zum Anklicken an. Die Finanzen bekamen ein festes Einkommen als Grundlage, eine Zahlungsliste und eine gekürzte, einheitliche Kategorienliste; behaltene Bestellartikel werden automatisch gebucht. |
| **1.1.0–1.2.1 · 27. November 2026** | Urlaubsplaner: Export der Reiseorte für Google My Maps (CSV, ZIP, KML) mit sichtbarer Auswahl, Outfit-Vorschlag während der Reise mit eigenem Bereich „Urlaub“ bei den Looks. |
| **1.4.0–1.5.1 · 28. November 2026** | Sparplan in den Finanz-Einstellungen (Monatsbetrag, zählt wie Fixkosten). Neues Depot: Positionen mit Kaufkurs, Suche, Screenshot-Erkennung, Kursaktualisierung, Branchen-Kreisdiagramm und Verlaufs-Chart. Außerdem Bewerbung löschen und Kartenexport im Aktionen-Menü. 1.5.1: Schlagzeilen und Ausblick zum Depot, Aktien-Kachel in den News aus den Depotwerten, Rezepte mit Mengen-Editor und Produkt-IDs, größere Schnellsuche, überarbeitetes Profil mit Interessen zum Anklicken. |
| **1.3.0–1.3.6 · 27./28. November 2026** | Neuer Bereich „News“ mit sechs Kacheln, Hintergrund-Auftrag mit Websuche, Einstellungen für Themenwünsche und aktualisierter Screenshot-Galerie. Im Claude-Modus wird die Websuche nun korrekt freigegeben. |

[Entwicklungsverlauf](docs/ENTWICKLUNG.md)

## Technik

Das React-Frontend und der CLI-Adapter greifen auf denselben Node.js-Hub zu. SQLite speichert Daten je Profil. Die Laufzeit prüft Agentenantworten gegen ein Schema und übernimmt bestätigte Änderungen. Mit **./bin/lifepilot help** findest du die Terminalaktionen. [Hub](hub) · [Agenten und Tests](agents)

Der öffentliche Git-Verlauf beginnt mit einem bereinigten Import. Dieser Release erteilt keine zusätzliche Open-Source-Lizenz.
