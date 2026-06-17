# Projektstruktur

```txt
MealPilot/
├─ Start.bat
├─ package.json
├─ backend/
│  ├─ src/server.ts
│  └─ data/
│     ├─ recipes.json
│     ├─ history.json
│     └─ settings.json
└─ frontend/
   ├─ src/main.tsx
   ├─ src/styles.css
   └─ public/images/
```

## Backend

Express-API mit lokaler JSON-Speicherung.

Wichtige Endpunkte:

- `POST /api/plans/generate`
- `GET /api/plans/latest`
- `POST /api/plans/:planId/remix`
- `GET /api/plans/:planId/shopping-list`

## Frontend

React/Vite-App mit normaler Ansicht, Einkaufsliste und Druckansicht.

## Lokaler Zugriff im WLAN

Vite läuft mit `--host 0.0.0.0`, dadurch kann ein Handy im gleichen WLAN über die IPv4-Adresse des PCs zugreifen.
