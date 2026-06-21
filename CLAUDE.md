# MealPilot – Projekt-Guidelines für Codex & Claude Code

Diese Datei ist die Arbeitsgrundlage für alle zukünftigen Änderungen an MealPilot. Vor jeder Änderung müssen Codex, Claude Code oder andere KI-Assistenten diese Datei lesen und die Regeln berücksichtigen.

## 1. Projektziel

MealPilot ist eine persönliche Wochenplanungs-App für Essen, Rezepte und Einkauf. Die App soll aus vorhandenen Rezepten und importierten Rezept-/Bilddaten einen übersichtlichen Wochenplan erstellen.

Kernidee:

- Wochenplan mit 2 Mahlzeiten pro Tag
- Shake-Vorschläge als Ergänzung
- Remix-Funktion für neue Kombinationen
- Kochansicht für die praktische Nutzung beim Kochen
- Einkaufsansicht bzw. Einkaufsliste
- Druckansicht für den Kühlschrank
- Import von HelloFresh-Bildern bzw. Rezeptbildern, sofern Links vorhanden sind
- möglichst einfache Nutzung ohne unnötige Komplexität

Die App soll sich wie ein kleines, fertiges Produkt anfühlen, nicht wie ein technischer Prototyp.

## 2. Wichtigste Regel: Mobile First

MealPilot wird primär auf iPhone und iPad genutzt. Desktop ist wichtig, aber sekundär.

Bei jeder UI-Änderung gilt:

1. Zuerst iPhone-Portrait prüfen.
2. Danach iPad-Portrait und iPad-Landscape prüfen.
3. Danach Desktop prüfen.
4. Keine Änderung gilt als fertig, wenn sie mobil kaputt aussieht.

Mindestanforderungen:

- keine horizontale Scrollbar auf iPhone
- keine abgeschnittenen Texte oder Buttons
- keine überlappenden Cards, Tabs, Header oder Popups
- gut klickbare Touch-Flächen, idealerweise mindestens 44 x 44 px
- Formulare und Eingabefelder auf iOS mindestens 16 px Schriftgröße, damit Safari nicht automatisch reinzoomt
- wichtige Aktionen müssen mit dem Daumen erreichbar sein
- Navigation darf auf kleinen Geräten nicht zu breit werden
- iPhone-Safe-Areas berücksichtigen, z. B. mit `env(safe-area-inset-bottom)` bei fixierten unteren Elementen

## 3. Designrichtung

MealPilot soll nicht komplett neu gestaltet werden. Änderungen sollen die vorhandene Richtung verbessern, nicht ersetzen.

Aktuelle Designrichtung:

- hell, ruhig, freundlich
- grün/natürlich/food-orientiert
- moderne, weiche Cards
- klare Pill-Buttons und Tabs
- wenig visuelle Unruhe
- eher Apple-/HelloFresh-inspiriert, aber eigenständig

Bei Designänderungen:

- bestehende Farbstimmung erhalten
- keine radikalen Redesigns ohne ausdrückliche Freigabe
- keine überladenen Tabellen auf Mobile
- lieber klare Cards, Sektionen und kurze Texte
- Hauptaktionen deutlich machen
- Sekundäraktionen zurückhaltender darstellen
- Abstände auf Mobile bewusst kleiner, aber nicht gequetscht

## 4. Projekt nicht unnötig umbauen

MealPilot soll Schritt für Schritt verbessert werden. Keine großen Architektur-Rewrites ohne klaren Grund.

Vor jeder größeren Änderung:

- bestehende Dateistruktur prüfen
- bestehende Komponenten und Patterns wiederverwenden
- keine funktionierenden Features entfernen
- keine Storage-/Datenlogik austauschen, wenn es nicht ausdrücklich verlangt wurde
- keine neuen großen Libraries hinzufügen, wenn CSS/kleine Komponenten reichen
- keine künstliche Komplexität einbauen

Wenn eine Änderung größer wird, soll sie in kleine Schritte aufgeteilt werden.

## 5. Geräte- und Layout-Guidelines

### iPhone

- Primäransicht: Portrait
- Inhalte als vertikale Cards/Sections aufbauen
- Hauptnavigation kompakt halten
- Tabs dürfen horizontal scrollen, aber sollen klar und sauber aussehen
- Buttons über die volle Breite sind oft sinnvoll
- keine breiten Tabellen
- Wochenplan als Tages-Cards statt Desktop-Tabelle darstellen
- wichtige Buttons nicht ganz unten verstecken, wenn sie durch Browserleisten schwer erreichbar werden

### iPad

- iPad ist kein kleiner Desktop, sondern ein eigenes wichtiges Zielgerät
- Portrait und Landscape prüfen
- Landscape darf mehrspaltig sein, aber nur wenn es wirklich lesbarer wird
- Cards dürfen größer und luftiger sein
- Kochmodus muss auf iPad besonders gut lesbar sein
- Druck-/Planungsansicht darf auf iPad näher an Desktop liegen, aber ohne überladene UI

### Desktop

- Desktop darf großzügiger sein
- Desktop darf Tabellen oder mehrspaltige Ansichten nutzen
- Desktop darf nicht die mobile Struktur kaputt diktieren
- Wenn nötig, Desktop als Erweiterung des Mobile-Layouts betrachten, nicht umgekehrt

## 6. Navigation

Die Navigation muss auf kleinen Screens stabil bleiben.

Regeln:

- Keine Tabs, die sich gegenseitig zusammendrücken, bis Texte unlesbar werden.
- Icons und Texte dürfen auf sehr kleinen Screens angepasst werden.
- Aktiver Tab muss eindeutig erkennbar sein.
- Hauptbereiche sollten klar getrennt bleiben, z. B. Start, Wochenplan, Einkauf, Einzelgerichte/Rezepte.
- Mobile Navigation darf horizontal scrollen, wenn sie sauber und bewusst gestaltet ist.
- Navigation darf keine Inhalte überdecken.

## 7. Wochenplan-Logik

Der Wochenplan ist das zentrale Feature.

Standard-Ziel:

- 7 Tage
- 2 Mahlzeiten pro Tag
- Nährwerte sichtbar: kcal, Protein, Dauer
- optional Shake-Vorschlag
- klare Tagesstruktur
- keine unnötig komplexe Planung

Bei neuen Features:

- Wiederholungen vermeiden, soweit sinnvoll möglich
- vergangene Wochen bzw. bereits verwendete Rezepte berücksichtigen, wenn Daten dafür vorhanden sind
- Remix-Funktion soll Varianten erzeugen, ohne den ganzen Plan unkontrolliert zu zerstören
- Änderungen am Plan sollen nachvollziehbar bleiben
- Nutzer soll einzelne Mahlzeiten ersetzen können, ohne alles neu zu generieren

## 8. Einkaufsliste

Die Einkaufsliste soll praktisch und schnell nutzbar sein.

Regeln:

- Zutaten nach Kategorien gruppieren, wenn Daten vorhanden sind
- Mengen möglichst klar anzeigen
- abhakbare Einträge mobil gut bedienbar machen
- keine winzigen Checkboxen
- Einkaufsliste soll auf iPhone im Supermarkt funktionieren
- Mengenberechnung nicht hart verdrahten, sondern nachvollziehbar und später anpassbar halten

Portionen:

- MealPilot kann für mehrere Personen genutzt werden.
- Ein zusätzlicher Personen-/Partnerfaktor soll möglich bleiben.
- Falls ein Standardfaktor genutzt wird, soll er konfigurierbar bleiben und nicht tief im Code versteckt sein.

## 9. Kochmodus

Der Kochmodus ist für die Nutzung in der Küche gedacht.

Regeln:

- große, gut lesbare Schrift
- klare Schritte
- wenig Ablenkung
- keine unnötig kleinen Buttons
- auf iPad besonders sauber darstellen
- Screen soll beim Kochen möglichst schnell erfassbar sein
- Zutaten und Schritte müssen sinnvoll getrennt sein
- optional später: Timer, Schritt-für-Schritt-Modus, Portionen anpassen

## 10. Druckansicht

Die Druckansicht ist für den Kühlschrank gedacht.

Regeln:

- A4-tauglich
- übersichtlich, nicht überladen
- Wochenübersicht mit Gerichtsnamen
- kcal, Protein und Dauer sichtbar, wenn vorhanden
- Navigation, Buttons und App-Chrome im Druck ausblenden
- keine abgeschnittenen Cards beim Drucken
- Print-CSS aktiv pflegen
- Druckansicht soll auch als PDF gut aussehen

## 11. Rezept- und Bildimport

MealPilot kann Rezeptbilder bzw. HelloFresh-Bilder aus vorhandenen Links importieren und lokal speichern, wenn möglich.

Regeln:

- Import robust bauen, nicht direkt in UI-Logik mischen
- fehlende Bilder sauber behandeln
- Fallback-Bild oder neutralen Platzhalter verwenden
- keine kaputten Bildicons anzeigen
- Bild-URLs und lokale Pfade klar trennen
- Importstatus verständlich anzeigen
- bei öffentlichen Deployments keine fremden urheberrechtlich geschützten Assets unnötig fest ins Repo committen
- lokale/private Nutzung und öffentliche Demo sauber unterscheiden

## 12. Datenhaltung und Login

MealPilot soll auch ohne komplizierten Login nutzbar bleiben, sofern die aktuelle Architektur das vorsieht.

Regeln:

- Kein Login-Zwang einbauen, solange nicht ausdrücklich gewünscht.
- Lokale Daten bzw. bestehende Datenhaltung respektieren.
- Wenn Supabase oder eine andere Online-Datenbank bereits genutzt wird, bestehende Struktur prüfen und nicht blind ersetzen.
- Keine API-Keys oder Secrets ins Repository schreiben.
- `.env`-Dateien nicht committen.
- Beispielwerte nur in `.env.example` ablegen.

## 13. Responsive UI-Regeln

Bei jeder neuen Komponente:

- Mobile-Zustand zuerst entwerfen
- danach Tablet-Erweiterung
- danach Desktop-Erweiterung
- Container mitdenken, nicht nur das einzelne Element
- keine fixen Breiten, die auf iPhone brechen
- `max-width`, `minmax`, `clamp`, `flex-wrap` und CSS Grid bewusst nutzen
- lange Texte umbrechen lassen
- Buttons und Cards müssen mit langen deutschen Wörtern funktionieren
- keine UI, die nur mit perfektem Demo-Text funktioniert

Empfohlene Prüfgrößen:

- 375 px Breite: kleines iPhone
- 390–430 px Breite: moderne iPhones
- 768 px Breite: iPad Portrait
- 1024 px Breite: iPad Landscape
- 1280 px und größer: Desktop

## 14. Barrierefreiheit und Bedienbarkeit

Regeln:

- semantische HTML-Elemente nutzen
- Buttons als Buttons, Links als Links
- ausreichende Kontraste
- sichtbare Fokuszustände
- Bilder mit sinnvollen Alt-Texten oder leerem Alt-Text bei rein dekorativen Bildern
- keine wichtigen Informationen nur über Farbe vermitteln
- Modal-/Popup-Elemente müssen per Tastatur nutzbar bleiben
- Touch- und Mausbedienung gleichermaßen berücksichtigen

## 15. Performance

MealPilot soll schnell und leicht bleiben.

Regeln:

- Bilder optimieren und passend skalieren
- Lazy Loading nutzen, wo sinnvoll
- keine großen Libraries für kleine UI-Probleme einbauen
- unnötige Re-Renders vermeiden
- Listen bei vielen Rezepten performant halten
- Build-Größe im Blick behalten
- keine unnötigen Netzwerkrequests beim Start

## 16. Codequalität

Regeln:

- vorhandenen Tech-Stack respektieren
- vorhandene Komponenten wiederverwenden
- klare Komponentenstruktur
- keine riesigen Dateien weiter aufblähen, wenn Aufteilung sinnvoll ist
- Typen/Interfaces nutzen, falls TypeScript vorhanden ist
- keine `any`-Workarounds ohne Grund
- keine duplizierte Business-Logik in mehreren Komponenten
- Utility-Funktionen für wiederverwendbare Berechnungen
- klare Namen für Funktionen, Komponenten und Zustände
- Kommentare nur dort, wo sie wirklich helfen

## 17. KI-/Codex-/Claude-Arbeitsregeln

Für KI-Assistenten gilt bei jeder Aufgabe:

1. Diese Datei zuerst lesen.
2. Ziel der Aufgabe kurz verstehen.
3. Bestehende Dateien prüfen, bevor Code geändert wird.
4. Keine unnötigen Komplett-Rewrites.
5. Mobile First umsetzen.
6. iPhone- und iPad-Auswirkungen mitdenken.
7. Nach Änderungen Build/Lint/Test ausführen, sofern Befehle vorhanden sind.
8. Am Ende kurz nennen:
   - geänderte Dateien
   - was geändert wurde
   - wie Mobile/iPad berücksichtigt wurde
   - welche Tests/Checks ausgeführt wurden

Wenn eine Aufgabe zu groß ist:

- in sinnvolle Teilschritte aufteilen
- zuerst die kleinste stabile Verbesserung liefern
- keine halbfertigen großen Umbauten hinterlassen

## 18. Deployment und Domain

MealPilot kann online laufen und soll grundsätzlich deploybar bleiben.

Regeln:

- Deployment-Konfiguration nicht kaputtmachen
- bestehende Plattformen wie Render/Supabase nur ändern, wenn ausdrücklich gewünscht
- Domain-/Branding-Bezug zu `mealpilots.de` berücksichtigen, falls im Projekt genutzt
- keine lokalen absoluten Pfade verwenden
- keine Secrets committen
- `.env.example` aktuell halten, wenn neue Env-Variablen nötig sind

## 19. Qualitätssicherung vor Abschluss einer Änderung

Vor Abschluss jeder UI-Änderung prüfen:

- iPhone-Portrait funktioniert
- iPad-Portrait funktioniert
- iPad-Landscape funktioniert
- Desktop funktioniert
- keine horizontale Scrollbar
- keine abgeschnittenen Buttons
- keine überlappenden Texte
- Navigation bleibt nutzbar
- Hauptaktion ist klar sichtbar
- Druckansicht wurde nicht versehentlich beschädigt, wenn Wochenplan/Layout betroffen ist

Vor Abschluss jeder Logik-Änderung prüfen:

- bestehende Daten laden weiterhin
- Wochenplan wird weiterhin erzeugt
- Einkaufsliste bleibt nachvollziehbar
- fehlende Rezeptdaten führen nicht zu Abstürzen
- fehlende Bilder werden sauber abgefangen
- Build läuft erfolgreich

## 20. Grundsatz

MealPilot soll Schritt für Schritt zu einer schönen, praktischen und mobilen Essensplanungs-App werden. Jede Änderung soll die App stabiler, klarer oder nützlicher machen. Mobile Nutzung auf iPhone und iPad hat Vorrang vor Desktop-Optimierung.
