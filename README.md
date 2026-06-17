# MealPilot

Lokale Web-App für deinen HelloFresh-/Essens-Wochenplan.

## Start

1. ZIP entpacken.
2. `Start.bat` doppelklicken.
3. Browser öffnen: `http://localhost:5173`

Beim ersten Start werden die Node-Abhängigkeiten installiert. Dafür brauchst du einmal Internet und Node.js LTS.

## Handy/iPad im gleichen WLAN

1. App am PC starten.
2. In Windows `cmd` öffnen.
3. `ipconfig` eingeben.
4. IPv4-Adresse suchen, z. B. `192.168.178.35`.
5. Am Handy/iPad öffnen: `http://192.168.178.35:5173`

## Funktionen

- Wochenplan mit 7 Tagen und 2 Mahlzeiten pro Tag
- kompaktere Ansicht, damit möglichst alle Tage auf eine Seite passen
- verbesserter Remix pro Gericht mit Slot-Historie, damit nicht immer dieselben zwei Gerichte kommen
- gezielt ändern: eigenes Rezept aus der Datenbank suchen und in einen Slot einsetzen
- Rezept anklicken und Kochansicht öffnen
- Import von HelloFresh-Bildern und, wenn auslesbar, Kochschritten
- Thermomix-/TM-Schritte werden beim Import bewusst herausgefiltert
- Einkaufsliste als Gesamtwoche, Mo–Do und Fr–So
- Einkaufsliste mit groben Preis-Schätzungen
- Fleischkosten werden mit 0 € gerechnet, weil Fleisch über die Metzgerei der Eltern kommt
- Rezeptkarten zeigen grobe Kosten pro Portion für dich
- Druckansicht mit Hochkant-/Querformat-Umschalter

## Daten

Die lokalen Daten liegen in:

```txt
backend/data/recipes.json
backend/data/history.json
backend/data/settings.json
```

Bilder liegen in:

```txt
frontend/public/images/
frontend/public/images/hellofresh/
```

## Wichtig

Die Preise sind grobe Standard-/REWE-Schätzwerte, keine Live-Preise. Fleisch wird in der Kostenlogik auf 0 € gesetzt. HelloFresh-Seiten können ihren Aufbau ändern; falls ein Import für ein Rezept scheitert, bleibt der Original-Link in der Kochansicht verfügbar.







## Neu in v9

- Gerichte können jetzt per Drag-and-drop verschoben werden.
- Ziehe eine Rezeptkarte auf einen anderen Slot, dann werden die beiden Gerichte getauscht.
- Die Änderung wird serverseitig im aktuellen Wochenplan gespeichert.
- Nach dem Tausch werden Tageskalorien, Protein und Shake-Empfehlung automatisch neu berechnet.

Hinweis: Auf Touch-Geräten kann Browser-Drag-and-drop je nach iPad/Browser unterschiedlich reagieren. Am PC funktioniert es am zuverlässigsten. Für iPad bleibt weiterhin „Ändern“ als sichere Alternative.
