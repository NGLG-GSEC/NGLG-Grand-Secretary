// Επετηρίδα — εισαγωγή του καταλόγου Μεγάλων Αξιωματικών (Ονοματεπώνυμο, Βαθμός, Διάταγμα, Έτος, Εν Ενεργεία).
// Αναγνωρίζει τις συντομογραφίες (ΠρΑΜΔιακ, ΠρΒ'ΜΕπ, ΕπΜΔ Πειραιώς, Μεγ.Οργ. …) και συνδέει κάθε όνομα με το Μητρώο Μελών.
import { db } from '../core/store.js';
import { foldName, parsePasted, fold } from '../core/util.js';
import { RANK_OFFICES } from './decree-catalog.js';

const LAT = 'ABEZHIKMNOPTXY', GRK = 'ΑΒΕΖΗΙΚΜΝΟΡΤΧΥ';
const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/[A-Z]/g, (c) => (LAT.includes(c) ? GRK[LAT.indexOf(c)] : c)).replace(/[^Α-Ω]/g, '');

const EXACT = new Map(RANK_OFFICES.flatMap((o) => [[norm(o), o], [norm('Πρώην ' + o), 'Πρώην ' + o], [norm(o.replace(' του ', ' ')), o]]));
// Συντομογραφία → { office, former, note }· null αν δεν αναγνωρίζεται.
export function parseRank(text, allowFormer = true) {
  const exact = EXACT.get(norm(String(text || '').replace(/\(?\s*\d+\s*\/\s*\d{4}\s*\)?/g, '').replace(/^(Ο|Οι)\s+/, '')));
  if (exact && (allowFormer || !/^Πρώην /.test(exact))) return { office: exact, former: /^Πρώην /.test(exact), note: '' };
  const raw = String(text || '').replace(/\(?\s*\d+\s*\/\s*\d{4}\s*\)?/g, ' ').trim();
  let r = norm(raw), former = false;
  if (!r) return null;
  if (allowFormer) {
    if (/^ΠΡ(?!ΟΕΔΡ|ΟΣΑΓ)/.test(r)) { former = true; r = r.slice(2); }
    else if (/^Π(?=ΕΠ|ΑΝ|Μ)/.test(r)) { former = true; r = r.slice(1); }
  }
  r = r.replace(/^(ΠΡ)?ΔΕΥΤΕΡΟΣ/, '$1Β').replace(/^(ΠΡ)?ΠΡΩΤΟΣ/, '$1Α');
  const before = (k) => r.split(k)[0];
  let office = null, note = '';
  const md = /^(.*?)Μ(?:ΕΓ)?Δ(?:ΙΔ)?(?!ΙΑΚ)(.*)$/.exec(r) || /^(.*?)ΜΕΓΑΣΔΙΔΑΣΚΑΛΟΣ(.*)$/.exec(r);
  if (/ΔΙΑΚ/.test(r)) office = (/Β/.test(before('ΔΙΑΚ')) ? 'Δεύτερος' : 'Πρώτος') + ' Μέγας Διάκονος';
  else if (/ΕΠΙΘ/.test(r)) { office = 'Μέγας Επιθεωρητής Περιοχής'; note = raw; }
  else if (/ΕΡΓ|ΕΠΕΡ$/.test(r)) office = 'Μέγας Επίτροπος των Έργων';
  else if (/(ΕΠ|ΕΠΟΠΤΗΣ)$/.test(r)) office = (/Β/.test(r.replace(/ΕΠ(ΟΠΤΗΣ)?$/, '')) ? 'Δεύτερος' : 'Πρώτος') + ' Μέγας Επόπτης';
  else if (/ΓΡ/.test(r)) office = /ΕΚΠ/.test(r) ? 'Μέγας Γραμματεύς Εκπαιδεύσεως' : /^(ΒΘ|ΒΟΗΘ|Β(?=Μ))/.test(r) ? 'Βοηθός Μέγας Γραμματεύς' : /^ΑΝ/.test(r) ? 'Αναπληρωτής Μέγας Γραμματεύς' : 'Μέγας Γραμματεύς';
  else if (/ΚΑΓΚ/.test(r)) office = /^(ΒΘ|ΒΟΗΘ)/.test(r) ? 'Βοηθός Μέγας Καγκελάριος' : /^ΑΝ/.test(r) ? 'Αναπληρωτής Μέγας Καγκελάριος' : 'Μέγας Καγκελάριος';
  else if (/ΤΕΛ/.test(r)) office = /^ΑΝ/.test(r) ? 'Αναπληρωτής Μέγας Τελετάρχης' : 'Μέγας Τελετάρχης';
  else if (/ΜΑΣ$|ΑΓΑΘ/.test(r)) office = 'Πρόεδρος του Μεγάλου Αγαθοεργού Σώματος';
  else if (/ΣΓΥ|ΓΕΝΙΚ/.test(r)) office = 'Πρόεδρος του Συμβουλίου Γενικών Υποθέσεων';
  else if (/ΔΙΑΣ/.test(r)) office = 'Μέγας Έφορος επί των Διασήμων';
  else if (/ΣΗΜ/.test(r)) office = 'Μέγας Σημαιοφόρος';
  else if (/ΞΙΦ/.test(r)) office = 'Μέγας Ξιφοφόρος';
  else if (/ΕΥΧ/.test(r)) office = 'Μέγας Ευχέτης';
  else if (/ΟΡΓ/.test(r)) office = 'Μέγας Οργανιστής';
  else if (/ΣΤΕΓ/.test(r)) office = 'Μέγας Στεγαστής';
  else if (/ΜΟΥΣ|ΒΙΒΛ/.test(r)) office = 'Μέγας Έφορος Βιβλιοθήκης και Μουσείου';
  else if (/ΝΟΜ/.test(r)) office = 'Μέγας Νομοφύλαξ';
  else if (/ΘΗΣ/.test(r)) office = 'Μέγας Θησαυροφύλαξ';
  else if (/ΠΡΟΣ/.test(r)) office = 'Μέγας Προσαγωγεύς';
  else if (md) {
    const pre = md[1];
    office = /^ΠΕΡΙΦ/.test(pre) ? 'Περιφερειακός Μέγας Διδάσκαλος' : /^ΕΠ/.test(pre) ? (/ΑΝΤΙΚ/.test(pre) ? 'Αντικαταστάτης Επαρχιακός Μέγας Διδάσκαλος' : 'Επαρχιακός Μέγας Διδάσκαλος')
      : /^ΑΝΤΙΚ/.test(pre) ? 'Αντικαταστάτης Μέγας Διδάσκαλος' : /^ΑΝ/.test(pre) ? 'Αναπληρωτής Μέγας Διδάσκαλος' : /^(ΒΘ|ΒΟΗΘ)/.test(pre) ? 'Βοηθός Μέγας Διδάσκαλος' : pre ? null : 'Μέγας Διδάσκαλος';
    if (office && md[2]) note = raw.replace(/^.*?Μ\.?\s?Δ(ιδ)?\.?\s*/, '').trim() || raw;
  }
  return office ? { office: (former ? 'Πρώην ' : '') + office, former, note } : null;
}

// «Ααρών Μάρκος», «Κωνσταντινίδης Κων/νος», «Chris Jones» → μέλος του Μητρώου (μοναδική ταύτιση) ή null
const FIRST = { 'κω/νοσ': 'κωνσταντινοσ', 'κων/νοσ': 'κωνσταντινοσ', 'κωσταντινοσ': 'κωνσταντινοσ' };
const nk = (v) => foldName(v).replace(/[^a-zα-ω/ ]/g, ' ').replace(/\s+/g, ' ').trim();
function nameIndex() {
  const idx = new Map();
  const add = (k, id) => { if (!k) return; const s = idx.get(k) || new Set(); s.add(id); idx.set(k, s); };
  for (const m of db.all('member_registry')) {
    const sns = [m.surname, ...String(m.surname_variants || '').split(';')].map(nk).filter(Boolean);
    const fns = [m.first_name, ...String(m.first_name_variants || '').split(';')].map(nk).filter(Boolean);
    for (const s of sns) for (const f of fns) { add(`${s}|${f}`, m.id); add(`${s}|${f.split(' ')[0]}`, m.id); }
  }
  return idx;
}
export function matchName(full, idx = nameIndex()) {
  const clean = nk(String(full || '').replace(/\(.*?\)/g, ' ').replace(/\s+του\s+\S+\s*$/i, ' ').replace(/\s*-\s*/g, '-'));
  const t = clean.split(' ').filter(Boolean).map((w) => FIRST[w] || w);
  const hits = new Set();
  for (let k = 1; k < t.length; k++) {
    for (const [s, f] of [[t.slice(0, k).join(' '), t.slice(k).join(' ')], [t.slice(k).join(' '), t.slice(0, k).join(' ')]]) {
      for (const id of idx.get(`${s}|${f}`) || []) hits.add(id);
      for (const id of idx.get(`${s}|${f.split(' ')[0]}`) || []) hits.add(id);
    }
    if (hits.size) break;
  }
  return hits.size === 1 ? [...hits][0] : null;
}

const decRe = /(\d+)\s*\/\s*(\d{4})/;
// Επικόλληση από Excel → εγγραφές Επετηρίδας. Αντικαθιστά όσες είχαν έρθει από προηγούμενη εισαγωγή.
export async function importEpeteirida(text) {
  const rows = Array.isArray(text) ? text.map((r) => [...r]) : parsePasted(text);
  if (rows.length && /ονοματεπ|βαθμ/i.test(rows[0].join(' '))) rows.shift();
  const idx = nameIndex(), recs = [], bad = [];
  let matched = 0, people = 0;
  for (const r of rows) {
    const [name, grade, dec, year, cur] = r.map((x) => String(x ?? '').trim());
    if (!name || /^https?:/.test(name)) continue;
    people++;
    const mid = matchName(name, idx);
    if (mid) matched++;
    const base = { member_id: mid, full_name: name.replace(/\s+/g, ' '), degree: '', valid_from: '', valid_to: '', decree_id: null, source: 'import' };
    if (grade) {
      const p = parseRank(grade);
      if (!p) bad.push(`${name}: ${grade}`);
      recs.push({ ...base, record_type: 'historical', office: p ? p.office : grade, decree_no: /^\d+$/.test(dec) ? Number(dec) : null, decree_year: /^\d{4}$/.test(year) ? Number(year) : null,
        is_current: 0, notes: [grade, p && p.note].filter(Boolean).join(' · ') });
    }
    if (cur) {
      const p = /μετέστη|αιώνια/i.test(cur) ? null : parseRank(cur, false), d = decRe.exec(cur);
      if (p) recs.push({ ...base, record_type: 'appoint', office: p.office, decree_no: d ? Number(d[1]) : null, decree_year: d ? Number(d[2]) : null, is_current: 1, notes: ['Εν ενεργεία', p.note].filter(Boolean).join(' · ') });
      else if (recs.length && recs.at(-1).full_name === base.full_name) recs.at(-1).notes = [recs.at(-1).notes, cur].filter(Boolean).join(' · ');
      if (!p && !/μετέστη|αιώνια/i.test(cur)) bad.push(`${name}: ${cur}`);
    }
  }
  if (!recs.length) throw new Error('Δεν βρέθηκαν γραμμές. Επικολλήστε τις στήλες: Ονοματεπώνυμο, Βαθμός, Διάταγμα, Έτος, Εν Ενεργεία.');
  await db.save('Επετηρίδα: εισαγωγή καταλόγου Μεγάλων Αξιωματικών', (tx) => {
    tx.remove('member_degrees_offices', (o) => o.source === 'import');
    for (const x of recs) tx.insert('member_degrees_offices', x);
  });
  return { people, matched, records: recs.length, bad };
}

// Κατάλογος εν ενεργεία Μεγάλων Αξιωματικών (Τάξις · Αξίωμα · Βαθμός/Τίτλος · Ονοματεπώνυμο · Διάταγμα).
// Ορίζει ποιοι είναι σήμερα εν ενεργεία (αντικαθιστά τον προηγούμενο κατάλογο) και ενημερώνει/προσθέτει τους Εκπροσώπους ΜΔ.
export const HON_RANK = { σεβτ: 'Σεβασμιώτατος Αδ.', πσεβ: 'Πανσεβάσμιος Αδ.', λιανσεβ: 'Λίαν Σεβάσμιος Αδ.', λσεβ: 'Λίαν Σεβάσμιος Αδ.', σεβ: 'Σεβάσμιος Αδ.' };
const honKey = (v) => foldName(v).replace(/[^a-zα-ω]/g, '').replace(/αδ$/, '').replace(/^(σεβασμιωτατοσ)$/, 'σεβτ').replace(/^(πανσεβασμιοσ)$/, 'πσεβ').replace(/^(λιανσεβασμιοσ)$/, 'λιανσεβ').replace(/^(σεβασμιοσ)$/, 'σεβ');
export const isActiveList = (rows) => { const h = (rows[0] || []).map((x) => foldName(x)).join(' '); return /ταξι/.test(h) && /αξιωμα/.test(h) && /διαταγμ/.test(h) && !/ονοματεπωνυμο.*βαθμοσ μεγ/.test(h); };
export async function importActiveOfficers(input) {
  const rows = (Array.isArray(input) ? input : parsePasted(input)).map((r) => r.map((x) => String(x ?? '').trim())).filter((r) => r.some(Boolean));
  if (rows.length && !/^\d+$/.test(rows[0][0])) rows.shift();
  const idx = nameIndex(), items = [], bad = [];
  for (const [prec, officeText, hon, full, dec] of rows) {
    if (!full) continue;
    const p = parseRank(officeText, false), d = /(\d+)\s*\/\s*(\d{4})/.exec(dec || ''), y = d ? d[2] : (/^\d{4}$/.test(dec || '') ? dec : '');
    if (!p) bad.push(`${full}: ${officeText}`);
    const parts = full.replace(/\(.*?\)/g, ' ').trim().split(/\s+/);
    items.push({ full: full.replace(/\s+/g, ' '), surname: parts[0], name: parts.slice(1).join(' '), office: p ? p.office : officeText, note: p ? p.note : '', rank: HON_RANK[honKey(hon)] || '',
      decree_no: d ? Number(d[1]) : null, decree_year: y ? Number(y) : null, member_id: matchName(full, idx), prec: Number(prec) || null });
  }
  if (!items.length) throw new Error('Δεν βρέθηκαν γραμμές. Στήλες: Τάξις, Αξίωμα, Βαθμός / Τίτλος, Ονοματεπώνυμο, Διάταγμα.');
  let added = 0, updated = 0;
  await db.save(`Εν ενεργεία Μεγάλοι Αξιωματικοί (${items.length})`, (tx) => {
    added = updated = 0;
    tx.remove('member_degrees_offices', (o) => o.source === 'active');
    for (const x of items) {
      tx.insert('member_degrees_offices', { member_id: x.member_id, full_name: x.full, record_type: 'appoint', degree: '', office: x.office, decree_id: null, decree_no: x.decree_no, decree_year: x.decree_year,
        valid_from: '', valid_to: '', is_current: 1, honorific: x.rank, notes: ['Εν ενεργεία', x.note].filter(Boolean).join(' · '), source: 'active' });
      const ex = tx.find('reps', (r) => (x.member_id && r.member_id === x.member_id) || (fold(r.surname) === fold(x.surname) && fold(r.name).split(' ')[0] === fold(x.name).split(' ')[0]));
      const past = ex ? String(ex.office || '').split(' · ').filter((o) => /^Πρώην /.test(o)) : [];
      const office = [x.office, ...past.filter((o) => o !== x.office)].join(' · ');
      if (ex) { tx.update('reps', ex.id, { office, rep_rank: x.rank || ex.rep_rank || '', year: String(x.decree_year || ex.year || ''), member_id: ex.member_id || x.member_id || null }); updated++; }
      else { tx.insert('reps', { name: x.name, surname: x.surname, rep_rank: x.rank, office, year: String(x.decree_year || ''), email: '', mobile: '', member_id: x.member_id || null, notes: 'Εν ενεργεία Μεγάλος Αξιωματικός', ext_id: '' }); added++; }
    }
    // όσοι ήταν στον προηγούμενο κατάλογο αλλά όχι στον νέο: το αξίωμά τους στους Εκπροσώπους γίνεται «Πρώην …»
    const now = new Set(items.map((x) => fold(x.surname) + '|' + fold(x.name).split(' ')[0]));
    for (const r of tx.all('reps')) {
      const inList = now.has(fold(r.surname) + '|' + fold(r.name).split(' ')[0]);
      if (inList) { tx.update('reps', r.id, { active_list: 1 }); continue; }
      if (r.active_list) tx.update('reps', r.id, { active_list: 0, office: String(r.office || '').split(' · ').map((o) => (/^Πρώην /.test(o) ? o : 'Πρώην ' + o)).join(' · ') });
    }
  });
  return { people: items.length, added, updated, matched: items.filter((x) => x.member_id).length, bad };
}

// Εν ενεργεία: αν υπάρχει κατάλογος εν ενεργεία, ορίζει αυτός· αλλιώς τα «Εν ενεργεία» διορισμού του τρέχοντος τεκτονικού έτους
export const hasActiveList = () => db.all('member_degrees_offices').some((o) => o.source === 'active');
export function isCurrentRecord(o, active = hasActiveList(), fromYear = 0) {
  if (active) return o.source === 'active';
  return o.record_type === 'appoint' && Number(o.is_current) === 1 && Number(o.decree_year || 0) >= fromYear && !/^Πρώην /.test(o.office || '');
}
