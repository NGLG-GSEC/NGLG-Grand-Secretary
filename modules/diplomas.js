// 🎓 Διπλώματα Διδασκάλου Τέκτονος (Certificate Master Mason) — μία σελίδα, πάνω στο Μητρώο Μελών (καμία ξεχωριστή λίστα):
//   Μέλη με Δίπλωμα (αναζήτηση ανά Αδελφό) · Ανά Στοά (πόσοι έχουν / δεν έχουν) · Εισαγωγή Excel · Πρότυπο Excel · Κάρτα Μέλους.
// (Το επίσημο Δίπλωμα Διδασκάλου Τέκτονος θα προστεθεί από το πρότυπο της Γραμματείας.)
// Ο αριθμός Διπλώματος είναι ο πραγματικός αριθμός μητρώου (MM…). Η εισαγωγή συμπληρώνει στην καρτέλα του μέλους:
// Δίπλωμα, Ημ. Εισδοχής (Μαθητής), Ημ. Διελεύσεως (Εταίρος), Ημ. Εγέρσεως (Διδάσκαλος), Στοά Εγέρσεως και αριθμό της.
import { db } from '../core/store.js';
import { go, flash, toast, table, bind } from '../core/app.js';
import { esc, fold, sortBy, readXlsx, parsePasted, exportXlsx, fmtDate } from '../core/util.js';
import { identify, regCode, matchesCode, nameCandidates } from '../core/people.js';
import { attachPicker, memberItems, noContact } from '../core/pickers.js';
import { regBadge, isAdmin, isoOf, lodgesByMember, exportBar, bindExport, lodgeNumberFor } from './members.js';
import { greeklish, mmLodgeOf } from './diploma.js';
import { lodgeNoKey, lodgesAll } from './lodges.js';
import { reportPaper, printPaper } from '../core/paper.js';

// Πεδία του Excel (και του προτύπου) → πεδία του Μητρώου
export const DIPLOMA_COLS = [
  ['name', 'Ονοματεπώνυμο'], ['diploma_no', 'Αρ. Διπλώματος'], ['date_ea', 'Ημ. Εισδοχής (Μαθητής)'], ['date_fc', 'Ημ. Διελεύσεως (Εταίρος)'],
  ['date_mm', 'Ημ. Εγέρσεως (Διδάσκαλος)'], ['mm_lodge_name', 'Στοά Εγέρσεως'], ['mm_lodge_number', 'Αρ. Στοάς Εγέρσεως'],
];
const FIELD_LABEL = { diploma_no: 'Δίπλωμα', date_ea: 'Μαθητής', date_fc: 'Εταίρος', date_mm: 'Διδάσκαλος', mm_lodge_name: 'Στοά Εγέρσεως', mm_lodge_number: 'Αρ. Στοάς', degree: 'Βαθμός' };
db.seed('diploma_issues', () => []);
const hasDip = (m) => !!String(m.diploma_no ?? '').trim();
const cleanNo = (v) => String(v ?? '').trim().replace(/^[MΜ]{2}\s*-?/i, '').replace(/\.0+$/, '').replace(/\s+/g, '');
const cell = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');
const codeKeyEq = (no, q) => String(no).replace(/\s/g, '') === String(q).replace(/^\s*[MΜ]{2}\s*/i, '').replace(/\s/g, '');

// Αναγνώριση στηλών (με σειρά: αριθμός Διπλώματος, Στοά, ονόματα, ημερομηνίες — ώστε «Αρ. Διπλώματος Διδασκάλου» να μη θεωρηθεί ημερομηνία)
function columns(h0) {
  const h = h0.map((x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()); // χωρίς τόνους
  const used = new Set(), find = (re) => { const i = h.findIndex((x, j) => !used.has(j) && re.test(x)); if (i >= 0) used.add(i); return i; };
  const c = {};
  c.no = find(/διπλωμ|diploma|certificate/); if (c.no < 0) c.no = find(/^αρ(ιθμος)?\.?\s*(μητρωου)?$|^no\.?$|^number$/);
  c.lodgeNo = find(/(αρ\.?|αριθμ).*στοα|lodge.?(no|number)/);
  c.lodge = find(/στοα|lodge/);
  c.name = find(/ονοματεπ|full.?name|^name$/); c.sur = find(/^επωνυμο|surname|last.?name/); c.first = find(/^ονομα$|first.?name/);
  c.ea = find(/εισδοχ|μυησ|μαθητ|initiat|entered/); c.fc = find(/διελευσ|διηλθε|εταιρ|passed|fellow/); c.mm = find(/εγερσ|ηγερθ|διδασκαλ|raised|master/);
  return c;
}
// ---- Παλιό «Μητρώο Διπλωμάτων» της Γραμματείας (ONOMA · ΗΜΕΡΑ · ΜΗΝΑΣ · ετος-εκ · Στοα · αριθ · ημερα2 · μηνας2 · ετος-εκ2 · ετος-εφ2 ·
// αρδιπ · name · mth · lodge · mth2 · ΠΑΡΑΛΑΒΗ · ΜΑΘΗΤΗς · εταιρος · διδασκαλος): ημερομηνία Εισδοχής σε ημέρα/μήνα/έτος, έκδοση, αριθμός «Ν/ΕΕΕΕ» ή «Ν»
const fk = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const MONTHS = ['ιαν', 'φεβ', 'μαρ', 'απρ', 'μαι', 'ιουν', 'ιουλ', 'αυγ', 'σεπ', 'οκτ', 'νοε', 'δεκ'];
const monthNo = (v) => { const s = fk(v); return MONTHS.findIndex((m) => s.startsWith(m)) + 1; };
const pad = (n) => String(n).padStart(2, '0');
const okIso = (x) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(x || ''); if (!m || +m[1] < 1950 || +m[1] > 2100) return ''; const d = new Date(`${x}T00:00:00Z`); return d.getUTCDate() === +m[3] && d.getUTCMonth() + 1 === +m[2] ? x : ''; };
const dateOf = (v) => okIso(isoOf(String(v ?? '').trim()));
const dateParts = (d, m, y) => { const dd = Number(String(d ?? '').trim()), mm = monthNo(m); let yy = Number(String(y ?? '').trim()); if (yy && yy < 100) yy += 2000; return dd && mm && yy ? okIso(`${yy}-${pad(mm)}-${pad(dd)}`) : ''; };
// Αριθμός Διπλώματος του παλιού Μητρώου: η συνεχής αρίθμηση (1/2011 … 980) → «Ν»· η παλιά σειρά 1990–2010 (π.χ. 1/2006, 53/2008) κρατά το έτος,
// ώστε να μη συγκρούεται με την ίδια αρίθμηση από το 2011
export function registerNo(raw) {
  const m = /^0*(\d+)(?:\s*\/\s*(\d{2,4}))?$/.exec(String(raw ?? '').trim());
  if (!m || !Number(m[1])) return '';
  let y = m[2] ? Number(m[2]) : 0; if (y && y < 100) y += 2000;
  return y >= 1990 && y <= 2010 ? `${Number(m[1])}/${y}` : String(Number(m[1]));
}
export function registerRows(rows) {
  const h = (rows[0] || []).map(fk), at = (re) => h.findIndex((x) => re.test(x));
  const iNo = at(/^αρδιπ$/), iM = at(/^μηνας$/);
  if (iNo < 0 || iM < 0) return null; // μόνο η μορφή του παλιού Μητρώου (στήλες «αρδιπ» και «ΜΗΝΑΣ»)
  const iD = at(/^ημερα$/), iY = at(/^ετος-εκ$/), iD2 = at(/^ημερα2$/), iM2 = at(/^μηνας2$/), iY2 = at(/^ετος-εκ2$/), iMth = at(/^mth$/), iLno = at(/^αριθ$/);
  const iEa = at(/^μαθητ/), iFc = at(/^εταιρ/), iMm = at(/^διδασκ/);
  const out = [];
  for (const r of rows.slice(1)) {
    const c = (i) => (i >= 0 ? String(r[i] ?? '').replace(/\s+/g, ' ').trim() : '');
    const name = c(0), no = registerNo(c(iNo));
    if (!name || !no) continue; // κενές θέσεις αρίθμησης ή «ΔΕΝ ΕΚΔΟΘΗΚΕ»
    // η επικεφαλίδα «Στοα» είναι μία θέση αριστερά: Στοά = η πρώτη μη αριθμητική τιμή μετά το έτος
    const lodge = [c(iY + 1), c(iY + 2)].find((x) => x && !/^\d+$/.test(x)) || '';
    let lno = c(iLno).replace(/\.0+$/, '');
    if (!lno || lno === '0') lno = lodgeNumberFor(lodge, '') || '';
    out.push({ name, diploma_no: no, register_no: c(iNo), issued_on: dateParts(c(iD2), c(iM2), c(iY2)) || dateOf(c(iMth)),
      date_ea: dateParts(c(iD), c(iM), c(iY)) || dateOf(c(iEa)), date_fc: dateOf(c(iFc)), date_mm: dateOf(c(iMm)),
      mm_lodge_name: lodge.replace(/^(σεβ\.?\s*)?(σ\.?\s*σ\.?\s*)?στο[αά]\s*/i, '').trim(), mm_lodge_number: lno, register: true });
  }
  return out;
}

// Γραμμές Excel/επικόλλησης → [{ name, diploma_no, date_ea, date_fc, date_mm, mm_lodge_name, mm_lodge_number }]
export function diplomaRows(rows) {
  const reg = rows.length ? registerRows(rows) : null;
  if (reg) return reg;
  const rs = rows.filter((r) => r.some((x) => String(x ?? '').trim())).map((r) => {
    const t = r.filter((x) => String(x ?? '').trim());
    const m = t.length === 1 && /^(.*?)[\s,;]+((?:[MΜ]{2}\s*-?)?\d+)\s*$/i.exec(String(t[0]).trim()); // «Ονοματεπώνυμο 12345»
    return m ? [m[1], m[2]] : r;
  });
  if (!rs.length) return [];
  const h = rs[0].map((x) => String(x ?? '').trim()), c = columns(h);
  if (c.no < 0 || (c.name < 0 && c.sur < 0)) { // χωρίς επικεφαλίδες: όνομα + αριθμός
    const iNo = rs[0].findIndex((x) => /^\s*([MΜ]{2}\s*-?)?\d+\s*$/i.test(String(x ?? '')));
    if (iNo < 0) return [];
    return rs.map((r) => ({ name: r.filter((_, i) => i !== iNo).map((x) => String(x ?? '').trim()).filter(Boolean).join(' '), diploma_no: cleanNo(r[iNo]) }))
      .filter((x) => x.name && /^\d+$/.test(x.diploma_no));
  }
  return rs.slice(1).map((r) => ({
    name: (c.name >= 0 ? cell(r, c.name) : `${cell(r, c.sur)} ${cell(r, c.first)}`).replace(/\s+/g, ' ').trim(), diploma_no: cleanNo(r[c.no]),
    date_ea: isoOf(cell(r, c.ea)), date_fc: isoOf(cell(r, c.fc)), date_mm: isoOf(cell(r, c.mm)),
    mm_lodge_name: cell(r, c.lodge).replace(/^(σεβ\.?\s*)?(σ\.?\s*σ\.?\s*)?στο[αά]\s*/i, '').replace(/^[«"]|[»"]$/g, '').trim(), mm_lodge_number: cell(r, c.lodgeNo).replace(/\.0+$/, ''),
  })).filter((x) => x.name && /^\d+$/.test(x.diploma_no));
}

// Ταύτιση γραμμής με μέλος (ποτέ νέα εγγραφή): ονοματεπώνυμο σε κάθε σειρά/κεφαλαία· σε συνωνυμία ξεχωρίζει η Στοά, η Ημ. Εισδοχής ή ο
// αριθμός Διπλώματος· λατινικά ονόματα με τη μεταγραφή του Μητρώου
let latinIdx = null;
function latinCandidates(name) {
  if (!/[a-z]/i.test(name) || /[Ͱ-Ͽἀ-῿]/.test(name)) return [];
  const key = (s) => String(s || '').toUpperCase().replace(/[^A-Z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!latinIdx || latinIdx.head !== db.head) {
    const map = new Map();
    for (const m of db.all('member_registry')) for (const x of [`${m.surname} ${m.first_name}`, `${m.first_name} ${m.surname}`]) { const k = key(/[Ͱ-Ͽ]/.test(x) ? greeklish(x) : x); (map.get(k) || map.set(k, []).get(k)).push(m.id); }
    latinIdx = { head: db.head, map };
  }
  return [...new Set(latinIdx.map.get(key(name)) || [])];
}
export function matchMember(it) {
  const id = identify({ full_name: it.name });
  if (id) return id;
  let cs = nameCandidates(it.name);
  if (!cs.length) cs = latinCandidates(it.name);
  if (cs.length <= 1) return cs[0] || null;
  const get = (c) => db.get('member_registry', c) || {}, ls = lodgesByMember(), no = lodgeNoKey(it.mm_lodge_number);
  for (const ok of [
    (c) => !!no && ((ls[c] || []).some((l) => lodgeNoKey(l.lodge_number) === no) || lodgeNoKey(get(c).mm_lodge_number) === no),
    (c) => !!it.date_ea && isoOf(get(c).date_ea) === it.date_ea,
    (c) => String(get(c).diploma_no ?? '').trim() === it.diploma_no]) {
    const f = cs.filter(ok); if (f.length === 1) return f[0];
  }
  return null;
}

// Σχέδιο εισαγωγής: για κάθε γραμμή το μέλος, οι συγκρούσεις και οι αλλαγές πεδίων
export function diplomaPlan(items, picks = {}) {
  const ms = db.all('member_registry'), byNo = new Map(ms.filter(hasDip).map((m) => [String(m.diploma_no).trim(), m]));
  const issued = new Set(db.all('diploma_issues').map((x) => String(x.diploma_no)));
  // Παλιό Μητρώο: ο ίδιος Αδελφός σε πολλές γραμμές (επανέκδοση) → το μέλος παίρνει τον αριθμό της νεότερης έκδοσης·
  // οι υπόλοιπες καταχωρίζονται μόνο στο Πρωτόκολλο· οι ημερομηνίες συμπληρώνονται από όποια γραμμή τις έχει
  const mids = items.map((it, i) => picks[i] || matchMember(it)), latest = new Map(), merged = new Map();
  const rank = (x) => `${x.issued_on || '0000'}|${x.diploma_no.includes('/') ? 0 : 1}|${String(Number.parseInt(x.diploma_no, 10)).padStart(6, '0')}`;
  items.forEach((it, i) => {
    const mid = mids[i]; if (!mid || !it.register) return;
    if (!latest.has(mid) || rank(it) > rank(items[latest.get(mid)])) latest.set(mid, i);
    const mg = merged.get(mid) || {};
    for (const k of ['date_ea', 'date_fc', 'date_mm', 'mm_lodge_name', 'mm_lodge_number']) if (!mg[k] && it[k]) mg[k] = it[k];
    merged.set(mid, mg);
  });
  const seenNo = new Map(), seenM = new Map();
  for (const it of items) seenNo.set(it.diploma_no, (seenNo.get(it.diploma_no) || 0) + 1);
  const rows = items.map((it0, i) => {
    const mid = mids[i], m = mid ? db.get('member_registry', mid) : null, owner = byNo.get(it0.diploma_no);
    const older = !!(it0.register && m && latest.get(m.id) !== i);
    const it = it0.register && m && !older ? { ...it0, ...Object.fromEntries(Object.entries(merged.get(m.id) || {}).filter(([k]) => !it0[k])) } : it0;
    const changes = [];
    if (m && !older) {
      for (const k of ['diploma_no', 'date_ea', 'date_fc', 'date_mm', 'mm_lodge_name', 'mm_lodge_number']) {
        const nv = String(it[k] ?? '').trim(), ov = String(k.startsWith('date_') ? isoOf(m[k]) : m[k] ?? '').trim();
        if (it.register && k.startsWith('mm_lodge') && ov) continue; // η Στοά Εγέρσεως του Μητρώου δεν αλλάζει από το παλιό Μητρώο (μόνο συμπληρώνεται)
        if (nv && nv !== ov) changes.push({ k, from: ov, to: nv });
      }
      if (!String(m.degree || '').trim()) changes.push({ k: 'degree', from: '', to: 'Διδάσκαλος' });
      seenM.set(m.id, (seenM.get(m.id) || 0) + 1);
    }
    const status = !m ? 'none' : seenNo.get(it.diploma_no) > 1 ? 'dupfile' : owner && owner.id !== m.id && !older ? 'taken'
      : older ? (issued.has(it.diploma_no) ? 'same' : 'older')
        : changes.length ? (changes.some((c) => c.from) ? 'fix' : 'set') : it.register && !issued.has(it.diploma_no) ? 'issue' : 'same';
    return { i, ...it, m, owner, changes, status, older, picked: !!picks[i] };
  });
  for (const r of rows) if (!r.register && r.m && seenM.get(r.m.id) > 1 && ['set', 'fix'].includes(r.status)) r.status = 'dupmember';
  return rows;
}
const STATUS = {
  older: ['', 'Παλαιότερη έκδοση — μόνο στο Πρωτόκολλο'], issue: ['ok', 'Καταχώριση στο Πρωτόκολλο'],
  set: ['ok', 'Θα συμπληρωθεί'], fix: ['warn', 'Θα ενημερωθεί (αλλαγή υπαρχόντων)'], same: ['', '✓ Ήδη πλήρες'], taken: ['bad', 'Ο αριθμός ανήκει σε άλλο μέλος'],
  dupfile: ['bad', 'Ο αριθμός υπάρχει δύο φορές στο αρχείο'], dupmember: ['bad', 'Το μέλος υπάρχει δύο φορές στο αρχείο'], none: ['warn', 'Δεν βρέθηκε — επιλέξτε μέλος'],
};
const applicable = (r) => ['set', 'fix', 'older', 'issue'].includes(r.status);
const showVal = (k, v) => (!v ? '—' : k === 'diploma_no' ? `MM${v}` : k.startsWith('date_') ? fmtDate(v) : v);

// Καταχώριση: στην καρτέλα του μέλους (αριθμός, ημερομηνίες, Στοά Εγέρσεως) και, για το παλιό Μητρώο, κάθε έκδοση στο Πρωτόκολλο
// Διπλωμάτων (diploma_issues, δεμένη στο μέλος). Με orphans: και οι γραμμές χωρίς μέλος, μόνο στο Πρωτόκολλο — ποτέ νέα μέλη.
export async function applyDiplomas(rows, { orphans = false } = {}) {
  const todo = rows.filter(applicable), lost = orphans ? rows.filter((r) => r.status === 'none' && r.register) : [];
  await db.save(`Διπλώματα Διδασκάλου: ${todo.length}${lost.length ? ` + ${lost.length} χωρίς μέλος` : ''}`, (tx) => {
    const have = new Set(tx.all('diploma_issues').map((x) => String(x.diploma_no)));
    const issue = (r, mid) => {
      if (have.has(r.diploma_no)) return; have.add(r.diploma_no);
      tx.insert('diploma_issues', { diploma_no: r.diploma_no, member_id: mid, register_name: r.name, issued_on: r.issued_on || '', date_ea: r.date_ea || '',
        lodge_name: r.mm_lodge_name || '', lodge_number: r.mm_lodge_number || '', source: 'Μητρώο Διπλωμάτων' });
    };
    for (const r of todo) {
      if (r.changes.length) {
        const other = tx.find('member_registry', (x) => String(x.diploma_no ?? '').trim() === r.diploma_no && x.id !== r.m.id);
        if (other) throw new Error(`Το Δίπλωμα ${r.diploma_no} ανήκει ήδη στο μέλος ${other.surname} ${other.first_name}.`);
        tx.update('member_registry', r.m.id, Object.fromEntries(r.changes.map((c) => [c.k, c.to])));
      }
      if (r.register) issue(r, r.m.id);
    }
    for (const r of lost) issue(r, null);
  });
  return todo.length;
}

// Ενεργά μέλη ανά Στοά (από τις Στοές κάθε μέλους στο Μητρώο): με / χωρίς Δίπλωμα
export function lodgeDiplomaStats() {
  const ms = new Map(db.all('member_registry').filter((m) => m.active !== 0 && !noContact(m)).map((m) => [m.id, m]));
  const by = new Map();
  for (const l of db.all('member_lodges')) {
    const m = ms.get(l.member_id), no = lodgeNoKey(l.lodge_number);
    if (!m || !no || /ΔΙΑΓΡΑΦ/i.test(String(l.member_status || '').normalize('NFD').replace(/[̀-ͯ]/g, ''))) continue;
    const x = by.get(no) || by.set(no, { no, name: l.lodge_name, ids: new Set() }).get(no);
    x.ids.add(m.id);
  }
  const reg = new Map(lodgesAll().map((l) => [lodgeNoKey(l.number), l]));
  return sortBy([...by.values()].map((x) => {
    const list = [...x.ids].map((id) => ms.get(id)), w = list.filter(hasDip).length;
    return { no: x.no, name: (reg.get(x.no) || {}).name || x.name, total: list.length, with: w, without: list.length - w };
  }), (x) => Number(x.no) || 1e6, 'no');
}

const lodgeLine = (m) => `${m.mm_lodge_name || ''} ${m.mm_lodge_number || ''}`.trim();
const TABS = [['protocol', '📖 Πρωτόκολλο Διπλωμάτων'], ['list', '🎓 Μέλη με Δίπλωμα'], ['lodges', '🏛 Ανά Στοά'], ['import', '⬆ Εισαγωγή Excel']];

export function diplomasPage({ query = {} } = {}) {
  const tab = TABS.some(([k]) => k === query.tab) ? query.tab : 'list';
  const ms = db.all('member_registry'), withD = ms.filter(hasDip), byM = lodgesByMember();
  const nav = `<nav class="decltabs">${TABS.map(([k, l]) => `<a class="btn${k === tab ? ' primary' : ''}" href="#/members/diplomas?tab=${k}">${l}</a>`).join('')}
<button type="button" class="btn" data-act="template">⬇ Πρότυπο Excel</button></nav>`;
  let body = '', pageMembers = null, protocolRows = null, lodgeFix = [];
  if (tab === 'protocol') {
    // 📖 Πρωτόκολλο Διπλωμάτων Διδασκάλων Τεκτόνων: κάθε έκδοση (από το παλιό Μητρώο Διπλωμάτων, δεμένη στο μέλος) και κάθε μέλος με αριθμό
    // Διπλώματος χωρίς καταχωρισμένη έκδοση — ονόματα, ημερομηνίες και Στοά από την καρτέλα του μέλους (καμία ξεχωριστή λίστα ονομάτων)
    const q = String(query.q || '').trim(), yr = String(query.year || '').trim();
    const iss = db.all('diploma_issues'), inIss = new Set(iss.map((x) => String(x.diploma_no)));
    let xs = [...iss.map((x) => ({ no: String(x.diploma_no), m: x.member_id ? db.get('member_registry', x.member_id) : null, x })),
      ...withD.filter((m) => !inIss.has(cleanNo(m.diploma_no))).map((m) => ({ no: cleanNo(m.diploma_no), m, x: null }))];
    const mmOf = (e) => (e.m ? isoOf(e.m.date_mm) : '');
    if (yr) xs = xs.filter((e) => String(mmOf(e)).startsWith(yr));
    if (q) xs = xs.filter((e) => (e.m && matchesCode(e.m, q)) || codeKeyEq(e.no, q) || fold(e.m ? `${e.m.surname} ${e.m.first_name} ${e.m.first_name} ${e.m.surname} ${lodgeLine(e.m)}` : `${e.x.register_name} ${e.x.lodge_name}`).includes(fold(q)));
    // σειρά: η παλιά σειρά «Ν/ΕΕΕΕ» πρώτα (κατά έτος), μετά η συνεχής αρίθμηση
    xs = sortBy(xs, (e) => (e.no.includes('/') ? Number(e.no.split('/')[1]) * 1e4 + Number.parseInt(e.no, 10) : 1e8 + (Number.parseInt(e.no, 10) || 0)));
    const years = [...new Set(withD.map((m) => String(isoOf(m.date_mm)).slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort().reverse();
    const row = (e, i) => { const m = e.m || {}, x = e.x || {};
      return [String(i + 1), `MM${e.no}`, m.registry_no != null && m.registry_no !== '' ? `M${m.registry_no}` : '', e.m ? `${m.surname || ''} ${m.first_name || ''}`.trim() : `${x.register_name || ''} (δεν βρέθηκε στο Μητρώο)`,
        fmtDate(isoOf(m.date_mm)) || String(m.date_mm || ''), e.m ? mmLodgeOf(m).name : x.lodge_name || '', e.m ? mmLodgeOf(m).number : String(x.lodge_number ?? ''), fmtDate(x.issued_on || '')]; };
    // Μέλη με Στοά Εγέρσεως χωρίς αριθμό, που ο κατάλογος Στοών τον δίνει (π.χ. Garibaldi → 13) — καταχώριση μόνο με επιβεβαίωση
    lodgeFix = withD.filter((m) => String(m.mm_lodge_name || '').trim() && !String(m.mm_lodge_number ?? '').trim()).map((m) => ({ m, no: mmLodgeOf(m).number })).filter((x) => x.no);
    const head = ['Α/Α', 'Αρ. Διπλώματος', 'Αρ. Μητρώου', 'Ονοματεπώνυμο', 'Ημ. Εγέρσεως (Διδάσκαλος)', 'Στοά Εγέρσεως', 'Αρ. Στοάς', 'Ημ. Έκδοσης'];
    protocolRows = { head, rows: xs.map(row), title: `ΠΡΩΤΟΚΟΛΛΟ ΔΙΠΛΩΜΑΤΩΝ ΔΙΔΑΣΚΑΛΩΝ ΤΕΚΤΟΝΩΝ${yr ? ' — ' + yr : ''}` };
    body = `<form class="card filters vfilters f3" id="dpp"><input name="q" value="${esc(q)}" placeholder="🔎 Αδελφός, MM αριθμός, Στοά…">
<select name="year"><option value="">Κάθε έτος Εγέρσεως</option>${years.map((y) => `<option${y === yr ? ' selected' : ''}>${y}</option>`).join('')}</select><button>Αναζήτηση</button></form>
<div class="toolbar"><span class="muted">${xs.length} Διπλώματα</span><button type="button" class="btn primary" data-act="protoPdf">🖨 PDF Πρωτοκόλλου</button><button type="button" class="btn" data-act="protoXlsx">⬇ Excel</button>${lodgeFix.length ? `<button type="button" class="btn" data-act="lodgeFix">🔗 Αρ. Στοάς Εγέρσεως από τον κατάλογο (${lodgeFix.length})</button>` : ''}</div>
<div class="memtable">${table(head.concat(['']), xs.map((e, i) => { const r = row(e, i); return [r[0], `<b class="official-number">${esc(r[1])}</b>`, esc(r[2]), e.m ? `<a href="#/members/${e.m.id}">${esc(r[3])}</a>` : `<span class="vwarn">${esc(r[3])}</span>`,
  r[4] ? esc(r[4]) : '<span class="vwarn">λείπει</span>', esc(r[5]) || '<span class="muted">—</span>', esc(r[6]), esc(r[7]), e.m ? `<a class="btn small" href="#/members/diploma?id=${e.m.id}">🎓 Δίπλωμα</a>` : '']; }), 'Δεν υπάρχουν Διπλώματα στο Μητρώο.')}</div>
<div class="print-area" id="dpPaper" hidden></div>`;
  } else if (tab === 'list') {
    const q = String(query.q || '').trim(), lno = String(query.lodge || '').trim(), yr = String(query.year || '').trim();
    const mode = ['without', 'all'].includes(query.mode) ? query.mode : 'with';
    let xs = mode === 'with' ? withD : mode === 'without' ? ms.filter((m) => !hasDip(m) && m.active !== 0 && !noContact(m)) : ms;
    if (lno) xs = xs.filter((m) => lodgeNoKey(m.mm_lodge_number) === lodgeNoKey(lno) || (byM[m.id] || []).some((l) => lodgeNoKey(l.lodge_number) === lodgeNoKey(lno)));
    if (yr) xs = xs.filter((m) => String(isoOf(m.date_mm)).startsWith(yr));
    if (q) xs = xs.filter((m) => matchesCode(m, q) || fold(`${m.surname} ${m.first_name} ${m.first_name} ${m.surname} ${lodgeLine(m)}`).includes(fold(q)));
    xs = sortBy(xs, (m) => (hasDip(m) ? Number(m.diploma_no) || 0 : 1e9), 'surname', 'first_name');
    pageMembers = xs;
    const years = [...new Set(withD.map((m) => String(isoOf(m.date_mm)).slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort().reverse();
    const printIds = xs.slice(0, 200).map((m) => m.id).join(',');
    body = `<form class="card filters vfilters" id="dpf"><input name="q" value="${esc(q)}" placeholder="🔎 Αδελφός, MM/M αριθμός, Στοά…">
<select name="mode"><option value="with"${mode === 'with' ? ' selected' : ''}>Με Δίπλωμα (${withD.length})</option><option value="without"${mode === 'without' ? ' selected' : ''}>Ενεργοί χωρίς Δίπλωμα</option><option value="all"${mode === 'all' ? ' selected' : ''}>Όλα τα μέλη</option></select>
<select name="lodge"><option value="">Όλες οι Στοές</option>${lodgesAll().map((l) => `<option value="${esc(l.number)}"${lno && lodgeNoKey(l.number) === lodgeNoKey(lno) ? ' selected' : ''}>${esc(l.number)} · ${esc(l.name)}</option>`).join('')}</select>
<select name="year"><option value="">Κάθε έτος Εγέρσεως</option>${years.map((y) => `<option${y === yr ? ' selected' : ''}>${y}</option>`).join('')}</select><button>Αναζήτηση</button></form>
<div class="toolbar"><span class="muted">${xs.length} μέλη</span>${exportBar()}<button type="button" class="btn small" data-act="exportList">⬇ Excel Διπλωμάτων</button>${printIds ? `<a class="btn small" href="#/members/card?ids=${printIds}">🪪 Κάρτες Μέλους της λίστας</a>` : ''}</div>
<div class="memtable">${table(['Αρ. Μητρώου', 'Ονοματεπώνυμο', 'Μαθητής', 'Εταίρος', 'Διδάσκαλος', 'Στοά Εγέρσεως', 'Στοές μέλους', ''], xs.slice(0, 500).map((m) => [regBadge(m),
  `<a href="#/members/${m.id}">${esc(m.surname)} ${esc(m.first_name)}</a>`, esc(fmtDate(isoOf(m.date_ea))), esc(fmtDate(isoOf(m.date_fc))), esc(fmtDate(isoOf(m.date_mm))), esc(lodgeLine(m)),
  `<small>${esc((byM[m.id] || []).map((l) => `${l.lodge_name} ${l.lodge_number}`.trim()).join(', '))}</small>`,
  `<a class="btn small" href="#/members/card?ids=${m.id}">🪪 Κάρτα Μέλους</a>`]), 'Δεν βρέθηκαν μέλη.')}</div>`;
  } else if (tab === 'lodges') {
    const st = lodgeDiplomaStats(), T = st.reduce((a, x) => ({ total: a.total + x.total, with: a.with + x.with }), { total: 0, with: 0 });
    body = `<div class="vstats"><span><b>${T.total}</b> ενεργές συμμετοχές μελών</span><span><b>${T.with}</b> με Δίπλωμα</span><span class="${T.total - T.with ? 'warn' : ''}"><b>${T.total - T.with}</b> χωρίς Δίπλωμα</span></div>
<div class="toolbar"><button type="button" class="btn small" data-act="exportLodges">⬇ Excel ανά Στοά</button></div>
${table(['Αρ.', 'Στοά', 'Ενεργά μέλη', 'Με Δίπλωμα', 'Χωρίς Δίπλωμα', ''], st.map((x) => [esc(x.no), `<b>${esc(x.name || '')}</b>`, x.total,
  `${x.with} <span class="bar"><i style="width:${x.total ? Math.round(100 * x.with / x.total) : 0}%"></i></span>`, x.without ? `<span class="vwarn">${x.without}</span>` : '<span class="vok">✓ 0</span>',
  `<a class="btn small" href="#/members/diplomas?tab=list&mode=all&lodge=${encodeURIComponent(x.no)}">Μέλη</a> ${x.without ? `<a class="btn small" href="#/members/diplomas?tab=list&mode=without&lodge=${encodeURIComponent(x.no)}">Χωρίς Δίπλωμα</a>` : ''}`]), 'Δεν υπάρχουν Στοές μελών στο Μητρώο.')}`;
  } else {
    body = isAdmin() ? `<div class="card"><h2 style="margin-top:0">Εισαγωγή Διπλωμάτων</h2>
<p class="muted">Excel με τις στήλες του <b>προτύπου</b> (⬇ Πρότυπο Excel): ${DIPLOMA_COLS.map(([, l]) => `<b>${esc(l)}</b>`).join(' · ')}.
Αναγνωρίζονται και «Επώνυμο» + «Όνομα». Συμπληρώνονται στην καρτέλα κάθε μέλους ο αριθμός Διπλώματος (Αρ. Μητρώου <span class="regno mm">MM…</span>),
οι ημερομηνίες Εισδοχής, Διελεύσεως, Εγέρσεως και η Στοά Εγέρσεως. Πριν την καταχώριση βλέπετε τι αλλάζει σε κάθε μέλος.</p>
<div class="toolbar"><label class="btn primary" style="cursor:pointer">⬆ Αρχείο Excel<input type="file" id="dpFile" accept=".xlsx,.xls,.csv" hidden></label></div>
<textarea id="dpPaste" class="short" placeholder="ή επικόλληση από Excel (με την πρώτη γραμμή επικεφαλίδων)"></textarea>
<div class="toolbar"><button type="button" class="btn" id="dpRead">Ανάγνωση επικόλλησης</button></div></div><div id="dpPlan"></div>`
      : '<div class="card nocontact">Η εισαγωγή Διπλωμάτων γίνεται μόνο από τον διαχειριστή.</div>';
  }
  return {
    title: 'Διπλώματα Διδασκάλου',
    html: `<p><a href="#/members">← Μητρώο Μελών</a></p><h1>🎓 Διπλώματα Διδασκάλου Τέκτονος <small class="muted">Certificate Master Mason</small></h1>
<p class="muted">Ο αριθμός Διπλώματος είναι ο <b>πραγματικός αριθμός μητρώου</b> (<span class="regno mm">MM12345</span>)· όσοι δεν έχουν κρατούν τον αριθμό τους με M (<span class="regno m">M1200</span>).</p>
<div class="vstats"><span><b>${withD.length}</b> με Δίπλωμα (MM)</span><span><b>${ms.length - withD.length}</b> χωρίς Δίπλωμα (M)</span></div>${nav}${body}`,
    mount(el) {
      if (pageMembers) bindExport(el, () => pageMembers, 'Διπλώματα Διδασκάλου');
      const fp = el.querySelector('#dpp');
      if (fp) fp.addEventListener('submit', (e) => { e.preventDefault(); go('/members/diplomas', { tab: 'protocol', ...Object.fromEntries(new FormData(fp)) }); });
      const f = el.querySelector('#dpf');
      if (f) f.addEventListener('submit', (e) => { e.preventDefault(); go('/members/diplomas', { tab: 'list', ...Object.fromEntries(new FormData(f)) }); });
      bind(el, {
        protoPdf() {
          const P = protocolRows, pa = el.querySelector('#dpPaper');
          pa.innerHTML = reportPaper(P.title, `Σύνολο: ${P.rows.length} Διπλώματα · ${new Date().toLocaleDateString('el-GR')}`,
            `<table><thead><tr>${P.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${P.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
          pa.hidden = false; printPaper('Protokollo_Diplomaton'); addEventListener('afterprint', () => { pa.hidden = true; }, { once: true });
        },
        async lodgeFix() {
          const list = lodgeFix.map((x) => `${x.m.surname} ${x.m.first_name}: ${x.m.mm_lodge_name} → Αρ. ${x.no}`).join('\n');
          if (!confirm(`Συμπλήρωση του αριθμού της Στοάς Εγέρσεως στην καρτέλα ${lodgeFix.length} μελών (από τον κατάλογο Στοών):\n\n${list.slice(0, 1500)}${list.length > 1500 ? '\n…' : ''}`)) return;
          await db.save(`Διπλώματα: Αρ. Στοάς Εγέρσεως από τον κατάλογο (${lodgeFix.length} μέλη)`, (tx) => { for (const x of lodgeFix) tx.update('member_registry', x.m.id, { mm_lodge_number: x.no }); });
          flash(`Συμπληρώθηκε ο αριθμός Στοάς Εγέρσεως σε ${lodgeFix.length} μέλη.`); go('/members/diplomas', { tab: 'protocol' });
        },
        protoXlsx: () => exportXlsx('Πρωτόκολλο Διπλωμάτων Διδασκάλων.xlsx', 'ΠΡΩΤΟΚΟΛΛΟ ΔΙΠΛΩΜΑΤΩΝ', protocolRows.head, protocolRows.rows, [6, 16, 12, 30, 22, 26, 10]),
        template: () => exportXlsx('Πρότυπο Διπλωμάτων Διδασκάλου.xlsx', 'ΔΙΠΛΩΜΑΤΑ', DIPLOMA_COLS.map(([, l]) => l),
          [['Παπαδόπουλος Ιωάννης', '12345', '2010-03-15', '2010-11-20', '2011-06-10', 'ΑΘΗΝΑ', '1']], [28, 16, 22, 22, 24, 22, 18]),
        exportList: () => exportXlsx('Διπλώματα Διδασκάλου.xlsx', 'ΔΙΠΛΩΜΑΤΑ', ['Αρ. Μητρώου', ...DIPLOMA_COLS.map(([, l]) => l)],
          sortBy(withD, (m) => Number(m.diploma_no) || 0).map((m) => [regCode(m), `${m.surname} ${m.first_name}`, m.diploma_no, isoOf(m.date_ea), isoOf(m.date_fc), isoOf(m.date_mm), m.mm_lodge_name || '', m.mm_lodge_number || '']), [14, 28, 16, 20, 20, 22, 22, 16]),
        exportLodges: () => exportXlsx('Διπλώματα ανά Στοά.xlsx', 'ΑΝΑ ΣΤΟΑ', ['Αρ. Στοάς', 'Στοά', 'Ενεργά μέλη', 'Με Δίπλωμα', 'Χωρίς Δίπλωμα'],
          lodgeDiplomaStats().map((x) => [x.no, x.name, x.total, x.with, x.without]), [10, 30, 14, 14, 16]),
      });
      const box = el.querySelector('#dpPlan');
      if (!box) return;
      let items = [], picks = {};
      const draw = () => {
        const rows = diplomaPlan(items, picks), n = rows.filter(applicable).length;
        box.innerHTML = !rows.length ? '<div class="card">Δεν βρέθηκαν γραμμές με όνομα και αριθμό Διπλώματος.</div>'
          : `<div class="vstats"><span><b>${rows.length}</b> γραμμές</span><span class="${n ? 'warn' : ''}"><b>${n}</b> προς καταχώριση</span><span><b>${rows.filter((r) => r.status === 'none').length}</b> χωρίς αντιστοίχιση</span><span><b>${rows.filter((r) => STATUS[r.status][0] === 'bad').length}</b> συγκρούσεις</span></div>
${table(['Από το αρχείο', 'Μέλος στο Μητρώο', 'Αλλαγές στην καρτέλα', 'Ενέργεια'], rows.map((r) => [`${esc(r.name)}<br><b>MM${esc(r.diploma_no)}</b>${r.register ? `<br><small class="muted">${[r.date_ea && 'Εισδοχή ' + fmtDate(r.date_ea), r.issued_on && 'έκδοση ' + fmtDate(r.issued_on), r.mm_lodge_name && `${r.mm_lodge_name} ${r.mm_lodge_number || ''}`.trim()].filter(Boolean).map(esc).join(' · ')}</small>` : ''}`,
  r.m ? `<a href="#/members/${r.m.id}">${esc(r.m.surname)} ${esc(r.m.first_name)}</a> ${regBadge(r.m)}${r.picked ? ' <small class="muted">(επιλογή)</small>' : ''}${r.status === 'taken' ? `<br><small class="vwarn">ο αριθμός ανήκει σε: ${esc(r.owner.surname)} ${esc(r.owner.first_name)}</small>` : ''}`
    : `<input class="dpPick" data-i="${r.i}" placeholder="🔎 Αναζήτηση μέλους…" autocomplete="off">`,
  r.changes.length ? `<small>${r.changes.map((c) => `${esc(FIELD_LABEL[c.k])}: ${c.from ? `<s>${esc(showVal(c.k, c.from))}</s> → ` : ''}<b>${esc(showVal(c.k, c.to))}</b>`).join('<br>')}</small>` : '—',
  `<span class="pill ${STATUS[r.status][0]}">${STATUS[r.status][1]}</span>`]))}
${rows.some((r) => r.register && r.status === 'none') ? `<label class="chk"><input type="checkbox" id="dpOrphans"> Καταχώριση στο Πρωτόκολλο και των ${rows.filter((r) => r.register && r.status === 'none').length} γραμμών χωρίς μέλος στο Μητρώο (δεν δημιουργούνται νέα μέλη)</label>` : ''}
<p><button type="button" class="btn primary" id="dpApply"${n ? '' : ' disabled'}>✔ Καταχώριση (${n} γραμμές)</button></p>`;
        box.querySelectorAll('.dpPick').forEach((inp) => attachPicker(inp, memberItems, (mm) => { picks[inp.dataset.i] = mm.id; draw(); }));
        const b = box.querySelector('#dpApply');
        if (b) b.addEventListener('click', async () => {
          b.disabled = true;
          try {
            const o = box.querySelector('#dpOrphans'), k = await applyDiplomas(rows, { orphans: !!(o && o.checked) });
            flash(`Καταχωρίστηκαν ${k} γραμμές Διπλωμάτων Διδασκάλου.`); go('/members/diplomas', { tab: items.some((x) => x.register) ? 'protocol' : 'list' });
          }
          catch (e) { toast(e.message || String(e), 'error'); b.disabled = false; }
        });
      };
      const load = (rows) => { items = diplomaRows(rows); picks = {}; draw(); };
      el.querySelector('#dpFile').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try { const sh = (await readXlsx(file)).find((s) => s.rows.length); load(sh ? sh.rows : []); } catch (err) { toast(err.message || String(err), 'error'); }
        e.target.value = '';
      });
      el.querySelector('#dpRead').addEventListener('click', () => load(parsePasted(el.querySelector('#dpPaste').value)));
    },
  };
}
