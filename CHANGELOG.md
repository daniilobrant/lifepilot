# Versionsverlauf

Die Entwicklungsetappen stammen aus lokalen Versionsnotizen. Für frühe Stände dient die Versionsnummer als zeitliche Einordnung. Der öffentliche Git-Verlauf beginnt mit dem bereinigten Import.

## v1.3.3 · 27. November 2026

- News-Briefing: eigenes Zeitbudget von 290 Sekunden (bisher 170, ein Lauf dauerte bis zu 170 Sekunden), höchstens 10 Suchanfragen. Andere Suchaufträge (Abo-Prüfung) behalten 170 Sekunden.

## v1.3.2 · 27. November 2026

- News-Briefing im Claude-Modus: Schrittlimit für Aufträge mit Websuche von 12 auf 30 erhöht, der Auftrag begrenzt die Zahl der Suchanfragen selbst. Erreicht eine Suche das Limit, nennt die Fehlermeldung jetzt den Grund.

## v1.3.1 · 27. November 2026

- Behoben: Im Claude-Modus wurde die Websuche nie freigegeben, weil die Erkennung der CLI-Optionen `--allowedTools` übersah. Dadurch lieferten News-Briefing und Abo-Prüfung nur leere Ergebnisse („unvollständig“). Die Erkennung berücksichtigt jetzt Großbuchstaben; ein Test sichert das ab.

## v1.3.0 · 27. November 2026

- Neuer Bereich „News“ (Übersicht): ein Klick auf „News aktualisieren“ startet einen Pilot-Auftrag mit Websuche, der je Kategorie drei bis fünf aktuelle Meldungen sammelt. Der Auftrag läuft im Hintergrund weiter, während man andere Bereiche öffnet, und das fertige Briefing wird lokal gespeichert.
- Sechs Kategorien im 3×2-Raster: Wirtschaft, Technik, Politik, Aktien & Depot, Regional, Sport. Schlagzeilen lassen sich aufklappen (Einordnung in eigenen Worten), jede Meldung hat einen Link zur Originalquelle.
- Regional richtet sich nach dem Wohnort im Profil (Ort, nahe Großstadt, Landkreis, Bundesland).
- „Einstellungen“ im News-Bereich: kleiner Fragebogen je Kategorie mit Kästchen (z. B. Sportarten, Themenfelder), „Allgemeiner Überblick“ und einem Freitext für Vereine, Werte oder Begriffe. Die Auswahl fließt in den Auftrag ein.
- Sicherheit: zweite Websuche-Ausnahme neben der Abo-Prüfung, nur nach Klick, nur ein Auftrag gleichzeitig, nur Wohnort und Themenwünsche werden übermittelt, Antwort wird gegen ein Schema geprüft (nur https-Links). Details in docs/SICHERHEIT.md.
- Datenbank: Migration 043 (`news_briefing`, `news_preferences`).

## v1.2.1 · 27. November 2026

- Outfit-Vorschlag im Urlaub: kurze Anlassbezeichnung („Urlaubstag in Lissabon“ bzw. der erste Satzteil der Aktivität), damit Looktitel und Anlasserkennung lesbar bleiben.

## v1.2.0 · 27. November 2026

- Urlaubsplaner: Neue Aktion „Outfit-Vorschlag abrufen“ im Menü „Aktionen“. Sie ist ab einem Tag vor der Abreise bis zum Reiseende verfügbar. Man wählt das Datum und entweder „Für den ganzen Tag“ oder eine einzelne Aktivität. LifePilot stellt aus dem Kleiderschrank (bei einer Packauswahl der Reise daraus) passend zu Programm und Wetter am Reiseziel einen Look zusammen und öffnet ihn im Styling-Studio. „Variante neu würfeln“ funktioniert dort wie gewohnt.
- Gespeicherte Looks, die zu einer Reise gehören, erscheinen in „Meine Looks“ im eigenen Bereich „Urlaub“ und tragen im Studio ein Etikett mit dem Reiseziel.
- Kartenexport: Ausgewählte Orte sind grün umrandet und leicht hinterlegt, abgewählte treten zurück.

## v1.1.2 · 27. November 2026

- Urlaubsplaner-Export: Google My Maps lehnte die CSV ab („Spaltennamen … nicht zulässig“). Ursache war ein Anführungszeichen direkt hinter dem BOM der Kopfzeile. Die Kopfzeile steht jetzt ohne Anführungszeichen, Zellen werden nur bei Bedarf gequotet, und die von My Maps verbotenen Zeichen " < > { } | werden aus Zelltexten entfernt.

## v1.1.1 · 27. November 2026

- Urlaubsplaner-Export: Ortsname vor Beschreibungstext, mehr portugiesische, spanische und italienische Ortsbegriffe, breitere Kategorieauswahl.

## v1.1.0 · 27. November 2026

- Urlaubsplaner: Neuer Export „Für Google My Maps exportieren“ in der Reiseansicht. LifePilot sammelt die Orte der Reise (Tagespunkte mit Ort, Sehenswürdigkeiten-Tipps, Aktivitätsbuchungen, Unterkunft) und ordnet sie Kategorien zu: 👁️ Sehenswürdigkeiten, 🍴 Restaurants, ☕ Cafés, 🍸 Bars, 🏠 Unterkunft, 💃 Clubs sowie Strände, Natur, Shopping, Aktivitäten und Sonstiges. Der Ortsname entscheidet zuerst über die Kategorie, erst dann der Beschreibungstext; Unsichere Zuordnungen sind markiert.
- Auswahl: Kategorie-Filter, einzelne Orte an- und abwählen, Kategorie ändern, Orte entfernen oder selbst hinzufügen. Die Auswahl wird pro Reise lokal gespeichert (neue Tabelle `trip_maps`, Schema 42).
- Ausgabe: eine CSV-Datei (UTF-8 mit BOM, Schutz vor Formeln), ZIP mit einer CSV je Kategorie oder KML mit Ordnern. Kartenname mit Landesflagge und Kopieren-Knopf, Link zu Google My Maps und Kurzanleitung. Die Unterkunftsadresse wird nur nach ausdrücklicher Freigabe exportiert. Es werden keine Koordinaten erfunden und keine Google-Maps-API genutzt.

## v1.0.88 · 27. November 2026

- Finanzen & Abos: Eine gemeinsame, gekürzte Kategorienliste für Formular und Verteilung: Wohnen & Haushalt, Lebensmittel & Einkauf, Essen & Trinken, Transport & Mobilität, Shopping, Gesundheit & Pflege, Bildung & Arbeit, Versicherung & Verwaltung, Abos, Freunde & Familie, Sonstiges (immer zuletzt). Doppelungen wie „Mobilität“, „Lebensmittel“, „Freizeit & Kultur“ und „Freizeit & Abos“ entfallen; bestehende Einträge werden automatisch der passenden neuen Kategorie zugeordnet.

## v1.0.87 · 26. November 2026

- Bestellungen: Wer ein Teil behält, bekommt die Ausgabe automatisch in Finanzen eingetragen (Summe der behaltenen Teile, wächst mit jedem weiteren behaltenen Teil). Der Gesamtbetrag steht bei adidas unter „Gesamt“ und wird jetzt erkannt.
- Kleiderschrank: Sportkleidung (Trikot, Training, Laufen, Fußball, Yoga …) wird als „Sport · Freizeit“ eingeordnet statt als „Alltag · Uni“ und kommt in Looks nur bei Sportanlässen oder als gewähltes Ankerteil vor, nie bei Uni, Büro, Alltag oder Ausgehen.

## v1.0.86 · 26. November 2026

- Finanzen & Abos: Beim Klick auf „Zuordnen“ oder „Nicht beachten“ bleibt die Seite an ihrer Stelle. Die Zeile hält ihre Bildschirmposition, auch wenn darüber Summen und Listen nachladen.

## v1.0.85 · 26. November 2026

- Finanzen & Abos: Die Liste „Zahlungen aus Mails“ zeigt nur Zahlungen des gewählten Monats und wechselt mit der Monatsauswahl.
- Die getroffene Entscheidung ist dunkelgrün hinterlegt: „Zuordnen“ oder „Nicht beachten“. Offene Zahlungen haben keine der beiden Schaltflächen markiert.

## v1.0.84 · 26. November 2026

- Finanzen & Abos: Die Übersicht folgt jetzt der Reihenfolge Festes Einkommen (Gehalt), danach Fixkosten und Abos als Spielraum, danach zugeordnete variable Einnahmen und Ausgaben als Monatssaldo.
- Finanzen & Abos: Neue Liste „Zahlungen aus Mails“ mit allen erkannten Zahlungen (PayPal, Karte, Bestellungen, Erstattungen), Einnahme oder Ausgabe automatisch erkannt. Pro Eintrag zwei Aktionen: „Zuordnen“ übernimmt ihn in die variablen Einnahmen oder Ausgaben, „Nicht beachten“ lässt ihn nur in der Liste stehen. Beides ist umkehrbar. Nur Abos bleiben als Finanzvorschläge bestehen.
- Sechsmonatsvergleich ruhiger: mehr Abstand zu den Achsenbeschriftungen, dünnere Linien, keine Punkte in Monaten ohne Buchungen. Karten, Überschriften und Schaltflächen haben einheitliche Höhe und Rundung.

## v1.0.83 · 26. November 2026

- Posteingang: Der Stift zum Ändern der Kategorie steht ganz rechts unter dem Datum, ohne weitere Beschriftung. Er klappt die Mail auf und zeigt „Bereich ändern“; ein zweiter Stift steht beim Feld „Bereich“. Fehler beim Speichern erscheinen direkt in der Mail.
- Posteingang: „Antwort erbeten“ steht nicht mehr in der Kopfzeile, sondern als Hinweis in den Details.

## v1.0.82 · 26. November 2026

- Pilot: Relative Datumsangaben werden zentral aufgelöst ([relative-dates.ts](hub/runtime/relative-dates.ts)): „nächsten Dienstag“, „nächste Woche Mittwoch“, „in zwei Wochen“, „nächstes Wochenende“, „Anfang/Mitte/Ende des Monats“, „nächsten Monat“, „Ende des Jahres“, „Neujahr“. Der Serien-Handler nutzt sie für „ab …“ und „bis …“, das Modell bekommt sie als aufgelöste Daten in der Vorzerlegung.
- Pilot: Prompt-Regel 11 beschreibt diese Signalwörter, Einzeltermine und „bis 0 Uhr“ (= 23:59). Neue Live-Fälle `datum-*` (5).
- Tests: Auflösung der Datumsangaben, Serien in einer Nachricht, gespeicherte Mail-Kategorien.

## v1.0.81 · 26. November 2026

- Posteingang: Jede Mail hat einen kleinen Stift. Damit wählst du eine andere Kategorie, falls eine Mail falsch zugeordnet wurde; die Wahl wird lokal gespeichert (neue Tabelle `mail_label_overrides`, Datenbankversion 41).
- Posteingang: Einkäufe, Versand und Retouren bilden eine Kategorie „Einkäufe“. Die Kategorie-Chips stehen in einer Zeile.
- Mail-Prüfung: Der Prompt unterscheidet jetzt Termine, Fristen, wichtige Informationen und Irrelevantes und berücksichtigt auch Mails, die nur informieren. Mails mit Termin oder Frist erscheinen zusätzlich unter „Wichtige Nachrichten“ auf der Startseite, auch aus „Zu prüfen“.
- Pilot: „morgen bis Ende des Jahres“ und „bis Ende des Jahres“ werden direkt erkannt. Ein einzelner Tag („morgen um 20 Uhr treffen“) wird nach einer früheren Serienfrage nicht mehr als Serie gedeutet.
- Oberfläche: Der Termin-Editor schließt nach „Speichern“ (und nach „Erledigt“ oder „Archivieren“) automatisch.

## v1.0.80 · 26. November 2026

- Startseite: Terminvorschläge, Fristen und Aufgabenvorschläge stehen wieder unter „Wartet auf dein OK“.
- Oberfläche: Alle Freigabe-Karten dort (Terminvorschläge, Finanzen, Bestellungen, Bewerbungen, Projektmails) nutzen dieselbe kompakte Schrift, Abstände und Buttons. Die Spalte wird nicht mehr abgeschnitten.

## v1.0.79 · 26. November 2026

- Oberfläche: „Mailvorschläge“ heißen jetzt „Terminvorschläge“ und stehen als aufklappbare Liste unter dem Kalender (wie Finanzen & Abos). Von der Startseite entfallen Block und Link „Mailvorschläge öffnen“.
- Oberfläche: Vorschläge sind ruhige Karten wie bei Bestellungen (Titel, eine Zeile mit Thema, Datum und Zeitvorschlag, Beleg unter „Details“). „In Kalender übernehmen“ und „Ablehnen“ stehen gleich groß nebeneinander; Schrift und Buttons sind kompakter.
- Startseite: „Wichtige Nachrichten“ zeigt nur noch Mails von echten Personen. Automatische Absender (no-reply, PayPal, Shops, Versanddienste), Transaktions- und Finanzmails sowie Bestell- und Versandmails bleiben dort draußen.
- Posteingang: Die Kategorien stehen oben als anklickbare Icon-Chips mit Anzahl (kein Dropdown). Ein Klick zeigt nur diese Kategorie, ein zweiter Klick oder „Alle“ hebt den Filter auf.
- Meldungen: „Mailvorschlag“ heißt in Fehlermeldungen „Terminvorschlag“.

## v1.0.78 · 26. November 2026

- Pilot: Nachrichten mit neuem Thema während einer offenen Rückfrage (z. B. Rezept nach einer Terminfrage) werden neu bearbeitet, statt die alte Frage zu wiederholen. Die Serien-Rückfrage nimmt Antworten wie „15 Uhr“ oder „Bis 16:30 Uhr“ an und fragt nur nach der fehlenden Angabe.
- Pilot: Rückfragen enthalten anklickbare Kurzantworten (`choices`, höchstens vier, nur Text, lokal geprüft). Ein Klick sendet die Antwort wie eine getippte Nachricht; „Etwas anderes …“ fokussiert das Eingabefeld.
- Pilot: Verwirft die lokale Prüfung einen Entwurf, erhält das Modell den Fehler einmal zurück (ein zusätzlicher Aufruf nur im Fehlerfall). Zu lange oder mehrzeilige Zusammenfassungen werden gekürzt statt verworfen.
- Tests: 11 Dialogfälle und 5 Unit-Tests ergänzt. README beschreibt alle Verknüpfungen des Pilot-Chats.

## v1.0.77 · 26. November 2026

- Dokumentation: Der Changelog ist wieder im Repository und wird weitergeführt. Er ist bewusst nicht im README verlinkt. Mit 1.0.76 war er kurz entfernt, der Entwicklungsverlauf bleibt unverändert.

## v1.0.76 · 26. November 2026

- Dokumentation: Verweise auf den Changelog aus README und Entwicklungsverlauf entfernt; die Datei selbst wurde kurzzeitig gelöscht.

## v1.0.75 · 26. November 2026

- Dokumentation: Die Screenshot-Galerie in README und docs/SCREENSHOTS.md wurde vollständig neu aufgenommen, mit durchgehend fiktiven Daten. Neu sind der Pilot-Chat mit einer Mehrfachanfrage, die Abo-Prüfung mit Tarifalternative, Mailvorschläge, Bewerbungsvorschlag, Reiseplan mit Checkliste und Packliste sowie ein Styling-Ergebnis. Keine Änderung am Programmcode.

## v1.0.74 · 26. November 2026

- Bewerbungen: In Mails erkannte Bewerbungen erscheinen als aufklappbarer Bereich „Bewerbungen“ mit Zähler unter „Wartet auf dein OK“ auf der Startseite und als „Bewerbungsvorschläge aus Mails“ im Bereich Bewerbungen. Eindeutige Vorschläge lassen sich mit „Passt“ bestätigen, sonst mit „Prüfen“ einzeln anpassen oder mit „Ablehnen“ verwerfen.

## v1.0.73 · 26. November 2026

- Abo-Prüfung: Auch mit Claude als Modell ist nur noch die Websuche erlaubt, kein Seitenabruf. Damit kann der Aufruf keine Abo-Daten an beliebige Adressen senden. Codex war bereits auf die Suche beschränkt.

## v1.0.72 · 26. November 2026

- Abo-Prüfung: Während der Suche steht in der Karte nur noch „Pilot sucht nach alternativen Tarifen …“.

## v1.0.71 · 26. November 2026

- Reisen: Die Reisevorschau hat jetzt einen Button „Abbrechen“, der die entworfene Reise verwirft. Nur er löscht den Entwurf. „Neue Reise“ öffnet einen vorhandenen Entwurf wieder, statt ihn zu ersetzen.

## v1.0.70 · 26. November 2026

- Abo-Prüfung: Die Suche läuft im Hintergrund. Der Ladebalken steht nur in der Abo-Karte, die App bleibt bedienbar und die Suche läuft beim Wechsel des Bereichs weiter. Das Ergebnis erscheint kompakt und aufklappbar in der Karte statt als Fenster. Behoben: Die Anfrage brach nach 7 Sekunden mit „Fetch is aborted“ ab, jetzt gelten 180 Sekunden.

## v1.0.69 · 26. November 2026

- Abo-Prüfung: Live mit der Websuche getestet (drei Abos, ca. eine Minute). Markdown-Links und Adressen im Fließtext der Antwort werden entfernt, Links stehen nur noch als geprüfte Schaltflächen bei den Alternativen.

## v1.0.68 · 26. November 2026

- Auslieferung: Die Oberfläche der Versionen 1.0.65 bis 1.0.67 (Abo-Button, Reisekästchen, Abo-Prüfung mit Übersichtsfenster) wurde nicht mit ausgeliefert. 1.0.68 enthält sie.

## v1.0.67 · 26. November 2026

- Finanzen: „Abos & Alternativen prüfen“ startet einen Suchauftrag mit Websuche (einzige Ausnahme der gesperrten Websuche, in SICHERHEIT.md dokumentiert). Ein Übersichtsfenster zeigt je Abo die Empfehlung (kündigen, wechseln, behalten), Alternativen mit Preis, Vor- und Nachteilen, Jahresersparnis und Link. Fitnessstudios werden im Wohnort aus dem Profil gesucht. Die Zahlen rechnet LifePilot selbst, es wird nichts gekündigt oder gebucht.

## v1.0.66 · 26. November 2026

- Reisen: In der Reisevorschau zeigen Checkliste und Packliste jetzt dieselben Kästchen wie bei gespeicherten Reisen (in der Vorschau deaktiviert, abhakbar nach dem Speichern). Das Layout ist damit in beiden Ansichten gleich.

## v1.0.65 · 26. November 2026

- Finanzen: Der Button „Abos & Alternativen prüfen“ steht jetzt direkt neben „+ Abo“ in der Kopfzeile des Abo-Bereichs und passt zu dessen Gestaltung. Die automatische Prüfung folgt später.

## v1.0.64 · 26. November 2026

- Terminvorschläge aus Mails: Englische Uhrzeiten mit am und pm werden richtig umgerechnet (1 pm wird 13:00, 12 am wird 00:00), auch bei der Modellprüfung.

## v1.0.63 · 26. November 2026

- Posteingang: Die grüne Markierung wichtiger Mails verschwindet, sobald die Mail einmal aufgeklappt wurde. Der Zustand bleibt im Browser gespeichert.

## v1.0.62 · 26. November 2026

- Posteingang: Absender erscheint einmal als Name, bei weitergeleiteten Mails zusätzlich der ursprüngliche Absender und das weiterleitende Konto. Textauszug ohne Platzhalter, aufgeräumte Fußzeile mit Löschen.

## v1.0.61 · 26. November 2026

- Posteingang: Mails unter „Wichtig für dich“ lassen sich aufklappen und zeigen Grund, Textauszug, Absender, Eingang und Bereich. Löschen steht im aufgeklappten Bereich.

## v1.0.60 · 26. November 2026

- Posteingang: Weitergeleitete Mails vom Studierendenkonto der HfWU werden wie Hochschulmails erkannt. Anmeldefristen und Terminänderungen erscheinen unter „Wichtig für dich“, Einladungen zu Veranstaltungen und Zustellfehler nicht.
- Die tiefere Mailprüfung per Modell bewertet weitergeleitete Hochschulmails, die die Regeln nicht als wichtig einstufen. Als wichtig eingestufte Mails erscheinen im Posteingang.

## v1.0.59 · 26. November 2026

- Sicherheitsaudit: Prüfung mit npm audit, Semgrep und Mustersuche nach privaten Daten und Geheimnissen, [Bericht](SECURITY_REPORT.md). Lokaler Befehl `npm run security:check`.
- Testdaten ohne echte Namen, Matrikelnummern oder Kontobezeichnungen. Git-Verlauf bereinigt: nur noch GitHub-Noreply-Adressen als Autor, Gitleaks ohne Funde.
- Entwicklungsverlauf als eigenes Dokument, Versionsübersicht in der README aktualisiert.

## v1.0.58 · 26. November 2026

- Posteingang: Weitergeleitete Kurs-Mails (Stud.IP/HfWU) mit englischem Ablauf („today’s presentation, 12:00“) werden als Terminvorschlag erkannt, mit Kursname, Uhrzeit und Zoom-Hinweis.

## v1.0.57 · 26. November 2026

- Posteingang: weniger parallele Mailabrufe, bereits geladene Nachrichtendaten werden wiederverwendet, Teilergebnisse bleiben bei Ausfall erhalten.

## v1.0.56 · 26. November 2026

- Posteingang: „Wichtig für dich“ zeigt die wichtigen Mails der letzten sieben Tage.

## v1.0.55 · 26. November 2026

- Pilot beantwortet Fragen zum Wetter am Standort.

## v1.0.54 · 26. November 2026

- Posteingang: Mails lassen sich nach doppelter Bestätigung in den Gmail-Papierkorb verschieben.

## v1.0.53 · 26. November 2026

- Posteingang: Der Knopf „Mails aktualisieren“ führt über das gewählte Modell eine tiefere Prüfung aus und liest dabei auch Bestellungen und deren Status.

## v1.0.52 · 26. November 2026

- Start: Mailvorschläge unter „Wartet auf dein OK“ sind wie die Finanzvorschläge aufklappbar mit Zähler.

## v1.0.51 · 26. November 2026

- Posteingang: Persönliche Terminmails („heute Meeting um 15 Uhr auf Teams“) erscheinen als Terminvorschlag unter „Wartet auf dein OK“ und als wichtige Nachricht.
- Unklare Mails prüft das Modell einmalig (höchstens 5 pro Abruf): Termin, Frist, wichtig oder irrelevant.

## v1.0.50 · 26. November 2026

- Styling-Studio: Looks bestehen nur aus Teilen, die zum genannten Anlass passen (Büro, Dinner, Ausgehen, Sport, Uni, Alltag); gibt es für eine Teilekategorie keine passenden, bleibt die ganze Auswahl.

## v1.0.49 · 26. November 2026

- Styling-Studio: Oberteile werden mit Blick auf passende Hosen, Jacken und Schuhe gewählt (Farbvorausschau), unruhige Paare wie Blau und Weinrot fallen heraus; mehr Abwechslung bei „Neu“; im Text genannte Farben und Anlässe (Vorstellungsgespräch, Hochzeit …) fließen in die Auswahl ein.

## v1.0.48 · 26. November 2026

- Bestellungstracker: Bestellmails mit Warenkorb-Blöcken (adidas) liefern Bestellnummer, Artikel mit Größe, Farbe, Preis und Bild sowie die voraussichtliche Lieferung; Trikots zählen als Oberteile. Ohne lesbare Angaben bleibt der Platzhalter.

## v1.0.47 · 26. November 2026

- Bestellungstracker: Bestätigungen ohne lesbare Bestellnummer und Artikel im Mailtext (adidas) erscheinen trotzdem unter „Bestellt“.

## v1.0.46 · 26. November 2026

- Rezeptideen: zehn weitere Rezepte, die Auswahl wechselt bei jeder Anfrage; gleichwertige Zutaten (Hähnchen/Hähnchenfleisch, Hackfleisch, Öle, Nudeln) werden nicht erneut auf die Einkaufsliste gesetzt.

## v1.0.45 · 26. November 2026

- Rezepte: Entfernen-Knopf direkt an jedem gespeicherten Rezept. Der Vorratsabgleich erkennt gleichwertige Zutaten (Nudelsorten, Speiseöle, Hackfleisch, passierte Tomaten/Passata).

## v1.0.44 · 26. November 2026

- Kalender: Eine Aufgabe mit Erinnerung zur Uhrzeit am Fristtag erscheint nur noch einmal (mit Uhrzeit) statt doppelt.

## v1.0.43 · 26. November 2026

- Sicherheit: Wechselkursabruf folgt keinen Weiterleitungen mehr.

## v1.0.42 · 26. November 2026

- Entscheidungstabelle: einmalige Erinnerung ohne Uhrzeit wird eine Aufgabe ohne Rückfrage.

## v1.0.41 · 26. November 2026

- Claude Code CLI vollständig angebunden und live geprüft; zu lange Zusammenfassungen werden gekürzt, Hinweise außerhalb des Kontexts verworfen statt die Antwort abzulehnen.
- Testsatz mit 48 Beispielsätzen (`npm run eval:chat`) für einzelne Skills, Kombinationen, Diktatfehler und Rückfragen; Vorzerlegung erkennt Liste, Einreichen, Einpacken und freie Zeit.
- README: Anleitung zur KI-Anbindung mit Codex oder Claude Code.
- Repository aufgeräumt: GitHub-Workflow, interne Berichte, Roadmap und Prüfskripte entfernt.

## v1.0.40 · 26. November 2026

- Claude-Adapter: Anmeldung im Schlüsselbund wird gefunden; das interne Antwortformat-Werkzeug der CLI ist erlaubt, alle anderen bleiben gesperrt.

## v1.0.39 · 26. November 2026

- Modellanbieter umschaltbar: Codex (Standard) oder Claude über die lokale Claude Code CLI, ohne Werkzeuge, mit gleicher Schemaprüfung; Auswahl in Einstellungen › Übersicht.

## v1.0.38 · 25. November 2026

- Pilot-Chat: Entscheidungstabelle (Signal → Skill) mit Ketten-Regeln; Outfit-Designer, Bewerbungsmanager und Kalenderplanung werden geladen, Mail-Erkennungsregeln nicht mehr.
- Neue Chat-Handlungen mit Freigabe: Bestellteil behalten, zurücksenden, Retoure abgegeben, angekommen; Bewerbung anlegen oder Status ändern, Vorstellungsgespräch wird als Termin eingetragen.
- Verschachtelte Speichervorgänge nutzen Savepoints.

## v1.0.37 · 25. November 2026

- Pilot-Chat: lokale Vorzerlegung langer und diktierter Nachrichten (Abschnitte nach Signalwörtern, Themen, aufgelöste Daten wie „morgen“ oder „am Freitag“); Regeln für Bezüge wie „dafür“ und Anliegen ohne eigenen Inhalt.

## v1.0.36 · 25. November 2026

- Pilot-Chat: kompaktes Verzeichnis aller Bereiche (Termine, Aufgaben, Projekte, Abos, Bestellungen, Bewerbungen, Reisen, Vorrat, Kleiderschrank) mit fehlertoleranter Trefferliste für Diktat- und Tippfehler.
- Neue Aufgaben können per link einem Termin oder Projekt zugeordnet werden; Erinnerung zur Terminzeit.
- Arbeitsanweisung für lange und diktierte Nachrichten: berichtigen, zerlegen, verknüpfen.

## v1.0.35 · 25. November 2026

- Aufgabeneditor: Aufgaben und Fristen lassen sich einem Kalendertermin zuordnen; Speichern, Erledigt und Archivieren stehen ganz unten; Verlauf entfernt.

## v1.0.34 · 25. November 2026

- Aufgaben: Abgaben, die eine Vorlesung oder einen Termin am selben Tag nennen, werden damit verknüpft und zur Startzeit erinnert; der Chat übernimmt den genauen Kursnamen.

## v1.0.33 · 25. November 2026

- Meine Looks: Look-Fotos werden ohne erneute Rückfrage per Codex analysiert (auf Wunsch, in SICHERHEIT.md vermerkt).

## v1.0.32 · 25. November 2026

- Start: „Wartet auf dein OK“ zeigt Bestellungen mit offener Entscheidung (Behalten/Zurücksenden, Retoure abgegeben, fällige Lieferung bestätigen).
- Skills: E-Mail-Manager führt in den Posteingang.

## v1.0.31 · 25. November 2026

- Finanzen: App-Store-Abos (Claude Pro, ChatGPT Plus) sowie Belege von Stripe, Uber, Uber Eats, Bolt, Airbnb, Läden und Post werden erkannt und vollständig gelesen; Ankündigungen und fällige Beiträge bleiben außen vor.
- Termin- und Aufgabeneditor: aufgeräumtes Raster, Aktionen unten, Zeitblöcke als Liste; „In Mac-Kalender eintragen“ entfernt.

## v1.0.30 · 25. November 2026

- Projekte: Schritte nach Frist sortiert (früheste oben), Frist rechtsbündig ohne „Checkpoint“, Stift zum Bearbeiten an jedem Schritt und am Projekt; im Editor nur noch ein Fristfeld.

## v1.0.29 · 25. November 2026

- Vorrat & Einkauf: nur noch die Einheiten Stück, g, kg, ml und l; EL, TL, Dose, Packung, Bund, Zehe und Scheibe werden in Rezepten und Vorrat umgerechnet.
- Artikel bearbeiten: kompakte Zeile ohne Notizfeld.
- Globale Suchleiste oben entfernt.

## v1.0.28 · 25. November 2026

- Kleiderschrank: Boxershorts mit „Shorts“ im Namen gelten als Unterwäsche; das Aufräumen erkennt Unterwäsche am Produktnamen.

## v1.0.27 · 25. November 2026

- Kleiderschrank: Unterwäsche und Socken aus Bestellungen landen nicht mehr im Kleiderschrank; die Kategorien sind entfernt, vorhandene Einträge werden aufgeräumt.
- Meine Looks: getrennte Bereiche „Vorgeschlagene Looks“ und „Eigene Looks“, Fotos überdecken den Text nicht mehr.

## v1.0.26 · 25. November 2026

- Sicherheitsprüfung: Paketrabatt ohne mehrdeutige Schreibweise, Semgrep prüft die Verkaufsregeln wieder vollständig.

## v1.0.25 · 25. November 2026

- Sicherheitsprüfung: Markenmuster ohne Apostroph, damit Semgrep die Verkaufsregeln vollständig prüfen kann.

## v1.0.24 · 25. November 2026

- Vorrat & Einkauf: Menge als Zahl mit Einheit (Stück, g, kg, ml, l, Packung, Dose, Flasche, Bund, Zehen, EL, TL), die Einheit passt sich dem Produkt an.
- Neue Kategorien Frische Kräuter, Konserven & Hülsenfrüchte, Backen & Süßen; Schinken, Salami und Wurst zählen zu Fleisch & Fisch. Rund 150 weitere Alltagsartikel in Suche und Schnellerfassung.
- Bestehende Vorräte und Einkaufsliste erhalten passende Kategorien und realistische Mengen.
- Chat-Rückfragen bieten Antwortknöpfe: zwei Möglichkeiten plus „Keins von beiden“ oder Ja/Nein.
- Freunde & Familie erfasst auch ältere PayPal-Zahlungen an Personen.

## v1.0.23 · 25. November 2026

- Finanzen: Zahlungen von und an Personen (PayPal „Freunde und Familie“) bekommen die Kategorie Freunde & Familie. Bestehende Einträge werden beim nächsten Mail-Abgleich umsortiert.
- Bewerbungen: Kein Zurück-Knopf und kein „Gmail prüfen“ mehr; „Bewerbung hinzufügen“ steht rechts neben der Suche. Aufgaben & Fristen: Hinzufügen nur noch in den Spalten.
- Meine Looks: Kacheln zeigen alle Teile als kleine Bilder, eigene Fotos mit Bildleiste, sauberer Innenabstand.
- Verkaufen: Preisklasse und Anzahl, „Verkaufspreis ermitteln“ nach festen Regeln, ausformulierter Anzeigentext. Verkaufte Teile lassen sich nur noch endgültig entfernen, das Foto wird im Kleiderschrank geändert.

## v1.0.22 · 25. November 2026

- Sicherheitsprüfung: Uniqlo-Farbbilder und Kleidungsvorlagen der Packliste kommen ohne aus Daten gebaute reguläre Ausdrücke aus. Die Semgrep-Prüfung in der Pull-Request-Pipeline läuft wieder durch.

## v1.0.21 · 25. November 2026

- Urlaubsplaner: Währungsrechner zwischen Euro und Landeswährung neben der Unterkunft, mit Tauschknopf und manuellem Aktualisieren (EZB-Referenzkurs, sonst Tageskurs).
- Tipps: Sicherheit nennt die Notrufnummer und Gegenden, die man meiden sollte; Gesundheit die Rettungsnummer mit Vorgehen und ob Leitungswasser trinkbar ist.
- Packliste: Kategorien sind aufgeklappt, Mengen mit Plus und Minus, keine Mengen bei Dokumenten oder Technik. Kleidung nach Dauer, Gepäck und Wetter (Hosen, Pullover, Übergangs-, Regen- oder Winterjacke, Schuhe, Badesachen) mit Vorschlägen aus dem Kleiderschrank. Mehrere Düfte aus der eigenen Sammlung.
- Eigene Punkte und Gegenstände werden über einklappbare, kompakte Formulare ergänzt.

## v1.0.20 · 25. November 2026

- Bestelltracker: Amazon-Bestellungen erkennen alle Artikel, auch bei Preisen mit einer Nachkommastelle und sehr langen Namen. Fehlende Artikel werden bei bestehenden Bestellungen nachgetragen.
- Technik und Gerätezubehör (etwa Laptophüllen, Ladegeräte) kommen nicht in den Kleiderschrank.
- Dieselbe Bestellung von verschiedenen Absendern eines Shops (etwa mail2.weekday.com und weekday.com) wird zusammengeführt, doppelt angelegte Kleiderschrankteile werden entfernt.
- Kleidung bekommt nur Bilder aus der Bestellmail, vom Produktlink oder aus einer Shop-Suche mit passender Farbe. Unsicher geratene Bilder werden entfernt.

## v1.0.19 · 25. November 2026

- Urlaubsplaner: Tipps und Tagesabschnitte (höchstens sechs Tage) entstehen parallel in kleinen Anfragen. Lange Reisen laufen so nicht mehr ins Zeitlimit.
- Ein unvollständiger Teil wird einmal neu angefragt, überzählige Tipps gekürzt und überlange Texte abgeschnitten statt den Guide zu verwerfen.
- Die Anweisungen decken beliebige Ziele ab: Großstadt, Region, Land, Insel oder kleiner Ort, mit Jahreszeit, Klima und Alltagssprache des Ziels.

## v1.0.18 · 25. November 2026

- Der Bestelltracker erkennt Amazon-Bestellungen („Bestellt:“, „Versendet:“, „Zugestellt:“) mit Artikeln, Menge, Preis und Produktbild aus der Mail.
- Jeder Bestellposten bekommt ein Bild, auch stornierte und Artikel, die keine Kleidung sind. Ohne Bild in der Mail sucht LifePilot über Produktname oder -nummer.
- Behalten oder zurückgeben gilt für alle Artikel. Nur Kleidung kommt in den Kleiderschrank.

## v1.0.17 · 25. November 2026

- Produktlinks von Uniqlo zeigen das Bild der Farbe aus dem Link. Die Farbauswahl im Dialog lädt das passende Farbbild.
- Gesperrte Shopseiten (etwa Zara, Bershka) suchen das Produktbild über die Bildersuche, nur mit Seite und Bild desselben Shops. Platzhalterbilder werden ignoriert.
- Ohne Produktbild bietet der Dialog an, ein eigenes Foto anzuhängen. Ein anderes Foto lässt sich jederzeit anhängen.
- Urlaubsgarderobe: Der Anlass ist ein Auswahlmenü mit typischen Urlaubsanlässen und einem eigenen Anlass.
- Der Löschdialog und die Kleidungskarten überlappen nicht mehr.

## v1.0.16 · 25. November 2026

- Finanzvorschläge erkennen Zahlungsbestätigungen von Händlern ohne PayPal, etwa „Zahlung erfolgreich“ von Buchungsportalen, Flugbuchungen und zweisprachige Parkbelege. Maßgeblich ist der bezahlte Gesamtbetrag.
- Meldet PayPal dieselbe Zahlung, entsteht nur ein Vorschlag. Angekündigte Abbuchungen und Beträge ohne Euro bleiben ohne Vorschlag.

## v1.0.15 · 25. November 2026

- Styling-Studio: Die Auswahl der Pflichtteile zeigt je Kategorie eine übersichtliche Liste mit Foto oder Farbpunkt, vollständigem Namen, Farbe und Material. Nichts überlappt oder scrollt mehr seitlich.
- Unter jedem Pullover liegt ein T-Shirt oder Langarmshirt, bei Kälte bevorzugt ein Langarmshirt.
- Farben werden als Palette abgestimmt. Marine, Ecru, Camel und Denim gelten als Neutraltöne, gemusterte und mehrfarbige Teile werden erkannt. Unruhige Paare wie Blau und Weinrot fallen heraus, wenn es eine ruhige Alternative gibt.
- Jedes Teil im Look zeigt seinen Anlass. Die Überschrift ist kurz und nennt keinen Stilnamen mehr, Größenhinweise stehen bei den Styling-Tipps.
- Düfte beschreiben Charakter, Einsatzzweck, Intensität mit Sprühstößen, beste Tageszeit und Jahreszeiten anhand ihrer Noten. Fehlende Noten bekannter Düfte werden ergänzt, Sakko-Hinweise entfallen.

## v1.0.14 · 25. November 2026

- Finanzvorschläge erkennen Händler-Erstattungen außerhalb von PayPal, etwa eine Gutschriftbestätigung zu einer Bestellung. Maßgeblich ist der genannte Gesamtbetrag, nicht Teilbeträge für Artikel, Steuer oder Versand.
- Mails mit Gutschrift, Rückerstattung, Rückzahlung oder Quittung im Betreff werden vollständig gelesen. Absender wie payments-messages@ gelten als Transaktionsabsender.
- Meldet ein Händler dieselbe Erstattung wie PayPal, entsteht nur ein Vorschlag.
- Beantragte oder angekündigte Erstattungen, Gutscheine, Umbuchungen auf das Bankkonto und Stornierungen ohne Belastung bleiben ohne Vorschlag.
- Der Skill zur Mail-Tiefenprüfung beschreibt diese Betreffe und Ausschlüsse.

## v1.0.13 · 25. November 2026

- Das gemeinsame Antwortschema erlaubt für optionale Rezeptfelder `null`, weil der Modellanbieter für jedes Feld einen Schlüssel verlangt. Der Adapter entfernt die Nullwerte vor der internen Validierung.
- Lehnt der Anbieter das Antwortformat ab, zeigt LifePilot eine eindeutige Fehlermeldung.
- Der Kochassistent erkennt zusätzlich Anfragen wie „aus meinen Zutaten“.

## v1.0.11 · 25. November 2026

Die CLI verwendet einen privaten Unix-Socket und prüft die lokalen Schlüsseldateien. Die HTTP- und Rollenprüfungen laufen auch in der Pull-Request-Pipeline. Die Oberfläche erklärt den lokalen Google-Verbindungsabbau.

## v1.0.10 · 25. November 2026

- Reiseaktionen, Routen und Reiseformulare kompakter angeordnet und eine Adresssuche mit Zielort ergänzt.
- Gmail-Vorschläge um Stellenangaben, Datum, Link und nächste Schritte erweitert. Der Ort ist optional.
- Einheitliche Kleiderschrankkacheln und feste Styling-Kategorien mit wetterabhängiger Schichtung und Jackenwahl.

## v1.0.9 · 24. November 2026

- Pilot empfiehlt mehrere Gerichte mit Mengenabgleich, wählbaren Portionen, Zutatenwünschen, Beilagen und Ausschlüssen. Bei unzureichendem Vorrat zeigt er die noch benötigten Zutaten.
- Die private Rezeptrecherche ergänzt lokale Vorschläge um verlinkte Online-Rezepte. Die Entscheidung für Rezept und Einkaufsliste bleibt beim ausgewählten Gericht.

## v1.0.8 · 24. November 2026

- Jedes Rezept hat eigene speicherbare Portionen. LifePilot berechnet Zutatenmengen aus der Rezeptbasis und prüft vergleichbare Vorratsmengen.
- Neue Pilot-Rezepte brauchen Mengenangaben. Für ältere Rezepte kannst du fehlende Mengen bearbeiten.

## v1.0.7 · 24. November 2026

- Offene Finanz-, Mail-, Projekt-, Bewerbungs- und Pilot-Vorschläge erhalten eine Sammelbestätigung. Finanzen & Abos zeigt keine eigenen Einstellungen mehr.
- Der Kochassistent gleicht Zutaten mit dem Vorrat ab, rechnet Mengen für die eingegebene Portionszahl um und bietet im Chat getrennte Entscheidungen für Rezept und Einkaufsliste.

## v1.0.6 · 24. November 2026

- Aussortierte Teile erscheinen ausschließlich im Kleiderschrank. Der Tab „Verkaufen“ zeigt laufende Verkäufe und verkaufte Teile in eigenen Abschnitten.
- „Persönlich“ zeigt Finanzen & Abos, Vorrat & Einkauf, Outfit-Assistent und Bestellungstracker in dieser Reihenfolge.

## v1.0.5 · 24. November 2026

- „Fristen & Abgaben“ zeigt auf der Startseite Einträge von heute bis einschließlich sieben Tage im Voraus. Erledigte Einträge stehen durchgestrichen unter den offenen.

## v1.0.4 · 24. November 2026

- Die Kleidungsstücksuche übernimmt Farbe, Marke, Passform und Material aus Produktseiten und Suchtext. Bildfarben dienen als letzte Rückfallebene.
- Das einheitliche Neun-Felder-Formular verwendet passende Profilgrößen und erlaubt Änderungen an allen Vorschlägen.
- „Einsortieren“ ist direkt im Menü aussortierter Kleidungsstücke verfügbar.

## v1.0.3 · 24. November 2026

- Die Urlaubsgarderobe öffnet sich beim Packlisten-Klick mit dem ausgewählten Teil. Bei mehreren Reisen wählst du die gewünschte Packliste.
- Aussortierte Kleidungsstücke können direkt an der Kleiderschrankkarte zurücksortiert werden.
- Verkaufskarten bündeln Preis, Zustand und einen Inseratstext für Kleinanzeigen und Vinted.

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
