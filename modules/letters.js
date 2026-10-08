// Επιστολές — νέα (με πρότυπο ή «πάνω σε» παλαιότερη), προβολή στο επίσημο έντυπο, PDF/εκτύπωση, αποστολή, αρχείο.
// Και τα Πρότυπα Επιστολών.
import { db } from '../core/store.js';
import { module, onSubmit, go, flash, bind, confirmDo, table, notice, actor, ACTORS } from '../core/app.js';
import { crud } from '../core/crud.js';
import { esc, today, fmtDate, matches, sortBy, safeFileName, EMAIL_RE, splitEmails, download } from '../core/util.js';
import { letterPaper, printPaper, signerProfile, IMG } from '../core/paper.js';
import { makeDocx, letterBlocks } from '../core/docx.js';
import { docTitle, driveBox, saveDocToDrive } from '../core/drive.js';
import { mailButtons, senderBanner } from '../core/mail.js';
import { attachPicker, contactItems } from '../core/pickers.js';
import { nextProtocol, legacyDecreeLetterIds } from './protocol.js';
import { lodgesAll, lodgeByNumber } from './lodges.js';
import { PLACEHOLDERS, hasPlaceholders, fillPlaceholders, fillContext, lodgeRecipients, missingPlaceholders, GM_VISIT, dayWithArticle, dateWords } from './letter-fill.js';

const TEMPLATE_SEED = [['Ελεύθερη επιστολή', ''], ['Επίσκεψη ΜΔ', 'Αγαπητοί Αδελφοί,\n\n[Κορμός επιστολής επίσκεψης Μεγάλου Διδασκάλου]'], ['Επίσκεψη ΜΔ με εκπρόσωπο', 'Αγαπητοί Αδελφοί,\n\n[Κορμός επιστολής επίσκεψης με εκπρόσωπο]'],
  ['Συλλυπητήρια', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο συλλυπητηρίων]'], ['Συγχαρητήρια', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο συγχαρητηρίων]'], ['Ευχαριστήρια', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο ευχαριστηρίων]'],
  ['Πρόσκληση', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο πρόσκλησης]'], ['Ανακοίνωση', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο ανακοίνωσης]']];
db.seed('letter_templates', () => TEMPLATE_SEED.map(([name, body], i) => ({ id: i + 1, name, body, active: 1 })));

const PH_HELP = 'Πεδία που συμπληρώνονται από τη βάση: ' + PLACEHOLDERS.map(([k, d]) => `{${k}} = ${d}`).join(' · ');
const templates = () => sortBy(db.all('letter_templates').filter((t) => t.active && t.name !== 'ΔΙΑΤΑΓΜΑΤΑ'), 'name');
export const lettersAll = () => { const dec = legacyDecreeLetterIds(); return db.all('letters').filter((l) => !dec.has(l.id)); };
const STATUS = { draft: 'Πρόχειρη', ready: 'Έτοιμη' };
const statusPill = (s) => `<span class="pill ${s === 'ready' ? 'ok' : 'warn'}">${STATUS[s] || esc(s)}</span>`;
// Όνομα αρχείου (PDF, Word, Drive): «20545 - ΕΠΙΣΤΟΛΗ Θέμα» — κατηγορία ΕΠΙΣΤΟΛΗ ή ΕΠΙΣΚΕΨΗ
export const LETTER_CATEGORIES = { ΕΠΙΣΤΟΛΗ: 'Επιστολή', ΕΠΙΣΚΕΨΗ: 'Επίσκεψη' };
const category = (x) => (LETTER_CATEGORIES[x.category] ? x.category : 'ΕΠΙΣΤΟΛΗ');
const fileName = (x) => (x.protocol_seq ? docTitle(x.protocol_seq, category(x), x.subject) : safeFileName(`${category(x)} ${x.subject || ''}`));

// Word (.docx) για επεξεργασία, με το επιστολόχαρτο της ΕΜΣτΕ
export async function letterDocxBlob(x) {
  const S = (k) => db.setting(k) || '', p = signerProfile(x.signer);
  const blocks = letterBlocks({ org: S('organization_name'), founded: S('founded_year'), gmTitle: S('grand_master_title'), gmName: S('grand_master_name'),
    number: x.protocol_no || '', date: fmtDate(x.letter_date || today()), place: 'Εν Αθήναις', to: x.recipient_name, subject: x.subject,
    paragraphs: [{ text: x.body || '' }], closing: x.closing || S('closing'), signature: p.img, signer: p.name, signerTitle: p.title });
  return makeDocx(blocks, { title: x.subject, author: p.name });
}
export async function letterDocx(x) { download(fileName(x) + '.docx', await letterDocxBlob(x)); }
// Άνοιγμα στο Ψηφιακό Έντυπο (diatagma/) με τα στοιχεία της επιστολής
export function openInDigitalForm(x) {
  const p = signerProfile(x.signer);
  try {
    localStorage.setItem('nglg-diatagma-prefill', JSON.stringify({ num: x.protocol_no || '', date: x.letter_date || today(), place: 'Εν Αθήναις', doctype: 'ΕΠΙΣΤΟΛΗ', subject: x.subject || '',
      p0: x.recipient_name ? `Προς: ${x.recipient_name}` : '', p1: x.body || '', p2: '', greet: x.closing || db.setting('closing') || '', signer: p.name, sigtitle: p.title,
      useSig: p.img === IMG.signature, mailto: x.recipient_email || '' }));
  } catch { /* χωρίς localStorage: ανοίγει κενό */ }
  location.href = 'diatagma/';
}

// Πλαίσιο «Συμπλήρωση από τη βάση» για πρότυπα με πεδία {…}: από Επίσκεψη ή από Στοά + ημερομηνία
const upcomingVisits = () => sortBy(db.all('visits').filter((v) => v.visit_date >= today()), 'visit_date');
const visitLabel = (v) => `${fmtDate(v.visit_date)} — «${v.lodge || ''}»${v.lodge_number ? ' αρ. ' + v.lodge_number : ''}`;
function fillPanel(x, query) {
  const t = x.template_id ? db.get('letter_templates', x.template_id) : null, show = !!t && hasPlaceholders([t.body, t.subject].join(' '));
  const sel = Number(query.visit_id) || 0, sv = sel ? db.get('visits', sel) : null, vs = [...(sv && sv.visit_date < today() ? [sv] : []), ...upcomingVisits()];
  return `<div class="full card fill-box" id="fillBox"${show ? '' : ' hidden'}><b>⚙ Συμπλήρωση από τη βάση</b> <small class="muted">— τα πεδία του προτύπου (${PLACEHOLDERS.map(([k]) => '{' + esc(k) + '}').join(', ')}) γεμίζουν αυτόματα.</small>
<div class="grid"><div class="full"><label>Από Επίσκεψη (επόμενες)</label><select id="fillVisit"><option value="">— ή επιλέξτε Στοά και ημερομηνία παρακάτω —</option>${vs.map((v) => `<option value="${v.id}"${v.id === sel ? ' selected' : ''}>${esc(visitLabel(v))}</option>`).join('')}</select></div>
<div><label>Στοά</label><input id="fillLodge" list="fillLodges" placeholder="αριθμός ή όνομα" autocomplete="off"><datalist id="fillLodges">${lodgesAll(true).map((l) => `<option value="${esc(l.number)} · ${esc(l.name)}">`).join('')}</datalist></div>
<div><label>Ημερομηνία εργασιών</label><input id="fillDate" type="date"></div></div>
<p class="muted" id="fillState"></p></div>`;
}

function letterForm(x, query = {}) {
  const tpl = templates();
  return `<form id="lf" class="grid card">
<div><label>Πρότυπο / Περίπτωση</label><select name="template_id" id="tplSel"><option value="">— Επιλογή —</option>${tpl.map((t) => `<option value="${t.id}"${Number(x.template_id) === t.id ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
<div><label>Ημερομηνία</label><input value="${esc(fmtDate(x.letter_date || today()))}" disabled></div>
${fillPanel(x, query)}
<div class="full"><label>🔎 Παραλήπτης από τον Κατάλογο / Μητρώο</label><input id="rcptPick" placeholder="Επαρχία, Στοά, ΕπΜΔ, όνομα μέλους…" autocomplete="off"></div>
<input type="hidden" name="recipient_member_id" value="${esc(x.recipient_member_id || '')}"><input type="hidden" name="closing" value="${esc(x.closing || '')}"><input type="hidden" name="category" value="${esc(category(x))}">
<div><label>Παραλήπτης («Προς»)</label><input name="recipient_name" value="${esc(x.recipient_name || '')}"></div>
<div><label>Email παραλήπτη</label><input name="recipient_email" value="${esc(x.recipient_email || '')}" inputmode="email" placeholder="πολλά με κόμμα"></div>
<div class="full"><label>Θέμα</label><input name="subject" value="${esc(x.subject || '')}" required></div>
<div class="full"><label>Κείμενο</label><textarea name="body" required>${esc(x.body || '')}</textarea><small class="muted">Οι σύνδεσμοι (https://… ή www.…) μένουν ενεργοί στο τελικό έγγραφο.</small></div>
<div><label>Κατάσταση</label><select name="status"><option value="draft"${x.status !== 'ready' ? ' selected' : ''}>Πρόχειρη</option><option value="ready"${x.status === 'ready' ? ' selected' : ''}>Έτοιμη</option></select></div>
<div><label>Υπογράφων</label><select name="signer">${Object.entries(ACTORS).map(([k, v]) => `<option value="${k}"${(x.signer || actor()) === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
<div class="full toolbar"><button class="btn primary">💾 ${x.id ? 'Αποθήκευση' : 'Αποθήκευση & απόδοση αρ. πρωτοκόλλου'}</button><button type="button" class="btn" data-act="preview">👁 Προεπισκόπηση</button><button type="button" class="btn" data-act="form">🖋 Ψηφιακό Έντυπο</button><button type="button" class="btn" data-act="word">⬇ Word</button>
<a class="btn" href="${x.id ? '#/letters/' + x.id : '#/letters'}">Ακύρωση</a></div></form>
<section id="pv" class="print-area" hidden></section>`;
}

function mountLetterForm(el, x, isNew) {
  const f = el.querySelector('#lf');
  attachPicker(el.querySelector('#rcptPick'), contactItems, (c) => {
    f.recipient_name.value = c.name || ''; f.recipient_email.value = c.email || ''; f.recipient_member_id.value = c.member_id || '';
  });
  // Πρότυπο + στοιχεία από τη βάση → κείμενο, θέμα, παραλήπτες
  const box = el.querySelector('#fillBox'), fv = el.querySelector('#fillVisit'), fl = el.querySelector('#fillLodge'), fd = el.querySelector('#fillDate'), state = el.querySelector('#fillState');
  let tpl = x.template_id ? db.get('letter_templates', x.template_id) : null, auto = { body: f.body.value, subject: f.subject.value };
  const ctx = () => {
    const v = fv.value ? db.get('visits', fv.value) : null;
    if (v) return fillContext({ visit: v });
    const no = String(fl.value).split('·')[0].trim(), l = no ? lodgeByNumber(no) : null;
    return fillContext({ lodge_number: l ? l.number : '', date: fd.value });
  };
  const apply = (force) => {
    if (!tpl) return;
    const c = ctx(), body = fillPlaceholders(tpl.body, c), subject = tpl.subject ? fillPlaceholders(tpl.subject, c) : f.subject.value;
    const edited = (f.body.value.trim() && f.body.value !== auto.body) || (f.subject.value.trim() && f.subject.value !== auto.subject);
    if (!force && edited && !confirmDo('Αντικατάσταση του κειμένου με το πρότυπο συμπληρωμένο από τη βάση;')) return;
    f.body.value = body; f.subject.value = subject; auto = { body, subject };
    if (tpl.closing) f.closing.value = tpl.closing;
    if (LETTER_CATEGORIES[tpl.category]) f.category.value = tpl.category;
    if (c.lodge && (tpl.key === GM_VISIT.key || !f.recipient_email.value.trim())) {
      const r = lodgeRecipients(c);
      f.recipient_name.value = r.toName; f.recipient_email.value = [r.to, r.cc].filter(Boolean).join(', '); f.recipient_member_id.value = '';
    }
    const miss = missingPlaceholders(body + ' ' + subject);
    state.innerHTML = c.lodge ? `✓ Στοά «${esc(c.lodge)}»${c.lodge_number ? ' αρ. ' + esc(c.lodge_number) : ''}${c.date ? ` · ${esc(dayWithArticle(c.date))}, ${esc(dateWords(c.date))}` : ''}`
      + (miss.length ? ` — <span class="warn">λείπουν: ${miss.map((k) => '{' + esc(k) + '}').join(', ')}</span>` : '')
      + (tpl.key === GM_VISIT.key && c.lodge && !lodgeRecipients(c).lodgeMail ? ' — <span class="warn">η Στοά δεν έχει email (Συμβολικές Στοές)</span>' : '') : 'Επιλέξτε Επίσκεψη ή Στοά και ημερομηνία.';
  };
  el.querySelector('#tplSel').addEventListener('change', (e) => {
    tpl = db.get('letter_templates', e.target.value);
    box.hidden = !(tpl && hasPlaceholders([tpl.body, tpl.subject].join(' ')));
    if (tpl) apply(false);
  });
  fv.addEventListener('change', () => { if (fv.value) { fl.value = ''; fd.value = ''; } apply(true); });
  for (const i of [fl, fd]) i.addEventListener('change', () => { fv.value = ''; apply(true); });
  if (tpl && !box.hidden && (fv.value || !f.body.value.trim() || hasPlaceholders(f.body.value))) apply(true);
  const cur = () => ({ ...x, ...Object.fromEntries(new FormData(f)), letter_date: x.letter_date || today() });
  bind(el, { form: () => openInDigitalForm(cur()), word: () => letterDocx(cur()), preview() {
    const d = Object.fromEntries(new FormData(f));
    const pv = el.querySelector('#pv');
    pv.innerHTML = letterPaper({ ...x, ...d, letter_date: x.letter_date || today() });
    pv.hidden = false; pv.scrollIntoView({ behavior: 'smooth' });
  } });
  onSubmit(f, async (d) => {
    const emails = splitEmails(d.recipient_email), bad = emails.filter((e) => !EMAIL_RE.test(e));
    if (bad.length) throw new Error('Μη έγκυρο email: ' + bad.join(', '));
    const row = { subject: d.subject.trim(), body: d.body.trim(), template_id: d.template_id ? Number(d.template_id) : null, recipient_name: d.recipient_name.trim(),
      recipient_email: emails.join(', '), recipient_member_id: d.recipient_member_id ? Number(d.recipient_member_id) : null, closing: String(d.closing || '').trim(), category: LETTER_CATEGORIES[d.category] ? d.category : 'ΕΠΙΣΤΟΛΗ', status: d.status, signer: d.signer };
    const id = await db.save(isNew ? `Νέα Επιστολή: ${row.subject}` : `Επιστολή ${x.protocol_no}: ενημέρωση`, (tx) => {
      if (!isNew) return tx.update('letters', x.id, row).id;
      const p = nextProtocol(tx, LETTER_CATEGORIES[category(row)], row.subject);
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
<button class="btn" data-act="word">⬇ Word (επεξεργασία)</button><button class="btn" data-act="form">🖋 Ψηφιακό Έντυπο</button>
<a class="btn" target="_blank" rel="noopener" href="${wa}">WhatsApp μήνυμα</a>${x.status === 'ready' ? '' : '<button class="btn" data-act="ready">Σήμανση ως έτοιμη</button>'}</div>
<p class="send-help">Για συνημμένο PDF: πατήστε «PDF / Εκτύπωση» → «Αποθήκευση ως PDF» και επισυνάψτε το αρχείο στο email.</p>${driveBox(x, fileName(x))}</section>
<div class="toolbar noprint"><a class="btn" href="#/letters/${x.id}/edit">Επεξεργασία</a><a class="btn" href="#/letters/new?copy_from=${x.id}">Νέα πάνω σε αυτή</a><a class="btn" href="#/letters">Αρχείο Επιστολών</a>
<button class="btn danger" data-act="del">Διαγραφή</button> ${statusPill(x.status)}</div>
<div class="print-area">${letterPaper(x)}</div>`,
    mount(el) {
      bind(el, {
        pdf: () => printPaper(fileName(x)),
        word: () => letterDocx(x),
        async drive(_, b) {
          b.disabled = true; b.textContent = '☁ Αποθήκευση…';
          try { await saveDocToDrive('letters', x.id, fileName(x), await letterDocxBlob(x), el.querySelector('.print-area .paper')); flash('Αποθηκεύτηκε στο Drive (Word + PDF).'); go(`/letters/${x.id}`); }
          catch (e) { b.disabled = false; b.textContent = '☁ Αποθήκευση στο Drive (Word + PDF)'; throw e; }
        },
        form: () => openInDigitalForm(x),
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
      if (query.copy_from) { const s = db.get('letters', query.copy_from); if (s) x = { ...x, template_id: s.template_id, subject: s.subject, body: s.body, recipient_name: s.recipient_name, recipient_email: s.recipient_email, recipient_member_id: s.recipient_member_id, closing: s.closing || '', category: s.category || 'ΕΠΙΣΤΟΛΗ', source_letter_id: s.id }; }
      else if (query.template_id) { const t = db.get('letter_templates', query.template_id); if (t) x = { ...x, template_id: t.id, body: t.body, subject: t.subject || '', closing: t.closing || '', category: t.category || 'ΕΠΙΣΤΟΛΗ' }; }
      if (query.template_id && !x.template_id && db.get('letter_templates', query.template_id)) x.template_id = Number(query.template_id);
      if (query.to_name || query.to_email) Object.assign(x, { recipient_name: query.to_name || '', recipient_email: query.to_email || '' });
      if (query.subject || query.body) Object.assign(x, { subject: query.subject || '', body: query.body || '' });
      if (query.closing) x.closing = query.closing;
      if (LETTER_CATEGORIES[query.category]) x.category = query.category;
      return { title: 'Νέα Επιστολή', html: `<h1>Νέα Επιστολή</h1><div class="card signer-card noprint"><b>Υπογράφων:</b> ${esc(ACTORS[actor()])} <a class="btn small" href="#/identity">Αλλαγή</a></div>${letterForm(x, query)}`, mount: (el) => mountLetterForm(el, x, true) };
    },
    '/letters/:id': viewLetter,
    '/letters/:id/edit': ({ params }) => {
      const x = db.get('letters', params.id);
      if (!x) return '<h1>Δεν βρέθηκε η επιστολή</h1>';
      return { title: 'Επεξεργασία επιστολής', html: `<h1>Επεξεργασία <span class="official-number">${esc(x.protocol_no)}</span></h1>${letterForm(x)}`, mount: (el) => mountLetterForm(el, x, false) };
    },
    ...crud({
      table: 'letter_templates', base: '/templates', title: 'Πρότυπα Επιστολών', one: 'Πρότυπο', name: (t) => t.name,
      fields: [{ k: 'name', label: 'Όνομα', required: true, full: true }, { k: 'subject', label: 'Θέμα (προαιρετικό)', full: true, help: PH_HELP },
        { k: 'body', label: 'Κορμός επιστολής', type: 'textarea', full: true, help: PH_HELP }, { k: 'closing', label: 'Αποφώνηση (προαιρετική)', placeholder: 'π.χ. Με εκτίμηση και αδελφική αγάπη,' },
        { k: 'category', label: 'Κατηγορία πρωτοκόλλου', type: 'select', options: Object.entries(LETTER_CATEGORIES).map(([k]) => [k, k]) }, { k: 'active', label: 'Ενεργό', type: 'select', options: [[1, 'Ναι'], [0, 'Όχι']] }],
      defaults: { active: 1 },
      sort: (xs) => sortBy(xs.filter((t) => t.name !== 'ΔΙΑΤΑΓΜΑΤΑ'), 'name'),
      validate: (d) => ({ ...d, active: Number(d.active) ? 1 : 0 }),
      columns: [{ label: 'Όνομα', v: (t) => `<b>${esc(t.name)}</b>${hasPlaceholders([t.body, t.subject].join(' ')) ? ' <span class="pill ok">⚙ από τη βάση</span>' : ''}` }, { label: 'Κορμός', v: (t) => `<small class="muted">${esc(String(t.body || '').slice(0, 120))}</small>` }, { label: 'Ενεργό', v: (t) => (t.active ? '✓' : '—') }],
    }),
  },
  tile: { order: 10, render: () => {
    const xs = lettersAll(), drafts = xs.filter((x) => x.status !== 'ready').length, last = sortBy(xs, (x) => -(x.protocol_seq || 0))[0];
    return `<div class="dtile green"><h3><a href="#/letters">Επιστολές</a></h3><div class="big">${xs.length}</div>${drafts ? `<div class="warn">${drafts} πρόχειρες</div>` : ''}
${last ? `<div class="muted">Τελευταία: ${esc(last.protocol_no)}</div>` : ''}<div class="acts"><a class="btn primary" href="#/letters/new">+ Νέα</a><a class="btn" href="#/letters">Αρχείο</a></div></div>`;
  } },
});
