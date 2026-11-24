# Sicherheit, Testprofile und Daten

LifePilot bindet an 127.0.0.1. Die CLI öffnet den Browser mit einem einmaligen Sitzungsticket. Das Hauptprofil speichert seine Daten unter **user-data/local**, das Testprofil unter **user-data/acceptance**. In diesem Ordner können SQLite-Dateien, Backups, Zugriffstoken und OAuth-Dateien liegen. Er gehört in einen geschützten Speicher.

- **Google** ist optional. Öffne im Hauptprofil **Einstellungen → Verbindungen**, hinterlege einen eigenen OAuth-Client vom Typ Desktop-App und erteile nur die benötigten Berechtigungen. Die lokale Trennfunktion löscht die lokale Berechtigung. Den vollständigen Widerruf erteilst du im Google-Konto. Die Google-Kontoauswahl bei der Kalenderfreigabe musst du prüfen, da der Login-Hinweis die Kontoidentität nicht verbindlich festlegt. [Google-Setup](GOOGLE.md)
- **Codex** ist optional und setzt die vom Adapter erwartete macOS-Installation und eine eigene Anmeldung voraus. Prüfe Datenumfang, Modell und mögliche Kosten vor einer externen Analyse. Synthetische Profile blockieren externe Chat-Modelle und den externen Reiseguide. Die lokale Reisevorschau kann gespeichert werden. Die native Fotoaufbereitung und Texterkennung bleiben lokal. Für zusätzliche Bildvorschläge ist im freigegebenen Hauptprofil eine eigene Zustimmung zur Übertragung des aufbereiteten Bilds an OpenAI über Codex erforderlich.
- **Bestellbilder** können bei bestätigten Aktionen oder während des eingerichteten Gmail-Abgleichs externe Händlerseiten abrufen. Für die Galerie wurden fiktive Bestellungen ohne externe Bildquellen verwendet.
- **Integrität.** Die interne Freigabe prüft einen Satz von Quelldateien und das UI-Bundle. Der öffentliche Quellrelease bescheinigt weder die Integrität aller nativen Helfer und Abhängigkeiten noch die wirksame Sandbox einer konkreten Installation.

Für eine lokale Sicherung verwende **./bin/lifepilot backup --confirm**. Der CLI-Hilfetext erklärt Status und Wiederherstellung. Prüfe Wiederherstellungen mit einer Testkopie.

## Wiederkehrende Prüfung

Mit Gitleaks und Semgrep im PATH führt `npm run security:check` den Quellcode-, Historien- und npm-Audit aus. Die Prüfungen laufen auch bei Pull Requests. [Auditbericht](../SECURITY_REPORT.md)


## Private Releases verifizieren

Der Projektinhaber signiert ein vollständiges Paket mit seinem privaten Schlüssel. Der öffentliche Schlüssel und eine unabhängig geprüfte Kopie von **scripts/verify-private-release.sh** werden als **release-public.pem** und **verify-release** in **/Library/Application Support/LifePilot** installiert. Die Dateien und das Verzeichnis müssen root gehören und ohne Gruppen- oder Fremdschreibrechte eingerichtet sein. Der private Schlüssel verbleibt beim Projektinhaber.

Zum Paket gehören der Launcher, der Node-Interpreter unter **.runtime/bin/node**, der Hub, alle zur Laufzeit verwendeten npm-Dateien und die Build-Ausgaben einschließlich nativer Helfer. Erstelle das Paket in einem sauberen Verzeichnis ohne Git- oder persönliche Profil-Dateien. Die gepackten Laufzeitdateien dürfen keine symbolischen Links enthalten. Das Hashmanifest verwendet Pfade relativ zum Paket, beginnend mit **./**, und bindet alle Paketdateien außer **user-data** und den beiden Signaturdateien. Signatur und Manifest werden im Paket als **PRIVATE_RELEASE.sig** und **PRIVATE_RELEASE.sha256** abgelegt.

    find . \( -path ./user-data -o -path ./PRIVATE_RELEASE.sha256 -o -path ./PRIVATE_RELEASE.sig \) -prune -o -type f -print |
      LC_ALL=C sort | while IFS= read -r file; do shasum -a 256 "$file"; done > PRIVATE_RELEASE.sha256
    openssl dgst -sha256 -sign /geschuetzter/schluessel.pem -out PRIVATE_RELEASE.sig PRIVATE_RELEASE.sha256

Das private Paket und alle Elternverzeichnisse gehören root und sind ohne Gruppen- oder Fremdschreibrechte eingerichtet. Schreibbare Anwenderdaten liegen getrennt unter **user-data**. Der Launcher prüft Paketinventar, Hashes und Signatur vor Node. Die Runtime prüft bei der privaten Chatfreigabe erneut. Das ältere Freigabeformat allein reicht dafür nicht mehr. Die Freigabeprüfung installiert weder Systemdateien noch einen Schlüssel. Ein produktiver Rollout erfordert die separate Bereitstellung des öffentlichen Schlüssels und einen signierten Paketbuild.

## Optionale Fotoanalyse per Codex

Ohne Übertragung verwendet LifePilot die native Fotoaufbereitung und Texterkennung. Für modellgestützte Vorschläge zeigt die App vor jeder Übertragung einen Hinweis. In der CLI bedeutet **--codex-image** zusammen mit **--confirm**, dass das Bild extern verarbeitet werden darf. Die Befehle dafür sind **outfit-analyze**, **outfit-look-analyze** und **grocery-scan**. Testprofile und unsignierte Hauptprofile weisen diese Freigabe serverseitig ab.

Den Restore aus einem öffentlichen Checkout prüft **node scripts/trinity-restore-check.mjs --checkout** in einer temporären Kopie mit synthetischen Daten. Der lokale Testport 45139 muss frei sein.
