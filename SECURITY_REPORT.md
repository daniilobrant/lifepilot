# Sicherheitsbericht

Stand: 26. November 2026, Version 1.0.59. Grundlage ist die Vorgabe `LifePilot_SECURITY_AUDIT.md`. Der Bericht fasst Prüfumfang, Ergebnisse, Änderungen und offene Punkte zusammen. Secret-Werte werden nicht wiedergegeben.

## 1. Ausgangszustand

| Punkt | Ergebnis |
|---|---|
| Arbeitsbranch | `security/audit-2026-11-26`, abgezweigt von `main` (Version 1.0.58) |
| Funktionstests vorher | 228 bestanden, 0 fehlgeschlagen |
| Parallele Arbeit | Eine zweite Sitzung hatte ungespeicherte Änderungen im Arbeitsordner. Der Audit lief in einem getrennten Arbeitsverzeichnis |
| Projektart | Node.js und TypeScript, keine Python-Dateien, 3 direkte Abhängigkeiten |

## 2. Prüfungen

| Werkzeug | Version | Umfang | Ergebnis |
|---|---|---|---|
| npm audit | npm mit Node 24.22.3 | 41 Pakete (9 Produktion, 33 Entwicklung) | 0 Schwachstellen |
| Semgrep | 1.136.0 | `hub`, `agents`, `bin` mit den Regelsätzen p/default, p/secrets, p/javascript, p/typescript, p/nodejs | 0 Funde. Ein Konfigurationshinweis: Das Shell-Skript `bin/lifepilot` wird nicht von allen Regeln gelesen |
| Bandit | 1.8.6 | gesamtes Projekt | Nicht anwendbar, kein Python-Code |
| pip-audit | installiert | Python-Abhängigkeiten | Nicht anwendbar, keine `requirements`-Datei |
| Gitleaks | 8.30.1 (Prüfsumme gegen die Veröffentlichung geprüft) | Arbeitsstand und Verlauf, 84 Commits nach der Bereinigung | 0 Funde |
| Mustersuche nach Geheimnissen und privaten Daten | `scripts/security-check.mjs` und `git grep` über alle 99 Commits | Schlüssel, Tokens (GitHub, OpenAI, Google), Client-Geheimnisse, IBAN, Telefonnummern, private E-Mail-Adressen, Matrikelnummern, Adressen | Siehe Funde |

## 3. Funde und Behandlung

| Nr. | Schweregrad | Fund | Behandlung |
|---|---|---|---|
| 1 | Mittel | Eine echte Matrikelnummer und ein Name standen in einem Test (`meeting-mail.test.ts`) | Durch fiktive Werte ersetzt, auch in der gesamten Historie |
| 2 | Niedrig | Testdaten enthielten persönliche Angaben des Entwicklers (Vorname, Wohnort, Kontobezeichnung) | Durch neutrale Werte ersetzt (Beispielperson, Stuttgart, „Testkonto“). Die Oberfläche nennt das Testprofil nicht mehr beim Kontonamen |
| 3 | Mittel | In 75 von 99 Commits stand die private E-Mail-Adresse des Entwicklers als Autor | Verlauf mit `git filter-repo` umgeschrieben: Autor und Committer sind die GitHub-Noreply-Adresse. Alle Branches und Tags wurden neu veröffentlicht |
| 4 | Niedrig | Wechselkursabruf folgte als einziger Abruf Weiterleitungen | In Version 1.0.43 behoben (`redirect: 'error'`) |
| 5 | Niedrig | Profildateien und Datenbanksicherungen waren für andere Benutzer dieses Rechners lesbar | In Version 1.0.43 behoben, Installationsskript setzt die Rechte bei jeder Installation (`go-rwx`) |

Es wurden keine Zugangsdaten, privaten Schlüssel, API-Tokens oder Passwörter im Arbeitsstand oder in der Historie gefunden. Verzeichnisse und Dateien mit Nutzerdaten (`user-data/`, Datenbanken, Schlüsseldateien) sind durch `.gitignore` ausgeschlossen und nicht versioniert.

## 4. Hintertüren und Agentenrisiken

| Bereich | Prüfung | Ergebnis |
|---|---|---|
| Zugang zur App | Nur `127.0.0.1`. Host- und Herkunftsprüfung, einmalige Anmelde-Tickets, Cookie mit HttpOnly und SameSite=Strict, CLI-Token (32 Zufallsbytes, Vergleich mit `timingSafeEqual`) | Unauffällig |
| Undokumentierte Zugänge | Suche nach `eval`, `new Function`, `vm`, dynamischen Importen, versteckten Routen und fest eingebauten Zugangsdaten | Nichts gefunden |
| Prüfmodus `--trinity-audit` | Zweiter Zugang mit eigenem Token | Dokumentiert, nur mit Startparameter und lokaler Token-Datei, darf nur auf Memory zugreifen. Kein Mangel |
| Netzwerkverbindungen | Alle Hosts im Code | Nur Google (Gmail, Kalender), Wetter, Wechselkurse, Kartensuche und die Shops, aus denen Produkte importiert werden. Abrufe fremder Adressen nur über HTTPS und öffentliche IP-Adressen |
| Startmechanismen und Abhängigkeiten | `package.json`, `bin/lifepilot`, CI-Workflows | Keine Installationsskripte, drei Abhängigkeiten, kein CI-Workflow im Repository |
| Dateipfade und Prozessaufrufe | Alle Schreib- und Startaufrufe | Feste Pfade, Argumente als Liste ohne Shell, temporäre Dateien mit Rechten 0600. Ausgelieferte Dateien nur aus fester Liste |
| Datenbank | SQL-Aufrufe | Parametrisiert. Dynamische Tabellennamen kommen aus einer festen Liste |
| Oberfläche | Einfügen von HTML, CSP | Kein `innerHTML`, strenge Content-Security-Policy, kein Einbetten in fremde Seiten |
| Freigaben | Modellantworten und Mailinhalte | Mails gelten als Daten. Das Modell schlägt nur vor, der Hub prüft gegen ein Schema und führt erst nach Bestätigung aus. Tests decken Freigabe und Ablehnung ab |
| Modellaufruf | Codex und Claude Code | Ohne Werkzeuge, Shell, Web und MCP-Server. Claude läuft im leeren Temp-Ordner, Codex nach Signaturprüfung. Ein gemeldeter Werkzeugaufruf bricht den Vorgang ab |
| Datenweitergabe | Was an externe Dienste geht | Dokumentiert in [docs/SICHERHEIT.md](docs/SICHERHEIT.md): Chat, Bilder nach Freigabe, Verzeichnis ohne Beträge, einmalige Prüfung unklarer Mails |

## 5. Offene Risiken und Hinweise

1. **GitHub-Referenzen alter Pull Requests.** GitHub hält für geschlossene Pull Requests eigene Referenzen (`refs/pull/*`), die auf die früheren Commit-Kennungen zeigen. Diese Referenzen lassen sich nicht selbst entfernen. Über direkte Commit-Links der alten Kennungen können die früheren Autor-Angaben weiterhin abrufbar sein. Wer sie entfernen will, bittet den GitHub-Support um das Löschen der zwischengespeicherten Ansichten, oder legt das Repository neu an.
2. **Umgeschriebener Verlauf.** Alle Commit-Kennungen haben sich geändert. Lokale Klone müssen neu angelegt oder auf den neuen Stand gesetzt werden. Eine Sicherung des früheren Stands liegt nur lokal beim Entwickler und enthält die entfernten Daten.
3. **GitHub-Prüfung bei Pull Requests.** Die Vorgabe sieht eine Einbindung des lokalen Befehls in GitHub Actions vor. Sie wurde auf Wunsch des Entwicklers nicht eingerichtet, weil automatische Benachrichtigungen unerwünscht sind. Die Prüfung läuft nur lokal.
4. **Nicht verifizierte Bereiche.** Echte Google- und Modellaufrufe wurden in diesem Audit nicht ausgeführt, die Prüfung der Anbindung stützt sich auf Code, lokale Mocks und die vorhandenen Tests.

## 6. Ergebnis nach den Änderungen

| Prüfung | Ergebnis |
|---|---|
| Funktionstests | 228 bestanden, 0 fehlgeschlagen |
| npm audit | 0 Schwachstellen |
| Semgrep | 0 Funde |
| Private Daten und Geheimnisse im Arbeitsstand | keine Funde |
| Gitleaks | 0 Funde in 84 Commits |
| Autoren-E-Mail im Verlauf | nur noreply-Adressen |

## 7. Wiederkehrende Prüfung

    npm run security:check

Der Befehl führt npm audit, Semgrep, Gitleaks (falls installiert), Python-Werkzeuge (nur bei Python-Code), die Mustersuche nach privaten Daten, die Prüfung der Autoren-Adressen und die Funktionstests aus. Er läuft nur lokal und versendet nichts.
