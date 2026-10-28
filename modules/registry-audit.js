// ΕΛΕΓΧΟΣ ΑΛΛΑΓΩΝ (Μητρώο) — όλες οι αλλαγές που έκαναν οι Γραμματείς των Στοών στην Πύλη, ανά μέλος, με το είδος της
// «Αναγγελίας» (Εισδοχή, Διέλευση, Ανύψωση, Διαγραφή, Στοά συνδρομής …), πριν → τώρα, ποιος, πότε, σε ποιους στάλθηκε η αναγγελία
// και την έκδοση του Μητρώου της Στοάς (κάθε αποθήκευση = πλήρες αντίγραφο· επαναφορά από την Πύλη → Εκδόσεις).
import { db } from '../core/store.js';
import { module, go } from '../core/app.js';
import { esc, fold, sortBy, fmtDate, exportXlsx } from '../core/util.js';
import { lodgeNoKey } from './lodges.js';

const LABELS = { surname: 'Επώνυμο', first_name: 'Όνομα', email: 'Email', mobile: 'Κινητό', degree: 'Βαθμός', date_ea: 'Ημ. μύησης', date_fc: 'Ημ. Εταίρου', date_mm: 'Ημ. Διδασκάλου',
  member_status: 'Κατάσταση', capacity: 'Ιδιότητα', capacity_date: 'Ημ. ιδιότητας', jw_date: 'Ημ. Β΄ Επόπτη', sw_date: 'Ημ. Α΄ Επόπτη', wm_date: 'Ημ. Σεβασμίου', dereg_date: 'Ημ. διαγραφής', fee_rank: 'Στοά συνδρομής' };
const up = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); // χωρίς τόνους, κεφαλαία (ελληνικά)
// Είδος αναγγελίας μιας αλλαγής μέλους (ίδιος κανόνας με το Apps Script της Πύλης)
export function announceKinds(c) {
  const f = c.fields || {}, to = (k) => (f[k] ? String(f[k][1] || '') : ''), kinds = [];
  if (c.is_new) kinds.push(/ΥΙΟΘΕΤ/.test(up(to('capacity'))) ? 'Υιοθεσία (νέο μέλος)' : /ΕΠΑΝΕΛΘ/.test(up(to('capacity'))) ? 'Επάνοδος (νέο μέλος)' : 'Εισδοχή (νέο μέλος — Μαθητής)');
  if (f.member_status && /ΔΙΑΓΡΑΦ/.test(up(to('member_status')))) kinds.push('Διαγραφή');
  else if (f.member_status && /ΔΙΑΓΡΑΦ/.test(up(f.member_status[0]))) kinds.push('Επάνοδος / άρση διαγραφής');
  else if (f.member_status) kinds.push('Κατάσταση: ' + to('member_status'));
  const deg = up(to('degree'));
  if (!c.is_new && f.degree) kinds.push(/ΜΑΘΗΤ/.test(deg) ? 'Εισδοχή (Μαθητής)' : /ΕΤΑΙΡ/.test(deg) ? 'Διέλευση (Εταίρος)' : /ΔΙΔΑΣΚ/.test(deg) ? 'Ανύψωση σε Διδάσκαλο' : 'Βαθμός: ' + to('degree'));
  else if (!c.is_new) { if (f.date_mm && to('date_mm')) kinds.push('Ανύψωση σε Διδάσκαλο'); else if (f.date_fc && to('date_fc')) kinds.push('Διέλευση (Εταίρος)'); else if (f.date_ea && to('date_ea')) kinds.push('Εισδοχή (Μαθητής)'); }
  if (!c.is_new && f.capacity) kinds.push('Ιδιότητα: ' + (to('capacity') || '—'));
  if (f.fee_rank) kinds.push('Στοά συνδρομής: ' + (to('fee_rank') === '1' ? '1η (πλήρης)' : to('fee_rank') ? to('fee_rank') + 'η' : '—'));
  if (f.wm_date && to('wm_date')) kinds.push('Σεβάσμιος'); if (f.sw_date && to('sw_date')) kinds.push('Α΄ Επόπτης'); if (f.jw_date && to('jw_date')) kinds.push('Β΄ Επόπτης');
  if (!kinds.length) kinds.push('Μεταβολή στοιχείων');
  return kinds;
}
const KIND_FILTERS = ['Εισδοχή', 'Διέλευση', 'Ανύψωση', 'Διαγραφή', 'Επάνοδος', 'Υιοθεσία', 'Ιδιότητα', 'Στοά συνδρομής', 'Σεβάσμιος', 'Μεταβολή στοιχείων'];

// Μία γραμμή ανά (έκδοση × μέλος)· παλιές καταγραφές χωρίς λεπτομέρειες: μία γραμμή με τη σύνοψη
export function auditRows() {
  const out = [];
  for (const x of db.all('lodge_portal_log')) {
    const base = { at: x.at || x.applied_on || '', lodge: x.lodge_number, lodge_name: x.lodge_name, version: x.version_name, by: x.by || '', note: [x.note_type, x.note].filter(Boolean).join(' — '), to: x.announced_to || '', source: x.source || 'lodge' };
    if (Array.isArray(x.changes) && x.changes.length) for (const c of x.changes) out.push({ ...base, name: c.name || '', member_id: c.is_new ? null : c.id, kinds: announceKinds(c), fields: c.fields || {}, announced: (x.announced || []).some((s) => s.includes(c.name || '\u0000')) });
    else out.push({ ...base, name: '', member_id: null, kinds: ['Μεταβολή στοιχείων'], fields: {}, summary: x.summary || '', announced: !!(x.announced || []).length });
  }
  return sortBy(out, (r) => r.at).reverse();
}

function auditPage({ query = {} }) {
  let xs = auditRows();
  const all = xs.length;
  if (query.lodge) xs = xs.filter((r) => lodgeNoKey(r.lodge) === lodgeNoKey(query.lodge));
  if (query.kind) xs = xs.filter((r) => r.kinds.some((k) => k.startsWith(query.kind)));
  if (query.frm) xs = xs.filter((r) => String(r.at).slice(0, 10) >= query.frm);
  if (query.to) xs = xs.filter((r) => String(r.at).slice(0, 10) <= query.to);
  if (query.q) { const q = fold(query.q); xs = xs.filter((r) => fold(`${r.name} ${r.lodge_name} ${r.by}`).includes(q)); }
  const lodges = [...new Map(auditRows().map((r) => [r.lodge, r.lodge_name])).entries()].sort((a, b) => (Number(a[0]) || 1e9) - (Number(b[0]) || 1e9));
  const row = (r) => `<tr><td>${esc(fmtDate(String(r.at).slice(0, 10)))}<br><small class="muted">${esc(String(r.at).slice(11, 16))}</small></td>
<td><b>${esc(r.lodge_name)} ${esc(r.lodge)}</b></td><td>${r.member_id ? `<a href="#/members/card?ids=${r.member_id}">${esc(r.name)}</a>` : esc(r.name) || '<span class="muted">—</span>'}</td>
<td>${r.kinds.map((k) => `<span class="pill${/Διαγραφή/.test(k) ? ' dg' : ''}">${esc(k)}</span>`).join(' ')}</td>
<td><small>${Object.keys(r.fields).map((k) => `${esc(LABELS[k] || k)}: ${esc(r.fields[k][0] || '—')} → <b>${esc(r.fields[k][1] || '—')}</b>`).join('<br>') || `<span style="white-space:pre-wrap">${esc(r.summary || '')}</span>`}</small></td>
<td><small>${esc(r.by)}${r.note ? `<br><i>${esc(r.note)}</i>` : ''}</small></td>
<td>${r.announced ? `<span class="vok" title="${esc(r.to)}">✓ αναγγέλθηκε</span>` : '<span class="muted">—</span>'}</td>
<td><a class="btn small" href="#/lodge-portal?v=${encodeURIComponent(r.lodge)}" title="Εκδόσεις Μητρώου της Στοάς — επαναφορά">${esc(r.version)}</a></td></tr>`;
  return {
    title: 'Έλεγχος αλλαγών Μητρώου',
    html: `<div class="hero"><h1>🛡 ΕΛΕΓΧΟΣ ΑΛΛΑΓΩΝ — Μητρώο Μελών</h1></div>
<p class="muted">Κάθε αλλαγή που κάνει ο Γραμματέας μιας Στοάς στην Πύλη (αλλαγή βαθμού, ιδιότητας, Στοάς συνδρομής, διαγραφή, νέο μέλος …) στέλνεται αυτόματα
ως <b>Αναγγελία</b> στην Επαρχία της Στοάς και στη Μεγάλη Γραμματεία, ένα email ανά μέλος. Κάθε αποθήκευση κρατιέται και ως <b>πλήρες αντίγραφο</b> του Μητρώου της Στοάς
(έκδοση στο Drive της Πύλης) — από τη στήλη «Έκδοση» γίνεται <b>επαναφορά</b> αν κάτι καταχωρίστηκε κατά λάθος. Και κάθε αποθήκευση της εφαρμογής μένει στο ιστορικό των δεδομένων.</p>
<form class="card filters" id="audf"><select name="lodge"><option value="">Όλες οι Στοές</option>${lodges.map(([n, nm]) => `<option value="${esc(n)}"${n === query.lodge ? ' selected' : ''}>${esc(n)} · ${esc(nm)}</option>`).join('')}</select>
<select name="kind"><option value="">Όλα τα είδη</option>${KIND_FILTERS.map((k) => `<option${k === query.kind ? ' selected' : ''}>${esc(k)}</option>`).join('')}</select>
<input type="date" name="frm" value="${esc(query.frm || '')}" aria-label="Από"><input type="date" name="to" value="${esc(query.to || '')}" aria-label="Έως">
<input name="q" value="${esc(query.q || '')}" placeholder="🔎 Μέλος, Στοά, Γραμματέας"><button>Φίλτρο</button><button type="button" class="btn" id="audx">⬇ Excel</button></form>
<p class="muted"><b>${xs.length}</b> από ${all} αλλαγές μελών · <a href="#/lodge-portal">Πύλη Γραμματέων</a> (λήψη αλλαγών, εκδόσεις, επαναφορά)</p>
<div class="card tablecard"><table><thead><tr><th>Πότε</th><th>Στοά</th><th>Μέλος</th><th>Αναγγελία</th><th>Πριν → Τώρα</th><th>Από</th><th>Email</th><th>Έκδοση</th></tr></thead>
<tbody>${xs.length ? xs.slice(0, 500).map(row).join('') : '<tr><td colspan="8" class="muted">Δεν υπάρχουν αλλαγές από τις Στοές.</td></tr>'}</tbody></table></div>`,
    mount(el) {
      el.querySelector('#audf').addEventListener('submit', (e) => { e.preventDefault(); go('/registry-audit', Object.fromEntries([...new FormData(e.target)].filter(([, v]) => v))); });
      el.querySelector('#audx').addEventListener('click', () => exportXlsx('ELEGXOS_ALLAGON.xlsx', 'Αλλαγές', ['Πότε', 'Αρ.', 'Στοά', 'Μέλος', 'Αναγγελία', 'Πριν → Τώρα', 'Από', 'Σημείωση', 'Αναγγελία στάλθηκε σε', 'Έκδοση'],
        xs.map((r) => [String(r.at).replace('T', ' ').slice(0, 16), r.lodge, r.lodge_name, r.name, r.kinds.join(' · '), Object.keys(r.fields).map((k) => `${LABELS[k] || k}: ${r.fields[k][0] || '—'} → ${r.fields[k][1] || '—'}`).join('; ') || r.summary || '', r.by, r.note, r.announced ? r.to : '', r.version]),
        [16, 6, 22, 26, 34, 60, 26, 30, 36, 30]));
    },
  };
}

module({ id: 'registry-audit', routes: { '/registry-audit': auditPage } });
