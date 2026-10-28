const A = {}; // Antworten
const BRANDS = ['Technogym','Life Fitness','Matrix','Precor','Cybex','gym80','Kettler','Hammer Strength','Star Trac','Andere / weiß nicht'];
const SYMP = ['Lässt sich nicht einschalten','Fehlermeldung im Display','Ungewöhnliche Geräusche','Band / Seil / Riemen defekt','Display / Konsole defekt','Wackelt / lose Teile','Sitz / Polster defekt'];

// Jeder Schritt: id, Frage, Typ. Reihenfolge und Fragen lassen sich hier einfach ändern.
const SERVICE = document.body.dataset.mode === 'service';
if (!SERVICE) A.type = 'defekt';
document.title = (SERVICE ? 'Service anfragen' : 'Problem melden') + ' – Fitnessgeräte Service Mack';
const CAT = { id:'category', q:'Um welches Gerät geht es?', kind:'single', cols:2, opts:[
    ['Laufband','🏃','Laufband'],['Crosstrainer / Ergometer','🚴','Crosstrainer, Bike, Rudern'],
    ['Kraftgerät','🏋️','Kraftgerät'],['Freihantel / Zubehör','⚙️','Freihantel / Zubehör'],
    ['Mehrere Geräte','📋','Mehrere Geräte'],['Weiß nicht','❔','Weiß ich nicht']]};
const CONTACT = { id:'contact', q:'Wie erreichen wir Sie?', hint:'Wir melden uns innerhalb von 24 Stunden.', kind:'contact' };
// Problem melden = nur Reparatur/Störung. Service = alles andere.
const STEPS = SERVICE ? [
  { id:'type', q:'Wobei können wir helfen?', hint:'Wählen Sie, was am besten passt.', kind:'single', opts:[
    ['wartung','🔧','Wartung / Prüfung','Herstellerwartung, STK, DGUV V3, Wartungsvertrag'],
    ['polster','🪑','Polsterarbeiten','Abholung & Neubezug nach Ihren Farbwünschen'],
    ['umzug','🚚','Montage / Umzug / Transport','Aufbau, Neuinstallation, Einlagerung'],
    ['verkauf','🏷️','An- & Verkauf, Vermietung','Gebrauchte Geräte, Ersatzteile, Zubehör'],
    ['sonstiges','💬','Etwas anderes','Beratung, Gerätepark-Organisation']]},
  CAT,
  { id:'urgency', q:'Wann soll es stattfinden?', kind:'single', opts:[
    ['limited','🗓️','Zeitnah','In den nächsten Wochen'],
    ['none','🕐','Flexibel','Kein fester Termin']]},
  { id:'description', q:'Was brauchen Sie genau?', hint:'Ein paar Stichworte reichen: Anzahl Geräte, Marken, Wunschtermin.', kind:'text' },
  CONTACT,
] : [
  CAT,
  { id:'brand', q:'Welche Marke ist es?', hint:'Das Typenschild finden Sie meist am Rahmen. Modell ist optional.', kind:'brand' },
  { id:'urgency', q:'Wie dringend ist es?', kind:'single', opts:[
    ['down','🔴','Gerät ist nicht nutzbar','Mitglieder sind betroffen'],
    ['limited','🟠','Eingeschränkt nutzbar','Läuft, aber nicht richtig'],
    ['none','🟢','Kein Zeitdruck','Wir planen voraus']]},
  { id:'description', q:'Was genau ist passiert?', hint:'Ein paar Stichworte reichen. Ein Foto hilft uns, gleich die richtigen Teile mitzubringen.', kind:'text' },
  CONTACT,
];
let i = 0; const photos = [];
const $ = (s) => document.querySelector(s);
const main = $('#main');

function render(){
  const s = STEPS[i];
  $('#pbar').style.width = `${(i / STEPS.length) * 100}%`;
  $('#back').style.visibility = i ? 'visible' : 'hidden';
  $('#next').textContent = i === STEPS.length - 1 ? (SERVICE ? 'Anfrage absenden' : 'Meldung absenden') : 'Weiter';
  const head = `<div class="step"><div class="count">Frage ${i+1} von ${STEPS.length}</div><h1 class="q">${s.q}</h1>${s.hint?`<p class="hint">${s.hint}</p>`:''}`;
  let body = '';
  if (s.kind === 'single') {
    body = `<div class="opts ${s.cols===2?'two':''}">` + s.opts.map(([v,e,t,sub]) =>
      `<button class="opt urg-${v} ${A[s.id]===v?'sel':''}" data-v="${v}"><span class="em">${e}</span><span>${t}${sub?`<small>${sub}</small>`:''}</span></button>`).join('') + '</div>';
  } else if (s.kind === 'brand') {
    body = `<div class="opts two">` + BRANDS.map(b => `<button class="opt ${A.brand===b?'sel':''}" data-v="${b}">${b}</button>`).join('') + `</div>
      <label class="f">Modell (optional)<input type="text" id="model" value="${esc(A.model||'')}" placeholder="z. B. Run Excite 700"></label>`;
  } else if (s.kind === 'text') {
    body = `<label class="f" style="margin-top:28px"><span class="hp">Website</span></label><input class="hp" id="hp" tabindex="-1" autocomplete="off">
      <textarea id="desc" placeholder="Beschreiben Sie das Problem …" aria-label="Beschreibung">${esc(A.description||'')}</textarea>
      ${!SERVICE?`<div class="symp">${SYMP.map(x=>`<button type="button">${x}</button>`).join('')}</div>`:''}
      <div class="photos" id="photos"></div>`;
  } else if (s.kind === 'contact') {
    body = `<label class="f">Studio / Firma<input type="text" id="studio" autocomplete="organization" value="${esc(A.studio||'')}"></label>
      <div class="row2"><label class="f">Ihr Name<input type="text" id="name" autocomplete="name" value="${esc(A.name||'')}"></label>
      <label class="f">Telefon<input type="tel" id="phone" autocomplete="tel" value="${esc(A.phone||'')}"></label></div>
      <div class="row2"><label class="f">E-Mail<input type="email" id="email" autocomplete="email" value="${esc(A.email||'')}"></label>
      <label class="f">PLZ &amp; Ort des Studios<input type="text" id="location" autocomplete="postal-code" value="${esc(A.location||'')}"></label></div>
      <p class="hint" style="font-size:13px;margin-top:18px">Mit dem Absenden stimmen Sie zu, dass wir Ihre Angaben zur Bearbeitung der Anfrage speichern. Mehr in der Datenschutzerklärung.</p><div class="err" id="err"></div>`;
  }
  main.innerHTML = head + body + '</div>';
  window.scrollTo(0,0);
  bind(s); validate();
}
const esc = (t) => String(t).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function bind(s){
  if (s.kind === 'single' || s.kind === 'brand') main.querySelectorAll('.opt').forEach(b => b.onclick = () => {
    A[s.id] = b.dataset.v; main.querySelectorAll('.opt').forEach(x => x.classList.toggle('sel', x === b));
    validate(); if (s.kind === 'single') setTimeout(next, 220); // Einzelauswahl: automatisch weiter
  });
  main.querySelectorAll('input,textarea').forEach(el => el.oninput = () => { collect(); validate(); });
  if (s.kind === 'text') {
    main.querySelectorAll('.symp button').forEach(b => b.onclick = () => { const t = $('#desc'); t.value = (t.value ? t.value.trim() + '. ' : '') + b.textContent; collect(); validate(); });
    drawPhotos();
  }
}
function collect(){
  for (const k of ['model','studio','name','phone','email','location']) { const el = document.getElementById(k); if (el) A[k] = el.value.trim(); }
  const d = $('#desc'); if (d) A.description = d.value.trim();
  const h = $('#hp'); if (h) A.website = h.value;
}
function valid(){
  const s = STEPS[i];
  if (s.kind === 'single') return !!A[s.id];
  if (s.kind === 'brand') return !!A.brand;
  if (s.kind === 'text') return (A.description||'').length >= 5;
  return A.studio && A.name && A.phone && /^\S+@\S+\.\S+$/.test(A.email||'');
}
function validate(){ $('#next').disabled = !valid(); }

function drawPhotos(){
  const box = $('#photos'); if (!box) return;
  box.innerHTML = photos.map((p,n)=>`<div class="th" style="background-image:url(${p})"><button aria-label="Foto entfernen" data-n="${n}">✕</button></div>`).join('') +
    (photos.length < 3 ? `<label title="Foto hinzufügen">📷<input type="file" accept="image/*" capture="environment" multiple hidden id="file"></label>` : '');
  box.querySelectorAll('button').forEach(b => b.onclick = () => { photos.splice(+b.dataset.n,1); drawPhotos(); });
  const f = $('#file'); if (f) f.onchange = async () => { for (const file of [...f.files].slice(0,3-photos.length)) photos.push(await shrink(file)); drawPhotos(); };
}
function shrink(file){ // Foto verkleinern, damit Upload auch mobil schnell ist
  return new Promise(res => { const img = new Image(); img.onload = () => {
    const k = Math.min(1, 1600/Math.max(img.width,img.height)), c = document.createElement('canvas');
    c.width = img.width*k; c.height = img.height*k; c.getContext('2d').drawImage(img,0,0,c.width,c.height); res(c.toDataURL('image/jpeg',.8)); };
    img.src = URL.createObjectURL(file); });
}

async function next(){
  collect(); if (!valid()) return;
  if (i < STEPS.length - 1) { i++; render(); return; }
  const btn = $('#next'); btn.disabled = true; btn.textContent = 'Wird gesendet …';
  try {
    if (!window.sbReady) throw new Error('Das Formular ist noch nicht mit der Datenbank verbunden');
    if (A.website) { var j = { ref: 'T-0000' }; } else {
      const paths = [];
      for (const p of photos) {
        const blob = await (await fetch(p)).blob(), path = `incoming/${crypto.randomUUID()}.jpg`;
        const up = await sb.storage.from('ticket-photos').upload(path, blob, { contentType: 'image/jpeg' });
        if (!up.error) paths.push(path);
      }
      const { website, ...payload } = A;
      const res = await sb.rpc('submit_ticket', { p: { ...payload, photos: paths } });
      if (res.error) throw new Error(res.error.message);
      var j = res.data;
    }
    $('#pbar').style.width = '100%'; $('#foot').remove();
    main.innerHTML = `<div class="step done"><div class="ok"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h1 class="q">Danke, wir haben Ihre ${SERVICE?'Anfrage':'Meldung'}.</h1><p class="hint">Wir melden uns innerhalb von 24 Stunden bei ${esc(A.name)}.</p>
      <div class="ref">Ihre Referenz: ${j.ref}</div><br><a class="btn btn-ghost" href="/">Zur Startseite</a></div>`;
  } catch (e) { const er = $('#err'); if (er) er.textContent = e.message + ' – oder rufen Sie uns direkt an.'; btn.disabled = false; btn.textContent = 'Meldung absenden'; }
}
$('#next').onclick = next;
$('#back').onclick = () => { collect(); if (i) { i--; render(); } };
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && !$('#next').disabled && e.target.tagName !== 'BUTTON') next(); });
render();
