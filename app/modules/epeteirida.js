// Επετηρίδα Μεγάλων Αξιωματικών — ιστορικό διορισμών/απονομών, υπολογίζεται αυτόματα από τα Διατάγματα.
import { db } from '../core/store.js';
import { module, onSubmit, go, bind } from '../core/app.js';
import { esc, fmtDate, sortBy, fold, today } from '../core/util.js';
import { reportPaper, printPaper } from '../core/paper.js';
import { DEC_MAP } from './decree-catalog.js';

const LABELS = { appoint: 'ΔΙΟΡΙΖΟΜΕΝ', award: 'ΑΠΟΝΕΜΕΙ', service_award: 'ΕΥΑΡΕΣΤΟΥΜΕΘΑ', historical: 'Ιστορική εγγραφή' };

function rows() {
  const ms = Object.fromEntries(db.all('member_registry').map((m) => [m.id, m]));
  const ds = Object.fromEntries(db.all('decree_documents').map((d) => [d.id, d]));
  return db.all('member_degrees_offices').map((o) => {
    const m = ms[o.member_id] || {};
    return { ...o, surname: m.surname || '', first_name: m.first_name || '', full_name: `${m.first_name || ''} ${m.surname || ''}`.trim(), decree_date: (ds[o.decree_id] || {}).decree_date || '', action: o.record_type || 'appoint' };
  });
}
function filtered(q) {
  let xs = rows();
  const ql = fold(q.q || '');
  if (ql) xs = xs.filter((r) => [r.full_name, r.surname, r.first_name, r.office].some((v) => fold(v).includes(ql)));
  if (q.year) xs = xs.filter((r) => String(r.decree_year) === q.year);
  if (q.office) xs = xs.filter((r) => r.office === q.office);
  if (q.action) xs = xs.filter((r) => r.action === q.action);
  const prec = (r) => (r.action === 'appoint' ? (DEC_MAP[r.office] || {}).precedence ?? 9999 : 9999);
  return sortBy(xs, (r) => -(r.decree_year || 0), (r) => -(r.decree_no || 0), prec, 'surname', 'first_name');
}

module({
  id: 'epeteirida',
  routes: {
    '/epeteirida': ({ query }) => {
      const all = rows(), xs = filtered(query), shown = xs.slice(0, 300);
      const years = [...new Set(all.map((r) => String(r.decree_year || '')).filter(Boolean))].sort().reverse();
      const offices = [...new Set(all.map((r) => r.office).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el'));
      const sel = (name, empty, opts, cur) => `<select name="${name}"><option value="">${empty}</option>${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
      const tbl = (list) => `<table><thead><tr><th>Επώνυμο</th><th>Όνομα</th><th>Αξίωμα</th><th>Διάταγμα</th><th>Ημερομηνία</th><th>Πράξη</th></tr></thead><tbody>${list.map((r) => `<tr><td>${esc(r.surname)}</td><td>${esc(r.first_name)}</td><td>${esc(r.office)}</td>
<td class="official-number">${r.decree_id ? `<a href="#/decrees/${r.decree_id}">${esc(r.decree_no)}/${esc(r.decree_year)}</a>` : esc(r.decree_no ? `${r.decree_no}/${r.decree_year}` : r.decree_year || '')}</td>
<td>${esc(fmtDate(r.decree_date))}</td><td>${esc(LABELS[r.action] || r.action)}${r.member_id ? ` · <a href="#/members/${r.member_id}">Μητρώο</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Δεν βρέθηκαν εγγραφές.</td></tr>'}</tbody></table>`;
      return {
        title: 'Επετηρίδα',
        html: `<div class="noprint"><h1>Επετηρίδα Μεγάλων Αξιωματικών</h1><p class="muted">Ιστορικό διορισμών και απονομών, υπολογισμένο αυτόματα από τα Διατάγματα.</p>
<form class="filters" id="flt" style="grid-template-columns:2fr 1fr 1fr 1fr auto"><input name="q" value="${esc(query.q || '')}" placeholder="Επώνυμο, όνομα ή αξίωμα">${sel('year', 'Όλα τα έτη', years.map((y) => [y, y]), query.year)}
${sel('office', 'Όλα τα αξιώματα', offices.map((o) => [o, o]), query.office)}${sel('action', 'Όλες οι πράξεις', Object.entries(LABELS), query.action)}<button>Αναζήτηση</button></form>
<div class="toolbar" style="margin:10px 0"><button class="btn primary" data-act="print">⬇ Εκτύπωση Τεύχους (PDF)</button><span class="muted" style="align-self:center">${xs.length} εγγραφές${xs.length > 300 ? ' (εμφανίζονται οι πρώτες 300· το τεύχος τις περιλαμβάνει όλες)' : ''}</span></div>
<div class="card tablecard">${tbl(shown)}</div></div><div class="print-area" id="pa" hidden></div>`,
        mount(el) {
          onSubmit(el.querySelector('#flt'), (d) => go('/epeteirida', d));
          bind(el, { print() {
            const pa = el.querySelector('#pa');
            pa.innerHTML = reportPaper('ΕΠΕΤΗΡΙΔΑ ΜΕΓΑΛΩΝ ΑΞΙΩΜΑΤΙΚΩΝ', fmtDate(today()), tbl(xs).replace(/<a [^>]*>|<\/a>| · Μητρώο/g, ''), { signatures: true });
            pa.hidden = false; printPaper('EPETIRIDA_MEGALON_AXIOMATIKON_' + today());
            window.addEventListener('afterprint', () => (pa.hidden = true), { once: true });
          } });
        },
      };
    },
  },
});
