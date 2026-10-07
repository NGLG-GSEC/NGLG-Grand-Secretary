// Μητρώο Μελών — αναζήτηση ανά πεδίο, νέο/επεξεργασία/διαγραφή, εισαγωγή (Excel πηγής ή εξαγωγής), εξαγωγή Excel.
// Πίνακες: member_registry, member_lodges (Στοές κάθε μέλους), member_degrees_offices (Επετηρίδα).
// Κάθε αλλαγή μένει στο ιστορικό του GitHub, άρα και μια διαγραφή μπορεί να ανακτηθεί.
import { db } from '../core/store.js';
import { module, onSubmit, go, flash, bind, confirmDo, table, notice, pager, toast } from '../core/app.js';
import { esc, fold, sortBy, readXlsx, XLSX, parsePasted } from '../core/util.js';
import { lodgeNoKey, lodgesAll } from './lodges.js';
import { noContact, NO_CONTACT } from '../core/pickers.js';
import { identify, canonicalId, person, digits10, sameNameGroups } from '../core/people.js';

const PAGE = 100;
const MEMBER_FIELDS = [['surname', 'Επώνυμο'], ['first_name', 'Όνομα'], ['mobile', 'Κινητό'], ['email', 'Email'], ['lodge', 'Στοά'], ['all', 'Όλα']];
const HINTS = { surname: ['Γράψτε το επώνυμο', 'π.χ. Παπαδόπουλος', 'search'], first_name: ['Γράψτε το όνομα', 'π.χ. Γεώργιος', 'search'], mobile: ['Γράψτε το κινητό', 'π.χ. 6944 123 456', 'tel'],
  email: ['Γράψτε το email', 'π.χ. onoma@gmail.com', 'email'], lodge: ['Γράψτε ή διαλέξτε τη Στοά', 'π.χ. 3 ή ΠΑΡΘΕΝΩΝ', 'search'], all: ['Γράψτε οποιοδήποτε στοιχείο', 'Επώνυμο, όνομα, κινητό, email ή αρ. μητρώου', 'search'] };

const phoneDigits = (q) => { let d = String(q || '').replace(/\D/g, ''); if (d.startsWith('0030')) d = d.slice(4); else if (d.startsWith('30') && d.length > 10) d = d.slice(2); return d; };
const digits = (v) => String(v || '').replace(/\D/g, '');

export const membersAll = () => db.all('member_registry');
export function lodgesByMember() {
  const out = {};
  for (const l of sortBy(db.all('member_lodges'), 'seq', 'id')) (out[l.member_id] ||= []).push(l);
  return out;
}
export const lodgesText = (ls) => (ls || []).map((x) => [x.lodge_name, x.lodge_number, x.member_status].join(' | ').replace(/[ |]+$/, '')).join('\n');
export const memberLodgesLine = (ls) => (ls || []).filter((l) => l.lodge_name || l.lodge_number).map((l) => `${l.lodge_name} ${l.lodge_number}`.trim() + (l.member_status && !/ΕΝΕΡΓ/i.test(l.member_status) ? ` (${l.member_status})` : '')).join(', ');

export function memberSearch(q, field = 'all') {
  q = String(q || '').trim();
  const ms = membersAll(), byM = lodgesByMember();
  if (!q) return ms;
  if (field === 'surname' || field === 'first_name' || field === 'email') {
    const cols = { surname: ['surname', 'surname_variants'], first_name: ['first_name', 'first_name_variants'], email: ['email', 'other_emails'] }[field];
    return ms.filter((m) => fold(q).split(/\s+/).every((w) => cols.some((c) => fold(m[c]).includes(w))));
  }
  if (field === 'lodge') {
    const mm = /^\s*(\d+|Φ)\s*(·|$)/.exec(q);
    if (mm) { const no = lodgeNoKey(mm[1]); return ms.filter((m) => (byM[m.id] || []).some((l) => lodgeNoKey(l.lodge_number) === no)); }
    return ms.filter((m) => fold(q).split(/\s+/).every((w) => (byM[m.id] || []).some((l) => fold(l.lodge_name).includes(w))));
  }
  if (field === 'mobile') { const d = phoneDigits(q); return d ? ms.filter((m) => digits(m.mobile).includes(d) || digits(m.other_mobiles).includes(d)) : []; }
  const d = digits(q);
  if (/^[\d\s+\-().]+$/.test(q) && d.length >= 4) { const p = phoneDigits(q); return ms.filter((m) => digits(m.mobile).includes(p) || digits(m.other_mobiles).includes(p) || String(m.registry_no ?? '') === q.trim()); }
  return ms.filter((m) => q.split(/\s+/).every((w) => {
    const fw = fold(w), wd = /^[\d+\-().]+$/.test(w) && digits(w).length >= 3 ? digits(w) : '';
    return ['surname', 'first_name', 'surname_variants', 'first_name_variants', 'email', 'other_emails', 'degree'].some((c) => fold(m[c]).includes(fw))
      || (wd && (digits(m.mobile).includes(wd) || digits(m.other_mobiles).includes(wd))) || String(m.registry_no ?? '') === w
      || (byM[m.id] || []).some((l) => fold(l.lodge_name).includes(fw) || fold(l.lodge_number) === fw);
  }));
}

function hl(text, q, ok = true) {
  const t = String(text ?? '');
  if (!q || !ok || !t) return esc(t);
  const n = fold(t);
  if (n.length !== t.length) return esc(t);
  let words = q.split(/\s+/).map(fold).filter(Boolean);
  if (/^[\d\s+\-().]+$/.test(q.trim()) && phoneDigits(q)) words = [phoneDigits(q)];
  const spans = [];
  for (const w of words) for (let i = n.indexOf(w); i !== -1; i = n.indexOf(w, i + 1)) spans.push([i, i + w.length]);
  if (!spans.length) return esc(t);
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of spans) { if (merged.length && a <= merged.at(-1)[1]) merged.at(-1)[1] = Math.max(b, merged.at(-1)[1]); else merged.push([a, b]); }
  let out = '', pos = 0;
  for (const [a, b] of merged) { out += esc(t.slice(pos, a)) + '<mark>' + esc(t.slice(a, b)) + '</mark>'; pos = b; }
  return out + esc(t.slice(pos));
}

// Ταύτιση μέλους (για Διατάγματα/εισαγωγές): email → κινητό → ονοματεπώνυμο
export function findMember(tx, m, freeOnly = false) {
  const ok = (r) => !freeOnly || r.registry_no == null;
  const email = String(m.email || '').trim().toLowerCase(), mobile = String(m.mobile || '').trim();
  const all = sortBy(tx.all('member_registry'), 'id');
  let r = email && all.find((x) => ok(x) && String(x.email || '').toLowerCase() === email);
  if (!r && mobile) r = all.find((x) => ok(x) && x.mobile === mobile);
  const sn = String(m.surname || '').trim().toLowerCase(), fn = String(m.first_name || '').trim().toLowerCase();
  if (!r && sn && fn) r = all.find((x) => ok(x) && String(x.surname || '').toLowerCase() === sn && String(x.first_name || '').toLowerCase() === fn);
  return r ? r.id : null;
}
const MEMBER_COLS = ['registry_no', 'surname', 'first_name', 'email', 'other_emails', 'mobile', 'other_mobiles', 'degree', 'declared_lodge_count', 'deregistered_note', 'additional_lodges', 'active', 'surname_variants', 'first_name_variants', 'source_row', 'no_contact'];
export function insertMember(tx, m, id) {
  const row = Object.fromEntries(MEMBER_COLS.map((k) => [k, m[k] ?? (k === 'active' ? 1 : k === 'registry_no' || k === 'source_row' ? null : '')]));
  row.active = m.active === false || m.active === 0 ? 0 : 1;
  row.no_contact = m.no_contact ? 1 : 0;
  if (row.no_contact) row.active = 0;
  const r = tx.insert('member_registry', id ? { id, ...row } : row);
  setMemberLodges(tx, r.id, m.lodges || []);
  return r.id;
}
export function updateMember(tx, id, m) {
  const row = Object.fromEntries(MEMBER_COLS.filter((k) => m[k] !== undefined).map((k) => [k, m[k]]));
  if ('active' in row) row.active = row.active === false || row.active === 0 ? 0 : 1;
  if ('no_contact' in row) { row.no_contact = row.no_contact ? 1 : 0; if (row.no_contact) row.active = 0; }
  if (row.registry_no == null) delete row.registry_no;
  tx.update('member_registry', id, row);
  if (m.lodges) setMemberLodges(tx, id, m.lodges);
}
function setMemberLodges(tx, mid, lodges) {
  tx.remove('member_lodges', (l) => l.member_id === mid);
  lodges.forEach((l, i) => tx.insert('member_lodges', { member_id: mid, seq: Number(l.seq) || i + 1, lodge_name: String(l.name ?? l.lodge_name ?? '').trim(), lodge_number: String(l.number ?? l.lodge_number ?? '').trim(), member_status: String(l.status ?? l.member_status ?? '').trim() }));
}
const parseLodges = (v) => String(v || '').split('\n').filter((x) => x.trim()).map((line, i) => { const p = line.split('|').map((x) => x.trim()); while (p.length < 3) p.push(''); return { seq: i + 1, name: p[0], number: p[1], status: p.slice(2).join(' | ').trim() }; });

// ---------------------------------------------------------------- σελίδες
function listPage({ query }) {
  const field = HINTS[query.field] ? query.field : 'surname', q = String(query.q || '').trim(), pg = Math.max(1, Number(query.p) || 1);
  const xs = sortBy(memberSearch(q, field), 'surname', 'first_name', 'id'), byM = lodgesByMember();
  const shown = xs.slice((pg - 1) * PAGE, pg * PAGE);
  const lq = field === 'lodge' ? q.replace(/^\s*(\d+|Φ)\s*·\s*/, '') : q;
  const H = (v, f) => hl(v, q, field === 'all' || field === f);
  const extra = (x, col, f) => { const v = x[col]; if (!(q && v && (field === 'all' || field === f))) return ''; const h = hl(v, q); return h.includes('<mark>') ? `<br><small class="muted">${h}</small>` : ''; };
  const rows = shown.map((x) => {
    const ls = byM[x.id] || [];
    const lod = ls.slice(0, 3).map((l) => hl(`${l.lodge_name} ${l.lodge_number}`.trim(), lq, field === 'lodge' || field === 'all')).join('<br>') + (ls.length > 3 ? `<br><small>+${ls.length - 3} ακόμη</small>` : '');
    return [`<b>${x.id}</b>`, H(x.registry_no ?? '', 'all'), H(x.surname, 'surname') + extra(x, 'surname_variants', 'surname'), H(x.first_name, 'first_name') + extra(x, 'first_name_variants', 'first_name'),
      noContact(x) ? '<span class="muted">⛔</span>' : H(x.email, 'email') + extra(x, 'other_emails', 'email'), noContact(x) ? '<span class="muted">⛔</span>' : H(x.mobile, 'mobile') + extra(x, 'other_mobiles', 'mobile'), esc(x.degree), lod, noContact(x) ? `<span class="pill bad" title="${NO_CONTACT}">⛔ Διαγραμμένος</span>` : x.active ? 'ΝΑΙ' : 'ΟΧΙ', `<a class="btn small" href="#/members/${x.id}">Επεξεργασία</a>`];
  });
  const [qlabel, ph, itype] = HINTS[field];
  const flabel = Object.fromEntries(MEMBER_FIELDS)[field];
  const summary = q ? `${xs.length === 1 ? 'Βρέθηκε <b>1</b> μέλος' : `Βρέθηκαν <b>${xs.length}</b> μέλη`} για «<b>${esc(q)}</b>» σε: <b>${esc(flabel)}</b>` : `Σύνολο <b>${xs.length}</b> μελών`;
  const mk = (p) => '#/members?' + new URLSearchParams({ q, field, p });
  return {
    title: 'Μητρώο Μελών',
    html: `<h1>Μητρώο Μελών</h1>${notice(query.msg)}<div class="toolbar"><a class="btn primary" href="#/members/new">+ Προσθήκη Μέλους</a>${(() => { const n = sameNameGroups().length; return n ? `<a class="btn" href="#/members/duplicates">Διπλές εγγραφές (${n})</a>` : ''; })()}<button class="btn" data-act="export">⬇ Excel</button></div>
<div class="card member-search"><h3 style="margin-top:0">Αναζήτηση μέλους</h3><form class="msearch" id="ms"><fieldset class="msfield"><legend>1. Τι θα δώσετε;</legend>
${MEMBER_FIELDS.map(([k, v]) => `<label class="chip"><input type="radio" name="field" value="${k}"${k === field ? ' checked' : ''}><span>${esc(v)}</span></label>`).join('')}</fieldset>
<div><label for="msq" id="msqlabel">2. ${esc(qlabel)}</label><input id="msq" name="q" value="${esc(q)}" autofocus autocomplete="off" type="${itype}" placeholder="${esc(ph)}"${field === 'lodge' ? ' list="lodgelist"' : ''}>
<datalist id="lodgelist">${lodgesAll().map((l) => `<option value="${esc(l.number)} · ${esc(l.name)}">`).join('')}</datalist></div>
<div class="msbtns"><button class="btn primary">Αναζήτηση</button>${q ? '<a class="btn" href="#/members">Καθαρισμός</a>' : ''}</div></form><p class="msresult">${summary}</p></div>
${table(['ID', 'Αρ. Μητρώου', 'Επώνυμο', 'Όνομα', 'Email', 'Κινητό', 'Βαθμός', 'Στοές', 'Ενεργός', 'Ενέργειες'], rows, q ? `Δεν βρέθηκε μέλος για «${q}» σε: ${flabel}. Δοκιμάστε «Όλα» ή λιγότερες λέξεις.` : 'Δεν υπάρχουν εγγραφές.')}
${pager(xs.length, pg, PAGE, mk)}
<details class="card fold"><summary><b>Εισαγωγή μελών από Excel (Προσθήκη / Γενική Αντικατάσταση)</b></summary><form id="imp" style="margin-top:10px">
<p class="muted">Δεκτά: το αρχείο-πηγή του Μητρώου (Member_ID, Surname, First_Name, …, Lodge_1, Number_1, Status_1, …) ή το Excel που κατεβάζει η εφαρμογή.</p>
<label>Αρχείο (.xlsx, .csv)</label><input type="file" name="file" accept=".xlsx,.xls,.csv">
<label style="margin-top:10px">ή Επικόλληση από Excel (επιλέξτε όλο το φύλλο μαζί με τις επικεφαλίδες, Ctrl+C, και Ctrl+V εδώ)</label><textarea name="paste" class="short" placeholder="Member_ID	Surname	First_Name	…"></textarea>
<p class="muted">Μέλη με <b>All_Deregistered (ΔΙΑΓΡΑΦΕΝ) = ΝΑΙ</b> ή <b>Status_1 = 5. ΔΙΑΓΡΑΦΕΝ</b> καταχωρούνται ως <b>διαγραμμένα</b>: απαγορεύεται κάθε επικοινωνία (δεν εμφανίζονται σε παραλήπτες, ευχές, εκπροσώπους).</p>
<label style="margin-top:10px">Λειτουργία</label><select name="mode"><option value="merge">Προσθήκη / Ενημέρωση (συνιστάται)</option><option value="replace">Γενική Αντικατάσταση</option></select>
<div class="toolbar" style="margin-top:10px"><button class="btn primary">Εισαγωγή</button></div></form></details>`,
    mount(el) {
      const qi = el.querySelector('#msq'), lab = el.querySelector('#msqlabel');
      el.querySelectorAll('.msfield input').forEach((r) => r.addEventListener('change', () => {
        const h = HINTS[r.value]; lab.textContent = '2. ' + h[0]; qi.placeholder = h[1]; qi.type = h[2];
        if (r.value === 'lodge') qi.setAttribute('list', 'lodgelist'); else qi.removeAttribute('list'); qi.focus();
      }));
      onSubmit(el.querySelector('#ms'), (d) => go('/members', { q: d.q, field: d.field }));
      bind(el, { export: exportMembers });
      onSubmit(el.querySelector('#imp'), async (d) => {
        const paste = String(d.paste || '').trim(), hasFile = d.file && d.file.size;
        if (!paste && !hasFile) throw new Error('Επιλέξτε αρχείο ή επικολλήστε τις γραμμές από το Excel.');
        if (d.mode === 'replace' && !confirmDo('Γενική αντικατάσταση: όλο το Μητρώο θα αντικατασταθεί από το αρχείο (η προηγούμενη μορφή μένει στο ιστορικό του GitHub). Συνέχεια;')) return;
        await exportMembers(); // αντίγραφο ασφαλείας πριν από κάθε εισαγωγή
        const msg = await importMembers(hasFile ? d.file : paste, d.mode);
        flash(msg); go('/members');
      });
    },
  };
}

// Πού εμφανίζεται το μέλος (οι λίστες δείχνουν σε αυτό — δεν κρατούν δικά τους αντίγραφα)
function usesOf(m) {
  const reps = db.all('reps').filter((r) => r.member_id === m.id), offs = db.all('member_degrees_offices').filter((o) => o.member_id === m.id), gr = db.all('greetings_log').filter((g) => g.member_id === m.id);
  const parts = [reps.length && `Εκπρόσωπος ΜΔ: ${reps.map((r) => `<a href="#/reps/edit/${r.id}">${esc(String(r.office || 'χωρίς αξίωμα').split(' · ')[0])}</a>`).join(', ')}`,
    offs.length && `Επετηρίδα: ${offs.length} εγγραφές`, gr.length && `Ευχές: ${gr.length}`, m.merged_from && `Συγχωνεύθηκαν: ${esc(m.merged_from)}`].filter(Boolean);
  return parts.length ? `<p class="muted">${parts.join(' · ')}</p>` : '';
}
function formPage(m) {
  const ls = m ? lodgesByMember()[m.id] || [] : [];
  const x = m || { active: 1 };
  const f = (k, label, extra = '') => `<div><label>${label}</label><input name="${k}" value="${esc(x[k] ?? '')}" ${extra}></div>`;
  const offices = m ? sortBy(db.all('member_degrees_offices').filter((o) => o.member_id === m.id), (o) => -(o.decree_year || 0)) : [];
  return {
    title: m ? `Μέλος #${m.id}` : 'Νέο Μέλος',
    html: `<p><a href="#/members">← Μητρώο Μελών</a></p><h1>${m ? `${esc(m.surname)} ${esc(m.first_name)} <small class="muted">#${m.id}</small>` : 'Νέο Μέλος'}</h1>${noContact(m) ? `<div class="card nocontact">${NO_CONTACT}</div>` : ''}${m ? usesOf(m) : ''}
<form id="mf"><div class="grid card">${f('registry_no', 'Αρ. Μητρώου', 'inputmode="numeric"')}${f('surname', 'Επώνυμο', 'required')}${f('first_name', 'Όνομα', 'required')}
${f('surname_variants', 'Παραλλαγές Επωνύμου', 'placeholder="π.χ. CASTANEDA; ΚΑΣΤΑΝΕΔΑ"')}${f('first_name_variants', 'Παραλλαγές Ονόματος', 'placeholder="π.χ. CARLOS; ΚΑΡΛΟΣ"')}
${f('email', 'Κύριο Email', 'inputmode="email"')}${f('other_emails', 'Άλλα Email')}${f('mobile', 'Κύριο Κινητό', 'inputmode="tel"')}${f('other_mobiles', 'Άλλα Κινητά')}${f('degree', 'Τεκτονικός Βαθμός')}
<div><label>Ενεργός</label><select name="active"><option value="1"${x.active ? ' selected' : ''}>ΝΑΙ</option><option value="0"${x.active ? '' : ' selected'}>ΟΧΙ</option></select></div>
<div><label>Επικοινωνία</label><select name="no_contact"><option value="0">Επιτρέπεται</option><option value="1"${noContact(x) ? ' selected' : ''}>⛔ Απαγορεύεται (διαγραμμένος)</option></select></div>
<div class="full"><label>Σημείωση Διαγραφής</label><input name="deregistered_note" value="${esc(x.deregistered_note || '')}"></div>
<div class="full"><label>Πρόσθετες Στοές / παλαιά πληροφορία</label><textarea name="additional_lodges" class="short">${esc(x.additional_lodges || '')}</textarea></div>
<div class="full"><label>Στοές</label><textarea name="lodges_text" class="short" placeholder="Μία Στοά ανά γραμμή: ΟΝΟΜΑ | ΑΡΙΘΜΟΣ | ΚΑΤΑΣΤΑΣΗ">${esc(lodgesText(ls))}</textarea><small class="muted">Παράδειγμα: ΠΑΡΘΕΝΩΝ | 3 | 1. ΤΑΚΤΙΚΟ</small></div></div>
<div class="toolbar"><button class="btn primary">💾 Αποθήκευση</button><a class="btn" href="#/members">Ακύρωση</a>${m && !noContact(m) ? `<a class="btn" href="#/letters/new?to_name=${encodeURIComponent(`${m.first_name} ${m.surname}`)}&to_email=${encodeURIComponent(m.email || '')}">✉ Επιστολή</a>` : ''}${m ? '<button type="button" class="btn danger" data-act="del">Διαγραφή</button>' : ''}</div></form>
${offices.length ? `<h2>Επετηρίδα</h2>${table(['Έτος', 'Αξίωμα / Τίτλος', 'Διάταγμα'], offices.map((o) => [esc(o.decree_year), esc(o.office), o.decree_id ? `<a href="#/decrees/${o.decree_id}">${esc(o.decree_no)}/${esc(o.decree_year)}</a>` : esc(o.decree_no ? `${o.decree_no}/${o.decree_year}` : '')]))}` : ''}`,
    mount(el) {
      onSubmit(el.querySelector('#mf'), async (d) => {
        const rn = String(d.registry_no || '').trim();
        if (rn && !/^\d+$/.test(rn)) throw new Error('Ο αριθμός μητρώου πρέπει να είναι αριθμός.');
        const lodges = parseLodges(d.lodges_text);
        const row = { ...Object.fromEntries(['surname', 'first_name', 'email', 'other_emails', 'mobile', 'other_mobiles', 'degree', 'deregistered_note', 'additional_lodges', 'surname_variants', 'first_name_variants'].map((k) => [k, String(d[k] || '').trim()])),
          active: d.active === '1' ? 1 : 0, no_contact: d.no_contact === '1' || isDereg('', lodges[0]?.status) ? 1 : 0, registry_no: rn ? Number(rn) : null, declared_lodge_count: String(lodges.length), lodges };
        const id = await db.save(m ? `Μέλος #${m.id}: ενημέρωση` : 'Νέο μέλος', (tx) => {
          if (rn && tx.find('member_registry', (x) => x.registry_no === Number(rn) && (!m || x.id !== m.id))) throw new Error(`Ο αριθμός μητρώου ${rn} υπάρχει ήδη.`);
          if (m) { updateMember(tx, m.id, { ...row, registry_no: row.registry_no }); if (row.registry_no == null) tx.update('member_registry', m.id, { registry_no: null }); return m.id; }
          return insertMember(tx, row);
        });
        flash('Η εγγραφή αποθηκεύτηκε.'); go('/members', { q: row.surname, field: 'surname' });
        return id;
      });
      bind(el, { async del() {
        if (!confirmDo(`Οριστική διαγραφή του μέλους ${m.surname} ${m.first_name}; (Θα κατέβει πρώτα Excel ασφαλείας.)`)) return;
        await exportMembers();
        await db.save(`Διαγραφή μέλους #${m.id}`, (tx) => { tx.remove('member_lodges', (l) => l.member_id === m.id); tx.remove('member_degrees_offices', (o) => o.member_id === m.id); tx.remove('member_registry', m.id); });
        flash('Η εγγραφή διαγράφηκε.'); go('/members');
      } });
    },
  };
}

// ---------------------------------------------------------------- Excel
export async function exportMembers() {
  const X = await XLSX();
  const ms = sortBy(membersAll(), 'surname', 'first_name', 'id');
  const wb = X.utils.book_new();
  const add = (name, rows) => { const ws = X.utils.aoa_to_sheet(rows); ws['!cols'] = rows[0].map(() => ({ wch: 20 })); X.utils.book_append_sheet(wb, ws, name); };
  add('ΜΗΤΡΩΟ ΜΕΛΩΝ', [['ID', 'Αρ. Μητρώου', 'Επώνυμο', 'Όνομα', 'Κύριο Email', 'Άλλα Email', 'Κύριο Κινητό', 'Άλλα Κινητά', 'Τεκτονικός Βαθμός', 'Ενεργός', 'Σημείωση Διαγραφής', 'Δηλωμένος Αρ. Στοών', 'Πρόσθετες Στοές', 'Γραμμή Πηγής', 'Ενημερώθηκε', 'Παραλλαγές Επωνύμου', 'Παραλλαγές Ονόματος', 'Απαγορεύεται Επικοινωνία'],
    ...ms.map((m) => [m.id, m.registry_no ?? '', m.surname, m.first_name, m.email, m.other_emails, m.mobile, m.other_mobiles, m.degree, m.active ? 'ΝΑΙ' : 'ΟΧΙ', m.deregistered_note, m.declared_lodge_count, m.additional_lodges, m.source_row ?? '', m.updated_at, m.surname_variants || '', m.first_name_variants || '', noContact(m) ? 'ΝΑΙ' : 'ΟΧΙ'])]);
  add('ΣΤΟΕΣ ΜΕΛΩΝ', [['ID Μέλους', 'Α/Α Στοάς', 'Στοά', 'Αριθμός Στοάς', 'Κατάσταση'], ...sortBy(db.all('member_lodges'), 'member_id', 'seq').map((l) => [l.member_id, l.seq, l.lodge_name, l.lodge_number, l.member_status])]);
  add('ΒΑΘΜΟΙ & ΑΞΙΩΜΑΤΑ', [['ID', 'ID Μέλους', 'Τύπος Εγγραφής', 'Βαθμός', 'Αξίωμα', 'ID Διατάγματος', 'Αρ. Διατάγματος', 'Έτος', 'Από', 'Έως', 'Ενεργό', 'Σημειώσεις'],
    ...sortBy(db.all('member_degrees_offices'), 'member_id', 'id').map((o) => [o.id, o.member_id, o.record_type, o.degree, o.office, o.decree_id, o.decree_no, o.decree_year, o.valid_from, o.valid_to, o.is_current ? 'ΝΑΙ' : 'ΟΧΙ', o.notes])]);
  const d = new Date();
  X.writeFile(wb, `EMSTE_MEMBER_REGISTRY_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.xlsx`);
}

const hkey = (x) => String(x || '').toLowerCase().replace(/[^0-9a-zͰ-Ͽ]/g, '');
const splitMulti = (v) => String(v || '').split(/[;\n]+/).map((p) => p.trim().replace(/^,|,$/g, '').trim()).filter(Boolean);
const plainUpper = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const yes = (v) => ['ΝΑΙ', 'NAI', 'YES', 'TRUE', '1', 'Y'].includes(plainUpper(v));
// Κανόνας διαγραφής: All_Deregistered = ΝΑΙ ή Status_1 (κατάσταση στην πρώτη Στοά) = «5. ΔΙΑΓΡΑΦΕΝ»
export const isDereg = (all, status1) => yes(all) || /ΔΙΑΓΡΑΦ/.test(plainUpper(status1));
// Αριθμός Στοάς από το όνομα όταν λείπει. Ονόματα που υπάρχουν δύο φορές (ΠΛΑΤΩΝ 70/103, ΑΚΡΟΠΟΛΙΣ 2/104) ξεχωρίζουν με το έτος.
const lodgeKey = (v) => plainUpper(v).replace(/[ABEZHIKMNOPTXY]/g, (c) => 'ΑΒΕΖΗΙΚΜΝΟΡΤΧΥ'['ABEZHIKMNOPTXY'.indexOf(c)]).replace(/[^0-9Α-Ω]/g, '');
const LODGE_ALIASES = { ΑΚΡΟΠΟΛΙΣ2010: '104', ΠΛΑΤΩΝ1990: '103', ΠΡΟΜΗΘΕΥΣ2014: '105', ΔΗΜΗΤΗΡ: '113', ΕΝΩΣΙΣΚΥΠΡΟΣ: '55', ΦΟΙΝΙΞΚΕΡΚΥΡΑΣ: 'Φ', ΦΟΙΝΙΞ: 'Φ' };
export function lodgeNumberFor(name, num) {
  if (String(num || '').trim()) return String(num).trim().replace(/\.0$/, '');
  const n = lodgeKey(name);
  if (!n) return '';
  if (LODGE_ALIASES[n]) return LODGE_ALIASES[n];
  const all = lodgesAll(), one = (xs) => (xs.length === 1 ? String(xs[0].number) : '');
  return one(all.filter((l) => lodgeKey(l.name) === n)) || one(all.filter((l) => lodgeKey(l.name).length > 3 && (n.startsWith(lodgeKey(l.name)) || lodgeKey(l.name).startsWith(n))));
}
function sourceMember(d, rn) {
  const g = (...ks) => { for (const k of ks) { const v = d[hkey(k)]; if (v) return v; } return ''; };
  const sv = g('All_Surname_Variants'), fv = g('All_FirstName_Variants');
  const sn = g('Surname') || (splitMulti(sv)[0] || ''), fn = g('First_Name') || (splitMulti(fv)[0] || '');
  if (!sn && !fn) return null;
  const emails = splitMulti(g('Email')), mobiles = splitMulti(g('Mobile')), lodges = [];
  for (let j = 1; j <= 6; j++) { const n = g(`Lodge_${j}`), num = g(`Number_${j}`), st = g(`Status_${j}`); if (n || num || st) lodges.push({ seq: lodges.length + 1, name: n, number: lodgeNumberFor(n, num), status: st }); }
  const bad = [];
  for (const part of String(g('Additional_Lodges (beyond 6)', 'Additional_Lodges')).split(';').map((p) => p.trim()).filter(Boolean)) {
    const mm = /^(.*?)\s+(\S+)\s*\((.*)\)\s*$/.exec(part);
    if (mm) lodges.push({ seq: lodges.length + 1, name: mm[1].trim(), number: lodgeNumberFor(mm[1], mm[2]), status: mm[3].trim() }); else bad.push(part);
  }
  const dereg = isDereg(g('All_Deregistered (ΔΙΑΓΡΑΦΕΝ)', 'All_Deregistered'), g('Status_1')), sts = lodges.map((l) => l.status.toUpperCase()).filter(Boolean);
  const deceased = sts.length > 0 && sts.every((x) => x.includes('ΜΕΤΕΣΘΕΝ'));
  const variants = (v, name) => { const vs = splitMulti(v); return vs.some((x) => plainUpper(x) !== plainUpper(name)) ? vs.join('; ') : ''; };
  const rid = String(g('Member_ID')).replace('.0', '');
  return { source_row: rn, registry_no: /^\d+$/.test(rid) ? Number(rid) : null, surname: sn, first_name: fn, surname_variants: variants(sv, sn), first_name_variants: variants(fv, fn),
    email: emails[0] || '', other_emails: emails.slice(1).join('; '), mobile: mobiles[0] || '', other_mobiles: mobiles.slice(1).join('; '), degree: g('Degree'),
    declared_lodge_count: g('Number_of_Lodges') || String(lodges.length), deregistered_note: dereg ? 'ΔΙΑΓΡΑΦΕΝ — απαγορεύεται κάθε επικοινωνία' : deceased ? 'ΜΕΤΕΣΘΕΝ ΕΙΣ ΑΙ. ΑΝ.' : '',
    additional_lodges: bad.join('; '), active: !dereg && !deceased, no_contact: dereg ? 1 : 0, lodges };
}

export async function importMembers(file, mode = 'merge') {
  const sheets = typeof file === 'string' ? [{ name: 'paste', rows: parsePasted(file) }] : await readXlsx(file), first = sheets[0].rows;
  if (!first.length) throw new Error('Το αρχείο είναι κενό.');
  const keys = first[0].map(hkey);
  let items;
  if (keys.includes('allsurnamevariants') || ['surname', 'firstname', 'lodge1'].every((k) => keys.includes(k))) {
    items = first.slice(1).map((r, i) => sourceMember(Object.fromEntries(keys.map((k, j) => [k, String(r[j] ?? '').trim()]).filter(([k]) => k)), i + 2))
      .filter(Boolean).map((m) => ({ id: null, member: m }));
  } else {
    const sh = sheets.find((s) => s.name === 'ΜΗΤΡΩΟ ΜΕΛΩΝ') || sheets[0], h = sh.rows[0].map((x) => String(x).trim()), v = (r, n) => { const i = h.indexOf(n); return i < 0 ? '' : String(r[i] ?? '').trim(); };
    if (!h.includes('Επώνυμο')) throw new Error('Δεν αναγνωρίστηκαν οι στήλες. Η πρώτη γραμμή πρέπει να είναι οι επικεφαλίδες (Member_ID, Surname, First_Name, … ή ID, Επώνυμο, Όνομα, …).');
    items = sh.rows.slice(1).filter((r) => v(r, 'Επώνυμο') || v(r, 'Όνομα')).map((r) => ({ id: Number(v(r, 'ID')) || null, member: {
      surname: v(r, 'Επώνυμο'), first_name: v(r, 'Όνομα'), email: v(r, 'Κύριο Email'), other_emails: v(r, 'Άλλα Email'), mobile: v(r, 'Κύριο Κινητό'), other_mobiles: v(r, 'Άλλα Κινητά'), degree: v(r, 'Τεκτονικός Βαθμός'),
      active: yes(v(r, 'Ενεργός')), no_contact: yes(v(r, 'Απαγορεύεται Επικοινωνία')) ? 1 : 0, deregistered_note: v(r, 'Σημείωση Διαγραφής'), declared_lodge_count: v(r, 'Δηλωμένος Αρ. Στοών'), additional_lodges: v(r, 'Πρόσθετες Στοές'),
      source_row: Number(v(r, 'Γραμμή Πηγής')) || null, registry_no: Number(v(r, 'Αρ. Μητρώου')) || null, surname_variants: v(r, 'Παραλλαγές Επωνύμου'), first_name_variants: v(r, 'Παραλλαγές Ονόματος'), lodges: [] } }));
    const ls = sheets.find((s) => s.name === 'ΣΤΟΕΣ ΜΕΛΩΝ');
    if (ls) {
      const lh = ls.rows[0].map((x) => String(x).trim()), lv = (r, n) => String(r[lh.indexOf(n)] ?? '').trim(), byId = Object.fromEntries(items.filter((x) => x.id).map((x) => [x.id, x]));
      for (const r of ls.rows.slice(1)) { const it = byId[Number(lv(r, 'ID Μέλους'))]; if (it) it.member.lodges.push({ seq: Number(lv(r, 'Α/Α Στοάς')) || 1, name: lv(r, 'Στοά'), number: lv(r, 'Αριθμός Στοάς'), status: lv(r, 'Κατάσταση') }); }
    }
  }
  return applyMemberItems(items, mode);
}

// Κοινή εφαρμογή εισαγωγής μελών (Excel, ή το Μητρώο από τις ρυθμίσεις της παλιάς εφαρμογής στο Render)
export async function applyMemberItems(items, mode = 'merge') {
  if (!items.length) throw new Error('Δεν βρέθηκαν εγγραφές μελών.');
  let added = 0, updated = 0;
  await db.save(mode === 'replace' ? 'Μητρώο Μελών: γενική αντικατάσταση' : 'Μητρώο Μελών: εισαγωγή', (tx) => {
    added = updated = 0;
    if (mode === 'replace') { tx.replace('member_lodges', []); tx.replace('member_degrees_offices', []); tx.replace('member_registry', []); }
    for (const { id, member: m } of items) {
      if (mode === 'merge') {
        let mid = id && tx.get('member_registry', id) ? id : null;
        if (!mid && m.registry_no != null) mid = (tx.find('member_registry', (x) => x.registry_no === m.registry_no) || {}).id || null;
        if (!mid) mid = findMember(tx, m, true);
        if (mid) { updateMember(tx, mid, m); updated++; continue; }
      }
      insertMember(tx, m, mode === 'replace' && id ? id : undefined); added++;
    }
  });
  const lodges = items.reduce((s, x) => s + (x.member.lodges || []).length, 0), blocked = items.filter((x) => x.member.no_contact).length;
  return `${mode === 'replace' ? 'Γενική αντικατάσταση' : 'Προσθήκη / ενημέρωση'} ολοκληρώθηκε: ${items.length} εγγραφές (${added} νέες, ${updated} ενημερωμένες), ${lodges} συμμετοχές σε Στοές, ${blocked} διαγραμμένα μέλη (απαγορεύεται η επικοινωνία).`;
}

// Εφάπαξ: σήμανση των ήδη καταχωρημένων διαγραμμένων μελών (σημείωση ΔΙΑΓΡΑΦΕΝ ή 1η Στοά «5. ΔΙΑΓΡΑΦΕΝ»)
db.migrate('members-no-contact-2026-10', (tx) => {
  const first = {};
  for (const l of sortBy(tx.all('member_lodges'), 'seq', 'id')) first[l.member_id] ??= l.member_status;
  for (const m of tx.all('member_registry')) {
    if (noContact(m) || !(/ΔΙΑΓΡΑΦ/.test(plainUpper(m.deregistered_note)) || isDereg('', first[m.id]))) continue;
    tx.update('member_registry', m.id, { no_contact: 1, active: 0 });
  }
});

// Συγχώνευση διπλών εγγραφών του ίδιου προσώπου σε μία (την κύρια): Στοές, email, κινητά, παραλλαγές ονόματος και
// όλες οι αναφορές (Επετηρίδα, Εκπρόσωποι, Ευχές, Έργα, Επιστολές, Διατάγματα) μεταφέρονται· οι υπόλοιπες εγγραφές διαγράφονται.
export function mergeMembers(tx, mainId, otherIds) {
  const main = tx.get('member_registry', mainId), others = otherIds.filter((i) => i !== mainId).map((i) => tx.get('member_registry', i)).filter(Boolean);
  if (!main || !others.length) return 0;
  const all = [main, ...others], uniq = (xs) => [...new Map(xs.map((x) => String(x || '').trim()).filter(Boolean).map((x) => [x.toLowerCase(), x])).values()];
  const emails = uniq(all.flatMap((m) => [m.email, ...String(m.other_emails || '').split(/[;,\s]+/)]));
  const mobiles = uniq(all.flatMap((m) => [m.mobile, ...String(m.other_mobiles || '').split(/[;,]/)])).filter((v, i, a) => a.findIndex((w) => digits10(w) === digits10(v)) === i);
  const vars = (k, vk) => { const base = plainUpper(main[k]); const vs = uniq(all.flatMap((m) => [m[k], ...String(m[vk] || '').split(';')])).filter((v) => plainUpper(v) !== base || v !== main[k]); return vs.filter((v) => plainUpper(v) !== base).join('; '); };
  const regs = all.map((m) => m.registry_no).filter((x) => x != null), blocked = all.some((m) => Number(m.no_contact) === 1);
  tx.update('member_registry', main.id, {
    email: main.email || emails[0] || '', other_emails: emails.filter((e) => e.toLowerCase() !== String(main.email || emails[0] || '').toLowerCase()).join('; '),
    mobile: main.mobile || mobiles[0] || '', other_mobiles: mobiles.filter((m) => digits10(m) !== digits10(main.mobile || mobiles[0] || '')).join('; '),
    surname_variants: vars('surname', 'surname_variants'), first_name_variants: vars('first_name', 'first_name_variants'),
    registry_no: main.registry_no ?? (regs.length ? Math.min(...regs) : null), degree: main.degree || (others.find((m) => m.degree) || {}).degree || '',
    no_contact: blocked ? 1 : 0, active: blocked ? 0 : all.some((m) => m.active !== 0) ? 1 : 0,
    merged_from: uniq([main.merged_from, ...others.map((m) => (m.registry_no != null ? `Αρ. Μητρώου ${m.registry_no}` : `#${m.id}`))]).join('; '),
  });
  const ids = new Set(others.map((m) => m.id)), have = new Set(tx.all('member_lodges').filter((l) => l.member_id === main.id).map((l) => lodgeNoKey(l.lodge_number) + '|' + l.member_status));
  let seq = Math.max(0, ...tx.all('member_lodges').filter((l) => l.member_id === main.id).map((l) => Number(l.seq) || 0));
  for (const l of tx.all('member_lodges').filter((l) => ids.has(l.member_id))) {
    const k = lodgeNoKey(l.lodge_number) + '|' + l.member_status;
    if (have.has(k)) tx.remove('member_lodges', l.id); else { have.add(k); tx.update('member_lodges', l.id, { member_id: main.id, seq: ++seq }); }
  }
  for (const [t, k] of [['member_degrees_offices', 'member_id'], ['reps', 'member_id'], ['greetings_log', 'member_id'], ['project_members', 'member_id'], ['project_units', 'leader_member_id'], ['letters', 'recipient_member_id']]) {
    for (const x of tx.all(t)) if (ids.has(x[k])) tx.update(t, x.id, { [k]: main.id });
  }
  for (const d of tx.all('decree_documents')) {
    let a; try { a = JSON.parse(d.appointments || '[]'); } catch { continue; }
    if (a.some((x) => ids.has(Number(x.member_id)))) tx.update('decree_documents', d.id, { appointments: JSON.stringify(a.map((x) => (ids.has(Number(x.member_id)) ? { ...x, member_id: main.id } : x))) });
  }
  for (const m of others) tx.remove('member_registry', m.id);
  return others.length;
}

function duplicatesPage() {
  const groups = sameNameGroups(), byM = lodgesByMember(), sure = groups.filter((g) => g.sure), doubt = groups.filter((g) => !g.sure);
  const card = (g, gi) => `<div class="card dupgroup" data-g="${gi}"><h3 style="margin-top:0">${esc(g.members[0].surname)} ${esc(g.members[0].first_name)} <small class="muted">${g.members.length} εγγραφές</small></h3>
${table(['Κύρια', 'Μαζί', 'ID', 'Αρ. Μητρώου', 'Email', 'Κινητό', 'Στοές', 'Κατάσταση'], g.members.map((m) => [`<input type="radio" name="main${gi}" value="${m.id}"${m.id === g.main ? ' checked' : ''}>`,
  `<input type="checkbox" class="inc" value="${m.id}"${g.sure ? ' checked' : ''}>`, `<a href="#/members/${m.id}">${m.id}</a>`, esc(m.registry_no ?? '—'), esc([m.email, m.other_emails].filter(Boolean).join('; ') || '—'),
  esc([m.mobile, m.other_mobiles].filter(Boolean).join('; ') || '—'), esc((byM[m.id] || []).map((l) => `${l.lodge_name} ${l.lodge_number}`.trim()).join(', ') || '—'),
  noContact(m) ? '<span class="pill bad">⛔ Διαγραμμένος</span>' : m.active !== 0 ? 'Ενεργός' : 'Ανενεργός']))}
<div class="toolbar"><button class="btn primary" data-act="merge" data-g="${gi}">Συγχώνευση των επιλεγμένων σε μία εγγραφή</button></div></div>`;
  const all = [...sure, ...doubt];
  return {
    title: 'Διπλές εγγραφές μελών',
    html: `<p><a href="#/members">← Μητρώο Μελών</a></p><h1>Διπλές εγγραφές μελών</h1>
<div class="card"><p style="margin-top:0">Ένα πρόσωπο = μία εγγραφή στο Μητρώο. Εδώ εμφανίζονται μέλη με ίδιο ονοματεπώνυμο. Η συγχώνευση κρατά την «Κύρια» εγγραφή και μεταφέρει σε αυτή
Στοές, email, κινητά, αριθμούς μητρώου (ως σημείωση) και όλες τις αναφορές (Επετηρίδα, Εκπρόσωποι, Ευχές, Έργα, Επιστολές, Διατάγματα). Πριν από κάθε συγχώνευση κατεβαίνει Excel ασφαλείας.</p>
${sure.length ? `<button class="btn primary" data-act="mergeAll">Συγχώνευση όλων των σίγουρων (${sure.length} πρόσωπα, ${sure.reduce((s, g) => s + g.members.length - 1, 0)} διπλές εγγραφές)</button>` : '<b>Δεν υπάρχουν σίγουρες διπλές εγγραφές.</b>'}</div>
${sure.length ? `<h2>Σχεδόν σίγουρα το ίδιο πρόσωπο (${sure.length})</h2><p class="muted">Ίδιο ονοματεπώνυμο και όχι διαφορετικό κινητό.</p>${sure.map((g, i) => card(g, i)).join('')}` : ''}
${doubt.length ? `<h2>Ίδιο όνομα, διαφορετικό κινητό — ελέγξτε (${doubt.length})</h2><p class="muted">Μπορεί να είναι συνώνυμοι Αδελφοί· επιλέξτε «Μαζί» μόνο όσες εγγραφές είναι σίγουρα το ίδιο πρόσωπο.</p>${doubt.map((g, i) => card(g, sure.length + i)).join('')}` : ''}`,
    mount(el) {
      bind(el, {
        async merge(d) {
          const box = el.querySelector(`.dupgroup[data-g="${d.g}"]`), main = Number((box.querySelector('input[type=radio]:checked') || {}).value);
          const inc = [...box.querySelectorAll('.inc:checked')].map((i) => Number(i.value)).filter((i) => i !== main);
          if (!main || !inc.length) return toast('Επιλέξτε την κύρια εγγραφή και τουλάχιστον μία ακόμη στο «Μαζί».', 'error');
          if (!confirmDo(`Συγχώνευση ${inc.length + 1} εγγραφών σε μία (κύρια #${main}); Θα κατέβει πρώτα Excel ασφαλείας.`)) return;
          await exportMembers();
          await db.save(`Μητρώο: συγχώνευση διπλών εγγραφών #${main}`, (tx) => mergeMembers(tx, main, inc));
          flash('Οι εγγραφές συγχωνεύθηκαν.'); go('/members/duplicates');
        },
        async mergeAll() {
          if (!confirmDo(`Συγχώνευση ${sure.length} προσώπων (σίγουρες διπλές εγγραφές); Θα κατέβει πρώτα Excel ασφαλείας.`)) return;
          await exportMembers();
          let n = 0;
          await db.save(`Μητρώο: συγχώνευση ${sure.length} διπλών προσώπων`, (tx) => { n = 0; for (const g of sure) n += mergeMembers(tx, g.main, g.members.map((m) => m.id)); });
          flash(`Συγχωνεύθηκαν ${n} διπλές εγγραφές σε ${sure.length} πρόσωπα.`); go('/members/duplicates');
        },
      });
    },
  };
}

// Εφάπαξ: μία δεξαμενή — κάθε λίστα δείχνει στο μέλος (κύρια εγγραφή του προσώπου) και δεν κρατά αντίγραφα email/κινητών.
export function relinkToPool(tx) {
  const n = { linked: 0, copies: 0 };
  for (const r of tx.all('reps')) {
    const mid = r.member_id ? canonicalId(r.member_id, tx) : identify({ surname: r.surname, first_name: r.name, email: r.email, mobile: r.mobile }, tx);
    const P = mid ? person(mid, tx) : null, ch = {};
    if (mid && mid !== r.member_id) { ch.member_id = mid; n.linked++; }
    if (P && r.email && P.emails.some((e) => e.toLowerCase() === String(r.email).trim().toLowerCase())) ch.email = '';
    if (P && r.mobile && P.mobiles.some((m) => digits10(m) === digits10(r.mobile))) ch.mobile = '';
    if (/Άλλα email:/.test(r.notes || '')) ch.notes = String(r.notes).replace(/\s*·?\s*Άλλα email:[^·]*/g, '').trim();
    if ('email' in ch || 'mobile' in ch) n.copies++;
    if (Object.keys(ch).length) tx.update('reps', r.id, ch);
  }
  for (const o of tx.all('member_degrees_offices')) {
    const mid = o.member_id ? canonicalId(o.member_id, tx) : (o.full_name ? identify({ full_name: o.full_name }, tx) : null);
    if (mid && mid !== o.member_id) { tx.update('member_degrees_offices', o.id, { member_id: mid }); n.linked++; }
  }
  for (const [t, k] of [['greetings_log', 'member_id'], ['project_members', 'member_id'], ['project_units', 'leader_member_id'], ['letters', 'recipient_member_id']]) {
    for (const x of tx.all(t)) { const mid = x[k] && canonicalId(x[k], tx); if (mid && mid !== x[k]) { tx.update(t, x.id, { [k]: mid }); n.linked++; } }
  }
  return n;
}
db.migrate('people-single-source-2026-10', (tx) => { relinkToPool(tx); });

module({
  id: 'members',
  routes: {
    '/members': listPage,
    '/members/new': () => formPage(null),
    '/members/duplicates': duplicatesPage,
    '/members/:id': ({ params }) => { const m = db.get('member_registry', params.id); return m ? formPage(m) : '<h1>Δεν βρέθηκε το μέλος</h1>'; },
  },
  tile: { order: 60, render: () => `<div class="dtile"><h3><a href="#/members">Μητρώο Μελών</a></h3><div class="big">${membersAll().filter((m) => m.active !== 0).length} ενεργά μέλη</div><small class="muted">${membersAll().filter(noContact).length} διαγραμμένα (⛔ χωρίς επικοινωνία)</small>
<div class="acts"><a class="btn primary" href="#/members">Αναζήτηση</a><a class="btn" href="#/epeteirida">Επετηρίδα</a></div></div>` },
});
