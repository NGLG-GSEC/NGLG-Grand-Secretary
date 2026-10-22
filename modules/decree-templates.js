// Πρότυπα Διαταγμάτων (στα «Πρότυπα Επιστολών», kind = 'decree'): κάθε είδος με τη δική του «Σχεδίαση σελίδας»
// (εικόνα κεφαλίδας/φόντου, κεφαλίδα κειμένων, ΔΙΟΡΙΖΟΜΕΝ, εικόνα αξιώματος). Το είδος ορίζεται από την πράξη και το αξίωμα (keyFor):
//   decree-appoint     → ΔΙΟΡΙΣΜΟΣ ΜΕΓΑΛΩΝ ΑΞΙΩΜΑΤΙΚΩΝ (όλα τα αξιώματα, εκτός Επαρχιακού/Περιφερειακού Μ.Δ.)
//   decree-provincial  → ΔΙΟΡΙΣΜΟΣ ΕΠΑΡΧΙΑΚΟΥ / ΠΕΡΙΦΕΡΕΙΑΚΟΥ Μ.Δ. και ΑΠΟΝΟΜΗ τίτλου «Πρώην …» (ίδια σελίδα)
//   decree-service     → ΤΑΞΙΣ ΤΟΥ ΜΕΓΑΛΟΥ ΔΙΔΑΣΚΑΛΟΥ δι’ Υπηρεσίας
//   decree-general     → ΓΕΝΙΚΟ ΔΙΑΤΑΓΜΑ: για θέματα, Στοές, Επαρχίες — ελεύθερο κείμενο από το πρότυπο
// Όλα τα Διατάγματα προσώπων ενημερώνουν την Επετηρίδα και το Μητρώο (decree-sync.js).
import { db } from '../core/store.js';

export const GENERAL_BODY = 'ΗΜΕΙΣ\nΟ Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος,\nΣεβασμιώτατος Αδελφός {Μέγας Διδάσκαλος},\n'
  + 'λαβόντες υπ’ όψιν τον Κανόνα …… του Βιβλίου των Γενικών Νόμων και Κανονισμών,\n\nπερί {Περί},\n\nΑΠΟΦΑΣΙΖΟΜΕΝ\n\n……\n\n'
  + 'Εγένετο εν τω Τεκτονικώ Μεγάρω της πόλεως των Αθηνών, την {ημερομηνία}.';
export const DECREE_KINDS = {
  'decree-appoint': { name: 'ΔΙΑΤΑΓΜΑ ΔΙΟΡΙΣΜΟΥ ΜΕΓΑΛΩΝ ΑΞΙΩΜΑΤΙΚΩΝ', short: 'Διορισμός Μεγάλων Αξιωματικών', help: 'ΔΙΟΡΙΖΟΜΕΝ — όλα τα αξιώματα εκτός Επαρχιακού/Περιφερειακού Μ.Δ.', actions: ['appoint'], body: '' },
  'decree-provincial': { name: 'ΔΙΑΤΑΓΜΑ ΕΠΑΡΧΙΑΚΟΥ / ΠΕΡΙΦΕΡΕΙΑΚΟΥ Μ.Δ. ΚΑΙ ΠΡΩΗΝ', short: 'Επαρχιακός/Περιφερειακός Μ.Δ. · Απονομή «Πρώην»', help: 'ΔΙΟΡΙΖΟΜΕΝ Επαρχιακό ή Περιφερειακό Μέγα Διδάσκαλο · ΑΠΟΝΕΜΕΙ τίτλο Πρώην Μεγάλου Αξιωματικού.', actions: ['appoint', 'award'], body: '' },
  'decree-service': { name: 'ΔΙΑΤΑΓΜΑ ΤΑΞΕΩΣ ΜΕΓΑΛΟΥ ΔΙΔΑΣΚΑΛΟΥ', short: 'Τάξις του Μεγάλου Διδασκάλου', help: 'ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ την Τάξιν του Μεγάλου Διδασκάλου δι’ Υπηρεσίας.', actions: ['service_award'], body: '' },
  'decree-general': { name: 'ΓΕΝΙΚΟ ΔΙΑΤΑΓΜΑ', short: 'Γενικό — θέματα, Στοές, Επαρχίες', help: 'Ελεύθερο κείμενο από το πρότυπο, για κάθε θέμα, Στοά ή Επαρχία.', actions: ['general'], body: GENERAL_BODY },
};
// Αξιώματα που διορίζονται με το πρότυπο «Επαρχιακού / Περιφερειακού Μ.Δ.»
export const PROVINCIAL_OFFICES = ['Επαρχιακός Μέγας Διδάσκαλος', 'Περιφερειακός Μέγας Διδάσκαλος'];
// Πρότυπο Διατάγματος από την πράξη και το αξίωμα (μία λογική για νέο, επεξεργασία, προεπισκόπηση)
export const keyFor = (action, office = '') => (action === 'general' ? 'decree-general' : action === 'service_award' ? 'decree-service'
  : action === 'award' || PROVINCIAL_OFFICES.includes(office) ? 'decree-provincial' : 'decree-appoint');
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

// Χωρισμός σε τρία πρότυπα προσώπων: τα νέα πρότυπα παίρνουν αρχικά τη Σχεδίαση σελίδας του προτύπου που είχαν τα υπάρχοντα
// Διατάγματα του είδους τους (το πιο πρόσφατο), και τα υπάρχοντα Διατάγματα «Διορισμού ΜΑΞ» περνούν στο σωστό πρότυπο.
db.migrate('decree-templates-split-2026-10', (tx) => {
  const ts = tx.all('letter_templates'), byKey = (k) => ts.find((t) => t.key === k);
  const metaOf = (d) => { let r = d.rules; try { if (typeof r === 'string') r = JSON.parse(r || '{}'); } catch { r = {}; } if (!r || Array.isArray(r)) r = {}; return r; };
  const officeOf = (d) => { const r = metaOf(d); if (r.decree_office) return r.decree_office; try { return (JSON.parse(d.appointments || '[]')[0] || {}).office || ''; } catch { return ''; } };
  const docs = tx.all('decree_documents').map((d) => ({ d, key: keyFor(metaOf(d).action || 'appoint', officeOf(d)) }))
    .sort((a, b) => (Number(b.d.decree_year) || 0) - (Number(a.d.decree_year) || 0) || (Number(b.d.decree_no) || 0) - (Number(a.d.decree_no) || 0));
  const appoint = byKey('decree-appoint');
  if (appoint && appoint.name === 'ΔΙΑΤΑΓΜΑ ΔΙΟΡΙΣΜΟΥ ΜΑΞ') tx.update('letter_templates', appoint.id, { name: DECREE_KINDS['decree-appoint'].name });
  for (const key of ['decree-provincial', 'decree-service']) {
    if (byKey(key)) continue;
    const src = docs.find((x) => x.key === key), from = byKey(src ? src.d.template_key || 'decree-appoint' : 'decree-appoint') || appoint;
    tx.insert('letter_templates', { key, kind: 'decree', name: DECREE_KINDS[key].name, body: '', active: 1, layout: from ? from.layout || {} : {} });
  }
  for (const { d, key } of docs) if ((d.template_key || 'decree-appoint') === 'decree-appoint' && key !== 'decree-appoint') tx.update('decree_documents', d.id, { template_key: key });
});
