// Επιστολές — νέα (με πρότυπο ή «πάνω σε» παλαιότερη), προβολή στο επίσημο έντυπο, PDF/εκτύπωση, αποστολή, αρχείο.
// Και τα Πρότυπα Επιστολών.
import { db } from '../core/store.js';
import { module, onSubmit, go, flash, bind, confirmDo, table, notice, actor, ACTORS } from '../core/app.js';
import { crud } from '../core/crud.js';
import { esc, today, fmtDate, matches, sortBy, safeFileName, EMAIL_RE, splitEmails } from '../core/util.js';
import { letterPaper, printPaper } from '../core/paper.js';
import { mailButtons, senderBanner } from '../core/mail.js';
import { attachPicker, contactItems } from '../core/pickers.js';
import { nextProtocol, legacyDecreeLetterIds } from './protocol.js';

const TEMPLATE_SEED = [['Ελεύθερη επιστολή', ''], ['Επίσκεψη ΜΔ', 'Αγαπητοί Αδελφοί,\n\n[Κορμός επιστολής επίσκεψης Μεγάλου Διδασκάλου]'], ['Επίσκεψη ΜΔ με εκπρόσωπο', 'Αγαπητοί Αδελφοί,\n\n[Κορμός επιστολής επίσκεψης με εκπρόσωπο]'],
  ['Συλλυπητήρια', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο συλλυπητηρίων]'], ['Συγχαρητήρια', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο συγχαρητηρίων]'], ['Ευχαριστήρια', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο ευχαριστηρίων]'],
  ['Πρόσκληση', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο πρόσκλησης]'], ['Ανακοίνωση', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο ανακοίνωσης]']];
db.seed('letter_templates', () => TEMPLATE_SEED.map(([name, body], i) => ({ id: i + 1, name, body, active: 1 })));

const templates = () => sortBy(db.all('letter_templates').filter((t) => t.active && t.name !== 'ΔΙΑΤΑΓΜΑΤΑ'), 'name');
export const lettersAll = () => { const dec = legacyDecreeLetterIds(); return db.all('letters').filter((l) => !dec.has(l.id)); };
const STATUS = { draft: 'Πρόχειρη', ready: 'Έτοιμη' };
const statusPill = (s) => `<span class="pill ${s === 'ready' ? 'ok' : 'warn'}">${STATUS[s] || esc(s)}</span>`;
const fileName = (x) => safeFileName(`${x.protocol_no}${x.subject ? ' ' + x.subject : ''}`);

function letterForm(x, query = {}) {
  const tpl = templates();
  return `<form id="lf" class="grid card">
<div><label>Πρότυπο / Περίπτωση</label><select name="template_id" id="tplSel"><option value="">— Επιλογή —</option>${tpl.map((t) => `<option value="${t.id}"${Number(x.template_id) === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
<div><label>Ημερομηνία</label><input value="${esc(fmtDate(x.letter_date || today()))}" disabled></div>
<div class="full"><label>🔎 Παραλήπτης από τον Κατάλογο / Μητρώο</label><input id="rcptPick" placeholder="Επαρχία, Στοά, ΕπΜΔ, όνομα μέλους…" autocomplete="off"></div>
<input type="hidden" name="recipient_member_id" value="${esc(x.recipient_member_id || '')}">
<div><label>Παραλήπτης («Προς»)</label><input name="recipient_name" value="${esc(x.recipient_name || '')}"></div>
<div><label>Email παραλήπτη</label><input name="recipient_email" value="${esc(x.recipient_email || '')}" inputmode="email" placeholder="πολλά με κόμμα"></div>
<div class="full"><label>Θέμα</label><input name="subject" value="${esc(x.subject || '')}" required></div>
<div class="full"><label>Κείμενο</label><textarea name="body" required>${esc(x.body || '')}</textarea><small class="muted">Οι σύνδεσμοι (https://… ή www.…) μένουν ενεργοί στο τελικό έγγραφο.</small></div>
<div><label>Κατάσταση</label><select name="status"><option value="draft"${x.status !== 'ready' ? ' selected' : ''}>Πρόχειρη</option><option value="ready"${x.status === 'ready' ? ' selected' : ''}>Έτοιμη</option></select></div>
<div><label>Υπογράφων</label><select name="signer">${Object.entries(ACTORS).map(([k, v]) => `<option value="${k}"${(x.signer || actor()) === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
<div class="full toolbar"><button class="btn primary">💾 ${x.id ? 'Αποθήκευση' : 'Αποθήκευση & απόδοση αρ. πρωτοκόλλου'}</button><button type="button" class="btn" data-act="preview">👁 Προεπισκόπηση</button>
<a class="btn" href="${x.id ? '#/letters/' + x.id : '#/letters'}">Ακύρωση</a></div></form>
<section id="pv" class="print-area" hidden></section>`;
}

function mountLetterForm(el, x, isNew) {
  const f = el.querySelector('#lf');
  attachPicker(el.querySelector('#rcptPick'), contactItems, (c) => {
    f.recipient_name.value = c.name || ''; f.recipient_email.value = c.email || ''; f.recipient_member_id.value = c.member_id || '';
  });
  el.querySelector('#tplSel').addEventListener('change', (e) => {
    const t = db.get('letter_templates', e.target.value);
    if (t && (!f.body.value.trim() || confirmDo('Αντικατάσταση του κειμένου με το πρότυπο;'))) f.body.value = t.body;
  });
  bind(el, { preview() {
    const d = Object.fromEntries(new FormData(f));
    const pv = el.querySelector('#pv');
    pv.innerHTML = letterPaper({ ...x, ...d, letter_date: x.letter_date || today() });
    pv.hidden = false; pv.scrollIntoView({ behavior: 'smooth' });
  } });
  onSubmit(f, async (d) => {
    const emails = splitEmails(d.recipient_email), bad = emails.filter((e) => !EMAIL_RE.test(e));
    if (bad.length) throw new Error('Μη έγκυρο email: ' + bad.join(', '));
    const row = { subject: d.subject.trim(), body: d.body.trim(), template_id: d.template_id ? Number(d.template_id) : null, recipient_name: d.recipient_name.trim(),
      recipient_email: emails.join(', '), recipient_member_id: d.recipient_member_id ? Number(d.recipient_member_id) : null, status: d.status, signer: d.signer };
    const id = await db.save(isNew ? `Νέα Επιστολή: ${row.subject}` : `Επιστολή ${x.protocol_no}: ενημέρωση`, (tx) => {
      if (!isNew) return tx.update('letters', x.id, row).id;
      const p = nextProtocol(tx, 'Επιστολή', row.subject);
      return tx.insert('letters', { ...row, protocol_seq: p.seq, protocol_year: p.year, protocol_no: p.no, letter_date: today(), source_letter_id: x.source_letter_id || null }).id;
    });
    flash(isNew ? 'Η επιστολή καταχωρίστηκε.' : 'Αποθηκεύτηκε.');
    go(`/letters/${id}`);
  });
}

function viewLetter({ params }) {
  const x = db.get('letters', params.id);
  if (!x) return '<h1>Δεν βρέθηκε η επιστολή</h1>';
  const wa = 'https://wa.me/?text=' + encodeURIComponent(`Παρακαλώ να ελέγξετε το email σας και στα spam.\n\n${db.setting('organization_name')}\nΑρ. Πρωτ.: ${x.protocol_no}\nΘέμα: ${x.subject}`);
  return {
    title: x.subject,
    html: `<section class="card send-panel noprint"><h3>Αποστολή & Αποθήκευση</h3>${senderBanner('official')}
<div class="toolbar"><button class="btn primary" data-act="pdf">⬇ PDF / Εκτύπωση</button>${mailButtons({ to: x.recipient_email, subject: x.subject, body: x.body, kind: 'official' }, '✉ Αποστολή με Email')}
<a class="btn" target="_blank" rel="noopener" href="${wa}">WhatsApp μήνυμα</a>${x.status === 'ready' ? '' : '<button class="btn" data-act="ready">Σήμανση ως έτοιμη</button>'}</div>
<p class="send-help">Για συνημμένο PDF: πατήστε «PDF / Εκτύπωση» → «Αποθήκευση ως PDF» και επισυνάψτε το αρχείο στο email.</p></section>
<div class="toolbar noprint"><a class="btn" href="#/letters/${x.id}/edit">Επεξεργασία</a><a class="btn" href="#/letters/new?copy_from=${x.id}">Νέα πάνω σε αυτή</a><a class="btn" href="#/letters">Αρχείο Επιστολών</a>
<button class="btn danger" data-act="del">Διαγραφή</button> ${statusPill(x.status)}</div>
<div class="print-area">${letterPaper(x)}</div>`,
    mount(el) {
      bind(el, {
        pdf: () => printPaper(fileName(x)),
        async ready() { await db.save(`Επιστολή ${x.protocol_no}: έτοιμη`, (tx) => tx.update('letters', x.id, { status: 'ready' })); flash('Σημειώθηκε ως έτοιμη.'); go(`/letters/${x.id}`); },
        async del() {
          if (!confirmDo('Οριστική διαγραφή της επιστολής; Η ενέργεια δεν αναιρείται (μένει μόνο στο ιστορικό του GitHub).')) return;
          await db.save(`Διαγραφή επιστολής ${x.protocol_no}`, (tx) => { tx.remove('letters', x.id); for (const l of tx.all('letters')) if (l.source_letter_id === x.id) tx.update('letters', l.id, { source_letter_id: null }); });
          flash('Η επιστολή διαγράφηκε.'); go('/letters');
        },
      });
    },
  };
}

function archive({ query }) {
  let xs = sortBy(lettersAll(), (x) => -(x.protocol_seq || 0));
  if (query.q) xs = xs.filter((x) => matches(query.q, x.protocol_no, x.subject, x.recipient_name, x.recipient_email));
  if (query.from) xs = xs.filter((x) => (x.letter_date || '') >= query.from);
  if (query.to) xs = xs.filter((x) => (x.letter_date || '') <= query.to);
  const shown = xs.slice(0, 500);
  return {
    title: 'Αρχείο Επιστολών',
    html: `<div class="hero"><h1>Αρχείο Επιστολών</h1><a class="btn primary" href="#/letters/new">+ Νέα Επιστολή</a></div>${notice(query.msg)}
<form class="filters" id="flt"><input name="q" value="${esc(query.q || '')}" placeholder="Αρ. πρωτ., θέμα, παραλήπτης" autofocus><input type="date" name="from" value="${esc(query.from || '')}"><input type="date" name="to" value="${esc(query.to || '')}"><button>Αναζήτηση</button></form>
<p class="muted">${xs.length} επιστολές${xs.length > 500 ? ' (εμφανίζονται οι 500 πιο πρόσφατες)' : ''}</p>
${table(['Αρ. Πρωτ.', 'Ημερομηνία', 'Θέμα', 'Παραλήπτης', 'Κατάσταση', 'Ενέργειες'], shown.map((x) => [`<span class="official-number">${esc(x.protocol_no)}</span>`, esc(fmtDate(x.letter_date)), esc(x.subject), esc(x.recipient_name), statusPill(x.status),
  `<a href="#/letters/${x.id}">Άνοιγμα</a> · <a href="#/letters/${x.id}/edit">Επεξεργασία</a> · <a href="#/letters/new?copy_from=${x.id}">Νέα πάνω σε αυτή</a>`]), 'Δεν βρέθηκαν επιστολές.')}`,
    mount(el) { onSubmit(el.querySelector('#flt'), (d) => go('/letters', d)); },
  };
}

module({
  id: 'letters',
  routes: {
    '/letters': archive,
    '/letters/new': ({ query }) => {
      let x = { status: 'draft', signer: actor() };
      if (query.copy_from) { const s = db.get('letters', query.copy_from); if (s) x = { ...x, template_id: s.template_id, subject: s.subject, body: s.body, recipient_name: s.recipient_name, recipient_email: s.recipient_email, recipient_member_id: s.recipient_member_id, source_letter_id: s.id }; }
      else if (query.template_id) { const t = db.get('letter_templates', query.template_id); if (t) x = { ...x, template_id: t.id, body: t.body }; }
      if (query.to_name || query.to_email) Object.assign(x, { recipient_name: query.to_name || '', recipient_email: query.to_email || '' });
      return { title: 'Νέα Επιστολή', html: `<h1>Νέα Επιστολή</h1><div class="card signer-card noprint"><b>Υπογράφων:</b> ${esc(ACTORS[actor()])} <a class="btn small" href="#/identity">Αλλαγή</a></div>${letterForm(x)}`, mount: (el) => mountLetterForm(el, x, true) };
    },
    '/letters/:id': viewLetter,
    '/letters/:id/edit': ({ params }) => {
      const x = db.get('letters', params.id);
      if (!x) return '<h1>Δεν βρέθηκε η επιστολή</h1>';
      return { title: 'Επεξεργασία επιστολής', html: `<h1>Επεξεργασία <span class="official-number">${esc(x.protocol_no)}</span></h1>${letterForm(x)}`, mount: (el) => mountLetterForm(el, x, false) };
    },
    ...crud({
      table: 'letter_templates', base: '/templates', title: 'Πρότυπα Επιστολών', one: 'Πρότυπο', name: (t) => t.name,
      fields: [{ k: 'name', label: 'Όνομα', required: true, full: true }, { k: 'body', label: 'Κορμός επιστολής', type: 'textarea', full: true }, { k: 'active', label: 'Ενεργό', type: 'select', options: [[1, 'Ναι'], [0, 'Όχι']] }],
      defaults: { active: 1 },
      sort: (xs) => sortBy(xs.filter((t) => t.name !== 'ΔΙΑΤΑΓΜΑΤΑ'), 'name'),
      validate: (d) => ({ ...d, active: Number(d.active) ? 1 : 0 }),
      columns: [{ label: 'Όνομα', v: (t) => `<b>${esc(t.name)}</b>` }, { label: 'Κορμός', v: (t) => `<small class="muted">${esc(String(t.body || '').slice(0, 120))}</small>` }, { label: 'Ενεργό', v: (t) => (t.active ? '✓' : '—') }],
    }),
  },
  tile: { order: 10, render: () => {
    const xs = lettersAll(), drafts = xs.filter((x) => x.status !== 'ready').length, last = sortBy(xs, (x) => -(x.protocol_seq || 0))[0];
    return `<div class="dtile green"><h3><a href="#/letters">Επιστολές</a></h3><div class="big">${xs.length}</div>${drafts ? `<div class="warn">${drafts} πρόχειρες</div>` : ''}
${last ? `<div class="muted">Τελευταία: ${esc(last.protocol_no)}</div>` : ''}<div class="acts"><a class="btn primary" href="#/letters/new">+ Νέα</a><a class="btn" href="#/letters">Αρχείο</a></div></div>`;
  } },
});
