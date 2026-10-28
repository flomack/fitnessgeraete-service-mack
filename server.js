// FitServ – Website + Störungsmeldung + Auftrags-Backend. Keine Abhängigkeiten (Node >= 22.5).
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync, mkdirSync, createReadStream } from 'node:fs';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const DATA = join(ROOT, 'data');
const UPLOADS = join(DATA, 'uploads');
const PUBLIC = join(ROOT, 'public');
mkdirSync(UPLOADS, { recursive: true });

const PORT = Number(process.env.PORT || 3000);
// Ohne ADMIN_PASSWORD wird ein zufälliges Passwort erzeugt und beim Start ausgegeben (kein Standardpasswort im Code).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
if (!process.env.ADMIN_PASSWORD) console.warn(`⚠  ADMIN_PASSWORD nicht gesetzt – temporäres Passwort für diese Sitzung: ${ADMIN_PASSWORD}`);

const secretFile = join(DATA, 'secret');
if (!existsSync(secretFile)) writeFileSync(secretFile, randomBytes(32).toString('hex'));
const SECRET = readFileSync(secretFile, 'utf8');

export const STATUSES = ['neu', 'geprueft', 'termin', 'in_arbeit', 'teile', 'erledigt'];
const PRIORITIES = ['hoch', 'mittel', 'niedrig'];

export const db = new DatabaseSync(join(DATA, 'fitserv.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'neu', priority TEXT NOT NULL DEFAULT 'mittel',
  type TEXT, category TEXT, brand TEXT, model TEXT, urgency TEXT, description TEXT,
  studio TEXT, name TEXT, phone TEXT, email TEXT, location TEXT,
  assignee TEXT DEFAULT '', due TEXT DEFAULT '', photos TEXT DEFAULT '[]', archived INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL,
  at TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL
);`);

const now = () => new Date().toISOString();
const addEvent = (id, kind, text) => db.prepare('INSERT INTO events (ticket_id, at, kind, text) VALUES (?,?,?,?)').run(id, now(), kind, text);
const clip = (v, n = 500) => String(v ?? '').trim().slice(0, n);

// ---------- Auth (signed cookie) ----------
const sign = (p) => createHmac('sha256', SECRET).update(p).digest('hex');
const makeToken = () => { const exp = Date.now() + 1000 * 60 * 60 * 24 * 14; return `${exp}.${sign(String(exp))}`; };
function authed(req) {
  const m = /(?:^|;\s*)fs_admin=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return false;
  const [exp, sig] = m[1].split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const a = Buffer.from(sig), b = Buffer.from(sign(exp));
  return a.length === b.length && timingSafeEqual(a, b);
}
const safeEq = (a, b) => { const x = Buffer.from(sign(a)), y = Buffer.from(sign(b)); return timingSafeEqual(x, y); };

// ---------- Helpers ----------
const hits = new Map();
function limited(ip, max, windowMs) {
  const t = Date.now(); const arr = (hits.get(ip) || []).filter((x) => t - x < windowMs);
  arr.push(t); hits.set(ip, arr); return arr.length > max;
}
const json = (res, code, body, headers = {}) => {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(body));
};
async function readBody(req, max = 14e6) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > max) throw Object.assign(new Error('too large'), { code: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw Object.assign(new Error('bad json'), { code: 400 }); }
}
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp' };
function serveFile(res, file) {
  if (!existsSync(file)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Nicht gefunden'); }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}

function savePhotos(list) {
  const out = [];
  for (const d of (Array.isArray(list) ? list : []).slice(0, 4)) {
    const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(d || '');
    if (!m) continue;
    const buf = Buffer.from(m[2], 'base64'); if (buf.length > 4e6) continue;
    const name = `${Date.now()}-${randomBytes(5).toString('hex')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
    writeFileSync(join(UPLOADS, name), buf); out.push(name);
  }
  return out;
}

const URG = { down: 'hoch', limited: 'mittel', none: 'niedrig' };
const row = (t) => ({ ...t, photos: JSON.parse(t.photos || '[]'), archived: !!t.archived });

// ---------- Routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const ip = req.socket.remoteAddress || '';
  try {
    // Public: neue Meldung
    if (req.method === 'POST' && p === '/api/tickets') {
      if (limited('t' + ip, 6, 10 * 60e3)) return json(res, 429, { error: 'Zu viele Meldungen. Bitte rufen Sie uns an.' });
      const b = await readBody(req);
      if (b.website) return json(res, 200, { ok: true, id: 0, ref: 'T-0000' }); // Honeypot
      const t = {
        type: clip(b.type, 40), category: clip(b.category, 60), brand: clip(b.brand, 80), model: clip(b.model, 80),
        urgency: URG[b.urgency] ? b.urgency : 'none', description: clip(b.description, 3000),
        studio: clip(b.studio, 120), name: clip(b.name, 120), phone: clip(b.phone, 40), email: clip(b.email, 160), location: clip(b.location, 120),
      };
      if (!t.name || !t.studio || !t.phone || !/^\S+@\S+\.\S+$/.test(t.email)) return json(res, 400, { error: 'Bitte Studio, Name, Telefon und gültige E-Mail angeben.' });
      const ts = now();
      const info = db.prepare(`INSERT INTO tickets (created_at, updated_at, priority, type, category, brand, model, urgency, description, studio, name, phone, email, location, photos)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(ts, ts, URG[t.urgency], t.type, t.category, t.brand, t.model, t.urgency, t.description, t.studio, t.name, t.phone, t.email, t.location, JSON.stringify(savePhotos(b.photos)));
      const id = Number(info.lastInsertRowid);
      addEvent(id, 'created', 'Meldung über die Website eingegangen');
      console.log(`Neue Meldung T-${String(id).padStart(4, '0')} · ${t.studio} · ${t.brand} ${t.category} · ${t.urgency}`);
      return json(res, 201, { ok: true, id, ref: `T-${String(id).padStart(4, '0')}` });
    }

    // Admin
    if (p === '/api/admin/login' && req.method === 'POST') {
      if (limited('l' + ip, 8, 10 * 60e3)) return json(res, 429, { error: 'Zu viele Versuche.' });
      const b = await readBody(req, 1e4);
      if (!safeEq(String(b.password || ''), ADMIN_PASSWORD)) return json(res, 401, { error: 'Falsches Passwort' });
      return json(res, 200, { ok: true }, { 'Set-Cookie': `fs_admin=${makeToken()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=1209600` });
    }
    if (p === '/api/admin/logout' && req.method === 'POST') return json(res, 200, { ok: true }, { 'Set-Cookie': 'fs_admin=; HttpOnly; Path=/; Max-Age=0' });

    if (p.startsWith('/api/admin/') || p.startsWith('/uploads/')) {
      if (!authed(req)) return json(res, 401, { error: 'Nicht angemeldet' });

      if (p.startsWith('/uploads/')) {
        const f = normalize(p.slice(9)).replace(/^(\.\.[/\\])+/, '');
        return serveFile(res, join(UPLOADS, f));
      }
      if (p === '/api/admin/tickets' && req.method === 'GET') {
        const rows = db.prepare('SELECT * FROM tickets WHERE archived = 0 ORDER BY id DESC').all().map(row);
        return json(res, 200, { tickets: rows, statuses: STATUSES });
      }
      const m = /^\/api\/admin\/tickets\/(\d+)(\/notes)?$/.exec(p);
      if (m) {
        const id = Number(m[1]);
        const cur = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
        if (!cur) return json(res, 404, { error: 'Nicht gefunden' });
        if (req.method === 'GET' && !m[2]) return json(res, 200, { ticket: row(cur), events: db.prepare('SELECT * FROM events WHERE ticket_id = ? ORDER BY id DESC').all(id) });
        if (req.method === 'POST' && m[2]) {
          const b = await readBody(req, 2e4); const text = clip(b.text, 2000);
          if (!text) return json(res, 400, { error: 'Leer' });
          addEvent(id, 'note', text); db.prepare('UPDATE tickets SET updated_at=? WHERE id=?').run(now(), id);
          return json(res, 200, { ok: true });
        }
        if (req.method === 'PATCH' && !m[2]) {
          const b = await readBody(req, 2e4); const sets = [], vals = [];
          const label = { neu: 'Neu', geprueft: 'In Prüfung', termin: 'Termin vereinbart', in_arbeit: 'In Bearbeitung', teile: 'Wartet auf Teile', erledigt: 'Erledigt' };
          if (b.status && STATUSES.includes(b.status) && b.status !== cur.status) { sets.push('status=?'); vals.push(b.status); addEvent(id, 'status', `Status: ${label[cur.status]} → ${label[b.status]}`); }
          if (b.priority && PRIORITIES.includes(b.priority) && b.priority !== cur.priority) { sets.push('priority=?'); vals.push(b.priority); addEvent(id, 'priority', `Priorität: ${cur.priority} → ${b.priority}`); }
          if (typeof b.assignee === 'string' && b.assignee !== cur.assignee) { sets.push('assignee=?'); vals.push(clip(b.assignee, 80)); addEvent(id, 'assignee', `Zuständig: ${clip(b.assignee, 80) || '—'}`); }
          if (typeof b.due === 'string' && b.due !== cur.due) { sets.push('due=?'); vals.push(clip(b.due, 20)); addEvent(id, 'due', `Termin: ${clip(b.due, 20) || '—'}`); }
          if (typeof b.archived === 'boolean') { sets.push('archived=?'); vals.push(b.archived ? 1 : 0); if (b.archived) addEvent(id, 'archive', 'Archiviert'); }
          if (sets.length) db.prepare(`UPDATE tickets SET ${sets.join(',')}, updated_at=? WHERE id=?`).run(...vals, now(), id);
          return json(res, 200, { ok: true });
        }
      }
      return json(res, 404, { error: 'Unbekannte Route' });
    }

    // Static
    if (req.method !== 'GET') return json(res, 405, { error: 'Methode nicht erlaubt' });
    if (p === '/') return serveFile(res, join(PUBLIC, 'index.html'));
    if (p === '/melden' || p === '/service') return serveFile(res, join(PUBLIC, 'melden.html'));
    if (p === '/admin') return serveFile(res, join(PUBLIC, 'admin.html'));
    const f = normalize(p).replace(/^(\.\.[/\\])+/, '');
    return serveFile(res, join(PUBLIC, f));
  } catch (e) {
    json(res, e.code === 413 || e.code === 400 ? e.code : 500, { error: e.code ? e.message : 'Serverfehler' });
    if (!e.code) console.error(e);
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => console.log(`FitServ läuft: http://localhost:${PORT}   ·   Backend: http://localhost:${PORT}/admin`));
}
