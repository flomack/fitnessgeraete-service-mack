// Demo-Daten für das Backend: node seed.js
import { db } from './server.js';
const d = (h) => new Date(Date.now() - h * 36e5).toISOString();
const demo = [
  ['neu','hoch','defekt','Laufband','Technogym','Run Excite 700','down','Band bleibt nach 2 Min. stehen, Display zeigt Fehler E-14.','Fitnessloft Böblingen','Jana Keller','0711 555 0142','jana@fitnessloft.example','71032 Böblingen',1],
  ['neu','mittel','defekt','Kraftgerät','Life Fitness','Beinpresse','limited','Seilzug schleift, Gewichtsstapel klemmt oben.','Studio Move','Marc Weber','0151 2345678','marc@studiomove.example','70173 Stuttgart',5],
  ['geprueft','mittel','wartung','Cardio mehrere','Matrix','','none','Jährliche Wartung + DGUV V3 für 14 Cardiogeräte.','PowerPoint Gym','Sven Roth','07142 99887','sven@powerpoint.example','74321 Bietigheim',30],
  ['termin','niedrig','polster','Kraftgerät','Technogym','Selection Chest Press','none','Sitzpolster rissig, Neubezug in Anthrazit gewünscht.','Body & Soul','Lea Braun','0711 123456','lea@bodysoul.example','73728 Esslingen',70],
  ['in_arbeit','hoch','defekt','Crosstrainer','Precor','EFX 885','down','Pedalarm knackt und hat Spiel.','Fit Factory','Tom Vogel','0711 778899','tom@fitfactory.example','70469 Stuttgart',52],
  ['teile','mittel','defekt','Bike','Technogym','Bike 500','limited','Motorsteuerung getauscht, Ersatzplatine bestellt.','CrossBox','Nina Frey','0176 5551234','nina@crossbox.example','71638 Ludwigsburg',120],
  ['erledigt','niedrig','umzug','Mehrere','Gemischt','','none','Umzug von 22 Geräten in neue Studiofläche.','Move Studio','Paul Haas','0711 445566','paul@move.example','70565 Stuttgart',300],
];
for (const t of demo) {
  const ts = d(t[13]);
  const r = db.prepare(`INSERT INTO tickets (created_at,updated_at,status,priority,type,category,brand,model,urgency,description,studio,name,phone,email,location) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(ts, ts, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], t[8], t[9], t[10], t[11], t[12]);
  db.prepare('INSERT INTO events (ticket_id, at, kind, text) VALUES (?,?,?,?)').run(Number(r.lastInsertRowid), ts, 'created', 'Meldung über die Website eingegangen');
}
console.log(`${demo.length} Demo-Aufträge angelegt.`);
