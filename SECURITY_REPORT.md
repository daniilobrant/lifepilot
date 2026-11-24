# LifePilot-Sicherheitsprüfung · 24. November 2026

**Basis:** öffentlicher Commit `6a3ae6479e77edb6a9f0261a51970797c89d06fd` auf `main`. Die Prüfung und die Korrekturen liefen in einer separaten Arbeitskopie auf `security/audit-2026-11`.

Der Bestelltracker hat beim Öffnen unter bestimmten Voraussetzungen Händlerabrufe und lokale Änderungen ausgelöst. Diese Kopplung ist entfernt. Der öffentliche Git-Verlauf und der Arbeitsstand lieferten im Scan keinen Hinweis auf Zugangsdaten. Die Stichproben zu Start, Konfiguration, Agent und Konnektoren ergaben keinen belegten absichtlich versteckten Zugang. Die offenen Befunde zu Modellaufrufen, Freigaben und Kontobindung bleiben relevant.

## 1. Umfang und Werkzeuge

Geprüft wurden der öffentliche Quellcode, die Konfiguration, das npm-Lockfile, die erreichbare öffentliche Git-Historie und ein isolierter Testbetrieb mit fiktiven Daten. Persönliche App-Profile, Datenbanken, private Git-Historie, API-Schlüssel, Live-Konten und native Binärdateien gehörten nicht zum Umfang. Typprüfung und Browser-Bundle liefen mit Node 24.22.3 und den vorhandenen, gegen das öffentliche Lockfile auf Versionsgleichheit geprüften Paketen.

| Reihenfolge | Werkzeug und Befehl | Ausgangsstand | Nach Korrektur |
| --- | --- | --- | --- |
| 1 | Gitleaks 8.30.1 · `gitleaks git --redact=100 --no-banner --log-opts=--all .` und `gitleaks dir --redact=100 --no-banner .` | 0 Meldungen in fünf Commits und im Arbeitsstand vor Start der Testserver | 0 Meldungen in Historie und im Quellcode-Arbeitsstand |
| 2 | pip-audit · Python-Abhängigkeiten | Nicht anwendbar, kein Python-Projektmanifest | Nicht anwendbar. Die temporäre Python-Umgebung gehört zum Prüfwerkzeug. |
| 3 | Bandit · Python-Quellcode | Nicht anwendbar, keine Python-Quelldateien | Nicht anwendbar |
| 4 | Semgrep CE 1.186.0 · `semgrep scan --config p/default --metrics=off --disable-version-check --error --json .` | 185 Dateien, 6 Meldungen und 2 Teilparser-Diagnosen | 0 Meldungen, 0 Diagnosen nach Bearbeitung. Der wiederkehrende Befehl nutzt zusätzlich `--strict`. |
| 5 | npm 11.19.1 · `npm audit --package-lock-only --json --registry=https://registry.npmjs.org` | 0 gemeldete Advisories | 0 gemeldete Advisories |

Semgrep verwendet öffentliche Community-Regeln. Der Regelstand kann sich ändern. Der npm-Dienst erhält die Paketdaten aus dem öffentlichen Lockfile. Die wiederkehrenden Checks schließen Laufzeitdaten und lokale Abhängigkeiten aus. Ergebnisse erscheinen ohne Secret-Werte und ohne Semgrep-Quelltextausschnitte. [Gitleaks](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) · [npm audit](https://docs.npmjs.com/cli/commands/npm-audit/)

## 2. Bestätigte Befunde und Maßnahmen

| ID und Einstufung | Fundstelle und Wirkung | Maßnahme und Nachweis |
| --- | --- | --- |
| LP-01 · Mittel · behoben | Ein authentifiziertes `GET /api/clothing-orders` konnte einen Fotoauftrag anstoßen. Ein Händler konnte die Netzwerkanfrage sehen. Ein Fotoauftrag konnte lokale Metadaten setzen. Der periodische Mailpfad konnte außerdem nach einem inaktiven Abgleich Fotos anstoßen. [Bestellroute](hub/runtime/server.ts#L1062) · [Mailabgleich](hub/runtime/server.ts#L164) | Der Bestell-GET liest den Bestand. Die explizite Fotoaktion bleibt ein bestätigter POST. Der periodische Kategorisierungslauf startet Fotos nur, wenn der Gmail-Abgleich tatsächlich ausgeführt wurde. Bestelltests und HTTP-Test prüfen die weiterhin verfügbare Ansicht und die getrennte Fotoaktion. |
| LP-02 · Niedrig · behoben | Die Google-HTTP-Suite erwartete fünf Dienste. Die Routine liefert sechs, einschließlich der separaten Kalender-Schreibberechtigung. Der Test brach ab, bevor er alle Berechtigungsprüfungen durchlaufen konnte. [HTTP-Suite](agents/lifepilot/tests/http.live.mjs#L131) | Erwartung aktualisiert und zusätzlich geprüft, dass ohne Gmail-Hauptkonto keine Verbindung für den Kalender-Hauptschreibzugriff gestartet wird. Ausgangslauf 3/4, korrigierter Lauf 5/5 mit neuem Bestelltest. |
| LP-03 · Hoch · offen | Die lokale Release-Freigabe prüft eine Markerdatei, das UI-Bundle und die im Manifest aufgeführten Dateien. Die vollständige Vertrauenskette inklusive gestarteter Laufzeit, nativer Helfer und externer Codex-Binärdatei ist nicht unabhängig belegt. [Release-Gate](hub/runtime/chat-release.ts#L10) · [Launcher](bin/lifepilot#L4) | Signiertes Manifest für ausführbare Komponenten und überprüfbare Herkunft vor dem Start planen. Das öffentliche Repository liefert keinen privaten Release-Marker und kein Manifest für eine installierte private Version. |
| LP-04 · Hoch · offen | Das synthetische Profil trennt die Datenbank. Die Chat-Ausführung kann trotzdem Codex wählen, und der Reiseguide hat einen eigenen externen Modellpfad. Die Modellkonfiguration benennt den Anbieter, aber kein im Freigabeobjekt fixiertes Modell oder Kostenlimit. [Worker](hub/runtime/server.ts#L341) · [Reiseguide](hub/runtime/server.ts#L606) · [Codex-Adapter](hub/adapters/codex.ts#L142) | Synthetische Offline-Tests technisch von optionalen Cloud-Tests trennen. Modell, Ziel und Budget bei einer späteren Architekturänderung an eine wirksame Freigabe binden. |
| LP-05 · Mittel · offen | Beim ersten Kalender-Schreib-Grant dient die vorbereitete Kontoangabe als OAuth-Hinweis. Das Konto wird beim Speichern der Berechtigung nicht gegen den Hinweis abgeglichen. Der spätere Kalenderzugriff prüft Eigentümerrolle und Terminstand. [OAuth-Start](hub/connectors/google.ts#L126) · [OAuth-Abschluss](hub/connectors/google.ts#L205) · [Kalender-Schreibschutz](hub/connectors/google.ts#L395) | Verifizierte Kontoidentität vor der Speicherung binden. Entscheidung über zusätzliche Identitätsberechtigung und Nachweis im separaten Testkonto einholen. |
| LP-06 · Mittel · offen | Google trennen meldet den lokalen Zustand nach dem Entfernen des Grant-Files zurück. Ein Widerruf beim Anbieter ist ein separater Vorgang. [Trennfunktion](hub/connectors/google.ts#L118) | Lokalen Zustand und Widerruf klar abbilden. Einen Widerruf nur mit ausdrücklicher Genehmigung ausführen und gesondert prüfen. |
| LP-07 · Mittel · offen | Das Bildmodell erhält Bilder über einen festen Loopback-Port. Die App prüft die Identität des dort antwortenden Prozesses oder dessen weitere Datenwege nicht. [Bildmodelladapter](hub/adapters/outfit-image-model.ts#L3) | Lokalen Empfänger und seine Netzgrenzen in der Installationsumgebung verifizieren. Die generische HTTP-Semgrep-Meldung belegt hier keine externe Klartextverbindung. |

Der korrigierte Bestellpfad belässt bestehende ausdrückliche Fotoaktionen und die automatische Verarbeitung im eingerichteten Mailablauf. Für den älteren Nightbot-Modus gibt es zusätzlich einen separaten Hintergrundabruf. Er war im HTTP-Test deaktiviert. [Hintergrundabruf](hub/runtime/server.ts#L1452)

### Semgrep-Meldungen und Parserdiagnosen

- Fünf Meldungen zu dynamischen Regexen wurden im Aufrufkontext geprüft. Musterbausteine kommen aus festen Beschriftungen, Datumsfragmenten, Wochentagen und der Monatstabelle. Nutzer- und Mailtext bleibt Suchtext. Die Ausnahmen sind zeilengenau auf die Regel begrenzt. [Outfit-Import](hub/connectors/outfit-import.ts#L216) · [Terminserien](hub/runtime/calendar-series-chat.ts#L77) · [Ticketmail](hub/runtime/event-mail.ts#L7) · [Monatstabelle](hub/ui/app.tsx#L1352)
- Die HTTP-Regel am Bildmodell ist auf den unveränderlichen Loopback-Endpunkt mit gesperrten Redirects eingeschränkt. Das Vertrauensrisiko des lokalen Empfängers bleibt unter LP-07 dokumentiert.
- Drei statische kaufmännische Und-Zeichen in TSX-Text wurden als Entitäten geschrieben. Die Anzeige bleibt gleich. Semgrep meldete anschließend keine Teilparser-Diagnosen. TypeScript und das Browser-Bundle liefen erfolgreich.

## 3. Kontrollwirkung im untersuchten System

- **HTTP und Browser:** Loopback-Bindung, Host- und Origin-Prüfung, einmaliges Sitzungsticket, HttpOnly-Sessioncookie, CSP und begrenzte JSON-Felder. HTTP-Tests prüfen Abweisung einer fremden Origin, fehlende Berechtigung und wiederverwendeter Tickets. [HTTP-Routen](hub/runtime/server.ts#L383) · [HTTP-Tests](agents/lifepilot/tests/http.live.mjs)
- **Agent und Memory:** Der Hub prüft Analysefreigaben gegen Inhalt und Ablaufzeit. Die Übernahme ist eine weitere Entscheidung. Der Prüfhelfer bekommt einen beschränkten Zugang. Die Trinity-Suite hat die Memory-Trennung unabhängig für CLI-Bearer und Browser-Cookie bestätigt. [Freigaben](hub/runtime/store.ts#L462) · [Arbeitsübergabe](hub/runtime/store.ts#L656) · [Trinity-Test](scripts/trinity-check.mjs)
- **Quellen und Tools:** Der Adapter markiert Dialog- und Quellenmaterial als Daten. Das ist eine Anweisung an das Modell. Die technische Kontrolle sind das Ausgabeschema, Beleg- und Zielprüfungen, die begrenzten Hub-Operationen und die Freigabe. Codex erhält Flags für einen lesenden Sandboxmodus und deaktivierte Werkzeuge. Die tatsächliche Betriebssystem-Isolation des installierten Codex wurde hier nicht gemessen. [Adapter](hub/adapters/codex.ts#L98) · [Ausgabeprüfung](agents/lifepilot/tools/validate.ts#L77)
- **Dateien und Netzwerk:** Die CLI liest ausdrücklich ausgewählte Dokumente mit Begrenzung und ohne Symlink-Verfolgung am Dateideskriptor. Der Produktimport prüft Adressen und bindet erlaubte Verbindungen an geprüfte IP-Adressen. Google verwendet getrennte Scopes und OAuth-State mit PKCE. Diese Kontrollen wurden im Code und in lokalen Tests geprüft. [Dateiübergabe](hub/adapters/cli.ts#L321) · [Externe Produktdaten](hub/connectors/outfit-import.ts#L38) · [Google-Connector](hub/connectors/google.ts#L10)

## 4. Wiederholbarkeit und Grenzen

- Ausgangsstand und korrigierter Stand: **174 Unit-Tests bestanden**. Korrigierter Stand: **5 HTTP-Integrationstests** und **Trinity-Memory-Trennung** bestanden. TypeScript und Browser-Bundle waren erfolgreich.
- Die HTTP-Tests verwendeten drei isolierte Loopback-Dienste. Google-Connector-Unit-Tests verwenden simulierte Antworten. Im Audit wurde kein Live-Modell gestartet und kein Google-Konto verbunden. Visuelle Bedienung, native macOS-Helfer, private Laufzeitfreigabe und öffentliche Bestellsysteme wurden nicht live geprüft.
- Der separate Restore-Harness erwartet ein lokales `SHA256SUMS`, das im öffentlichen Quellstand nicht enthalten ist. Er wurde nicht ausgeführt. Vorhandene Restore-Logik in der Unit-Suite wurde mitgeprüft.
- Der neue lokale Befehl ist `npm run security:check`. Gitleaks und Semgrep müssen im PATH liegen oder über `LIFEPILOT_GITLEAKS` und `LIFEPILOT_SEMGREP` angegeben werden. Der PR-Workflow verwendet denselben Befehl, feste Action-Referenzen und Leserechte. [Lokaler Check](scripts/security-check.mjs) · [PR-Workflow](.github/workflows/security.yml)

Der Audit-Branch ist zur Prüfung vorbereitet. Der Merge und weitergehende Berechtigungs- oder Architekturänderungen erfordern eine gesonderte Entscheidung.
