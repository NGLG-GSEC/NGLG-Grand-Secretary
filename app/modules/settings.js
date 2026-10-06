// Ρυθμίσεις (στοιχεία εντύπων, λογαριασμοί αποστολής, αρίθμηση, κοινοποιήσεις) και Έλεγχος εφαρμογής.
import { db } from '../core/store.js';
import { module, onSubmit, go, flash, bind, modules, allRoutes, confirmDo, table } from '../core/app.js';
import { esc, EMAIL_RE, splitEmails } from '../core/util.js';
import { MAIL_SENDERS } from '../core/mail.js';
import { disconnect } from '../core/connect.js';
import { historyLink, exportAll } from './database.js';

const GROUPS = [
  ['Στοιχεία επίσημων εντύπων', [['organization_name', 'Επωνυμία'], ['founded_year', 'Έτος ιδρύσεως'], ['grand_master_title', 'Τίτλος Μεγάλου Διδασκάλου'], ['grand_master_name', 'Όνομα Μεγάλου Διδασκάλου'],
    ['grand_secretary_name', 'Όνομα Μεγάλου Γραμματέα'], ['grand_secretary_title', 'Τίτλος Μεγάλου Γραμματέα'], ['closing', 'Αποφώνηση επιστολών']]],
  ['✉ Λογαριασμοί αποστολής', [['mail_from_official', 'Επιστολές & Διατάγματα', 'email'], ['mail_from_general', 'Γενικά εξερχόμενα (επισκέψεις, ευχές, αναφορές)', 'email']]],
  ['Αρίθμηση', [['protocol_start', 'Πρώτος αριθμός πρωτοκόλλου (αν δεν υπάρχει μεγαλύτερος)', 'int'], ['decree_first_no', 'Πρώτος αριθμός Διατάγματος (αν δεν υπάρχει μεγαλύτερος)', 'int']]],
  ['Διατάγματα', [['decree_cc', 'Κοινοποίηση (Cc) κάθε Διατάγματος', 'emails']]],
  ['Επισκέψεις & Ευχές', [['visits_signer_name', 'Υπογραφή email: όνομα'], ['visits_signer_title', 'Υπογραφή email: τίτλος'], ['greet_bcc_self', 'Ευχές: κρυφή κοινοποίηση και σε (προαιρετικό)', 'emails']]],
];

function settingsPage() {
  const b = db.backend;
  return {
    title: 'Ρυθμίσεις',
    html: `<h1>Ρυθμίσεις</h1><form id="sf">${GROUPS.map(([g, fs]) => `<div class="card"><h2 style="margin-top:0">${esc(g)}</h2><div class="grid">${fs.map(([k, l, t]) => `<div class="${t === 'emails' ? 'full' : ''}"><label>${esc(l)}</label>
${t === 'emails' ? `<textarea name="${k}" class="short">${esc(db.setting(k) || '')}</textarea>` : `<input name="${k}" value="${esc(db.setting(k) ?? '')}"${t === 'int' ? ' inputmode="numeric"' : t === 'email' ? ' inputmode="email"' : ''}>`}</div>`).join('')}</div></div>`).join('')}
<div class="toolbar"><button class="btn primary">💾 Αποθήκευση ρυθμίσεων</button></div></form>
<div class="card"><h2 style="margin-top:0">Σύνδεση δεδομένων</h2><p>Τα δεδομένα φυλάσσονται: <b>${esc(b.kind === 'github' ? 'ιδιωτικό αποθετήριο GitHub ' + b.label : 'μόνο σε αυτόν τον browser (δοκιμή)')}</b>.</p>
<div class="toolbar">${historyLink()}<button class="btn" data-act="backup">⬇ Αντίγραφο</button><button class="btn danger" data-act="logout">Αποσύνδεση από αυτή τη συσκευή</button></div></div>`,
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
      bind(el, { backup: exportAll, logout() { if (confirmDo('Αποσύνδεση από αυτή τη συσκευή; (Τα δεδομένα μένουν ασφαλή στο GitHub.)')) disconnect(); } });
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
<tr><th>Τελευταία αποθήκευση</th><td><code>${esc(String(db.head || '').slice(0, 12))}</code></td></tr>
<tr><th>Ενότητες</th><td>${modules.length}</td></tr><tr><th>Σελίδες</th><td>${allRoutes().length}</td></tr>
<tr><th>Αποστολέας: Επιστολές & Διατάγματα</th><td>${esc(db.setting('mail_from_official'))}</td></tr><tr><th>Αποστολέας: Γενικά</th><td>${esc(db.setting('mail_from_general'))}</td></tr></table></div>
<h2>Έλεγχος σελίδων</h2><div class="card"><b>${bad.length ? `✗ ${bad.length} σελίδες με πρόβλημα` : `✓ Όλες οι ${results.length} σελίδες ανοίγουν σωστά`}</b></div>
${table(['Σελίδα', 'Αποτέλεσμα'], results.map(([r, s]) => [`<a href="#${r}">${esc(r)}</a>`, `<span style="color:${s === '✓' ? '#187a3d' : '#b42318'}">${esc(s)}</span>`]))}
<h2>Εγγραφές ανά πίνακα</h2>${table(['Πίνακας', 'Εγγραφές'], Object.keys(db.tables).sort().map((t) => [`<a href="#/database/${t}">${esc(t)}</a>`, db.all(t).length]))}`,
  };
}

module({ id: 'settings', routes: { '/settings': settingsPage, '/system': systemPage } });
