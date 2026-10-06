// Κοινό εργαλείο για πίνακες «λίστα → αναζήτηση → νέα/επεξεργασία → Excel». Μια ενότητα περιγράφει μόνο
// τα πεδία της· οι σελίδες, οι φόρμες, η αναζήτηση και η εισαγωγή/εξαγωγή Excel προκύπτουν από εδώ.
import { db } from './store.js';
import { esc, matches, exportXlsx, readXlsx, EMAIL_RE, fold, parsePasted } from './util.js';
import { onSubmit, go, flash, table, notice, bind, confirmDo, href } from './app.js';

const val = (x, k) => (x && x[k] != null ? x[k] : '');

export function fieldHtml(f, x) {
  const v = val(x, f.k), req = f.required ? ' required' : '', ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
  let inner;
  if (f.type === 'textarea') inner = `<textarea name="${f.k}" class="short"${req}${ph}>${esc(v)}</textarea>`;
  else if (f.type === 'select') {
    const opts = (typeof f.options === 'function' ? f.options(x) : f.options).map((o) => (Array.isArray(o) ? o : [o, o]));
    inner = `<select name="${f.k}"${req}>${f.empty !== undefined ? `<option value="">${esc(f.empty)}</option>` : ''}${opts.map(([ov, ol]) => `<option value="${esc(ov)}"${String(v) === String(ov) ? ' selected' : ''}>${esc(ol)}</option>`).join('')}</select>`;
  } else if (f.type === 'check') inner = `<label class="chk"><input type="checkbox" name="${f.k}"${v && v !== '0' ? ' checked' : ''}> ${esc(f.check || 'Ναι')}</label>`;
  else {
    const list = f.datalist ? ` list="dl_${f.k}"` : '';
    const dl = f.datalist ? `<datalist id="dl_${f.k}">${f.datalist().map((o) => `<option value="${esc(o)}">`).join('')}</datalist>` : '';
    inner = `<input name="${f.k}" type="${f.type === 'email' ? 'text' : f.type || 'text'}" value="${esc(v)}"${req}${ph}${list}${f.type === 'email' ? ' inputmode="email" autocomplete="off"' : ''}>${dl}`;
  }
  return `<div class="${f.full ? 'full' : ''}"${f.hidden ? ' hidden' : ''}><label>${esc(f.label)}</label>${inner}${f.help ? `<small class="muted">${esc(f.help)}</small>` : ''}</div>`;
}

export function cleanForm(fields, d) {
  const out = {};
  for (const f of fields) {
    let v = d[f.k];
    if (f.type === 'check') v = v ? 1 : 0;
    else if (f.type === 'number') v = String(v ?? '').trim() === '' ? null : Number(v);
    else v = String(v ?? '').trim();
    if (f.required && (v === '' || v == null)) throw new Error(`Συμπληρώστε: ${f.label}`);
    if (f.type === 'email' && v) {
      const bad = v.split(/[\s,;]+/).filter((e) => e && !EMAIL_RE.test(e));
      if (bad.length) throw new Error(`Μη έγκυρο email: ${bad.join(', ')}`);
    }
    out[f.k] = v;
  }
  return out;
}

export function crud(spec) {
  const { table: tbl, base, title, one, fields } = spec;
  const sortRows = spec.sort || ((xs) => xs);
  const searchKeys = spec.search || fields.map((f) => f.k);
  const routes = {};

  routes[base] = ({ query }) => {
    let xs = sortRows([...db.all(tbl)]);
    if (spec.filter) xs = spec.filter(xs, query);
    if (query.q) xs = xs.filter((x) => matches(query.q, ...searchKeys.map((k) => val(x, k))));
    const rows = xs.map((x) => [...spec.columns.map((c) => c.v(x)), `<a class="btn small" href="#${base}/edit/${x.id}">Επεξεργασία</a>`]);
    return {
      title,
      html: `<h1>${esc(title)}</h1>${notice(query.msg)}${spec.intro ? spec.intro() : ''}
<div class="toolbar"><a class="btn primary" href="#${base}/new">+ ${esc(one)}</a>${spec.excel ? `<button class="btn" data-act="export">⬇ Excel</button>` : ''}${spec.tools ? spec.tools() : ''}</div>
<form class="card filters" id="flt"><input name="q" value="${esc(query.q || '')}" placeholder="🔎 Αναζήτηση" autofocus>${spec.filterHtml ? spec.filterHtml(query) : ''}<button>Αναζήτηση</button></form>
<p class="muted"><b>${xs.length}</b> εγγραφές</p>
${table([...spec.columns.map((c) => c.label), 'Ενέργειες'], rows)}
${spec.excel ? `<details class="card fold"><summary><b>Εισαγωγή / ενημέρωση από Excel</b></summary><form id="imp" style="margin-top:10px">
<p class="muted">Στήλες (πρώτη γραμμή): <b>${esc(spec.excel.cols.map((c) => c.label).join(', '))}</b>. Ταύτιση με «${esc(spec.excel.cols.find((c) => c.k === spec.excel.key).label)}» · κενά κελιά δεν σβήνουν υπάρχοντα στοιχεία. Κατεβάστε πρώτα το Excel, συμπληρώστε το και ανεβάστε το.</p>
<input type="file" name="file" accept=".xlsx,.xls,.csv"><label style="margin-top:10px">ή Επικόλληση από Excel (μαζί με τη γραμμή επικεφαλίδων)</label><textarea name="paste" class="short"></textarea><div class="toolbar" style="margin-top:10px"><button class="btn primary">Εισαγωγή</button></div></form></details>` : ''}`,
      mount(el) {
        onSubmit(el.querySelector('#flt'), (d) => go(base, { ...query, ...d, msg: '' }));
        bind(el, { export: () => exportXlsx(spec.excel.file, spec.excel.sheet, spec.excel.cols.map((c) => c.label), sortRows([...db.all(tbl)]).map((x) => spec.excel.cols.map((c) => (c.out ? c.out(x) : val(x, c.k)))), spec.excel.cols.map((c) => c.w || 18)) });
        if (spec.excel) onSubmit(el.querySelector('#imp'), async (d) => {
          const paste = String(d.paste || '').trim();
          if (!paste && !(d.file && d.file.size)) throw new Error('Επιλέξτε αρχείο ή επικολλήστε τις γραμμές από το Excel.');
          const rows = d.file && d.file.size ? (await readXlsx(d.file))[0].rows : parsePasted(paste);
          const msg = await importRows(spec, spec.excel.prepare ? spec.excel.prepare(rows) : rows);
          flash(msg); go(base);
        });
      },
    };
  };

  const formPage = (x) => ({
    title: x ? `${one}: ${spec.name ? spec.name(x) : ''}` : `Νέα εγγραφή · ${one}`,
    html: `<p><a href="#${base}">← ${esc(title)}</a></p><h1>${x ? esc(spec.name ? spec.name(x) : one) : '+ ' + esc(one)}</h1>
<form id="f"><div class="grid card">${fields.map((f) => fieldHtml(f, x || spec.defaults || {})).join('')}</div>
<div class="toolbar"><button class="btn primary">💾 Αποθήκευση</button><a class="btn" href="#${base}">Ακύρωση</a>
${x && spec.deletable !== false ? '<button type="button" class="btn danger" data-act="del">Διαγραφή</button>' : ''}</div></form>${x && spec.extra ? spec.extra(x) : ''}`,
    mount(el) {
      onSubmit(el.querySelector('#f'), async (d) => {
        await db.save(`${title}: ${x ? 'ενημέρωση' : 'νέα εγγραφή'}`, (tx) => {
          let c = cleanForm(fields, d);
          if (spec.validate) c = spec.validate(c, tx, x && x.id) || c;
          const old = x ? tx.get(tbl, x.id) : null;
          const r = x ? tx.update(tbl, x.id, c) : tx.insert(tbl, c);
          if (spec.afterSave) spec.afterSave(tx, r, old);
        });
        flash('Αποθηκεύτηκε.'); go(base);
      });
      bind(el, { async del() {
        if (!confirmDo(`Οριστική διαγραφή: ${spec.name ? spec.name(x) : one};`)) return;
        await db.save(`${title}: διαγραφή`, (tx) => { tx.remove(tbl, x.id); if (spec.afterDelete) spec.afterDelete(tx, x); });
        flash('Διαγράφηκε.'); go(base);
      } });
      if (spec.mountForm) spec.mountForm(el, x);
    },
  });
  routes[base + '/new'] = () => formPage(null);
  routes[base + '/edit/:id'] = ({ params }) => {
    const x = db.get(tbl, params.id);
    if (!x) return '<h1>Δεν βρέθηκε</h1>';
    return formPage(x);
  };
  return routes;
}

const hkey = (h) => fold(String(h || '')).replace(/[^a-zα-ω0-9@]/g, '');
export async function importRows(spec, rows) {
  if (!rows.length) throw new Error('Το αρχείο είναι κενό.');
  const hk = rows[0].map(hkey), idx = {};
  for (const c of spec.excel.cols.concat(spec.excel.importOnly || [])) for (const n of [c.label, ...(c.aliases || [])]) { const i = hk.indexOf(hkey(n)); if (i >= 0) { idx[c.k] = i; break; } }
  const key = spec.excel.key;
  if (idx[key] === undefined) throw new Error(`Χρειάζεται τουλάχιστον η στήλη «${spec.excel.cols.find((c) => c.k === key).label}».`);
  let added = 0, updated = 0;
  await db.save(`${spec.title}: εισαγωγή Excel`, (tx) => {
    added = updated = 0;
    for (const r of rows.slice(1)) {
      const d = {};
      for (const [k, i] of Object.entries(idx)) d[k] = String(r[i] ?? '').trim();
      const norm = spec.excel.normalize ? spec.excel.normalize(d, tx) : d;
      if (!norm || !norm[key]) continue;
      const ex = tx.find(spec.table, (x) => String(x[key]) === String(norm[key]));
      if (ex) { const ch = Object.fromEntries(Object.entries(norm).filter(([, v]) => v !== '' && v != null)); tx.update(spec.table, ex.id, ch); updated++; }
      else if (!spec.excel.canAdd || spec.excel.canAdd(norm)) { tx.insert(spec.table, { ...(spec.defaults || {}), ...norm }); added++; }
    }
  });
  return `Εισαγωγή ολοκληρώθηκε: ${added} νέες, ${updated} ενημερωμένες εγγραφές.`;
}
export { href };
