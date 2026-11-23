# LifePilot-Skills

| Skill | Zuständigkeit |
| --- | --- |
| [Alltag](../agents/lifepilot/skills/alltag/SKILL.md) | Pilot-Aufträge, Rückfragen, Aufgaben und Erinnerungen |
| [Kalenderplanung](../agents/lifepilot/skills/calendar-planning/SKILL.md) | Termine, Zeitfenster, Serien und Kalenderänderungen |
| [Projektplaner](../agents/lifepilot/skills/projektplaner_skill/SKILL.md) | Projekte, Unterpunkte, Prioritäten und Fristen |
| [Mail-Posteingang](../agents/lifepilot/skills/mail-inbox/SKILL.md) | Relevanz, Labels und nachvollziehbare Vorschläge |
| [Mail-Tiefenprüfung](../agents/lifepilot/skills/mail-tiefenpruefung/SKILL.md) | Absender, Betreff, Vorschau und bei Bedarf Nachrichtentext einordnen |
| [Bestellungstracker](../agents/lifepilot/skills/bestellungstracker/SKILL.md) | Versand, Lieferungen, Retouren und Entscheidungen pro Artikel |
| [Finanzen](../agents/lifepilot/skills/finance/SKILL.md) | Buchungsvorschläge, Monatsbudget und wiederkehrende Ausgaben |
| [PayPal-Zahlungen](../agents/lifepilot/skills/paypal-zahlungen/SKILL.md) | Absender oder Empfänger, Betrag, Datum und Verwendungszweck |
| [Urlaubsplaner](../agents/lifepilot/skills/urlaubsplaner/SKILL.md) | Reiseentwurf, Vorbereitung, Packlisten und Reiseguide |
| [Bewerbungsmanager](../agents/lifepilot/skills/bewerbungsmanager/SKILL.md) | Bestehende Bewerbungen und konkrete Rückmeldungen einordnen |
| [Outfit-Designer](../agents/lifepilot/skills/outfit-designer/SKILL.md) | Kombinationen und Kleiderschrank |
| [Vorrat und Einkauf](../agents/lifepilot/skills/vorrat_einkauf_manager/SKILL.md) | Mengen, Vorrat und Einkaufen |
| [Kochassistent](../agents/lifepilot/skills/kochassistent/SKILL.md) | Rezepte aus Vorräten und fehlende Zutaten |

Eine Ticketmail kann einen Kalender- und einen Finanzvorschlag auslösen. Passt ein PayPal-Beleg zur Ticketausgabe, wird ein gemeinsamer Buchungsvorschlag vorbereitet. Behaltene Kleidung kann aus dem Bestellungstracker in den Kleiderschrank übernommen werden. Eine Vorlesungsabsage erzeugt bei eindeutiger Zuordnung einen Vorschlag für den betroffenen Termin.

[Agentenmanifest](../agents/lifepilot/manifest.json) · [Ergebnisschema](../agents/lifepilot/output.schema.json)

## Welche Anweisungen zur Laufzeit verwendet werden

| Ablauf | Quelle für das Modell oder für die Ausführung |
| --- | --- |
| Allgemeiner Chat | Beide Chat-Adapter laden Alltag und Urlaubsplaner. Codex lädt zusätzlich Projektplanung, Mail-Tiefenprüfung, Bestellungen, PayPal, Finanzen, Vorrat und Kochassistent. |
| Separater KI-Reiseguide | Eigene Anweisungen und Prüfung in der Guide-Runtime. Die Skill-Datei beschreibt die Aufnahme des Reiseauftrags im Chat. |
| Kalender, Posteingang, Styling und Bewerbungen | Chat-Auswahl über Alltag, fachliche Verarbeitung im Hub. Die jeweiligen Skill-Dateien dokumentieren das Vorgehen und seine Grenzen. |
| Freigabe und Speicherung | Der Hub prüft die vorgeschlagenen Daten, den betroffenen Eintrag und die erforderliche Bestätigung. |

[Codex-Adapter](../hub/adapters/codex.ts) · [Lokaler Testadapter](../hub/adapters/local-model.ts) · [Reiseablauf und Herkunft der Triply-Regeln](../agents/lifepilot/skills/urlaubsplaner/references/reiseablauf.md)
