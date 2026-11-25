# Versionsverlauf

Die Entwicklungsetappen stammen aus lokalen Versionsnotizen. Für frühe Stände dient die Versionsnummer als zeitliche Einordnung. Der öffentliche Git-Verlauf beginnt mit dem bereinigten Import. [Planung und offene Vorhaben](docs/ROADMAP.md)

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
