// Μητρώο Μελών — αναζήτηση ανά πεδίο, νέο/επεξεργασία/διαγραφή, εισαγωγή (Excel πηγής ή εξαγωγής), εξαγωγή Excel.
// Πίνακες: member_registry, member_lodges (Στοές κάθε μέλους), member_degrees_offices (Επετηρίδα).
// Κάθε αλλαγή μένει στο ιστορικό του GitHub, άρα και μια διαγραφή μπορεί να ανακτηθεί.
import { db } from '../core/store.js';
import { module, onSubmit, go, flash, bind, confirmDo, table, notice, pager, toast } from '../core/app.js';
import { esc, fold, sortBy, readXlsx, XLSX, parsePasted, fmtDate, today } from '../core/util.js';
import { memberVisits } from './visits.js';
import { lodgeNoKey, lodgesAll, lodgeByNumber } from './lodges.js';
import { provincialChoices } from './provinces.js';
import { noContact, NO_CONTACT } from '../core/pickers.js';
import { epeteiridaOf, highestOfficeText } from './epeteirida-table.js';
import { reportPaper, printPaper } from '../core/paper.js';
import { lodgeFeeTotal, euro } from './treasury.js';
import { identify, canonicalId, person, digits10, sameNameGroups, regCode, matchesCode, codeKey } from '../core/people.js';
import { isSealed } from '../core/connect.js';
import { smallLodgesPage } from './small-lodges.js';
import { diplomasPage } from './diplomas.js';
import { memberCardPage } from './member-card.js';
import { diplomaIssuePage } from './diploma.js';
import { sgyRegistryPage } from './sgy.js';

// Αρ. Μητρώου: μοναδικός και μόνιμος αριθμός κάθε προσώπου που είναι ή υπήρξε μέλος της ΕΜΣτΕ (και διαγραμμένου).
// Ξεκινά από το 1200, δίνεται αυτόματα στο νέο μέλος (επόμενος ελεύθερος) και δεν αλλάζει ποτέ· μόνο ο διαχειριστής
// (σύνδεση με δικό του κλειδί GitHub, όχι με πρόσκληση email/κωδικού) μπορεί να τον διορθώσει.
export const REG_START = 1200;
// Αρ. Μητρώου ως ετικέτα: MM (Δίπλωμα Διδασκάλου Τέκτονος) ή M (μέλος χωρίς δίπλωμα)
export const regBadge = (m) => { const c = regCode(m); return !c ? '<span class="muted">—</span>' : `<span class="regno ${String(m.diploma_no ?? '').trim() ? 'mm' : 'm'}" title="${String(m.diploma_no ?? '').trim() ? 'Δίπλωμα Διδασκάλου Τέκτονος (Certificate Master Mason)' : 'Μέλος χωρίς Δίπλωμα Διδασκάλου'}">${esc(c)}</span>`; };
export const isAdmin = () => !isSealed();
export const nextRegistryNo = (tx, floor = 0) => Math.max(REG_START - 1, floor, ...tx.all('member_registry').map((m) => Number(m.registry_no) || 0)) + 1;
const nameOrder = (a, b) => String(a.surname || '').localeCompare(String(b.surname || ''), 'el', { sensitivity: 'base' })
  || String(a.first_name || '').localeCompare(String(b.first_name || ''), 'el', { sensitivity: 'base' }) || a.id - b.id;
// Εφάπαξ: νέα αρίθμηση όλων με αλφαβητική σειρά από το 1200· ο παλιός αριθμός (Member_ID πηγής) κρατιέται ως source_member_id
db.migrate('registry-renumber-1200-2026-10', (tx) => {
  [...tx.all('member_registry')].sort(nameOrder).forEach((m, i) => tx.update('member_registry', m.id, { registry_no: REG_START + i, ...(m.source_member_id == null && m.registry_no != null ? { source_member_id: m.registry_no } : {}) }));
});

const PAGE = 100;
const MEMBER_FIELDS = [['surname', 'Επώνυμο'], ['first_name', 'Όνομα'], ['mobile', 'Κινητό'], ['email', 'Email'], ['lodge', 'Στοά'], ['all', 'Όλα']];
const HINTS = { surname: ['Γράψτε το επώνυμο', 'π.χ. Παπαδόπουλος', 'search'], first_name: ['Γράψτε το όνομα', 'π.χ. Γεώργιος', 'search'], mobile: ['Γράψτε το κινητό', 'π.χ. 6944 123 456', 'tel'],
  email: ['Γράψτε το email', 'π.χ. onoma@gmail.com', 'email'], lodge: ['Γράψτε ή διαλέξτε τη Στοά', 'π.χ. 3 ή ΠΑΡΘΕΝΩΝ', 'search'], all: ['Γράψτε οποιοδήποτε στοιχείο', 'Επώνυμο, όνομα, κινητό, email ή αρ. μητρώου', 'search'] };

const phoneDigits = (q) => { let d = String(q || '').replace(/\D/g, ''); if (d.startsWith('0030')) d = d.slice(4); else if (d.startsWith('30') && d.length > 10) d = d.slice(2); return d; };
const digits = (v) => String(v || '').replace(/\D/g, '');

// Ιδιότητα του μέλους σε κάθε Στοά, κατά το Σύνταγμα ΕΜΣτΕ (2025): [ιδιότητα, κανόνας, περιγραφή]
export const MEMBER_CAPACITIES = [
  ['Τακτικό', 'Κ. 166', 'Ο μυούμενος καθίσταται τακτικό μέλος της Στοάς αμέσως με τη μύησή του.'],
  ['Υιοθετημένο', 'Κ. 163', 'Ήδη Τέκτων από άλλη Στοά που γίνεται μέλος της Στοάς με υιοθεσία· μετά αποτελεί κανονικό μέλος της.'],
  ['Επανελθόν', 'Κ. 163', 'Πρώην μέλος που επανέρχεται στη Στοά (τρόπος επανόδου στην ιδιότητα του μέλους).'],
  ['Ομότιμο', 'Κ. 146', 'Ενεργό μέλος της Στοάς που αναγορεύεται Ομότιμο· χωρίς ετήσια συνδρομή, με πλήρη δικαιώματα (αξίωμα, προτάσεις, ψήφος).'],
  ['Επίτιμο', 'Κ. 146', 'Ενεργό μέλος άλλης κανονικής Στοάς· συμμετέχει στις Συνεδρίες χωρίς προτάσεις, ψήφο ή αξίωμα. Χωριστό Μητρώο Επιτίμων.'],
  ['Μέτοικο', 'Κ. 146', 'Διαμονή >6 μήνες εκτός Ελλάδος, ή >100 χλμ. από την πλησιέστερη Στοά, ή σε νησί χωρίς Στοά· έγκριση ΣΓΥ, 1/3 της ετήσιας συνδρομής.'],
  ['Αριστίνδην', 'Κ. 146', 'Άνω των 70 ετών με ενεργό, αδιάκοπη και συνεχή παρουσία στην ΕΜΣτΕ από την ίδρυσή της· έγκριση ΣΓΥ, απαλλαγή από συνδρομές.'],
  ['Ισόβιο', '', 'Υφιστάμενη κατηγορία του Συντάγματος· όσοι έχουν ήδη μεταταγεί απαλλάσσονται της ετήσιας συνδρομής.'],
  ['Θεράπων', '', 'Μυημένος για να υπηρετεί συγκεκριμένη Στοά ή τη Μεγάλη Στοά, με ειδική άδεια· τακτικό μέλος μόνο με υιοθεσία και τέλη.'],
];
export const capacityLabel = (c) => { const x = MEMBER_CAPACITIES.find((y) => y[0] === c); return x ? `${x[0]}${x[1] ? ' — ' + x[1] : ''}` : c || ''; };
// Χωρίς ρητή ιδιότητα: από την παλιά «Κατάσταση» (π.χ. «1. ΤΑΚΤΙΚΟ» → Τακτικό)
const CAP_KEYS = [['ΤΑΚΤΙΚ', 'Τακτικό'], ['ΥΙΟΘΕΤ', 'Υιοθετημένο'], ['ΕΠΑΝΕΛΘ', 'Επανελθόν'], ['ΟΜΟΤΙΜ', 'Ομότιμο'], ['ΕΠΙΤΙΜ', 'Επίτιμο'], ['ΜΕΤΟΙΚ', 'Μέτοικο'], ['ΑΡΙΣΤΙΝΔ', 'Αριστίνδην'], ['ΙΣΟΒΙ', 'Ισόβιο'], ['ΘΕΡΑΠ', 'Θεράπων']];
export const capacityOf = (l) => l.capacity || (CAP_KEYS.find(([k]) => String(l.member_status || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().includes(k)) || [])[1] || '';
// Στοά πλήρους συνδρομής / 2η / 3η κ.ο.κ. Στοά (Κ. 269: στη 2η, 3η κ.ο.κ. 1/10 της συνδρομής, 1/20 αν είναι ξενόγλωσση)
export const FEE_RANKS = [1, 2, 3, 4, 5, 6];
export const feeRankLabel = (n, long = false) => (!Number(n) ? '' : Number(n) === 1 ? 'Στοά πλήρους συνδρομής' + (long ? ' — Κ. 269' : '') : `${n}η Στοά` + (long ? ' (1/10, ή 1/20 αν ξενόγλωσση) — Κ. 269' : ''));
const parseFeeRank = (v) => { v = String(v || '').trim(); if (!v) return ''; if (/ΠΛΗΡ|πλήρ|πληρ/i.test(v)) return 1; const m = /^(\d+)/.exec(v); return m ? Number(m[1]) : ''; };

// Ημερομηνίες του μέλους: βαθμοί (Μαθητής = μύηση, Εταίρος, Διδάσκαλος) και διαγραφή από την ΕΜΣτΕ
export const MEMBER_DATES = [['date_ea', 'Ημ. μύησης — Μαθητής (Α΄ βαθμός)'], ['date_fc', 'Ημ. Εταίρου (Β΄ βαθμός)'], ['date_mm', 'Ημ. Διδασκάλου (Γ΄ βαθμός)'], ['dereg_date', 'Ημ. διαγραφής']];
// Ημερομηνίες σε κάθε Στοά: απόκτηση ιδιότητας, αξιώματα (Β΄ Επόπτης, Α΄ Επόπτης, Σεβάσμιος) και διαγραφή από τη Στοά
export const LODGE_DATES = [['capacity_date', 'Ημ. απόκτησης ιδιότητας'], ['jw_date', 'Ημ. Β΄ Επόπτη'], ['sw_date', 'Ημ. Α΄ Επόπτη'], ['wm_date', 'Ημ. Σεβασμίου'], ['dereg_date', 'Ημ. διαγραφής']];
const CAP_DATE = { Τακτικό: 'Ημ. μύησης στη Στοά', Υιοθετημένο: 'Ημ. υιοθεσίας', Επανελθόν: 'Ημ. επανόδου', Ομότιμο: 'Ημ. αναγόρευσης Ομοτίμου', Επίτιμο: 'Ημ. αναγόρευσης Επιτίμου',
  Μέτοικο: 'Ημ. μετάταξης σε Μέτοικο', Αριστίνδην: 'Ημ. μετάταξης σε Αριστίνδην', Ισόβιο: 'Ημ. μετάταξης σε Ισόβιο', Θεράπων: 'Ημ. μύησης ως Θεράποντος' };
export const capacityDateLabel = (c) => CAP_DATE[c] || 'Ημ. απόκτησης ιδιότητας';
// ημερομηνία από Excel/επικόλληση: 2010-03-15, 15/3/2010, 15.03.2010 → 2010-03-15
// Ημερομηνία σε ΕΕΕΕ-ΜΜ-ΗΗ από κάθε μορφή του Μητρώου: ISO, 12/3/1998, 12.03.98, αριθμός ημέρας του Excel (π.χ. 35866)
export const isoOf = (v) => {
  v = String(v ?? '').trim(); if (!v) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v); if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2}|\d{4})(?:\s.*)?$/.exec(v);
  if (m) { const y = m[3].length === 2 ? (Number(m[3]) <= 30 ? '20' : '19') + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  if (/^\d{4,5}(\.0+)?$/.test(v) && Number(v) > 3000 && Number(v) < 80000) { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(Number(v)) * 864e5); return d.toISOString().slice(0, 10); }
  return v;
};

export const membersAll = () => db.all('member_registry');
export function lodgesByMember() {
  const out = {};
  for (const l of sortBy(db.all('member_lodges'), 'seq', 'id')) (out[l.member_id] ||= []).push(l);
  return out;
}
export const memberLodgesLine = (ls) => (ls || []).filter((l) => l.lodge_name || l.lodge_number).map((l) => `${l.lodge_name} ${l.lodge_number}`.trim() + (l.member_status && !/ΕΝΕΡΓ/i.test(l.member_status) ? ` (${l.member_status})` : '')).join(', ');

export function memberSearch(q, field = 'all') {
  q = String(q || '').trim();
  const ms = membersAll(), byM = lodgesByMember();
  if (!q) return ms;
  if (field === 'surname' || field === 'first_name' || field === 'email') {
    const cols = { surname: ['surname', 'surname_variants'], first_name: ['first_name', 'first_name_variants'], email: ['email', 'other_emails'] }[field];
    return ms.filter((m) => fold(q).split(/\s+/).every((w) => cols.some((c) => fold(m[c]).includes(w))));
  }
  if (field === 'lodge') {
    const mm = /^\s*(\d+|Φ)\s*(·|$)/.exec(q);
    if (mm) { const no = lodgeNoKey(mm[1]); return ms.filter((m) => (byM[m.id] || []).some((l) => lodgeNoKey(l.lodge_number) === no)); }
    return ms.filter((m) => fold(q).split(/\s+/).every((w) => (byM[m.id] || []).some((l) => fold(l.lodge_name).includes(w))));
  }
  if (field === 'mobile') { const d = phoneDigits(q); return d ? ms.filter((m) => digits(m.mobile).includes(d) || digits(m.other_mobiles).includes(d)) : []; }
  if (/^\s*[MΜmμ]{1,2}[\s\-]?\d+\s*$/.test(q)) return ms.filter((m) => matchesCode(m, q)); // MM12345 / M1200
  const d = digits(q);
  if (/^[\d\s+\-().]+$/.test(q) && d.length >= 4) { const p = phoneDigits(q); return ms.filter((m) => digits(m.mobile).includes(p) || digits(m.other_mobiles).includes(p) || matchesCode(m, q)); }
  return ms.filter((m) => q.split(/\s+/).every((w) => {
    const fw = fold(w), wd = /^[\d+\-().]+$/.test(w) && digits(w).length >= 3 ? digits(w) : '';
    return ['surname', 'first_name', 'surname_variants', 'first_name_variants', 'email', 'other_emails', 'degree'].some((c) => fold(m[c]).includes(fw))
      || (wd && (digits(m.mobile).includes(wd) || digits(m.other_mobiles).includes(wd))) || matchesCode(m, w)
      || (byM[m.id] || []).some((l) => fold(l.lodge_name).includes(fw) || fold(l.lodge_number) === fw);
  }));
}

function hl(text, q, ok = true) {
  const t = String(text ?? '');
  if (!q || !ok || !t) return esc(t);
  const n = fold(t);
  if (n.length !== t.length) return esc(t);
  let words = q.split(/\s+/).map(fold).filter(Boolean);
  if (/^[\d\s+\-().]+$/.test(q.trim()) && phoneDigits(q)) words = [phoneDigits(q)];
  const spans = [];
  for (const w of words) for (let i = n.indexOf(w); i !== -1; i = n.indexOf(w, i + 1)) spans.push([i, i + w.length]);
  if (!spans.length) return esc(t);
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of spans) { if (merged.length && a <= merged.at(-1)[1]) merged.at(-1)[1] = Math.max(b, merged.at(-1)[1]); else merged.push([a, b]); }
  let out = '', pos = 0;
  for (const [a, b] of merged) { out += esc(t.slice(pos, a)) + '<mark>' + esc(t.slice(a, b)) + '</mark>'; pos = b; }
  return out + esc(t.slice(pos));
}

// Ταύτιση μέλους (για Διατάγματα/εισαγωγές): email → κινητό → ονοματεπώνυμο
export function findMember(tx, m, freeOnly = false) {
  const ok = (r) => !freeOnly || r.registry_no == null;
  const email = String(m.email || '').trim().toLowerCase(), mobile = String(m.mobile || '').trim();
  const all = sortBy(tx.all('member_registry'), 'id');
  let r = email && all.find((x) => ok(x) && String(x.email || '').toLowerCase() === email);
  if (!r && mobile) r = all.find((x) => ok(x) && x.mobile === mobile);
  const sn = String(m.surname || '').trim().toLowerCase(), fn = String(m.first_name || '').trim().toLowerCase();
  if (!r && sn && fn) r = all.find((x) => ok(x) && String(x.surname || '').toLowerCase() === sn && String(x.first_name || '').toLowerCase() === fn);
  return r ? r.id : null;
}
const MEMBER_COLS = ['registry_no', 'diploma_no', 'mm_lodge_name', 'mm_lodge_number', 'source_member_id', 'surname', 'first_name', 'email', 'other_emails', 'mobile', 'other_mobiles', 'degree', 'declared_lodge_count', 'deregistered_note', 'additional_lodges', 'active', 'surname_variants', 'first_name_variants', 'source_row', 'no_contact', ...MEMBER_DATES.map(([k]) => k)];
export function insertMember(tx, m, id) {
  const row = Object.fromEntries(MEMBER_COLS.map((k) => [k, m[k] ?? (k === 'active' ? 1 : k === 'registry_no' || k === 'source_row' || k === 'source_member_id' ? null : '')]));
  if (row.registry_no == null) row.registry_no = nextRegistryNo(tx); // κάθε νέο μέλος παίρνει αμέσως Αρ. Μητρώου
  row.active = m.active === false || m.active === 0 ? 0 : 1;
  row.no_contact = m.no_contact ? 1 : 0;
  if (row.no_contact) row.active = 0;
  const r = tx.insert('member_registry', id ? { id, ...row } : row);
  setMemberLodges(tx, r.id, m.lodges || []);
  return r.id;
}
// Προσθήκη / Συμπλήρωση: μόνο τα κενά πεδία του μέλους και οι Στοές που λείπουν — δεν σβήνει και δεν αλλάζει τίποτα υπάρχον
export function fillMember(tx, id, m) {
  const cur = tx.get('member_registry', id), row = {};
  for (const k of MEMBER_COLS) if (!['registry_no', 'active', 'no_contact', 'source_row'].includes(k) && m[k] != null && String(m[k]).trim() && !String(cur[k] ?? '').trim()) row[k] = m[k];
  if (Object.keys(row).length) tx.update('member_registry', id, row);
  const old = sortBy(tx.all('member_lodges').filter((l) => l.member_id === id), 'seq'), keys = new Set(old.map((l) => lodgeNoKey(l.lodge_number)));
  const add = (m.lodges || []).filter((l) => { const k = lodgeNoKey(l.number ?? l.lodge_number); return k && !keys.has(k); });
  if (add.length) setMemberLodges(tx, id, [...old, ...add.map((l, i) => ({ ...l, seq: old.length + i + 1 }))]);
}
export function updateMember(tx, id, m) {
  const row = Object.fromEntries(MEMBER_COLS.filter((k) => m[k] !== undefined).map((k) => [k, m[k]]));
  if ('active' in row) row.active = row.active === false || row.active === 0 ? 0 : 1;
  if ('no_contact' in row) { row.no_contact = row.no_contact ? 1 : 0; if (row.no_contact) row.active = 0; }
  if (!m._admin_registry) { delete row.registry_no; delete row.diploma_no; } // Αρ. Μητρώου και Δίπλωμα δεν αλλάζουν από εισαγωγές/ενημερώσεις
  if (row.source_member_id == null) delete row.source_member_id;
  tx.update('member_registry', id, row);
  if (m.lodges) setMemberLodges(tx, id, m.lodges);
}
function setMemberLodges(tx, mid, lodges) {
  // ιδιότητα και σειρά συνδρομής που δεν φέρνει η εισαγωγή (π.χ. Excel πηγής) κρατιούνται από την ίδια Στοά του μέλους
  const prev = Object.fromEntries(tx.all('member_lodges').filter((l) => l.member_id === mid).map((l) => [lodgeNoKey(l.lodge_number), l]));
  tx.remove('member_lodges', (l) => l.member_id === mid);
  lodges.forEach((l, i) => {
    const number = String(l.number ?? l.lodge_number ?? '').trim(), old = prev[lodgeNoKey(number)] || {};
    const fee = l.fee_rank !== undefined ? parseFeeRank(l.fee_rank) : old.fee_rank ?? '';
    tx.insert('member_lodges', { member_id: mid, seq: Number(l.seq) || i + 1, lodge_name: String(l.name ?? l.lodge_name ?? '').trim(), lodge_number: number, member_status: String(l.status ?? l.member_status ?? '').trim(),
      capacity: String(l.capacity !== undefined ? l.capacity : old.capacity ?? '').trim(), fee_rank: fee === '' ? '' : Number(fee),
      ...Object.fromEntries(LODGE_DATES.map(([k]) => [k, l[k] !== undefined ? isoOf(l[k]) : old[k] ?? ''])) });
  });
}

// Επετηρίδα του μέλους (από τον πίνακα «Επετηρίδα»): ανώτατο αξίωμα, διάταγμα, τίτλος
function epCard(m) {
  const rs = epeteiridaOf(m.id);
  if (!rs.length) return '';
  const r = rs[0], d = r.decree_no ? `${r.decree_no}${r.decree_year ? '/' + r.decree_year : ''}` : r.decree_year || '—';
  return `<div class="card ep-member"><h2 style="margin-top:0">📜 Επετηρίδα</h2><div class="grid">
<div><label>Ανώτατο αξίωμα / βαθμός</label><b>${esc(r.rank || '—')}</b></div><div><label>Διάταγμα ανώτατου αξιώματος</label><b class="official-number">${esc(d)}</b></div>
<div><label>Τίτλος αξιώματος κατά το Σύνταγμα</label>${esc(r.title || '—')} ${Number(r.active) ? '<span class="pill ok">Ενεργός</span>' : ''}</div><div><label>Προσφώνηση</label>${esc(r.honorific || '—')}</div>
${r.current ? `<div class="full"><label>Εν ενεργεία αξίωμα / διάταγμα</label>${esc(r.current)}</div>` : ''}${Number(r.tmd) ? `<div><label>ΤΜΔ</label>ΝΑΙ ${esc(r.tmd_decree || '')}</div>` : ''}
${r.province ? `<div><label>Επαρχία / Στοά</label>${esc(r.province)}</div>` : ''}</div>
${rs.length > 1 ? `<p class="muted">Και: ${rs.slice(1).map((x) => esc(x.title || x.rank)).join(' · ')}</p>` : ''}<p><a href="#/epeteirida/pinakas">Άνοιγμα της Επετηρίδας →</a></p></div>`;
}

// ---------------------------------------------------------------- σελίδες
// Φίλτρο κατάστασης (δυναμικό, μαζί με την αναζήτηση): Όλα · Ενεργά · ⛔ Διαγραμμένοι (ΔΙΑΓΡΑΦΕΝ σε όλες τις Στοές) · Ανενεργά
export const MEMBER_STATUS = [['', 'Όλα'], ['active', 'Ενεργά'], ['dereg', '⛔ Διαγραμμένοι'], ['inactive', 'Ανενεργά (όχι διαγραμμένα)']];
const statusOf = (x) => (noContact(x) ? 'dereg' : x.active !== 0 ? 'active' : 'inactive');
const memberResults = (query) => {
  const field = HINTS[query.field] ? query.field : 'surname', q = String(query.q || '').trim(), status = MEMBER_STATUS.some(([k]) => k && k === query.status) ? query.status : '';
  const all = sortBy(memberSearch(q, field), 'surname', 'first_name', 'id');
  return { field, q, status, all, xs: status ? all.filter((x) => statusOf(x) === status) : all };
};
const lodgesLine = (ls) => (ls || []).map((l) => `${l.lodge_name} ${l.lodge_number}`.trim() + (l.member_status ? ` (${l.member_status})` : '')).join(' · ');
// ⬆ Εισαγωγή / Επανεισαγωγή από Excel: τρεις λειτουργίες (Προσθήκη/Συμπλήρωση · Αντικατάσταση στοιχείων των μελών του αρχείου · Γενική αντικατάσταση)
const IMPORT_MODES = [['add', 'Προσθήκη / Συμπλήρωση — μόνο κενά πεδία, νέες Στοές και νέα μέλη· δεν σβήνει τίποτα (συνιστάται)'],
  ['merge', 'Αντικατάσταση στοιχείων των μελών του αρχείου — παίρνουν ακριβώς τις τιμές του αρχείου (και τις Στοές του)· τα υπόλοιπα μένουν'],
  ['replace', 'Γενική αντικατάσταση όλου του Μητρώου — μόνο με πλήρες αρχείο']];
const importBox = (open = false) => `<details class="card fold" id="impBox"${open ? ' open' : ''}><summary><b>⬆ Εισαγωγή / Επανεισαγωγή μελών από Excel</b></summary><form id="imp" style="margin-top:10px">
<p class="muted">Δεκτά: το Excel που κατεβάζει η εφαρμογή («⬇ Excel» σε κάθε σελίδα του Μητρώου — και διορθωμένο) ή το αρχείο-πηγή (Member_ID, Surname, First_Name, …, Lodge_1, Number_1, Status_1, …).</p>
<label>Αρχείο (.xlsx, .csv)</label><input type="file" name="file" accept=".xlsx,.xls,.csv">
<label style="margin-top:10px">ή Επικόλληση από Excel (μαζί με τη γραμμή επικεφαλίδων)</label><textarea name="paste" class="short" placeholder="ID	Επώνυμο	Όνομα	…"></textarea>
<p class="muted">Μέλη με <b>ΔΙΑΓΡΑΦΕΝ σε όλες τις Στοές τους</b> (ή All_Deregistered = ΝΑΙ χωρίς Στοές) καταχωρούνται ως <b>διαγραμμένα</b>: απαγορεύεται κάθε επικοινωνία. Πριν από κάθε εισαγωγή κατεβαίνει αυτόματα αντίγραφο όλου του Μητρώου.</p>
<label style="margin-top:10px">Λειτουργία</label>${IMPORT_MODES.map(([k, l], i) => `<label class="chk"><input type="radio" name="mode" value="${k}"${i === 0 ? ' checked' : ''}> ${esc(l)}</label>`).join('')}
<div class="toolbar" style="margin-top:10px"><button class="btn primary">Εισαγωγή</button></div></form></details>`;
function mountImport(el) {
  onSubmit(el.querySelector('#imp'), async (d) => {
    const paste = String(d.paste || '').trim(), hasFile = d.file && d.file.size;
    if (!paste && !hasFile) throw new Error('Επιλέξτε αρχείο ή επικολλήστε τις γραμμές από το Excel.');
    if (d.mode === 'replace' && !confirmDo('Γενική αντικατάσταση: ΟΛΟ το Μητρώο θα αντικατασταθεί από το αρχείο (η προηγούμενη μορφή μένει στο ιστορικό του GitHub). Μέλη που δεν υπάρχουν στο αρχείο θα διαγραφούν. Συνέχεια;')) return;
    await exportMembers(); // αντίγραφο ασφαλείας πριν από κάθε εισαγωγή
    const msg = await importMembers(hasFile ? d.file : paste, d.mode);
    flash(msg); go('/members');
  });
}
function importPage() {
  return { title: 'Επανεισαγωγή Μητρώου', html: `<p><a href="#/members">← Μητρώο Μελών</a></p><h1>⬆ Εισαγωγή / Επανεισαγωγή μελών</h1>
<p class="muted">Κατεβάστε τη λίστα από οποιαδήποτε σελίδα του Μητρώου («⬇ Excel»), διορθώστε ή συμπληρώστε τα στοιχεία και ανεβάστε την εδώ.</p>${importBox(true)}`, mount: mountImport };
}
// 🖨 Λίστα Διαγραμμένων (ή όποιου φίλτρου): εκτύπωση / PDF
function deregisteredPage({ query }) {
  const { xs, q } = memberResults({ ...query, status: 'dereg' }), byM = lodgesByMember(), title = 'Κατάλογος Διαγραμμένων Μελών';
  const sub = `${xs.length} μέλη — ΔΙΑΓΡΑΦΕΝ σε όλες τις Στοές τους · ${fmtDate(new Date().toISOString().slice(0, 10))}${q ? ` · αναζήτηση «${q}»` : ''}`;
  // ομαδοποίηση ανά Επαρχιακή / Περιφερειακή Μεγάλη Στοά (της πρώτης Στοάς του μέλους), με τη σειρά των ΕπΜΣτ.
  const NONE = 'Χωρίς Επαρχιακή / Περιφερειακή Μεγάλη Στοά', provOf = (x) => { const l = (byM[x.id] || [])[0]; return (l && (lodgeByNumber(l.lodge_number) || {}).provincial) || NONE; };
  const groups = new Map(); for (const x of xs) { const k = provOf(x); (groups.get(k) || groups.set(k, []).get(k)).push(x); }
  const order = provincialChoices(), keys = [...groups.keys()].sort((a, b) => (a === NONE) - (b === NONE) || ((order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999)) || a.localeCompare(b, 'el'));
  const head = '<thead><tr><th>Α/Α</th><th>Αρ. Μητρώου</th><th>Επώνυμο</th><th>Όνομα</th><th>Στοές (κατάσταση)</th><th>Σημείωση</th></tr></thead>';
  const inner = keys.length ? keys.map((k) => `<h3 class="dg-prov">${esc(k)} <small>(${groups.get(k).length})</small></h3><table>${head}<tbody>${groups.get(k).map((x, i) => `<tr><td>${i + 1}</td><td>${esc(regCode(x) || '')}</td><td><b>${esc(x.surname || '')}</b></td><td>${esc(x.first_name || '')}</td><td>${esc(lodgesLine(byM[x.id]))}</td><td>${esc(x.deregistered_note || '')}</td></tr>`).join('')}</tbody></table>`).join('')
    : '<p>Δεν υπάρχουν διαγραμμένα μέλη.</p>';
  return {
    title,
    html: `<div class="noprint"><p><a href="#/members?${new URLSearchParams({ ...(q ? { q, field: query.field || 'surname' } : {}), status: 'dereg' })}">← Μητρώο Μελών (⛔ Διαγραμμένοι)</a></p>
<div class="toolbar"><button type="button" class="btn primary" data-act="print">🖨 Εκτύπωση</button><button type="button" class="btn" data-act="pdf">⬇ PDF</button>${exportBar()}</div></div>
<div class="print-area">${reportPaper(title, sub, inner)}</div>`,
    mount(el) {
      bindExport(el, () => xs, 'Διαγραμμένοι');
      bind(el, { print: () => printPaper(title), async pdf() { const { paperPdf } = await import('../core/pdf.js'); const { download } = await import('../core/util.js'); download(title + '.pdf', await paperPdf(el.querySelector('.paper'), { title }), 'application/pdf'); } });
    },
  };
}
function listPage({ query }) {
  const { field, q, status, all, xs } = memberResults(query), pg = Math.max(1, Number(query.p) || 1), byM = lodgesByMember();
  const shown = xs.slice((pg - 1) * PAGE, pg * PAGE);
  const lq = field === 'lodge' ? q.replace(/^\s*(\d+|Φ)\s*·\s*/, '') : q;
  const H = (v, f) => hl(v, q, field === 'all' || field === f);
  const extra = (x, col, f) => { const v = x[col]; if (!(q && v && (field === 'all' || field === f))) return ''; const h = hl(v, q); return h.includes('<mark>') ? `<br><small class="muted">${h}</small>` : ''; };
  // Αναζήτηση ανά Στοά: η Στοά της αναζήτησης πρώτη, και σαφές αν το μέλος είναι διαγραμμένο εκεί αλλά ενεργό (τακτικό) αλλού
  const qNo = field === 'lodge' ? ((q.match(/^\s*(\d+|Φ)\b/) || [])[1] || '') : '';
  const isQLodge = (l) => field === 'lodge' && !!q && (qNo ? lodgeNoKey(l.lodge_number) === lodgeNoKey(qNo) : fold(`${l.lodge_name} ${l.lodge_number}`).includes(fold(lq)));
  const rows = shown.map((x) => {
    const ls = sortBy(byM[x.id] || [], (l) => (isQLodge(l) ? 0 : 1));
    const here = ls.filter(isQLodge), elsewhere = ls.filter((l) => !isQLodge(l) && !lodgeDeregged(l));
    const note = here.length && here.every(lodgeDeregged)
      ? `<div class="mdereg"><span class="pill dg">⛔ Διαγραμμένος από τη Στοά ${esc(here[0].lodge_name)} ${esc(here[0].lodge_number)}${here[0].dereg_date ? ' · ' + esc(fmtDate(here[0].dereg_date)) : ''}</span>${elsewhere.length
        ? ` <span class="pill ok">✓ ${esc(capacityOf(elsewhere[0]) || 'Τακτικό')} μέλος ΕΜΣτΕ — Στοά ${esc(elsewhere.map((l) => `${l.lodge_name} ${l.lodge_number}`.trim()).join(', '))}</span>` : ' <span class="pill dg">διαγραμμένος από όλες τις Στοές</span>'}</div>` : '';
    const lod = note + ls.slice(0, 3).map((l) => (lodgeDeregged(l) ? '<s class="mdereg-l">' : '') + hl(`${l.lodge_name} ${l.lodge_number}`.trim(), lq, field === 'lodge' || field === 'all') + (lodgeDeregged(l) ? `</s> <span class="pill dg" title="${esc(l.member_status)}">⛔ Διαγραφείς${l.dereg_date ? ' ' + esc(fmtDate(l.dereg_date)) : ''}</span>` : '') + ((c, f) => (c || f ? ` <small class="muted">${esc([c, f].filter(Boolean).join(' · '))}</small>` : ''))(lodgeDeregged(l) ? '' : capacityOf(l), Number(l.fee_rank) === 1 ? 'πλήρης συνδρ.' : feeRankLabel(l.fee_rank))).join('<br>') + (ls.length > 3 ? `<br><small>+${ls.length - 3} ακόμη</small>` : '');
    return [`<b>${x.id}</b>`, regBadge(x), (x.title && x.title !== 'Αδ.' ? `<small class="mtitle">${esc(x.title)}</small><br>` : '') + H(x.surname, 'surname') + extra(x, 'surname_variants', 'surname'), H(x.first_name, 'first_name') + extra(x, 'first_name_variants', 'first_name'),
      noContact(x) ? '<span class="muted">⛔</span>' : H(x.email, 'email') + extra(x, 'other_emails', 'email'), noContact(x) ? '<span class="muted">⛔</span>' : H(x.mobile, 'mobile') + extra(x, 'other_mobiles', 'mobile'),
      esc(x.degree) + [['date_ea', 'Μαθ.'], ['date_fc', 'Εταίρ.'], ['date_mm', 'Διδ.']].filter(([k]) => x[k]).map(([k, a]) => `<br><small class="muted">${a} ${esc(fmtDate(x[k]))}</small>`).join(''), `<small>${esc(highestOfficeText(x.id))}</small>`, lod, noContact(x) ? `<span class="pill bad" title="${NO_CONTACT}">⛔ Διαγραμμένος</span>` : x.active ? 'ΝΑΙ' : 'ΟΧΙ', `<a class="btn small" href="#/members/${x.id}">Επεξεργασία</a> <a class="btn small" href="#/members/card?ids=${x.id}">🪪 Κάρτα Μέλους</a>`];
  });
  // Αναζήτηση ανά Στοά: σύνολο εισφορών της Στοάς (Ταμείο)
  const feeLodge = field === 'lodge' && q ? (qNo ? lodgeByNumber(qNo) : (() => { const c = lodgesAll().filter((l) => fold(l.name) === fold(lq)); return c.length === 1 ? c[0] : null; })()) : null;
  const feeBox = feeLodge ? (() => { const a = lodgeFeeTotal(feeLodge.number); return `<div class="card tre-lodge">💶 <b>Εισφορές Στοάς ${esc(feeLodge.name)} ${esc(feeLodge.number)}: ${euro(a.total)}</b>
<small class="muted">${a.full} πλήρεις (1η Στοά) ${euro(a.fullSum)} · ${a.extra} επιπλέον Στοές ${euro(a.extraSum)} · ${a.exempt} απαλλαγές</small> <a class="btn small" href="#/treasury/members?lodge=${encodeURIComponent(feeLodge.number)}">Ανά μέλος →</a></div>`; })() : '';
  const [qlabel, ph, itype] = HINTS[field];
  const flabel = Object.fromEntries(MEMBER_FIELDS)[field];
  const summary = q ? `${xs.length === 1 ? 'Βρέθηκε <b>1</b> μέλος' : `Βρέθηκαν <b>${xs.length}</b> μέλη`} για «<b>${esc(q)}</b>» σε: <b>${esc(flabel)}</b>` : `Σύνολο <b>${xs.length}</b> μελών`;
  const mk = (p) => '#/members?' + new URLSearchParams({ q, field, p, ...(status ? { status } : {}) });
  const cnt = Object.fromEntries(MEMBER_STATUS.map(([k]) => [k, k ? all.filter((x) => statusOf(x) === k).length : all.length]));
  const stBar = `<div class="toolbar mstatus">${MEMBER_STATUS.map(([k, l]) => `<a class="btn small${k === status ? ' primary' : ''}${k === 'dereg' ? ' danger' : ''}" href="#/members?${new URLSearchParams({ q, field, ...(k ? { status: k } : {}) })}">${l} <b>${cnt[k]}</b></a>`).join('')}
${status === 'dereg' ? `<a class="btn small primary" href="#/members/deregistered?${new URLSearchParams({ q, field })}">🖨 Λίστα Διαγραμμένων (PDF)</a>` : ''}</div>`;
  return {
    title: 'Μητρώο Μελών',
    html: `<h1>Μητρώο Μελών</h1>${notice(query.msg)}<div class="toolbar"><a class="btn primary" href="#/members/new">+ Προσθήκη Μέλους</a>${(() => { const n = sameNameGroups().length; return n ? `<a class="btn" href="#/members/duplicates">Διπλές εγγραφές (${n})</a>` : ''; })()}<button class="btn" data-act="export" title="Όλο το Μητρώο">⬇ Excel (όλο)</button><a class="btn" href="#/members/diplomas">🎓 Διπλώματα Διδασκάλου</a><a class="btn" href="#/members/small-lodges">🏛 Στοές με &lt; 12 κύρια μέλη</a></div>
<div class="mc-cta"><a class="btn mc-cta-btn" href="#/members/card">🪪 <b>ΚΑΡΤΑ ΜΕΛΟΥΣ</b><small>αναζήτηση μέλους · προβολή · εκτύπωση · αποστολή με email</small></a><a class="btn mc-cta-btn" href="#/members/sgy">🏛 <b>ΜΗΤΡΩΟ ΜΕΛΩΝ ΣΓΥ</b><small>Συμβούλιο Γενικών Υποθέσεων · επιστολή · email · WhatsApp</small></a></div>
<div class="card member-search"><h3 style="margin-top:0">Αναζήτηση μέλους</h3><form class="msearch" id="ms"><fieldset class="msfield"><legend>1. Τι θα δώσετε;</legend>
${MEMBER_FIELDS.map(([k, v]) => `<label class="chip"><input type="radio" name="field" value="${k}"${k === field ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}</fieldset>
<div><label for="msq" id="msqlabel">2. ${esc(qlabel)}</label><input id="msq" name="q" value="${esc(q)}" autofocus autocomplete="off" type="${itype}" placeholder="${esc(ph)}"${field === 'lodge' ? ' list="lodgelist"' : ''}>
<datalist id="lodgelist">${lodgesAll().map((l) => `<option value="${esc(l.number)} · ${esc(l.name)}">`).join('')}</datalist></div>
<div class="msbtns"><button class="btn primary">Αναζήτηση</button>${q ? '<a class="btn" href="#/members">Καθαρισμός</a>' : ''}</div></form><p class="msresult">${summary}</p></div>${feeBox}
${stBar}<div class="toolbar"><small class="muted">Αποτελέσματα σελίδας (${xs.length}):</small>${exportBar()}<button type="button" class="btn" data-act="activeXlsx" title="Όλα τα ενεργά μέλη: Όνομα, Επώνυμο, 1η Στοά, Αριθμός, Επαρχία">⬇ Excel όλων των ενεργών (Στοά · Επαρχία)</button></div><div class="memtable">${table(['ID', 'Αρ. Μητρώου', 'Επώνυμο', 'Όνομα', 'Email', 'Κινητό', 'Βαθμός', 'Ανώτατο αξίωμα (Επετηρίδα)', 'Στοές', 'Ενεργός', 'Ενέργειες'], rows, q ? `Δεν βρέθηκε μέλος για «${q}» σε: ${flabel}. Δοκιμάστε «Όλα» ή λιγότερες λέξεις.` : 'Δεν υπάρχουν εγγραφές.')}</div>
${pager(xs.length, pg, PAGE, mk)}
${importBox()}`,
    mount(el) {
      const qi = el.querySelector('#msq'), lab = el.querySelector('#msqlabel');
      el.querySelectorAll('.msfield input').forEach((r) => r.addEventListener('change', () => {
        const h = HINTS[r.value]; lab.textContent = '2. ' + h[0]; qi.placeholder = h[1]; qi.type = h[2];
        if (r.value === 'lodge') qi.setAttribute('list', 'lodgelist'); else qi.removeAttribute('list'); qi.focus();
      }));
      onSubmit(el.querySelector('#ms'), (d) => go('/members', { q: d.q, field: d.field, ...(status ? { status } : {}) }));
      bind(el, { export: () => exportMembers() });
      bindExport(el, () => xs, [flabel && q ? `${flabel} ${q}` : '', (MEMBER_STATUS.find(([k]) => k === status) || [])[1] && status ? MEMBER_STATUS.find(([k]) => k === status)[1].replace(/[^\p{L}\s]/gu, '').trim() : ''].filter(Boolean).join(' · ') || 'Μητρώο Μελών');
      bind(el, { async activeXlsx() { const n = await exportActiveMembers(); toast(`Excel: ${n} ενεργά μέλη.`); } });
      mountImport(el);
    },
  };
}

// Πού εμφανίζεται το μέλος (οι λίστες δείχνουν σε αυτό — δεν κρατούν δικά τους αντίγραφα)
// Εκπροσωπήσεις του Μεγάλου Διδασκάλου από το μέλος (από τις Επισκέψεις Στοών — ίδια δεδομένα, καμία χωριστή καταγραφή)
function visitsCard(m) {
  const vs = memberVisits(m.id); if (!vs.length) return '';
  const t = today();
  return `<details class="card fold mv-card"${vs.some((v) => v.visit_date >= t) ? ' open' : ''}><summary><b>🎖 Εκπροσωπήσεις του Μεγάλου Διδασκάλου</b> <small class="muted">(${vs.length})</small></summary>
${table(['Ημερομηνία', 'Στοά', 'Επαρχία', ''], vs.map((v) => [`<b>${esc(fmtDate(v.visit_date))}</b>${v.visit_date >= t ? ' <span class="pill ok">προσεχής</span>' : ''}`, `${esc(v.lodge || '')} Αρ. ${esc(v.lodge_number || '')}`, esc(v.province || ''), `<a class="btn small" href="#/visits/edit/${v.id}">Επίσκεψη</a>`]))}</details>`;
}
function usesOf(m) {
  const reps = db.all('reps').filter((r) => r.member_id === m.id), offs = db.all('member_degrees_offices').filter((o) => o.member_id === m.id), gr = db.all('greetings_log').filter((g) => g.member_id === m.id);
  const parts = [reps.length && `Εκπρόσωπος ΜΔ: ${reps.map((r) => `<a href="#/reps/edit/${r.id}">${esc(String(r.office || 'χωρίς αξίωμα').split(' · ')[0])}</a>`).join(', ')}`,
    offs.length && `Επετηρίδα: ${offs.length} εγγραφές`, gr.length && `Ευχές: ${gr.length}`, m.merged_from && `Συγχωνεύθηκαν: ${esc(m.merged_from)}`].filter(Boolean);
  return parts.length ? `<p class="muted">${parts.join(' · ')}</p>` : '';
}
// Πίνακας Στοών του μέλους: Αρ. Στοάς, Στοά, Ιδιότητα (Σύνταγμα), Συνδρομή (Κ. 269), Κατάσταση
const lodgeRow = (l = {}) => {
  const cap = capacityOf(l), fee = Number(l.fee_rank) || '';
  return `<tbody class="ml-lodge"><tr><td class="ml-n" rowspan="2"></td><td><input data-k="number" value="${esc(l.lodge_number || '')}" list="mllodges" inputmode="numeric" placeholder="Αρ." autocomplete="off"></td>
<td><input data-k="name" value="${esc(l.lodge_name || '')}" placeholder="Όνομα Στοάς"></td>
<td><select data-k="capacity"><option value="">—</option>${MEMBER_CAPACITIES.map(([c, k, t]) => `<option value="${esc(c)}" title="${esc(t)}"${c === cap ? ' selected' : ''}>${esc(capacityLabel(c))}</option>`).join('')}${cap && !MEMBER_CAPACITIES.some((x) => x[0] === cap) ? `<option selected>${esc(cap)}</option>` : ''}</select></td>
<td><select data-k="fee_rank"><option value="">—</option>${FEE_RANKS.map((n) => `<option value="${n}"${n === fee ? ' selected' : ''}>${esc(feeRankLabel(n, true))}</option>`).join('')}</select></td>
<td><input data-k="status" value="${esc(l.member_status || '')}" list="mlstatus" placeholder="π.χ. ΕΝΕΡΓΟ, ΔΙΑΓΡΑΦΕΝ"></td>
<td rowspan="2"><button type="button" class="lnk" data-act="rmlodge" title="Αφαίρεση Στοάς">✕</button></td></tr>
<tr class="ml-dates"><td colspan="5"><div class="ml-dgrid">${LODGE_DATES.map(([k, lab]) => `<label><span${k === 'capacity_date' ? ' class="ml-capdate"' : ''}>${esc(k === 'capacity_date' ? capacityDateLabel(cap) : lab)}</span><input type="date" data-k="${k}" value="${esc(isoOf(l[k]))}"></label>`).join('')}</div></td></tr></tbody>`;
};
function lodgesEditor(ls) {
  const statuses = [...new Set(db.all('member_lodges').map((l) => String(l.member_status || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el'));
  return `<div class="tablecard ml-wrap"><table class="ml-grid" id="mlrows"><thead><tr><th>Α/Α</th><th>Αρ. Στοάς</th><th>Στοά</th><th>Ιδιότητα (Σύνταγμα)</th><th>Στοά πλήρους συνδρομής / 2η / 3η κ.ο.κ.</th><th>Κατάσταση</th><th></th></tr></thead>
${(ls.length ? ls : [{}]).map(lodgeRow).join('')}</table></div>
<datalist id="mllodges">${lodgesAll().map((l) => `<option value="${esc(l.number)}">${esc(l.name)}</option>`).join('')}</datalist><datalist id="mlstatus">${statuses.map((x) => `<option value="${esc(x)}">`).join('')}</datalist>
<div class="toolbar" style="margin-top:6px"><button type="button" class="btn small" data-act="addlodge">+ Στοά</button></div>
<details class="ml-help"><summary>Ιδιότητες μελών κατά το Σύνταγμα</summary><ul>${MEMBER_CAPACITIES.map(([c, k, t]) => `<li><b>${esc(c)}</b>${k ? ` <span class="muted">(${esc(k)})</span>` : ''} — ${esc(t)}</li>`).join('')}
<li><b>Ημερομηνίες</b> — για κάθε Στοά: απόκτησης της ιδιότητας (μύησης, υιοθεσίας, επανόδου, αναγόρευσης ή μετάταξης), Β΄ Επόπτη, Α΄ Επόπτη, Σεβασμίου και διαγραφής.</li>
<li><b>Στοά πλήρους συνδρομής / 2η / 3η κ.ο.κ.</b> <span class="muted">(Κ. 269)</span> — δεν είναι ιδιότητα αλλά οικονομική σχέση: σε μία Στοά η πλήρης ετήσια συνδρομή, στη 2η, 3η κ.ο.κ. το 1/10 (ή το 1/20 αν είναι ξενόγλωσση).</li>
<li class="muted">Ο Κ. 146 (μεταβολές μελών) αναφέρει ρητά τις κατηγορίες Μετοίκου, Ομοτίμου, Αριστίνδην και Επιτίμου.</li></ul></details>`;
}
function mountLodgesEditor(el) {
  const body = el.querySelector('#mlrows');
  const renumber = () => body.querySelectorAll('.ml-n').forEach((c, i) => (c.textContent = i + 1));
  const lodges = () => body.querySelectorAll('.ml-lodge');
  renumber();
  el.querySelector('[data-act=addlodge]').addEventListener('click', () => {
    const next = lodges().length + 1;
    body.insertAdjacentHTML('beforeend', lodgeRow({ fee_rank: [...body.querySelectorAll('[data-k=fee_rank]')].some((s) => s.value) ? Math.min(next, 6) : '' }));
    renumber(); [...lodges()].at(-1).querySelector('[data-k=number]').focus();
  });
  body.addEventListener('click', (e) => { if (e.target.closest('[data-act=rmlodge]')) { e.target.closest('.ml-lodge').remove(); renumber(); } });
  // αριθμός Στοάς → όνομα από τον κατάλογο Στοών
  body.addEventListener('change', (e) => {
    // η ημερομηνία της ιδιότητας παίρνει το όνομά της (π.χ. «Ημ. υιοθεσίας»)
    if (e.target.dataset.k === 'capacity') e.target.closest('.ml-lodge').querySelector('.ml-capdate').textContent = capacityDateLabel(e.target.value);
    if (e.target.dataset.k !== 'number') return;
    const l = lodgesAll().find((x) => lodgeNoKey(x.number) === lodgeNoKey(e.target.value)), name = e.target.closest('tr').querySelector('[data-k=name]');
    if (l) name.value = l.name;
  });
}
function readLodgesEditor(el) {
  const out = [];
  for (const tr of el.querySelectorAll('#mlrows .ml-lodge')) {
    const g = (k) => tr.querySelector(`[data-k=${k}]`).value.trim();
    if (!g('number') && !g('name')) continue;
    out.push({ seq: out.length + 1, name: g('name'), number: lodgeNumberFor(g('name'), g('number')), status: g('status'), capacity: g('capacity'), fee_rank: g('fee_rank'), ...Object.fromEntries(LODGE_DATES.map(([k]) => [k, g(k)])) });
  }
  const full = out.filter((l) => Number(l.fee_rank) === 1);
  if (full.length > 1) throw new Error(`Στοά πλήρους συνδρομής μπορεί να είναι μόνο μία (Κ. 269)· επιλέχθηκαν ${full.length}.`);
  return out;
}

function formPage(m) {
  const ls = m ? lodgesByMember()[m.id] || [] : [];
  const x = m || { active: 1 };
  const f = (k, label, extra = '') => `<div><label>${label}</label><input name="${k}" value="${esc(x[k] ?? '')}" ${extra}></div>`;
  const offices = m ? sortBy(db.all('member_degrees_offices').filter((o) => o.member_id === m.id), (o) => -(o.decree_year || 0)) : [];
  return {
    title: m ? `Μέλος #${m.id}` : 'Νέο Μέλος',
    html: `<p><a href="#/members">← Μητρώο Μελών</a></p><h1>${m ? `${esc(m.surname)} ${esc(m.first_name)} <small class="muted">#${m.id}</small>` : 'Νέο Μέλος'}</h1>${m ? `<div class="toolbar"><a class="btn primary" href="#/members/card?ids=${m.id}">🪪 Κάρτα Μέλους</a><a class="btn" href="#/members/diploma?id=${m.id}">🎓 Δίπλωμα Διδασκάλου</a></div>` : ''}${noContact(m) ? `<div class="card nocontact">${NO_CONTACT}</div>` : ''}${m ? usesOf(m) + visitsCard(m) : ''}
<form id="mf"><div class="grid card"><div class="full regcode-row"><label>Αρ. Μητρώου</label><div class="regcode">${m ? regBadge(m) : '<span class="muted">αυτόματα (M + επόμενος ελεύθερος· MM + αριθμός Διπλώματος, αν υπάρχει)</span>'}</div></div>
${isAdmin() ? f('diploma_no', 'Δίπλωμα Διδασκάλου Τέκτονος <small class="muted">(Certificate Master Mason) — ο πραγματικός αριθμός μητρώου</small>', 'inputmode="numeric" placeholder="αριθμός διπλώματος"')
  : `<div><label>Δίπλωμα Διδασκάλου Τέκτονος</label><input value="${esc(x.diploma_no || '—')}" disabled></div>`}
${isAdmin() ? f('registry_no', 'Εσωτερικός αριθμός (M) <small class="muted">— μόνιμος· αλλάζει μόνο από τον διαχειριστή</small>', `inputmode="numeric"${m ? '' : ' placeholder="αυτόματα (επόμενος ελεύθερος)"'}`)
  : `<div><label>Εσωτερικός αριθμός (M)</label><input value="${esc(m ? m.registry_no ?? '' : 'αυτόματα')}" disabled><input type="hidden" name="registry_no" value="${esc(m ? m.registry_no ?? '' : '')}"></div>`}<div><label>Τίτλος <small class="muted">— από την Επετηρίδα (αυτόματα)</small></label><input value="${esc(x.title || '—')}" disabled></div>${f('surname', 'Επώνυμο', 'required')}${f('first_name', 'Όνομα', 'required')}
${f('surname_variants', 'Παραλλαγές Επωνύμου', 'placeholder="π.χ. CASTANEDA; ΚΑΣΤΑΝΕΔΑ"')}${f('first_name_variants', 'Παραλλαγές Ονόματος', 'placeholder="π.χ. CARLOS; ΚΑΡΛΟΣ"')}
${f('email', 'Κύριο Email', 'inputmode="email"')}${f('other_emails', 'Άλλα Email')}${f('mobile', 'Κύριο Κινητό', 'inputmode="tel"')}${f('other_mobiles', 'Άλλα Κινητά')}${f('degree', 'Τεκτονικός Βαθμός')}
<div><label>Ενεργός</label><select name="active"><option value="1"${x.active ? ' selected' : ''}>ΝΑΙ</option><option value="0"${x.active ? '' : ' selected'}>ΟΧΙ</option></select></div>
<div><label>Επικοινωνία</label><select name="no_contact"><option value="0">Επιτρέπεται</option><option value="1"${noContact(x) ? ' selected' : ''}>⛔ Απαγορεύεται (διαγραμμένος)</option></select></div>
${MEMBER_DATES.slice(0, 3).map(([k, lab]) => `<div><label>${esc(lab)}</label><input type="date" name="${k}" value="${esc(isoOf(x[k]))}"></div>`).join('')}
${f('mm_lodge_name', 'Στοά Εγέρσεως (όπου έγινε Διδάσκαλος)')}${f('mm_lodge_number', 'Αρ. Στοάς Εγέρσεως', 'inputmode="numeric"')}
<div><label>${esc(MEMBER_DATES[3][1])}</label><input type="date" name="dereg_date" value="${esc(isoOf(x.dereg_date))}"></div>
<div class="full"><label>Σημείωση Διαγραφής</label><input name="deregistered_note" value="${esc(x.deregistered_note || '')}"></div>
<div class="full"><label>Πρόσθετες Στοές / παλαιά πληροφορία</label><textarea name="additional_lodges" class="short">${esc(x.additional_lodges || '')}</textarea></div>
<div class="full"><label>Στοές του μέλους</label>${lodgesEditor(ls)}</div></div>
<div class="toolbar"><button class="btn primary">💾 Αποθήκευση</button><a class="btn" href="#/members">Ακύρωση</a>${m ? `<a class="btn" href="#/members/card?ids=${m.id}">🪪 Κάρτα Μέλους</a>` : ''}${m && !noContact(m) ? `<a class="btn" href="#/letters/new?to_name=${encodeURIComponent(`${m.first_name} ${m.surname}`)}&to_email=${encodeURIComponent(m.email || '')}">✉ Επιστολή</a>` : ''}${m ? '<button type="button" class="btn danger" data-act="del">Διαγραφή</button>' : ''}</div></form>
${m ? epCard(m) : ''}${offices.length ? `<h2>Ιστορικό αξιωμάτων (Διατάγματα)</h2>${table(['Έτος', 'Αξίωμα / Τίτλος', 'Διάταγμα'], offices.map((o) => [esc(o.decree_year), esc(o.office), o.decree_id ? `<a href="#/decrees/${o.decree_id}">${esc(o.decree_no)}/${esc(o.decree_year)}</a>` : esc(o.decree_no ? `${o.decree_no}/${o.decree_year}` : '')]))}` : ''}`,
    mount(el) {
      onSubmit(el.querySelector('#mf'), async (d) => {
        const rn = isAdmin() ? String(d.registry_no || '').trim() : String(m ? m.registry_no ?? '' : '');
        if (m && isAdmin() && rn !== String(m.registry_no ?? '') && !confirmDo(`Αλλαγή του μόνιμου Αρ. Μητρώου από ${m.registry_no ?? '—'} σε ${rn || '—'};`)) return;
        if (rn && !/^\d+$/.test(rn)) throw new Error('Ο αριθμός μητρώου πρέπει να είναι αριθμός.');
        const dn = isAdmin() ? String(d.diploma_no || '').trim().replace(/^[MΜ]{2}\s*-?/i, '') : String(m ? m.diploma_no ?? '' : '');
        if (dn && !/^\d+$/.test(dn)) throw new Error('Ο αριθμός Διπλώματος πρέπει να είναι αριθμός.');
        if (m && isAdmin() && dn !== String(m.diploma_no ?? '') && m.diploma_no && !confirmDo(`Αλλαγή του αριθμού Διπλώματος από ${m.diploma_no} σε ${dn || '—'};`)) return;
        const lodges = readLodgesEditor(el);
        const row = { ...Object.fromEntries(['surname', 'first_name', 'email', 'other_emails', 'mobile', 'other_mobiles', 'degree', 'deregistered_note', 'additional_lodges', 'surname_variants', 'first_name_variants', 'mm_lodge_name', 'mm_lodge_number', ...MEMBER_DATES.map(([k]) => k)].map((k) => [k, String(d[k] || '').trim()])),
          active: d.active === '1' ? 1 : 0, no_contact: d.no_contact === '1' || isDereg('', lodges.map((l) => l.status)) ? 1 : 0, registry_no: rn ? Number(rn) : null, diploma_no: dn, declared_lodge_count: String(lodges.length), lodges };
        const id = await db.save(m ? `Μέλος #${m.id}: ενημέρωση` : 'Νέο μέλος', (tx) => {
          if (rn && tx.find('member_registry', (x) => x.registry_no === Number(rn) && (!m || x.id !== m.id))) throw new Error(`Ο αριθμός μητρώου ${rn} υπάρχει ήδη.`);
          const dup = dn && tx.find('member_registry', (x) => String(x.diploma_no ?? '') === dn && (!m || x.id !== m.id));
          if (dup) throw new Error(`Το Δίπλωμα ${dn} ανήκει ήδη στο μέλος ${dup.surname} ${dup.first_name} (#${dup.id}).`);
          if (m) { updateMember(tx, m.id, { ...row, registry_no: row.registry_no ?? m.registry_no, _admin_registry: isAdmin() }); return m.id; }
          return insertMember(tx, row);
        });
        flash('Η εγγραφή αποθηκεύτηκε.'); go('/members', { q: row.surname, field: 'surname' });
        return id;
      });
      mountLodgesEditor(el);
      bind(el, { async del() {
        if (!confirmDo(`Οριστική διαγραφή του μέλους ${m.surname} ${m.first_name}; (Θα κατέβει πρώτα Excel ασφαλείας.)`)) return;
        await exportMembers();
        await db.save(`Διαγραφή μέλους #${m.id}`, (tx) => { tx.remove('member_lodges', (l) => l.member_id === m.id); tx.remove('member_degrees_offices', (o) => o.member_id === m.id); tx.remove('member_registry', m.id); });
        flash('Η εγγραφή διαγράφηκε.'); go('/members');
      } });
    },
  };
}

// ---------------------------------------------------------------- Excel
// Excel του Μητρώου σε μορφή επανεισαγωγής (ΜΗΤΡΩΟ ΜΕΛΩΝ · ΣΤΟΕΣ ΜΕΛΩΝ · ΒΑΘΜΟΙ & ΑΞΙΩΜΑΤΑ). Με list: μόνο τα μέλη που δείχνει η σελίδα.
export async function exportMembers(list = null, label = '') {
  const X = await XLSX();
  const ms = Array.isArray(list) ? list : sortBy(membersAll(), 'surname', 'first_name', 'id'), ids = new Set(ms.map((m) => m.id));
  const wb = X.utils.book_new();
  const add = (name, rows) => { const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = rows[0].map(() => ({ wch: 20 })); X.utils.book_append_sheet(wb, ws, name); };
  add('ΜΗΤΡΩΟ ΜΕΛΩΝ', [['ID', 'Αρ. Μητρώου', 'Δίπλωμα Διδασκάλου', 'Εσωτερικός αριθμός', 'Επώνυμο', 'Όνομα', 'Κύριο Email', 'Άλλα Email', 'Κύριο Κινητό', 'Άλλα Κινητά', 'Τεκτονικός Βαθμός', 'Ενεργός', 'Σημείωση Διαγραφής', 'Δηλωμένος Αρ. Στοών', 'Πρόσθετες Στοές', 'Γραμμή Πηγής', 'Ενημερώθηκε', 'Παραλλαγές Επωνύμου', 'Παραλλαγές Ονόματος', 'Απαγορεύεται Επικοινωνία', 'Τίτλος (Επετηρίδα)', ...MEMBER_DATES.map(([, l]) => l)],
    ...ms.map((m) => [m.id, regCode(m), m.diploma_no || '', m.registry_no ?? '', m.surname, m.first_name, m.email, m.other_emails, m.mobile, m.other_mobiles, m.degree, m.active ? 'ΝΑΙ' : 'ΟΧΙ', m.deregistered_note, m.declared_lodge_count, m.additional_lodges, m.source_row ?? '', m.updated_at, m.surname_variants || '', m.first_name_variants || '', noContact(m) ? 'ΝΑΙ' : 'ΟΧΙ', m.title || '', ...MEMBER_DATES.map(([k]) => m[k] || '')])]);
  add('ΣΤΟΕΣ ΜΕΛΩΝ', [['ID Μέλους', 'Α/Α Στοάς', 'Στοά', 'Αριθμός Στοάς', 'Κατάσταση', 'Ιδιότητα', 'Συνδρομή', ...LODGE_DATES.map(([, l]) => l)], ...sortBy(db.all('member_lodges').filter((l) => ids.has(l.member_id)), 'member_id', 'seq').map((l) => [l.member_id, l.seq, l.lodge_name, l.lodge_number, l.member_status, capacityOf(l), feeRankLabel(l.fee_rank), ...LODGE_DATES.map(([k]) => l[k] || '')])]);
  add('ΒΑΘΜΟΙ & ΑΞΙΩΜΑΤΑ', [['ID', 'ID Μέλους', 'Τύπος Εγγραφής', 'Βαθμός', 'Αξίωμα', 'ID Διατάγματος', 'Αρ. Διατάγματος', 'Έτος', 'Από', 'Έως', 'Ενεργό', 'Σημειώσεις'],
    ...sortBy(db.all('member_degrees_offices').filter((o) => ids.has(o.member_id)), 'member_id', 'id').map((o) => [o.id, o.member_id, o.record_type, o.degree, o.office, o.decree_id, o.decree_no, o.decree_year, o.valid_from, o.valid_to, o.is_current ? 'ΝΑΙ' : 'ΟΧΙ', o.notes])]);
  add('ΟΔΗΓΙΕΣ', [['Επανεισαγωγή μετά από διόρθωση'], [`Περιεχόμενο: ${label || 'όλο το Μητρώο'} — ${ms.length} μέλη`],
    ['1. Διορθώστε/συμπληρώστε στα φύλλα «ΜΗΤΡΩΟ ΜΕΛΩΝ» και «ΣΤΟΕΣ ΜΕΛΩΝ». Μην αλλάζετε τη στήλη ID (ταυτίζει το μέλος). Νέο μέλος: νέα γραμμή χωρίς ID.'],
    ['2. Εφαρμογή → Μητρώο → «⬆ Επανεισαγωγή» → επιλέξτε το αρχείο και τη λειτουργία:'],
    ['   • Προσθήκη / Συμπλήρωση: μόνο κενά πεδία, νέες Στοές και νέα μέλη — δεν σβήνει τίποτα.'],
    ['   • Αντικατάσταση στοιχείων των μελών του αρχείου: τα μέλη του αρχείου παίρνουν ακριβώς τις τιμές του (και τις Στοές του)· τα υπόλοιπα μένουν.'],
    ['   • Γενική αντικατάσταση όλου του Μητρώου: μόνο με πλήρες αρχείο όλου του Μητρώου.'],
    ['Ο Αρ. Μητρώου και το Δίπλωμα δεν αλλάζουν από εισαγωγή (μόνο από την καρτέλα, από διαχειριστή).']]);
  const d = new Date(), tag = label ? '_' + String(label).replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '').slice(0, 40) : '';
  X.writeFile(wb, `EMSTE_MEMBER_REGISTRY${tag}_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`);
}
// Απλό Excel όλων των ενεργών μελών: Όνομα · Επώνυμο · 1η Στοά (κατά Α/Α) · Αριθμός · Επαρχία (από τον κατάλογο Στοών)
export async function exportActiveMembers() {
  const X = await XLSX(), byM = lodgesByMember();
  const ms = sortBy(membersAll().filter((m) => statusOf(m) === 'active'), 'surname', 'first_name', 'id');
  const rows = ms.map((m) => {
    const l = (byM[m.id] || []).find((x) => x.lodge_name || x.lodge_number) || {}, reg = l.lodge_number ? lodgeByNumber(l.lodge_number) : null;
    return [m.first_name || '', m.surname || '', l.lodge_name || '', l.lodge_number ?? '', (reg && reg.provincial) || ''];
  });
  const ws = X.utils.aoa_to_sheet([['Όνομα', 'Επώνυμο', '1η Στοά', 'Αριθμός Στοάς', 'Επαρχία'], ...rows]);
  ws['!cols'] = [{ wch: 18 }, { wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 36 }];
  ws['!autofilter'] = { ref: `A1:E${rows.length + 1}` };
  const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'ΕΝΕΡΓΑ ΜΕΛΗ');
  X.writeFile(wb, `EMSTE_ENERGA_MELH_${today().replace(/-/g, '')}.xlsx`);
  return rows.length;
}
// Λίστα PDF των μελών της σελίδας
export async function exportMembersPdf(ms, title = 'Μητρώο Μελών') {
  const byM = lodgesByMember(), box = document.createElement('div');
  box.className = 'print-area'; box.style.cssText = 'position:absolute;left:-10000px;top:0;width:210mm';
  box.innerHTML = reportPaper(title, `${ms.length} μέλη · ${fmtDate(new Date().toISOString().slice(0, 10))}`, `<table><thead><tr><th>Α/Α</th><th>Αρ. Μητρώου</th><th>Επώνυμο</th><th>Όνομα</th><th>Email</th><th>Κινητό</th><th>Στοές (κατάσταση)</th></tr></thead><tbody>${ms.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(regCode(x) || '')}</td><td><b>${esc(x.surname || '')}</b></td><td>${esc(x.first_name || '')}</td><td>${noContact(x) ? '⛔' : esc(x.email || '')}</td><td>${noContact(x) ? '⛔' : esc(x.mobile || '')}</td><td>${esc(lodgesLine(byM[x.id]))}</td></tr>`).join('')}</tbody></table>`);
  document.body.appendChild(box);
  try { const { paperPdf } = await import('../core/pdf.js'), { download } = await import('../core/util.js'); download(title + '.pdf', await paperPdf(box.querySelector('.paper'), { title }), 'application/pdf'); }
  finally { box.remove(); }
}
// Κουμπιά εξαγωγής για κάθε σελίδα του Μητρώου (τα μέλη που δείχνει η σελίδα) και επανεισαγωγή
export const exportBar = () => '<span class="mexport"><button type="button" class="btn" data-act="mxlsx" title="Excel σε μορφή επανεισαγωγής">⬇ Excel</button><button type="button" class="btn" data-act="mpdf">⬇ PDF</button><a class="btn" href="#/members/import">⬆ Επανεισαγωγή</a></span>';
export function bindExport(el, getMembers, title) {
  bind(el, {
    async mxlsx() { const ms = getMembers(); await exportMembers(ms, title); toast(`Excel: ${ms.length} μέλη.`); },
    async mpdf() { const ms = getMembers(); toast('Δημιουργία PDF…'); await exportMembersPdf(ms, title); },
  });
}

const hkey = (x) => String(x || '').toLowerCase().replace(/[^0-9a-zͰ-Ͽ]/g, '');
const splitMulti = (v) => String(v || '').split(/[;\n]+/).map((p) => p.trim().replace(/^,|,$/g, '').trim()).filter(Boolean);
const plainUpper = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const yes = (v) => ['ΝΑΙ', 'NAI', 'YES', 'TRUE', '1', 'Y'].includes(plainUpper(v));
// Κανόνας διαγραφής (απαγορεύεται η επικοινωνία): ΔΙΑΓΡΑΦΕΝ σε ΟΛΕΣ τις Στοές του μέλους — η διαγραφή από μία Στοά δεν αρκεί.
// Χωρίς καταστάσεις Στοών: η ένδειξη All_Deregistered της πηγής.
// Διαγραμμένος (ή μετεγγραφείς) από μία συγκεκριμένη Στοά
export const lodgeDeregged = (l) => /ΔΙΑΓΡΑΦ|ΜΕΤΕΣΘ/.test(plainUpper((l || {}).member_status));
export const deregEverywhere = (statuses) => { const st = statuses.map(plainUpper).filter(Boolean); return st.length > 0 && st.every((x) => /ΔΙΑΓΡΑΦ/.test(x)); };
export const isDereg = (all, statuses = []) => (statuses.some((x) => String(x || '').trim()) ? deregEverywhere(statuses) : yes(all));
// Αριθμός Στοάς από το όνομα όταν λείπει. Ονόματα που υπάρχουν δύο φορές (ΠΛΑΤΩΝ 70/103, ΑΚΡΟΠΟΛΙΣ 2/104) ξεχωρίζουν με το έτος.
const lodgeKey = (v) => plainUpper(v).replace(/[ABEZHIKMNOPTXY]/g, (c) => 'ΑΒΕΖΗΙΚΜΝΟΡΤΧΥ'['ABEZHIKMNOPTXY'.indexOf(c)]).replace(/[^0-9Α-Ω]/g, '');
const LODGE_ALIASES = { ΑΚΡΟΠΟΛΙΣ2010: '104', ΠΛΑΤΩΝ1990: '103', ΠΡΟΜΗΘΕΥΣ2014: '105', ΔΗΜΗΤΗΡ: '113', ΕΝΩΣΙΣΚΥΠΡΟΣ: '55', ΦΟΙΝΙΞΚΕΡΚΥΡΑΣ: 'Φ', ΦΟΙΝΙΞ: 'Φ' };
export function lodgeNumberFor(name, num) {
  if (String(num || '').trim()) return String(num).trim().replace(/\.0$/, '');
  const n = lodgeKey(name);
  if (!n) return '';
  if (LODGE_ALIASES[n]) return LODGE_ALIASES[n];
  const all = lodgesAll(), one = (xs) => (xs.length === 1 ? String(xs[0].number) : '');
  return one(all.filter((l) => lodgeKey(l.name) === n)) || one(all.filter((l) => lodgeKey(l.name).length > 3 && (n.startsWith(lodgeKey(l.name)) || lodgeKey(l.name).startsWith(n))));
}
function sourceMember(d, rn) {
  const g = (...ks) => { for (const k of ks) { const v = d[hkey(k)]; if (v) return v; } return ''; };
  const sv = g('All_Surname_Variants'), fv = g('All_FirstName_Variants');
  const sn = g('Surname') || (splitMulti(sv)[0] || ''), fn = g('First_Name') || (splitMulti(fv)[0] || '');
  if (!sn && !fn) return null;
  const emails = splitMulti(g('Email')), mobiles = splitMulti(g('Mobile')), lodges = [];
  for (let j = 1; j <= 6; j++) { const n = g(`Lodge_${j}`), num = g(`Number_${j}`), st = g(`Status_${j}`); if (n || num || st) lodges.push({ seq: lodges.length + 1, name: n, number: lodgeNumberFor(n, num), status: st }); }
  const bad = [];
  for (const part of String(g('Additional_Lodges (beyond 6)', 'Additional_Lodges')).split(';').map((p) => p.trim()).filter(Boolean)) {
    const mm = /^(.*?)\s+(\S+)\s*\((.*)\)\s*$/.exec(part);
    if (mm) lodges.push({ seq: lodges.length + 1, name: mm[1].trim(), number: lodgeNumberFor(mm[1], mm[2]), status: mm[3].trim() }); else bad.push(part);
  }
  const dereg = isDereg(g('All_Deregistered (ΔΙΑΓΡΑΦΕΝ)', 'All_Deregistered'), lodges.map((l) => l.status)), sts = lodges.map((l) => l.status.toUpperCase()).filter(Boolean);
  const deceased = sts.length > 0 && sts.every((x) => x.includes('ΜΕΤΕΣΘΕΝ'));
  const variants = (v, name) => { const vs = splitMulti(v); return vs.some((x) => plainUpper(x) !== plainUpper(name)) ? vs.join('; ') : ''; };
  const rid = String(g('Member_ID')).replace('.0', '');
  return { source_row: rn, registry_no: null, source_member_id: /^\d+$/.test(rid) ? Number(rid) : null, surname: sn, first_name: fn, surname_variants: variants(sv, sn), first_name_variants: variants(fv, fn),
    email: emails[0] || '', other_emails: emails.slice(1).join('; '), mobile: mobiles[0] || '', other_mobiles: mobiles.slice(1).join('; '), degree: g('Degree'),
    declared_lodge_count: g('Number_of_Lodges') || String(lodges.length), deregistered_note: dereg ? 'ΔΙΑΓΡΑΦΕΝ — απαγορεύεται κάθε επικοινωνία' : deceased ? 'ΜΕΤΕΣΘΕΝ ΕΙΣ ΑΙ. ΑΝ.' : '',
    additional_lodges: bad.join('; '), active: !dereg && !deceased, no_contact: dereg ? 1 : 0, lodges };
}

export async function importMembers(file, mode = 'merge') {
  const sheets = typeof file === 'string' ? [{ name: 'paste', rows: parsePasted(file) }] : await readXlsx(file), first = sheets[0].rows;
  if (!first.length) throw new Error('Το αρχείο είναι κενό.');
  const keys = first[0].map(hkey);
  let items;
  if (keys.includes('allsurnamevariants') || ['surname', 'firstname', 'lodge1'].every((k) => keys.includes(k))) {
    items = first.slice(1).map((r, i) => sourceMember(Object.fromEntries(keys.map((k, j) => [k, String(r[j] ?? '').trim()]).filter(([k]) => k)), i + 2))
      .filter(Boolean).map((m) => ({ id: null, member: m }));
  } else {
    const sh = sheets.find((s) => s.name === 'ΜΗΤΡΩΟ ΜΕΛΩΝ') || sheets[0], h = sh.rows[0].map((x) => String(x).trim()), v = (r, n) => { const i = h.indexOf(n); return i < 0 ? '' : String(r[i] ?? '').trim(); };
    if (!h.includes('Επώνυμο')) throw new Error('Δεν αναγνωρίστηκαν οι στήλες. Η πρώτη γραμμή πρέπει να είναι οι επικεφαλίδες (Member_ID, Surname, First_Name, … ή ID, Επώνυμο, Όνομα, …).');
    items = sh.rows.slice(1).filter((r) => v(r, 'Επώνυμο') || v(r, 'Όνομα')).map((r) => ({ id: Number(v(r, 'ID')) || null, member: {
      surname: v(r, 'Επώνυμο'), first_name: v(r, 'Όνομα'), email: v(r, 'Κύριο Email'), other_emails: v(r, 'Άλλα Email'), mobile: v(r, 'Κύριο Κινητό'), other_mobiles: v(r, 'Άλλα Κινητά'), degree: v(r, 'Τεκτονικός Βαθμός'),
      active: yes(v(r, 'Ενεργός')), no_contact: yes(v(r, 'Απαγορεύεται Επικοινωνία')) ? 1 : 0, deregistered_note: v(r, 'Σημείωση Διαγραφής'), declared_lodge_count: v(r, 'Δηλωμένος Αρ. Στοών'), additional_lodges: v(r, 'Πρόσθετες Στοές'),
      source_row: Number(v(r, 'Γραμμή Πηγής')) || null, registry_no: Number(v(r, 'Εσωτερικός αριθμός')) || Number(codeKey(v(r, 'Αρ. Μητρώου')).replace(/^M(?!M)/, '')) || null,
      diploma_no: v(r, 'Δίπλωμα Διδασκάλου') || (codeKey(v(r, 'Αρ. Μητρώου')).match(/^MM(\d+)$/) || [])[1] || '', surname_variants: v(r, 'Παραλλαγές Επωνύμου'), first_name_variants: v(r, 'Παραλλαγές Ονόματος'),
      ...Object.fromEntries(MEMBER_DATES.filter(([, l]) => h.includes(l)).map(([k, l]) => [k, isoOf(v(r, l))])), lodges: [] } }));
    const ls = sheets.find((s) => s.name === 'ΣΤΟΕΣ ΜΕΛΩΝ');
    if (ls) {
      const lh = ls.rows[0].map((x) => String(x).trim()), lv = (r, n) => String(r[lh.indexOf(n)] ?? '').trim(), byId = Object.fromEntries(items.filter((x) => x.id).map((x) => [x.id, x]));
      for (const r of ls.rows.slice(1)) { const it = byId[Number(lv(r, 'ID Μέλους'))]; if (it) it.member.lodges.push({ seq: Number(lv(r, 'Α/Α Στοάς')) || 1, name: lv(r, 'Στοά'), number: lv(r, 'Αριθμός Στοάς'), status: lv(r, 'Κατάσταση'), ...(lh.includes('Ιδιότητα') ? { capacity: lv(r, 'Ιδιότητα') } : {}), ...(lh.includes('Συνδρομή') ? { fee_rank: lv(r, 'Συνδρομή') } : {}),
        ...Object.fromEntries(LODGE_DATES.filter(([, l]) => lh.includes(l)).map(([k, l]) => [k, lv(r, l)])) }); }
    }
  }
  return applyMemberItems(items, mode);
}

// Κοινή εφαρμογή εισαγωγής μελών (Excel, ή το Μητρώο από τις ρυθμίσεις της παλιάς εφαρμογής στο Render)
export async function applyMemberItems(items, mode = 'merge') {
  if (!items.length) throw new Error('Δεν βρέθηκαν εγγραφές μελών.');
  const have = db.all('member_registry').length;
  if (mode === 'replace' && have > 20 && items.length < have * 0.8 && !confirmDo(`Το αρχείο έχει μόνο ${items.length} μέλη ενώ το Μητρώο έχει ${have}. Με «Γενική αντικατάσταση» θα χαθούν ${have - items.length} μέλη.\n\nΓια διορθώσεις μιας λίστας χρησιμοποιήστε «Προσθήκη / Συμπλήρωση» ή «Αντικατάσταση στοιχείων των μελών του αρχείου». Συνέχεια παρ' όλα αυτά;`)) throw new Error('Η γενική αντικατάσταση ακυρώθηκε.');
  let added = 0, updated = 0;
  await db.save(mode === 'replace' ? 'Μητρώο Μελών: γενική αντικατάσταση' : 'Μητρώο Μελών: εισαγωγή', (tx) => {
    added = updated = 0;
    if (mode === 'replace') {
      // Οι Αρ. Μητρώου διατηρούνται: ίδιος αριθμός, ίδιο Member_ID πηγής ή (μοναδικό) ίδιο ονοματεπώνυμο· οι νέοι παίρνουν τους επόμενους
      const old = tx.all('member_registry'), nk = (x) => `${fold(x.surname)}|${fold(x.first_name)}`, byName = {};
      for (const o of old) (byName[nk(o)] ||= []).push(o);
      const used = new Set();
      for (const { member: m } of items) {
        const o = (m.registry_no != null && old.find((x) => x.registry_no === m.registry_no)) || (m.source_member_id != null && old.find((x) => x.source_member_id === m.source_member_id))
          || ((byName[nk(m)] || []).length === 1 ? byName[nk(m)][0] : null);
        m.registry_no = o && !used.has(o.registry_no) ? o.registry_no : (m.registry_no != null && !old.some((x) => x.registry_no === m.registry_no) && !used.has(m.registry_no) ? m.registry_no : null);
        if (m.registry_no != null) used.add(m.registry_no);
        if (o && m.source_member_id == null) m.source_member_id = o.source_member_id ?? null;
        if (o && !String(m.diploma_no ?? '').trim()) m.diploma_no = o.diploma_no || ''; // το Δίπλωμα διατηρείται
      }
      let next = Math.max(REG_START - 1, ...old.map((x) => Number(x.registry_no) || 0), ...used) + 1;
      for (const { member: m } of items) if (m.registry_no == null) m.registry_no = next++;
      tx.replace('member_lodges', []); tx.replace('member_degrees_offices', []); tx.replace('member_registry', []);
    }
    for (const { id, member: m } of items) {
      if (mode === 'merge' || mode === 'add') {
        let mid = id && tx.get('member_registry', id) ? id : null;
        if (!mid && m.registry_no != null) mid = (tx.find('member_registry', (x) => x.registry_no === m.registry_no) || {}).id || null;
        if (!mid && m.source_member_id != null) mid = (tx.find('member_registry', (x) => x.source_member_id === m.source_member_id) || {}).id || null;
        if (!mid) mid = findMember(tx, m, true);
        if (mid) { if (mode === 'add') fillMember(tx, mid, m); else updateMember(tx, mid, m); updated++; continue; }
      }
      if (mode !== 'replace' && m.registry_no != null && tx.find('member_registry', (x) => x.registry_no === m.registry_no)) m.registry_no = null;
      insertMember(tx, m, mode === 'replace' && id ? id : undefined); added++;
    }
  });
  const lodges = items.reduce((s, x) => s + (x.member.lodges || []).length, 0), blocked = items.filter((x) => x.member.no_contact).length;
  return `${mode === 'replace' ? 'Γενική αντικατάσταση' : mode === 'add' ? 'Προσθήκη / συμπλήρωση' : 'Αντικατάσταση στοιχείων'} ολοκληρώθηκε: ${items.length} εγγραφές (${added} νέες, ${updated} ενημερωμένες), ${lodges} συμμετοχές σε Στοές, ${blocked} διαγραμμένα μέλη (απαγορεύεται η επικοινωνία).`;
}

// Εφάπαξ: σήμανση των ήδη καταχωρημένων διαγραμμένων μελών (σημείωση ΔΙΑΓΡΑΦΕΝ ή 1η Στοά «5. ΔΙΑΓΡΑΦΕΝ»)
db.migrate('members-no-contact-2026-10', (tx) => {
  const first = {};
  for (const l of sortBy(tx.all('member_lodges'), 'seq', 'id')) first[l.member_id] ??= l.member_status;
  for (const m of tx.all('member_registry')) {
    if (noContact(m) || !(/ΔΙΑΓΡΑΦ/.test(plainUpper(m.deregistered_note)) || /ΔΙΑΓΡΑΦ/.test(plainUpper(first[m.id])))) continue;
    tx.update('member_registry', m.id, { no_contact: 1, active: 0 });
  }
});
// Διόρθωση: όσοι σημειώθηκαν διαγραμμένοι ενώ είναι ακόμη μέλη σε άλλη Στοά → επιτρέπεται η επικοινωνία (μένει η κατάσταση ανά Στοά)
db.migrate('members-no-contact-all-lodges-2026-10', (tx) => {
  const st = {};
  for (const l of tx.all('member_lodges')) (st[l.member_id] ||= []).push(l.member_status);
  for (const m of tx.all('member_registry')) {
    const xs = (st[m.id] || []).filter((x) => String(x || '').trim());
    if (!noContact(m) || !xs.length || deregEverywhere(xs)) continue;
    const dead = xs.every((x) => /ΜΕΤΕΣΘ/.test(plainUpper(x)));
    tx.update('member_registry', m.id, { no_contact: 0, active: dead ? 0 : 1, deregistered_note: /^ΔΙΑΓΡΑΦΕΝ — απαγορεύεται/.test(m.deregistered_note || '') ? '' : m.deregistered_note || '' });
  }
});

// Συγχώνευση διπλών εγγραφών του ίδιου προσώπου σε μία (την κύρια): Στοές, email, κινητά, παραλλαγές ονόματος και
// όλες οι αναφορές (Επετηρίδα, Εκπρόσωποι, Ευχές, Έργα, Επιστολές, Διατάγματα) μεταφέρονται· οι υπόλοιπες εγγραφές διαγράφονται.
export function mergeMembers(tx, mainId, otherIds) {
  const main = tx.get('member_registry', mainId), others = otherIds.filter((i) => i !== mainId).map((i) => tx.get('member_registry', i)).filter(Boolean);
  if (!main || !others.length) return 0;
  const all = [main, ...others], uniq = (xs) => [...new Map(xs.map((x) => String(x || '').trim()).filter(Boolean).map((x) => [x.toLowerCase(), x])).values()];
  const emails = uniq(all.flatMap((m) => [m.email, ...String(m.other_emails || '').split(/[;,\s]+/)]));
  const mobiles = uniq(all.flatMap((m) => [m.mobile, ...String(m.other_mobiles || '').split(/[;,]/)])).filter((v, i, a) => a.findIndex((w) => digits10(w) === digits10(v)) === i);
  const vars = (k, vk) => { const base = plainUpper(main[k]); const vs = uniq(all.flatMap((m) => [m[k], ...String(m[vk] || '').split(';')])).filter((v) => plainUpper(v) !== base || v !== main[k]); return vs.filter((v) => plainUpper(v) !== base).join('; '); };
  const ids0 = new Set(all.map((m) => m.id)), sts = tx.all('member_lodges').filter((l) => ids0.has(l.member_id)).map((l) => l.member_status);
  const regs = all.map((m) => m.registry_no).filter((x) => x != null), blocked = sts.some((x) => String(x || '').trim()) ? deregEverywhere(sts) : all.some((m) => Number(m.no_contact) === 1);
  tx.update('member_registry', main.id, {
    email: main.email || emails[0] || '', other_emails: emails.filter((e) => e.toLowerCase() !== String(main.email || emails[0] || '').toLowerCase()).join('; '),
    mobile: main.mobile || mobiles[0] || '', other_mobiles: mobiles.filter((m) => digits10(m) !== digits10(main.mobile || mobiles[0] || '')).join('; '),
    surname_variants: vars('surname', 'surname_variants'), first_name_variants: vars('first_name', 'first_name_variants'),
    ...Object.fromEntries(MEMBER_DATES.map(([k]) => [k, main[k] || (all.find((m) => m[k]) || {})[k] || ''])),
    registry_no: main.registry_no ?? (regs.length ? Math.min(...regs) : null), diploma_no: main.diploma_no || (others.find((m) => m.diploma_no) || {}).diploma_no || '', degree: main.degree || (others.find((m) => m.degree) || {}).degree || '',
    no_contact: blocked ? 1 : 0, active: blocked ? 0 : all.some((m) => m.active !== 0) ? 1 : 0,
    merged_from: uniq([main.merged_from, ...others.map((m) => (regCode(m) ? `Αρ. Μητρώου ${regCode(m)}` : `#${m.id}`))]).join('; '),
  });
  const ids = new Set(others.map((m) => m.id)), have = new Set(tx.all('member_lodges').filter((l) => l.member_id === main.id).map((l) => lodgeNoKey(l.lodge_number) + '|' + l.member_status));
  let seq = Math.max(0, ...tx.all('member_lodges').filter((l) => l.member_id === main.id).map((l) => Number(l.seq) || 0));
  for (const l of tx.all('member_lodges').filter((l) => ids.has(l.member_id))) {
    const k = lodgeNoKey(l.lodge_number) + '|' + l.member_status;
    if (have.has(k)) tx.remove('member_lodges', l.id); else { have.add(k); tx.update('member_lodges', l.id, { member_id: main.id, seq: ++seq }); }
  }
  for (const [t, k] of [['member_degrees_offices', 'member_id'], ['epeteirida', 'member_id'], ['reps', 'member_id'], ['greetings_log', 'member_id'], ['project_members', 'member_id'], ['project_units', 'leader_member_id'], ['letters', 'recipient_member_id']]) {
    for (const x of tx.all(t)) if (ids.has(x[k])) tx.update(t, x.id, { [k]: main.id });
  }
  for (const d of tx.all('decree_documents')) {
    let a; try { a = JSON.parse(d.appointments || '[]'); } catch { continue; }
    if (a.some((x) => ids.has(Number(x.member_id)))) tx.update('decree_documents', d.id, { appointments: JSON.stringify(a.map((x) => (ids.has(Number(x.member_id)) ? { ...x, member_id: main.id } : x))) });
  }
  for (const m of others) tx.remove('member_registry', m.id);
  return others.length;
}

function duplicatesPage() {
  const groups = sameNameGroups(), byM = lodgesByMember(), sure = groups.filter((g) => g.sure), doubt = groups.filter((g) => !g.sure);
  const card = (g, gi) => `<div class="card dupgroup" data-g="${gi}"><h3 style="margin-top:0">${esc(g.members[0].surname)} ${esc(g.members[0].first_name)} <small class="muted">${g.members.length} εγγραφές</small></h3>
${table(['Κύρια', 'Μαζί', 'ID', 'Αρ. Μητρώου', 'Email', 'Κινητό', 'Στοές', 'Κατάσταση'], g.members.map((m) => [`<input type="radio" name="main${gi}" value="${m.id}"${m.id === g.main ? ' checked' : ''}>`,
  `<input type="checkbox" class="inc" value="${m.id}"${g.sure ? ' checked' : ''}>`, `<a href="#/members/${m.id}">${m.id}</a>`, esc(regCode(m) || '—'), esc([m.email, m.other_emails].filter(Boolean).join('; ') || '—'),
  esc([m.mobile, m.other_mobiles].filter(Boolean).join('; ') || '—'), esc((byM[m.id] || []).map((l) => `${l.lodge_name} ${l.lodge_number}`.trim()).join(', ') || '—'),
  noContact(m) ? '<span class="pill bad">⛔ Διαγραμμένος</span>' : m.active !== 0 ? 'Ενεργός' : 'Ανενεργός']))}
<div class="toolbar"><button class="btn primary" data-act="merge" data-g="${gi}">Συγχώνευση των επιλεγμένων σε μία εγγραφή</button></div></div>`;
  const all = [...sure, ...doubt];
  return {
    title: 'Διπλές εγγραφές μελών',
    html: `<p><a href="#/members">← Μητρώο Μελών</a></p><h1>Διπλές εγγραφές μελών</h1>
<div class="card"><p style="margin-top:0">Ένα πρόσωπο = μία εγγραφή στο Μητρώο. Εδώ εμφανίζονται μέλη με ίδιο ονοματεπώνυμο. Η συγχώνευση κρατά την «Κύρια» εγγραφή και μεταφέρει σε αυτή
Στοές, email, κινητά, αριθμούς μητρώου (ως σημείωση) και όλες τις αναφορές (Επετηρίδα, Εκπρόσωποι, Ευχές, Έργα, Επιστολές, Διατάγματα). Πριν από κάθε συγχώνευση κατεβαίνει Excel ασφαλείας.</p>
${sure.length ? `<button class="btn primary" data-act="mergeAll">Συγχώνευση όλων των σίγουρων (${sure.length} πρόσωπα, ${sure.reduce((s, g) => s + g.members.length - 1, 0)} διπλές εγγραφές)</button>` : '<b>Δεν υπάρχουν σίγουρες διπλές εγγραφές.</b>'}</div>
${sure.length ? `<h2>Σχεδόν σίγουρα το ίδιο πρόσωπο (${sure.length})</h2><p class="muted">Ίδιο ονοματεπώνυμο και όχι διαφορετικό κινητό.</p>${sure.map((g, i) => card(g, i)).join('')}` : ''}
${doubt.length ? `<h2>Ίδιο όνομα, διαφορετικό κινητό — ελέγξτε (${doubt.length})</h2><p class="muted">Μπορεί να είναι συνώνυμοι Αδελφοί· επιλέξτε «Μαζί» μόνο όσες εγγραφές είναι σίγουρα το ίδιο πρόσωπο.</p>${doubt.map((g, i) => card(g, sure.length + i)).join('')}` : ''}`,
    mount(el) {
      bind(el, {
        async merge(d) {
          const box = el.querySelector(`.dupgroup[data-g="${d.g}"]`), main = Number((box.querySelector('input[type=radio]:checked') || {}).value);
          const inc = [...box.querySelectorAll('.inc:checked')].map((i) => Number(i.value)).filter((i) => i !== main);
          if (!main || !inc.length) return toast('Επιλέξτε την κύρια εγγραφή και τουλάχιστον μία ακόμη στο «Μαζί».', 'error');
          if (!confirmDo(`Συγχώνευση ${inc.length + 1} εγγραφών σε μία (κύρια #${main}); Θα κατέβει πρώτα Excel ασφαλείας.`)) return;
          await exportMembers();
          await db.save(`Μητρώο: συγχώνευση διπλών εγγραφών #${main}`, (tx) => mergeMembers(tx, main, inc));
          flash('Οι εγγραφές συγχωνεύθηκαν.'); go('/members/duplicates');
        },
        async mergeAll() {
          if (!confirmDo(`Συγχώνευση ${sure.length} προσώπων (σίγουρες διπλές εγγραφές); Θα κατέβει πρώτα Excel ασφαλείας.`)) return;
          await exportMembers();
          let n = 0;
          await db.save(`Μητρώο: συγχώνευση ${sure.length} διπλών προσώπων`, (tx) => { n = 0; for (const g of sure) n += mergeMembers(tx, g.main, g.members.map((m) => m.id)); });
          flash(`Συγχωνεύθηκαν ${n} διπλές εγγραφές σε ${sure.length} πρόσωπα.`); go('/members/duplicates');
        },
      });
    },
  };
}

// Εφάπαξ: διαγραφή των σίγουρων διπλοεγγραφών (ίδιο ονοματεπώνυμο, χωρίς αντιφατικό κινητό) με συγχώνευση στην κύρια εγγραφή·
// πριν, αντίγραφο ασφαλείας του Μητρώου στα δεδομένα (files/backups/). Οι αμφίβολες (διαφορετικό κινητό) μένουν για έλεγχο.
db.migrate('merge-sure-duplicates-2026-10', (tx) => {
  const groups = sameNameGroups(tx).filter((g) => g.sure);
  if (!groups.length) return;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  tx.putFile(`backups/member_registry-before-merge-${stamp}.json`, new TextEncoder().encode(JSON.stringify({ member_registry: tx.all('member_registry'), member_lodges: tx.all('member_lodges') }, null, 1)));
  for (const g of groups) mergeMembers(tx, g.main, g.members.map((m) => m.id));
});

// Εφάπαξ: μία δεξαμενή — κάθε λίστα δείχνει στο μέλος (κύρια εγγραφή του προσώπου) και δεν κρατά αντίγραφα email/κινητών.
export function relinkToPool(tx) {
  const n = { linked: 0, copies: 0 };
  for (const r of tx.all('reps')) {
    const mid = r.member_id ? canonicalId(r.member_id, tx) : identify({ surname: r.surname, first_name: r.name, email: r.email, mobile: r.mobile }, tx);
    const P = mid ? person(mid, tx) : null, ch = {};
    if (mid && mid !== r.member_id) { ch.member_id = mid; n.linked++; }
    if (P && r.email && P.emails.some((e) => e.toLowerCase() === String(r.email).trim().toLowerCase())) ch.email = '';
    if (P && r.mobile && P.mobiles.some((m) => digits10(m) === digits10(r.mobile))) ch.mobile = '';
    if (/Άλλα email:/.test(r.notes || '')) ch.notes = String(r.notes).replace(/\s*·?\s*Άλλα email:[^·]*/g, '').trim();
    if ('email' in ch || 'mobile' in ch) n.copies++;
    if (Object.keys(ch).length) tx.update('reps', r.id, ch);
  }
  for (const o of tx.all('member_degrees_offices')) {
    const mid = o.member_id ? canonicalId(o.member_id, tx) : (o.full_name ? identify({ full_name: o.full_name }, tx) : null);
    if (mid && mid !== o.member_id) { tx.update('member_degrees_offices', o.id, { member_id: mid }); n.linked++; }
  }
  for (const [t, k] of [['greetings_log', 'member_id'], ['project_members', 'member_id'], ['project_units', 'leader_member_id'], ['letters', 'recipient_member_id']]) {
    for (const x of tx.all(t)) { const mid = x[k] && canonicalId(x[k], tx); if (mid && mid !== x[k]) { tx.update(t, x.id, { [k]: mid }); n.linked++; } }
  }
  return n;
}
db.migrate('people-single-source-2026-10', (tx) => { relinkToPool(tx); });

module({
  id: 'members',
  routes: {
    '/members': listPage,
    '/members/new': () => formPage(null),
    '/members/duplicates': duplicatesPage,
    '/members/small-lodges': smallLodgesPage,
    '/members/diplomas': diplomasPage,
    '/members/card': memberCardPage,
    '/members/diploma': diplomaIssuePage,
    '/members/deregistered': deregisteredPage,
    '/members/import': importPage,
    '/members/sgy': (ctx) => sgyRegistryPage(ctx), // κυκλική εισαγωγή: κλήση τη στιγμή της πλοήγησης
    '/members/diplomas/print': memberCardPage, // παλιός σύνδεσμος
    '/members/:id': ({ params }) => { const m = db.get('member_registry', params.id); return m ? formPage(m) : '<h1>Δεν βρέθηκε το μέλος</h1>'; },
  },
  tile: { order: 60, render: () => `<div class="dtile"><h3><a href="#/members">Μητρώο Μελών</a></h3><div class="big">${membersAll().filter((m) => m.active !== 0).length} ενεργά μέλη</div><small class="muted">${membersAll().filter(noContact).length} διαγραμμένα (⛔ χωρίς επικοινωνία)</small>
<div class="acts"><a class="btn primary" href="#/members">Αναζήτηση</a><a class="btn" href="#/epeteirida">Επετηρίδα</a></div></div>` },
});
