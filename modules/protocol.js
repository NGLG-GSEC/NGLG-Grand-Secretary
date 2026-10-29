// Αριθμός Πρωτοκόλλου — ενιαία συνεχής αρίθμηση Επιστολών & Διαταγμάτων, π.χ. 20545.
// Δεν μηδενίζει ανά έτος· ξεκινά από τη ρύθμιση «protocol_start». Υπολογίζεται μέσα στην αποθήκευση (συναλλαγή),
// οπότε δύο ταυτόχρονες αποθηκεύσεις δεν παίρνουν ποτέ τον ίδιο αριθμό.
import { db } from '../core/store.js';

export const PROTOCOL_START_DEFAULT = 20545;
db.defaultSettings({ protocol_start: String(PROTOCOL_START_DEFAULT) });

export const protocolTopic = (t) => String(t || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').replace(/^[ ._-]+|[ ._-]+$/g, '').slice(0, 60).trim() || 'Χωρίς θέμα';

// Επόμενος αριθμός: ο «επόμενος» της ρύθμισης protocol_next (αν έχει οριστεί), αλλιώς ο μεγαλύτερος υπάρχων + 1·
// όσοι αριθμοί είναι ήδη πιασμένοι παραλείπονται. Κάθε αριθμός που δίνεται (αυτόματα ή χειροκίνητα) μετακινεί τον «επόμενο»
// στον αμέσως επόμενο, άρα η αρίθμηση συνεχίζει από τον τελευταίο αριθμό που γράψατε.
const intOf = (v) => parseInt(String(v ?? '').replace(/\D/g, ''), 10) || 0;
function nextFree(tx) {
  const used = new Set(['letters', 'decree_documents'].flatMap((t) => tx.all(t).map((r) => Number(r.protocol_seq) || 0)).filter(Boolean));
  const start = intOf(tx.setting('protocol_start') ?? db.setting('protocol_start')) || PROTOCOL_START_DEFAULT;
  // ο «Πρώτος αριθμός πρωτοκόλλου» των Ρυθμίσεων μένει κατώτατο όριο
  let n = Math.max(start, intOf(tx.setting('protocol_next') ?? db.setting('protocol_next')) || Math.max(start - 1, ...used) + 1);
  while (used.has(n)) n++;
  return n;
}
// Αριθμοί που ο χρήστης γράφει μικρότερους από τον προτεινόμενο και επέλεξε η αρίθμηση να συνεχίσει από αυτούς
const continueFrom = new Set();
// Χρήση αριθμού n (μέσα στην αποθήκευση): ο «επόμενος» γίνεται n + 1 όταν ο n δεν είναι μικρότερος από τον προτεινόμενο
// ή όταν επιλέχθηκε ρητά «συνέχεια από εδώ».
export function claimProtocol(tx, n) {
  if (n >= nextFree(tx) || continueFrom.has(n)) tx.setting('protocol_next', String(n + 1));
  continueFrom.delete(n);
}
export function setNextProtocol(tx, n) { tx.setting('protocol_next', String(n)); }
export function nextProtocol(tx, category = 'Επιστολή', topic = '', manual = 0) {
  const n = manual || nextFree(tx);
  claimProtocol(tx, n);
  return { seq: n, year: new Date().getFullYear(), no: String(n) };
}
// Πρόταση αριθμού πρωτοκόλλου: η εφαρμογή προτείνει τον επόμενο, αλλά μπορείτε να γράψετε άλλον (χειροκίνητα).
// Επιστρέφει null (ακύρωση), 0 (δεκτός ο προτεινόμενος — υπολογίζεται ξανά μέσα στην αποθήκευση) ή τον αριθμό που γράψατε.
// Ένας χειροκίνητος αριθμός μεγαλύτερος από τον προτεινόμενο συνεχίζει την αρίθμηση από εκεί και πέρα.
export const suggestedProtocol = () => nextFree({ setting: (k) => db.setting(k), all: (t) => db.all(t) });
const protocolOwner = (n, self = {}) => ['letters', 'decree_documents'].flatMap((t) => db.all(t).filter((r) => Number(r.protocol_seq) === n && !(t === self.table && r.id === self.id)))[0];
// Αλλαγή του «επόμενου» αριθμού πρωτοκόλλου (μπορεί να είναι και μικρότερος — οι πιασμένοι αριθμοί παραλείπονται)
export function askNextProtocol() {
  const start = intOf(db.setting('protocol_start')) || PROTOCOL_START_DEFAULT;
  const sug = suggestedProtocol();
  const v = window.prompt(`Ο επόμενος αριθμός πρωτοκόλλου είναι ${sug}.\nΓράψτε από ποιον αριθμό να συνεχίσει η αρίθμηση:`, String(sug));
  if (v == null || !String(v).trim()) return null;
  const n = intOf(v);
  if (!n) throw new Error('Μη έγκυρος αριθμός πρωτοκόλλου.');
  if (n < start) throw new Error(`Ο αριθμός είναι μικρότερος από τον «Πρώτο αριθμό πρωτοκόλλου» των Ρυθμίσεων (${start}).`);
  return n === sug ? null : n;
}
export function askProtocol(self = {}, current = 0, intro = '') {
  const sug = suggestedProtocol();
  const v = window.prompt((intro ? intro + '\n\n' : '') + (current
    ? `Ο τρέχων αριθμός πρωτοκόλλου είναι ${current}.\nΠροτείνω τον ${sug} (ο επόμενος ελεύθερος).\nΓράψτε τον αριθμό που θέλετε:`
    : `Προτείνω αριθμό πρωτοκόλλου ${sug}.\nΑν θέλετε άλλον, γράψτε τον εδώ (ή αφήστε τον προτεινόμενο και πατήστε OK):`), String(current || sug));
  if (v == null) return null;
  if (!String(v).trim()) return current ? null : 0; // κενό = ο προτεινόμενος
  const n = parseInt(String(v).replace(/\D/g, ''), 10);
  if (!n) throw new Error('Μη έγκυρος αριθμός πρωτοκόλλου.');
  if (n === current) return null;
  return checkProtocol(n, self, current, sug);
}
// Έλεγχος ενός αριθμού που έγραψε ο χρήστης (prompt ή πεδίο φόρμας): διπλός → ερώτηση· μικρότερος από τον προτεινόμενο → ερώτηση
// αν η αρίθμηση θα συνεχίσει από εκεί. Επιστρέφει null (ακύρωση), 0 (ο προτεινόμενος) ή τον αριθμό.
export function checkProtocol(n, self = {}, current = 0, sug = suggestedProtocol()) {
  if (protocolOwner(n, self) && !window.confirm(`Ο αριθμός πρωτοκόλλου ${n} υπάρχει ήδη σε άλλο έγγραφο. Να χρησιμοποιηθεί παρ’ όλα αυτά;`)) return null;
  // μεγαλύτερος από τον προτεινόμενο: η αρίθμηση συνεχίζει αυτόματα από εκεί· μικρότερος: ερώτηση
  if (n < sug && window.confirm(`Ο ${n} είναι μικρότερος από τον προτεινόμενο ${sug}.\n\nOK = η αρίθμηση να συνεχίσει από τον ${n + 1} (επόμενος ελεύθερος)\nΆκυρο = μόνο αυτό το έγγραφο· η αρίθμηση συνεχίζει από τον ${sug}`)) continueFrom.add(n);
  return n === sug && !current ? 0 : n;
}
// Αριθμός πρωτοκόλλου από το πεδίο «Αρ. Πρωτοκόλλου» μιας φόρμας (π.χ. του Διατάγματος), πριν από την αποθήκευση
export function formProtocol(v, self = {}, current = 0) {
  const n = intOf(v);
  if (!n) throw new Error('Συμπληρώστε τον αριθμό πρωτοκόλλου.');
  return n === current ? n : checkProtocol(n, self, current);
}
// Απόδοση/αλλαγή αριθμού πρωτοκόλλου μέσα στην αποθήκευση: manual 0 = ο επόμενος ελεύθερος (υπολογίζεται εδώ)
export function setProtocol(tx, table, id, manual = 0) {
  const r = tx.get(table, id);
  if (!r || (manual && Number(r.protocol_seq) === manual)) return r;
  if (!manual && r.protocol_seq) return r;
  const p = nextProtocol(tx, table === 'letters' ? 'Επιστολή' : 'Διάταγμα', '', manual);
  return tx.update(table, id, { protocol_seq: p.seq, protocol_year: r.protocol_year || p.year, protocol_no: p.no });
}
// Ο αριθμός πρωτοκόλλου στο έγγραφο είναι μόνο ο αριθμός (π.χ. 20545)· η κατηγορία και το θέμα μπαίνουν μόνο στο όνομα αρχείου.
db.migrate('protocol-number-only-2026-10', (tx) => {
  for (const t of ['letters', 'decree_documents']) for (const r of tx.all(t)) if (r.protocol_seq && r.protocol_no !== String(r.protocol_seq)) tx.update(t, r.id, { protocol_no: String(r.protocol_seq) });
});

export function protocolBook() {
  const rows = [
    ...db.all('letters').filter((r) => r.protocol_seq != null && !legacyDecreeLetterIds().has(r.id)).map((r) => ({ ...r, cat: 'Επιστολή', d: r.letter_date, who: r.recipient_name, href: `#/letters/${r.id}` })),
    ...db.all('decree_documents').filter((r) => r.protocol_seq != null).map((r) => ({ ...r, cat: 'Διάταγμα', d: r.decree_date, who: r.recipient_name, href: `#/decrees/${r.id}` })),
  ];
  return rows.sort((a, b) => (b.protocol_seq || 0) - (a.protocol_seq || 0));
}
// Παλαιά Διατάγματα που είχαν αποθηκευτεί ως επιστολές (πίνακας decrees) — κρύβονται από τις Επιστολές.
export const legacyDecreeLetterIds = () => new Set(db.all('decrees').map((d) => Number(d.letter_id)));

// Οι πρόχειρες Επιστολές/Διατάγματα δεν κρατούν αριθμό πρωτοκόλλου (δίνεται όταν οριστούν «Έτοιμα»)
db.migrate('protocol-ready-only-2026-10', (tx) => {
  for (const t of ['letters', 'decree_documents']) for (const r of tx.all(t)) if (r.status !== 'ready' && r.protocol_seq) tx.update(t, r.id, { protocol_seq: null, protocol_year: null, protocol_no: '' });
});
