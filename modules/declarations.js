// Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών για εκπροσώπηση του ΜΔ σε Εγκαταστάσεις.
// Η σελίδα ζει μέσα σε αυτό το αποθετήριο (declarations/, μεταφέρθηκε από το GrandOfficersVisitsRepresentGM).
// Μία μόνο σελίδα στην εφαρμογή (#/declarations): τα κουμπιά αλλάζουν το περιεχόμενο επί τόπου (Δήλωση, Πρόγραμμα, Αναφορά).
// Το Σύνταγμα ζει μόνο στη δική του αυτόνομη σελίδα (constitution/) και δεν εμφανίζεται εδώ. Η «Διαχειριστική Αναφορά & PDF» ζητά πάντα τον κωδικό πρόσβασης· ο έλεγχος γίνεται στον server
// της σελίδας (ADMIN_KEY του Apps Script), ώστε ο κωδικός να μη γράφεται πουθενά στον δημόσιο κώδικα.
import { module } from '../core/app.js';
import { db } from '../core/store.js';

export const DECLARATIONS_URL = 'declarations/';

// Ο παλιός «Κωδικός αναφοράς» (άνοιγμα της αναφοράς χωρίς κωδικό) καταργήθηκε· σβήνεται και από τα δεδομένα
db.migrate('declarations-key-removed-2026-10', (tx) => { if (tx.setting('declarations_report_key')) tx.setting('declarations_report_key', ''); });

const VIEWS = [['form', 'Δήλωση Ενδιαφέροντος'], ['programme', 'Πρόγραμμα Επισκέψεων Μ.Δ.'], ['report', '🔒 Διαχειριστική Αναφορά & PDF']];
const srcOf = (v) => `${DECLARATIONS_URL}?embed=1#${v}`;
const frameHtml = (id, title, src) => `<iframe id="${id}" class="embed-frame" title="${title}" src="${src}"></iframe>`;

function declarationsPage({ query }) {
  return {
    title: 'Δηλώσεις Διάθεσης Μ. Αξιωματικών',
    html: `<h1>Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών</h1>
<p class="muted">Εκπροσώπηση του Μεγάλου Διδασκάλου σε Εγκαταστάσεις Σεβ. Διδασκάλων: οι αξιωματικοί δηλώνουν και η Γραμματεία ορίζει εκπροσώπους στις <a href="#/visits">Επισκέψεις Στοών</a>.
Η Διαχειριστική Αναφορά ανοίγει με τον κωδικό πρόσβασης. <a href="${DECLARATIONS_URL}" target="_blank" rel="noopener">Δημόσια σελίδα ↗</a></p>
<nav class="decltabs">${VIEWS.map(([v, l]) => `<button type="button" class="btn${v === 'form' ? ' primary' : ''}" data-view="${v}">${l}</button>`).join('')}</nav>
${frameHtml('declFrame', 'Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών', srcOf('form'))}
`,
    mount(el) {
      // παλιοί σύνδεσμοι «?view=…» → η μία σελίδα
      if (query.view) history.replaceState(null, '', '#/declarations');
      const frame = el.querySelector('#declFrame');
      const show = (v) => {
        el.querySelectorAll('.decltabs [data-view]').forEach((b) => b.classList.toggle('primary', b.dataset.view === v));
        frame.src = srcOf(v);
      };
      el.querySelector('.decltabs').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) show(b.dataset.view); });
      // Ύψος = ύψος περιεχομένου, χωρίς δεύτερη μπάρα κύλισης (όταν επιτρέπεται, δηλαδή στο ίδιο domain)
      const fit = () => {
        if (!frame.isConnected) { clearInterval(timer); return; }
        try {
          const h = frame.contentDocument && frame.contentDocument.documentElement.scrollHeight;
          if (h && Math.abs(h - frame.offsetHeight) > 2) frame.style.height = h + 'px';
        } catch { /* άλλο domain: σταθερό ύψος από το CSS */ }
      };
      const timer = setInterval(fit, 800);
      frame.addEventListener('load', fit);
    },
  };
}

module({
  id: 'declarations',
  routes: { '/declarations': declarationsPage },
  tile: { order: 31, render: () => `<div class="dtile"><h3><a href="#/declarations">Δηλώσεις Διάθεσης Μ. Αξιωματικών</a></h3><div class="muted">Εκπροσώπηση ΜΔ σε Εγκαταστάσεις — δηλώσεις, πρόγραμμα, αναφορά</div>
<div class="acts"><a class="btn primary" href="#/declarations">Άνοιγμα</a></div></div>` },
});
