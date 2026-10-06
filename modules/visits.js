// Επισκέψεις Στοών & Εκπρόσωποι ΜΔ — ημερολόγιο Εγκαταστάσεων, εκπρόσωποι και βαθμοί, ενημέρωση εκπροσώπου
// (με πρόσκληση ημερολογίου .ics) και Επαρχίας, αναφορά προγράμματος, εισαγωγή από «Επιστολές Γραμματείας».
// Τα email ανοίγουν έτοιμα στο Gmail από τον λογαριασμό «Γενικά εξερχόμενα» (info@).
import { db } from '../core/store.js';
import { module, onSubmit, go, flash, bind, confirmDo, table, notice, toast } from '../core/app.js';
import { crud } from '../core/crud.js';
import { esc, fold, today, fmtDate, dayStr, parseIso, sortBy, download, EMAIL_RE, splitEmails, grUpper, DAYS, isoDate, parsePasted } from '../core/util.js';
import { senderBanner, copyText } from '../core/mail.js';
import { reportPaper, printPaper } from '../core/paper.js';
import { attachPicker, contactItems, memberItems, noContact } from '../core/pickers.js';
import { provincialChoices, provinceByShort } from './provinces.js';
import { lodgesAll, lodgeNoKey, lodgeByNumber, cleanLodgeName } from './lodges.js';

const MONTHS = ['Ιανουάριος', 'Φεβρουάριος', 'Μάρτιος', 'Απρίλιος', 'Μάιος', 'Ιούνιος', 'Ιούλιος', 'Αύγουστος', 'Σεπτέμβριος', 'Οκτώβριος', 'Νοέμβριος', 'Δεκέμβριος'];
export const REP_RANKS = ['Σεβάσμιος Αδ.', 'Λίαν Σεβάσμιος Αδ.', 'Πανσεβάσμιος Αδ.', 'Σεβασμιώτατος Αδ.'];
const REP_DEFAULT_RANKS = { 'Μέγας Διδάσκαλος': 3, 'Αναπληρωτής Μέγας Διδάσκαλος': 2, 'Βοηθός Μέγας Διδάσκαλος': 2, 'Επαρχιακός Μέγας Διδάσκαλος': 2, 'Περιφερειακός Μέγας Διδάσκαλος': 2,
  'Πρώτος Μέγας Επόπτης': 2, 'Δεύτερος Μέγας Επόπτης': 2, 'Μέγας Καγκελάριος': 1, 'Αναπληρωτής Μέγας Καγκελάριος': 1, 'Μέγας Γραμματέας': 1, 'Αναπληρωτής Μέγας Γραμματέας': 1, 'Μέγας Ευχέτης': 1,
  'Μέγας Τελετάρχης': 1, 'Μέγας Επόπτης Έργων': 1, 'Μέγας Ξιφοφόρος': 1, 'Μέγας Επιθεωρητής': 1, 'Πρόεδρος Συμβουλίου Μεγάλης Φιλανθρωπίας': 1, 'Πρόεδρος Μεγάλης Φιλανθρωπίας': 1 };
const PUB_SUBJECT = 'Ενημέρωση Εκπροσώπησης ΜΔ στις Εγκαταστάσεις Σεβασμίων Σ. Στοών της Επαρχίας σας';
db.defaultSettings({ visits_signer_name: 'Πσεβ. Αδ. Δημήτριος Σκιαδόπουλος', visits_signer_title: 'Μέγας Γραμματεύς', visits_rankmap: '{}' });

// ---------------------------------------------------------------- δεδομένα
export const repsAll = () => sortBy(db.all('reps'), (r) => fold(r.surname), (r) => fold(r.name));
export const visitsAll = () => sortBy(db.all('visits'), 'visit_date', (v) => Number(v.lodge_number) || 0);
const repMap = () => Object.fromEntries(db.all('reps').map((r) => [r.id, r]));
const signature = () => `Με Τεκτονικούς χαιρετισμούς,\n\n${db.setting('visits_signer_name') || ''}\n${db.setting('visits_signer_title') || ''}`.trim();
const rankmap = () => { try { return JSON.parse(db.setting('visits_rankmap') || '{}'); } catch { return {}; } };
const baseOffices = (r) => String(r.office || '').split(' · ').map((o) => o.replace(/\s*\(\d{4}\)\s*$/, '').replace(/^Πρώην\s+/, '').trim()).filter(Boolean);
export function repRank(r, rm = rankmap()) {
  if (!r) return '';
  if (REP_RANKS.includes(r.rep_rank)) return r.rep_rank;
  const os = baseOffices(r);
  return os.length ? REP_RANKS[Math.max(...os.map((o) => rm[o] ?? REP_DEFAULT_RANKS[o] ?? 0))] : '';
}
const firstOffice = (r) => String((r || {}).office || '').split(' · ')[0].replace(/\s*\(\d{4}\)\s*$/, '');
const isPast = (r) => String(r.office || '').startsWith('Πρώην');
export const repLabel = (r, rm) => (r ? [repRank(r, rm), r.surname, r.name].filter(Boolean).join(' ') : '');
const repFull = (r) => { const o = firstOffice(r); return `${repRank(r) || 'Αδ.'} ${r.name || ''} ${r.surname || ''}${o ? ', ' + o : ''}`; };
const repVocative = (r) => (repRank(r) || 'Αγαπητός Αδ.').replace(/ος Αδ\.$/, 'ε Αδελφέ');
function repContact(r) {
  let email = String(r.email || '').trim(), mobile = String(r.mobile || '').trim();
  const m = r.member_id && db.get('member_registry', r.member_id);
  if (noContact(m)) return ['', ''];
  if (m) { email ||= String(m.email || '').trim(); mobile ||= String(m.mobile || '').trim(); }
  return [email, mobile];
}
const lodgeRef = (v) => `Σ.Σ. «${v.lodge || ''}»` + (v.lodge_number ? ` Αρ. ${v.lodge_number}` : '');
const monthTitle = (k) => { const [y, m] = k.split('-'); return `${MONTHS[Number(m) - 1]} ${y}`; };
const provTitle = (p) => { const w = String((p || {}).addressee || '').split(' ')[0]; return w.endsWith('.') ? w : ''; };
const repNotified = (v) => !!v.rep_notified_at && v.rep_notified_date === v.visit_date && (v.rep_notified_rep || null) === (v.rep_id || null);
const provNotified = (v) => !!v.prov_notified_at && v.prov_notified_date === v.visit_date && (v.prov_notified_rep || null) === (v.rep_id || null);
async function markVisits(ids, kind, repId) {
  await db.save(kind === 'rep' ? 'Επισκέψεις: ενημέρωση εκπροσώπου' : 'Επισκέψεις: ενημέρωση Επαρχίας', (tx) => {
    for (const id of ids) { const v = tx.get('visits', id); if (v) tx.update('visits', id, { [`${kind}_notified_at`]: today(), [`${kind}_notified_date`]: v.visit_date, [`${kind}_notified_rep`]: repId ?? v.rep_id ?? null }); }
  });
}

function icsFor(vs) {
  const q = (s) => String(s || '').replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ev = vs.map((v) => {
    const d = parseIso(v.visit_date), n = new Date(d); n.setDate(n.getDate() + 1);
    const p = provinceByShort(v.province || ''), ymd = (x) => isoDate(x).replace(/-/g, '');
    const desc = 'Εκπροσώπηση του Μεγάλου Διδασκάλου.' + (v.province ? ` ${(p || {}).full_title || v.province}.` : '') + ' Η ώρα έναρξης θα επιβεβαιωθεί από τη Στοά.';
    return ['BEGIN:VEVENT', `UID:visit-${v.id || ymd(d) + '-' + (v.lodge_number || 'x')}@nglg-lodge-visits`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${ymd(d)}`, `DTEND;VALUE=DATE:${ymd(n)}`,
      `SUMMARY:${q('Εγκατάσταση Σεβασμίου — ' + lodgeRef(v))}`, v.location ? `LOCATION:${q(v.location)}` : '', `DESCRIPTION:${q(desc)}`, 'END:VEVENT'].filter(Boolean).join('\r\n');
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//NGLG//Lodge Visits//EL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', ...ev, 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

function repMail(r, vs) {
  vs = sortBy(vs, 'visit_date');
  const one = vs.length === 1, v = vs[0];
  const item = (x) => { const p = provinceByShort(x.province || ''); let s = `${lodgeRef(x)}\n   Ημερομηνία: ${dayStr(x.visit_date)}`; if (x.location) s += `\n   Τόπος: ${x.location}`; if (x.province) s += `\n   Επαρχία: ${(p || {}).full_title || x.province}` + (p && p.email ? ` (Γραμματεία: ${p.email})` : ''); return s; };
  const items = one ? item(v) : vs.map((x, i) => `${i + 1}. ${item(x)}`).join('\n\n');
  const where = one ? 'στην Εγκατάσταση του Σεβασμίου Διδασκάλου της κάτωθι Σεβαστής Στοάς' : 'στις Εγκαταστάσεις των Σεβασμίων Διδασκάλων των κάτωθι Σεβαστών Στοών';
  return {
    visits: vs,
    subject: one ? `Ενημέρωση Εκπροσώπησης ΜΔ — Εγκατάσταση Σεβασμίου ${lodgeRef(v)} — ${dayStr(v.visit_date)}` : 'Ενημέρωση Εκπροσώπησης ΜΔ στις Εγκαταστάσεις Σεβασμίων Σ. Στοών',
    body: `${repVocative(r)},\n\nΣας ενημερώνουμε ότι έχετε οριστεί να εκπροσωπήσετε τον Μεγάλο Διδάσκαλο ${where}:\n\n${items}\n\nΗ αρμόδια Επαρχιακή Μεγάλη Στοά ενημερώνεται σχετικά. Παρακαλούμε όπως έλθετε σε επικοινωνία με τη Γραμματεία της Επαρχίας ή με τον Σεβάσμιο της Στοάς για την ώρα έναρξης και τις λεπτομέρειες της τελετής, και όπως μας ενημερώσετε έγκαιρα σε περίπτωση κωλύματος.\n\nΣας ευχαριστούμε θερμά για την εκπροσώπηση.\n\n${signature()}`,
    ics: icsFor(vs), icsName: one ? `egkatastasi-${v.lodge_number || 'stoa'}.ics` : 'egkatastaseis.ics',
  };
}
function provinceMissing(prov) {
  const has = new Set(visitsAll().filter((v) => v.visit_date >= today() && v.lodge_number).map((v) => lodgeNoKey(v.lodge_number)));
  return lodgesAll(true).filter((l) => (l.provincial || '') === prov && !has.has(lodgeNoKey(l.number)));
}
function provinceMail(p, rows, missing) {
  const reps = repMap();
  const lines = rows.map((v, i) => `${i + 1}. ${dayStr(v.visit_date)} — ${lodgeRef(v)}${v.location ? ' — ' + v.location : ''}\n   Εκπρόσωπος ΜΔ: ` + (reps[v.rep_id] ? repFull(reps[v.rep_id]) : 'θα οριστεί και θα σας γνωστοποιηθεί')).join('\n\n');
  const t = provTitle(p), full = (p || {}).full_title || '';
  let out = `Αγαπητέ Αδελφέ${t ? ' ' + t : ''},\n\nΣας γνωρίζουμε ότι στις Εγκαταστάσεις των Σεβασμίων Διδασκάλων των Σεβαστών Στοών της Επαρχίας σας${full ? ` (${full})` : ''} τον Μεγάλο Διδάσκαλο θα εκπροσωπήσουν οι κάτωθι Αδελφοί:\n\n${lines}\n`;
  if (rows.some((v) => !reps[v.rep_id])) out += '\nΓια τις Εγκαταστάσεις όπου δεν έχει ακόμη οριστεί εκπρόσωπος θα ακολουθήσει νεότερη ενημέρωση.\n';
  if (missing.length) out += '\nΔεν μας έχει ακόμη γνωστοποιηθεί η ημερομηνία Εγκατάστασης για τις Σεβαστές Στοές: ' + missing.map((l) => `«${l.name}» Αρ. ${l.number}`).join(', ') + '. Παρακαλούμε όπως μας τη γνωστοποιήσετε.\n';
  return out + `\nΠαρακαλούμε όπως ενημερώσετε σχετικά τις Σεβαστές Στοές.\n\n${signature()}`;
}

// ---------------------------------------------------------------- σελίδες
function visitCard(v, reps) {
  const d = parseIso(v.visit_date), r = reps[v.rep_id], p = provinceByShort(v.province || '');
  const oks = (repNotified(v) ? `<span class="vok">✓ Εκπρόσωπος ενημερώθηκε ${esc(fmtDate(v.rep_notified_at))}</span>` : '') + (provNotified(v) ? `<span class="vok">✓ Επαρχία ενημερώθηκε ${esc(fmtDate(v.prov_notified_at))}</span>` : '');
  const brief = r ? `<a class="btn small${repNotified(v) ? '' : ' primary'}" href="#/visits/brief?ids=${v.id}">${repNotified(v) ? '↻ Ξανά στον εκπρόσωπο' : '✉ Ενημέρωση εκπροσώπου'}</a>` : '';
  return `<div class="vcard${v.visit_date < today() ? ' past' : ''}"><div class="vdate"><b>${d ? d.getDate() : ''}</b><small>${d ? DAYS[d.getDay()].slice(0, 3) : ''}</small></div>
<div><div class="vlodge"><a href="#/visits/edit/${v.id}">${esc(v.lodge)}</a>${v.lodge_number ? `<span class="no">Αρ. ${esc(v.lodge_number)}</span>` : ''}</div><div class="vmeta">${esc(dayStr(v.visit_date))} · ${esc(v.location || 'Τόπος —')}</div>
${v.notes ? `<div class="vnote">${esc(v.notes)}</div>` : ''}${v.province ? `<span class="vchip">${esc(v.province)}</span>` : ''}${p && p.email ? ` <span class="vmeta">${esc(p.email)}</span>` : ''}${brief || oks ? `<div>${brief} ${oks}</div>` : ''}</div>
<div class="vrep">${r ? `<b>${esc(repLabel(r))}</b><div class="vmeta">${esc(r.office || '')}</div>` : '<span class="vwarn">Χωρίς εκπρόσωπο</span>'}</div></div>`;
}

function visitsPage({ query }) {
  const t = today(), vs = visitsAll(), reps = repMap(), rm = rankmap(), up = vs.filter((v) => v.visit_date >= t);
  const unas = up.filter((v) => !reps[v.rep_id]).length, tobrief = up.filter((v) => reps[v.rep_id] && !repNotified(v)).length, ql = fold(query.q || '');
  const lst = vs.filter((v) => {
    if (!query.past && v.visit_date < t) return false;
    if (query.prov && v.province !== query.prov) return false;
    if (query.rep === '__none' && reps[v.rep_id]) return false;
    if (query.rep && query.rep !== '__none' && String(v.rep_id || '') !== query.rep) return false;
    if (query.notif === 'rep' && !(reps[v.rep_id] && !repNotified(v))) return false;
    if (query.notif === 'prov' && provNotified(v)) return false;
    return !ql || fold([v.lodge, v.lodge_number, v.location, v.province, repLabel(reps[v.rep_id], rm)].join(' ')).includes(ql);
  });
  const groups = {};
  for (const v of lst) (groups[v.visit_date.slice(0, 7)] ||= []).push(v);
  const body = !vs.length ? '<div class="card">Δεν υπάρχουν ακόμη επισκέψεις. Πατήστε «Νέα επίσκεψη» ή «Επικόλληση λίστας».</div>' : !lst.length ? '<div class="card">Καμία επίσκεψη δεν ταιριάζει με τα φίλτρα.</div>'
    : Object.entries(groups).map(([k, items]) => `<section class="vmonth"><h2>${monthTitle(k)} <small>${items.length} ${items.length === 1 ? 'επίσκεψη' : 'επισκέψεις'}</small></h2>${items.map((v) => visitCard(v, reps)).join('')}</section>`).join('');
  const sel = (n, v) => (String(query[n] || '') === String(v) ? ' selected' : '');
  return {
    title: 'Επισκέψεις Στοών',
    html: `<h1>Επισκέψεις Στοών</h1>${notice(query.msg)}<div class="toolbar"><a class="btn primary" href="#/visits/new">+ Νέα επίσκεψη</a><a class="btn" href="#/visits/import">Επικόλληση λίστας</a>
<a class="btn" href="#/visits/publish${query.prov ? '?prov=' + encodeURIComponent(query.prov) : ''}">Ενημέρωση Επαρχίας</a><a class="btn" href="#/visits/report">Αναφορά</a><a class="btn" href="#/reps">Εκπρόσωποι</a></div>
<div class="vstats"><span><b>${up.length}</b> προσεχείς επισκέψεις</span><span class="${unas ? 'warn' : ''}"><b>${unas}</b> χωρίς εκπρόσωπο</span><span class="${tobrief ? 'warn' : ''}"><b>${tobrief}</b> εκπρόσωποι προς ενημέρωση</span><span><b>${Object.keys(reps).length}</b> εκπρόσωποι</span></div>
<form class="card filters vfilters" id="flt"><input name="q" value="${esc(query.q || '')}" placeholder="Αναζήτηση Στοάς, αριθμού, τόπου, εκπροσώπου…">
<select name="prov"><option value="">Όλες οι Επαρχίες</option>${provincialChoices().map((p) => `<option${sel('prov', p)}>${esc(p)}</option>`).join('')}</select>
<select name="rep"><option value="">Όλοι οι εκπρόσωποι</option><option value="__none"${sel('rep', '__none')}>Χωρίς εκπρόσωπο</option>${repsAll().map((r) => `<option value="${r.id}"${sel('rep', r.id)}>${esc(repLabel(r, rm))}</option>`).join('')}</select>
<select name="notif"><option value="">Όλες οι ενημερώσεις</option><option value="rep"${sel('notif', 'rep')}>Εκπρόσωπος δεν ενημερώθηκε</option><option value="prov"${sel('notif', 'prov')}>Επαρχία δεν ενημερώθηκε</option></select>
<label><input type="checkbox" name="past"${query.past ? ' checked' : ''}> Παλαιότερες</label><button>Φίλτρο</button></form>${body}`,
    mount(el) { onSubmit(el.querySelector('#flt'), (d) => go('/visits', { ...d, past: d.past ? '1' : '' })); },
  };
}

function visitForm(v) {
  const x = v || {}, rm = rankmap(), val = (k) => esc(x[k] ?? '');
  const provs = provincialChoices();
  return {
    title: v ? 'Επίσκεψη' : 'Νέα επίσκεψη',
    html: `<p><a href="#/visits">← Επισκέψεις</a></p><h1>${v ? 'Επίσκεψη · ' + esc(v.lodge) : 'Νέα επίσκεψη'}</h1>
${v ? `<p>${repNotified(v) ? `<span class="vok">✓ Εκπρόσωπος ενημερώθηκε ${esc(fmtDate(v.rep_notified_at))}</span>` : ''}${provNotified(v) ? `<span class="vok">✓ Επαρχία ενημερώθηκε ${esc(fmtDate(v.prov_notified_at))}</span>` : ''}</p>` : ''}
<form id="vf"><div class="grid card"><div><label>Ημερομηνία</label><input type="date" name="visit_date" value="${val('visit_date')}" required></div>
<div><label>Αριθμός Στοάς</label><input name="lodge_number" id="vNo" value="${val('lodge_number')}" placeholder="π.χ. 32"></div>
<div class="full"><label>Στοά</label><input name="lodge" id="vLodge" list="vLodges" value="${val('lodge')}" required placeholder="Αριθμός ή όνομα — επιλέξτε από τις Συμβολικές Στοές">
<datalist id="vLodges">${lodgesAll(true).map((l) => `<option value="${esc(l.number)} · ${esc(l.name)}">`).join('')}</datalist><small class="muted">Με την επιλογή συμπληρώνονται αριθμός, Επαρχία και τόπος.</small></div>
<div class="full"><label>Τόπος</label><input name="location" id="vLoc" value="${val('location')}" placeholder="Τεκτονικόν Μέγαρον …"></div>
<div><label>Επαρχιακή Μεγάλη Στοά</label><select name="province" id="vProv"><option value="">—</option>${[...provs, ...(x.province && !provs.includes(x.province) ? [x.province] : [])].map((p) => `<option${p === x.province ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
<div><label>Εκπρόσωπος</label><select name="rep_id"><option value="">— Χωρίς εκπρόσωπο —</option>${repsAll().map((r) => `<option value="${r.id}"${r.id === x.rep_id ? ' selected' : ''}>${esc(repLabel(r, rm))} — ${esc(r.office || '')}${r.year ? ' (' + esc(r.year) + ')' : ''}</option>`).join('')}</select></div>
<div class="full"><label>Σημειώσεις</label><input name="notes" value="${val('notes')}"></div></div>
<div class="toolbar"><button class="btn primary">💾 Αποθήκευση</button>${v && v.rep_id ? `<a class="btn" href="#/visits/brief?ids=${v.id}">✉ Ενημέρωση εκπροσώπου</a>` : ''}<a class="btn" href="#/visits">Άκυρο</a>${v ? '<button type="button" class="btn danger" data-act="del">Διαγραφή</button>' : ''}</div></form>`,
    mount(el) {
      const L = el.querySelector('#vLodge');
      const fill = () => { const m = /^\s*(\d{1,4}|Φ)\s*·\s*(.+)$/.exec(L.value); if (!m) return; const l = lodgeByNumber(m[1]); L.value = m[2]; el.querySelector('#vNo').value = m[1];
        if (l && l.provincial) el.querySelector('#vProv').value = l.provincial; if (l && l.meeting_place && !el.querySelector('#vLoc').value) el.querySelector('#vLoc').value = l.meeting_place; };
      L.addEventListener('change', fill); L.addEventListener('input', fill);
      onSubmit(el.querySelector('#vf'), async (d) => {
        if (!parseIso(d.visit_date)) throw new Error('Συμπληρώστε έγκυρη ημερομηνία.');
        const row = { visit_date: d.visit_date, lodge: cleanVisit(d.lodge), lodge_number: d.lodge_number.trim(), location: d.location.trim(), province: d.province, rep_id: Number(d.rep_id) || null, notes: d.notes.trim() };
        if (!row.lodge) throw new Error('Συμπληρώστε τη Στοά.');
        const l = row.lodge_number && lodgeByNumber(row.lodge_number);
        if (l) { row.province ||= l.provincial || ''; row.location ||= l.meeting_place || ''; }
        await db.save(v ? 'Επίσκεψη: ενημέρωση' : 'Νέα επίσκεψη', (tx) => (v ? tx.update('visits', v.id, row) : tx.insert('visits', row)));
        flash('Η επίσκεψη αποθηκεύτηκε.'); go('/visits');
      });
      bind(el, { async del() { if (!confirmDo('Διαγραφή της επίσκεψης;')) return; await db.save('Διαγραφή επίσκεψης', (tx) => tx.remove('visits', v.id)); flash('Η επίσκεψη διαγράφηκε.'); go('/visits'); } });
    },
  };
}
const cleanVisit = (s) => String(s || '').replace(/Σ\s*\.\s*Σ\s*\.?/g, '').replace(/Υπ\s*['’΄]?\s*Αρ(ιθ(μ(όν|ον))?)?\s*\.?/gi, '').replace(/\s+/g, ' ').trim();
function parseVisitLine(line) {
  const m = /(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})/.exec(line);
  if (!m) return null;
  const d = new Date(+m[3], +m[2] - 1, +m[1]);
  if (d.getMonth() !== +m[2] - 1) return null;
  let rest = cleanVisit(line.slice(m.index + m[0].length).replace(/\b(date|lodge|numbers?|location)\b\s*:?/gi, ' ').replace(/[,;]/g, ' '));
  let lodge = '', number = '', location = '';
  const nm = /\b(\d{1,4})\b/.exec(rest);
  if (nm) { lodge = rest.slice(0, nm.index).trim(); number = nm[1]; location = rest.slice(nm.index + nm[0].length).trim(); }
  else { const i = rest.search(/Τεκτονικ/i); if (i > 0) { lodge = rest.slice(0, i).trim(); location = rest.slice(i).trim(); } else lodge = rest; }
  location = location.replace(/\.$/, '').trim();
  if (!lodge) return null;
  const reg = number && lodgeByNumber(number);
  return { visit_date: isoDate(d), lodge: reg ? reg.name : lodge, lodge_number: number, location: location || (reg || {}).meeting_place || '', province: (reg || {}).provincial || '', rep_id: null, notes: '' };
}

// Σύνθεση email: ο χρήστης βλέπει/διορθώνει, ανοίγει στο Gmail και σημειώνει «στάλθηκε».
function composePage(title, msg, { onSent, hint = '', attach = null, back = '#/visits' }) {
  return {
    title,
    html: `<p><a href="${back}">← Επιστροφή</a></p><h1>${esc(title)}</h1>${senderBanner('general')}${hint ? `<div class="card">${esc(hint)}</div>` : ''}
<form class="card" id="cf"><label>🔎 Παραλήπτης από τον Κατάλογο</label><input id="cPick" placeholder="Επαρχία, Στοά, μέλος…" autocomplete="off">
<label style="margin-top:10px">Προς</label><input name="to" value="${esc(msg.to)}" required><label style="margin-top:10px">Κρυφή κοινοποίηση (Bcc)</label><input name="bcc" value="${esc(msg.bcc || '')}" placeholder="προαιρετικό">
<label style="margin-top:10px">Θέμα</label><input name="subject" value="${esc(msg.subject)}" required><label style="margin-top:10px">Κείμενο</label><textarea name="body" style="min-height:340px">${esc(msg.body)}</textarea>
${attach ? `<p><button type="button" class="btn" data-act="ics">📅 Λήψη ${esc(attach.name)} (πρόσκληση ημερολογίου)</button> <small class="muted">Επισυνάψτε το στο email.</small></p>` : ''}
<div class="toolbar" style="margin-top:10px"><button type="button" class="btn primary" data-act="gmail">✉ Άνοιγμα στο Gmail</button><button type="button" class="btn" data-act="device">📱 Εφαρμογή email</button><button type="button" class="btn" data-act="copy">📋 Αντιγραφή κειμένου</button>
<button class="btn">✓ Σημείωση ως σταλμένο</button></div><small class="muted">Πολλοί παραλήπτες: χωρίστε με κόμμα. Μετά την αποστολή πατήστε «Σημείωση ως σταλμένο».</small></form>`,
    async mount(el) {
      const f = el.querySelector('#cf');
      const { gmailUrl, mailtoUrl } = await import('../core/mail.js');
      const cur = () => ({ to: f.to.value, bcc: f.bcc.value, subject: f.subject.value, body: f.body.value, kind: 'general' });
      attachPicker(el.querySelector('#cPick'), contactItems, (c) => { if (c.email) f.to.value = [...splitEmails(f.to.value), c.email].join(', '); });
      bind(el, {
        gmail: () => window.open(gmailUrl(cur()), '_blank', 'noopener'),
        device: () => { location.href = mailtoUrl(cur()); },
        async copy() { await copyText(f.body.value); toast('Το κείμενο αντιγράφηκε.'); },
        ics: () => download(attach.name, attach.data, 'text/calendar'),
      });
      onSubmit(f, async () => { await onSent(cur()); });
    },
  };
}

const ids = (s) => String(s || '').split(/[,\s]+/).map(Number).filter(Boolean);
function briefPage({ query }) {
  const vs = ids(query.ids).map((i) => db.get('visits', i)).filter(Boolean);
  if (!vs.length) return '<h1>Δεν βρέθηκε η επίσκεψη</h1>';
  const r = db.get('reps', vs[0].rep_id);
  if (!r) return '<h1>Η επίσκεψη δεν έχει εκπρόσωπο</h1>';
  const c = repMail(r, vs.filter((v) => v.rep_id === r.id)), [email] = repContact(r);
  return composePage('Ενημέρωση Εκπροσώπου', { to: email, subject: c.subject, body: c.body }, {
    hint: email ? '' : `Ο ${r.surname} ${r.name} δεν έχει email· συμπληρώστε το εδώ ή στην καρτέλα «Εκπρόσωποι».`, attach: { name: c.icsName, data: c.ics },
    onSent: async () => { await markVisits(c.visits.map((v) => v.id), 'rep', r.id); flash(`Σημειώθηκε η ενημέρωση του ${r.surname} ${r.name}.`); go('/visits'); },
  });
}

const pubRows = (prov, frm, to) => visitsAll().filter((v) => v.province === prov && (!frm || v.visit_date >= frm) && (!to || v.visit_date <= to));
function publishPage({ query }) {
  const provs = provincialChoices(), prov = provs.includes(query.prov) ? query.prov : provs[0] || '', frm = query.frm || today(), to = query.to || '';
  const rows = pubRows(prov, frm, to), miss = provinceMissing(prov), p = provinceByShort(prov), reps = repMap();
  const by = {};
  for (const v of rows) if (reps[v.rep_id]) (by[v.rep_id] ||= []).push(v);
  const repRows = Object.entries(by).map(([rid, vs]) => { const r = reps[rid], [email] = repContact(r), done = vs.every(repNotified);
    return [`<b>${esc(r.surname)} ${esc(r.name)}</b>`, vs.length, esc(email || 'χωρίς email'), `${done ? '<span class="vok">✓ ενημερώθηκε</span> ' : ''}<a class="btn small${done ? '' : ' primary'}" href="#/visits/brief?ids=${vs.map((v) => v.id).join(',')}">✉ Email εκπροσώπου</a>`]; });
  const qs = new URLSearchParams({ prov, frm, to, missing: query.missing || '' }).toString();
  return {
    title: 'Ενημέρωση Επαρχίας',
    html: `<h1>Ενημέρωση Επαρχίας</h1>${notice(query.msg)}<form class="card filters vfilters f4" id="flt"><select name="prov">${provs.map((x) => `<option${x === prov ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select>
<input type="date" name="frm" value="${esc(frm)}"><input type="date" name="to" value="${esc(to)}"><label><input type="checkbox" name="missing"${query.missing ? ' checked' : ''}> Και Στοές χωρίς ημερομηνία</label><button>Προβολή</button></form>
<div class="card"><p style="margin-top:0">${p && p.email ? `Προς: ${esc(provTitle(p) || 'Γραμματεία')} — <b>${esc(p.email)}</b>` : 'Η Επαρχία δεν έχει email Γραμματείας (Μητρώα → Επαρχιακές Μεγάλες Στοές).'}</p>
<p>${rows.length} ${rows.length === 1 ? 'Εγκατάσταση' : 'Εγκαταστάσεις'} · ${miss.length} Στοές χωρίς ημερομηνία</p>
${table(['Ημερομηνία', 'Στοά', 'Τόπος', 'Εκπρόσωπος ΜΔ'], rows.map((v) => [esc(dayStr(v.visit_date)), `${esc(v.lodge)} ${v.lodge_number ? 'Αρ. ' + esc(v.lodge_number) : ''}`, esc(v.location || '—'),
  (reps[v.rep_id] ? esc(repFull(reps[v.rep_id])) : '<span class="vwarn">Δεν έχει οριστεί</span>') + (repNotified(v) ? ' <span class="vok">✓ ενημ.</span>' : '') + (provNotified(v) ? ' <span class="vok">✓ Επαρχία</span>' : '')]), 'Δεν υπάρχουν Εγκαταστάσεις σε αυτό το διάστημα.')}
<div class="toolbar"><a class="btn primary" href="#/visits/publish/compose?${qs}">Email προς Επαρχιακό Γραμματέα</a></div></div>
<div class="card"><h3 style="margin-top:0">Ενημέρωση εκπροσώπων</h3><p class="muted">Ένα email ανά εκπρόσωπο με όλες τις Εγκαταστάσεις του στο διάστημα και πρόσκληση ημερολογίου.</p>
${repRows.length ? table(['Εκπρόσωπος', 'Εγκαταστάσεις', 'Email', 'Ενέργειες'], repRows) : '<p>Δεν έχουν οριστεί εκπρόσωποι σε αυτό το διάστημα.</p>'}</div>`,
    mount(el) { onSubmit(el.querySelector('#flt'), (d) => go('/visits/publish', { ...d, missing: d.missing ? '1' : '' })); },
  };
}
function publishCompose({ query }) {
  const rows = pubRows(query.prov, query.frm, query.to), miss = query.missing ? provinceMissing(query.prov) : [], p = provinceByShort(query.prov);
  if (!rows.length && !miss.length) return '<h1>Δεν υπάρχουν Εγκαταστάσεις για αποστολή σε αυτό το διάστημα.</h1><p><a href="#/visits/publish">← Επιστροφή</a></p>';
  return composePage('Ενημέρωση Επαρχίας', { to: (p || {}).email || '', subject: PUB_SUBJECT, body: provinceMail(p, rows, miss) }, {
    hint: p && p.email ? '' : 'Η Επαρχία δεν έχει email Γραμματείας — συμπληρώστε το εδώ.', back: '#/visits/publish',
    onSent: async () => { await markVisits(rows.map((v) => v.id), 'prov'); flash('Σημειώθηκε η ενημέρωση της Επαρχίας.'); go('/visits', { prov: query.prov }); },
  });
}

function reportPage({ query }) {
  const frm = query.frm || today(), to = query.to || '', prov = query.prov || '', reps = repMap();
  const rows = visitsAll().filter((v) => (!frm || v.visit_date >= frm) && (!to || v.visit_date <= to) && (!prov || v.province === prov));
  const groups = {};
  for (const v of rows) (groups[v.visit_date.slice(0, 7)] ||= []).push(v);
  const tbl = `<table><thead><tr><th>Ημερομηνία</th><th>Στοά</th><th>Τόπος · Επαρχία</th><th>Εκπρόσωπος</th></tr></thead><tbody>${Object.entries(groups).map(([k, items]) => `<tr><td colspan="4" style="background:#e7ecf8;color:#1f3f8f;font-weight:bold">${esc(grUpper(monthTitle(k)))} · ${items.length}</td></tr>` + items.map((v) => {
    const r = reps[v.rep_id];
    return `<tr><td>${esc(dayStr(v.visit_date))}</td><td><b>${esc(v.lodge)}</b>${v.lodge_number ? ' Αρ. ' + esc(v.lodge_number) : ''}${v.notes ? `<br><small class="muted">${esc(v.notes)}</small>` : ''}</td><td>${esc(v.location || '—')}<br><small class="muted">${esc(v.province || '')}</small></td>
<td>${r ? esc(repLabel(r)) + (firstOffice(r) ? `<br><small class="muted">${esc(firstOffice(r))}</small>` : '') : '<span class="vwarn">Δεν έχει οριστεί</span>'}</td></tr>`; }).join('')).join('') || '<tr><td colspan="4">Καμία επίσκεψη στο διάστημα αυτό.</td></tr>'}</tbody></table>`;
  const rng = (frm ? 'Από ' + fmtDate(frm) : 'Όλες οι ημερομηνίες') + (to ? ' έως ' + fmtDate(to) : '') + ' · ' + (prov || 'Όλες οι Επαρχίες') + ` · ${rows.length} επισκέψεις`;
  return {
    title: 'Αναφορά επισκέψεων',
    html: `<div class="noprint"><h1>Αναφορά επισκέψεων</h1><form class="card filters vfilters f3" id="flt"><input type="date" name="frm" value="${esc(frm)}"><input type="date" name="to" value="${esc(to)}">
<select name="prov"><option value="">Όλες οι Επαρχίες</option>${provincialChoices().map((p) => `<option${p === prov ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select><button>Προβολή</button></form>
<div class="toolbar"><button class="btn primary" data-act="print">⬇ PDF / Εκτύπωση (A4)</button><a class="btn" href="#/visits">Επισκέψεις</a></div></div>
<div class="print-area">${reportPaper('Πρόγραμμα Επισκέψεων στις Στοές', rng, tbl)}</div>`,
    mount(el) { onSubmit(el.querySelector('#flt'), (d) => go('/visits/report', d)); bind(el, { print: () => printPaper(`programma-episkepseon-${frm}${to ? '_' + to : ''}`) }); },
  };
}

// Πίνακας από Excel (ΝΟ, ΣΤΟΑ, Ημερ.Εγκ, Ώρα, Νέος ΣΔ, Τόπος …): μία Εγκατάσταση ανά γραμμή· γραμμές χωρίς ημερομηνία παραλείπονται.
export function parseVisitTable(text) {
  const rows = parsePasted(text);
  const K = (x) => fold(String(x || '')).replace(/[^\p{L}\p{N}]/gu, '');
  const h = (rows[0] || []).map(K), col = (...ks) => h.findIndex((x) => ks.some((k) => x.startsWith(K(k))));
  const ci = { no: col('ΝΟ', 'Αριθμός', 'Αρ', 'No', 'Number'), lodge: col('ΣΤΟΑ', 'Στοά', 'Όνομα'), date: col('Ημερ', 'Ημερομηνία', 'Date'), time: col('Ώρα', 'Ωρα', 'Time'),
    master: col('Νέος', 'ΝέοςΣΔ', 'Νέος Σεβάσμιος'), place: col('Τόπος', 'Χώρος', 'Location') };
  if (ci.date < 0 || (ci.no < 0 && ci.lodge < 0)) return null;
  const out = [], skipped = [];
  for (const r of rows.slice(1)) {
    const v = (k) => (ci[k] >= 0 ? String(r[ci[k]] ?? '').trim() : '');
    const m = /(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})/.exec(v('date'));
    if (!m) { if (v('no') || v('lodge')) skipped.push(`${v('no')} ${v('lodge')}`.trim()); continue; }
    const y = +m[3] < 100 ? 2000 + +m[3] : +m[3], d = new Date(y, +m[2] - 1, +m[1]);
    if (d.getMonth() !== +m[2] - 1) { skipped.push(`${v('no')} ${v('lodge')}: ${v('date')}`); continue; }
    const reg = (v('no') && lodgeByNumber(v('no'))) || null;
    const notes = [v('time') && `Ώρα ${v('time')}`, v('master') && `Νέος Σεβάσμιος: ${v('master')}`].filter(Boolean).join(' · ');
    out.push({ visit_date: isoDate(d), lodge: reg ? reg.name : cleanLodgeName(v('lodge')), lodge_number: reg ? String(reg.number) : lodgeNoKey(v('no')), location: v('place') || (reg || {}).meeting_place || '',
      province: (reg || {}).provincial || '', rep_id: null, notes });
  }
  return { out, skipped };
}

function importPage() {
  return {
    title: 'Επικόλληση επισκέψεων',
    html: `<h1>Επικόλληση λίστας επισκέψεων</h1><form class="card" id="imf"><p>Μία επίσκεψη ανά γραμμή, π.χ. «Σάββατο 17/10/2026 Σ.Σ. Διώνη Υπ' Αρ 32 Τεκτονικόν Μέγαρον Ιωαννίνων».
Τα «Σ.Σ.» και «Υπ' Αρ» αφαιρούνται αυτόματα· με τον αριθμό συμπληρώνονται από τις Συμβολικές Στοές το όνομα, η Επαρχία και ο τόπος.</p>
<p>Ή επικολλήστε <b>πίνακα από Excel</b> μαζί με τη γραμμή επικεφαλίδων, π.χ. <b>ΝΟ, ΣΤΟΑ, Ημερ.Εγκ, Ώρα, Νέος ΣΔ</b>. Στοές χωρίς ημερομηνία παραλείπονται· Εγκαταστάσεις που υπάρχουν ήδη (ίδια Στοά, ίδια ημερομηνία) δεν διπλασιάζονται.</p><textarea name="text" required></textarea>
<div class="toolbar"><button class="btn primary">Εισαγωγή</button><a class="btn" href="#/visits">Άκυρο</a></div></form>`,
    mount(el) {
      onSubmit(el.querySelector('#imf'), async (d, _, form) => {
        const tbl = d.text.includes('\t') ? parseVisitTable(d.text) : null;
        if (tbl) {
          const have = new Set(db.all('visits').map((v) => `${lodgeNoKey(v.lodge_number)}|${v.visit_date}`));
          const add = tbl.out.filter((v) => !have.has(`${lodgeNoKey(v.lodge_number)}|${v.visit_date}`));
          if (add.length) await db.save(`Εγκαταστάσεις: επικόλληση ${add.length}`, (tx) => add.forEach((v) => tx.insert('visits', v)));
          flash(`Προστέθηκαν ${add.length} Εγκαταστάσεις${tbl.out.length - add.length ? `, ${tbl.out.length - add.length} υπήρχαν ήδη` : ''}${tbl.skipped.length ? `· ${tbl.skipped.length} Στοές χωρίς ημερομηνία παραλείφθηκαν` : ''}.`);
          go('/visits'); return;
        }
        const ok = [], bad = [];
        for (const line of d.text.split('\n').map((x) => x.trim()).filter(Boolean)) { const v = parseVisitLine(line); if (v) ok.push(v); else bad.push(line); }
        if (ok.length) await db.save(`Επισκέψεις: επικόλληση ${ok.length}`, (tx) => ok.forEach((v) => tx.insert('visits', v)));
        if (bad.length) { form.text.value = bad.join('\n'); toast(`Προστέθηκαν ${ok.length}. Δεν αναγνωρίστηκαν ${bad.length} γραμμές — διορθώστε και ξαναπατήστε «Εισαγωγή».`, 'error'); return; }
        flash(`Προστέθηκαν ${ok.length} επισκέψεις.`); go('/visits');
      });
    },
  };
}

// ---------------------------------------------------------------- Εκπρόσωποι
function ranksPage() {
  const rm = rankmap(), offices = [...new Set([...db.all('reps').flatMap(baseOffices), ...Object.keys(REP_DEFAULT_RANKS)])].sort((a, b) => fold(a).localeCompare(fold(b)));
  return {
    title: 'Βαθμοί ανά αξίωμα',
    html: `<h1>Βαθμοί ανά αξίωμα</h1><div class="card">Ο βαθμός κάθε εκπροσώπου προκύπτει από το αξίωμά του· με περισσότερα αξιώματα ισχύει ο υψηλότερος. Βαθμός που ορίζεται χειροκίνητα στον εκπρόσωπο υπερισχύει.</div>
<form id="rf">${table(['Αξίωμα', 'Βαθμός'], offices.map((o) => [esc(o), `<select name="${esc(o)}">${REP_RANKS.map((x, i) => `<option value="${i}"${(rm[o] ?? REP_DEFAULT_RANKS[o] ?? 0) === i ? ' selected' : ''}>${x}</option>`).join('')}</select>`]))}
<div class="toolbar"><button class="btn primary">💾 Αποθήκευση</button><a class="btn" href="#/reps">Άκυρο</a></div></form>`,
    mount(el) {
      onSubmit(el.querySelector('#rf'), async (d) => {
        const out = Object.fromEntries(Object.entries(d).map(([k, v]) => [k, Number(v)]).filter(([k, v]) => (REP_DEFAULT_RANKS[k] ?? 0) !== v));
        await db.save('Εκπρόσωποι: βαθμοί ανά αξίωμα', (tx) => tx.setting('visits_rankmap', JSON.stringify(out)));
        flash('Οι βαθμοί αποθηκεύτηκαν.'); go('/reps');
      });
    },
  };
}
async function repsFromEpeteirida() {
  let added = 0;
  await db.save('Εκπρόσωποι: συμπλήρωση από Επετηρίδα', (tx) => {
    added = 0;
    const reps = tx.all('reps'), haveM = new Set(reps.map((r) => r.member_id).filter(Boolean)), haveN = new Set(reps.map((r) => fold(r.surname) + '|' + fold(r.name)));
    const latest = {};
    for (const e of tx.all('member_degrees_offices')) {
      if (!e.office || !['appoint', 'historical', '', null, undefined].includes(e.record_type)) continue;
      const k = [e.is_current ? 1 : 0, Number(e.decree_year) || 0], cur = latest[e.member_id];
      if (!cur || k[0] > cur.k[0] || (k[0] === cur.k[0] && k[1] > cur.k[1])) latest[e.member_id] = { k, e };
    }
    for (const [mid, { e }] of Object.entries(latest)) {
      const m = tx.get('member_registry', mid);
      if (!m || !m.surname || haveM.has(Number(mid)) || haveN.has(fold(m.surname) + '|' + fold(m.first_name))) continue;
      tx.insert('reps', { name: m.first_name || '', surname: m.surname, rep_rank: '', office: (e.is_current || /^Πρώην /.test(e.office) ? '' : 'Πρώην ') + e.office, year: String(e.decree_year || ''), email: '', mobile: '', member_id: Number(mid), notes: 'Από την Επετηρίδα', ext_id: '' });
      added++;
    }
  });
  return added;
}

// ---------------------------------------------------------------- εισαγωγή «Επιστολές Γραμματείας» (nglg-lodge-visits/1)
export function importVisitsPayload(tx, data) {
  if (!data || data.format !== 'nglg-lodge-visits/1') throw new Error('Μη αναγνωρίσιμο αρχείο: αναμένεται εξαγωγή «nglg-lodge-visits/1».');
  const n = { prov_new: 0, prov_upd: 0, lodge_new: 0, lodge_upd: 0, rep_new: 0, rep_upd: 0, visit_new: 0, visit_skip: 0, greet_new: 0, greet_skip: 0 };
  const s = (x) => String(x ?? '').trim(), em = (x) => (EMAIL_RE.test(s(x)) ? s(x) : '');
  const fillEmpty = (table, row, vals) => { const ch = Object.fromEntries(Object.entries(vals).filter(([k, v]) => v && !String(row[k] || '').trim())); if (Object.keys(ch).length) { tx.update(table, row.id, ch); return 1; } return 0; };
  const memberFor = (email, mobile) => {
    if (email) { const r = tx.find('member_registry', (m) => String(m.email || '').toLowerCase() === email.toLowerCase()); if (r) return r.id; }
    const d = String(mobile || '').replace(/\D/g, '');
    if (d.length >= 10) { const r = tx.find('member_registry', (m) => String(m.mobile || '').replace(/\D/g, '').endsWith(d.slice(-10))); if (r) return r.id; }
    return null;
  };
  for (const p of data.provinces || []) {
    const short = s(p.short); if (!short) continue;
    const ex = tx.find('grand_lodges', (x) => x.short === short);
    if (ex) n.prov_upd += fillEmpty('grand_lodges', ex, { full_title: s(p.full), email: em(p.email), master_name: s(p.gmName), master_email: em(p.gmEmail), secretary_name: s(p.secretaryName), secretary_email: em(p.secretaryEmail), notes: s(p.notes) });
    else { tx.insert('grand_lodges', { short, full_title: s(p.full), kind: short.startsWith('ΕΜΣτΕ') ? 'Εθνική' : short.startsWith('ΠΜΣτ') ? 'Περιφερειακή' : 'Επαρχιακή', email: em(p.email), addressee: `${s(p.title)} ${s(p.full)}`.trim(),
      master_name: s(p.gmName), master_email: em(p.gmEmail), secretary_name: s(p.secretaryName), secretary_email: em(p.secretaryEmail), sort_order: (Number(p.order) || 99) * 10, active: 1, notes: s(p.notes) }); n.prov_new++; }
  }
  for (const l of data.lodges || []) {
    const no = lodgeNoKey(s(l.number)), name = cleanLodgeName(s(l.name)); if (!no || !name) continue;
    const ex = tx.find('lodges', (x) => lodgeNoKey(x.number) === no), vals = { provincial: s(l.province), ritual: s(l.ritual), meeting_place: s(l.location) };
    if (ex) { n.lodge_upd += fillEmpty('lodges', ex, vals); if (l.inactive && ex.status === 'Ενεργή') tx.update('lodges', ex.id, { status: 'Ανενεργή' }); }
    else { tx.insert('lodges', { number: no, name, ...vals, orient: '', email: '', master: '', secretary: '', secretary_email: '', notes: '', status: l.inactive ? 'Ανενεργή' : 'Ενεργή', source: 'Επιστολές Γραμματείας' }); n.lodge_new++; }
  }
  const repIds = {};
  for (const r of data.reps || []) {
    const ext = s(r.ext_id), name = s(r.name), sur = s(r.surname); if (!name || !sur) continue;
    const email = em(r.email), mobile = s(r.mobile);
    const ex = (ext && tx.find('reps', (x) => x.ext_id === ext)) || tx.find('reps', (x) => !x.ext_id && fold(x.surname) === fold(sur) && fold(x.name) === fold(name));
    const vals = { rep_rank: REP_RANKS.includes(s(r.rank)) ? s(r.rank) : '', office: s(r.office), year: s(r.year), email, mobile };
    if (ex) {
      n.rep_upd += fillEmpty('reps', ex, { ...vals, ext_id: ext });
      if (!ex.member_id) { const mid = memberFor(email, mobile); if (mid) tx.update('reps', ex.id, { member_id: mid }); }
      repIds[ext] = ex.id;
    } else { repIds[ext] = tx.insert('reps', { name, surname: sur, ...vals, member_id: memberFor(email, mobile), notes: '', ext_id: ext }).id; n.rep_new++; }
  }
  const byReg = Object.fromEntries(tx.all('member_registry').filter((m) => m.registry_no != null).map((m) => [String(m.registry_no), m.id]));
  for (const x of data.lodgeMasters || []) {
    const ex = tx.find('lodges', (l) => lodgeNoKey(l.number) === lodgeNoKey(s(x.number))), nm = [s(x.name), s(x.surname)].filter(Boolean).join(' ');
    if (ex && nm && !String(ex.master || '').trim()) { tx.update('lodges', ex.id, { master: nm }); n.lodge_upd++; }
  }
  for (const [ext, reg] of Object.entries(data.repMembers || {})) {
    const mid = byReg[String(reg)], r = mid && tx.find('reps', (x) => x.ext_id === s(ext) && !x.member_id);
    if (r) { tx.update('reps', r.id, { member_id: mid }); n.rep_upd++; }
  }
  for (const g of data.greetings || []) {
    const mid = byReg[String(g.registryNo)], fd = s(g.date);
    if (!mid || !parseIso(fd) || tx.find('greetings_log', (x) => x.member_id === mid && x.feast_date === fd)) { n.greet_skip++; continue; }
    tx.insert('greetings_log', { member_id: mid, registry_no: Number(g.registryNo), feast_date: fd, feast: s(g.feast), name: s(g.name), email: s(g.email), subject: s(g.subject), bcc: (g.bcc || []).join(', '), sent_on: s(g.sentOn) || fd, sent_at: s(g.at), source: 'Επιστολές Γραμματείας' });
    n.greet_new++;
  }
  for (const [k, v] of Object.entries(data.settings || {})) if (k === 'greet_bcc_self' && splitEmails(v).every((e) => EMAIL_RE.test(e)) && !String(tx.setting(k) || '').trim()) tx.setting(k, s(v));
  for (const v of data.visits || []) {
    const ext = s(v.ext_id), d = s(v.date);
    if (!parseIso(d) || !s(v.lodge)) continue;
    if (ext && tx.find('visits', (x) => x.ext_id === ext)) { n.visit_skip++; continue; }
    let rid = repIds[s(v.repId)] || null;
    if (!rid && s(v.repId)) rid = (tx.find('reps', (x) => x.ext_id === s(v.repId)) || {}).id || null;
    const rn = v.repNotified || {}, pn = v.provNotified || {};
    tx.insert('visits', { visit_date: d, lodge: s(v.lodge), lodge_number: s(v.number), location: s(v.location), province: s(v.province), rep_id: rid, notes: s(v.notes),
      rep_notified_at: s(rn.at), rep_notified_date: s(rn.date), rep_notified_rep: rn.at && s(rn.repId) === s(v.repId) ? rid : null,
      prov_notified_at: s(pn.at), prov_notified_date: s(pn.date), prov_notified_rep: pn.at && s(pn.repId) === s(v.repId) ? rid : null, ext_id: ext });
    n.visit_new++;
  }
  return n;
}
export const importVisitsMessage = (n) => `Εισαγωγή ολοκληρώθηκε — Επισκέψεις: ${n.visit_new} νέες (${n.visit_skip} υπήρχαν ήδη) · Εκπρόσωποι: ${n.rep_new} νέοι, ${n.rep_upd} συμπληρώθηκαν · Στοές: ${n.lodge_new} νέες, ${n.lodge_upd} συμπληρώθηκαν · Επαρχίες: ${n.prov_new} νέες, ${n.prov_upd} συμπληρώθηκαν${n.greet_new ? ` · Ευχές (ιστορικό): ${n.greet_new} νέες` : ''}.`;

const repFields = [
  { k: 'member_pick', label: '🔎 Από το Μητρώο Μελών', placeholder: 'επώνυμο, όνομα…', full: true },
  { k: 'name', label: 'Όνομα', required: true }, { k: 'surname', label: 'Επώνυμο', required: true },
  { k: 'office', label: 'Αξίωμα', full: true, placeholder: 'π.χ. Μέγας Καγκελάριος ή Πρώην Μέγας Ευχέτης· πολλά με « · »' },
  { k: 'year', label: 'Έτος' }, { k: 'rep_rank', label: 'Βαθμός', type: 'select', empty: 'Αυτόματα από το αξίωμα', options: REP_RANKS },
  { k: 'email', label: 'Email', type: 'email' }, { k: 'mobile', label: 'Κινητό' },
  { k: 'member_id', label: 'Αρ. μέλους στο Μητρώο (προαιρετικό)', type: 'number', help: 'Αν λείπει email/κινητό, χρησιμοποιούνται του μέλους.' },
  { k: 'notes', label: 'Σημειώσεις', full: true },
];
const repRoutes = crud({
  table: 'reps', base: '/reps', title: 'Εκπρόσωποι ΜΔ', one: 'Εκπρόσωπος', fields: repFields, name: (r) => `${r.surname} ${r.name}`,
  sort: (xs) => sortBy(xs, (r) => fold(r.surname), (r) => fold(r.name)),
  search: ['surname', 'name', 'office', 'year', 'email', 'mobile'],
  filterHtml: (q) => `<select name="f"><option value="">Όλοι</option><option value="cur"${q.f === 'cur' ? ' selected' : ''}>Εν ενεργεία</option><option value="past"${q.f === 'past' ? ' selected' : ''}>Πρώην</option></select>`,
  filter: (xs, q) => (q.f ? xs.filter((r) => (q.f === 'past') === isPast(r)) : xs),
  tools: () => '<a class="btn" href="#/reps/import">Επικόλληση πίνακα</a><a class="btn" href="#/reps/ranks">Βαθμοί ανά αξίωμα</a><button class="btn" data-act="fromEp">Συμπλήρωση από Επετηρίδα</button><a class="btn" href="#/visits">Επισκέψεις</a>',
  columns: [
    { label: 'Επώνυμο', v: (r) => `<b>${esc(r.surname)}</b><div class="muted">${esc(repRank(r))}</div>` },
    { label: 'Όνομα', v: (r) => `${esc(r.name)}<div class="muted">${esc(repContact(r).filter(Boolean).join(' · '))}</div>` },
    { label: 'Αξίωμα', v: (r) => esc(r.office) }, { label: 'Έτος', v: (r) => esc(r.year) },
    { label: 'Προσεχείς', v: (r) => db.all('visits').filter((v) => v.rep_id === r.id && v.visit_date >= today()).length },
  ],
  validate(d) { delete d.member_pick; if (!REP_RANKS.includes(d.rep_rank)) d.rep_rank = ''; d.member_id = Number(d.member_id) || null; return d; },
  afterDelete(tx, r) { for (const v of tx.all('visits')) if (v.rep_id === r.id) tx.update('visits', v.id, { rep_id: null }); },
  mountForm(el) {
    attachPicker(el.querySelector('[name=member_pick]'), memberItems, (m) => {
      const f = (k, v) => { const i = el.querySelector(`[name=${k}]`); if (v) i.value = v; };
      f('name', m.first_name); f('surname', m.surname); f('email', m.email); f('mobile', m.mobile); f('member_id', m.id);
    });
  },
});
const repsList = repRoutes['/reps'];
repRoutes['/reps'] = (ctx) => {
  const out = repsList(ctx), mount = out.mount;
  return { ...out, mount(el) { mount(el); bind(el, { async fromEp() { if (!confirmDo('Προσθήκη όσων Μεγάλων Αξιωματικών της Επετηρίδας λείπουν;')) return; const n = await repsFromEpeteirida(); flash(`Προστέθηκαν ${n} εκπρόσωποι από την Επετηρίδα.`); go('/reps'); } }); } };
};

module({
  id: 'visits',
  routes: {
    '/visits': visitsPage, '/visits/new': () => visitForm(null),
    '/visits/edit/:id': ({ params }) => { const v = db.get('visits', params.id); return v ? visitForm(v) : '<h1>Δεν βρέθηκε η επίσκεψη</h1>'; },
    '/visits/import': importPage, '/visits/brief': briefPage, '/visits/publish': publishPage, '/visits/publish/compose': publishCompose, '/visits/report': reportPage,
    ...repRoutes, '/reps/ranks': ranksPage,
    '/reps/import': () => ({
      title: 'Επικόλληση εκπροσώπων',
      html: `<h1>Επικόλληση πίνακα εκπροσώπων</h1><form class="card" id="rif"><p>Μία γραμμή ανά πρόσωπο, στήλες: Όνομα · Επώνυμο · Βαθμός · Αξίωμα · Email (προαιρετικό). Αντιγράψτε απευθείας από Excel/Word ή χωρίστε με « ; ».</p>
<textarea name="text" required></textarea><div class="toolbar"><button class="btn primary">Εισαγωγή</button><a class="btn" href="#/reps">Άκυρο</a></div></form>`,
      mount(el) {
        onSubmit(el.querySelector('#rif'), async (d, _, form) => {
          const ok = [], bad = [];
          for (const line of d.text.split('\n').map((x) => x.trim()).filter(Boolean)) {
            const p = line.split(/\t|;|\|/).map((x) => x.trim());
            if (p.length < 2 || !p[0] || !p[1] || (p[4] && !EMAIL_RE.test(p[4]))) { bad.push(line); continue; }
            ok.push({ name: p[0], surname: p[1], rep_rank: REP_RANKS.includes(p[2]) ? p[2] : '', office: p[3] || '', email: p[4] || '', year: '', mobile: '', member_id: null, notes: '', ext_id: '' });
          }
          if (ok.length) await db.save(`Εκπρόσωποι: επικόλληση ${ok.length}`, (tx) => ok.forEach((r) => tx.insert('reps', r)));
          if (bad.length) { form.text.value = bad.join('\n'); toast(`Προστέθηκαν ${ok.length}. Δεν αναγνωρίστηκαν ${bad.length} γραμμές.`, 'error'); return; }
          flash(`Προστέθηκαν ${ok.length} εκπρόσωποι.`); go('/reps');
        });
      },
    }),
  },
  tile: { order: 30, render: () => {
    const t = today(), up = db.all('visits').filter((v) => v.visit_date >= t), reps = repMap();
    const unas = up.filter((v) => !reps[v.rep_id]).length, tob = up.filter((v) => reps[v.rep_id] && !repNotified(v)).length;
    return `<div class="dtile"><h3><a href="#/visits">Επισκέψεις Στοών</a></h3><div class="big">${up.length} προσεχείς</div>${unas ? `<div class="warn">${unas} χωρίς εκπρόσωπο</div>` : ''}${tob ? `<div class="warn">${tob} εκπρόσωποι προς ενημέρωση</div>` : ''}
<div class="acts"><a class="btn primary" href="#/visits">Επισκέψεις</a><a class="btn" href="#/visits/new">+ Νέα</a><a class="btn" href="#/visits/publish">Ενημέρωση Επαρχίας</a></div></div>`;
  } },
});
