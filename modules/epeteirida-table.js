// Επετηρίδα (πίνακας): ο επίσημος κατάλογος Μεγάλων Αξιωματικών όπως τον τηρεί η Μεγάλη Γραμματεία — επεξεργάσιμος,
// με δυναμικά φίλτρα, ταξινόμηση, εξαγωγή Excel και εκτύπωση. Κάθε γραμμή δείχνει στο μέλος του Μητρώου (member_id):
// στο μέλος εμφανίζεται το «Ανώτατο αξίωμα / βαθμός» και το διάταγμά του, χωρίς να αντιγράφονται στοιχεία.
import { db } from '../core/store.js';
import { module, bind, flash, go, confirmDo, toast } from '../core/app.js';
import { esc, fold, sortBy, parsePasted, exportXlsx, today, fmtDate } from '../core/util.js';
import { attachPicker, memberItems } from '../core/pickers.js';
import { identify, canonicalId, person } from '../core/people.js';
import { reportPaper, printPaper } from '../core/paper.js';

db.seed('epeteirida', () => []);

// [πεδίο, επικεφαλίδα, είδος, επικεφαλίδες Excel που αναγνωρίζονται]
export const EP_COLS = [
  ['aa', 'Α/Α', 'num', ['α/α', 'αα', 'α.α.']],
  ['active', 'Ενεργός', 'yn', ['ενεργος', 'εν ενεργεια']],
  ['title', 'Τίτλος αξιώματος κατά το Σύνταγμα', 'text', ['τιτλος αξιωματος']],
  ['honorific', 'Προσφώνηση', 'text', ['προσφωνηση']],
  ['full_name', 'Ονοματεπώνυμο', 'text', ['ονοματεπωνυμο']],
  ['rank', 'Ανώτατο αξίωμα / βαθμός', 'text', ['ανωτατο αξιωμα', 'ανωτερο αξιωμα']],
  ['province', 'Επαρχία / Στοά Μ. Επιμ.', 'text', ['επαρχια']],
  ['decree_no', 'Αρ. διατάγματος ανώτατου αξιώματος', 'num', ['αρ. διαταγματος', 'αρ διαταγματος']],
  ['decree_year', 'Έτος ανώτατου βαθμού', 'num', ['ετος']],
  ['tmd', 'ΤΜΔ', 'yn', ['τμδ']],
  ['tmd_decree', 'Διάταγμα ΤΜΔ - Έτος', 'text', ['διαταγμα τμδ']],
  ['current', 'Εν ενεργεία αξίωμα / διάταγμα', 'text', ['εν ενεργεια αξιωμα']],
];
const COL = Object.fromEntries(EP_COLS.map((c) => [c[0], c]));
// Ελληνικά χωρίς τόνους, πεζά (για επικεφαλίδες και προσφωνήσεις)
const nrm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ς/g, 'σ').replace(/\s+/g, ' ').trim();
const HON = { σεβασμιωτατοσ: 3, πανσεβασμιοσ: 2, 'λιαν σεβασμιοσ': 1, σεβασμιοσ: 0 };
export const honorificLevel = (h) => HON[nrm(h)] ?? null;
const yn = (v) => (/^(ναι|ν|1|yes|τμδ|x|✓)$/i.test(String(v || '').trim()) ? 1 : 0);
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = (v) => { const s = clean(v); return /^\d+$/.test(s) ? Number(s) : s || null; };

export const epeteiridaAll = () => db.all('epeteirida');
// Οι εγγραφές ενός προσώπου (όλες οι εγγραφές του στο Μητρώο)· πρώτη η «κύρια» (με ανώτατο αξίωμα και διάταγμα)
let memo = { head: undefined, map: null };
function byPerson() {
  if (memo.map && memo.head === db.head) return memo.map;
  const m = new Map();
  for (const r of epeteiridaAll()) if (r.member_id) { const k = canonicalId(r.member_id); (m.get(k) || m.set(k, []).get(k)).push(r); }
  memo = { head: db.head, map: m };
  return m;
}
export function epeteiridaOf(memberId) {
  if (!memberId) return [];
  return sortBy(byPerson().get(canonicalId(memberId)) || [], (r) => (r.rank ? 0 : 1), (r) => -(Number(r.decree_year) || 0), 'aa');
}
// «Πρώην Πρώτος Μέγας Επόπτης — Διάταγμα 414/2024»
export function highestOfficeText(memberId) {
  const r = epeteiridaOf(memberId)[0];
  if (!r) return '';
  const d = r.decree_no ? `Διάταγμα ${r.decree_no}${r.decree_year ? '/' + r.decree_year : ''}` : r.decree_year ? `${r.decree_year}` : '';
  return [r.rank || r.title, d].filter(Boolean).join(' — ');
}

const matchName = (full) => identify({ full_name: String(full || '').replace(/\(.*?\)/g, ' ').replace(/\s+του\s+\S+\s*$/i, ' ') });

// Επικόλληση από Excel (με επικεφαλίδες) → αντικατάσταση του πίνακα
export function parseEpeteirida(text) {
  const rows = parsePasted(text).filter((r) => r.some((c) => clean(c)));
  if (rows.length < 2) throw new Error('Επικολλήστε τον πίνακα μαζί με τη γραμμή επικεφαλίδων.');
  const head = rows[0].map((h) => nrm(h));
  const idx = {};
  for (const [k, , , keys] of EP_COLS) {
    const i = head.findIndex((h, j) => !Object.values(idx).includes(j) && keys.some((key) => h.includes(nrm(key))));
    if (i >= 0) idx[k] = i;
  }
  if (idx.full_name == null) throw new Error('Δεν βρέθηκε η στήλη «Ονοματεπώνυμο».');
  return rows.slice(1).map((r) => {
    const o = {};
    for (const [k, , t] of EP_COLS) { const v = idx[k] != null ? r[idx[k]] : ''; o[k] = t === 'yn' ? yn(v) : t === 'num' ? num(v) : clean(v); }
    return o;
  }).filter((o) => o.full_name);
}
export async function importEpeteiridaTable(text) {
  const xs = parseEpeteirida(text);
  let linked = 0;
  await db.save(`Επετηρίδα: εισαγωγή ${xs.length} εγγραφών`, (tx) => {
    // προηγούμενες συνδέσεις (αυτού του πίνακα και της Επετηρίδας από τα Διατάγματα/εισαγωγές) για ίδιο ονοματεπώνυμο
    const prev = new Map([...tx.all('member_degrees_offices'), ...tx.all('epeteirida')].filter((r) => r.member_id && r.full_name).map((r) => [nrm(r.full_name), canonicalId(r.member_id, tx)]));
    tx.replace('epeteirida', []);
    for (const o of xs) {
      const mid = matchName(o.full_name) || prev.get(nrm(o.full_name)) || null;
      if (mid) linked++;
      tx.insert('epeteirida', { ...o, member_id: mid });
    }
  });
  return { count: xs.length, linked };
}

// ---------------------------------------------------------------- σελίδα
const FILTERS = [['active', 'Ενεργός'], ['title', 'Τίτλος αξιώματος'], ['honorific', 'Προσφώνηση'], ['rank', 'Ανώτατο αξίωμα'], ['province', 'Επαρχία / Στοά'], ['tmd', 'ΤΜΔ'], ['linked', 'Μητρώο']];
const label = (k, v) => (k === 'active' || k === 'tmd' ? (Number(v) ? 'ΝΑΙ' : 'ΟΧΙ') : k === 'linked' ? (v ? 'Συνδεδεμένοι' : 'Χωρίς σύνδεση') : v || '(κενό)');
const fval = (r, k) => (k === 'linked' ? (r.member_id ? 1 : 0) : k === 'active' || k === 'tmd' ? Number(r[k]) || 0 : clean(r[k]));

function tablePage() {
  return {
    title: 'Επετηρίδα',
    html: `<div class="noprint"><div class="hero"><div><h1>📜 Επετηρίδα</h1><p class="muted">Ο κατάλογος των Μεγάλων Αξιωματικών — επεξεργάσιμος. Κάθε γραμμή συνδέεται με το μέλος του Μητρώου·
στο μέλος φαίνεται το ανώτατο αξίωμα και το διάταγμά του. <a href="#/epeteirida">Ιστορικό αξιωμάτων από τα Διατάγματα →</a></p></div></div>
<div class="card ep-filters" id="epf"></div>
<div class="toolbar ep-tools"><button class="btn primary" data-act="save" disabled>💾 Αποθήκευση αλλαγών</button><button class="btn" data-act="add">+ Νέα γραμμή</button>
<button class="btn" data-act="relink">🔗 Σύνδεση με το Μητρώο</button><button class="btn" data-act="xlsx">⬇ Excel</button><button class="btn" data-act="print">🖨 Εκτύπωση</button>
<span class="muted" id="epcount" style="align-self:center"></span></div>
<div class="card tablecard ep-wrap"><table class="ep-grid" id="epg"></table></div>
<details class="card fold"><summary><b>Εισαγωγή / αντικατάσταση από Excel (επικόλληση)</b></summary><form id="epimp2" style="margin-top:10px">
<p class="muted">Επιλέξτε στο Excel όλον τον πίνακα <b>μαζί με τις επικεφαλίδες</b> (${EP_COLS.map((c) => esc(c[1])).join(' · ')}), Ctrl+C και Ctrl+V εδώ.
Ο πίνακας αντικαθίσταται και κάθε όνομα συνδέεται με το Μητρώο Μελών.</p><textarea name="paste" class="short"></textarea>
<div class="toolbar" style="margin-top:8px"><button class="btn primary">Εισαγωγή</button></div></form></details></div>
<section id="eppa" class="print-area" hidden></section>`,
    mount(el) {
      let rows = epeteiridaAll().map((r) => ({ ...r }));
      const dirty = new Map(), removed = new Set();
      let nextTmp = -1, sort = { k: 'aa', dir: 1 };
      const f = { q: '', from: '', to: '' };
      const sel = Object.fromEntries(FILTERS.map(([k]) => [k, '']));
      const live = () => rows.filter((r) => !removed.has(r.id));
      const pass = (r, skip) => {
        if (f.q && !fold(EP_COLS.map(([k]) => r[k]).join(' ')).includes(fold(f.q))) return false;
        if (f.from && !(Number(r.decree_year) >= Number(f.from))) return false;
        if (f.to && !(Number(r.decree_year) <= Number(f.to))) return false;
        for (const [k] of FILTERS) if (k !== skip && sel[k] !== '' && String(fval(r, k)) !== sel[k]) return false;
        return true;
      };
      // Δυναμικά φίλτρα: κάθε λίστα δείχνει μόνο τις τιμές (με πλήθος) που ταιριάζουν στα υπόλοιπα φίλτρα
      const renderFilters = () => {
        const box = el.querySelector('#epf');
        const opts = (k) => {
          const cnt = new Map();
          for (const r of live()) if (pass(r, k)) { const v = String(fval(r, k)); cnt.set(v, (cnt.get(v) || 0) + 1); }
          const vs = [...cnt.keys()].sort((a, b) => (k === 'active' || k === 'tmd' || k === 'linked' ? b.localeCompare(a) : a.localeCompare(b, 'el')));
          if (sel[k] !== '' && !cnt.has(sel[k])) vs.unshift(sel[k]);
          return `<option value="">Όλα</option>${vs.map((v) => `<option value="${esc(v)}"${v === sel[k] ? ' selected' : ''}>${esc(label(k, k === 'linked' || k === 'active' || k === 'tmd' ? Number(v) : v))} (${cnt.get(v) || 0})</option>`).join('')}`;
        };
        // μία φορά το πλαίσιο· μετά ανανεώνονται μόνο οι επιλογές (χωρίς να χάνεται η εστίαση ή ένα κλικ)
        if (box.firstChild) {
          for (const [k] of FILTERS) box.querySelector(`[data-s="${k}"]`).innerHTML = opts(k);
          for (const k of ['q', 'from', 'to']) { const i = box.querySelector(`[data-f="${k}"]`); if (document.activeElement !== i) i.value = f[k]; }
          return;
        }
        box.innerHTML = `<div class="ep-fgrid"><label class="ep-q">🔎 Αναζήτηση σε όλες τις στήλες<input data-f="q" value="${esc(f.q)}" placeholder="Όνομα, αξίωμα, διάταγμα, επαρχία…" autocomplete="off"></label>
${FILTERS.map(([k, l]) => `<label>${esc(l)}<select data-s="${k}">${opts(k)}</select></label>`).join('')}
<label>Έτος από<input data-f="from" inputmode="numeric" value="${esc(f.from)}" placeholder="π.χ. 2020"></label><label>Έτος έως<input data-f="to" inputmode="numeric" value="${esc(f.to)}" placeholder="π.χ. 2026"></label>
<div class="ep-reset"><button type="button" class="btn small" data-act="reset">✕ Καθαρισμός φίλτρων</button></div></div>`;
      };
      const cell = (r, k) => {
        const [, , t] = COL[k], v = r[k] ?? '';
        if (t === 'yn') return `<td class="c-${k}"><select data-e="${k}"><option value="1"${Number(v) ? ' selected' : ''}>ΝΑΙ</option><option value="0"${Number(v) ? '' : ' selected'}>ΟΧΙ</option></select></td>`;
        return `<td class="c-${k}" contenteditable="true" data-e="${k}"${t === 'num' ? ' inputmode="numeric"' : ''}>${esc(v)}</td>`;
      };
      const memberCell = (r) => {
        const p = r.member_id ? person(r.member_id) : null;
        return `<td class="c-member">${p ? `<a href="#/members/${p.id}" title="${esc(p.name)}">✓ ${esc(p.member.surname || '')}</a> <button class="lnk" data-act="unlink" title="Αποσύνδεση">✕</button>`
          : '<button class="btn small" data-act="link">🔗 Σύνδεση</button>'}</td>`;
      };
      const renderTable = () => {
        const xs = live().filter((r) => pass(r));
        const k = sort.k, t = (COL[k] || [])[2];
        const key = (r) => (k === 'member' ? (r.member_id ? 0 : 1) : t === 'num' || t === 'yn' ? (Number(r[k]) || (r[k] === '' || r[k] == null ? 1e9 : 0)) : fold(r[k]));
        const sorted = sortBy(xs, key, 'aa');
        if (sort.dir < 0) sorted.reverse();
        el.querySelector('#epg').innerHTML = `<thead><tr>${EP_COLS.map(([c, l]) => `<th data-sort="${c}" class="c-${c}">${esc(l)}${sort.k === c ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th data-sort="member">Μητρώο</th><th></th></tr></thead>
<tbody>${sorted.map((r) => `<tr data-id="${r.id}"${dirty.has(r.id) ? ' class="dirty"' : ''}>${EP_COLS.map(([c]) => cell(r, c)).join('')}${memberCell(r)}<td><button class="lnk" data-act="del" title="Διαγραφή γραμμής">🗑</button></td></tr>`).join('')}</tbody>`;
        el.querySelector('#epcount').textContent = `Εμφανίζονται ${xs.length} από ${live().length} · ${live().filter((r) => r.member_id).length} συνδεδεμένοι με το Μητρώο`;
        const n = dirty.size + removed.size, b = el.querySelector('[data-act=save]');
        b.disabled = !n; b.textContent = n ? `💾 Αποθήκευση αλλαγών (${n})` : '💾 Αποθήκευση αλλαγών';
      };
      const refresh = () => { renderFilters(); renderTable(); };
      const rowOf = (node) => rows.find((r) => r.id === Number(node.closest('tr').dataset.id));
      const mark = (r, patch) => { Object.assign(r, patch); dirty.set(r.id, { ...(dirty.get(r.id) || {}), ...patch }); };
      // επεξεργασία κελιών
      const grid = el.querySelector('#epg');
      grid.addEventListener('input', (e) => {
        const c = e.target.closest('[data-e]'); if (!c) return;
        const r = rowOf(c), k = c.dataset.e, t = COL[k][2];
        const v = c.tagName === 'SELECT' ? Number(c.value) : t === 'num' ? num(c.textContent) : clean(c.textContent);
        mark(r, { [k]: v });
        if (k === 'full_name' && !r.member_id) { const mid = matchName(v); if (mid) mark(r, { member_id: mid }); }
        c.closest('tr').classList.add('dirty');
        const n = dirty.size + removed.size, b = el.querySelector('[data-act=save]'); b.disabled = !n; b.textContent = `💾 Αποθήκευση αλλαγών (${n})`;
      });
      grid.addEventListener('focusout', (e) => { if (e.target.closest('[data-e]')) renderFilters(); });
      grid.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.isContentEditable) { e.preventDefault(); e.target.blur(); } });
      grid.addEventListener('click', (e) => {
        const th = e.target.closest('th[data-sort]');
        if (th) { const k = th.dataset.sort; sort = { k, dir: sort.k === k ? -sort.dir : 1 }; renderTable(); return; }
        const b = e.target.closest('[data-act]'); if (!b || !grid.contains(b)) return;
        const r = rowOf(b);
        if (b.dataset.act === 'del') { if (confirmDo(`Διαγραφή της γραμμής «${r.full_name || '—'}»;`)) { removed.add(r.id); dirty.delete(r.id); refresh(); } }
        if (b.dataset.act === 'unlink') { mark(r, { member_id: null }); renderTable(); }
        if (b.dataset.act === 'link') {
          const td = b.closest('td');
          td.innerHTML = '<input class="ep-link" placeholder="Επώνυμο μέλους…" autocomplete="off">';
          const inp = td.querySelector('input');
          attachPicker(inp, memberItems, (m) => { mark(r, { member_id: canonicalId(m.id) }); renderTable(); });
          inp.value = String(r.full_name || '').split(/\s+/)[0] || ''; inp.focus(); inp.dispatchEvent(new Event('input'));
        }
      });
      el.querySelector('#epf').addEventListener('input', (e) => {
        if (e.target.dataset.f) { f[e.target.dataset.f] = e.target.value; renderTable(); }
      });
      el.querySelector('#epf').addEventListener('change', (e) => {
        if (e.target.dataset.s) { sel[e.target.dataset.s] = e.target.value; refresh(); }
        else if (e.target.dataset.f) renderFilters();
      });
      const shownRows = () => { const xs = sortBy(live().filter((r) => pass(r)), (r) => Number(r.aa) || 1e9); return xs; };
      bind(el, {
        reset() { f.q = f.from = f.to = ''; for (const k in sel) sel[k] = ''; refresh(); },
        add() {
          const r = { id: nextTmp--, aa: Math.max(0, ...live().map((x) => Number(x.aa) || 0)) + 1, active: 1, title: '', honorific: '', full_name: '', rank: '', province: '', decree_no: null, decree_year: null, tmd: 0, tmd_decree: '', current: '', member_id: null };
          rows.unshift(r); dirty.set(r.id, { ...r }); f.q = ''; for (const k in sel) sel[k] = ''; sort = { k: 'aa', dir: -1 }; refresh();
          const td = el.querySelector(`tr[data-id="${r.id}"] [data-e=full_name]`); if (td) td.focus();
        },
        relink() {
          let n = 0;
          for (const r of live()) if (!r.member_id) { const mid = matchName(r.full_name); if (mid) { mark(r, { member_id: mid }); n++; } }
          toast(n ? `Βρέθηκαν ${n} νέες συνδέσεις — πατήστε «Αποθήκευση αλλαγών».` : 'Δεν βρέθηκαν νέες συνδέσεις.'); refresh();
        },
        async save() {
          const n = dirty.size + removed.size;
          await db.save(`Επετηρίδα: ${n} αλλαγές`, (tx) => {
            for (const id of removed) if (id > 0) tx.remove('epeteirida', id);
            for (const [id, patch] of dirty) {
              if (id < 0) { const r = rows.find((x) => x.id === id); const { id: _, ...rest } = r; if (rest.full_name) tx.insert('epeteirida', rest); }
              else tx.update('epeteirida', id, patch);
            }
          });
          flash(`Αποθηκεύτηκαν ${n} αλλαγές στην Επετηρίδα.`); go('/epeteirida/pinakas');
        },
        xlsx: () => exportXlsx(`EPETIRIDA_${today()}.xlsx`, 'Επετηρίδα', [...EP_COLS.map((c) => c[1]), 'Μητρώο'],
          shownRows().map((r) => [...EP_COLS.map(([k, , t]) => (t === 'yn' ? (Number(r[k]) ? 'ΝΑΙ' : 'ΟΧΙ') : r[k] ?? '')), r.member_id ? `#${r.member_id}` : ''])),
        print() {
          const pa = el.querySelector('#eppa');
          const ks = ['aa', 'active', 'title', 'honorific', 'full_name', 'rank', 'decree_no', 'decree_year', 'current'];
          pa.innerHTML = reportPaper('ΕΠΕΤΗΡΙΔΑ ΜΕΓΑΛΩΝ ΑΞΙΩΜΑΤΙΚΩΝ', fmtDate(today()), `<table><thead><tr>${ks.map((k) => `<th>${esc(COL[k][1])}</th>`).join('')}</tr></thead><tbody>${shownRows().map((r) => `<tr>${ks.map((k) => `<td>${esc(COL[k][2] === 'yn' ? (Number(r[k]) ? 'ΝΑΙ' : 'ΟΧΙ') : r[k] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
          pa.hidden = false; printPaper('EPETIRIDA_' + today());
          window.addEventListener('afterprint', () => (pa.hidden = true), { once: true });
        },
      });
      el.querySelector('#epimp2').addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = e.target.paste.value;
        try {
          const xs = parseEpeteirida(text);
          if (live().length && !confirmDo(`Ο πίνακας (${live().length} γραμμές) θα αντικατασταθεί με ${xs.length} γραμμές. Συνέχεια;`)) return;
          const r = await importEpeteiridaTable(text);
          flash(`Επετηρίδα: ${r.count} εγγραφές · ${r.linked} συνδέθηκαν με το Μητρώο Μελών.`); go('/epeteirida/pinakas');
        } catch (err) { toast(err.message || String(err)); }
      });
      addEventListener('beforeunload', (e) => { if (dirty.size || removed.size) e.preventDefault(); }, { once: true });
      refresh();
    },
  };
}

module({ id: 'epeteirida-table', routes: { '/epeteirida/pinakas': tablePage } });
