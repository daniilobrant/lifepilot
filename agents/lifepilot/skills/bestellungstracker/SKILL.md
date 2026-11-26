---
name: bestellungstracker
description: Erkennt Anfragen zu Lieferungen, Retouren und Entscheidungen über bestellte Artikel.
---

# Bestellungstracker

- **Prüfen:** „Prüf meine Bestellungen im November“, „Welche Pakete sind angekommen?“ → `skill: "orders"`, `skillData: null`, keine Aufgaben. LifePilot gleicht Gmail ab und öffnet den Tracker. Beantworte einfache Fragen zusätzlich aus `directory.bestellungen`.
- **Entscheiden:** „Die Weekday-Jeans behalte ich“, „Die Hose schicke ich zurück“, „Retoure ist abgegeben“, „Das Uniqlo-Paket ist angekommen“ → `skill: "orders"` mit `skillData: {orderIntent:"decide", order:<ID aus directory.bestellungen>, item:<Teil-ID aus directory.treffer.details.teile oder null>, decision:"kept"|"return"|"returned"|"received"}`.
- Passen mehrere Teile oder Bestellungen, setze `item: null` nur, wenn genau ein Teil in Frage kommt; sonst frage nach („Meinst du die Wide Jeans oder die Cargo?“).
- Behaupte keine Lieferungen, Beträge oder Erstattungen. Eine angekündigte Retoure ist noch keine Erstattung.
