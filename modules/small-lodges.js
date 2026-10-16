// Στοές με λίγα κύρια μέλη — κατάλογος των Στοών με πλήθος κυρίων μελών κάτω από ένα όριο (προεπιλογή 12),
// με σειρά αρχαιότητας (αύξων αριθμός Στοάς), δυναμικά φίλτρα στις επικεφαλίδες, Excel, εκτύπωση και PDF.
// Κύριο μέλος: ενεργό μέλος του Μητρώου με ιδιότητα στη Στοά «1. …» / ΤΑΚΤΙΚΟ / ΚΥΡΙΟ (οι ιδιότητες επιλέγονται στη σελίδα).
import { db } from '../core/store.js';
import { bind, toast } from '../core/app.js';
import { esc, fold, sortBy, today, fmtDate, exportXlsx, download } from '../core/util.js';
import { reportPaper, printPaper } from '../core/paper.js';
import { loadScript } from '../core/pdf.js';
import { lodgesAll, lodgeNoKey } from './lodges.js';

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

// Πλήθος κυρίων μελών ανά Στοά (αριθμός → μοναδικά ενεργά μέλη με επιλεγμένη ιδιότητα)
function primaryCounts(statuses) {
  const active = new Set(db.all('member_registry').filter((m) => m.active !== 0 && !Number(m.no_contact)).map((m) => m.id)), seen = new Set(), out = {};
  for (const l of db.all('member_lodges')) {
    const st = normStatus(l.member_status), k = lodgeNoKey(l.lodge_number);
    if (!k || !active.has(l.member_id) || !statuses.has(st) || seen.has(k + ':' + l.member_id)) continue;
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
<fieldset class="sl-st"><legend>Ιδιότητες που μετρούν ως κύριο μέλος</legend>${choices.length ? choices.map(([s, n]) => `<label class="chip"><input type="checkbox" value="${esc(s)}"${isPrimary(s) ? ' checked' : ''}><span>${esc(s)} (${n})</span></label>`).join('') : '<span class="muted">Δεν υπάρχουν ιδιότητες μελών στις Στοές.</span>'}</fieldset></div>
<div class="toolbar"><button class="btn primary" data-act="pdf">📄 Αναφορά PDF</button><button class="btn" data-act="print">🖨 Εκτύπωση</button><button class="btn" data-act="xlsx">⬇ Excel</button>
<button class="btn" data-act="reset">✕ Καθαρισμός φίλτρων</button><span class="muted" id="slcount" style="align-self:center"></span></div>
<div class="card tablecard"><table class="sl-grid" id="slg"><thead><tr id="slhead"></tr><tr class="sl-f" id="slf"></tr></thead><tbody id="slbody"></tbody></table></div></div>
<section id="slpa" class="print-area" hidden></section>`,
    mount(el) {
      // κανένα «κύριο» στα δεδομένα → μετρούν όλες οι ιδιότητες
      if (choices.length && !el.querySelector('.sl-st input:checked')) el.querySelectorAll('.sl-st input').forEach((i) => (i.checked = true));
      const f = { name: '', number: '', count: '', provincial: '' };
      let sort = { k: 'number', dir: 1 };
      const limit = () => Math.max(1, Number(el.querySelector('#sllimit').value) || LIMIT);
      const base = () => {
        const counts = primaryCounts(new Set([...el.querySelectorAll('.sl-st input:checked')].map((i) => i.value)));
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
        el.querySelector('#slbody').innerHTML = rows.length ? rows.map((r) => `<tr><td class="c-name"><b>${esc(r.name)}</b>${r.status && r.status !== 'Ενεργή' ? ` <span class="pill warn">${esc(r.status)}</span>` : ''}</td>
<td class="c-number">${esc(r.number)}</td><td class="c-count"><a href="#/members?field=lodge&q=${encodeURIComponent(r.number)}">${r.count}</a></td><td class="c-provincial">${esc(r.provincial || '—')}</td></tr>`).join('')
          : `<tr><td colspan="4" class="muted">Καμία Στοά με λιγότερα από ${limit()} κύρια μέλη για τα φίλτρα αυτά.</td></tr>`;
        el.querySelector('#slcount').textContent = `${rows.length} από ${xs.length} Στοές με λιγότερα από ${limit()} κύρια μέλη · σύνολο ${rows.reduce((s, r) => s + r.count, 0)} κύρια μέλη`;
      };
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
