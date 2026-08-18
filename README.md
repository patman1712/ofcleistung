# OFC Leistungsdiagnostik – Kickers Offenbach 1901 e.V.

> Bewertungs-Tool für den OFC: Tägliche Spielerabfragen, Trainings-Feedback und Warnsignale für den Staff/Coach.

## Automatisch, wie du's kennst ✨
**Keine extra Datenbank nötig.** Die App nutzt **SQLite** – eine einzelne Datei (`data/ofc.db`), die automatisch angelegt wird. Auf Railway wird ein permanentes Volume für `/app/data` eingehängt, so dass alle Spieler, Antworten und Einstellungen auch nach Deploys erhalten bleiben. DB-Schema, Admin-Account und Beispielfragen werden **beim ersten Start automatisch** angelegt.

---

## Features

- **Admin / Staff** (`/admin`)
  - Spieler anlegen, bearbeiten, löschen (Login, Name, Geburtsdatum, Größe, Gewicht, Position)
  - Tägliche Fragen hinterlegen (Bewertung 1-10 **oder** Textfeld), tägliche Uhrzeit definieren
  - Trainings anlegen: Spieler zuweisen + individuelle Fragen pro Training (1-10 oder Text)
  - Auswertungen pro Spieler (Ø-Bewertungen, Verlauf der letzten 30 Tage, Trainings-Antworten)
  - Warnsignale konfigurieren (Schwellwert + „n-x-Mal in Folge") + manuell prüfen + erledigen
- **Spieler** (`/player`)
  - Bei Login wird **sofort** auf die noch offene tägliche Abfrage verwiesen (wenn noch unbeantwortet)
  - Danach werden ausstehende Trainings-Fragen (nach Trainingsende) **erzwungenermaßen** als erster Screen angezeigt
  - 1-10 Bewertungs-Buttons und optionales Bemerkungsfeld je Formular
  - Profil-Ansicht
- **Design**: Rot/Weiß in OFC-Clubfarben (`#E30613`) + Logo auf Login, Header, Favicon, Homescreen
- **Tech**: Node.js + Express + Prisma + **SQLite (automatisch)** · React 18 + Vite + TypeScript + Tailwind · JWT (HttpOnly-Cookie) · bereit für Railway (1-Klick Deploy)

---

## 1. Lokal entwickeln

### Voraussetzungen
- Node.js 20+ (mehr nichts – DB ist Datei-basiert!)

### Schritte
```bash
# 1. Dependencies installieren
npm install
cd client && npm install && cd ..

# 2. Env anlegen (Default-Werte passen bereits für SQLite!)
cp .env.example .env

# 3. DB automatisch aufbauen + Admin + Beispielfragen anlegen
npm run prisma:push
npm run seed

# 4. Dev-Server starten (Frontend + Backend parallel)
npm run dev
```
- Frontend: http://localhost:5173 (leitet `/api` an Backend weiter)
- Backend:  http://localhost:3000
- DB-Datei liegt unter `data/ofc.db`

**Test-Login (wird automatisch angelegt):**
- Admin: `admin@ofc.de` / `OFCkickt1901!`

---

## 2. Auf Railway deployen (1 Klick)

1. **GitHub-Repo erstellen** und Projekt pushen.
2. In Railway **+ New Project → Deploy from GitHub repo** auswählen.
3. **Keine weitere Datenbank nötig!** SQLite läuft automatisch im Container, Volume wird per `railway.json` eingehängt.
4. (Optional) Unter **Variables** `JWT_SECRET` auf ein langes zufälliges Passwort setzen (`openssl rand -hex 32`). Wenn leer, funktioniert es trotzdem – für die Produktion aber bitte setzen!
5. **Deploy starten**. Beim ersten Boot passiert automatisch:
   - DB-Datei (`data/ofc.db`) im Volume angelegt
   - Schema per `prisma db push` erstellt
   - Seed (Admin + 4 Standardfragen + Warnsignal-Regel) ausgeführt
   - App auf Port 3000 gestartet
6. **Custom Domain** (optional) in Railway unter **Settings → Networking** eintragen → HTTPS automatisch.
7. Domain aufrufen → mit `admin@ofc.de` / `OFCkickt1901!` einloggen → direkt loslegen.

### Hinweise
- **Daten-Persistenz**: Das Volume `ofc-sqlite-data` (siehe `railway.json`) sorgt dafür, dass die DB auch nach Rebuilds/Deploys/Restarts erhalten bleibt.
- **Warnsignale** werden bei jedem Aufruf der Auswertungen oder per Klick auf „Jetzt prüfen" neu berechnet. Für automatische Checks kann ein Railway-Cron (`Schedules`) alle paar Stunden `POST /api/alerts/check` triggern.

---

## 3. Wichtige Seiten

| URL               | Rolle    | Funktion                                   |
| ----------------- | -------- | ------------------------------------------ |
| `/login`          | jedermann| Login-Seite (OFC-Branding)                 |
| `/admin`          | Admin    | Dashboard mit Kennzahlen + Warnungen       |
| `/admin/players`  | Admin    | Spielerverwaltung                          |
| `/admin/daily-questions` | Admin | Tägliche Fragen + Wiederholungszeit |
| `/admin/trainings`| Admin    | Trainings anlegen + Fragen + Spieler       |
| `/admin/evaluations` | Admin | Pro-Spieler Detailauswertungen       |
| `/admin/alerts`   | Admin    | Warnsignal-Konfiguration + offene Alerts   |
| `/player`         | Spieler  | Spieler-Start (wird automatisch zu offenen Fragen geleitet) |
| `/player/daily`   | Spieler  | Tägliche Abfrage (erzwungen, wenn offen)   |
| `/player/training/:id` | Spieler | Trainings-Feedback nach Training    |

---

## 4. Projektstruktur

```
OFC Leistungsdiagnostik
├── client/                         # Frontend (React + Vite + Tailwind)
│   ├── index.html
│   ├── public/
│   │   ├── logo.svg                # OFC Logo + Favicon + Homescreen-Icon
│   │   └── favicon.svg
│   └── src/
│       ├── App.tsx                 # Routing + Rollen-Guards + Spieler-Zwangsumleitung
│       ├── main.tsx
│       ├── index.css               # Tailwind + OFC-Rot-Weiß Theme
│       ├── components/             # Layout, RatingButtons, ...
│       ├── context/AuthContext.tsx
│       ├── lib/api.ts              # axios mit JWT
│       └── pages/                  # admin/* + player/* + Login
├── src/                            # Backend (Express + Prisma + JWT)
│   ├── server.ts                   # Entry Point + Static Serving
│   ├── middleware/auth.ts
│   ├── lib/prisma.ts
│   └── routes/                     # auth, players, dailyQuestions, trainings, evaluations, alerts
├── prisma/
│   ├── schema.prisma               # SQLite Schema
│   ├── seed.ts                     # Admin + Standardfragen + Warnsignal
│   └── migrations/
├── data/                           # ← SQLite DB-Datei (hier: ofc.db)
├── package.json
├── Dockerfile
├── railway.json                    # Volume mountet /app/data
└── .env.example
```

---

## 5. Nützliche Skripte

| Script                 | Beschreibung                                                              |
| ---------------------- | ------------------------------------------------------------------------- |
| `npm run dev`          | Backend (3000) + Frontend (5173) parallel im Watch + `data/` Ordner       |
| `npm run build`        | Frontend + Backend bauen                                                  |
| `npm run start`        | Produktiv-Start (benötigt gebauten Client + Dist)                         |
| `npm run prisma:push`  | SQLite-Schema automatisch anlegen/aktualisieren (statt Migrations)        |
| `npm run seed`         | Admin + Beispielfragen + Standard-Warnsignal einfügen                     |
| `npm run start:prod`   | Kompletter Produktiv-Start: DB → Push → Seed → App (genutzt im Dockerfile)|

---

Viel Erfolg mit dem OFC Leistungstool! 🔴⚪⚽
