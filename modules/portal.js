// Πύλη — όλες οι εφαρμογές και ιστοσελίδες της Μεγάλης Γραμματείας και των άλλων Γραφείων σε μία σελίδα.
// Ανοίγει και χωρίς σύνδεση. Για νέα κάρτα: προσθέστε μία γραμμή στο CARDS.
import { module } from '../core/app.js';
import { db } from '../core/store.js';
import { esc } from '../core/util.js';

const CARDS = [
  ['Μεγάλη Γραμματεία', [
    ['Ψηφιακή Μεγάλη Γραμματεία', 'Επιστολές, Διατάγματα, Επισκέψεις Στοών, Εορτολόγιο, Πρότζεκτ ΜΔ, Κατάλογος, Μητρώο Μελών, Επετηρίδα, Βάση Δεδομένων.', '#/', 'Εδώ'],
    ['Ψηφιακό Έντυπο Διατάγματος', 'Διάταγμα σε περγαμηνή της Μεγάλης Στοάς — θυρεός, κείμενο, υπογραφή, σφραγίδα — με ζωντανή προεπισκόπηση και λήψη PNG ή PDF A4.', 'diatagma/', 'Εφαρμογή'],
  ]],
  ['Εγγραφές', [['Φόρμες εγγραφής', 'Το μητρώο των φορμών εγγραφής (π.χ. Εξαμηνιαία Μεγάλη Σύνοδος Κέρκυρα 2026, δείπνα) με συνδέσμους στις ζωντανές φόρμες.', 'https://github.com/dskiad/nglg-registration-forms', 'Μητρώο']]],
  ['Βιβλιοθήκη', [['Τεκτονικές Ομιλίες', 'Η ψηφιακή βιβλιοθήκη της Μεγάλης Στοάς — ομιλίες και εργασίες σε PDF, σε θεματικά ράφια.', 'https://dskiad.github.io/nglg-tektonikes-omilies/', 'Βιβλιοθήκη']]],
  ['Τυπικό', [['Bear Bell Ritual', 'Το δίγλωσσο διαδραστικό τυπικό (Αγγλικά/Ελληνικά). Ανοίγει μόνο για όσους έχουν πρόσβαση.', 'https://github.com/dskiad/bear-bell-ritual', 'Περιορισμένη πρόσβαση']]],
  ['Άλλα Γραφεία', [
    ['Μέγας Καγκελάριος · ΕΜΣτΕ', 'Το Γραφείο του Μεγάλου Καγκελαρίου.', 'https://dskiad.github.io/Grand-Chancellor/', 'Ιστοσελίδα'],
    ['Μέγας Γραμματέας · Athelstan', 'Masonic Order of Athelstan — Grand Secretary.', 'https://dskiad.github.io/ATHELSTAN-GRAND-SECRETARY/', 'Ιστοσελίδα'],
  ]],
];

export function portalHtml() {
  return CARDS.map(([g, cards]) => `<h2>${esc(g)}</h2><div class="dash">${cards.map(([t, d, href, tag]) => {
    const ext = /^https?:/.test(href);
    return `<a class="dtile portal-card" href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}><small class="pill">${esc(tag)}${ext ? ' ↗' : ''}</small><h3>${esc(t)}</h3><span class="muted">${esc(d)}</span></a>`;
  }).join('')}</div>`).join('');
}

module({
  id: 'portal',
  public: ['/portal'],
  routes: {
    '/portal': () => ({
      title: 'Πύλη', bare: !db.backend,
      html: `${db.backend ? '' : '<p><a href="#/connect">← Σύνδεση</a></p>'}<h1>🏛 Πύλη Μεγάλης Γραμματείας</h1><p class="muted">Εθνική Μεγάλη Στοά της Ελλάδος — όλες οι εφαρμογές και ιστοσελίδες σε ένα σημείο.</p>${portalHtml()}`,
    }),
  },
  tile: { order: 90, render: () => `<div class="dtile"><h3><a href="#/portal">🏛 Πύλη</a></h3><div class="muted">Έντυπο Διατάγματος, Τεκτονικές Ομιλίες, φόρμες εγγραφής, άλλα Γραφεία</div>
<div class="acts"><a class="btn primary" href="#/portal">Άνοιγμα</a><a class="btn" href="diatagma/">Έντυπο Διατάγματος</a></div></div>` },
});
