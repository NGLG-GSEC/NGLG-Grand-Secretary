// Αρχική σελίδα (πλακίδια όλων των ενοτήτων), επιλογή Υπογράφοντος και το κεντρικό μενού της εφαρμογής.
// Το μενού ορίζεται μόνο εδώ, ώστε να φαίνεται και να αλλάζει σε ένα σημείο.
import { module, tilesHtml, bannersHtml, ACTORS, actor, setActor, bind, go, flash } from '../core/app.js';
import { esc } from '../core/util.js';

const M = (title, order, items, cls) => ({ title, order, items: items.map(([label, href, external]) => (label === '-' ? { sep: true } : { label, href, external: !!external })), cls });

module({
  id: 'home',
  // Ενιαία δομή: κάθε ενότητα μία φορά, με τη σειρά της δουλειάς (οι Επισκέψεις ΜΔ με τα βήματα ①–⑤ της ροής)
  menu: [
    { title: '📋 Αναφορά εκπροσώπησης ΜΔ', order: 5, href: '#/visits/gm-programme', cls: 'navbtn' },
    { title: '🔒 Ενημέρωση ΜΔ', order: 6, href: '#/declarations?view=report', cls: 'navbtn' },
    M('✉ Έγγραφα', 10, [['+ Νέα Επιστολή', '#/letters/new'], ['Αρχείο Επιστολών', '#/letters'], ['-'], ['+ Διάταγμα ΕΝ ΕΝΕΡΓΕΙΑ', '#/decrees/new'], ['+ Διάταγμα ΠΡΩΗΝ', '#/decrees/new?kind=decree-provincial'], ['+ Διάταγμα ΤΑΞΗ ΜΔ', '#/decrees/new?kind=decree-service'], ['+ Γενικό Διάταγμα', '#/decrees/new?kind=decree-general'], ['Αρχείο Διαταγμάτων', '#/decrees'], ['-'], ['🎓 + Δίπλωμα Διδασκάλου Τέκτονος (A3)', '#/members/diploma'], ['-'], ['Πρότυπα (Επιστολές & Διατάγματα)', '#/templates'], ['📖 Βιβλίο Πρωτοκόλλου', '#/database/protocol']], 'letters'),
    M('👥 Μητρώο', 20, [['Μητρώο Μελών', '#/members'], ['🏛 Μητρώο Μελών ΣΓΥ', '#/members/sgy'], ['🪪 Κάρτα Μέλους', '#/members/card'], ['🎓 Διπλώματα Διδασκάλου', '#/members/diplomas'], ['📖 Πρωτόκολλο Διπλωμάτων Διδασκάλων Τεκτόνων', '#/members/diplomas?tab=protocol'], ['🏛 Διπλώματα ανά Στοά', '#/members/diplomas?tab=lodges'], ['⬆ Φόρτωση Διπλωμάτων (Excel)', '#/members/diplomas?tab=import'], ['📜 Επετηρίδα (πίνακας)', '#/epeteirida/pinakas'], ['Ιστορικό αξιωμάτων', '#/epeteirida'], ['-'], ['Συμβολικές Στοές', '#/lodges'], ['Επαρχιακές Μεγάλες Στοές', '#/provinces'], ['🏛 Στοές με < 12 κύρια μέλη', '#/members/small-lodges'], ['-'], ['🔐 Πύλη Γραμματέων Στοών (Μητρώα Στοών)', '#/lodge-portal'], ['-'], ['📇 Κατάλογος (Επαρχίες & Στοές)', '#/directory'], ['👥 Επαφές & Ομάδες (Google)', '#/contacts']]),
    M('🏛 ΣΓΥ', 25, [['🏛 ΣΓΥ — Μέλη', '#/sgy'], ['📋 Παρουσιολόγιο ΣΓΥ', '#/sgy/attendance'], ['✉ Νέα Επιστολή προς ΣΓΥ', '#/letters/new?category=ΣΓΥ&to_name=' + encodeURIComponent('Προς τα Μέλη του Συμβουλίου Γενικών Υποθέσεων')], ['Επιστολές ΣΓΥ', '#/letters?category=ΣΓΥ']]),
    M('📅 Επισκέψεις ΜΔ', 30, [['① Πρόγραμμα Εγκαταστάσεων', '#/visits'], ['② Δηλώσεις Διάθεσης Μ. Αξιωματικών', '#/declarations'], ['③ Αποφάσεις Μ.Δ.', '#/visits/decisions'], ['④ Ενημέρωση Επαρχίας', '#/visits/publish'], ['⑤ Αναφορά επισκέψεων', '#/visits/report'], ['-'], ['+ Νέα επίσκεψη', '#/visits/new'], ['Εκπρόσωποι ΜΔ', '#/reps'], ['Στοές χωρίς ημερομηνία Εγκατάστασης', '#/visits/missing']]),
    M('🎉 Εορτολόγιο & Πρότζεκτ', 35, [['🎉 Εορτολόγιο & ευχές', '#/namedays'], ['Πρότζεκτ ΜΔ', '#/projects']]),
    M('🌐 Δημόσιες σελίδες', 40, [['Πρόγραμμα επισκέψεων ΜΔ ↗', 'programme/', true], ['Δηλώσεις Διάθεσης ↗', 'declarations/', true], ['Πύλη Γραμματέων Στοών ↗', 'lodge/', true], ['-'], ['Ψηφιακό Έντυπο Διατάγματος', 'diatagma/'], ['⚖ Καγκελαρία — Πατέντες & Αναγνώριση', 'chancellor/'], ['🏛 Πύλη (όλες οι εφαρμογές)', '#/portal']]),
    M('⚙ Διαχείριση', 50, [['Ρυθμίσεις', '#/settings'], ['✍ Ποιος υπογράφει', '#/identity'], ['-'], ['🗄 Βάση Δεδομένων', '#/database'], ['💾 Αντίγραφο & μεταφορά δεδομένων', '#/database/backup'], ['🩺 Έλεγχος εφαρμογής', '#/system']]),
  ],
  routes: {
    '/': () => ({
      title: 'Αρχική',
      html: `<div class="hero home-hero"><div><h1>Μεγάλη Γραμματεία</h1><p>Όλη η δουλειά της Γραμματείας σε ένα σημείο — τι εκκρεμεί σε κάθε ενότητα και οι συχνές ενέργειες.</p></div>
<div class="toolbar"><a class="btn primary" href="#/letters/new">+ Νέα Επιστολή</a><details class="archdrop"><summary class="btn">ΑΡΧΕΙΟ ΕΠΙΣΤΟΛΩΝ <span class="caret">▾</span></summary><div class="archdrop-menu"><a href="#/decrees">ΔΙΑΤΑΓΜΑΤΑ</a><a href="#/letters">ΕΠΙΣΤΟΛΕΣ</a></div></details><a class="btn" href="#/decrees/new">+ Νέο Διάταγμα</a><a class="btn" href="#/members/diploma">🎓 + Δίπλωμα Διδασκάλου Τέκτονος</a></div></div>${bannersHtml()}${tilesHtml()}`,
    }),
    '/identity': () => ({
      title: 'Υπογράφων',
      html: `<h1>Ποιος υπογράφει;</h1><p class="muted">Ισχύει για τις νέες Επιστολές και τα Διατάγματα από αυτή τη συσκευή.</p>
<div class="identity-grid">${Object.entries(ACTORS).map(([k, v]) => `<div class="card identity-card"><h2>${esc(v)}</h2><p class="muted">${k === 'nikolaos' ? 'Αν. Μέγας Γραμματεύς' : 'Μέγας Γραμματεύς'}</p>
<button class="btn${actor() === k ? ' primary' : ''}" data-act="pick" data-k="${k}">${actor() === k ? '✓ Επιλεγμένος' : 'Επιλογή'}</button></div>`).join('')}</div>`,
      mount(el) { bind(el, { pick: (d) => { setActor(d.k); flash(`Υπογράφων: ${ACTORS[d.k]}`); go('/'); } }); },
    }),
  },
});

// Σύνταγμα (Βοηθός Συντάγματος): πλακίδιο στην Αρχική που ανοίγει μόνο την αυτόνομη σελίδα constitution/ σε νέα καρτέλα
module({
  id: 'constitution-tile',
  tile: { order: 32, render: () => `<div class="dtile"><h3><a href="constitution/" target="_blank" rel="noopener">📜 Σύνταγμα</a></h3><div class="muted">Βοηθός Συντάγματος — Γενικοί Νόμοι και Κανονισμοί (αυτόνομη σελίδα, για αποστολή)</div>
<div class="acts"><a class="btn primary" href="constitution/" target="_blank" rel="noopener">Άνοιγμα ↗</a></div></div>` },
});
