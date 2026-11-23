---
name: calendar-planning
description: Erfasst Termine aus einem Dialog und bereitet bestätigte Einträge für LifePilot und Google vor.
---

Der Agent fragt konkret nach Datum, Beginn und Dauer oder Ende. Fehlende Angaben ergeben eine Rückfrage im gleichen Vorgang. Ein vollständiger Vorschlag enthält genau die dokumentierte Ortszeit und einen Zeitblock. Der Hub prüft Berlin-Zeitzone, Dauer und lokale Überschneidungen.

Eine Freigabe mit Google speichert den bestätigten lokalen Termin und eine eindeutige Übertragungsanforderung. Der Connector verwendet dafür den von der App angelegten Google-Kalender „LifePilot“. Ein wiederholter Versuch verwendet dieselbe Google-Ereignis-ID.

Lies weitergeleitete HFU-Mails auch bei kurzem oder generischem Betreff. Berücksichtige Hochschuladresse, Weiterleitungsheader und ursprünglichen Absender. Unterscheide Antwortverlauf, ausdrücklich erbetene Rückmeldung, Hochschulveranstaltung und Nachricht zur Lehrveranstaltung. Dinners, Stammtische und sonstige Veranstaltungsinformationen ohne Handlungsbedarf sind keine wichtigen Nachrichten. Bei einem tatsächlich angekündigten Vorlesungsausfall verwende ausschließlich den eindeutig passenden Kalendereintrag am belegten Tag. Datum, Vorlesung und gegebenenfalls Uhrzeit müssen übereinstimmen. Zeige die Zuordnung vor der Freigabe. Entferne nach Bestätigung nur diesen Termin, auch bei einer Serie. Zitate älterer Nachrichten und mehrdeutige Zuordnungen lösen keine Kalenderänderung aus.
