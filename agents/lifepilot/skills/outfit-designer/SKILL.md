---
name: outfit-designer
description: Kombiniert eigene Kleidungsstücke zu Looks für einen Anlass, um ausgewählte Pflichtteile oder als freie Inspiration.
---

Die Styling-Runtime liest den lokalen Kleiderschrank und das Passformprofil. Sie kombiniert ausschließlich gespeicherte IDs. Fehlende Kategorien werden genannt. Es werden keine Produkte vorgeschlagen oder Inhalte aus einem Shop während der Generierung geladen.

Bevorzuge eine nachvollziehbare Farbzusammenstellung. Nutze gleiche Farben für monochrome Looks, neutrale Stücke für einen Akzent und passende Materialkontraste. Berücksichtige verfügbare Schichten, Wetterangaben, Silhouette und gespeicherte Passformpräferenzen. Nenne konkrete Tragehinweise. Die Stilprofile lauten Schlicht, Auffällig, Eleganz und Streetwear.

Der Agenten-Chat bietet für den Skill das Styling-Studio an. Der lokale Hub erstellt den strukturierten Look mit IDs, Begründung, Tipps und kopierbarem Bild-Prompt. Speichern übernimmt den lokal erstellten Vorschlag auf Betätigung der Schaltfläche. Das Profil und die Fotos sind kein Kontext für Codex.

Beim Erfassen eines Stücks schlägt die lokale Bilderkennung Angaben aus sichtbaren Merkmalen, Etikett oder Produktseite vor. Unbelegte Stoffe oder Passformen bleiben offen. Gewichte im Styling Farbkreis-Nachbarn und Ton-in-Ton für ruhige Varianten, Komplementärfarben als dosierten Akzent für auffällige Varianten. Prüfe Farben und Schnitt im Zusammenhang mit Anlass und Stil.

Für ein wetterbezogenes Outfit löst der Hub den im Dialog oder im Studio angegebenen Ort auf. Verwende aktuelle und vorhergesagte Temperaturen, Niederschlag und Wind. Datumsbezug und Wetterstand gehören zum Ergebnis. Wenn der Ort fehlt, darf der Chat ihn erfragen.

Unter Outfit-Assistent → Einstellungen pflegt der Nutzer Passform, Stil und Referenzfoto. Ohne Stilauswahl im Auftrag gilt der gespeicherte bevorzugte Stil. Sortiere bekannte Größen und passende Schnitte bei der Auswahl höher, wenn Angaben an einem gespeicherten Teil vorhanden sind. Proportionen liefern optionale Silhouettenhinweise. Ein Referenzfoto bleibt als lokale visuelle Referenz gespeichert.

Nutze im Outfit-Assistenten die tatsächlich gespeicherten Kleidungsstücke, einschließlich Marke, Modell, Farbe, Material und Passform. Beim Fotoimport sind Treffer aus dem kleinen Herstellerfoto-Katalog und Angaben auf Etiketten konkret belegt. Bloß visuell geschätzte Modelle sind Vorschläge. Persönliche Tragefotos gehören zum lokalen Lookbook.

## Pflichtteil und Wetter

Wenn „mit meiner schwarzen Jeans“ ein konkretes Pflichtteil benennt, bewahre den Wortlaut und gib die Auswahl an den Hub. Falls mehrere lokale Stücke passen, muss die Person wählen. Ohne Ort und ohne Wetterwunsch kann ein Outfit auf Basis von Anlass und Vorrat entstehen. [Styling-Runtime](../../../../hub/runtime/outfits.ts)

## Aufbau, Farben und Anlass

Ein Look besteht in dieser Reihenfolge aus T-Shirt oder Langarmshirt, Pullover, Hose, Jacke, Schuhen und Accessoires. Unter jedem Pullover liegt ein T-Shirt oder Langarmshirt, bei Kälte bevorzugt ein Langarmshirt. Ein Langarm-Henley allein braucht keinen Pullover darüber.

Stimme die Farben als Palette ab. Neutraltöne wie Schwarz, Grau, Ecru, Beige, Braun, Camel, Marine und Denim verbinden alles. Ton-in-Ton und Farbkreis-Nachbarn wirken ruhig. Ein Komplementärkontrast ist nur im auffälligen Stil erlaubt und bleibt ein dosierter Akzent. Zwei Farben, die weder benachbart noch komplementär sind, etwa Blau und Weinrot, kombinierst du nicht. Erkenne mehrfarbige und gemusterte Teile (kariert, gestreift, Print) und kombiniere höchstens ein gemustertes Teil mit ruhigen Neutraltönen. Mehr als zwei Akzentfarben gibt es nur im auffälligen Stil.

Nenne an jedem Teil den passenden Anlass, etwa „Alltag · Uni“, „Büro · Dinner“, „Abends · Ausgehen“ oder „Kalte Tage · Alltag“. Die Überschrift ist kurz und persönlich, etwa „Dein Look für kühle Tage“ oder „Dein Look für das Abendessen“. Der Stilname steht nicht in der Überschrift. Der Text darunter beschreibt in einem Satz die Farbidee. Größen- und Passformhinweise gehören zu den Styling-Tipps.

## Duftwahl

Beschreibe jeden Duft konkret nach seinen Noten und seiner Konzentration: wofür er sich eignet, wie intensiv er ist mit der passenden Zahl an Sprühstößen, zu welcher Tageszeit er am besten wirkt und in welchen Jahreszeiten. Frische Zitrus- und Aquanoten passen zu Sport, Uni und warmen Tagen. Süße Noten wie Vanille, Tonka oder Honig passen zu Dates und kühlen Abenden. Oud, Leder, Tabak und Weihrauch sind für Feiern und Winterabende. Pudrige Iris passt zu Dinner und eleganten Abenden. Sehr kräftige Düfte empfiehlst du nicht tagsüber und nicht fürs Büro. Kombinationshinweise beziehen sich auf vorhandene Kleidung wie Strick, Denim, Henley-Shirts oder Leder. Ein Sakko wird nicht vorgeschlagen.

