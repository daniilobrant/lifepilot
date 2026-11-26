# Entwicklungsverlauf von LifePilot

Dieses Dokument beschreibt, wie LifePilot gemeinsam mit KI-Assistenten entwickelt wurde: welche Werkzeuge welche Aufgaben hatten, wie ein Änderungswunsch zur fertigen Version wurde und welche Dokumente dabei entstanden. Die Versionen selbst stehen in der [Versionsübersicht der README](../README.md#versionsübersicht) und im [Changelog](../CHANGELOG.md) und werden hier nicht wiederholt.

Grundlage sind zwei Arbeitsprotokolle: ein Chat mit ChatGPT und Codex (Version 0.1 bis 1.0.57) und eine Sitzung mit Claude Code (Version 1.0.11 bis 1.0.59).

## 1. Werkzeuge und Aufgaben

| Werkzeug | Aufgabe im Projekt |
|---|---|
| Entwickler | Anforderungen, Freigaben, Test im eigenen Profil mit echten Daten, Entscheidungen zu Sicherheit und Datenschutz |
| ChatGPT und Codex | Aufbau des Hubs nach dem Trinity-Leitfaden, erste Skills, Google-Anbindung, Oberfläche, erster öffentlicher Release, Sicherheitsprüfung |
| Antigravity und Gemini | Analyse von Fehlern und Oberfläche, Erstellung von Markdown-Anleitungen (zum Beispiel Finanz-Skill, Projektseite, Kleiderschrank-Lebenszyklus), zeitweise direkte Arbeit am Code |
| Claude Code | Weiterbau ab Version 1.0.11: Mail- und Zahlungserkennung, Bestellungen, Reiseguide, Vorrat, Outfit, Verbesserung des Agenten, Claude-Anbindung, Sicherheitsaudit |

Codex und Claude Code arbeiteten abwechselnd und zeitweise gleichzeitig im selben Repository. Gemeinsame Bezugspunkte waren Changelog, Skill-Dateien und Tests.

## 2. Ablauf einer Version

1. Der Entwickler beschreibt ein Problem oder einen Wunsch, häufig per Spracheingabe und mit einem Bildschirmfoto des Fehlers.
2. Der Assistent bestätigt das Verständnis und legt bei größeren Vorhaben einen Plan vor.
3. Er setzt um, führt Typprüfung, Tests und statische Analyse aus und installiert die Version im privaten Profil.
4. Der Entwickler prüft die Version im Browser mit eigenen Daten.
5. Die Rückmeldung bildet den Auftrag der nächsten Version.

Ab dem 24. November 2026 gilt zusätzlich: Jede Änderung wird zugleich in das private Profil installiert und nach GitHub übertragen. Die lokale Version ist maßgeblich, GitHub dient der Nachvollziehbarkeit.

## 3. Eingaben und Dokumente

| Art | Beispiel | Zweck |
|---|---|---|
| Trinity-Leitfaden | Vorgabe des Professors | Verbindlicher Bauplan: Manifest, Rolle, Workflow, Ausgabeschema, Skills, Tests, Freigaben |
| Markdown-Anleitungen | Finanz-Skill, Projekt- und Aufgabenseite, Vorrat und Einkauf, Kleiderschrank-Lebenszyklus, Sicherheitscheckliste | Große Vorhaben in nummerierte Schritte gliedern, die nacheinander umgesetzt werden |
| Skill-Dateien | `agents/lifepilot/skills/*/SKILL.md` | Anweisungen, Entscheidungskriterien und Beispiele für den Agenten |
| Ausgabeschema | `agents/lifepilot/output.schema.json` | Feste Antwortform, die der Hub vor jeder Speicherung prüft |
| Fehlerbeschreibung | Bildschirmfoto mit kurzer Beschreibung | Reproduzierbarer Ausgangspunkt für Korrektur und Test |
| Freigabe | Ausdrückliche Bestätigung je Version oder Pull Request | Der Entwickler entscheidet, was übernommen wird |

Beispiele für Anforderungen und ihre Umsetzung:

| Anforderung | Ergebnis |
|---|---|
| Der Agent soll Rechtschreibfehler erkennen und den Kontext verstehen | Rückfragen und Folgeaufträge im selben Vorgang, später ein Verzeichnis aller Bereiche mit fehlertoleranter Suche |
| Zahlungen aus Mails sollen als Vorschlag erscheinen, ohne Dopplung mit PayPal | Erkennung von Händlerzahlungen, Erstattungen und Abos mit Abgleich gegen PayPal-Belege |
| Eine Abgabe zu einer Vorlesung soll mit dem Termin verknüpft sein | Automatische Verknüpfung und Erinnerung zur Startzeit |
| Der Reiseguide soll für jedes Ziel gleich aufgebaut und schnell sein | Parallele Erzeugung in kleinen Abschnitten, einheitliche Anweisungen |
| Outfits sollen farblich passen und zum Anlass gehören | Farbpalette mit Vorausschau, Zuordnung der Teile zu Anlässen |
| Der Agent soll auch mit Claude statt Codex laufen | Umschaltbarer Modellanbieter mit gemeinsamer Antwortprüfung |

## 4. Phasen

| Phase | Schwerpunkt | Werkzeug |
|---|---|---|
| Aufbau (0.1 bis 0.25) | Hub, Aufgaben, Google-Anbindung, Module für Kleiderschrank, Reisen, Finanzen, Vorrat, Bestellungen, Projekte | Codex, mit Antigravity und Gemini |
| Veröffentlichung (1.0.0 bis 1.0.10) | Sicherheitsprüfung, README mit Galerie, erster öffentlicher Release | Codex |
| Ausbau (1.0.11 bis 1.0.35) | Mail- und Zahlungserkennung, Bestellungstracker, Reiseguide, Vorrat, Outfit, Bedienung | Claude Code |
| Agentenverbesserung (1.0.36 bis 1.0.42) | Verzeichnis, Zerlegung langer Nachrichten, Entscheidungstabelle, Testsatz, Claude-Anbindung | Claude Code |
| Feinschliff (1.0.43 bis 1.0.59) | Sicherheitsprüfungen, Kalender, Rezepte, Mail- und Terminerkennung | Claude Code und Codex |

## 5. Qualitätssicherung

- **Tests:** 228 automatische Tests ohne Modell, darunter Verzeichnis, Zerlegung, Mail- und Bestellerkennung.
- **Agentenprüfung:** 48 Beispielsätze gegen das gewählte Modell (`npm run eval:chat`), zuletzt 47 bestanden. Der Fehlfall wurde behoben.
- **Sicherheit:** lokale Prüfung mit `npm run security:check`, Ergebnisse im [Sicherheitsbericht](../SECURITY_REPORT.md).
- **Freigaben:** Das Modell schlägt nur vor. Der Hub prüft jede Antwort gegen das Schema und speichert erst nach der Bestätigung des Nutzers.
- **Datensicherung:** Vor jeder Änderung an vorhandenen Daten wurde eine Sicherung der Datenbank angelegt.

## 6. Kennzahlen (Stand 1.0.59)

| Merkmal | Wert |
|---|---|
| Versionen seit der ersten Idee | über 100 |
| Skills | 14 |
| Datenbank-Migrationen | 40 |
| Automatische Tests | 228 |
| Beispielsätze für den Agenten | 48 |
| Modellanbieter | Codex (OpenAI), Claude Code (Anthropic) |
