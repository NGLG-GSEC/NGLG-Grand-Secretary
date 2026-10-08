// Έξυπνα πρότυπα επιστολών: πεδία σε άγκιστρα ({Στοά}, {Αρ. Στοάς}, {ημέρα}, {ημερομηνία}, {Μέγας Διδάσκαλος})
// συμπληρώνονται από τη βάση — Στοά από τις Συμβολικές Στοές, ημέρα/ημερομηνία από την Επίσκεψη (ή όποια δοθεί).
import { db } from '../core/store.js';
import { parseIso, DAYS } from '../core/util.js';
import { lodgeByNumber } from './lodges.js';
import { provinceByShort, provinceRoles } from './provinces.js';

export const MONTHS_GEN = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
// «το Σάββατο» / «την Τρίτη»
export const dayWithArticle = (iso) => { const d = parseIso(iso); if (!d) return ''; const day = DAYS[d.getDay()]; return `${day === 'Σάββατο' ? 'το' : 'την'} ${day}`; };
// «16 Οκτωβρίου 2027»
export const dateWords = (iso) => { const d = parseIso(iso); return d ? `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}` : ''; };
export const gmName = () => String(db.setting('grand_master_name') || 'Σεβτ. Αδ. Ιωάννης Μπενετάτος').replace(/^.*?Αδ\.\s*/, '').trim();

export const PLACEHOLDERS = [
  ['Στοά', 'όνομα της Στοάς', (c) => c.lodge],
  ['Αρ. Στοάς', 'αριθμός της Στοάς', (c) => c.lodge_number],
  ['ημέρα', 'ημέρα με άρθρο, π.χ. «το Σάββατο», «την Τρίτη»', (c) => dayWithArticle(c.date)],
  ['ημερομηνία', 'π.χ. «16 Οκτωβρίου 2027»', (c) => dateWords(c.date)],
  ['Μέγας Διδάσκαλος', 'όνομα του Μεγάλου Διδασκάλου (Ρυθμίσεις)', () => gmName()],
];
const RE = /\{([^{}\n]{1,30})\}/g;
const FN = new Map(PLACEHOLDERS.map(([k, , f]) => [k.toLowerCase(), f]));
export const hasPlaceholders = (s) => [...String(s || '').matchAll(RE)].some((m) => FN.has(m[1].trim().toLowerCase()));
// Ό,τι δεν είναι γνωστό μένει ως {πεδίο}, ώστε να φαίνεται τι λείπει
export const fillPlaceholders = (s, ctx = {}) => String(s || '').replace(RE, (all, k) => { const f = FN.get(k.trim().toLowerCase()); const v = f ? f(ctx) : ''; return v ? String(v) : all; });
export const missingPlaceholders = (s) => [...new Set([...String(s || '').matchAll(RE)].map((m) => m[1].trim()).filter((k) => FN.has(k.toLowerCase())))];

// Στοιχεία από Επίσκεψη ή από Στοά + ημερομηνία
export function fillContext({ visit, lodge_number, date } = {}) {
  const no = visit ? visit.lodge_number : lodge_number, l = no ? lodgeByNumber(no) : null;
  return { lodge: (visit && visit.lodge) || (l && l.name) || '', lodge_number: no ? String(no) : '', date: (visit && visit.visit_date) || date || '',
    province: (visit && visit.province) || (l && l.provincial) || '', lodgeRec: l };
}
// Γραμματέας της Στοάς (Προς)· Επαρχιακός Μέγας Γραμματέας και ΜΔ (Κοιν.)
export function lodgeRecipients(c) {
  const l = c.lodgeRec, p = provinceByShort(c.province || ''), gs = p ? provinceRoles(p)[1] : null;
  const lodgeMail = l ? (String(l.secretary_email || '').trim() || String(l.email || '').trim()) : '';
  return { lodgeMail, to: lodgeMail, toName: `τον Γραμματέα της Στοάς «${c.lodge}»${c.lodge_number ? ` υπ’ αριθ. ${c.lodge_number}` : ''}${l && l.secretary ? `, ${l.secretary}` : ''}`,
    cc: [gs ? gs.email : '', String(db.setting('gm_email') || '').trim()].filter(Boolean).join(', ') };
}

// Το πρότυπο της Επίσημης Επίσκεψης του Μεγάλου Διδασκάλου (μία πηγή: Επιστολές και Επισκέψεις)
export const GM_VISIT = {
  key: 'gm-visit', name: 'Επίσημη επίσκεψη του Μεγάλου Διδασκάλου', category: 'ΕΠΙΣΚΕΨΗ', closing: 'Με εκτίμηση και αδελφική αγάπη,',
  subject: 'Επίσημη Επίσκεψη ΜΔ εις την Στοάν «{Στοά}» υπ’ αριθμ. {Αρ. Στοάς} {ημέρα}, {ημερομηνία}',
  body: 'Αγαπητέ Αδ. Γραμματεύ,\n\n'
    + 'Κατ’ εντολήν του Μεγάλου Διδασκάλου, σας γνωρίζουμε ότι κατά τις προσεχείς εργασίες της Στοάς «{Στοά}» υπ’ αρ. {Αρ. Στοάς}, {ημέρα}, {ημερομηνία}, και ώρα συμφώνως με την πρόσκλησή σας, θα παραστεί επισήμως ο Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος, Σεβασμιώτατος Αδ. {Μέγας Διδάσκαλος}.\n\n'
    + 'Η επίσκεψη πραγματοποιείται σύμφωνα με τον Κανόνα 122 του Συντάγματος της ΕΜΣτΕ, ο οποίος προβλέπει την επίσημη επίσκεψη Στοών από τον Μέγα Διδάσκαλο και καθορίζει τις σχετικές εξουσίες του κατά την παρουσία του στις εργασίες της Στοάς. Παρακαλείσθε όπως ενημερώσετε σχετικώς τον Σεβάσμιο Διδάσκαλο, τον Τελετάρχη και τους αρμοδίους Αξιωματικούς της Στοάς, προς την προσήκουσα προετοιμασία της επισήμου επισκέψεως.\n\n'
    + 'Υπενθυμίζεται ότι, σύμφωνα με τον Κανόνα 144 του Συντάγματος, στα Πρακτικά της Συνεδρίας καταχωρίζονται τα ονόματα όλων των επισκεπτών, μετά των Τεκτονικών αξιωμάτων τους, καθώς και τα πεπραγμένα των εργασιών της Στοάς. Ως εκ τούτου, παρακαλείσθε όπως η επίσημη παρουσία του Μεγάλου Διδασκάλου, καθώς και των τυχόν συνοδευόντων Μεγάλων Αξιωματικών, καταχωρισθεί προσηκόντως στα Πρακτικά της Συνεδρίας.\n\n'
    + 'Παρακαλούμε για την επιβεβαίωση λήψεως της παρούσης.\n\n'
    + 'Κατ’ εντολήν του Μεγάλου Διδασκάλου,',
};
export const gmVisitTemplate = () => db.all('letter_templates').find((t) => t.key === GM_VISIT.key && t.active) || GM_VISIT;

db.migrate('template-gm-visit-smart-2026-10', (tx) => {
  const row = { key: GM_VISIT.key, name: GM_VISIT.name, subject: GM_VISIT.subject, body: GM_VISIT.body, closing: GM_VISIT.closing, category: GM_VISIT.category, active: 1 };
  const ex = tx.all('letter_templates').find((t) => t.key === GM_VISIT.key || /^Επίσημη επίσκεψη του Μεγάλου Διδασκάλου/i.test(t.name || ''));
  if (ex) tx.update('letter_templates', ex.id, row); else tx.insert('letter_templates', row);
});
