// Αρχική σελίδα (πλακίδια όλων των ενοτήτων), επιλογή Υπογράφοντος και το κεντρικό μενού της εφαρμογής.
// Το μενού ορίζεται μόνο εδώ, ώστε να φαίνεται και να αλλάζει σε ένα σημείο.
import { module, tilesHtml, bannersHtml, ACTORS, actor, setActor, bind, go, flash } from '../core/app.js';
import { esc } from '../core/util.js';

const M = (title, order, items, cls) => ({ title, order, items: items.map(([label, href]) => (label === '-' ? { sep: true } : { label, href })), cls });

module({
  id: 'home',
  menu: [
    M('Επιστολές', 10, [['+ Νέα Επιστολή', '#/letters/new'], ['Αρχείο Επιστολών', '#/letters'], ['-'], ['Πρότυπα Επιστολών', '#/templates']], 'letters'),
    M('Διατάγματα', 20, [['+ Νέο Διάταγμα', '#/decrees/new'], ['Αρχείο Διαταγμάτων', '#/decrees']]),
    M('Εργασίες ΜΔ', 30, [['Επισκέψεις Στοών', '#/visits'], ['+ Νέα επίσκεψη', '#/visits/new'], ['Ενημέρωση Επαρχίας', '#/visits/publish'], ['Αναφορά επισκέψεων', '#/visits/report'], ['Εκπρόσωποι ΜΔ', '#/reps'], ['-'],
      ['🎉 Εορτολόγιο & ευχές', '#/namedays'], ['Πρότζεκτ ΜΔ', '#/projects']]),
    { title: '📇 Κατάλογος', order: 40, href: '#/directory' },
    M('Μητρώα', 50, [['📇 Κατάλογος (Επαρχίες & Στοές)', '#/directory'], ['-'], ['Μητρώο Μελών', '#/members'], ['Συμβολικές Στοές', '#/lodges'], ['Επαρχιακές Μεγάλες Στοές', '#/provinces'], ['-'], ['Επετηρίδα', '#/epeteirida'],
      ['-'], ['🗄 Βάση Δεδομένων', '#/database'], ['📖 Βιβλίο Πρωτοκόλλου', '#/database/protocol']]),
    M('Διαχείριση', 60, [['Ρυθμίσεις', '#/settings'], ['🗄 Βάση Δεδομένων', '#/database'], ['💾 Αντίγραφο & μεταφορά δεδομένων', '#/database/backup'], ['🩺 Έλεγχος εφαρμογής', '#/system']]),
  ],
  routes: {
    '/': () => ({
      title: 'Αρχική',
      html: `<div class="hero"><div><h1>Μεγάλη Γραμματεία</h1><p>Όλη η δουλειά της Γραμματείας σε ένα σημείο — τι εκκρεμεί σε κάθε ενότητα και οι συχνές ενέργειες.</p></div>
<div class="toolbar"><a class="btn primary" href="#/letters/new">+ Νέα Επιστολή</a><a class="btn" href="#/decrees/new">+ Νέο Διάταγμα</a></div></div>${bannersHtml()}${tilesHtml()}`,
    }),
    '/identity': () => ({
      title: 'Υπογράφων',
      html: `<h1>Ποιος υπογράφει;</h1><p class="muted">Ισχύει για τις νέες Επιστολές και τα Διατάγματα από αυτή τη συσκευή.</p>
<div class="identity-grid">${Object.entries(ACTORS).map(([k, v]) => `<div class="card identity-card"><h2>${esc(v)}</h2><p class="muted">${k === 'nikolaos' ? 'Αν. Μέγας Γραμματέας' : 'Μέγας Γραμματέας'}</p>
<button class="btn${actor() === k ? ' primary' : ''}" data-act="pick" data-k="${k}">${actor() === k ? '✓ Επιλεγμένος' : 'Επιλογή'}</button></div>`).join('')}</div>`,
      mount(el) { bind(el, { pick: (d) => { setActor(d.k); flash(`Υπογράφων: ${ACTORS[d.k]}`); go('/'); } }); },
    }),
  },
});
