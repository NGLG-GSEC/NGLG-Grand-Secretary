// Βάση Δεδομένων — όλοι οι πίνακες σε μία σελίδα (προβολή, αναζήτηση, επεξεργασία, Excel), Βιβλίο Πρωτοκόλλου,
// πλήρες αντίγραφο/επαναφορά και μεταφορά δεδομένων από την παλιά εφαρμογή (Render) ή από «Επιστολές Γραμματείας».
import { db } from '../core/store.js';
import { module, onSubmit, go, flash, bind, confirmDo, table, notice, pager, toast } from '../core/app.js';
import { esc, matches, sortBy, fmtDate, exportXlsx, download, today } from '../core/util.js';
import { protocolBook } from './protocol.js';
import { importVisitsPayload, importVisitsMessage } from './visits.js';
import { applyMemberItems } from './members.js';

export const TABLES = {
  member_registry: ['Μητρώο Μελών', 'Μέλη', '#/members/{id}'], member_lodges: ['Στοές των μελών', 'Μέλη'], member_degrees_offices: ['Επετηρίδα (αξιώματα)', 'Μέλη'],
  lodges: ['Συμβολικές Στοές', 'Στοές & Επαρχίες', '#/lodges/edit/{id}'], grand_lodges: ['Επαρχιακές Μεγάλες Στοές', 'Στοές & Επαρχίες', '#/provinces/edit/{id}'],
  letters: ['Επιστολές', 'Πρωτόκολλο', '#/letters/{id}'], decree_documents: ['Διατάγματα', 'Πρωτόκολλο', '#/decrees/{id}'], letter_templates: ['Πρότυπα επιστολών', 'Πρωτόκολλο', '#/templates/edit/{id}'],
  reps: ['Εκπρόσωποι ΜΔ', 'Εργασίες ΜΔ', '#/reps/edit/{id}'], visits: ['Επισκέψεις Στοών', 'Εργασίες ΜΔ', '#/visits/edit/{id}'], namedays: ['Εορτολόγιο ονομάτων', 'Εργασίες ΜΔ', '#/namedays/calendar/edit/{id}'],
  greetings_log: ['Ιστορικό ευχών', 'Εργασίες ΜΔ'], projects: ['Πρότζεκτ ΜΔ', 'Εργασίες ΜΔ', '#/projects/{id}'], project_units: ['Πρότζεκτ: Στοές/ομάδες', 'Εργασίες ΜΔ'],
  project_members: ['Πρότζεκτ: μέλη', 'Εργασίες ΜΔ'], project_contacts: ['Πρότζεκτ: επαφές', 'Εργασίες ΜΔ'], project_files: ['Πρότζεκτ: αρχεία', 'Εργασίες ΜΔ'], project_log: ['Πρότζεκτ: ημερολόγιο', 'Εργασίες ΜΔ'],
};
const READONLY = new Set(['id', 'created_at', 'updated_at', 'protocol_seq', 'protocol_no', 'protocol_year']);
const PAGE = 50;
const label = (t) => (TABLES[t] || [t])[0];
const tableNames = () => [...new Set([...Object.keys(TABLES), ...Object.keys(db.tables)])];
const columns = (t) => { const s = new Set(); for (const r of db.all(t).slice(0, 200)) Object.keys(r).forEach((k) => s.add(k)); return [...s]; };
const cell = (v) => { const s = v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return esc(s.length > 80 ? s.slice(0, 78) + '…' : s); };

function home() {
  const groups = {};
  for (const t of tableNames()) (groups[(TABLES[t] || [])[1] || 'Λοιπά'] ||= []).push(t);
  return {
    title: 'Βάση Δεδομένων',
    html: `<h1>🗄 Βάση Δεδομένων</h1><div class="card"><p style="margin-top:0">Όλα τα δεδομένα της εφαρμογής σε μία κοινή βάση, στο ιδιωτικό αποθετήριο <b>${esc(db.backend.label)}</b>. Κάθε αλλαγή κρατιέται στο ιστορικό.</p>
<div class="toolbar"><a class="btn primary" href="#/database/protocol">📖 Βιβλίο Πρωτοκόλλου (${protocolBook().length})</a><a class="btn" href="#/database/backup">💾 Αντίγραφο & μεταφορά δεδομένων</a>${historyLink()}<a class="btn" href="#/system">🩺 Έλεγχος εφαρμογής</a></div></div>
${Object.entries(groups).map(([g, ts]) => `<h2>${esc(g)}</h2><div class="dash">${ts.map((t) => `<a class="dtile" href="#/database/${t}" style="color:inherit"><h3>${esc(label(t))}</h3><div class="big">${db.all(t).length}</div><small class="muted">${esc(t)}</small></a>`).join('')}</div>`).join('')}`,
  };
}
export function historyLink() {
  return db.backend.kind === 'github' ? `<a class="btn" target="_blank" rel="noopener" href="https://github.com/${db.backend.owner}/${db.backend.repo}/commits/main">🕘 Ιστορικό αλλαγών (GitHub)</a>` : '';
}

function protocolPage({ query }) {
  let rows = protocolBook();
  if (query.cat) rows = rows.filter((r) => r.cat === query.cat);
  if (query.year) rows = rows.filter((r) => String(r.d || '').slice(0, 4) === query.year);
  if (query.q) rows = rows.filter((r) => matches(query.q, r.protocol_no, r.subject, r.who));
  const years = [...new Set(protocolBook().map((r) => String(r.d || '').slice(0, 4)).filter(Boolean))].sort().reverse();
  return {
    title: 'Βιβλίο Πρωτοκόλλου',
    html: `<h1>📖 Βιβλίο Πρωτοκόλλου</h1><p><a href="#/database">← Βάση Δεδομένων</a></p><form class="card filters" id="flt"><input name="q" value="${esc(query.q || '')}" placeholder="🔎 Αριθμός, θέμα, παραλήπτης">
<select name="year"><option value="">Όλα τα έτη</option>${years.map((y) => `<option${y === query.year ? ' selected' : ''}>${y}</option>`).join('')}</select><select name="cat"><option value="">Όλα</option>${['Επιστολή', 'Διάταγμα'].map((c) => `<option${c === query.cat ? ' selected' : ''}>${c}</option>`).join('')}</select><button>Αναζήτηση</button></form>
<div class="toolbar"><button class="btn" data-act="xlsx">⬇ Excel</button><span class="muted" style="align-self:center">${rows.length} εγγραφές</span></div>
${table(['Αρ. Πρωτ.', 'Είδος', 'Ημ/νία', 'Θέμα', 'Παραλήπτης', 'Κατάσταση'], rows.slice(0, 500).map((r) => [`<b class="official-number">${esc(r.protocol_no)}</b>`, r.cat, esc(fmtDate(r.d)), `<a href="${r.href}">${esc(r.subject || '(χωρίς θέμα)')}</a>`, esc(r.who), esc(r.status)]), 'Δεν βρέθηκαν εγγραφές.')}`,
    mount(el) {
      onSubmit(el.querySelector('#flt'), (d) => go('/database/protocol', d));
      bind(el, { xlsx: () => exportXlsx('EMSTE_PROTOKOLLO.xlsx', 'ΒΙΒΛΙΟ ΠΡΩΤΟΚΟΛΛΟΥ', ['Αρ. Πρωτοκόλλου', 'Είδος', 'Ημερομηνία', 'Θέμα', 'Παραλήπτης', 'Κατάσταση'], rows.map((r) => [r.protocol_no, r.cat, fmtDate(r.d), r.subject, r.who, r.status]), [34, 10, 12, 60, 40, 10]) });
    },
  };
}

function tablePage({ params, query }) {
  const t = params.table, cols = columns(t), show = cols.slice(0, 8), pg = Math.max(1, Number(query.p) || 1), link = (TABLES[t] || [])[2];
  let xs = sortBy(db.all(t), (r) => -(r.id || 0));
  if (query.q) xs = xs.filter((r) => matches(query.q, ...cols.map((c) => (r[c] == null ? '' : String(r[c])))));
  return {
    title: label(t),
    html: `<h1>${esc(label(t))}</h1><p><a href="#/database">← Βάση Δεδομένων</a> · πίνακας <code>${esc(t)}</code></p>${notice(query.msg)}
<form class="card toolbar" id="flt"><input name="q" value="${esc(query.q || '')}" placeholder="🔎 Αναζήτηση" style="flex:2;min-width:180px" autofocus><button class="btn primary">Αναζήτηση</button><button type="button" class="btn" data-act="xlsx">⬇ Excel</button></form>
<p class="muted">${xs.length} εγγραφές</p>
${table([...show, 'Ενέργειες'], xs.slice((pg - 1) * PAGE, pg * PAGE).map((r) => [...show.map((c) => cell(r[c])), `${link ? `<a class="btn small" href="${link.replace('{id}', r.id)}">Άνοιγμα</a> ` : ''}<a class="btn small" href="#/database/${t}/${r.id}">✎ Πεδία</a>`]))}
${pager(xs.length, pg, PAGE, (p) => `#/database/${t}?` + new URLSearchParams({ q: query.q || '', p }))}`,
    mount(el) {
      onSubmit(el.querySelector('#flt'), (d) => go(`/database/${t}`, d));
      bind(el, { xlsx: () => exportXlsx(`EMSTE_${t.toUpperCase()}.xlsx`, label(t), cols, xs.map((r) => cols.map((c) => (r[c] == null ? '' : typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])))) });
    },
  };
}

function rowPage({ params }) {
  const t = params.table, r = db.get(t, params.id);
  if (!r) return '<h1>Δεν βρέθηκε η εγγραφή</h1>';
  const cols = columns(t);
  return {
    title: label(t),
    html: `<h1>${esc(label(t))} · #${r.id}</h1><p><a href="#/database/${t}">← ${esc(label(t))}</a></p><form id="rf" class="card"><p class="muted" style="margin-top:0">Επεξεργασία όλων των πεδίων. Τα γκρι πεδία δεν αλλάζουν.</p>
<div class="grid">${cols.map((c) => { const v = r[c] == null ? '' : typeof r[c] === 'object' ? JSON.stringify(r[c]) : String(r[c]);
      return `<div class="${v.length > 120 ? 'full' : ''}"><label>${esc(c)}</label>${READONLY.has(c) ? `<input value="${esc(v)}" disabled>` : v.length > 120 ? `<textarea name="${esc(c)}" class="short">${esc(v)}</textarea>` : `<input name="${esc(c)}" value="${esc(v)}">`}</div>`; }).join('')}</div>
<div class="toolbar" style="margin-top:12px"><button class="btn primary">💾 Αποθήκευση</button><a class="btn" href="#/database/${t}">Ακύρωση</a><button type="button" class="btn danger" data-act="del">Διαγραφή εγγραφής</button></div></form>`,
    mount(el) {
      onSubmit(el.querySelector('#rf'), async (d) => {
        const patch = {};
        for (const [k, v] of Object.entries(d)) {
          const old = r[k];
          patch[k] = typeof old === 'number' ? (v.trim() === '' ? null : Number.isNaN(Number(v)) ? (() => { throw new Error(`Το πεδίο «${k}» δέχεται μόνο αριθμό.`); })() : Number(v)) : old === null && v === '' ? null : v;
        }
        await db.save(`${label(t)} #${r.id}: επεξεργασία πεδίων`, (tx) => tx.update(t, r.id, patch));
        flash(`Η εγγραφή #${r.id} αποθηκεύτηκε.`); go(`/database/${t}`);
      });
      bind(el, { async del() { if (!confirmDo(`Οριστική διαγραφή της εγγραφής #${r.id};`)) return; await db.save(`${label(t)} #${r.id}: διαγραφή`, (tx) => tx.remove(t, r.id)); flash('Διαγράφηκε.'); go(`/database/${t}`); } });
    },
  };
}

// ---------------------------------------------------------------- αντίγραφο & μεταφορά
const SKIP_IMPORT = new Set(['users', 'otps', 'login_guard', 'sqlite_sequence', 'project_blobs', 'notifications', 'drive_uploads', 'members']);
const SKIP_SETTINGS = /^(drive_|_|member_registry_seed)/;
async function readJson(file) {
  let bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
  try { return JSON.parse(new TextDecoder().decode(bytes).replace(/^﻿/, '')); } catch { throw new Error('Το αρχείο δεν είναι έγκυρο αρχείο δεδομένων (JSON).'); }
}
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
// Μητρώο Μελών από τις μεταβλητές MEMBER_REGISTRY_SEED_000… της παλιάς εφαρμογής (Render → Environment → Export).
// Διαβάζονται ΜΟΝΟ αυτές οι γραμμές· οι υπόλοιπες (κωδικοί κ.λπ.) αγνοούνται και δεν αποθηκεύονται πουθενά.
export async function seedMembers(text) {
  // Δεκτές μορφές εξαγωγής: .env (KEY=value), JSON αντικείμενο {"KEY":"value"} ή λίστα [{"key":"KEY","value":"..."}]
  const parts = {};
  const put = (k, v) => { const m = /MEMBER_REGISTRY_SEED_(\d{3})$/.exec(String(k).trim()); if (m) parts[m[1]] = String(v ?? '').replace(/\\\//g, '/').replace(/\\n/g, '').replace(/[^A-Za-z0-9+/=_-]/g, ''); };
  let json = null;
  try { json = JSON.parse(text); } catch { /* όχι JSON */ }
  if (Array.isArray(json)) for (const x of json) put(x.key ?? x.name ?? x.Key ?? '', x.value ?? x.Value ?? '');
  else if (json && typeof json === 'object') for (const [k, v] of Object.entries(json)) put(k, typeof v === 'object' && v ? v.value : v);
  if (!Object.keys(parts).length) {
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?["']?(MEMBER_REGISTRY_SEED_\d{3})["']?\s*[=:]\s*(.*)$/.exec(line);
      if (m) put(m[1], m[2]);
    }
  }
  const keys = Object.keys(parts).sort();
  if (!keys.length) return null;
  const missing = [];
  for (let i = 0; i <= Number(keys.at(-1)); i++) if (!parts[String(i).padStart(3, '0')]) missing.push(String(i).padStart(3, '0'));
  if (missing.length) throw new Error(`Λείπουν τα τμήματα MEMBER_REGISTRY_SEED_${missing.join(', ')} από το αρχείο — εξαγάγετε όλες τις μεταβλητές (Show more) και ξαναδοκιμάστε.`);
  const res = await decodeSeed(keys.map((k) => parts[k]));
  if (!res.data) {
    const lens = keys.map((k) => parts[k].length).join(', ');
    throw new Error(`Βρέθηκαν ${keys.length} τμήματα MEMBER_REGISTRY_SEED (${keys[0]}–${keys.at(-1)}) αλλά δεν διαβάστηκαν. Μήκη τμημάτων: ${lens}. Στείλτε αυτό το μήνυμα στον Claude.`);
  }
  const data = res.data;
  const members = Array.isArray(data) ? data : data.members || [];
  const msg = await applyMemberItems(members.filter((m) => m.surname || m.first_name).map((m) => ({ id: null, member: m })), 'merge');
  return msg + (res.note ? ' ' + res.note : '');
}

// Αποκωδικοποίηση των τμημάτων (base64 → gzip → JSON). Αν κατά την εξαγωγή χάθηκε κάποιος χαρακτήρας (π.χ. «+» ή «/»),
// εντοπίζεται το κοντύτερο τμήμα και δοκιμάζεται η συμπλήρωσή του· η ορθότητα επιβεβαιώνεται από το άθροισμα ελέγχου
// (CRC) του gzip. Αν δεν γίνει, ανακτώνται όσα μέλη διαβάζονται πριν από το σημείο της βλάβης.
async function gunzip(bytes, partial = false) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader(), chunks = [];
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); } }
  catch (e) { if (!partial) throw e; }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}
const b64bytes = (s) => { s = s.replace(/=+$/, ''); if (s.length % 4 === 1) s = s.slice(0, -1); return unb64(s + '='.repeat((4 - (s.length % 4)) % 4)); };
async function tryDecode(str) { try { return JSON.parse(await gunzip(b64bytes(str))); } catch { return null; } }
export async function decodeSeed(parts) {
  parts = parts.map((p) => p.replace(/-/g, '+').replace(/_/g, '/'));
  let data = await tryDecode(parts.join(''));
  if (data) return { data };
  // επισκευή: τμήμα (εκτός του τελευταίου) κοντύτερο από τα υπόλοιπα κατά 1–2 χαρακτήρες
  toast('Λείπει ένας χαρακτήρας από το αρχείο του Render — γίνεται αυτόματη επισκευή, παρακαλώ περιμένετε έως 1–2 λεπτά…');
  const counts = {};
  for (const p of parts.slice(0, -1)) counts[p.length] = (counts[p.length] || 0) + 1;
  const common = Number(Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 0);
  for (let i = 0; i < parts.length; i++) {
    const miss = (i < parts.length - 1 ? common : 0) - parts[i].length;
    const total = parts.join('').replace(/=+$/, '').length;
    const need = i < parts.length - 1 ? miss : (4 - (total % 4)) % 4;
    if (need < 1 || need > 2) continue;
    const combos = need === 1 ? ['+', '/'] : ['++', '+/', '/+', '//'];
    for (let pos = 0; pos <= parts[i].length; pos++) {
      for (const c of combos) {
        const fixed = [...parts]; fixed[i] = parts[i].slice(0, pos) + c + parts[i].slice(pos);
        // γρήγορος έλεγχος: μόνο αν η αποσυμπίεση φτάνει πέρα από το σημείο
        data = await tryDecode(fixed.join(''));
        if (data) return { data, note: `(Επισκευάστηκε αυτόματα ένας χαρακτήρας που είχε χαθεί στο τμήμα ${String(i).padStart(3, '0')}.)` };
      }
    }
  }
  // ανάκτηση όσων μελών διαβάζονται πριν από τη βλάβη
  let text = '';
  try { text = await gunzip(b64bytes(parts.join('')), true); } catch { /* */ }
  const members = salvageObjects(text);
  return members.length ? { data: { members }, note: `(Το αρχείο ήταν ελλιπές: ανακτήθηκαν ${members.length} μέλη — τα υπόλοιπα προσθέστε από το Excel του Μητρώου.)` } : {};
}
function salvageObjects(text) {
  const start = text.indexOf('[', Math.max(0, text.indexOf('"members"')));
  if (start < 0) return [];
  const out = [];
  let depth = 0, inStr = false, esc = false, objStart = -1;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i];
    if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') { if (depth === 0) objStart = i; depth++; }
    else if (c === '}') { depth--; if (depth === 0 && objStart >= 0) { try { out.push(JSON.parse(text.slice(objStart, i + 1))); } catch { /* */ } objStart = -1; } }
    else if (c === ']' && depth === 0) break;
  }
  return out;
}

export async function importFile(file) {
  if (file.size < 20e6 && !/\.gz$/i.test(file.name)) {
    const text = await file.text();
    if (/MEMBER_REGISTRY_SEED_\d{3}/.test(text)) return 'Μητρώο Μελών από την παλιά εφαρμογή — ' + (await seedMembers(text));
  }
  const d = await readJson(file);
  if (d.format === 'nglg-lodge-visits/1') { let n; await db.save('Εισαγωγή από «Επιστολές Γραμματείας»', (tx) => { n = importVisitsPayload(tx, d); }); return importVisitsMessage(n); }
  if (d.format === 'nglg-backup/1' || d.format === 'nglg-app/1') {
    let tables = 0, rows = 0, files = 0;
    await db.save(d.format === 'nglg-backup/1' ? 'Μεταφορά δεδομένων από την παλιά εφαρμογή' : 'Επαναφορά από αντίγραφο', (tx) => {
      tables = rows = files = 0;
      for (const [t, v] of Object.entries(d.tables || {})) {
        if (t === 'settings' && Array.isArray(v.rows)) { const ki = v.columns.indexOf('key'), vi = v.columns.indexOf('value'); for (const r of v.rows) if (!SKIP_SETTINGS.test(r[ki])) tx.setting(r[ki], r[vi]); continue; }
        if (t === 'project_blobs' && Array.isArray(v.rows)) { const ni = v.columns.indexOf('stored_name'), bi = v.columns.indexOf('data'); for (const r of v.rows) if (r[bi] && r[bi].$b64) { tx.putFile('projects/' + r[ni], unb64(r[bi].$b64)); files++; } continue; }
        if (SKIP_IMPORT.has(t)) continue;
        const list = Array.isArray(v) ? v : (v.rows || []).map((r) => Object.fromEntries(v.columns.map((c, i) => [c, r[i] && r[i].$b64 ? null : r[i]])));
        tx.replace(t, list); tables++; rows += list.length;
      }
      if (d.settings) for (const [k, v] of Object.entries(d.settings)) if (!SKIP_SETTINGS.test(k)) tx.setting(k, v);
    });
    return `Η μεταφορά ολοκληρώθηκε: ${tables} πίνακες, ${rows} εγγραφές${files ? `, ${files} αρχεία πρότζεκτ` : ''}.`;
  }
  throw new Error('Μη αναγνωρίσιμο αρχείο. Δεκτά: αντίγραφο της εφαρμογής (.json.gz), αντίγραφο της παλιάς εφαρμογής, ή εξαγωγή «Επιστολές Γραμματείας» (.json).');
}
export async function exportAll() {
  const out = { format: 'nglg-app/1', created: new Date().toISOString(), tables: db.tables, settings: db.settings };
  const gz = await new Response(new Blob([JSON.stringify(out)]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  download(`nglg-antigrafo-${today()}.json.gz`, gz);
}

function backupPage({ query }) {
  return {
    title: 'Αντίγραφο & μεταφορά',
    html: `<h1>💾 Αντίγραφο & μεταφορά δεδομένων</h1><p><a href="#/database">← Βάση Δεδομένων</a></p>${notice(query.msg)}
<div class="card"><h2 style="margin-top:0">1. Λήψη αντιγράφου</h2><p>Όλοι οι πίνακες και οι ρυθμίσεις σε ένα αρχείο. Τα δεδομένα φυλάσσονται ήδη με πλήρες ιστορικό στο GitHub — το αρχείο είναι επιπλέον ασφάλεια. Περιέχει προσωπικά δεδομένα: φυλάξτε το σε ασφαλές σημείο.</p>
<div class="toolbar"><button class="btn primary" data-act="export">⬇ Λήψη πλήρους αντιγράφου</button>${historyLink()}</div></div>
<form class="card" id="imf"><h2 style="margin-top:0">2. Εισαγωγή / μεταφορά δεδομένων</h2>
<ul><li><b>Από την παλιά εφαρμογή (Render):</b> στην παλιά εφαρμογή → Βάση Δεδομένων → «💾 Αντίγραφο ασφαλείας» → «Λήψη πλήρους αντιγράφου» και ανεβάστε εδώ το αρχείο <code>nglg-backup-….json.gz</code>.</li>
<li><b>Αντίγραφο αυτής της εφαρμογής</b> (<code>nglg-antigrafo-….json.gz</code>) — επαναφορά.</li>
<li><b>Μητρώο Μελών από τις ρυθμίσεις της παλιάς εφαρμογής:</b> Render → υπηρεσία → <b>Environment</b> → <b>Export</b> → αρχείο <code>.env</code>. Διαβάζονται μόνο οι γραμμές MEMBER_REGISTRY_SEED· οι κωδικοί που περιέχει το αρχείο αγνοούνται. Διαγράψτε το αρχείο μετά.</li>
<li><b>Εξαγωγή «Επιστολές Γραμματείας»</b> ή αρχεία εισαγωγής (<code>.json</code>, μορφή nglg-lodge-visits/1) — συμπληρώνει Επαρχίες, Στοές, εκπροσώπους, επισκέψεις, ιστορικό ευχών χωρίς διπλοεγγραφές.</li></ul>
<p class="muted">Η μεταφορά/επαναφορά αντικαθιστά τους πίνακες του αρχείου· η προηγούμενη μορφή μένει στο ιστορικό του GitHub.</p>
<input type="file" name="file" accept=".gz,.json,.env,.txt,application/json,application/gzip,text/plain" required><div class="toolbar" style="margin-top:10px"><button class="btn primary">Εισαγωγή</button></div></form>`,
    mount(el) {
      bind(el, { export: exportAll });
      onSubmit(el.querySelector('#imf'), async (d) => {
        if (!confirmDo('Εισαγωγή του αρχείου; (Μπορεί να αντικαταστήσει δεδομένα — η προηγούμενη μορφή μένει στο ιστορικό.)')) return;
        const msg = await importFile(d.file); flash(msg); go('/database/backup', { msg });
      });
    },
  };
}

module({
  id: 'database',
  routes: { '/database': home, '/database/protocol': protocolPage, '/database/backup': backupPage, '/database/:table': tablePage, '/database/:table/:id': rowPage },
  tile: { order: 70, render: () => `<div class="dtile"><h3><a href="#/database">🗄 Βάση Δεδομένων</a></h3><div class="big">${tableNames().length} πίνακες</div>
<div class="acts"><a class="btn primary" href="#/database">Πίνακες</a><a class="btn" href="#/database/protocol">Βιβλίο Πρωτοκόλλου</a><a class="btn" href="#/database/backup">Αντίγραφο</a></div></div>` },
});
