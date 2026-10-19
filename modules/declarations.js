// Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών για εκπροσώπηση του ΜΔ σε Εγκαταστάσεις.
// Η σελίδα ζει στο αποθετήριο NGLG-GSEC/GrandOfficersVisitsRepresentGM και ανοίγει εδώ ολόκληρη (Δήλωση, Πρόγραμμα, Αναφορά),
// ώστε όλα να γίνονται από την Ψηφιακή Μεγάλη Γραμματεία. Η Αναφορά ανοίγει χωρίς κωδικό: η εφαρμογή στέλνει στη σελίδα
// τον κωδικό της αναφοράς από τις Ρυθμίσεις (μόνο όταν η σελίδα είναι στο ίδιο domain).
import { module } from '../core/app.js';
import { db } from '../core/store.js';

export const DECLARATIONS_URL = 'https://nglg-gsec.github.io/GrandOfficersVisitsRepresentGM/';
db.defaultSettings({ declarations_report_key: '' });

const TABS = [['form', 'Δήλωση Ενδιαφέροντος'], ['programme', 'Πρόγραμμα Επισκέψεων Μ.Δ.'], ['report', 'Διαχειριστική Αναφορά & PDF'], ['constitution', '📜 Βοηθός Συντάγματος']];
// Βοηθός Συντάγματος: ψηφιακό ευρετήριο των Γενικών Νόμων και Κανονισμών (constitution/index.html)
export const CONSTITUTION_URL = 'constitution/index.html';
const frameHtml = (id, title, src) => `<iframe id="${id}" class="embed-frame" title="${title}" src="${src}"></iframe>`;

function declarationsPage({ query }) {
  const view = TABS.some(([v]) => v === query.view) ? query.view : 'report';
  const src = view === 'constitution' ? CONSTITUTION_URL : `${DECLARATIONS_URL}?embed=1#${view}`;
  const tabs = `<nav class="decltabs">${TABS.map(([v, l]) => `<a class="btn${v === view ? ' primary' : ''}" href="#/declarations?view=${v}">${l}</a>`).join('')}</nav>`;
  return {
    title: 'Δηλώσεις Διάθεσης Μ. Αξιωματικών',
    html: `<h1>Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών</h1>
<p class="muted">Εκπροσώπηση του Μεγάλου Διδασκάλου σε Εγκαταστάσεις Σεβ. Διδασκάλων: οι αξιωματικοί δηλώνουν, η Γραμματεία βλέπει την αναφορά και ορίζει εκπροσώπους στις <a href="#/visits">Επισκέψεις Στοών</a>.
${db.setting('declarations_report_key') ? '' : ' Για να ανοίγει η αναφορά χωρίς κωδικό, συμπληρώστε τον «Κωδικό αναφοράς» στις <a href="#/settings">Ρυθμίσεις</a>.'}
<a href="${DECLARATIONS_URL}" target="_blank" rel="noopener">Δημόσια σελίδα ↗</a></p>
${tabs}${frameHtml('declFrame', view === 'constitution' ? 'Βοηθός Συντάγματος' : 'Δηλώσεις Διάθεσης Μεγάλων Αξιωματικών', src)}
${view === 'form' ? `<section class="card constitution-box"><h2 style="margin-top:0">📜 ΒΟΗΘΟΣ ΣΥΝΤΑΓΜΑΤΟΣ</h2><p class="muted">Αναζήτηση στους Γενικούς Νόμους και Κανονισμούς (π.χ. Κανόνες 123 και 144 για την εκπροσώπηση του Μεγάλου Διδασκάλου). <a href="${CONSTITUTION_URL}" target="_blank" rel="noopener">Άνοιγμα σε νέα καρτέλα ↗</a></p>${frameHtml('constFrame', 'Βοηθός Συντάγματος', CONSTITUTION_URL)}</section>` : ''}`,
    mount(el) {
      const frame = el.querySelector('#declFrame');
      const target = new URL(DECLARATIONS_URL).origin;
      const sendKey = () => {
        const key = String(db.setting('declarations_report_key') || '').trim();
        // Ο κωδικός πηγαίνει μόνο σε σελίδα του ίδιου domain (nglg-gsec.github.io)
        if (key && target === location.origin) frame.contentWindow.postMessage({ type: 'nglg-declarations-key', key }, target);
      };
      // Ύψος = ύψος περιεχομένου, χωρίς δεύτερη μπάρα κύλισης (όταν επιτρέπεται, δηλαδή στο ίδιο domain)
      const fit = () => {
        if (!frame.isConnected) { clearInterval(timer); return; }
        try {
          const h = frame.contentDocument && frame.contentDocument.documentElement.scrollHeight;
          if (h && Math.abs(h - frame.offsetHeight) > 2) frame.style.height = h + 'px';
        } catch { /* άλλο domain: σταθερό ύψος από το CSS */ }
      };
      const cf = el.querySelector('#constFrame');
      const fitC = () => { if (!cf || !cf.isConnected) return; try { const h = cf.contentDocument && cf.contentDocument.documentElement.scrollHeight; if (h && Math.abs(h - cf.offsetHeight) > 2) cf.style.height = Math.min(h, 2400) + 'px'; } catch { /* */ } };
      const timer = setInterval(() => { fit(); fitC(); }, 800);
      frame.addEventListener('load', () => { sendKey(); fit(); });
    },
  };
}

module({
  id: 'declarations',
  routes: { '/declarations': declarationsPage },
  tile: { order: 31, render: () => `<div class="dtile"><h3><a href="#/declarations">Δηλώσεις Διάθεσης Μ. Αξιωματικών</a></h3><div class="muted">Εκπροσώπηση ΜΔ σε Εγκαταστάσεις — δηλώσεις, πρόγραμμα, αναφορά</div>
<div class="acts"><a class="btn primary" href="#/declarations">Αναφορά δηλώσεων</a><a class="btn" href="#/declarations?view=form">Φόρμα δήλωσης</a></div></div>` },
});
