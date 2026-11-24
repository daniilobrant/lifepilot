# Teststatus für LifePilot 1.0

- macOS-Build einschließlich TypeScript, Browser-Bundle und nativer Helfer erfolgreich.
- 176 Unit-Tests, acht lokale HTTP-Integrationstests und die Zugriffsprüfung für synthetische Profile bestanden.
- Eine temporäre Kopie meldete die Runtime-Version 1.0.0. Fünf Prüfungen zu Neustart, Wiederherstellung und Freigaben bestanden.
- Die Galerie zeigt synthetische Daten aus dem früheren Quellstand 0.25.16. Live-Nachweise für Google und Codex sowie eine produktiv signierte private Installation stehen aus.

## Begleitende Prüfung für v1.0.0

- Quellbasis 0.25.16. Der veröffentlichte Git-Tag kennzeichnet die erste öffentliche Ausgabe.
- 173 automatisierte Tests in einer separaten Kopie bestanden.
- TypeScript-Typprüfung und Browser-Bundle erfolgreich. Chromium öffnete alle 13 dokumentierten Ansichten ohne gemeldete JavaScript-Fehler.
- Die Screenshots entstanden in einem frischen Testprofil. Geprüft wurden Seitenwechsel, die Bestelldetails, die Reiter im Urlaubsplaner und der Kleiderschrank.
- Für die Screenshots wurde weder ein echtes Google-Konto verbunden noch ein Modellaufruf gestartet. Die Aufnahmen belegen die Darstellung der synthetischen Abläufe. Eine separate Prüfung der vollständigen Installation auf einem anderen Mac und der echten Google-Berechtigungen steht für diesen öffentlichen Stand aus.

## Änderungen auf main nach v1.0.0

- 174 automatisierte Tests bestanden. Der zusätzliche Test prüft die Übergabe der Reiseregeln als Systemanweisung an den lokalen Adapter mit einer simulierten Antwort.
- TypeScript-Typprüfung und Browser-Bundle erfolgreich. Interne Dokumentationslinks und alle fünf in der README eingebundenen Bilddateien geprüft.
- Für die Prompt-Änderung ist kein Live-Modellaufruf dokumentiert. Die Testabdeckung umfasst die Programmlogik und das Zusammenstellen der Anweisung.
