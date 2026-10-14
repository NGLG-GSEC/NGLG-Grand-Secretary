// Αρχική σελίδα (πλακίδια όλων των ενοτήτων), επιλογή Υπογράφοντος και το κεντρικό μενού της εφαρμογής.
// Το μενού ορίζεται μόνο εδώ, ώστε να φαίνεται και να αλλάζει σε ένα σημείο.
import { module, tilesHtml, bannersHtml, ACTORS, actor, setActor, bind, go, flash } from '../core/app.js';
import { esc } from '../core/util.js';

const M = (title, order, items, cls) => ({ title, order, items: items.map(([label, href]) => (label === '-' ? { sep: true } : { label, href })), cls });

module({
  id: 'home',
  menu: [
    { title: '📋 Αναφορά εκπροσώπησης ΜΔ', order: 5, href: '#/visits/gm-programme', cls: 'navbtn' },
    M('✉ Έγγραφα', 10, [['+ Νέα Επιστολή', '#/letters/new'], ['Αρχείο Επιστολών', '#/letters'], ['Πρότυπα (Επιστολές & Διατάγματα)', '#/templates'], ['-'], ['+ Νέο Διάταγμα Διορισμού ΜΑΞ', '#/decrees/new'], ['+ Νέο Γενικό Διάταγμα', '#/decrees/new?kind=decree-general'], ['Αρχείο Διαταγμάτων', '#/decrees'], ['Ψηφιακό Έντυπο Διατάγματος', 'diatagma/'], ['-'], ['📖 Βιβλίο Πρωτοκόλλου', '#/database/protocol']], 'letters'),
    M('🏛 Στοές & Μέλη', 20, [['📇 Κατάλογος (Επαρχίες & Στοές)', '#/directory'], ['👥 Επαφές & Ομάδες (Google)', '#/contacts'], ['Μητρώο Μελών', '#/members'], ['Συμβολικές Στοές', '#/lodges'], ['Επαρχιακές Μεγάλες Στοές', '#/provinces'], ['-'], ['📜 Επετηρίδα (πίνακας)', '#/epeteirida/pinakas'], ['Ιστορικό αξιωμάτων', '#/epeteirida']]),
    M('📅 Δραστηριότητα', 30, [['Επισκέψεις Στοών', '#/visits'], ['+ Νέα επίσκεψη', '#/visits/new'], ['Ενημέρωση Επαρχίας', '#/visits/publish'], ['Αναφορά επισκέψεων', '#/visits/report'], ['Εκπρόσωποι ΜΔ', '#/reps'], ['-'], ['🎉 Εορτολόγιο & ευχές', '#/namedays'], ['Πρότζεκτ ΜΔ', '#/projects']]),
    M('🌐 Άλλα Γραφεία', 40, [['🏛 Πύλη (όλες οι εφαρμογές)', '#/portal'], ['⚖ Καγκελαρία — Πατέντες & Αναγνώριση', 'chancellor/']]),
    M('⚙ Ρυθμίσεις', 50, [['Ρυθμίσεις', '#/settings'], ['✍ Ποιος υπογράφει', '#/identity'], ['-'], ['🗄 Βάση Δεδομένων', '#/database'], ['💾 Αντίγραφο & μεταφορά δεδομένων', '#/database/backup'], ['🩺 Έλεγχος εφαρμογής', '#/system']]),
  ],
  routes: {
    '/': () => ({
      title: 'Αρχική',
      html: `<div class="hero"><div><h1>Μεγάλη Γραμματεία</h1><p>Όλη η δουλειά της Γραμματείας σε ένα σημείο — τι εκκρεμεί σε κάθε ενότητα και οι συχνές ενέργειες.</p></div>
<div class="toolbar"><a class="btn primary" href="#/letters/new">+ Νέα Επιστολή</a><details class="archdrop"><summary class="btn">ΑΡΧΕΙΟ ΕΠΙΣΤΟΛΩΝ <span class="caret">▾</span></summary><div class="archdrop-menu"><a href="#/decrees">ΔΙΑΤΑΓΜΑΤΑ</a><a href="#/letters">ΕΠΙΣΤΟΛΕΣ</a></div></details><a class="btn" href="#/decrees/new">+ Νέο Διάταγμα</a></div></div>${bannersHtml()}${tilesHtml()}`,
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
