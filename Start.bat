@echo off
chcp 65001 > nul
setlocal
cd /d "%~dp0"

echo ========================================
echo MealPilot starten
echo ========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden.
  echo Bitte installiere Node.js LTS von https://nodejs.org/
  echo Danach diese Start.bat erneut ausfuehren.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installiere Haupt-Abhaengigkeiten...
  call npm install
  if errorlevel 1 goto error
)

if not exist backend\node_modules (
  echo Installiere Backend-Abhaengigkeiten...
  call npm install --prefix backend
  if errorlevel 1 goto error
)

if not exist frontend\node_modules (
  echo Installiere Frontend-Abhaengigkeiten...
  call npm install --prefix frontend
  if errorlevel 1 goto error
)

echo.
echo Starte MealPilot...
echo Lokaler PC:   http://localhost:5173
echo Handy/iPad:   http://DEINE-LOKALE-IP:5173
echo.
echo Tipp: Deine lokale IP findest du mit: ipconfig
echo Suche nach IPv4-Adresse, z.B. 192.168.178.xx
echo.
echo Dieses Fenster offen lassen. Mit STRG+C beenden.
echo.
call npm run dev
if errorlevel 1 goto error
exit /b 0

:error
echo.
echo Es ist ein Fehler aufgetreten.
echo Pruefe, ob Node.js installiert ist und ob Port 5173/3001 frei ist.
pause
exit /b 1
