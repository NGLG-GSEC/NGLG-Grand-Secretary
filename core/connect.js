// Σύνδεση με τα δεδομένα: μία φορά σε κάθε συσκευή. Τα στοιχεία μένουν μόνο σε αυτόν τον browser.
import { GitHubBackend, LocalBackend } from './backend.js';
import { db } from './store.js';
import { module, onSubmit, render, toast, bind } from './app.js';
import { esc } from './util.js';
import { seal, unseal, readSeal, strongEnough } from './seal.js';

const KEY = 'nglg-connection';
export const DEFAULT_REPO = 'NGLG-GSEC/nglg-grammateia-data';
export function savedConnection() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function saveConnection(c) { try { if (c) localStorage.setItem(KEY, JSON.stringify(c)); else localStorage.removeItem(KEY); } catch { /* */ } }

// Συνεδρία χρήστη με email + κωδικό: το ξεκλείδωτο token μένει μόνο στην καρτέλα (κλείνει με τον browser)
const SESSION = 'nglg-session';
const sessionToken = () => { try { return sessionStorage.getItem(SESSION) || ''; } catch { return ''; } };
const setSession = (t) => { try { if (t) sessionStorage.setItem(SESSION, t); else sessionStorage.removeItem(SESSION); } catch { /* */ } };
export const isSealed = () => (savedConnection() || {}).kind === 'sealed';
export function lockSession() { setSession(''); db.backend = null; location.hash = '#/login'; location.reload(); }

export function backendFor(c) {
  if (!c) return null;
  if (c.kind === 'local') return new LocalBackend();
  if (c.kind === 'sealed') c = { repo: c.repo, token: sessionToken() };
  const [owner, repo] = String(c.repo || DEFAULT_REPO).split('/');
  return new GitHubBackend({ owner, repo, token: c.token, api: c.api });
}

export async function connect(c) {
  const b = backendFor(c);
  await db.open(b);
  saveConnection(c);
}
export function disconnect() { saveConnection(null); setSession(''); db.backend = null; location.hash = '#/connect'; location.reload(); }

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

// Είσοδος με email + κωδικό (μετά από σύνδεσμο πρόσκλησης)
function loginPage({ query }) {
  const inv = query.invite && readSeal(query.invite);
  if (inv) saveConnection({ kind: 'sealed', email: inv.e, repo: inv.r, blob: query.invite });
  const c = savedConnection();
  if (!c || c.kind !== 'sealed') return { title: 'Είσοδος', bare: true, html: '<div class="auth"><h1>Είσοδος</h1><div class="card">Χρειάζεται ο προσωπικός σύνδεσμος πρόσκλησης. <a href="#/connect">Σύνδεση με κωδικό GitHub</a></div></div>' };
  return {
    title: 'Είσοδος', bare: true,
    html: `<div class="auth" style="max-width:440px"><img class="logo" src="img/header_emblem.png" alt=""><h1>Ψηφιακή Μεγάλη Γραμματεία</h1>
${query.error ? `<div class="card toast error" style="position:static">${esc(query.error)}</div>` : ''}
<form class="card" id="lgForm" style="text-align:left"><h2 style="margin-top:0">Είσοδος</h2>
<label>Email</label><input name="email" type="email" value="${esc(c.email || '')}" autocomplete="username" required>
<label style="margin-top:12px">Κωδικός</label><input name="password" type="password" autocomplete="current-password" required autofocus>
<div class="toolbar" style="margin-top:14px"><button class="btn primary">Είσοδος</button></div>
<p class="muted" style="margin-bottom:0">Ο κωδικός δεν αποθηκεύεται· η είσοδος ισχύει μέχρι να κλείσει ο browser.</p></form>
<p><a href="#/connect" data-act="other">Άλλος τρόπος σύνδεσης</a></p></div>`,
    mount(el) {
      onSubmit(el.querySelector('#lgForm'), async (d) => {
        const x = await unseal(c.blob, d.email, d.password);
        setSession(x.token);
        try { await db.open(backendFor(c)); } catch (e) { setSession(''); throw new Error('Η πρόσβαση δεν είναι πλέον ενεργή: ' + e.message); }
        toast('Καλώς ήλθατε.');
        location.hash = '#/';
      });
    },
  };
}
// Δημιουργία προσωπικού συνδέσμου πρόσκλησης (από τις Ρυθμίσεις)
export async function makeInvite({ email, password, token }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) throw new Error('Γράψτε έγκυρο email.');
  if (!strongEnough(password)) throw new Error('Ο κωδικός θέλει τουλάχιστον 10 χαρακτήρες, με γράμματα και αριθμούς.');
  const c = savedConnection() || {}, repo = c.repo || DEFAULT_REPO;
  const tk = String(token || '').trim() || (c.kind === 'github' ? c.token : c.kind === 'sealed' ? sessionToken() : '');
  if (!tk) throw new Error('Χρειάζεται κωδικός πρόσβασης GitHub (token) για τον χρήστη.');
  const blob = await seal({ email, repo, token: tk }, password);
  return `${location.origin}${location.pathname}#/login?invite=${blob}`;
}

module({ id: 'connect', routes: { '/connect': connectPage, '/login': loginPage } });

export async function boot() {
  const c = savedConnection();
  if (!c) return;
  if (c.kind === 'sealed' && !sessionToken()) { if (!/^#\/login/.test(location.hash)) location.hash = '#/login'; return; }
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
