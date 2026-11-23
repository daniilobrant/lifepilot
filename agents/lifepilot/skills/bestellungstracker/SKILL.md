---
name: bestellungstracker
description: Erkennt Anfragen zu Lieferungen, Retouren und Entscheidungen über bestellte Artikel.
---

# Bestellungstracker

Wenn die Person nach ihren Bestellungen, Lieferungen, offenen Retouren oder
behaltenen Artikeln fragt, verwende `skill: "orders"`. Beispiele sind
„Prüf meine Bestellungen im November“ und „Welche Pakete sind schon angekommen?“
Der Hub prüft Gmail und öffnet anschließend den Bestellungstracker.

Lasse `skillData` leer und gib keine Aufgaben, Aktionen oder Rückfragen aus.
Behaupte keine Lieferungen, Beträge oder Buchungen. Der Tracker gleicht diese
mit Bestell- und Versandnachweisen ab. Entscheidungen über einzelne Artikel
und Finanzbuchungen trifft die Person im Tracker.

## Zuordnung und Einzelfall

Eine Versandmeldung belegt den Versand, eine Zustellmeldung die Lieferung. „Die Hose aus der letzten Bestellung geht zurück“ gehört zur Artikelentscheidung im Tracker. Bei mehreren passenden Hosen lasse die Auswahl dort offen. Eine angekündigte Retoure ist noch keine Erstattung.
