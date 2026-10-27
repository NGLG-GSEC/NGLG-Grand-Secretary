// Πύλη Γραμματέων Στοών — η πλευρά της Μεγάλης Γραμματείας.
// Οι Γραμματείς βλέπουν/διορθώνουν το Μητρώο της Στοάς τους στη σελίδα lodge/ (με κωδικό Στοάς) μέσω του Apps Script της Πύλης
// (lodge/apps-script/Code.gs, στο Drive του info@). Εδώ: ρύθμιση, κωδικοί Στοών, δημοσίευση μητρώων, λήψη & εφαρμογή αλλαγών στο Μητρώο,
// ιστορικό και επαναφορά έκδοσης. Μία πηγή: το Μητρώο της εφαρμογής· ο server κρατά μόνο αντίγραφο ανά Στοά και τις εκδόσεις.
import { db } from '../core/store.js';
import { module, bind, toast, table, go, flash } from '../core/app.js';
import { esc, sortBy, today, fmtDate, EMAIL_RE } from '../core/util.js';
import { regCode } from '../core/people.js';
import { lodgesAll, lodgeNoKey } from './lodges.js';
import { capacityOf, insertMember, deregEverywhere } from './members.js';
import { epeteiridaOf } from './epeteirida-table.js';
import { senderFor } from '../core/mail.js';

export const PORTAL_PAGE = 'https://nglg-gsec.github.io/NGLG-Grand-Secretary/lodge/';
const MEMBER_FIELDS = ['surname', 'first_name', 'email', 'mobile', 'degree', 'date_ea', 'date_fc', 'date_mm'];
const LODGE_FIELDS = ['member_status', 'capacity', 'capacity_date', 'jw_date', 'sw_date', 'wm_date', 'dereg_date'];
const LABELS = { surname: 'Επώνυμο', first_name: 'Όνομα', email: 'Email', mobile: 'Κινητό', degree: 'Βαθμός', date_ea: 'Ημ. μύησης', date_fc: 'Ημ. Εταίρου', date_mm: 'Ημ. Διδασκάλου',
  member_status: 'Κατάσταση', capacity: 'Ιδιότητα', capacity_date: 'Ημ. ιδιότητας', jw_date: 'Ημ. Β΄ Επόπτη', sw_date: 'Ημ. Α΄ Επόπτη', wm_date: 'Ημ. Σεβασμίου', dereg_date: 'Ημ. διαγραφής' };

db.defaultSettings({ lodge_portal_url: '', lodge_portal_key: '' });
db.seed('lodge_portal_codes', () => []);
db.seed('lodge_portal_log', () => []);

const S = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const cfg = () => ({ url: S(db.setting('lodge_portal_url')), key: S(db.setting('lodge_portal_key')) });
export const portalReady = () => !!(cfg().url && cfg().key);
async function api(body) {
  const { url, key } = cfg();
  if (!url) throw new Error('Ορίστε πρώτα τη διεύθυνση (URL /exec) του Apps Script της Πύλης.');
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ key, ...body }) });
  if (!r.ok) throw new Error('Το Apps Script της Πύλης δεν απάντησε (' + r.status + ').');
  const j = await r.json();
  if (!j.ok) throw new Error(j.error === 'admin_unauthorized' ? 'Λάθος κλειδί διαχείρισης (ADMIN_KEY) της Πύλης.' : j.error === 'unknown_action' ? 'Το Apps Script της Πύλης είναι παλιά ή άλλη έκδοση.' : 'Πύλη: ' + j.error);
  return j;
}

// ---------------------------------------------------------------- κωδικοί Στοών (μόνο εδώ, στα ιδιωτικά δεδομένα· ο server κρατά μόνο το hash)
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const newCode = () => { const b = crypto.getRandomValues(new Uint8Array(8)); const s = Array.from(b, (x) => ALPHA[x % ALPHA.length]).join(''); return `${s.slice(0, 4)}-${s.slice(4)}`; };
export async function codeHash(no, code) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`nglg-lodge|${lodgeNoKey(no)}|${S(code).toUpperCase()}`));
  return Array.from(new Uint8Array(d), (x) => x.toString(16).padStart(2, '0')).join('');
}
const codeOf = (no) => db.all('lodge_portal_codes').find((c) => lodgeNoKey(c.lodge_number) === lodgeNoKey(no));
const lodgeEmails = (l) => [...new Set([l.email, l.secretary_email].map(S).filter((e) => EMAIL_RE.test(e)))];

// ---------------------------------------------------------------- μητρώο Στοάς για τον server
function officeOf(m, rows) {
  const ep = epeteiridaOf(m.id)[0];
  if (ep && (ep.rank || ep.title)) return { office: ep.rank || ep.title, office_date: ep.decree_year ? String(ep.decree_year) : '' };
  const best = [['wm_date', 'Σεβάσμιος Διδάσκαλος'], ['sw_date', 'Α΄ Επόπτης'], ['jw_date', 'Β΄ Επόπτης']];
  for (const [k, t] of best) { const r = sortBy(rows.filter((l) => l[k]), (l) => l[k]).at(-1); if (r) return { office: `${t} (${r.lodge_name} ${r.lodge_number})`.trim(), office_date: r[k] }; }
  return { office: '', office_date: '' };
}
export function lodgeSnapshot(l) {
  const no = lodgeNoKey(l.number), rows = db.all('member_lodges'), byM = {};
  for (const r of rows) (byM[r.member_id] ||= []).push(r);
  const members = [];
  for (const r of rows.filter((x) => lodgeNoKey(x.lodge_number) === no)) {
    const m = db.get('member_registry', r.member_id);
    if (!m) continue;
    members.push({ id: m.id, ...Object.fromEntries(MEMBER_FIELDS.map((k) => [k, S(m[k])])),
      lodge: { ...Object.fromEntries(LODGE_FIELDS.map((k) => [k, S(r[k])])), capacity: S(capacityOf(r)) },
      ro: { registry: regCode(m), ...officeOf(m, byM[m.id] || []) } });
  }
  return { meta: { number: no, name: S(l.name), provincial: S(l.provincial), emails: lodgeEmails(l) }, members: sortBy(members, 'surname', 'first_name') };
}

// Δημοσίευση: τα μητρώα των Στοών με κωδικό + τα hash των κωδικών (μόνο όσες άλλαξαν γίνονται νέα έκδοση στον server)
export async function pushPortal(only = null) {
  const codes = db.all('lodge_portal_codes').filter((c) => c.code);
  const hashes = {};
  for (const c of codes) hashes[lodgeNoKey(c.lodge_number)] = await codeHash(c.lodge_number, c.code);
  const want = new Set((only || codes.map((c) => c.lodge_number)).map(lodgeNoKey));
  const lodges = lodgesAll(true).filter((l) => want.has(lodgeNoKey(l.number))).map(lodgeSnapshot);
  return api({ action: 'admin_push', lodges, codes: only ? undefined : hashes });
}

// Εφαρμογή μιας αλλαγής Γραμματέα (ή επαναφοράς) στο Μητρώο — μέσα σε ένα tx
export function applyChange(tx, rec) {
  const no = lodgeNoKey(rec.lodge), lodge = tx.find('lodges', (x) => lodgeNoKey(x.number) === no) || { name: rec.lodge_name, number: rec.lodge };
  const lines = [];
  for (const c of rec.changes || []) {
    const f = c.fields || {}, val = (k) => S((f[k] || [])[1]);
    if (c.is_new) {
      const m = Object.fromEntries(MEMBER_FIELDS.map((k) => [k, val(k)]));
      insertMember(tx, { ...m, lodges: [{ number: lodge.number, name: lodge.name, status: val('member_status') || '1. ΤΑΚΤΙΚΟ', capacity: val('capacity'), ...Object.fromEntries(LODGE_FIELDS.filter((k) => !['member_status', 'capacity'].includes(k)).map((k) => [k, val(k)])) }] });
      lines.push(`ΝΕΟ: ${c.name}`);
      continue;
    }
    const m = tx.get('member_registry', c.id);
    if (!m) { lines.push(`(δεν βρέθηκε μέλος ${c.id}: ${c.name})`); continue; }
    const mp = Object.fromEntries(Object.keys(f).filter((k) => MEMBER_FIELDS.includes(k)).map((k) => [k, val(k)]));
    const row = tx.all('member_lodges').find((l) => l.member_id === m.id && lodgeNoKey(l.lodge_number) === no);
    const lp = Object.fromEntries(Object.keys(f).filter((k) => LODGE_FIELDS.includes(k)).map((k) => [k, val(k)]));
    if (row && Object.keys(lp).length) tx.update('member_lodges', row.id, lp);
    // διαγραφή: όταν είναι ΔΙΑΓΡΑΦΕΝ σε ΟΛΕΣ τις Στοές του → απαγορεύεται η επικοινωνία· όταν επανέρχεται → επιτρέπεται ξανά
    if ('member_status' in lp) {
      const sts = tx.all('member_lodges').filter((l) => l.member_id === m.id).map((l) => l.member_status);
      if (deregEverywhere(sts)) Object.assign(mp, { no_contact: 1, active: 0 });
      else if (Number(m.no_contact) === 1) Object.assign(mp, { no_contact: 0, active: 1 });
    }
    if (Object.keys(mp).length) tx.update('member_registry', m.id, mp);
    lines.push(`${c.name}: ${Object.keys(f).map((k) => `${LABELS[k] || k} ${f[k][0] || '—'} → ${f[k][1] || '—'}`).join('; ')}`);
  }
  tx.insert('lodge_portal_log', { rec_id: rec.id, lodge_number: no, lodge_name: lodge.name || rec.lodge_name || '', version_name: rec.version_name, at: rec.at, source: rec.source || 'lodge',
    note_type: rec.note_type || '', note: rec.note || '', by: rec.by || '', summary: lines.join('\n'), applied_on: today() });
  return lines.length;
}

// Λήψη αλλαγών → εφαρμογή στο Μητρώο (μία αποθήκευση ανά έκδοση, με το όνομά της) → επιβεβαίωση στον server → νέα δημοσίευση των Στοών
export async function syncPortal() {
  const r = await api({ action: 'admin_pull' }), done = [], lodges = new Set();
  const seen = new Set(db.all('lodge_portal_log').map((x) => x.rec_id));
  for (const rec of r.changes || []) {
    if (!seen.has(rec.id)) await db.save(rec.version_name, (tx) => { applyChange(tx, rec); });
    done.push(rec.id); lodges.add(rec.lodge);
  }
  if (done.length) await api({ action: 'admin_ack', ids: done });
  if (lodges.size) await pushPortal([...lodges]); // τα νέα μέλη παίρνουν τον κανονικό τους κωδικό στον server
  return done.length;
}

// Αυτόματος συγχρονισμός με το άνοιγμα της εφαρμογής (όταν είναι ρυθμισμένη η Πύλη)
let autoDone = false;
db.on((ev) => {
  if (ev.type !== 'refresh' || autoDone || !db.backend || db.backend.kind !== 'github' || !portalReady()) return;
  autoDone = true;
  setTimeout(async () => {
    try { const n = await syncPortal(); if (n) toast(`Πύλη Γραμματέων: ${n} ${n === 1 ? 'αλλαγή Στοάς πέρασε' : 'αλλαγές Στοών πέρασαν'} στο Μητρώο.`); await pushPortal(); }
    catch (e) { console.warn('Πύλη Γραμματέων:', e); }
  }, 2500);
});

// ---------------------------------------------------------------- email κωδικού προς τη Στοά
export function codeMail(l, code) {
  const no = lodgeNoKey(l.number), link = `${PORTAL_PAGE}?lodge=${encodeURIComponent(no)}`;
  return { to: lodgeEmails(l).join(', '), subject: `Στοά ${l.name} ${no} - Κωδικός Πύλης Γραμματέων (Μητρώο Μελών)`,
    body: `Προς τη Γραμματεία της Σεβ. Στοάς «${l.name}» Αρ. ${no}\n\nΣας γνωρίζουμε ότι η Γραμματεία της Στοάς μπορεί πλέον να βλέπει και να ενημερώνει το Μητρώο Μελών της Στοάς ηλεκτρονικά, στην Πύλη Γραμματέων:\n\n${link}\n\nΚωδικός Στοάς: ${code}\n\n`
      + 'Κάθε αποθήκευση καταχωρίζεται ως νέα έκδοση του Μητρώου της Στοάς και στέλνεται email με τις αλλαγές στη Στοά. Πριν την αποθήκευση σημειώστε το είδος (π.χ. Αναγγελία Εισδοχής, Διέλευσης, Διδασκάλου Τέκτονος, νέων Αρχών).\n'
      + 'Ο κωδικός είναι προσωπικός για τη Γραμματεία της Στοάς — μην τον κοινοποιείτε. Για νέο κωδικό επικοινωνήστε με τη Μεγάλη Γραμματεία.' };
}

// Δημόσιο αρχείο της σελίδας lodge/: μόνο η διεύθυνση του Apps Script και ποιες Στοές έχουν πρόσβαση (αριθμός, όνομα) — κανένα προσωπικό στοιχείο
export function publishPublic(tx) {
  const nos = new Set(tx.all('lodge_portal_codes').filter((c) => c.code).map((c) => lodgeNoKey(c.lodge_number)));
  const lodges = tx.all('lodges').filter((l) => nos.has(lodgeNoKey(l.number))).map((l) => ({ number: lodgeNoKey(l.number), name: S(l.name) }))
    .sort((a, b) => (Number(a.number) || 1e9) - (Number(b.number) || 1e9));
  tx.putFile('public/lodge-portal.json', new TextEncoder().encode(JSON.stringify({ api_url: S(tx.setting('lodge_portal_url')), lodges })));
}

// ---------------------------------------------------------------- σελίδα
function portalPage({ query = {} }) {
  const { url, key } = cfg(), ls = lodgesAll(true).filter((l) => l.status !== 'Ανενεργή').sort((a, b) => (Number(a.number) || 1e9) - (Number(b.number) || 1e9));
  const withCode = ls.filter((l) => codeOf(l.number)), log = sortBy(db.all('lodge_portal_log'), (x) => x.at || '').reverse().slice(0, 60);
  const rows = ls.map((l) => { const c = codeOf(l.number), em = lodgeEmails(l);
    return [`<b>${esc(l.number)}</b>`, `${esc(l.name)}<br><small class="muted">${esc(l.provincial || '')}</small>`, em.length ? esc(em.join(', ')) : '<span class="vwarn">χωρίς email</span>',
      c ? `<code class="pcode" data-code="${esc(c.code)}">••••-••••</code> <button type="button" class="btn small" data-act="reveal" data-n="${esc(l.number)}" aria-label="Εμφάνιση κωδικού">👁</button><br><small class="muted">${esc(fmtDate(c.created_on))}${c.sent_on ? ' · στάλθηκε ' + esc(fmtDate(c.sent_on)) : ''}</small>` : '<span class="muted">—</span>',
      `<button type="button" class="btn small" data-act="gen" data-n="${esc(l.number)}">${c ? '🔁 Νέος' : '+ Κωδικός'}</button>${c && em.length ? ` <button type="button" class="btn small primary" data-act="send" data-n="${esc(l.number)}">✉ Αποστολή</button>` : ''} <a class="btn small" href="#/lodge-portal?v=${encodeURIComponent(l.number)}">Εκδόσεις</a>`]; });
  const vLodge = query.v ? ls.find((l) => lodgeNoKey(l.number) === lodgeNoKey(query.v)) : null;
  return {
    title: 'Πύλη Γραμματέων Στοών',
    html: `<div class="hero"><h1>🔐 Πύλη Γραμματέων Στοών</h1></div>
<p class="muted">Οι Γραμματείς βλέπουν και ενημερώνουν μόνο το Μητρώο της Στοάς τους στη σελίδα <a href="${PORTAL_PAGE}" target="_blank" rel="noopener">${PORTAL_PAGE} ↗</a>, με τον κωδικό της Στοάς.
Κάθε αποθήκευση γίνεται έκδοση «ΑλλαγήΣτοά<αρ>έκδοση<Ν>-<ημ/νία>», στέλνεται email στη Στοά (από τον λογαριασμό του Apps Script — info@) και περνά εδώ στο Μητρώο αυτόματα με το άνοιγμα της εφαρμογής ή με «⬇ Λήψη αλλαγών».</p>
<details class="card fold"${url && key ? '' : ' open'}><summary><b>⚙ Ρύθμιση</b> — ${url && key ? '<span class="vok">ρυθμισμένη</span>' : '<span class="vwarn">χρειάζεται ρύθμιση</span>'}</summary>
<form id="pcfg" class="grid" style="margin-top:10px"><div class="full"><label>Διεύθυνση Apps Script της Πύλης (URL /exec)</label><input name="url" value="${esc(url)}" placeholder="https://script.google.com/macros/s/…/exec"></div>
<div class="full"><label>Κλειδί διαχείρισης (ίδιο με το ADMIN_KEY στις Script Properties)</label><input name="key" type="password" value="${esc(key)}" autocomplete="off"></div>
<div class="full"><small class="muted">Οδηγίες εγκατάστασης: lodge/README.md. Το κλειδί φυλάσσεται μόνο στα ιδιωτικά δεδομένα. Η διεύθυνση δημοσιεύεται για τη σελίδα των Γραμματέων.</small></div>
<div class="full toolbar"><button class="btn primary">💾 Αποθήκευση ρύθμισης</button><button type="button" class="btn" data-act="test">🩺 Έλεγχος σύνδεσης</button></div></form></details>
<div class="toolbar"><button type="button" class="btn primary" data-act="pull">⬇ Λήψη αλλαγών Γραμματέων</button><button type="button" class="btn" data-act="push">⬆ Δημοσίευση μητρώων (${withCode.length} Στοές)</button>
<button type="button" class="btn" data-act="genAll">+ Κωδικοί για όσες δεν έχουν</button><button type="button" class="btn" data-act="sendAll">✉ Αποστολή κωδικών σε όλες</button><span class="muted" id="pst"></span></div>
${vLodge ? `<div class="card" id="vers"><h2 style="margin-top:0">Εκδόσεις Μητρώου · Στοά ${esc(vLodge.name)} ${esc(vLodge.number)}</h2><div id="vlist" class="muted">Φόρτωση…</div><p><a href="#/lodge-portal">← Όλες οι Στοές</a></p></div>` : ''}
<h2>Στοές & κωδικοί <small class="muted">${withCode.length} από ${ls.length} με κωδικό</small></h2>${table(['Αρ.', 'Στοά', 'Email Στοάς', 'Κωδικός', 'Ενέργειες'], rows)}
<h2>Ιστορικό αλλαγών Γραμματέων</h2>${log.length ? table(['Πότε', 'Στοά', 'Έκδοση', 'Σημείωση', 'Αλλαγές'], log.map((x) => [esc(fmtDate(String(x.at || '').slice(0, 10))), `${esc(x.lodge_name)} ${esc(x.lodge_number)}`, `<code>${esc(x.version_name)}</code>${x.source === 'restore' ? ' <span class="pill">επαναφορά</span>' : ''}`,
  esc([x.note_type, x.note].filter(Boolean).join(' — ')) + (x.by ? `<br><small class="muted">${esc(x.by)}</small>` : ''), `<small style="white-space:pre-wrap">${esc(x.summary)}</small>`])) : '<p class="muted">Δεν έχουν γίνει ακόμη αλλαγές από Γραμματείς.</p>'}`,
    mount(el) {
      const st = el.querySelector('#pst'), busy = async (msg, fn) => { st.textContent = '⏳ ' + msg; try { const r = await fn(); st.textContent = ''; return r; } catch (e) { st.textContent = ''; toast(e.message || String(e), 'error'); return null; } };
      el.querySelector('#pcfg').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target), u = S(f.get('url')), k = S(f.get('key'));
        if (u && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(u)) { toast('Η διεύθυνση πρέπει να είναι το URL /exec του Apps Script.', 'error'); return; }
        await db.save('Πύλη Γραμματέων: ρύθμιση', (tx) => { tx.setting('lodge_portal_url', u); tx.setting('lodge_portal_key', k); publishPublic(tx); });
        flash('Η ρύθμιση της Πύλης αποθηκεύτηκε.'); go('/lodge-portal');
      });
      const genFor = async (nos) => {
        await db.save(`Πύλη Γραμματέων: κωδικοί ${nos.length} Στοών`, (tx) => { for (const n of nos) { const c = tx.find('lodge_portal_codes', (x) => lodgeNoKey(x.lodge_number) === lodgeNoKey(n)), v = { code: newCode(), created_on: today(), sent_on: '' };
          if (c) tx.update('lodge_portal_codes', c.id, v); else tx.insert('lodge_portal_codes', { lodge_number: lodgeNoKey(n), ...v }); } publishPublic(tx); });
        if (portalReady()) await busy('Δημοσίευση…', () => pushPortal());
      };
      const sendFor = async (nos, confirmAll) => {
        const { driveReady } = await import('../core/drive.js');
        if (!driveReady()) { toast('Για αποστολή email χρειάζεται το Google Client ID (Ρυθμίσεις → Google).', 'error'); return; }
        const { sendNow, confirmSend } = await import('../core/gmail.js');
        const list = nos.map((n) => ls.find((l) => lodgeNoKey(l.number) === lodgeNoKey(n))).filter((l) => l && codeOf(l.number) && lodgeEmails(l).length);
        if (!list.length) { toast('Καμία Στοά με κωδικό και email.', 'error'); return; }
        const first = codeMail(list[0], codeOf(list[0].number).code);
        if (!await confirmSend({ from: senderFor('general'), msg: first, note: confirmAll ? `Θα σταλούν ${list.length} email, ένα σε κάθε Στοά με τον δικό της κωδικό.` : '' })) return;
        let ok = 0;
        for (const l of list) {
          st.textContent = `⏳ Αποστολή ${ok + 1}/${list.length}: ${l.name}…`;
          try { await sendNow(codeMail(l, codeOf(l.number).code), [], 'general'); ok++; await db.save(`Πύλη Γραμματέων: κωδικός στάλθηκε ${l.name} ${l.number}`, (tx) => tx.update('lodge_portal_codes', codeOf(l.number).id, { sent_on: today() })); }
          catch (e) { toast(`${l.name}: ${e.message || e}`, 'error'); if (/λογαριασμός Google|401|403/.test(String(e.message || e))) break; }
        }
        st.textContent = ''; flash(`Στάλθηκαν ${ok} από ${list.length} κωδικούς.`); go('/lodge-portal', query);
      };
      bind(el, {
        async test() { const r = await busy('Έλεγχος…', () => api({ action: 'admin_status' })); if (r) toast(`✓ Η Πύλη απαντά (έκδοση ${r.version}, ${r.lodges} Στοές με κωδικό).`); },
        async pull() { const n = await busy('Λήψη αλλαγών…', syncPortal); if (n !== null) { flash(n ? `Πέρασαν στο Μητρώο ${n} ${n === 1 ? 'αλλαγή' : 'αλλαγές'} Γραμματέων.` : 'Δεν υπάρχουν νέες αλλαγές.'); go('/lodge-portal', query); } },
        async push() { const r = await busy('Δημοσίευση…', () => pushPortal()); if (r) toast(`✓ Δημοσιεύθηκαν ${r.written} μητρώα (τα υπόλοιπα χωρίς αλλαγή)${r.skipped && r.skipped.length ? ` · ${r.skipped.length} περιμένουν «Λήψη αλλαγών»` : ''}.`); },
        async gen(d) { if (codeOf(d.n) && !confirm('Νέος κωδικός: ο παλιός παύει να ισχύει. Συνέχεια;')) return; await genFor([d.n]); go('/lodge-portal', query); },
        async genAll() { const nos = ls.filter((l) => !codeOf(l.number)).map((l) => l.number); if (!nos.length) { toast('Όλες οι Στοές έχουν κωδικό.'); return; } await genFor(nos); flash(`Δημιουργήθηκαν ${nos.length} κωδικοί.`); go('/lodge-portal', query); },
        reveal(d, b) { const c = b.parentElement.querySelector('.pcode'); c.textContent = c.textContent.includes('•') ? c.dataset.code : '••••-••••'; },
        send(d) { return sendFor([d.n], false); },
        sendAll() { return sendFor(ls.map((l) => l.number), true); },
      });
      if (vLodge) (async () => {
        const box = el.querySelector('#vlist');
        try {
          const r = await api({ action: 'admin_versions', lodge: lodgeNoKey(vLodge.number) });
          box.innerHTML = r.versions.length ? table(['Έκδοση', 'Πότε', ''], r.versions.map((v, i) => [`<code>${esc(v.name)}</code>${i === 0 ? ' <span class="pill ok">τρέχουσα</span>' : ''}`, esc(new Date(v.at).toLocaleString('el-GR')),
            i === 0 ? '' : `<button type="button" class="btn small" data-restore="${v.version}">↺ Επαναφορά σε αυτή</button>`])) : 'Δεν υπάρχουν ακόμη εκδόσεις (δημοσιεύστε πρώτα τα μητρώα).';
          box.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-restore]'); if (!b) return;
            if (!confirm(`Επαναφορά του Μητρώου της Στοάς ${vLodge.name} ${vLodge.number} στην έκδοση ${b.dataset.restore}; Θα γίνει νέα έκδοση και θα περάσει στο Μητρώο.`)) return;
            const x = await busy('Επαναφορά…', () => api({ action: 'admin_restore', lodge: lodgeNoKey(vLodge.number), version: Number(b.dataset.restore) }));
            if (!x) return;
            const n = await busy('Εφαρμογή στο Μητρώο…', syncPortal);
            flash(`Επαναφορά: «${x.version_name}» (${x.changes} μέλη άλλαξαν) — ${n || 0} εφαρμόστηκαν στο Μητρώο.`); go('/lodge-portal', query);
          });
        } catch (e) { box.textContent = e.message || String(e); }
      })();
    },
  };
}

module({ id: 'lodge-portal', routes: { '/lodge-portal': portalPage } });
