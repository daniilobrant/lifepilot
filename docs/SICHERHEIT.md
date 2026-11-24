# Sicherheit, Testprofile und Daten

LifePilot bindet an 127.0.0.1. Die CLI öffnet den Browser mit einem einmaligen Sitzungsticket. Das Hauptprofil speichert seine Daten unter **user-data/local**, das Testprofil unter **user-data/acceptance**. In diesem Ordner können SQLite-Dateien, Backups, Zugriffstoken und OAuth-Dateien liegen. Er gehört in einen geschützten Speicher.

- **Google** ist optional. Öffne im Hauptprofil **Einstellungen → Verbindungen**, hinterlege einen eigenen OAuth-Client vom Typ Desktop-App und erteile nur die benötigten Berechtigungen. Die lokale Trennfunktion löscht die lokale Berechtigung. Den vollständigen Widerruf erteilst du im Google-Konto. Die Google-Kontoauswahl bei der Kalenderfreigabe musst du prüfen, da der Login-Hinweis die Kontoidentität nicht verbindlich festlegt. [Google-Setup](GOOGLE.md)
- **Codex** ist optional und setzt die vom Adapter erwartete macOS-Installation und eine eigene Anmeldung voraus. Prüfe Datenumfang, Modell und mögliche Kosten vor einer externen Analyse. Daten im synthetischen Profil sind lokal getrennt. Das Profil erzwingt keine Offline-Ausführung.
- **Bestellbilder** können bei bestätigten Aktionen oder während des eingerichteten Gmail-Abgleichs externe Händlerseiten abrufen. Für die Galerie wurden fiktive Bestellungen ohne externe Bildquellen verwendet.
- **Integrität.** Die interne Freigabe prüft einen Satz von Quelldateien und das UI-Bundle. Der öffentliche Quellrelease bescheinigt weder die Integrität aller nativen Helfer und Abhängigkeiten noch die wirksame Sandbox einer konkreten Installation.

Für eine lokale Sicherung verwende **./bin/lifepilot backup --confirm**. Der CLI-Hilfetext erklärt Status und Wiederherstellung. Prüfe Wiederherstellungen mit einer Testkopie.
