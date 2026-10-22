// Στοές με λίγα κύρια μέλη — κατάλογος των Στοών με πλήθος κυρίων μελών κάτω από ένα όριο (προεπιλογή 12),
// με σειρά αρχαιότητας (αύξων αριθμός Στοάς), δυναμικά φίλτρα στις επικεφαλίδες, Excel, εκτύπωση και PDF.
// Κύριο μέλος: ενεργό μέλος του Μητρώου που έχει τη Στοά ως «Στοά πλήρους συνδρομής» (Κ. 269)· όπου δεν έχει οριστεί η συνδρομή,
// μετρά η κατάσταση «1. …» / ΤΑΚΤΙΚΟ / ΚΥΡΙΟ (οι καταστάσεις επιλέγονται στη σελίδα). Επίτιμοι και Θεράποντες δεν μετρούν.
import { db } from '../core/store.js';
import { bind, toast } from '../core/app.js';
import { esc, fold, sortBy, today, fmtDate, exportXlsx, download } from '../core/util.js';
import { reportPaper, printPaper } from '../core/paper.js';
import { loadScript } from '../core/pdf.js';
import { lodgesAll, lodgeNoKey } from './lodges.js';
import { capacityOf, feeRankLabel, MEMBER_CAPACITIES } from './members.js';
import { regCode } from '../core/people.js';

const LIMIT = 12;
const gone = (st) => /ΔΙΑΓΡΑΦ|ΜΕΤΕΣΘ/.test(st);
const normStatus = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();
const isPrimary = (st) => /^1\b|ΤΑΚΤΙΚ|ΚΥΡΙ/.test(st);
const seniority = (x) => (/^\d+$/.test(String(x.number)) ? Number(x.number) : 1e9);
const COLS = [['name', 'Στοά'], ['number', 'Αριθμός'], ['count', 'Πλήθος κυρίων μελών'], ['provincial', 'Επαρχία / Περιφέρεια']];

// Ιδιότητες μελών στις Στοές (χωρίς διαγραμμένους/μετεσθέντες) με πλήθος
function statusChoices() {
  const cnt = new Map();
  for (const l of db.all('member_lodges')) { const st = normStatus(l.member_status); if (st && !gone(st)) cnt.set(st, (cnt.get(st) || 0) + 1); }
  return [...cnt].sort((a, b) => a[0].localeCompare(b[0], 'el'));
}

const activeIds = () => new Set(db.all('member_registry').filter((m) => m.active !== 0 && !Number(m.no_contact)).map((m) => m.id));
// Μετρά η εγγραφή Στοάς του μέλους ως κύριο μέλος;
function isPrimaryRow(l, statuses, active) {
  const st = normStatus(l.member_status);
  const counts = Number(l.fee_rank) ? Number(l.fee_rank) === 1 && !gone(st) : statuses.has(st);
  return counts && active.has(l.member_id) && !['Επίτιμο', 'Θεράπων'].includes(capacityOf(l));
}
// Πλήθος κυρίων μελών ανά Στοά (αριθμός → μοναδικά κύρια μέλη)
function primaryCounts(statuses) {
  const active = activeIds(), seen = new Set(), out = {};
  for (const l of db.all('member_lodges')) {
    const k = lodgeNoKey(l.lodge_number);
    if (!k || !isPrimaryRow(l, statuses, active) || seen.has(k + ':' + l.member_id)) continue;
    seen.add(k + ':' + l.member_id); out[k] = (out[k] || 0) + 1;
  }
  return out;
}

export function smallLodgesPage() {
  const choices = statusChoices();
  return {
    title: 'Στοές με λίγα κύρια μέλη',
    html: `<div class="noprint"><h1>🏛 Στοές με λίγα κύρια μέλη</h1><p><a href="#/members">← Μητρώο Μελών</a></p>
<div class="card sl-opts"><div class="grid"><div><label for="sllimit">Πλήθος κυρίων μελών κάτω από</label><input id="sllimit" type="number" min="1" value="${LIMIT}" inputmode="numeric"></div>
<div><label>&nbsp;</label><label class="chip"><input type="checkbox" id="slinactive"><span>Και ανενεργές Στοές</span></label></div></div>
<p class="muted" style="margin:10px 0 0">Κύριο μέλος: όποιος έχει τη Στοά ως <b>Στοά πλήρους συνδρομής</b> (Κ. 269). Όπου δεν έχει οριστεί η συνδρομή, μετρούν οι καταστάσεις που επιλέγονται εδώ. Επίτιμοι και Θεράποντες δεν μετρούν.</p>
<fieldset class="sl-st"><legend>Καταστάσεις που μετρούν (όπου δεν έχει οριστεί συνδρομή)</legend>${choices.length ? choices.map(([s, n]) => `<label class="chip"><input type="checkbox" value="${esc(s)}"${isPrimary(s) ? ' checked' : ''}><span>${esc(s)} (${n})</span></label>`).join('') : '<span class="muted">Δεν υπάρχουν ιδιότητες μελών στις Στοές.</span>'}</fieldset></div>
<div class="toolbar"><button class="btn primary" data-act="pdf">📄 Αναφορά PDF</button><button class="btn" data-act="print">🖨 Εκτύπωση</button><button class="btn" data-act="xlsx">⬇ Excel</button>
<button class="btn" data-act="reset">✕ Καθαρισμός φίλτρων</button><span class="muted" id="slcount" style="align-self:center"></span></div>
<p class="muted">Πατήστε σε μια Στοά για να δείτε από κάτω τα μέλη της με τις ιδιότητές τους.</p>
<div class="card tablecard"><table class="sl-grid" id="slg"><thead><tr id="slhead"></tr><tr class="sl-f" id="slf"></tr></thead><tbody id="slbody"></tbody></table></div>
<div class="card sl-mem" id="slmem" hidden></div></div>
<section id="slpa" class="print-area" hidden></section>`,
    mount(el) {
      // κανένα «κύριο» στα δεδομένα → μετρούν όλες οι ιδιότητες
      if (choices.length && !el.querySelector('.sl-st input:checked')) el.querySelectorAll('.sl-st input').forEach((i) => (i.checked = true));
      const f = { name: '', number: '', count: '', provincial: '' };
      let sort = { k: 'number', dir: 1 }, sel = null;
      const mf = { name: '', capacity: '', fee: '', status: '', primary: '' };
      const statuses = () => new Set([...el.querySelectorAll('.sl-st input:checked')].map((i) => i.value));
      const limit = () => Math.max(1, Number(el.querySelector('#sllimit').value) || LIMIT);
      const base = () => {
        const counts = primaryCounts(statuses());
        return lodgesAll(!el.querySelector('#slinactive').checked).map((l) => ({ name: l.name || '', number: String(l.number || ''), count: counts[lodgeNoKey(l.number)] || 0, provincial: l.provincial || '', status: l.status || '' }))
          .filter((r) => r.count < limit());
      };
      // αριθμός: ακριβής («12»), εύρος («1-50») ή λίστα («2, 5, 70»)
      const numOk = (r, q) => q.split(/[,;\s]+/).filter(Boolean).some((p) => {
        const m = /^(\d+)\s*[-–]\s*(\d+)$/.exec(p);
        return m ? seniority(r) >= +m[1] && seniority(r) <= +m[2] : lodgeNoKey(p) === lodgeNoKey(r.number);
      });
      const pass = (r, skip) => (skip === 'name' || !f.name || fold(r.name).includes(fold(f.name)))
        && (skip === 'number' || !f.number.trim() || numOk(r, f.number))
        && (skip === 'count' || f.count === '' || String(r.count) === f.count)
        && (skip === 'provincial' || f.provincial === '' || (r.provincial || '-') === f.provincial);
      const shown = (xs = base()) => {
        const key = { name: (r) => fold(r.name), number: seniority, count: (r) => r.count, provincial: (r) => fold(r.provincial) || '￿' }[sort.k];
        const out = sortBy(xs.filter((r) => pass(r)), key, seniority, 'number');
        return sort.dir < 0 ? out.reverse() : out;
      };
      // δυναμικές επιλογές: μόνο οι τιμές (με πλήθος) που ταιριάζουν στα υπόλοιπα φίλτρα
      const opts = (xs, k) => {
        const cnt = new Map();
        for (const r of xs) if (pass(r, k)) { const v = k === 'count' ? String(r.count) : r.provincial || '-'; cnt.set(v, (cnt.get(v) || 0) + 1); }
        const vs = [...cnt.keys()].sort(k === 'count' ? (a, b) => a - b : (a, b) => (a === '-') - (b === '-') || a.localeCompare(b, 'el'));
        if (f[k] !== '' && !cnt.has(f[k])) vs.unshift(f[k]);
        return `<option value="">Όλα</option>${vs.map((v) => `<option value="${esc(v)}"${v === f[k] ? ' selected' : ''}>${esc(v === '-' ? '(χωρίς ορισμό)' : v)} (${cnt.get(v) || 0})</option>`).join('')}`;
      };
      const render = () => {
        const xs = base(), rows = shown(xs);
        el.querySelector('#slhead').innerHTML = COLS.map(([k, l]) => `<th data-sort="${k}" class="c-${k}">${esc(l)}${sort.k === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('');
        const fr = el.querySelector('#slf');
        if (!fr.firstChild) {
          fr.innerHTML = `<th><input data-f="name" placeholder="🔎 Όνομα Στοάς" autocomplete="off"></th><th><input data-f="number" placeholder="π.χ. 1-50" autocomplete="off"></th>
<th><select data-f="count"></select></th><th><select data-f="provincial"></select></th>`;
        }
        for (const k of ['name', 'number']) { const i = fr.querySelector(`[data-f="${k}"]`); if (document.activeElement !== i) i.value = f[k]; }
        for (const k of ['count', 'provincial']) fr.querySelector(`[data-f="${k}"]`).innerHTML = opts(xs, k);
        el.querySelector('#slbody').innerHTML = rows.length ? rows.map((r) => `<tr data-no="${esc(r.number)}" class="sl-row${sel === r.number ? ' sel' : ''}"><td class="c-name"><b>${esc(r.name)}</b>${r.status && r.status !== 'Ενεργή' ? ` <span class="pill warn">${esc(r.status)}</span>` : ''}</td>
<td class="c-number">${esc(r.number)}</td><td class="c-count"><a href="#/members?field=lodge&q=${encodeURIComponent(r.number)}">${r.count}</a></td><td class="c-provincial">${esc(r.provincial || '—')}</td></tr>`).join('')
          : `<tr><td colspan="4" class="muted">Καμία Στοά με λιγότερα από ${limit()} κύρια μέλη για τα φίλτρα αυτά.</td></tr>`;
        renderMembers();
        el.querySelector('#slcount').textContent = `${rows.length} από ${xs.length} Στοές με λιγότερα από ${limit()} κύρια μέλη · σύνολο ${rows.reduce((s, r) => s + r.count, 0)} κύρια μέλη`;
      };
      // ---- μέλη της επιλεγμένης Στοάς, με δυναμικά φίλτρα στις κατηγορίες
      const MCOLS = [['regno', 'Αρ. Μητρώου'], ['name', 'Ονοματεπώνυμο'], ['degree', 'Βαθμός'], ['capacity', 'Ιδιότητα'], ['fee', 'Συνδρομή'], ['status', 'Κατάσταση'], ['primary', 'Κύριο μέλος']];
      const lodgeMembers = () => {
        if (sel == null) return [];
        const st = statuses(), active = activeIds(), ms = new Map(db.all('member_registry').map((m) => [m.id, m])), seen = new Set(), out = [];
        for (const l of sortBy(db.all('member_lodges'), 'seq', 'id')) {
          const m = ms.get(l.member_id);
          if (!m || lodgeNoKey(l.lodge_number) !== lodgeNoKey(sel) || seen.has(m.id)) continue;
          seen.add(m.id);
          out.push({ id: m.id, regno: regCode(m), name: `${m.surname || ''} ${m.first_name || ''}`.trim(), degree: m.degree || '', capacity: capacityOf(l) || '-', fee: feeRankLabel(l.fee_rank) || '-',
            status: String(l.member_status || '').trim() || '-', primary: isPrimaryRow(l, st, active) ? 'ΝΑΙ' : 'ΟΧΙ' });
        }
        return sortBy(out, (r) => (r.primary === 'ΝΑΙ' ? 0 : 1), (r) => fold(r.name));
      };
      const mpass = (r, skip) => (skip === 'name' || !mf.name || fold(`${r.name} ${r.regno}`).includes(fold(mf.name)))
        && ['capacity', 'fee', 'status', 'primary'].every((k) => k === skip || mf[k] === '' || r[k] === mf[k]);
      const capOrder = (v) => { const i = MEMBER_CAPACITIES.findIndex((c) => c[0] === v); return i < 0 ? 99 : i; };
      const mopts = (xs, k) => {
        const cnt = new Map();
        for (const r of xs) if (mpass(r, k)) cnt.set(r[k], (cnt.get(r[k]) || 0) + 1);
        const vs = [...cnt.keys()].sort((a, b) => (a === '-') - (b === '-') || (k === 'capacity' ? capOrder(a) - capOrder(b) : 0) || a.localeCompare(b, 'el', { numeric: true }));
        if (mf[k] !== '' && !cnt.has(mf[k])) vs.unshift(mf[k]);
        return `<option value="">Όλα</option>${vs.map((v) => `<option value="${esc(v)}"${v === mf[k] ? ' selected' : ''}>${esc(v === '-' ? '(κενό)' : v)} (${cnt.get(v) || 0})</option>`).join('')}`;
      };
      const membersShown = (xs = lodgeMembers()) => xs.filter((r) => mpass(r));
      const lodgeOf = () => lodgesAll().find((l) => lodgeNoKey(l.number) === lodgeNoKey(sel)) || { name: '', number: sel };
      function renderMembers() {
        const box = el.querySelector('#slmem');
        if (sel == null) { box.hidden = true; return; }
        const xs = lodgeMembers(), rows = membersShown(xs), lo = lodgeOf();
        if (!box.firstChild) {
          box.innerHTML = `<div class="sl-mhead"><h2 style="margin:0" id="slmtitle"></h2><span class="toolbar" style="margin:0"><button class="btn small primary" data-act="mpdf">📄 PDF μελών</button><button class="btn small" data-act="mxlsx">⬇ Excel μελών</button><button class="btn small" data-act="mreset">✕ Φίλτρα</button><button class="btn small" data-act="mclose">Κλείσιμο</button></span></div>
<p class="sl-chips" id="slmchips"></p><div class="tablecard"><table class="sl-grid sl-mgrid"><thead><tr>${MCOLS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr>
<tr class="sl-f" id="slmf"><th></th><th><input data-m="name" placeholder="🔎 Όνομα ή αρ. μητρώου" autocomplete="off"></th><th></th>${['capacity', 'fee', 'status', 'primary'].map((k) => `<th><select data-m="${k}"></select></th>`).join('')}</tr></thead><tbody id="slmbody"></tbody></table></div><p class="muted" id="slmcount"></p>`;
        }
        box.hidden = false;
        box.querySelector('#slmtitle').textContent = `Μέλη της Στοάς «${lo.name}» αρ. ${lo.number}`;
        const ni = box.querySelector('[data-m=name]'); if (document.activeElement !== ni) ni.value = mf.name;
        for (const k of ['capacity', 'fee', 'status', 'primary']) box.querySelector(`[data-m="${k}"]`).innerHTML = mopts(xs, k);
        // κατηγορίες (ιδιότητες) με πλήθος — πάτημα = φίλτρο
        const cc = new Map(); for (const r of xs) if (mpass(r, 'capacity')) cc.set(r.capacity, (cc.get(r.capacity) || 0) + 1);
        box.querySelector('#slmchips').innerHTML = [...cc].sort((a, b) => capOrder(a[0]) - capOrder(b[0])).map(([c, n]) => `<button type="button" class="chip-btn${mf.capacity === c ? ' on' : ''}" data-cap="${esc(c)}">${esc(c === '-' ? '(χωρίς ιδιότητα)' : c)} <b>${n}</b></button>`).join('');
        box.querySelector('#slmbody').innerHTML = rows.length ? rows.map((r) => `<tr${r.primary === 'ΝΑΙ' ? '' : ' class="muted"'}><td>${esc(r.regno)}</td><td><a href="#/members/${r.id}">${esc(r.name)}</a></td><td>${esc(r.degree)}</td>
<td>${esc(r.capacity === '-' ? '—' : r.capacity)}</td><td>${esc(r.fee === '-' ? '—' : r.fee)}</td><td>${esc(r.status === '-' ? '—' : r.status)}</td><td>${r.primary === 'ΝΑΙ' ? '✓' : ''}</td></tr>`).join('')
          : `<tr><td colspan="${MCOLS.length}" class="muted">${xs.length ? 'Κανένα μέλος για τα φίλτρα αυτά.' : 'Η Στοά δεν έχει μέλη στο Μητρώο.'}</td></tr>`;
        box.querySelector('#slmcount').textContent = `Εμφανίζονται ${rows.length} από ${xs.length} μέλη · ${rows.filter((r) => r.primary === 'ΝΑΙ').length} κύρια μέλη`;
      }
      const membersReportHtml = () => {
        const rows = membersShown(), lo = lodgeOf(), act = [mf.name && `Όνομα: «${mf.name}»`, ...['capacity', 'fee', 'status', 'primary'].filter((k) => mf[k] !== '').map((k) => `${MCOLS.find((c) => c[0] === k)[1]}: ${mf[k] === '-' ? '(κενό)' : mf[k]}`)].filter(Boolean);
        const tbl = `<table><thead><tr><th>Α/Α</th>${MCOLS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td>${MCOLS.map(([k]) => `<td>${esc(r[k] === '-' ? '—' : k === 'primary' ? (r[k] === 'ΝΑΙ' ? '✓' : '') : r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table>
<p class="muted" style="margin-top:8px">Σύνολο: ${rows.length} μέλη · ${rows.filter((r) => r.primary === 'ΝΑΙ').length} κύρια μέλη.${act.length ? ' Φίλτρα: ' + esc(act.join(' · ')) + '.' : ''}</p>`;
        return reportPaper(`ΜΕΛΗ ΤΗΣ ΣΤΟΑΣ «${lo.name}» ΑΡ. ${lo.number}`, fmtDate(today()), tbl);
      };
      el.querySelector('#slbody').addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-no]'); if (!tr || e.target.closest('a')) return;
        sel = sel === tr.dataset.no ? null : tr.dataset.no; Object.keys(mf).forEach((k) => (mf[k] = '')); render();
        if (sel != null) el.querySelector('#slmem').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      el.querySelector('#slmem').addEventListener('input', (e) => { const k = e.target.dataset.m; if (k) { mf[k] = e.target.value; renderMembers(); } });
      el.querySelector('#slmem').addEventListener('click', (e) => { const b = e.target.closest('[data-cap]'); if (b) { mf.capacity = mf.capacity === b.dataset.cap ? '' : b.dataset.cap; renderMembers(); } });
      const reportHtml = () => {
        const rows = shown(), act = [f.name && `Στοά: «${f.name}»`, f.number.trim() && `Αριθμός: ${f.number.trim()}`, f.count !== '' && `Πλήθος: ${f.count}`,
          f.provincial !== '' && `Επαρχία: ${f.provincial === '-' ? '(χωρίς ορισμό)' : f.provincial}`].filter(Boolean);
        const tbl = `<table><thead><tr><th>Α/Α</th>${COLS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}</td><td>${esc(r.number)}</td><td style="text-align:center">${r.count}</td><td>${esc(r.provincial || '—')}</td></tr>`).join('')}</tbody></table>
<p class="muted" style="margin-top:8px">Σύνολο: ${rows.length} Στοές · ${rows.reduce((s, r) => s + r.count, 0)} κύρια μέλη. Σειρά αρχαιότητας (αύξων αριθμός Στοάς).${act.length ? ' Φίλτρα: ' + esc(act.join(' · ')) + '.' : ''}</p>`;
        return reportPaper(`ΣΤΟΕΣ ΜΕ ΛΙΓΟΤΕΡΑ ΑΠΟ ${limit()} ΚΥΡΙΑ ΜΕΛΗ`, fmtDate(today()), tbl);
      };
      const fileName = () => `STOES_KATO_APO_${limit()}_KYRIA_MELI_${today()}`;
      el.querySelector('.sl-opts').addEventListener('input', render);
      el.querySelector('#slf').addEventListener('input', (e) => { const k = e.target.dataset.f; if (k) { f[k] = e.target.value; render(); } });
      el.querySelector('#slhead').addEventListener('click', (e) => {
        const k = e.target.closest('[data-sort]')?.dataset.sort; if (!k) return;
        sort = sort.k === k ? { k, dir: -sort.dir } : { k, dir: 1 }; render();
      });
      bind(el, {
        mclose() { sel = null; render(); },
        mreset() { Object.keys(mf).forEach((k) => (mf[k] = '')); renderMembers(); },
        mxlsx: () => exportXlsx(`MELI_STOAS_${lodgeNoKey(sel)}_${today()}.xlsx`, 'Μέλη', ['Α/Α', ...MCOLS.map(([, l]) => l)], membersShown().map((r, i) => [i + 1, ...MCOLS.map(([k]) => (r[k] === '-' ? '' : r[k]))]), [6, 12, 32, 14, 16, 26, 20, 12]),
        async mpdf() {
          const lo = lodgeOf(), blob = await reportPdf(membersReportHtml(), `Μέλη της Στοάς ${lo.name} ${lo.number}`);
          download(`MELI_STOAS_${lodgeNoKey(sel)}_${today()}.pdf`, blob, 'application/pdf');
          toast('Η αναφορά PDF κατέβηκε.');
        },
        reset() { Object.keys(f).forEach((k) => (f[k] = '')); sort = { k: 'number', dir: 1 }; render(); },
        xlsx: () => exportXlsx(fileName() + '.xlsx', 'Στοές', ['Α/Α', ...COLS.map(([, l]) => l)], shown().map((r, i) => [i + 1, r.name, /^\d+$/.test(r.number) ? Number(r.number) : r.number, r.count, r.provincial]), [6, 34, 10, 20, 40]),
        print() {
          const pa = el.querySelector('#slpa');
          pa.innerHTML = reportHtml(); pa.hidden = false; printPaper(fileName());
          window.addEventListener('afterprint', () => (pa.hidden = true), { once: true });
        },
        async pdf() {
          const blob = await reportPdf(reportHtml(), `Στοές με λιγότερα από ${limit()} κύρια μέλη`);
          download(fileName() + '.pdf', blob, 'application/pdf');
          toast('Η αναφορά PDF κατέβηκε.');
        },
      });
      render();
    },
  };
}

// Αναφορά πολλών σελίδων Α4 σε PDF: απόδοση του εντύπου εκτός οθόνης και κόψιμο σε σελίδες στα όρια των γραμμών του πίνακα
async function reportPdf(html, title) {
  await Promise.all([loadScript('../vendor/html2canvas.min.js'), loadScript('../vendor/jspdf.umd.min.js')]);
  const host = Object.assign(document.createElement('div'), { innerHTML: html });
  host.style.cssText = 'position:fixed;left:-10000px;top:0';
  document.body.appendChild(host);
  try {
    const paper = host.firstElementChild;
    paper.classList.add('a4');
    await Promise.all([...paper.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
    const canvas = await window.html2canvas(paper, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
    const top = paper.getBoundingClientRect().top, k = canvas.width / paper.offsetWidth;
    const cuts = [...paper.querySelectorAll('tr, p')].map((r) => Math.round((r.getBoundingClientRect().bottom - top) * k));
    const W = 210, H = 297, M = 10, pageH = Math.floor(((H - 2 * M) * canvas.width) / W);
    const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    pdf.setProperties({ title });
    for (let y = 0, first = true; y < canvas.height - 2; first = false) {
      const end = Math.min(canvas.height, y + pageH), cut = end === canvas.height ? end : Math.max(...cuts.filter((c) => c > y + 20 && c <= end), 0) || end;
      const part = document.createElement('canvas');
      part.width = canvas.width; part.height = cut - y;
      const ctx = part.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, part.width, part.height);
      ctx.drawImage(canvas, 0, y, canvas.width, cut - y, 0, 0, canvas.width, cut - y);
      if (!first) pdf.addPage();
      pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, M, W, ((cut - y) * W) / canvas.width);
      y = cut;
    }
    return pdf.output('blob');
  } finally { host.remove(); }
}
