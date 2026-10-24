// 🏛 ΣΓΥ — Συμβούλιο Γενικών Υποθέσεων (Κανόνες 216–219). Ένας κατάλογος για όλη την εφαρμογή:
//   • εκ του αξιώματος (Κανών 216): αυτόματα από τα εν ενεργεία αξιώματα της Επετηρίδας/Διαταγμάτων (και οι Διατελέσαντες ΜΔ)
//   • διοριζόμενα (Κανών 217): αυτόματα από Διάταγμα «Μέλος Συμβουλίου Γενικών Υποθέσεων»
//   • εκλεγόμενα (Κανόνες 218–219) και κάθε άλλο μέλος: χειροκίνητα ή με ταυτοποίηση λίστας ονομάτων/email/κινητών στο Μητρώο
// Τα πρόσωπα είναι πάντα μέλη του ενιαίου Μητρώου (τίτλος, Επετηρίδα, Στοές, email, κινητό από την καρτέλα τους).
// Ο πίνακας sgy_members (ιδιωτικό αποθετήριο δεδομένων) κρατά μόνο τις προσθήκες/αλλαγές/εξαιρέσεις.
// Από εδώ: νέα Επιστολή προς ΣΓΥ (κατηγορία ΣΓΥ — Bcc όλα τα μέλη, πρωτόκολλο με το «Έτοιμο»), email και WhatsApp.
import { db } from '../core/store.js';
import { module, bind, go, flash, toast, confirmDo, table } from '../core/app.js';
import { esc, fold, sortBy, protocolGreenBtn } from '../core/util.js';
import { identify, canonicalId, regCode, digits10 } from '../core/people.js';
import { attachPicker, memberItems, noContact, titledName, memberLodges } from '../core/pickers.js';
import { precedenceOf } from './decree-catalog.js';
import { highestOfficeText, epeteiridaAll } from './epeteirida-table.js';
import { hasActiveList, isCurrentRecord } from './epeteirida-import.js';
import { masonicYear } from './visits.js';
import { greeklish } from './diploma.js';
import { exportBar, bindExport } from './members.js';

export const SGY_NAME = 'Συμβούλιο Γενικών Υποθέσεων';
export const SGY_TO_NAME = 'Προς τα Μέλη του Συμβουλίου Γενικών Υποθέσεων';
// Κανών 216: μέλη εκ του αξιώματος
export const EX_OFFICIO = ['Μέγας Διδάσκαλος', 'Αντικαταστάτης Μέγας Διδάσκαλος', 'Αναπληρωτής Μέγας Διδάσκαλος', 'Βοηθός Μέγας Διδάσκαλος',
  'Επαρχιακός Μέγας Διδάσκαλος', 'Περιφερειακός Μέγας Διδάσκαλος', 'Πρώτος Μέγας Επόπτης', 'Δεύτερος Μέγας Επόπτης',
  'Πρόεδρος του Συμβουλίου Γενικών Υποθέσεων', 'Μέγας Νομοφύλαξ', 'Μέγας Γραμματεύς', 'Μέγας Καγκελάριος', 'Μέγας Γραμματεύς Εκπαιδεύσεως',
  'Μέγας Θησαυροφύλαξ', 'Πρόεδρος του Μεγάλου Αγαθοεργού Σώματος', 'Μέγας Τελετάρχης', 'Μέγας Επίτροπος των Έργων', 'Μέγας Επιθεωρητής Περιοχής'];
const APPOINTED = 'Μέλος Συμβουλίου Γενικών Υποθέσεων';
export const SGY_BASIS = {
  '216': 'Κανών 216 — εκ του αξιώματος', '216m': 'Κανών 216 — Διατελέσας Μέγας Διδάσκαλος', '216p': 'Κανών 216 — Αμέσως Πρώην Πρόεδρος',
  '217': 'Κανών 217 — διοριζόμενο', '218': 'Κανόνες 218–219 — εκλεγόμενο', 'trans': 'Μεταβατική διάταξη Καν. 216', 'other': 'Άλλο',
};
const base = (o) => String(o || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
const roleOrder = (r) => { const b = base(r).replace(/^Πρώην /, ''); return r === 'Μέγας Διδάσκαλος' ? 0 : /^Πρώην Μέγας Διδάσκαλος/.test(r) ? 1.5 : precedenceOf(b) ?? (b === APPOINTED || /Μέλος/.test(r) ? 900 : 800); };

// Αυτόματα μέλη από αξιώματα (Διατάγματα/Επετηρίδα): { member_id, role, basis }
export function sgyAuto(src = db) {
  const act = hasActiveList(), y0 = Number(masonicYear().from.slice(0, 4)), out = new Map();
  const add = (mid, role, basis) => { const id = canonicalId(mid, src); if (!id) return; const c = out.get(id); if (!c || roleOrder(role) < roleOrder(c.role)) out.set(id, { member_id: id, role, basis, auto: true }); };
  for (const o of src.all('member_degrees_offices')) {
    if (!o.member_id) continue;
    const off = base(o.office);
    if (off === 'Πρώην Μέγας Διδάσκαλος') { add(o.member_id, off, '216m'); continue; }
    if (!isCurrentRecord(o, act, y0)) continue;
    if (EX_OFFICIO.includes(off)) add(o.member_id, off, '216');
    else if (off === APPOINTED) add(o.member_id, off, '217');
  }
  for (const r of epeteiridaAll()) { // ο Μέγας Διδάσκαλος και οι Διατελέσαντες από την Επετηρίδα
    if (!r.member_id) continue;
    if (Number(r.active) && /^Μέγας Διδάσκαλος$/.test(String(r.rank || '').trim())) add(r.member_id, 'Μέγας Διδάσκαλος', '216');
    if (/^Πρώην Μέγας Διδάσκαλος$/.test(String(r.rank || '').trim())) add(r.member_id, 'Πρώην Μέγας Διδάσκαλος', '216m');
  }
  return out;
}
// Κατάλογος θέσεων ΣΓΥ (sgy_roster): κατηγορία · ιδιότητα · μέλος του Μητρώου (ή μόνο όνομα / κενή θέση) · Επαρχία — όπως στο Παρουσιολόγιο.
// Όταν υπάρχει, είναι ο επίσημος κατάλογος· αλλιώς τα μέλη βγαίνουν αυτόματα από τα αξιώματα (Καν. 216/217).
export const sgyRoster = (src = db) => sortBy(src.all('sgy_roster'), (r) => Number(r.seq) || 0, 'id');
export const categoryBasis = (c) => (/αξιώματος/i.test(c) ? '216' : /διορισ/i.test(c) ? '217' : /αιρετ|εκλεγ/i.test(c) ? '218' : 'other');
const termOf = (c) => (String(c).match(/\d{4}\s*[-–]\s*\d{4}/) || [''])[0].replace(/\s+/g, '');
// Ο κατάλογος του ΣΓΥ: θέσεις του καταλόγου (ή αυτόματα από τα αξιώματα) + χειροκίνητα (που υπερισχύουν), χωρίς τις εξαιρέσεις
export function sgyMembers(src = db) {
  const roster = sgyRoster(src), map = new Map(), order = new Map();
  if (roster.length) roster.forEach((r, i) => {
    const id = r.member_id ? canonicalId(r.member_id, src) : null; if (!id) return;
    if (!order.has(id)) order.set(id, i);
    const c = map.get(id), role = r.role || (categoryBasis(r.category) === '218' ? 'Αιρετό Μέλος' : categoryBasis(r.category) === '217' ? 'Διορισμένο Μέλος' : 'Μέλος');
    if (c) { if (!c.role.includes(role)) c.role += ' · ' + role; return; }
    map.set(id, { member_id: id, role, basis: categoryBasis(r.category), category: r.category, province: r.province || '', term: termOf(r.category), roster: true });
  });
  else for (const [k, v] of sgyAuto(src)) map.set(k, v);
  for (const r of src.all('sgy_members')) {
    const id = canonicalId(r.member_id, src); if (!id) continue;
    if (Number(r.excluded)) { map.delete(id); continue; }
    const a = map.get(id) || {};
    map.set(id, a.roster ? { ...a, row_id: r.id } // ο κατάλογος θέσεων ορίζει ιδιότητα/Επαρχία
      : { ...a, member_id: id, role: r.role || a.role || 'Μέλος', basis: r.basis || a.basis || 'other', province: r.province || '', term: r.term || '', notes: r.notes || '', row_id: r.id, auto: !!a.auto });
  }
  if (roster.length) return sortBy([...map.values()].map((x) => ({ ...x, m: src.get('member_registry', x.member_id) })).filter((x) => x.m), (x) => (order.has(x.member_id) ? order.get(x.member_id) : 1e6), (x) => x.m.surname || '');
  return sortBy([...map.values()].map((x) => ({ ...x, m: src.get('member_registry', x.member_id) })).filter((x) => x.m),
    (x) => roleOrder(x.role), (x) => x.m.surname || '', (x) => x.m.first_name || '');
}
const usable = (x) => !noContact(x.m);
export const sgyEmails = () => [...new Set(sgyMembers().filter(usable).map((x) => String(x.m.email || '').trim().toLowerCase()).filter(Boolean))];
const waNo = (m) => { const d = digits10(m.mobile); return d.length === 10 ? '30' + d : ''; };
export const sgyLetterUrl = (tid) => `#/letters/new?category=ΣΓΥ&to_name=${encodeURIComponent(SGY_TO_NAME)}${tid ? `&template_id=${tid}` : ''}`;
export const sgyTemplates = () => sortBy(db.all('letter_templates').filter((t) => t.category === 'ΣΓΥ' && t.active !== 0), 'name');
// Επιστολές ΣΓΥ: οι ίδιες επιστολές του Αρχείου (κατηγορία ΣΓΥ), με αριθμό του ενιαίου Βιβλίου Πρωτοκόλλου (εξερχόμενα)
export const sgyLetters = () => sortBy(db.all('letters').filter((l) => l.category === 'ΣΓΥ'), (l) => -(l.protocol_seq || 0), (l) => -(l.id || 0));

// Πρότυπα ΣΓΥ (μία φορά· αλλάζουν από τα Πρότυπα)
const SGY_TEMPLATES = [
  { key: 'sgy-meeting', name: 'ΣΓΥ — Πρόσκληση σε Συνεδρίαση', subject: 'Πρόσκληση σε Συνεδρίαση του Συμβουλίου Γενικών Υποθέσεων',
    body: 'Αγαπητοί Αδελφοί,\n\nΣας προσκαλούμε στην Τακτική Συνεδρίαση του Συμβουλίου Γενικών Υποθέσεων, την …… και ώρα ……, στο Τεκτονικό Μέγαρο ……\n\nΘέματα Ημερησίας Διατάξεως:\n1. Επικύρωση Πρακτικών της προηγούμενης Συνεδρίασης.\n2. ……\n3. Τρέχοντα θέματα.\n\nΠαρακαλούμε για την παρουσία σας.' },
  { key: 'sgy-info', name: 'ΣΓΥ — Ενημέρωση Μελών', subject: 'Ενημέρωση προς τα Μέλη του Συμβουλίου Γενικών Υποθέσεων', body: 'Αγαπητοί Αδελφοί,\n\n……' },
];
db.migrate('sgy-templates-2026-10', (tx) => {
  for (const t of SGY_TEMPLATES) if (!tx.all('letter_templates').some((x) => x.key === t.key)) tx.insert('letter_templates', { ...t, category: 'ΣΓΥ', closing: 'Με αδελφική αγάπη,', active: 1 });
});

// Excel μελών ΣΓΥ (π.χ. «Name / Family Name / Given Name / E-mail 1 - Value» ή Επώνυμο / Όνομα / Email / Κινητό) → γραμμές «Όνομα Επώνυμο <email> κινητό».
// Με πολλά φύλλα κατάλογος είναι το τελευταίο (το νεότερο)· τα άλλα συμπληρώνουν μόνο email/κινητό που λείπουν.
export function sgyExcelLines(sheets) {
  const fk = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const lists = [];
  for (const { rows } of sheets) {
    const isHead = (c) => String(c).length < 40 && /e-?mail|ηλεκτρ/i.test(String(c)); // επικεφαλίδα, όχι κείμενο (π.χ. φύλλο καταγραφής)
    const hi = rows.findIndex((r) => r.some(isHead)); if (hi < 0) continue;
    const h = rows[hi].map((c) => fk(c));
    const col = (re) => h.findIndex((c) => c.length < 40 && re.test(c)), iE = col(/e-?mail|ηλεκτρ/), iS = col(/family|surname|last|^επωνυμο/), iF = col(/given|first|^ονομα$/), iN = col(/^name$|ονοματεπ/), iM = col(/mobile|κινητ|phone|τηλ/);
    if (iN < 0 && (iS < 0 || iF < 0)) continue;
    const xs = [], seen = new Set();
    for (const r of rows.slice(hi + 1)) {
      const g = (i) => (i >= 0 ? String(r[i] ?? '').trim() : ''), name = (g(iF) && g(iS) ? `${g(iF)} ${g(iS)}` : g(iN)).replace(/\s+/g, ' ');
      if (!name && !g(iE)) continue;
      const k = fk(name) || g(iE).toLowerCase(); if (seen.has(k)) continue; seen.add(k);
      xs.push({ k, name, email: g(iE), mobile: g(iM) });
    }
    if (xs.length) lists.push(xs);
  }
  if (!lists.length) return [];
  const base = lists[lists.length - 1], extra = new Map(lists.slice(0, -1).flat().map((x) => [x.k, x]));
  return base.map((x) => { const o = extra.get(x.k) || {}, email = x.email || o.email || '', mobile = x.mobile || o.mobile || '';
    return `${x.name}${email ? ` <${email}>` : ''}${mobile ? ' ' + mobile : ''}`; });
}
// Λατινικό «κλειδί» ονόματος για σύγκριση ελληνικών ↔ λατινικών (Αλμπάνης = Albanis, Μπενετάτος = Benetatos)
const latinKey = (v) => { const t = /[α-ωά-ώ]/i.test(v) ? greeklish(v) : String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  return t.replace(/[^A-Z]/g, '').replace(/MP/g, 'B').replace(/NT/g, 'D').replace(/G[KG]/g, 'G').replace(/KS/g, 'X').replace(/PH/g, 'F').replace(/OU/g, 'U')
    .replace(/(EI|OI|Y|H)/g, 'I').replace(/W/g, 'O').replace(/(.)\1/g, '$1'); };
// Ταυτοποίηση λίστας στο Μητρώο: μία γραμμή ανά Αδελφό ή λίστα παραληπτών email χωρισμένη με κόμματα («Όνομα <email>, email, …»).
// Πρώτα βέβαιη ταύτιση (email, κινητό, ονοματεπώνυμο)· αλλιώς «πιθανή» από το επώνυμο στο όνομα ή μέσα στο email (για έλεγχο).
export function matchList(text) {
  const entries = String(text || '').split(/\n/).flatMap((l) => ((l.match(/@/g) || []).length > 1 ? l.split(/[,;](?![^<]*>)/) : [l]))
    .map((l) => l.replace(/^[\s:;,]+|[\s,;]+$/g, '').trim()).filter(Boolean);
  const ms = db.all('member_registry').filter((m) => !noContact(m) && m.surname), bySur = new Map();
  for (const m of ms) { const k = latinKey(m.surname); if (k.length >= 4) (bySur.get(k) || bySur.set(k, []).get(k)).push(m); }
  const guess = (name, email) => {
    const toks = name.split(' ').map(latinKey).filter((k) => k.length >= 4);
    for (const t of toks) {
      let c = bySur.get(t) || [];
      if (c.length > 1) { const f = toks.filter((x) => x !== t); c = c.filter((m) => f.some((x) => latinKey(m.first_name).slice(0, 2) === x.slice(0, 2))); }
      if (c.length === 1) return c[0];
    }
    const local = latinKey(String(email).split('@')[0]);
    const hits = local.length >= 5 ? [...bySur.entries()].filter(([k]) => k.length >= 5 && local.includes(k)).flatMap(([, v]) => v) : [];
    return hits.length === 1 ? hits[0] : null;
  };
  return entries.map((line) => {
    const email = ((line.match(/[^\s<>,;"'()]+@[^\s<>,;"'()]+\.[a-z]{2,}/i) || [''])[0]).toLowerCase(), mob = digits10((line.match(/(?:\+?30)?\s*69\d[\d\s]{7,}/) || [''])[0]);
    const name = line.replace(/[^\s,;<>]+@[^\s,;<>]+/g, ' ').replace(/(?:\+?30)?\s*69\d[\d\s]{7,}/g, ' ').replace(/[<>,;:|\t"]+/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = name.split(' ');
    const id = identify({ email, mobile: mob, full_name: name }) || (parts.length >= 2 ? identify({ surname: parts[parts.length - 1], first_name: parts[0] }) : null);
    const g = id ? null : guess(name, email);
    return { line, name, email, mobile: mob, member_id: id ? canonicalId(id) : g ? canonicalId(g.id) : null, guess: !!g, first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] || '' };
  });
}

function sgyPage({ query = {} }, inRegistry = false) {
  const xs = sgyMembers(), emails = sgyEmails(), q = fold(query.q || '');
  const shown = q ? xs.filter((x) => fold(`${x.m.surname} ${x.m.first_name} ${x.role} ${x.m.email} ${regCode(x.m)}`).includes(q)) : xs;
  const rows = shown.map((x, i) => {
    const m = x.m, blocked = noContact(m), wa = waNo(m), ls = memberLodges(m.id).map((l) => `${l.lodge_name} ${l.lodge_number}`.trim()).filter(Boolean);
    return [`<b>${i + 1}</b>`,
      `<a href="#/members/${m.id}"><b>${esc(titledName(m))}</b></a><br><small class="muted">${esc(regCode(m) || '')}${ls.length ? ' · ' + esc(ls.join(', ')) : ''}</small>`,
      `<b>${esc(x.role)}</b><br><small class="muted">${esc(SGY_BASIS[x.basis] || x.basis || '')}${x.auto ? ' · αυτόματα' : ''}${x.province ? ' · ' + esc(x.province) : ''}${x.term ? ' · ' + esc(x.term) : ''}</small>`,
      `<small>${esc(highestOfficeText(m.id) || '—')}</small>`,
      blocked ? '⛔' : m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : '<span class="vwarn">χωρίς email</span>',
      blocked ? '⛔' : m.mobile ? esc(m.mobile) : '<span class="vwarn">χωρίς κινητό</span>',
      `${!blocked && wa ? `<a class="btn small wa-btn sgy-wa" target="_blank" rel="noopener" data-wa="${wa}" href="https://wa.me/${wa}">WhatsApp</a> ` : ''}<a class="btn small" href="#/members/card?ids=${m.id}">🪪</a> <button type="button" class="btn small danger" data-act="drop" data-id="${m.id}" title="Αφαίρεση από το ΣΓΥ">✕</button>`];
  });
  const back = inRegistry ? '<p><a href="#/members">← Μητρώο Μελών</a> · <a href="#/sgy">🏛 Ενότητα ΣΓΥ</a></p>' : '<p><a href="#/">← Αρχική</a> · <a href="#/members/sgy">Μητρώο Μελών ΣΓΥ</a></p>';
  return {
    title: inRegistry ? 'Μητρώο Μελών ΣΓΥ' : 'ΣΓΥ',
    html: `${back}<div class="hero"><div><h1>🏛 ${inRegistry ? 'Μητρώο Μελών ΣΓΥ' : 'ΣΓΥ — Συμβούλιο Γενικών Υποθέσεων'}</h1>
<p class="muted">${xs.length} μέλη · ${emails.length} με email · ${xs.filter((x) => waNo(x.m)).length} με κινητό. Εκ του αξιώματος (Καν. 216) και διοριζόμενα (Καν. 217) έρχονται αυτόματα από τα Διατάγματα και την Επετηρίδα· τα εκλεγόμενα (Καν. 218–219) προστίθενται εδώ.</p></div>
<div class="toolbar"><a class="btn primary" href="${sgyLetterUrl()}">✉ Νέα Επιστολή προς ΣΓΥ</a><a class="btn" href="#/sgy/attendance">📋 Παρουσιολόγιο</a><button type="button" class="btn" data-act="wa">💬 WhatsApp σε όλους</button>${protocolGreenBtn()}</div></div>
${sgyCards()}
<div class="card noprint" id="sgyWa" hidden><h3 style="margin-top:0">💬 Μήνυμα WhatsApp προς τα μέλη του ΣΓΥ</h3><textarea id="sgyWaText" rows="4">Αγαπητέ Αδελφέ,\n\n</textarea>
<p class="muted">Πατήστε ένα-ένα τα ονόματα: ανοίγει η συνομιλία με έτοιμο το μήνυμα (το WhatsApp δεν επιτρέπει μαζική αποστολή από σύνδεσμο).</p><div class="sgy-walist">${xs.filter((x) => usable(x) && waNo(x.m)).map((x) => `<a class="btn small wa-btn" target="_blank" rel="noopener" data-wa="${waNo(x.m)}" href="https://wa.me/${waNo(x.m)}">${esc(`${x.m.surname} ${x.m.first_name}`)}</a>`).join(' ')}</div></div>
<div class="toolbar noprint"><button type="button" class="btn small" data-act="copyEmails">📋 Αντιγραφή email (${emails.length})</button><button type="button" class="btn small" data-act="copyMobiles">📋 Αντιγραφή κινητών</button>
${exportBar()}<a class="btn small" href="mailto:?bcc=${encodeURIComponent(emails.join(','))}">✉ Email σε όλους (Bcc)</a><button type="button" class="btn small" data-act="xlsx">⬇ Excel ΣΓΥ (ιδιότητες)</button><button type="button" class="btn small" data-act="print">🖨 Εκτύπωση</button></div>
<form class="filters noprint" id="sgyFlt"><input name="q" value="${esc(query.q || '')}" placeholder="Αναζήτηση: όνομα, ιδιότητα, email, MM/M"><button>Αναζήτηση</button></form>
<div class="print-area">${table(['Α/Α', 'Ονοματεπώνυμο (Μητρώο)', 'Ιδιότητα στο ΣΓΥ', 'Επετηρίδα', 'Email', 'Κινητό', ''], rows, 'Δεν υπάρχουν μέλη ΣΓΥ — προσθέστε από κάτω.')}</div>
<details class="card fold noprint" open><summary><b>+ Προσθήκη μέλους ΣΓΥ</b></summary><div class="grid" style="margin-top:10px">
<div class="full"><label>🔎 Μέλος του Μητρώου</label><input id="sgyFind" placeholder="Επώνυμο, όνομα, MM/M, email ή κινητό" autocomplete="off"><input type="hidden" id="sgyMid"><small class="muted" id="sgyPicked"></small></div>
<div><label>Ιδιότητα στο ΣΓΥ</label><input id="sgyRole" value="Μέλος" list="sgyRoles"><datalist id="sgyRoles">${['Μέλος', 'Πρόεδρος', 'Αντιπρόεδρος', 'Αμέσως Πρώην Πρόεδρος', 'Γραμματεύς', 'Διοριζόμενο Μέλος', 'Εκλεγόμενο Μέλος', ...EX_OFFICIO].map((r) => `<option value="${esc(r)}">`).join('')}</datalist></div>
<div><label>Βάση</label><select id="sgyBasis">${Object.entries(SGY_BASIS).map(([k, v]) => `<option value="${k}"${k === '218' ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
<div><label>Επαρχία / Στοές Κέντρου</label><input id="sgyProv" placeholder="π.χ. Μακεδονίας ή Στοές Κέντρου"></div><div><label>Θητεία</label><input id="sgyTerm" placeholder="π.χ. 2026–2029"></div>
</div><div class="toolbar"><button type="button" class="btn primary" data-act="add">+ Προσθήκη στο ΣΓΥ</button></div></details>
<details class="card fold noprint"><summary><b>📥 Ταυτοποίηση λίστας ονομάτων / email / κινητών στο Μητρώο</b></summary>
<p class="muted">Επικολλήστε μία γραμμή ανά Αδελφό (όνομα, email ή κινητό — π.χ. από email προς το ΣΓΥ ή από ομάδα Επαφών Google). Η εφαρμογή βρίσκει ποιος είναι στο Μητρώο, με τίτλο, αξίωμα και στοιχεία· μετά «Προσθήκη».</p>
<label class="dz-file">⬆ ή Excel με τα μέλη (στήλες Ονοματεπώνυμο ή Επώνυμο/Όνομα, Email, Κινητό)<input type="file" id="sgyXlsx" accept=".xlsx,.xls,.csv"></label>
<textarea id="sgyList" rows="6" placeholder="Παπαδόπουλος Γεώργιος <g.papadopoulos@example.com>&#10;6944123456&#10;…"></textarea>
<div class="toolbar"><button type="button" class="btn" data-act="match">🔎 Ταυτοποίηση</button></div><div id="sgyMatch"></div></details>`,
    mount(el) {
      bindExport(el, () => xs.map((x) => x.m), 'Μέλη ΣΓΥ');
      bind(el, {
        wa() { const c = el.querySelector('#sgyWa'); c.hidden = !c.hidden; },
        async copyEmails() { await navigator.clipboard.writeText(emails.join(', ')).catch(() => {}); toast(`Αντιγράφηκαν ${emails.length} email.`); },
        async copyMobiles() { const ms = xs.filter(usable).map((x) => x.m.mobile).filter(Boolean); await navigator.clipboard.writeText(ms.join(', ')).catch(() => {}); toast(`Αντιγράφηκαν ${ms.length} κινητά.`); },
        print: () => window.print(),
        async xlsx() {
          const { exportXlsx } = await import('../core/util.js');
          exportXlsx('ΣΓΥ — Μέλη', 'ΣΓΥ', ['Α/Α', 'Επώνυμο', 'Όνομα', 'Τίτλος', 'Αρ. Μητρώου', 'Ιδιότητα στο ΣΓΥ', 'Βάση', 'Επετηρίδα', 'Email', 'Κινητό'],
            xs.map((x, i) => [i + 1, x.m.surname, x.m.first_name, titledName(x.m).replace(`${x.m.first_name} ${x.m.surname}`, '').trim(), regCode(x.m), x.role, SGY_BASIS[x.basis] || '', highestOfficeText(x.m.id), noContact(x.m) ? '' : x.m.email || '', noContact(x.m) ? '' : x.m.mobile || '']), [6, 18, 16, 14, 12, 28, 30, 30, 30, 16]);
        },
        async drop(ds) {
          const x = xs.find((y) => y.member_id === Number(ds.id)); if (!x) return;
          if (!confirmDo(`Αφαίρεση του ${titledName(x.m)} από το ΣΓΥ;${x.auto ? '\n\nΕίναι μέλος αυτόματα (από το αξίωμά του)· θα σημειωθεί ως εξαίρεση.' : ''}`)) return;
          await db.save(`ΣΓΥ: αφαίρεση ${x.m.surname}`, (tx) => {
            if (x.row_id) tx.remove('sgy_members', x.row_id);
            if (x.auto) tx.insert('sgy_members', { member_id: x.member_id, excluded: 1, role: '', basis: '', notes: 'Εξαίρεση' });
          });
          go(location.hash.slice(1).split('?')[0], query);
        },
        async add() {
          const mid = Number(el.querySelector('#sgyMid').value); if (!mid) { toast('Επιλέξτε μέλος του Μητρώου.', 'error'); return; }
          await addSgy([{ member_id: mid, role: el.querySelector('#sgyRole').value.trim() || 'Μέλος', basis: el.querySelector('#sgyBasis').value, province: el.querySelector('#sgyProv').value.trim(), term: el.querySelector('#sgyTerm').value.trim() }]);
          go(location.hash.slice(1).split('?')[0], query);
        },
        match() {
          const res = matchList(el.querySelector('#sgyList').value), have = new Set(xs.map((x) => x.member_id)), box = el.querySelector('#sgyMatch');
          const sure = res.filter((r) => r.member_id && !r.guess).length, maybe = res.filter((r) => r.guess).length, none = res.length - sure - maybe;
          box.innerHTML = `<p><b>${res.length}</b> γραμμές · <span class="vok">${sure} βέβαιες ταυτίσεις</span> · <span class="vwarn">${maybe} πιθανές</span> · ${none} δεν βρέθηκαν στο Μητρώο</p>` + table(['Γραμμή', 'Μέλος του Μητρώου', 'Τίτλος / Επετηρίδα', 'Email / Κινητό', ''], res.map((r, i) => {
            const m = r.member_id && db.get('member_registry', r.member_id), fill = m && r.email && !String(m.email || '').trim();
            return [esc(r.line), m ? `<b>${esc(titledName(m))}</b><br><small class="muted">${esc(regCode(m))}</small>` : '<span class="vwarn">Δεν βρέθηκε στο Μητρώο</span>', m ? `<small>${esc(highestOfficeText(m.id) || '—')}</small>` : '',
              m ? `<small>${esc(m.email || '—')}${fill ? ` <span class="pill ok">+ ${esc(r.email)}</span>` : ''}<br>${esc(m.mobile || '—')}</small>` : '',
              m ? (have.has(m.id) ? '<span class="vok">✓ ήδη στο ΣΓΥ</span>' : `${r.guess ? '<span class="vwarn">πιθανή ταύτιση — ελέγξτε</span><br>' : ''}<label class="chk"><input type="checkbox" data-mi="${i}"${r.guess ? '' : ' checked'}> προσθήκη</label>`)
                : r.last && r.first ? `<label class="chk"><input type="checkbox" data-new="${i}"> νέο μέλος στο Μητρώο + ΣΓΥ</label>` : ''];
          })) + `<div class="toolbar">${none ? '<button type="button" class="btn small" id="sgyAllNew">☑ Όλα τα «νέο μέλος»</button>' : ''}
<label class="chk"><input type="checkbox" id="sgyReplace"> Η λίστα είναι ο πλήρης κατάλογος: αφαίρεση από το ΣΓΥ όσων προστέθηκαν χειροκίνητα και δεν είναι στη λίστα</label>
<button type="button" class="btn primary" id="sgyAddAll">✔ Ενημέρωση ΣΓΥ</button></div><p class="muted">Συμπληρώνεται και το email στην καρτέλα του μέλους όπου λείπει. Τα μέλη εκ του αξιώματος (Καν. 216/217) μένουν πάντα.</p>`;
          const all = box.querySelector('#sgyAllNew'); if (all) all.addEventListener('click', () => box.querySelectorAll('[data-new]').forEach((c) => { c.checked = true; }));
          box.querySelector('#sgyAddAll').addEventListener('click', async () => {
            const pick = [...box.querySelectorAll('[data-mi]:checked')].map((c) => res[+c.dataset.mi]), fresh = [...box.querySelectorAll('[data-new]:checked')].map((c) => res[+c.dataset.new]);
            const n = await applySgyList({ pick, fresh, all: res.filter((r) => r.member_id && !r.guess).concat(pick), replace: box.querySelector('#sgyReplace').checked });
            flash(`ΣΓΥ: ${n.added} προστέθηκαν${n.created ? `, ${n.created} νέα μέλη στο Μητρώο` : ''}${n.emails ? `, ${n.emails} email συμπληρώθηκαν` : ''}${n.removed ? `, ${n.removed} αφαιρέθηκαν` : ''}.`);
            go(location.hash.slice(1).split('?')[0], query);
          });
        },
      });
      el.querySelector('#sgyXlsx').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { const { readXlsx } = await import('../core/util.js'); const lines = sgyExcelLines(await readXlsx(f));
          if (!lines.length) throw new Error('Δεν βρέθηκε στήλη Email στο Excel.');
          el.querySelector('#sgyList').value = lines.join('\n'); el.querySelector('[data-act=match]').click(); }
        catch (err) { toast(err.message || String(err), 'error'); }
      });
      el.querySelector('#sgyWaText').addEventListener('input', (e) => { for (const a of el.querySelectorAll('[data-wa]')) a.href = `https://wa.me/${a.dataset.wa}?text=${encodeURIComponent(e.target.value)}`; });
      attachPicker(el.querySelector('#sgyFind'), (q2) => memberItems(q2), (m) => { el.querySelector('#sgyMid').value = m.id; el.querySelector('#sgyPicked').textContent = `✓ ${titledName(m)} ${regCode(m)} — ${highestOfficeText(m.id) || ''}`; });
      el.querySelector('#sgyFlt').addEventListener('submit', (e) => { e.preventDefault(); go(location.hash.slice(1).split('?')[0], { q: e.target.q.value }); });
    },
  };
}
// Ενημέρωση ΣΓΥ από λίστα/Excel: προσθήκη επιλεγμένων, νέα μέλη στο Μητρώο, email όπου λείπει, προαιρετική αφαίρεση όσων δεν είναι στη λίστα
export async function applySgyList({ pick = [], fresh = [], all = [], replace = false }) {
  const n = { added: 0, created: 0, emails: 0, removed: 0 }, { insertMember } = await import('./members.js');
  const keep = new Set(all.map((r) => canonicalId(r.member_id)));
  await db.save(`ΣΓΥ: ενημέρωση από λίστα (${pick.length + fresh.length})`, (tx) => {
    const put = (mid) => { tx.remove('sgy_members', (r) => canonicalId(r.member_id) === canonicalId(mid)); tx.insert('sgy_members', { member_id: mid, role: 'Μέλος', basis: '218', province: '', term: '', notes: '', excluded: 0 }); n.added++; keep.add(canonicalId(mid)); };
    for (const r of pick) {
      const m = tx.get('member_registry', r.member_id); if (!m) continue;
      if (r.email && !String(m.email || '').trim()) { tx.update('member_registry', m.id, { email: r.email }); n.emails++; }
      put(m.id);
    }
    for (const r of fresh) { const id = insertMember(tx, { surname: r.last, first_name: r.first, email: r.email, mobile: r.mobile || '' }); n.created++; put(id); }
    if (replace) for (const r of tx.all('sgy_members')) if (!Number(r.excluded) && !keep.has(canonicalId(r.member_id))) { tx.remove('sgy_members', r.id); n.removed++; }
  });
  return n;
}
export async function addSgy(items) {
  if (!items.length) return 0;
  await db.save(`ΣΓΥ: προσθήκη ${items.length}`, (tx) => {
    for (const it of items) {
      tx.remove('sgy_members', (r) => canonicalId(r.member_id) === canonicalId(it.member_id));
      tx.insert('sgy_members', { member_id: it.member_id, role: it.role || 'Μέλος', basis: it.basis || 'other', province: it.province || '', term: it.term || '', notes: '', excluded: 0 });
    }
  });
  flash(`Προστέθηκαν ${items.length} μέλη στο ΣΓΥ.`);
  return items.length;
}
export const sgyRegistryPage = (ctx) => sgyPage(ctx, true);

// Πρότυπα ΣΓΥ και Επιστολές ΣΓΥ (με Αρ. Πρωτ.) — στη σελίδα ΣΓΥ
function sgyCards() {
  const ts = sgyTemplates(), ls = sgyLetters().slice(0, 8);
  return `<div class="cols2 noprint"><div class="card"><h3 style="margin-top:0">📄 Πρότυπα ΣΓΥ</h3>${ts.length ? ts.map((t) => `<a class="btn small" href="${sgyLetterUrl(t.id)}">✉ ${esc(t.name.replace(/^ΣΓΥ\s*—\s*/, ''))}</a>`).join(' ') : '<p class="muted">Κανένα πρότυπο.</p>'}
<p class="muted" style="margin:8px 0 0">Η επιστολή παίρνει <b>Αρ. Πρωτοκόλλου</b> (ενιαίο Βιβλίο — εξερχόμενα) με το «Έτοιμο» και στέλνεται από την εφαρμογή σε όλα τα μέλη (Bcc). <a href="#/templates?category=ΣΓΥ">Διαχείριση προτύπων ΣΓΥ</a></p></div>
<div class="card"><h3 style="margin-top:0">✉ Επιστολές ΣΓΥ <a class="btn small" href="#/letters?category=ΣΓΥ">Όλες</a></h3>${ls.length ? `<ul class="sgy-letters">${ls.map((l) => `<li><a href="#/letters/${l.id}"><b>${esc(l.protocol_no || 'Πρόχειρη')}</b> — ${esc(l.subject || '')}</a></li>`).join('')}</ul>` : '<p class="muted">Δεν έχουν σταλεί ακόμη επιστολές ΣΓΥ.</p>'}</div></div>`;
}

module({
  id: 'sgy', routes: { '/sgy': (ctx) => sgyPage(ctx, false) },
  tile: { order: 15, render: () => {
    const xs = sgyMembers(), ls = sgyLetters(), last = ls.find((l) => l.protocol_no);
    return `<div class="dtile gold"><h3><a href="#/sgy">🏛 ΣΓΥ</a></h3><div class="big">${xs.length} <small>μέλη</small></div><div class="muted">${sgyEmails().length} με email${last ? ` · Τελευταία: ${esc(last.protocol_no)}` : ''}</div>
<div class="acts"><a class="btn primary" href="${sgyLetterUrl()}">+ Επιστολή ΣΓΥ</a><a class="btn" href="#/sgy">Μέλη</a><a class="btn" href="#/sgy/attendance">Παρουσιολόγιο</a><a class="btn" href="#/letters?category=ΣΓΥ">Επιστολές</a><a class="btn" href="#/templates?category=ΣΓΥ">Πρότυπα</a></div></div>`;
  } },
});
