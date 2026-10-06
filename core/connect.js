// Σύνδεση με τα δεδομένα: μία φορά σε κάθε συσκευή. Τα στοιχεία μένουν μόνο σε αυτόν τον browser.
import { GitHubBackend, LocalBackend } from './backend.js';
import { db } from './store.js';
import { module, onSubmit, render, toast, bind } from './app.js';
import { esc } from './util.js';

const KEY = 'nglg-connection';
export const DEFAULT_REPO = 'NGLG-GSEC/nglg-grammateia-data';
export function savedConnection() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function saveConnection(c) { try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch { /* */ } }

export function backendFor(c) {
  if (!c) return null;
  if (c.kind === 'local') return new LocalBackend();
  const [owner, repo] = String(c.repo || DEFAULT_REPO).split('/');
  return new GitHubBackend({ owner, repo, token: c.token, api: c.api });
}

export async function connect(c) {
  const b = backendFor(c);
  await db.open(b);
  saveConnection(c);
}
export function disconnect() { saveConnection(null); db.backend = null; location.hash = '#/connect'; location.reload(); }

function connectPage({ query }) {
  const c = savedConnection() || {};
  const [owner] = DEFAULT_REPO.split('/');
  const newRepo = `https://github.com/new?owner=${owner}&name=nglg-grammateia-data&visibility=private&description=${encodeURIComponent('Δεδομένα Ψηφιακής Μεγάλης Γραμματείας (ιδιωτικό)')}`;
  const newToken = 'https://github.com/settings/tokens/new?scopes=repo&description=' + encodeURIComponent('Μεγάλη Γραμματεία');
  return {
    title: 'Σύνδεση', bare: true,
    html: `<div class="auth" style="max-width:640px;text-align:left"><div style="text-align:center"><img class="logo" src="img/header_emblem.png" alt=""><h1>Ψηφιακή Μεγάλη Γραμματεία</h1>
<p class="muted">Σύνδεση με τα δεδομένα — μία φορά σε κάθε συσκευή.</p></div>
${query.error ? `<div class="card toast error" style="position:static">${esc(query.error)}</div>` : ''}
<form class="card" id="ghForm"><h2 style="margin-top:0">Σύνδεση</h2>
<label>Αποθετήριο δεδομένων (ιδιωτικό)</label><input name="repo" value="${esc(c.repo || DEFAULT_REPO)}" required>
<label style="margin-top:12px">Κωδικός πρόσβασης GitHub (token)</label><input name="token" type="password" value="${esc(c.token || '')}" autocomplete="off" required placeholder="ghp_… ή github_pat_…">
<div class="toolbar" style="margin-top:14px"><button class="btn primary">Σύνδεση</button></div>
<details class="fold" style="margin-top:14px"><summary><b>Πρώτη φορά; Οδηγίες (2 λεπτά)</b></summary><ol class="steps">
<li><b>Μία φορά για όλους:</b> <a href="${newRepo}" target="_blank" rel="noopener">δημιουργήστε το ιδιωτικό αποθετήριο δεδομένων</a> (όνομα <code>nglg-grammateia-data</code>, <b>Private</b>) → «Create repository». Αν υπάρχει ήδη, παραλείψτε.</li>
<li><a href="${newToken}" target="_blank" rel="noopener">Δημιουργήστε κωδικό πρόσβασης</a> → κάτω-κάτω «Generate token» → αντιγράψτε τον (ξεκινά με <code>ghp_</code>).</li>
<li>Επικολλήστε τον παραπάνω και πατήστε «Σύνδεση». Ο κωδικός μένει μόνο σε αυτή τη συσκευή.</li></ol>
<p class="muted">Τα δεδομένα (μέλη, Στοές, πρωτόκολλο…) αποθηκεύονται μόνο στο ιδιωτικό αποθετήριο· κάθε αλλαγή κρατιέται στο ιστορικό του GitHub.</p></details></form>
<div class="card"><b>Δοκιμή χωρίς σύνδεση</b><p class="muted" style="margin:6px 0 10px">Τα δεδομένα μένουν μόνο σε αυτόν τον browser — για γνωριμία με την εφαρμογή.</p>
<button class="btn" data-act="local">Δοκιμή σε αυτή τη συσκευή</button></div>
<div class="card"><b>🏛 Πύλη Μεγάλης Γραμματείας</b><p class="muted" style="margin:6px 0 10px">Έντυπο Διατάγματος, Τεκτονικές Ομιλίες, φόρμες εγγραφής, άλλα Γραφεία.</p><a class="btn" href="#/portal">Άνοιγμα Πύλης</a></div></div>`,
    mount(el) {
      onSubmit(el.querySelector('#ghForm'), async (d) => {
        const repo = d.repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '');
        if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Γράψτε το αποθετήριο ως «οργανισμός/όνομα».');
        await connect({ kind: 'github', repo, token: d.token.trim() });
        toast('Συνδεθήκατε.');
        location.hash = '#/';
      });
      bind(el, { async local() { await connect({ kind: 'local' }); location.hash = '#/'; } });
    },
  };
}

module({ id: 'connect', routes: { '/connect': connectPage } });

export async function boot() {
  const c = savedConnection();
  if (!c) return;
  const root = document.getElementById('app');
  root.innerHTML = '<div class="loading"><div class="spinner"></div>Φόρτωση δεδομένων…</div>';
  try { await connect(c); }
  catch (e) {
    console.error(e);
    db.backend = null;
    location.hash = '#/connect?error=' + encodeURIComponent('Δεν ήταν δυνατή η σύνδεση: ' + e.message);
  }
}
export { render };
