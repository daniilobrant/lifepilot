# LifePilot-Roadmap

[Veröffentlichte Versionen und Einführung der Funktionen](../CHANGELOG.md) · [Abnahme und Testgrenzen](../TESTSTATUS.md)

## Wie LifePilot geplant wurde

| Etappe | Planungsentscheidung | Beispiel |
| --- | --- | --- |
| Lokaler Kern zuerst | Oberfläche und CLI greifen auf dieselben Daten zu. Lokale Aufgaben, Fristen und Dialoge bilden die Grundlage für spätere Integrationen. | Eine erfasste Aufgabe ist über beide Eingänge erreichbar. |
| Vorschläge vor Datenänderungen | Der Agent formuliert einen prüfbaren Entwurf. Der Hub prüft Daten, Ziele und Freigaben vor dem Schreiben. | Eine Änderung an einem Projekt bezieht sich auf dessen aktuelle Revision. |
| Module auf gemeinsame Daten stützen | Projekte, Kalender und Aufgabenboard teilen fachliche Referenzen. Posteingang und Bestellungen können eigene Vorschläge erzeugen. | Eine Projektfrist erscheint im Board und bleibt mit dem Projekt verknüpft. |
| Integrationen schrittweise anbinden | Konto- und dienstbezogene Berechtigungen ermöglichen gezielte Lese- und Schreibabläufe. Fiktive Belege decken die fachlichen Regeln in Tests ab. | Eine Theaterbuchung kann einen Termin und genau einen passenden Ausgabenvorschlag erzeugen. |
| Produkt aus konkreten Fällen verbessern | Fehlerfälle werden als reproduzierbare Abläufe beschrieben. Anschließend werden Ausgabe und Übernahme im Hub geprüft. | Eine neue Datumsangabe im Reisechat muss den alten Zeitraum aktualisieren und die übrigen Angaben bewahren. |
| Öffentliche Ausgabe dokumentieren | Quellstand und Versionsbezug dokumentieren. Eine isolierte App-Sitzung liefert synthetische Screenshots. | Die Galerie zeigt Oberfläche und Freigaben, der Teststatus nennt den Umfang der Prüfung. |

## Stand und nächste Prüfschritte

| Status | Bereich | Prüfkriterium |
| --- | --- | --- |
| Veröffentlicht in v1.0.0 | Lokaler Hub, Pilot, Kalender, Aufgaben, Projekte, Posteingang, Bestellungen, Finanzen, Reisen, Outfit, Vorrat und Bewerbungen | 173 automatisierte Tests in der Abnahmekopie und 13 Ansichten im isolierten Browserprofil dokumentiert. |
| In `main` überarbeitet | Skill-Beschreibungen, Reisechat und Repository-Dokumentation | Ablauf, Eingaben, Entscheidungen, Rückfragen und Grenzen der Skills sind in den Skill-Dateien beschrieben. Beide Chat-Adapter beziehen die Reiseregeln aus demselben Skill. |
| Offen | Installation auf einem zweiten Mac | Neuinstallation aus einem sauberen Checkout, lokale Testdaten anlegen, Neustart und Wiederherstellung in separater Testkopie prüfen. |
| Offen | Google-Kontobindung und Widerruf | Mit getrennten Testidentitäten prüfen, welchem Konto Schreibrechte erteilt werden und wie ein Widerruf bei Google wirkt. |
| Offen | Netzgrenzen des Testprofils und Release-Integrität | Modellaufrufe und native Laufzeitkomponenten über nachvollziehbare technische Kontrollen absichern. Befunde und Prüfgrenzen liegen in der Sicherheitsdokumentation. |
| Idee | Quellen für Reisehinweise | Prüfen, ob ein Reisehinweis Datum und Quelle sichtbar machen kann. Preise, Verfügbarkeit und ähnliche zeitabhängige Aussagen brauchen aktuelle Belege. |

Die offenen Punkte haben keinen zugesagten Termin. Der dokumentierte Stand bezieht sich auf das öffentliche Repository. [Sicherheitsgrenzen](SICHERHEIT.md) · [Reise-Fachregeln](../agents/lifepilot/skills/urlaubsplaner/references/reiseablauf.md)
