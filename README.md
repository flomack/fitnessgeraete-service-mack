# Fitnessgeräte Service Mack

Website mit Störungsmeldung („Problem melden“ für Reparaturen, „Service“ für alles andere) und Auftrags-Backend (Kanban-Board).

## Starten
```bash
ADMIN_PASSWORD=dein-passwort node server.js
```
Node ≥ 22.5, keine weiteren Pakete. Danach: Website `http://localhost:3000`, Backend `/admin`.
`node seed.js` legt Demo-Aufträge an.

## Aufbau
- `public/` – Startseite, Formular (`melden.html`, gleiche Datei für `/melden` und `/service`), Backend (`admin.html`)
- `server.js` – Server, API, SQLite (`data/`, nicht im Repository)

Daten (Aufträge, Kundenfotos) liegen nur in `data/` und gehören nie ins Repository.
