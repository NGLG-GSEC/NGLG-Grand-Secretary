// Ρυθμίσεις (στοιχεία εντύπων, λογαριασμοί αποστολής, αρίθμηση, κοινοποιήσεις) και Έλεγχος εφαρμογής.
import { db } from '../core/store.js';
import { module, onSubmit, go, flash, bind, modules, allRoutes, confirmDo, table, toast } from '../core/app.js';
import { esc, EMAIL_RE, splitEmails } from '../core/util.js';
import { MAIL_SENDERS } from '../core/mail.js';
import { disconnect, makeInvite, isSealed, lockSession } from '../core/connect.js';
import { copyText } from '../core/mail.js';
import { historyLink, exportAll } from './database.js';

const GROUPS = [
  ['Στοιχεία επίσημων εντύπων', [['organization_name', 'Επωνυμία'], ['founded_year', 'Έτος ιδρύσεως'], ['grand_master_title', 'Τίτλος Μεγάλου Διδασκάλου'], ['grand_master_name', 'Όνομα Μεγάλου Διδασκάλου'],
    ['grand_secretary_name', 'Όνομα Μεγάλου Γραμματέα'], ['grand_secretary_title', 'Τίτλος Μεγάλου Γραμματέα'], ['closing', 'Αποφώνηση επιστολών']]],
  ['✉ Λογαριασμοί αποστολής', [['mail_from_official', 'Επιστολές & Διατάγματα', 'email'], ['mail_from_general', 'Γενικά εξερχόμενα (επισκέψεις, ευχές, αναφορές)', 'email']]],
  ['Αρίθμηση', [['protocol_start', 'Πρώτος αριθμός πρωτοκόλλου (αν δεν υπάρχει μεγαλύτερος)', 'int'], ['decree_first_no', 'Πρώτος αριθμός Διατάγματος (αν δεν υπάρχει μεγαλύτερος)', 'int']]],
  ['Διατάγματα', [['decree_cc', 'Κοινοποίηση (Cc) κάθε Διατάγματος', 'emails']]],
  ['☁ Google Drive (αποθήκευση Word + PDF)', [['drive_folder_id', 'Φάκελος Drive (σύνδεσμος ή ID)'], ['google_client_id', 'Google OAuth Client ID (βλ. οδηγίες στις Ρυθμίσεις → Google Drive)']]],
  ['Επισκέψεις & Ευχές', [['gm_email', 'Email Μεγάλου Διδασκάλου (κοινοποίηση στις ενημερώσεις Εγκαταστάσεων)', 'emails'], ['visits_signer_name', 'Υπογραφή email: όνομα'], ['visits_signer_title', 'Υπογραφή email: τίτλος'], ['greet_bcc_self', 'Ευχές: κρυφή κοινοποίηση και σε (προαιρετικό)', 'emails']]],
];

function settingsPage() {
  const b = db.backend;
  return {
    title: 'Ρυθμίσεις',
    html: `<h1>Ρυθμίσεις</h1><form id="sf">${GROUPS.map(([g, fs]) => `<div class="card"><h2 style="margin-top:0">${esc(g)}</h2><div class="grid">${fs.map(([k, l, t]) => `<div class="${t === 'emails' ? 'full' : ''}"><label>${esc(l)}</label>
${t === 'emails' ? `<textarea name="${k}" class="short">${esc(db.setting(k) || '')}</textarea>` : `<input name="${k}" value="${esc(db.setting(k) ?? '')}"${t === 'int' ? ' inputmode="numeric"' : t === 'email' ? ' inputmode="email"' : ''}>`}</div>`).join('')}</div></div>`).join('')}
<div class="toolbar"><button class="btn primary">💾 Αποθήκευση ρυθμίσεων</button></div></form>
<div class="card"><h2 style="margin-top:0">Σύνδεση δεδομένων</h2><p>Τα δεδομένα φυλάσσονται: <b>${esc(b.kind === 'github' ? 'ιδιωτικό αποθετήριο GitHub ' + b.label : 'μόνο σε αυτόν τον browser (δοκιμή)')}</b>.</p>
<div class="toolbar">${historyLink()}<button class="btn" data-act="backup">⬇ Αντίγραφο</button>${isSealed() ? '<button class="btn" data-act="lock">🔒 Έξοδος</button>' : ''}<button class="btn danger" data-act="logout">Αποσύνδεση από αυτή τη συσκευή</button></div></div>
<details class="card fold"><summary><b>☁ Οδηγίες: σύνδεση με το Google Drive (μία φορά, περίπου 5 λεπτά)</b></summary><ol class="steps">
<li>Ανοίξτε <a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noopener">Google Cloud → Google Drive API</a> με τον λογαριασμό της Μεγάλης Γραμματείας και πατήστε «Enable».</li>
<li><a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener">OAuth consent screen</a>: τύπος «Internal» (αν υπάρχει Google Workspace) ή «External» και προσθέστε τους χρήστες στα «Test users».</li>
<li><a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener">Credentials</a> → «Create credentials» → «OAuth client ID» → τύπος «Web application» → στο «Authorized JavaScript origins» προσθέστε <code>${esc(location.origin)}</code> → «Create».</li>
<li>Αντιγράψτε το «Client ID» (τελειώνει σε <code>.apps.googleusercontent.com</code>) στο πεδίο «Google OAuth Client ID» παραπάνω και πατήστε «Αποθήκευση ρυθμίσεων».</li>
<li>Την πρώτη φορά που θα πατήσετε «☁ Αποθήκευση στο Drive», το Google θα ζητήσει να επιλέξετε λογαριασμό και να επιτρέψετε την πρόσβαση στο Drive.</li></ol>
<p class="muted">Ο λογαριασμός Google που συνδέεται πρέπει να έχει δικαίωμα επεξεργασίας στον φάκελο.</p></details>
<div class="card"><h2 style="margin-top:0">👤 Πρόσκληση χρήστη (είσοδος με email και κωδικό)</h2>
<p class="muted">Δημιουργεί <b>προσωπικό σύνδεσμο</b> για έναν χρήστη. Ο χρήστης ανοίγει τον σύνδεσμο, γράφει email και κωδικό και μπαίνει στην εφαρμογή·
στη συσκευή του μπαίνει στο εξής με email και κωδικό. Ο σύνδεσμος περιέχει την πρόσβαση κλειδωμένη με τον κωδικό — δεν δημοσιεύεται πουθενά.
Στείλτε τον σύνδεσμο μόνο στον χρήστη και τον κωδικό χωριστά (π.χ. τηλεφωνικά).</p>
<form id="invForm"><div class="grid"><div><label>Email χρήστη</label><input name="email" type="email" required></div><div></div>
<div><label>Κωδικός (τουλάχιστον 10 χαρακτήρες, γράμματα και αριθμοί)</label><input name="password" type="password" autocomplete="new-password" required></div>
<div><label>Επανάληψη κωδικού</label><input name="password2" type="password" autocomplete="new-password" required></div>
<div class="full"><label>Κωδικός πρόσβασης GitHub (token) του χρήστη — συνιστάται ξεχωριστός για κάθε χρήστη</label><input name="token" type="password" autocomplete="off" placeholder="κενό = ο κωδικός πρόσβασης αυτής της συσκευής">
<small class="muted">Ξεχωριστός token ανά χρήστη ανακαλείται χωρίς να επηρεάζει τους άλλους: <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">νέος token</a> → μόνο το αποθετήριο δεδομένων → Contents: Read and write.</small></div></div>
<div class="toolbar" style="margin-top:10px"><button class="btn primary">Δημιουργία συνδέσμου</button></div></form><div id="invOut"></div></div>`,
    mount(el) {
      onSubmit(el.querySelector('#sf'), async (d) => {
        for (const [, fs] of GROUPS) for (const [k, l, t] of fs) {
          const v = String(d[k] ?? '').trim();
          if (t === 'email' && v && !EMAIL_RE.test(v)) throw new Error(`Μη έγκυρο email στο «${l}».`);
          if (t === 'emails' && splitEmails(v).some((e) => !EMAIL_RE.test(e))) throw new Error(`Μη έγκυρο email στο «${l}».`);
          if (t === 'int' && v && !/^\d+$/.test(v.replace(/\./g, ''))) throw new Error(`Το «${l}» πρέπει να είναι αριθμός.`);
        }
        await db.save('Ρυθμίσεις', (tx) => { for (const [, fs] of GROUPS) for (const [k, , t] of fs) { let v = String(d[k] ?? '').trim(); if (t === 'emails') v = splitEmails(v).join(', '); if (v || t === 'emails') tx.setting(k, v || (MAIL_SENDERS[k] || {}).def || ''); } });
        flash('Οι ρυθμίσεις αποθηκεύτηκαν.'); go('/settings');
      });
      onSubmit(el.querySelector('#invForm'), async (d) => {
        if (d.password !== d.password2) throw new Error('Οι δύο κωδικοί δεν ταιριάζουν.');
        const link = await makeInvite({ email: d.email, password: d.password, token: d.token });
        el.querySelector('#invForm').reset();
        el.querySelector('#invOut').innerHTML = `<label style="margin-top:12px">Προσωπικός σύνδεσμος για ${esc(d.email)}</label><textarea class="short" readonly id="invLink">${esc(link)}</textarea>
<div class="toolbar"><button type="button" class="btn" id="invCopy">📋 Αντιγραφή συνδέσμου</button></div>`;
        el.querySelector('#invCopy').onclick = async () => { await copyText(link); toast('Ο σύνδεσμος αντιγράφηκε.'); };
      });
      bind(el, { lock: lockSession, backup: exportAll, logout() { if (confirmDo('Αποσύνδεση από αυτή τη συσκευή; (Τα δεδομένα μένουν ασφαλή στο GitHub.)')) disconnect(); } });
    },
  };
}

// Έλεγχος: ανοίγει (εσωτερικά) κάθε σελίδα του μενού και κάθε ενότητα και δείχνει αν φορτώνει χωρίς σφάλμα.
async function systemPage() {
  const routes = allRoutes().filter((r) => !r.includes(':') && r !== '/connect' && r !== '/system');
  const results = [];
  for (const r of routes) {
    const def = modules.find((m) => m.routes && m.routes[r]);
    try { const out = await def.routes[r]({ params: {}, query: {}, path: r }); results.push([r, typeof out === 'string' || (out && out.html) ? '✓' : '✗']); }
    catch (e) { results.push([r, '✗ ' + e.message]); }
  }
  const bad = results.filter(([, s]) => s !== '✓');
  const b = db.backend;
  return {
    title: 'Έλεγχος εφαρμογής',
    html: `<h1>🩺 Έλεγχος εφαρμογής</h1><div class="card"><table class="stack">
<tr><th>Δεδομένα</th><td>${esc(b.kind === 'github' ? 'GitHub: ' + b.label : 'Μόνο σε αυτόν τον browser (δοκιμή)')}</td></tr>
<tr><th>Έκδοση εφαρμογής</th><td><code>${esc((document.querySelector('meta[name=app-version]') || {}).content || 'τοπική')}</code></td></tr>
<tr><th>Τελευταία αποθήκευση</th><td><code>${esc(String(db.head || '').slice(0, 12))}</code></td></tr>
<tr><th>Ενότητες</th><td>${modules.length}</td></tr><tr><th>Σελίδες</th><td>${allRoutes().length}</td></tr>
<tr><th>Αποστολέας: Επιστολές & Διατάγματα</th><td>${esc(db.setting('mail_from_official'))}</td></tr><tr><th>Αποστολέας: Γενικά</th><td>${esc(db.setting('mail_from_general'))}</td></tr></table></div>
<h2>Έλεγχος σελίδων</h2><div class="card"><b>${bad.length ? `✗ ${bad.length} σελίδες με πρόβλημα` : `✓ Όλες οι ${results.length} σελίδες ανοίγουν σωστά`}</b></div>
${table(['Σελίδα', 'Αποτέλεσμα'], results.map(([r, s]) => [`<a href="#${r}">${esc(r)}</a>`, `<span style="color:${s === '✓' ? '#187a3d' : '#b42318'}">${esc(s)}</span>`]))}
<h2>Εγγραφές ανά πίνακα</h2>${table(['Πίνακας', 'Εγγραφές'], Object.keys(db.tables).sort().map((t) => [`<a href="#/database/${t}">${esc(t)}</a>`, db.all(t).length]))}`,
  };
}

module({ id: 'settings', routes: { '/settings': settingsPage, '/system': systemPage } });
