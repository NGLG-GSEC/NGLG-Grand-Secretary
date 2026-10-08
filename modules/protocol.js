// Αριθμός Πρωτοκόλλου — ενιαία συνεχής αρίθμηση Επιστολών & Διαταγμάτων, π.χ. 20.542_26_Επιστολή_Θέμα.
// Δεν μηδενίζει ανά έτος· ξεκινά από τη ρύθμιση «protocol_start». Υπολογίζεται μέσα στην αποθήκευση (συναλλαγή),
// οπότε δύο ταυτόχρονες αποθηκεύσεις δεν παίρνουν ποτέ τον ίδιο αριθμό.
import { db } from '../core/store.js';

export const PROTOCOL_START_DEFAULT = 20545;
db.defaultSettings({ protocol_start: String(PROTOCOL_START_DEFAULT) });

export const protocolTopic = (t) => String(t || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').replace(/^[ ._-]+|[ ._-]+$/g, '').slice(0, 60).trim() || 'Χωρίς θέμα';

export function nextProtocol(tx, category = 'Επιστολή', topic = '') {
  const start = parseInt(String(tx.setting('protocol_start') ?? db.setting('protocol_start')).replace(/\D/g, ''), 10) || PROTOCOL_START_DEFAULT;
  const max = (t) => tx.all(t).reduce((m, r) => Math.max(m, Number(r.protocol_seq) || 0), 0);
  const n = Math.max(start - 1, max('letters'), max('decree_documents')) + 1;
  const y = new Date().getFullYear();
  return { seq: n, year: y, no: n.toLocaleString('de-DE') + `_${String(y % 100).padStart(2, '0')}_${category}_${protocolTopic(topic)}` };
}

export function protocolBook() {
  const rows = [
    ...db.all('letters').filter((r) => r.protocol_seq != null && !legacyDecreeLetterIds().has(r.id)).map((r) => ({ ...r, cat: 'Επιστολή', d: r.letter_date, who: r.recipient_name, href: `#/letters/${r.id}` })),
    ...db.all('decree_documents').filter((r) => r.protocol_seq != null).map((r) => ({ ...r, cat: 'Διάταγμα', d: r.decree_date, who: r.recipient_name, href: `#/decrees/${r.id}` })),
  ];
  return rows.sort((a, b) => (b.protocol_seq || 0) - (a.protocol_seq || 0));
}
// Παλαιά Διατάγματα που είχαν αποθηκευτεί ως επιστολές (πίνακας decrees) — κρύβονται από τις Επιστολές.
export const legacyDecreeLetterIds = () => new Set(db.all('decrees').map((d) => Number(d.letter_id)));
