// Κατάλογος — όλα τα στοιχεία επικοινωνίας σε μία σελίδα: Επαρχίες (Γραμματεία, ΕπΜΔ, ΕπΜΓρ.) και Συμβολικές Στοές,
// με αναζήτηση, αντιγραφή email και «Επιστολή προς…» με ένα πάτημα.
import { module, bind, toast } from '../core/app.js';
import { esc, fold, exportXlsx } from '../core/util.js';
import { copyText } from '../core/mail.js';
import { provincesAll, provinceRoles } from './provinces.js';
import { lodgesAll, lodgeTitle, lodgeEmail } from './lodges.js';

const mail = (e) => (e ? `<a href="mailto:${esc(e)}" data-mail="${esc(e)}">${esc(e)}</a> <button type="button" class="btn small" data-act="copy" data-v="${esc(e)}" title="Αντιγραφή">📋</button>` : '<span class="muted">—</span>');
const letter = (name, email) => (email ? `<a class="btn small" href="#/letters/new?to_name=${encodeURIComponent(name)}&to_email=${encodeURIComponent(email)}">✉ Επιστολή</a>` : '');

function page({ query }) {
  const provs = provincesAll(true), lodges = lodgesAll(), regional = provs.filter((p) => p.kind !== 'Εθνική'), counts = {};
  for (const l of lodges) counts[l.provincial || ''] = (counts[l.provincial || ''] || 0) + 1;
  const cards = provs.map((p) => {
    const [gm, gs] = provinceRoles(p);
    const who = (r) => `<div style="margin-top:8px"><small class="muted">${esc(r.label || r.abbr)} (${esc(r.abbr)})</small><br><b>${r.name ? esc(r.name) : '<span class="muted">— δεν έχει οριστεί —</span>'}</b><br>${mail(r.email)} ${letter(r.addressee, r.email)}</div>`;
    const hay = [p.short, p.full_title, p.email, gm.name, gm.email, gs.name, gs.email].join(' ');
    return `<div class="card" data-hay="${esc(hay)}" style="margin:0"><div style="display:flex;justify-content:space-between;gap:8px"><div><b style="font-size:1.08rem">${esc(p.short)}</b><br><small class="muted">${esc(p.full_title)}</small></div>
<a class="btn small" href="#/provinces/edit/${p.id}">Επεξεργασία</a></div>
<div style="margin-top:8px"><small class="muted">Γραμματεία</small><br>${mail(p.email)} ${letter(p.addressee || p.short, p.email)}</div>${who(gm)}${who(gs)}
${p.kind === 'Εθνική' ? '' : `<div style="margin-top:8px"><a href="#/directory?prov=${encodeURIComponent(p.short)}">${counts[p.short] || 0} Στοές ↓</a></div>`}</div>`;
  }).join('');
  const all = (sel) => regional.map(sel).filter(Boolean).join(', ');
  const bulk = [['Όλα τα email Γραμματειών', all((p) => p.email)], ['Όλοι οι ΕπΜΔ', all((p) => provinceRoles(p)[0].email)], ['Όλοι οι ΕπΜΓρ.', all((p) => provinceRoles(p)[1].email)]]
    .map(([t, v]) => `<button type="button" class="btn" data-act="copy" data-v="${esc(v)}"${v ? '' : ' disabled'}>📋 ${t}</button>`).join('');
  const rows = lodges.map((l) => `<tr data-hay="${esc([l.number, l.name, l.orient, l.provincial, l.email, l.master, l.secretary, l.secretary_email, l.ritual, l.meeting_place].join(' '))}" data-prov="${esc(l.provincial || '')}">
<td data-label="Αρ."><b>${esc(l.number)}</b></td><td data-label="Στοά"><b>${esc(l.name)}</b>${(l.status || 'Ενεργή') === 'Ενεργή' ? '' : `<br><small class="muted">${esc(l.status)}</small>`}<br><small class="muted">${esc(lodgeTitle(l))}</small></td>
<td data-label="ΕπΜΣτ.">${esc(l.provincial || '—')}</td><td data-label="Τυπικό">${esc(l.ritual)}</td><td data-label="Τόπος">${esc(l.meeting_place || l.orient)}</td><td data-label="Σεβάσμιος">${esc(l.master)}</td><td data-label="Γραμματέας">${esc(l.secretary)}</td>
<td data-label="Email">${mail(lodgeEmail(l))}</td><td data-label="Ενέργειες" class="actions-cell">${letter(lodgeTitle(l), lodgeEmail(l))} <a class="btn small" href="#/lodges/edit/${l.id}">Επεξεργασία</a></td></tr>`).join('');
  const act = lodges.filter((l) => (l.status || 'Ενεργή') !== 'Ανενεργή'), nomail = act.filter((l) => !lodgeEmail(l)).length, noprov = act.filter((l) => !l.provincial).length;
  const missGm = regional.filter((p) => !String(p.master_name || '').trim()).length, missGs = regional.filter((p) => !String(p.secretary_name || '').trim()).length;
  const todo = nomail || noprov || missGm || missGs ? `<p class="muted" style="margin:8px 0 0">Προς συμπλήρωση: ${missGm} Επαρχίες χωρίς ΕπΜΔ · ${missGs} χωρίς ΕπΜΓρ. · ${nomail} ενεργές Στοές χωρίς email · ${noprov} χωρίς Επαρχία.</p>` : '';
  return {
    title: 'Κατάλογος',
    html: `<h1>📇 Κατάλογος</h1><div class="card"><p style="margin-top:0">Όλα τα στοιχεία επικοινωνίας σε ένα σημείο. Πατήστε 📋 για αντιγραφή ή «✉ Επιστολή» για νέα επιστολή με συμπληρωμένο παραλήπτη.</p>
<div class="cols2" style="grid-template-columns:2fr 1fr"><input id="dirQ" placeholder="🔎 Αναζήτηση: Επαρχία, Στοά, αριθμός, όνομα, email, Τυπικό, τόπος…" autofocus>
<select id="dirProv"><option value="">Όλες οι Επαρχίες</option>${regional.map((p) => `<option${p.short === query.prov ? ' selected' : ''}>${esc(p.short)}</option>`).join('')}</select></div>
<div class="toolbar" style="margin-top:8px"><button class="btn" data-act="xlsx">⬇ Excel (Επαρχίες & Στοές)</button><a class="btn" href="#/provinces">Επεξεργασία Επαρχιών</a><a class="btn" href="#/lodges">Επεξεργασία Στοών</a></div>${todo}</div>
<h2>Επαρχιακές Μεγάλες Στοές</h2><div class="toolbar">${bulk}</div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin:10px 0 18px">${cards}</div>
<h2 id="stoes">Συμβολικές Στοές <small class="muted">(<span id="dirCount">${lodges.length}</span>)</small></h2><div class="toolbar"><button type="button" class="btn" data-act="copyVisible">📋 Email των Στοών που εμφανίζονται</button></div>
<div class="card tablecard"><table class="stack" id="dirLodges"><tr class="stack-head"><th>Αρ.</th><th>Στοά</th><th>ΕπΜΣτ.</th><th>Τυπικό</th><th>Τόπος</th><th>Σεβάσμιος</th><th>Γραμματέας</th><th>Email</th><th>Ενέργειες</th></tr>${rows}</table></div>`,
    mount(el) {
      const q = el.querySelector('#dirQ'), pv = el.querySelector('#dirProv');
      const filt = () => {
        const w = fold(q.value).split(/\s+/).filter(Boolean), p = pv.value; let n = 0;
        el.querySelectorAll('[data-hay]').forEach((x) => { const ok = w.every((t) => fold(x.dataset.hay).includes(t)) && (!p || !x.dataset.prov || x.dataset.prov === p); x.hidden = !ok; if (ok && x.tagName === 'TR') n++; });
        el.querySelector('#dirCount').textContent = n;
      };
      q.addEventListener('input', filt); pv.addEventListener('change', filt);
      if (query.prov) { filt(); el.querySelector('#stoes').scrollIntoView(); }
      bind(el, {
        async copy(d) { await copyText(d.v); toast('Αντιγράφηκε.'); },
        async copyVisible() { const v = [...el.querySelectorAll('#dirLodges tr:not([hidden]) [data-mail]')].map((x) => x.dataset.mail).filter(Boolean); await copyText([...new Set(v)].join(', ')); toast(`Αντιγράφηκαν ${v.length} email.`); },
        async xlsx() {
          await exportXlsx('EMSTE_KATALOGOS.xlsx', 'ΚΑΤΑΛΟΓΟΣ', ['Είδος', 'Αρ.', 'Όνομα', 'Επαρχία', 'Email', 'ΕπΜΔ / Σεβάσμιος', 'Email ΕπΜΔ', 'ΕπΜΓρ. / Γραμματέας', 'Email ΕπΜΓρ. / Γραμματέα', 'Τυπικό', 'Τόπος'],
            [...provs.map((p) => { const [gm, gs] = provinceRoles(p); return ['Επαρχία', '', p.full_title || p.short, p.short, p.email, gm.name, gm.email, gs.name, gs.email, '', '']; }),
              ...lodges.map((l) => ['Στοά', l.number, l.name, l.provincial, lodgeEmail(l), l.master, '', l.secretary, l.secretary_email, l.ritual, l.meeting_place || l.orient])], [10, 6, 40, 30, 32, 26, 30, 26, 30, 16, 36]);
        },
      });
    },
  };
}

module({
  id: 'directory',
  routes: { '/directory': page },
  tile: { order: 40, render: () => {
    const ls = lodgesAll(true), nomail = ls.filter((l) => !lodgeEmail(l)).length, provs = provincesAll(true).filter((p) => p.kind !== 'Εθνική'), nogs = provs.filter((p) => !String(p.secretary_name || '').trim()).length;
    return `<div class="dtile"><h3><a href="#/directory">📇 Κατάλογος</a></h3><div class="big">${ls.length} Στοές · ${provs.length} Επαρχίες</div>${nomail ? `<div class="warn">${nomail} Στοές χωρίς email</div>` : ''}${nogs ? `<div class="warn">${nogs} Επαρχίες χωρίς ΕπΜΓρ.</div>` : ''}
<div class="acts"><a class="btn primary" href="#/directory">Κατάλογος</a><a class="btn" href="#/lodges">Στοές</a><a class="btn" href="#/provinces">Επαρχίες</a></div></div>`;
  } },
});

