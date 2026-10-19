// Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών για εκπροσώπηση του ΜΔ σε Εγκαταστάσεις.
// Μία σελίδα (#/declarations): η σελίδα του αποθετηρίου NGLG-GSEC/GrandOfficersVisitsRepresentGM (Δήλωση, Πρόγραμμα)
// ανοίγει εδώ ολόκληρη. Η «Διαχειριστική Αναφορά & PDF» ζητά πάντα τον κωδικό πρόσβασης· ο έλεγχος γίνεται στον server
// της σελίδας (ADMIN_KEY του Apps Script), ώστε ο κωδικός να μη γράφεται πουθενά στον δημόσιο κώδικα.
import { module } from '../core/app.js';
import { db } from '../core/store.js';

// Ο παλιός «Κωδικός αναφοράς» (άνοιγμα της αναφοράς χωρίς κωδικό) καταργήθηκε· σβήνεται και από τα δεδομένα
db.migrate('declarations-key-removed-2026-10', (tx) => { if (tx.setting('declarations_report_key')) tx.setting('declarations_report_key', ''); });

export const DECLARATIONS_URL = 'https://nglg-gsec.github.io/GrandOfficersVisitsRepresentGM/';

function declarationsPage() {
  return {
    title: 'Δηλώσεις Διάθεσης Μ. Αξιωματικών',
    html: `<h1>Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών</h1>
<p class="muted">Εκπροσώπηση του Μεγάλου Διδασκάλου σε Εγκαταστάσεις Σεβ. Διδασκάλων: οι αξιωματικοί δηλώνουν και η Γραμματεία ορίζει εκπροσώπους στις <a href="#/visits">Επισκέψεις Στοών</a>.
<a href="${DECLARATIONS_URL}" target="_blank" rel="noopener">Δημόσια σελίδα ↗</a></p>
<div class="toolbar"><button type="button" class="btn primary" id="declReport">🔒 Διαχειριστική Αναφορά & PDF</button><span class="muted" style="align-self:center">Ανοίγει με τον κωδικό πρόσβασης.</span></div>
<iframe id="declFrame" class="embed-frame" title="Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών" src="${DECLARATIONS_URL}?embed=1#form"></iframe>`,
    mount(el) {
      const frame = el.querySelector('#declFrame');
      // Η αναφορά είναι καρτέλα της ίδιας σελίδας: εκεί ζητείται ο κωδικός (ή είσοδος Google της Γραμματείας)
      el.querySelector('#declReport').addEventListener('click', () => { frame.src = `${DECLARATIONS_URL}?embed=1#report`; frame.scrollIntoView({ behavior: 'smooth' }); });
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
