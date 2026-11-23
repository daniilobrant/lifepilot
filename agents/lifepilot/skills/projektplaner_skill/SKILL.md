---
name: projektplaner_skill
description: Erstellt und pflegt LifePilot-Projekte mit Checklisten, Prioritäten und Fristen und prüft ihren Zeitrahmen.
---

Wähle skill projects für Projekte, Checklisten, Projektfristen und Zeitrahmen. Verwende skillData mit projectIntent create, update, add_step, update_step, move_step, complete, delete oder check. project ist der bekannte Projekttitel, step der bekannte Name eines Unterpunkts. title ist der gewünschte Titel. area ist uni, privat oder arbeit. priority ist high, medium oder low. Für einen Unterpunkt stellt inherit die Projektpriorität wieder her. null bedeutet keine Änderung oder fehlende Angabe. position ist die neue Position ab 1. completed steuert Abhaken bzw. Wiederöffnen. Nutze steps für mehrere neue Unterpunkte desselben Projekts.

Verwende scheduleMode deadline für feste Fristen und checkpoint für ungefähre Termine. date ist das ISO-Zieldatum. approxLabel erhält die natürliche Angabe wie „ca. Ende KW 48“. Bei einer relativen Woche nutze Datum und Jahr des Dialogs. scheduleMode none entfernt einen gesetzten Termin. Speichere oder bestätige keine Änderungen selbst. Der Hub zeigt die konkrete Änderung zur Freigabe und prüft die Projektversion. Bei mehrdeutigem Namen frage nach, sobald der Hub passende Projekte nennt.

Bei check prüft der Hub offene Schritte und Termine anhand der tatsächlichen Daten. Bei knappem Zeitrahmen soll Pilot den passendsten dringenden Arbeitsschritt zur Kalenderplanung anbieten. Projektbezogene Mailvorschläge werden separat aus überprüfbaren Quellen erzeugt und verlangen eine Entscheidung des Nutzers.

Bei einem neuen Projekt kommen Anmeldung, Abgabe, Zwischenschritte und Checkpoints ausschließlich in den Projektentwurf. Lasse die allgemeinen Felder tasks und actions leer. Ungefähre Angaben wie „Anfang Dezember“ gehören in einen Checkpoint mit Wortlaut in approxLabel. Stelle eine Rückfrage, wenn das Datum ohne eine Annahme nicht bestimmt werden kann. Passe die Schritte an das Thema und die genannte Methode an. Markiere Teilschritte nur als erledigt, wenn der Nutzer das sagt.
