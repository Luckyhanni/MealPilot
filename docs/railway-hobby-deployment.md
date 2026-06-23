# Railway Hobby Deployment

Diese Anleitung beschreibt das dauerhafte Hosting von MealPilot auf Railway Hobby. Die Domain kann weiterhin bei STRATO bleiben und wird nur per DNS auf Railway verbunden.

## Ziel-Setup

```txt
STRATO Domain
   ↓ DNS
Railway Web Service
   ↓ Express Backend
React/Vite Frontend aus frontend/dist
   ↓ runtime data
Supabase mealpilot_data
```

MealPilot wird auf Railway als ein Web Service deployed. Das Express-Backend startet im Production-Modus und liefert gleichzeitig das gebaute Frontend aus.

## Kostenrahmen

Railway Hobby hat einen Mindestverbrauch von 5 USD pro Monat. Darin sind 5 USD Usage Credits enthalten. Wenn MealPilot unter diesem Verbrauch bleibt, bleibt es in der Regel bei diesem Mindestbetrag. Zusätzliche Nutzung kann darüber hinaus berechnet werden.

## Railway-Projekt erstellen

1. Bei Railway einloggen.
2. Workspace auf Hobby stellen.
3. Neues Projekt erstellen.
4. `Deploy from GitHub repo` wählen.
5. Repository `Luckyhanni/MealPilot` auswählen.
6. Branch `main` auswählen, nachdem dieser PR gemerged wurde.
7. Railway erkennt die Root-`package.json`.

Die Build- und Startbefehle sind in `railway.json` festgelegt:

```txt
Build Command: npm run build
Start Command: npm start
Healthcheck Path: /
```

## Environment Variables

In Railway beim Service unter `Variables` setzen:

```env
NODE_ENV=production
USE_LOCAL_IMAGE_DOWNLOAD=false
SUPABASE_URL=<deine Supabase Project URL>
SUPABASE_SERVICE_ROLE_KEY=<dein Supabase Service Role Key>
MEALPILOT_ADMIN_PIN=<deine optionale PIN>
```

Optional für mehrere Nutzerprofile:

```env
MEALPILOT_USERS_JSON=[{"id":"johannes-sophie","name":"Johannes & Sophie","pin":"1234"}]
```

Wichtig: Der Supabase Service Role Key darf niemals ins Frontend, ins Repository oder in Screenshots. Er gehört nur als Secret/Environment Variable in Railway.

## Supabase vorbereiten

1. Supabase-Projekt öffnen.
2. SQL Editor öffnen.
3. SQL aus `docs/supabase-schema.sql` ausführen.
4. `SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` bereithalten.
5. Falls lokale Daten schon vorhanden sind, lokal einmal migrieren:

```bash
$env:SUPABASE_URL="https://dein-projekt.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="dein-service-role-key"
npm install --prefix backend
npm run migrate --prefix backend
```

PowerShell-Beispiel für Windows. In Git Bash oder macOS/Linux werden Environment Variables anders gesetzt.

## Warum Supabase wichtig ist

Railway-Deployments können lokale Dateien im laufenden Container ändern, aber diese Änderungen sind nicht als dauerhafte Datenbank gedacht. MealPilot nutzt deshalb online Supabase für Verlauf, Einstellungen, Pantry und Einkaufsliste. Der Rezeptkatalog bleibt bewusst dateibasiert und wird aus dem Repository gebaut.

## Domain bei STRATO verbinden

Empfohlene Variante:

```txt
mealpilot.deine-domain.de → Railway
```

Vorgehen:

1. In Railway Service öffnen.
2. `Settings` → `Networking` → `Public Networking`.
3. Erst `Generate Domain` nutzen, um zu prüfen, ob der Service läuft.
4. Danach `Custom Domain` hinzufügen, z. B. `mealpilot.joblank.de`.
5. Railway zeigt DNS-Einträge an.
6. Bei STRATO in der DNS-Verwaltung die angezeigten CNAME- und TXT-Einträge setzen.
7. Warten, bis DNS und SSL aktiv sind.

Für eine Subdomain wie `mealpilot.joblank.de` ist CNAME normalerweise einfacher als die Hauptdomain direkt. Die Hauptdomain kann schwieriger sein, weil dort oft bereits andere Einträge für Website oder Mail liegen.

## Nach dem Deployment prüfen

1. Railway-Logs öffnen.
2. Prüfen, ob der Build erfolgreich war.
3. Prüfen, ob `MealPilot Backend läuft auf http://localhost:<PORT>` in den Logs erscheint.
4. Railway-Domain öffnen.
5. Wochenplan generieren.
6. Einstellungen ändern.
7. Seite neu laden und prüfen, ob die Daten erhalten bleiben.
8. Optional Handy-Homescreen-Test machen.

## Häufige Fehler

### App startet, aber Daten verschwinden

Dann fehlen wahrscheinlich `SUPABASE_URL` oder `SUPABASE_SERVICE_ROLE_KEY`, oder die Tabelle `mealpilot_data` wurde in Supabase nicht erstellt.

### Build schlägt fehl

Prüfen:

```bash
npm run build
```

lokal ausführen. Wenn es lokal scheitert, erst lokal reparieren, dann deployen.

### Domain zeigt noch nicht auf Railway

DNS kann etwas dauern. Erst die automatisch generierte Railway-Domain testen. Wenn die funktioniert, liegt das Problem fast sicher bei DNS/STRATO.

### PIN funktioniert nicht

Prüfen, ob `MEALPILOT_ADMIN_PIN` oder `MEALPILOT_USERS_JSON` korrekt gesetzt ist. Nach Änderungen in Railway den Service neu deployen oder neu starten.
