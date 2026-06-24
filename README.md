# MealPilot

Lokale Web-App für deinen HelloFresh-/Essens-Wochenplan. In der lokalen Entwicklung nutzt MealPilot JSON-Dateien unter `backend/data/`. Online kann dieselbe App auf Render laufen und ihre Daten in Supabase speichern.

## Start

1. ZIP entpacken.
2. `Start.bat` doppelklicken.
3. Browser öffnen: `http://localhost:5173`

Alternativ:

```bash
npm run install:all
npm run dev
```

Beim ersten Start werden die Node-Abhängigkeiten installiert. Dafür brauchst du einmal Internet und Node.js LTS.

## Handy/iPad im gleichen WLAN

1. App am PC starten.
2. In Windows `cmd` öffnen.
3. `ipconfig` eingeben.
4. IPv4-Adresse suchen, z. B. `192.168.178.35`.
5. Am Handy/iPad öffnen: `http://192.168.178.35:5173`

## Funktionen

- Wochenplan mit 7 Tagen und 2 Mahlzeiten pro Tag
- Remix pro Gericht mit Slot-Historie
- gezielt ändern: eigenes Rezept aus der Datenbank suchen und in einen Slot einsetzen
- Gerichte per Drag-and-drop tauschen
- Rezept anklicken und Kochansicht öffnen
- Import von HelloFresh-Bildern, Zutaten und Kochschritten
- Einkaufsliste als Gesamtwoche, Mo-Do und Fr-So
- Einkaufsliste mit groben Preis-Schätzungen
- Habe-ich-zuhause-Liste
- gespeicherter Verlauf
- Druckansicht mit Hochkant-/Querformat-Umschalter

## Daten

Ohne Supabase-Environment-Variablen nutzt das Backend lokale Dateien:

```txt
backend/data/recipes.json
backend/data/history.json
backend/data/settings.json
backend/data/pantry.json
backend/data/shoppingState.json
```

Wenn `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` gesetzt sind, nutzt das Backend die Supabase-Tabelle `mealpilot_data`. Der Service Role Key bleibt ausschließlich im Backend/Render-Environment und darf nicht ins Frontend.

HelloFresh-Bilder werden standardmäßig als externe URLs gespeichert. Nur wenn `USE_LOCAL_IMAGE_DOWNLOAD=true` gesetzt ist, lädt das Backend importierte Bilder lokal nach `frontend/public/images/hellofresh/`.

## Produktion lokal testen

```bash
npm run build
npm start
```

Danach läuft das Express-Backend auf `http://localhost:3001` und liefert das gebaute Frontend aus `frontend/dist` aus.

Hinweis: Browser und mobile Homescreen-Verknüpfungen können App-Icons cachen. Nach Icon-Änderungen zum Testen ggf. die Homescreen-Verknüpfung löschen und neu hinzufügen oder den Browser-Cache leeren.

## Online Hosting auf Railway + Supabase

1. Supabase Projekt erstellen.
2. In Supabase den SQL Editor öffnen.
3. SQL aus `docs/supabase-schema.sql` ausführen.
4. In Supabase die Project URL und den Service Role Key holen.
5. Lokale Daten migrieren:

```bash
npm install --prefix backend
npm run migrate --prefix backend
```

Dabei müssen `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` in deiner Shell gesetzt sein. Keine echten Keys in Dateien committen.

6. GitHub Repo pushen.
7. In Railway einen Service für dieses Repo erstellen.
8. Railway Einstellungen:

```txt
Build Command: npm run build
Start Command: npm start
```

9. Render Environment Variables:

```env
SUPABASE_URL=<deine Supabase Project URL>
SUPABASE_SERVICE_ROLE_KEY=<dein Service Role Key>
NODE_ENV=production
USE_LOCAL_IMAGE_DOWNLOAD=false
MEALPILOT_ADMIN_PIN=
MEALPILOT_DEMO_ENABLED=true
MEALPILOT_DEMO_PATH=<geheimer-portfolio-pfad>
MEALPILOT_SESSION_SECRET=<langes-zufaelliges-secret>
```

`MEALPILOT_ADMIN_PIN` ist optional. Wenn ein Wert gesetzt ist, zeigt das Frontend eine PIN-Abfrage. Nach erfolgreicher Prüfung verwendet die App eine serverseitig signierte Sitzung. Für Produktion sollte `MEALPILOT_SESSION_SECRET` als langes, zufälliges Secret gesetzt werden.

Mit `MEALPILOT_DEMO_ENABLED=true` und `MEALPILOT_DEMO_PATH` wird eine separate, nicht verlinkte Portfolio-Demo aktiviert. Die normale MealPilot-Anmeldung zeigt keinen Demo-Button. Der Portfolio-Link besteht aus der Railway-Domain und dem geheimen Pfad, beispielsweise `https://deine-app.up.railway.app/<geheimer-portfolio-pfad>`. Jeder Aufruf erstellt einen eigenen Demo-Bereich mit einem fertigen Wochenplan. Planen, Remixen, Einkauf, Verlauf, Einstellungen und Kochansicht funktionieren normal. Globale Rezeptimporte sind im Demo-Zugang gesperrt, damit Besucher den gemeinsamen Rezeptbestand nicht verändern. Demo-Sitzungen laufen nach 24 Stunden ab; ältere Demo-Daten werden automatisch bereinigt.

Für mehrere PIN-Profile kann stattdessen `MEALPILOT_USERS_JSON` als Environment Variable beim Hoster gesetzt werden. Echte Werte gehören als Secret/Env-Var in Render oder den jeweiligen Hoster, nicht in committete Dateien und nicht ins Frontend.

Format:

```json
[
  { "id": "demo-family", "name": "Demo Familie", "pin": "0000" },
  { "id": "demo-user", "name": "Demo User", "pin": "1111" }
]
```

Lokale Entwicklung kann weiterhin `backend/data/users.local.json` verwenden. Eine Vorlage mit Fake-PINs liegt in `backend/data/users.example.json`.

Hinweise:

- Railway-Instanzen und Deployments können neu gestartet werden.
- Lokale Dateiänderungen auf Railway sind kein verlässlicher dauerhafter Speicher.
- MealPilot speichert Online-Daten deshalb in Supabase.
- Der Supabase Service Role Key darf niemals ins Frontend oder ins Repository.

## Wichtig

Die Preise sind grobe Standard-/REWE-Schätzwerte, keine Live-Preise. Fleisch wird in der Kostenlogik auf 0 EUR gesetzt. HelloFresh-Seiten können ihren Aufbau ändern; falls ein Import für ein Rezept scheitert, bleibt der Original-Link in der Kochansicht verfügbar.
