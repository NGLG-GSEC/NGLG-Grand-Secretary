// Η μία δεξαμενή στοιχείων: το Μητρώο Μελών. Κάθε άλλη λίστα (Εκπρόσωποι, Επετηρίδα, Διατάγματα, Έργα, Ευχές…)
// απλώς δείχνει σε ένα μέλος (member_id)· όποιο στοιχείο λείπει (email, κινητό, Στοές) διαβάζεται από εδώ.
// identify(): ταυτοποίηση προσώπου από αριθμό μητρώου, email, κινητό ή ονοματεπώνυμο (με παραλλαγές και χαϊδευτικά).
// Διπλές εγγραφές του ίδιου προσώπου (ίδιο ονοματεπώνυμο, χωρίς αντιφατικό κινητό) αντιμετωπίζονται ως ένα πρόσωπο.
import { db } from './store.js';
import { foldName, splitEmails } from './util.js';

const nk = (v) => foldName(v).replace(/[^a-zα-ω/ ]/g, ' ').replace(/\s+/g, ' ').trim();
const FIRST = {
  'κω/νοσ': 'κωνσταντινοσ', 'κων/νοσ': 'κωνσταντινοσ', 'κωσταντινοσ': 'κωνσταντινοσ', κωστασ: 'κωνσταντινοσ', γιωργοσ: 'γεωργιοσ', γιαννησ: 'ιωαννησ',
  νικοσ: 'νικολαοσ', δημητρησ: 'δημητριοσ', θανασησ: 'αθανασιοσ', βασιλησ: 'βασιλειοσ', μιχαλησ: 'μιχαηλ', σπυροσ: 'σπυριδων', σπυριδωνασ: 'σπυριδων',
  παναγιωτησ: 'παναγιωτησ', τακησ: 'παναγιωτησ', στελιοσ: 'στυλιανοσ', μανωλησ: 'εμμανουηλ', βαγγελησ: 'ευαγγελοσ', λευτερησ: 'ελευθεριοσ', σωτηρησ: 'σωτηριοσ',
};
const firstKey = (fn) => { const w = nk(fn).split(' ')[0] || ''; return FIRST[w] || w; };
const surKey = (sn) => nk(sn).replace(/\s*-\s*/g, '-');
export const digits10 = (v) => String(v || '').replace(/\D/g, '').slice(-10);
export const emailsOf = (m) => splitEmails([m.email, m.other_emails].join(' ')).map((e) => e.toLowerCase());
export const mobilesOf = (m) => [m.mobile, ...String(m.other_mobiles || '').split(/[;,/]/)].map(digits10).filter((d) => d.length === 10);
const nameKeysOf = (m) => {
  const sns = [m.surname, ...String(m.surname_variants || '').split(';')].map(surKey).filter(Boolean);
  const fns = [m.first_name, ...String(m.first_name_variants || '').split(';')].map(firstKey).filter(Boolean);
  return sns.flatMap((s) => fns.map((f) => `${s}|${f}`));
};
// Πληρότητα εγγραφής: ενεργό, με email, κινητό, αριθμό μητρώου — η πληρέστερη είναι η «κύρια» του προσώπου
const score = (m) => (m.active !== 0 && Number(m.no_contact) !== 1 ? 8 : 0) + (m.email ? 4 : 0) + (m.mobile ? 2 : 0) + (m.registry_no != null ? 1 : 0);

let memo = { head: undefined, idx: null };
// Αριθμός Μητρώου (κωδικός): με Δίπλωμα Διδασκάλου Τέκτονος (Certificate Master Mason) → «MM» + αριθμός διπλώματος
// (ο πραγματικός αριθμός μητρώου)· χωρίς δίπλωμα → «M» + ο εσωτερικός αριθμός (από 1200). Π.χ. MM12345, M1200.
export const regCode = (m) => (!m ? '' : String(m.diploma_no ?? '').trim() ? `MM${String(m.diploma_no).trim()}` : m.registry_no != null && m.registry_no !== '' ? `M${m.registry_no}` : '');
// Κανονικοποίηση αναζήτησης κωδικού: κεφαλαία, χωρίς κενά/παύλες, ελληνικό «Μ» → λατινικό «M»
export const codeKey = (q) => String(q ?? '').toUpperCase().replace(/Μ/g, 'M').replace(/[\s.\-_/]/g, '');
// Ταιριάζει ο όρος με τον αριθμό μητρώου ενός μέλους; (MM12345 / M1200 / σκέτος αριθμός διπλώματος ή εσωτερικός αριθμός)
export function matchesCode(m, q) {
  const k = codeKey(q);
  if (!k || !m) return false;
  if (/^\d+$/.test(k)) return String(m.diploma_no ?? '').trim() === k || String(m.registry_no ?? '') === k;
  return codeKey(regCode(m)) === k || (k.startsWith('M') && !k.startsWith('MM') && String(m.registry_no ?? '') === k.slice(1));
}
// Ταξινόμηση κατά κωδικό: πρώτα MM (κατά αριθμό διπλώματος), μετά M (κατά εσωτερικό αριθμό)
export const regSortKey = (code) => { const m = /^(MM|M)(\d+)$/.exec(codeKey(code)); return !m ? 9e9 : m[1] === 'MM' ? Number(m[2]) : 1e8 + Number(m[2]); };

export function peopleIndex(src = db) {
  if (src === db && memo.head === db.head && memo.idx) return memo.idx;
  const ms = src.all('member_registry'), byId = new Map(ms.map((m) => [m.id, m]));
  const add = (map, k, id) => { if (!k) return; (map.get(k) || map.set(k, new Set()).get(k)).add(id); };
  const byReg = new Map(), byEmail = new Map(), byMobile = new Map(), byName = new Map(), groupOf = new Map();
  for (const m of ms) {
    if (m.registry_no != null) { byReg.set(String(m.registry_no), m.id); byReg.set('M' + m.registry_no, m.id); }
    if (String(m.diploma_no ?? '').trim()) byReg.set('MM' + String(m.diploma_no).trim(), m.id);
    for (const e of emailsOf(m)) add(byEmail, e, m.id);
    for (const d of mobilesOf(m)) add(byMobile, d, m.id);
    for (const k of nameKeysOf(m)) add(byName, k, m.id);
  }
  // Ομάδες ίδιου προσώπου: ίδιο ονοματεπώνυμο και όχι διαφορετικά κινητά
  const exact = new Map();
  for (const m of ms) add(exact, `${surKey(m.surname)}|${firstKey(m.first_name)}`, m.id);
  for (const ids of exact.values()) {
    const list = [...ids].map((i) => byId.get(i)), mobs = new Set(list.map((m) => digits10(m.mobile)).filter((d) => d.length === 10));
    if (list.length < 2 || mobs.size > 1) continue;
    const main = list.slice().sort((a, b) => score(b) - score(a) || (a.registry_no ?? 1e9) - (b.registry_no ?? 1e9) || a.id - b.id)[0];
    for (const m of list) groupOf.set(m.id, { main: main.id, ids: list.map((x) => x.id) });
  }
  const idx = { byId, byReg, byEmail, byMobile, byName, groupOf };
  if (src === db) memo = { head: db.head, idx };
  return idx;
}

// Κύρια εγγραφή του προσώπου (για διπλές εγγραφές)
export const canonicalId = (id, src = db) => { if (!id) return null; const g = peopleIndex(src).groupOf.get(Number(id)); return g ? g.main : Number(id); };
const reduce = (ids, idx) => [...new Set([...ids].map((i) => (idx.groupOf.get(i) || {}).main || i))];

// Ταυτοποίηση: { member_id?, registry_no?, email?, mobile?, surname?, first_name?, full_name? } → id μέλους ή null
export function identify(p, src = db) {
  const idx = peopleIndex(src);
  if (p.member_id && idx.byId.has(Number(p.member_id))) return canonicalId(p.member_id, src);
  if (p.registry_no != null && p.registry_no !== '' && idx.byReg.has(codeKey(p.registry_no))) return canonicalId(idx.byReg.get(codeKey(p.registry_no)), src);
  // ονοματεπώνυμο → υποψήφιοι
  const keys = [];
  if (p.surname || p.first_name) keys.push(`${surKey(p.surname)}|${firstKey(p.first_name)}`);
  if (p.full_name) {
    const t = nk(String(p.full_name).replace(/\(.*?\)/g, ' ').replace(/\s+του\s+\S+\s*$/i, ' ').replace(/\s*-\s*/g, '-')).split(' ').filter(Boolean);
    for (let k = 1; k < t.length; k++) keys.push(`${t.slice(0, k).join(' ')}|${firstKey(t.slice(k).join(' '))}`, `${t.slice(k).join(' ')}|${firstKey(t.slice(0, k).join(' '))}`);
  }
  let byName = [];
  for (const k of keys) { const s = idx.byName.get(k); if (s) { byName = reduce(s, idx); break; } }
  // email / κινητό (με προτίμηση σε όσους ταιριάζουν και στο όνομα)
  for (const [map, vals] of [[idx.byEmail, splitEmails(p.email).map((e) => e.toLowerCase())], [idx.byMobile, [digits10(p.mobile)].filter((d) => d.length === 10)]]) {
    for (const v of vals) {
      const ids = reduce(map.get(v) || [], idx), both = byName.length ? ids.filter((i) => byName.includes(i)) : ids;
      if (both.length === 1) return both[0];
    }
  }
  return byName.length === 1 ? byName[0] : null;
}

// Το πρόσωπο με όλα τα στοιχεία του (από όλες τις εγγραφές του): email, κινητά, Στοές, αριθμοί μητρώου
export function person(id, src = db) {
  if (!id) return null;
  const idx = peopleIndex(src), main = idx.byId.get(canonicalId(id, src));
  if (!main) return null;
  const ids = (idx.groupOf.get(main.id) || { ids: [main.id] }).ids, recs = [main, ...ids.filter((i) => i !== main.id).map((i) => idx.byId.get(i))];
  const uniq = (xs) => [...new Map(xs.filter(Boolean).map((x) => [String(x).toLowerCase(), x])).values()];
  const emails = uniq(recs.flatMap((m) => splitEmails([m.email, m.other_emails].join(' ')))), mobiles = uniq(recs.flatMap((m) => [m.mobile, ...String(m.other_mobiles || '').split(/[;,]/).map((x) => x.trim())]));
  const lodges = [], seen = new Set();
  for (const l of src.all('member_lodges')) if (ids.includes(l.member_id)) { const k = `${l.lodge_number}|${l.member_status}`; if (!seen.has(k)) { seen.add(k); lodges.push(l); } }
  return { id: main.id, member: main, ids, name: `${main.first_name || ''} ${main.surname || ''}`.trim(), emails, email: emails[0] || '', mobiles, mobile: mobiles[0] || '', lodges,
    registry_nos: recs.map((m) => m.registry_no).filter((x) => x != null) };
}

// Στοιχεία επικοινωνίας μιας εγγραφής λίστας: πρώτα όσα έχει η ίδια (αν δόθηκαν ειδικά), αλλιώς από το Μητρώο
export function contactOf(x, src = db) {
  const p = x && x.member_id ? person(x.member_id, src) : null;
  // Ενιαίο Μητρώο: τα στοιχεία του μέλους υπερισχύουν· τα δικά της εγγραφής μόνο αν το Μητρώο δεν έχει
  return { email: (p && p.email) || String((x && x.email) || '').trim(), mobile: (p && p.mobile) || String((x && x.mobile) || '').trim(), person: p };
}

// Ομάδες με ίδιο ονοματεπώνυμο (για έλεγχο διπλών): { ids, sure } — sure: χωρίς αντιφατικό κινητό
export function sameNameGroups(src = db) {
  const ms = src.all('member_registry'), by = new Map();
  for (const m of ms) { const k = `${surKey(m.surname)}|${firstKey(m.first_name)}`; (by.get(k) || by.set(k, []).get(k)).push(m); }
  return [...by.values()].filter((g) => g.length > 1).map((g) => ({ members: g, sure: new Set(g.map((m) => digits10(m.mobile)).filter((d) => d.length === 10)).size <= 1,
    main: g.slice().sort((a, b) => score(b) - score(a) || (a.registry_no ?? 1e9) - (b.registry_no ?? 1e9) || a.id - b.id)[0].id }));
}
