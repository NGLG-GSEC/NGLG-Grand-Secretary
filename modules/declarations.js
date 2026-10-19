// Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών για εκπροσώπηση του ΜΔ σε Εγκαταστάσεις.
// Η σελίδα ζει μέσα σε αυτό το αποθετήριο (declarations/, μεταφέρθηκε από το GrandOfficersVisitsRepresentGM).
// Μία μόνο σελίδα στην εφαρμογή (#/declarations): τα κουμπιά αλλάζουν το περιεχόμενο επί τόπου (Δήλωση, Πρόγραμμα, Αναφορά,
// Βοηθός Συντάγματος). Η «Διαχειριστική Αναφορά & PDF» ζητά πάντα τον κωδικό πρόσβασης· ο έλεγχος γίνεται στον server
// της σελίδας (ADMIN_KEY του Apps Script), ώστε ο κωδικός να μη γράφεται πουθενά στον δημόσιο κώδικα.
import { module } from '../core/app.js';
import { db } from '../core/store.js';

export const DECLARATIONS_URL = 'declarations/';
// Βοηθός Συντάγματος: ψηφιακό ευρετήριο των Γενικών Νόμων και Κανονισμών (constitution/index.html)
export const CONSTITUTION_URL = 'constitution/index.html';
export const CONSTITUTION_PUBLIC = 'constitution/'; // αυτόνομη σελίδα για αποστολή

// Ο παλιός «Κωδικός αναφοράς» (άνοιγμα της αναφοράς χωρίς κωδικό) καταργήθηκε· σβήνεται και από τα δεδομένα
db.migrate('declarations-key-removed-2026-10', (tx) => { if (tx.setting('declarations_report_key')) tx.setting('declarations_report_key', ''); });

const VIEWS = [['form', 'Δήλωση Ενδιαφέροντος'], ['programme', 'Πρόγραμμα Επισκέψεων Μ.Δ.'], ['report', '🔒 Διαχειριστική Αναφορά & PDF'], ['constitution', '📜 Βοηθός Συντάγματος']];
const srcOf = (v) => (v === 'constitution' ? CONSTITUTION_URL : `${DECLARATIONS_URL}?embed=1#${v}`);
const frameHtml = (id, title, src) => `<iframe id="${id}" class="embed-frame" title="${title}" src="${src}"></iframe>`;

function declarationsPage({ query }) {
  return {
    title: 'Δηλώσεις Διάθεσης Μ. Αξιωματικών',
    html: `<h1>Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών</h1>
<p class="muted">Εκπροσώπηση του Μεγάλου Διδασκάλου σε Εγκαταστάσεις Σεβ. Διδασκάλων: οι αξιωματικοί δηλώνουν και η Γραμματεία ορίζει εκπροσώπους στις <a href="#/visits">Επισκέψεις Στοών</a>.
Η Διαχειριστική Αναφορά ανοίγει με τον κωδικό πρόσβασης. <a href="${DECLARATIONS_URL}" target="_blank" rel="noopener">Δημόσια σελίδα ↗</a></p>
<nav class="decltabs">${VIEWS.map(([v, l]) => `<button type="button" class="btn${v === 'form' ? ' primary' : ''}" data-view="${v}">${l}</button>`).join('')}</nav>
<div class="card share-const" hidden><b>🔗 Αυτόνομη σελίδα Συντάγματος (για αποστολή):</b> <a id="constLink" href="${CONSTITUTION_PUBLIC}" target="_blank" rel="noopener">${new URL(CONSTITUTION_PUBLIC, location.href).href}</a>
<button type="button" class="btn small" data-copy-const>📋 Αντιγραφή συνδέσμου</button><br><small class="muted">Ανοίγει μόνο το Σύνταγμα, χωρίς μενού, σύνδεση ή στοιχεία της Γραμματείας.</small></div>
${frameHtml('declFrame', 'Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών', srcOf('form'))}
<section class="card constitution-box"><h2 style="margin-top:0">📜 ΒΟΗΘΟΣ ΣΥΝΤΑΓΜΑΤΟΣ</h2><p class="muted">Αναζήτηση στους Γενικούς Νόμους και Κανονισμούς (π.χ. Κανόνες 123 και 144 για την εκπροσώπηση του Μεγάλου Διδασκάλου). <a href="${CONSTITUTION_URL}" target="_blank" rel="noopener">Άνοιγμα σε νέα καρτέλα ↗</a></p>${frameHtml('constFrame', 'Βοηθός Συντάγματος', CONSTITUTION_URL)}</section>`,
    mount(el) {
      // παλιοί σύνδεσμοι «?view=…» → η μία σελίδα
      if (query.view) history.replaceState(null, '', '#/declarations');
      const frame = el.querySelector('#declFrame'), share = el.querySelector('.share-const'), box = el.querySelector('.constitution-box');
      const show = (v) => {
        el.querySelectorAll('.decltabs [data-view]').forEach((b) => b.classList.toggle('primary', b.dataset.view === v));
        frame.src = srcOf(v);
        frame.title = v === 'constitution' ? 'Βοηθός Συντάγματος' : 'Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών';
        share.hidden = v !== 'constitution';
        box.hidden = v !== 'form';
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
      const cb = el.querySelector('[data-copy-const]');
      cb.addEventListener('click', async () => { try { await navigator.clipboard.writeText(el.querySelector('#constLink').href); cb.textContent = '✓ Αντιγράφηκε'; } catch { cb.textContent = 'Αντιγράψτε τον σύνδεσμο'; } });
      const cf = el.querySelector('#constFrame');
      const fitC = () => { if (!cf.isConnected || box.hidden) return; try { const h = cf.contentDocument && cf.contentDocument.documentElement.scrollHeight; if (h && Math.abs(h - cf.offsetHeight) > 2) cf.style.height = Math.min(h, 2400) + 'px'; } catch { /* */ } };
      const timer = setInterval(() => { fit(); fitC(); }, 800);
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
