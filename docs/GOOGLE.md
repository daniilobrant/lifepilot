# Google Calendar und Gmail verbinden

In LifePilot unter **Einstellungen → Google Calendar und Gmail**. Im lokalen Hauptprofil stehen getrennte Berechtigungen zur Auswahl.

| Dienst | Google-Berechtigung | Was LifePilot abruft |
|---|---|---|
| Google Calendar | `calendar.events.owned.readonly` | Bis zu 50 Termine des eigenen Hauptkalenders. |
| Gmail-Kopfzeilen | `gmail.metadata` | Betreff, Absender und Datum aus dem Posteingang. |
| Gmail für Aufgaben | `gmail.readonly` | Klartext ausgewählter Nachrichten oder im Live-Modus bis zu zehn Inbox-Nachrichten pro Klick. |

Für den Live-Modus **Gmail für Aufgaben** verbinden. Der erste Klick auf **Posteingang → Live-Modus starten** beginnt mit dem Posteingang der letzten 30 Tage. Der nächste Klick setzt die gespeicherte Gmail-Seite desselben Kontos fort. **Bei neuesten Mails beginnen** setzt den Abruf zurück. Fehlgeschlagene Abrufe speichern keinen neuen Stand. Der Hub speichert Mailvorschläge mit einem kurzen Beleg und deine Entscheidungen in SQLite. Der Abruf lädt keine Anhänge. Das Setzen eines Labels braucht den getrennten Schreibzugriff und die Bestätigung pro Mail.

## Getrennte Schreibtests im Freigabekandidaten

- **Google-Testkalender** bittet um `calendar.app.created`. Nach der Anmeldung wählst du einen Berliner Zeitpunkt und bestätigst **Testkalender und Testtermin**. LifePilot legt den separaten Kalender **LifePilot Test** und einen 15-Minuten-Termin an. Wiederholung desselben Zeitpunkts liefert die vorhandene Bestätigung.
- **Gmail-Sortiertest** bittet um `gmail.modify`. Die Gmail-Leseverbindung und die Sortierverbindung müssen dasselbe Konto betreffen. Öffne eine Posteingangsmail über **Gmail für Aufgaben** und bestätige **Testlabel für diese Mail**. Beim separaten Test fügt die App das Label **LifePilot Test** hinzu. Nach einem Mail-Durchlauf kannst du außerdem pro Nachricht ein **LifePilot**-Kategorielabel bestätigen. Der Hub vergleicht Lese- und Schreibkonto und prüft die vorgeschlagene Kategorie vor der Änderung erneut. Gmail zeigt für diese Berechtigung einen breiteren OAuth-Umfang an.
- Die Schreibtests erfordern den Kandidaten im Hauptprofil, die jeweiligen OAuth-Freigaben und eine konkrete Bestätigung. Sie sind im synthetischen Testprofil gesperrt.

```sh
./bin/lifepilot google-calendar-test YYYY-MM-DDTHH:mm --confirm
./bin/lifepilot google-gmail-sort-test NACHRICHT-ID --confirm
```

## Einrichtung nach separater Freigabe

1. In einem von dir genehmigten Google-Cloud-Projekt **Google Calendar API** bzw. **Gmail API** aktivieren. Wenn die Einwilligung im Modus „Testing“ läuft, das zugelassene Konto als Testnutzer hinterlegen.
2. Unter **Google Auth Platform → Clients** OAuth-Clients des Typs **Desktop app** einrichten und die JSON-Dateien lokal herunterladen. Für unabhängige Berechtigungen getrennte Clients verwenden. Falls Google kombinierte Berechtigungen zurückliefert, akzeptiert LifePilot den Zugriff nicht.
3. Öffne in LifePilot **Einstellungen**. Wähle beim jeweiligen Dienst **JSON-Datei auswählen** und die dort heruntergeladene Datei. Die Dateien werden nur an den lokalen LifePilot-Dienst übergeben. Inhalte aus ihnen gehören nicht in den Chat.
4. Klicke **Mit Google anmelden**, wähle bei Google das richtige Konto und prüfe das angezeigte Leserecht. Nach deiner Zustimmung kehrt LifePilot selbst zu den Einstellungen zurück. Dort kannst du **Nächste 7 Tage laden** oder **Posteingang laden** wählen. Für **Gmail für Aufgaben** findest du den Durchlauf unter **Posteingang**.

Wenn du die Einstellungen vom Terminal aus direkt öffnen möchtest:

```sh
cd ~/Projects/lifepilot
./bin/lifepilot start
./bin/lifepilot open google
```

Die CLI kann die Dateien alternativ direkt von stdin übernehmen, zum Beispiel `./bin/lifepilot google-configure calendar --confirm < "$HOME/Downloads/lifepilot-calendar.json"`.

```sh
./bin/lifepilot google-status
./bin/lifepilot google-calendar 7
./bin/lifepilot google-mail 8
```

`google-connect calendar --confirm` und `google-connect gmail --confirm` geben alternativ einen einmaligen Anmeldelink für den Browser aus. `google-disconnect SERVICE --confirm` entfernt den lokalen Zugriff. Die Google-Zustimmung selbst lässt sich in den [Google-Kontoverbindungen](https://myaccount.google.com/connections) widerrufen. Die Clients und Zugangstokens liegen nur im lokalen Profil unter `user-data/local/google/` mit Dateimodus 0600. Sie sind nicht Teil der SQLite-Sicherung.

Die Prüfung der Anmeldung, der Mailtextabfrage und des Seitenwechsels verwendet simulierte Google-Antworten. Die Anmeldung und der Abruf bei Google hängen vom freigegebenen Konto, den aktivierten APIs und der Google-Konfiguration ab. Google behandelt Gmail-Metadaten als eingeschränkten OAuth-Bereich. Ein freigegebener lokaler Test ist keine Freigabe für eine öffentliche App.

[OAuth für Desktop-Apps](https://developers.google.com/identity/protocols/oauth2/native-app) · [Client einrichten](https://developers.google.com/workspace/guides/create-credentials) · [Kalender-Berechtigungen](https://developers.google.com/workspace/calendar/api/v3/reference/events/list) · [Gmail-Berechtigungen](https://developers.google.com/workspace/gmail/api/auth/scopes)

## Schreibzugriff auf den Hauptkalender

Für den separaten Kalender-Schreibzugriff prüft LifePilot bei Google die verifizierte E-Mail-Adresse und speichert die stabile Konto-ID. Dazu werden zusätzlich **openid** und **email** benötigt. Die E-Mail muss mit dem bereits verbundenen Gmail-Hauptkonto übereinstimmen. Bei einer Aktualisierung des Tokens muss auch die Konto-ID übereinstimmen. Alte Schreibfreigaben ohne geprüfte Identität gelten als inaktiv und können über **Verbinden** neu bestätigt werden. Die anderen Google-Verbindungen bleiben nutzbar.
