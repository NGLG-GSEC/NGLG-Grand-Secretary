// Πρότυπα Διαταγμάτων (στα «Πρότυπα Επιστολών», kind = 'decree'): δύο είδη Διατάγματος, το καθένα με τη δική του
// «Σχεδίαση σελίδας» (εικόνα φόντου και κεφαλίδας σε θέση/διαστάσεις πάνω στο Α4).
//   decree-appoint → ΔΙΑΤΑΓΜΑ ΔΙΟΡΙΣΜΟΥ ΜΑΞ: για πρόσωπα (διορισμός, απονομή, Τάξις του ΜΔ) — ενημερώνει την Επετηρίδα
//   decree-general → ΓΕΝΙΚΟ ΔΙΑΤΑΓΜΑ: για θέματα, Στοές, Επαρχίες, ρυθμίσεις — ελεύθερο κείμενο από το πρότυπο
import { db } from '../core/store.js';

export const GENERAL_BODY = 'ΗΜΕΙΣ\nΟ Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος,\nΣεβασμιώτατος Αδελφός {Μέγας Διδάσκαλος},\n'
  + 'λαβόντες υπ’ όψιν τον Κανόνα …… του Βιβλίου των Γενικών Νόμων και Κανονισμών,\n\nπερί {Περί},\n\nΑΠΟΦΑΣΙΖΟΜΕΝ\n\n……\n\n'
  + 'Εγένετο εν τω Τεκτονικώ Μεγάρω της πόλεως των Αθηνών, την {ημερομηνία}.';
export const DECREE_KINDS = {
  'decree-appoint': { name: 'ΔΙΑΤΑΓΜΑ ΔΙΟΡΙΣΜΟΥ ΜΑΞ', short: 'Διορισμού ΜΑΞ — για πρόσωπα', help: 'Διορισμός, απονομή τίτλου, Τάξις του Μεγάλου Διδασκάλου — ενημερώνει την Επετηρίδα.', body: '' },
  'decree-general': { name: 'ΓΕΝΙΚΟ ΔΙΑΤΑΓΜΑ', short: 'Γενικό — θέματα, Στοές, Επαρχίες', help: 'Ελεύθερο κείμενο από το πρότυπο, για κάθε θέμα, Στοά ή Επαρχία.', body: GENERAL_BODY },
};
export const DECREE_PLACEHOLDERS = [['Περί', 'το θέμα του Διατάγματος'], ['ημερομηνία', 'π.χ. «8ην Οκτωβρίου 2026»'], ['Μέγας Διδάσκαλος', 'όνομα του Μεγάλου Διδασκάλου (Ρυθμίσεις)'], ['Αρ. Διατάγματος', 'π.χ. 514/2026']];

export const decreeKey = (d) => (d && DECREE_KINDS[d.template_key] ? d.template_key : 'decree-appoint');
export const isDecreeTemplate = (t) => !!t && t.kind === 'decree';
export const decreeTemplate = (key) => db.all('letter_templates').find((t) => t.key === key) || { key, kind: 'decree', ...DECREE_KINDS[key], layout: {} };
export function layoutOf(t) {
  let L = t && t.layout;
  if (typeof L === 'string') { try { L = JSON.parse(L); } catch { L = {}; } }
  return L && typeof L === 'object' ? L : {};
}

db.migrate('decree-templates-2026-10', (tx) => {
  for (const [key, k] of Object.entries(DECREE_KINDS)) {
    if (tx.all('letter_templates').some((t) => t.key === key)) continue;
    tx.insert('letter_templates', { key, kind: 'decree', name: k.name, body: k.body, active: 1, layout: {} });
  }
});
