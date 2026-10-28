# Fitnessgeräte Service Mack

Website mit Störungsmeldung („Problem melden“ für Reparaturen, „Service“ für alles andere) und Auftrags-Backend (Kanban-Board).
Komplett kostenlos: **GitHub Pages** (Website) + **Supabase** (Datenbank, Login, Foto-Speicher).

## Einrichten (einmalig, ca. 15 Minuten)
1. Auf supabase.com ein kostenloses Projekt anlegen (Region Frankfurt).
2. Im Projekt: **SQL Editor** → Inhalt von `supabase/schema.sql` einfügen → Run.
3. **Authentication → Users → Add user**: E-Mail + Passwort anlegen (Auto-Confirm an). Unter **Authentication → Sign In / Providers** „Allow new users to sign up“ ausschalten.
4. Im SQL Editor die Nutzer-ID freischalten:
   `insert into public.admins (user_id) select id from auth.users where email = 'DEINE@EMAIL';`
5. **Project Settings → API**: „Project URL“ und „anon public“-Schlüssel in `public/config.js` eintragen. Den `service_role`-Schlüssel niemals verwenden oder committen.
6. Committen und pushen. Die Website erscheint unter `https://<konto>.github.io/<repo>/`; das Backend unter `.../admin.html`.
7. Optional: Repository-Variablen `SUPABASE_URL` und `SUPABASE_ANON_KEY` setzen, damit `keepalive.yml` das Projekt wachhält.

## Sicherheit
- Besucher dürfen nur über die Funktion `submit_ticket` eine Meldung anlegen und Fotos in den Ordner `incoming/` hochladen. Lesen, Ändern und Löschen dürfen nur Konten in der Tabelle `admins`.
- Fotos liegen in einem privaten Bucket, das Backend zeigt sie über kurzlebige Links.

## Aufbau
`public/` Website (statisch) · `supabase/schema.sql` Datenbank und Zugriffsregeln · `.github/workflows/` Veröffentlichung und Keep-alive.
