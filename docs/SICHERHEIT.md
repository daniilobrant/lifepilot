# Sicherheit, Testprofile und Daten

LifePilot bindet an 127.0.0.1. Die CLI öffnet den Browser mit einem einmaligen Sitzungsticket. Das Hauptprofil speichert seine Daten unter **user-data/local**, das Testprofil unter **user-data/acceptance**. In diesem Ordner können SQLite-Dateien, Backups, Zugriffstoken und OAuth-Dateien liegen. Er gehört in einen geschützten Speicher.

- **Google** ist optional. Öffne im Hauptprofil **Einstellungen → Verbindungen**, hinterlege einen eigenen OAuth-Client vom Typ Desktop-App und erteile nur die benötigten Berechtigungen. Die lokale Trennfunktion löscht die lokale Berechtigung. Den vollständigen Widerruf erteilst du im Google-Konto. Für Kalender-Schreibzugriffe prüft LifePilot die Google-Konto-ID und verlangt eine verifizierte E-Mail-Adresse, die zum verbundenen Gmail-Hauptkonto passt. [Google-Setup](GOOGLE.md)
- **Codex** ist optional und setzt die vom Adapter erwartete macOS-Installation und eine eigene Anmeldung voraus. Prüfe Datenumfang, Modell und mögliche Kosten vor einer externen Analyse. Synthetische Profile blockieren externe Chat-Modelle und den externen Reiseguide. Die lokale Reisevorschau kann gespeichert werden. Die native Fotoaufbereitung und Texterkennung bleiben lokal. Für zusätzliche Bildvorschläge ist im freigegebenen Hauptprofil eine eigene Zustimmung zur Übertragung des aufbereiteten Bilds an OpenAI über Codex erforderlich.
- **Bestellbilder** können bei bestätigten Aktionen oder während des eingerichteten Gmail-Abgleichs externe Händlerseiten abrufen. Für die Galerie wurden fiktive Bestellungen ohne externe Bildquellen verwendet.
- **Integrität.** Die interne Freigabe prüft einen Satz von Quelldateien und das UI-Bundle. Der öffentliche Quellrelease bescheinigt weder die Integrität aller nativen Helfer und Abhängigkeiten noch die wirksame Sandbox einer konkreten Installation.

Für eine lokale Sicherung verwende **./bin/lifepilot backup --confirm**. Der CLI-Hilfetext erklärt Status und Wiederherstellung. Prüfe Wiederherstellungen mit einer Testkopie.

## Wiederkehrende Prüfung

Mit Gitleaks und Semgrep im PATH führt `npm run security:check` den Quellcode-, Historien- und npm-Audit aus. Die Prüfungen laufen auch bei Pull Requests. [Auditbericht](../SECURITY_REPORT.md)


## Privaten Chat lokal freigeben

Die private Freigabe gilt für den installierten Build. LifePilot prüft die Versionsnummer, das Manifest **SHA256SUMS** und das Browser-Bundle gegen die lokale Freigabedatei im Hauptprofil. Mit fehlender Freigabe oder abweichenden Prüfsummen bleibt der private Chat deaktiviert. Lokale Prüfsummen erkennen Abweichungen zur Freigabe. Die Vertrauensgrenze liegt beim lokalen Benutzerkonto, das für Dateien und Freigabe Schreibrechte hat.

## Optionale Fotoanalyse per Codex

Ohne Übertragung verwendet LifePilot die native Fotoaufbereitung und Texterkennung. Für modellgestützte Vorschläge zeigt die App vor jeder Übertragung einen Hinweis. Ausnahme auf Wunsch des Nutzers (25. November 2026): Die Analyse eigener Look-Fotos unter „Meine Looks“ sendet das aufbereitete Foto im freigegebenen Hauptprofil ohne erneute Rückfrage an Codex; Kleiderschrank- und Vorratsfotos fragen weiterhin. In der CLI bedeutet **--codex-image** zusammen mit **--confirm**, dass das Bild extern verarbeitet werden darf. Die Befehle dafür sind **outfit-analyze**, **outfit-look-analyze** und **grocery-scan**. Testprofile und Hauptprofile ohne lokale Freigabe weisen diese Freigabe serverseitig ab.

Den Restore aus einem öffentlichen Checkout prüft **node scripts/trinity-restore-check.mjs --checkout** in einer temporären Kopie mit synthetischen Daten. Der lokale Testport 45139 muss frei sein.
