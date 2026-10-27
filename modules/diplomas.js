// 🎓 Διπλώματα Διδασκάλου Τέκτονος (Certificate Master Mason) — μία σελίδα, πάνω στο Μητρώο Μελών (καμία ξεχωριστή λίστα):
//   Μέλη με Δίπλωμα (αναζήτηση ανά Αδελφό) · Ανά Στοά (πόσοι έχουν / δεν έχουν) · Εισαγωγή Excel · Πρότυπο Excel · Κάρτα Μέλους.
// (Το επίσημο Δίπλωμα Διδασκάλου Τέκτονος θα προστεθεί από το πρότυπο της Γραμματείας.)
// Ο αριθμός Διπλώματος είναι ο πραγματικός αριθμός μητρώου (MM…). Η εισαγωγή συμπληρώνει στην καρτέλα του μέλους:
// Δίπλωμα, Ημ. Εισδοχής (Μαθητής), Ημ. Διελεύσεως (Εταίρος), Ημ. Εγέρσεως (Διδάσκαλος), Στοά Εγέρσεως και αριθμό της.
import { db } from '../core/store.js';
import { go, flash, toast, table, bind } from '../core/app.js';
import { esc, fold, sortBy, readXlsx, parsePasted, exportXlsx, fmtDate } from '../core/util.js';
import { identify, regCode, matchesCode } from '../core/people.js';
import { attachPicker, memberItems, noContact } from '../core/pickers.js';
import { regBadge, isAdmin, isoOf, lodgesByMember, exportBar, bindExport } from './members.js';
import { lodgeNoKey, lodgesAll } from './lodges.js';
import { reportPaper, printPaper } from '../core/paper.js';

// Πεδία του Excel (και του προτύπου) → πεδία του Μητρώου
export const DIPLOMA_COLS = [
  ['name', 'Ονοματεπώνυμο'], ['diploma_no', 'Αρ. Διπλώματος'], ['date_ea', 'Ημ. Εισδοχής (Μαθητής)'], ['date_fc', 'Ημ. Διελεύσεως (Εταίρος)'],
  ['date_mm', 'Ημ. Εγέρσεως (Διδάσκαλος)'], ['mm_lodge_name', 'Στοά Εγέρσεως'], ['mm_lodge_number', 'Αρ. Στοάς Εγέρσεως'],
];
const FIELD_LABEL = { diploma_no: 'Δίπλωμα', date_ea: 'Μαθητής', date_fc: 'Εταίρος', date_mm: 'Διδάσκαλος', mm_lodge_name: 'Στοά Εγέρσεως', mm_lodge_number: 'Αρ. Στοάς', degree: 'Βαθμός' };
const hasDip = (m) => !!String(m.diploma_no ?? '').trim();
const cleanNo = (v) => String(v ?? '').trim().replace(/^[MΜ]{2}\s*-?/i, '').replace(/\.0+$/, '').replace(/\s+/g, '');
const cell = (r, i) => (i >= 0 ? String(r[i] ?? '').trim() : '');

// Αναγνώριση στηλών (με σειρά: αριθμός Διπλώματος, Στοά, ονόματα, ημερομηνίες — ώστε «Αρ. Διπλώματος Διδασκάλου» να μη θεωρηθεί ημερομηνία)
function columns(h0) {
  const h = h0.map((x) => String(x).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()); // χωρίς τόνους
  const used = new Set(), find = (re) => { const i = h.findIndex((x, j) => !used.has(j) && re.test(x)); if (i >= 0) used.add(i); return i; };
  const c = {};
  c.no = find(/διπλωμ|diploma|certificate/); if (c.no < 0) c.no = find(/^αρ(ιθμος)?\.?\s*(μητρωου)?$|^no\.?$|^number$/);
  c.lodgeNo = find(/(αρ\.?|αριθμ).*στοα|lodge.?(no|number)/);
  c.lodge = find(/στοα|lodge/);
  c.name = find(/ονοματεπ|full.?name|^name$/); c.sur = find(/^επωνυμο|surname|last.?name/); c.first = find(/^ονομα$|first.?name/);
  c.ea = find(/εισδοχ|μυησ|μαθητ|initiat|entered/); c.fc = find(/διελευσ|διηλθε|εταιρ|passed|fellow/); c.mm = find(/εγερσ|ηγερθ|διδασκαλ|raised|master/);
  return c;
}
// Γραμμές Excel/επικόλλησης → [{ name, diploma_no, date_ea, date_fc, date_mm, mm_lodge_name, mm_lodge_number }]
export function diplomaRows(rows) {
  const rs = rows.filter((r) => r.some((x) => String(x ?? '').trim())).map((r) => {
    const t = r.filter((x) => String(x ?? '').trim());
    const m = t.length === 1 && /^(.*?)[\s,;]+((?:[MΜ]{2}\s*-?)?\d+)\s*$/i.exec(String(t[0]).trim()); // «Ονοματεπώνυμο 12345»
    return m ? [m[1], m[2]] : r;
  });
  if (!rs.length) return [];
  const h = rs[0].map((x) => String(x ?? '').trim()), c = columns(h);
  if (c.no < 0 || (c.name < 0 && c.sur < 0)) { // χωρίς επικεφαλίδες: όνομα + αριθμός
    const iNo = rs[0].findIndex((x) => /^\s*([MΜ]{2}\s*-?)?\d+\s*$/i.test(String(x ?? '')));
    if (iNo < 0) return [];
    return rs.map((r) => ({ name: r.filter((_, i) => i !== iNo).map((x) => String(x ?? '').trim()).filter(Boolean).join(' '), diploma_no: cleanNo(r[iNo]) }))
      .filter((x) => x.name && /^\d+$/.test(x.diploma_no));
  }
  return rs.slice(1).map((r) => ({
    name: (c.name >= 0 ? cell(r, c.name) : `${cell(r, c.sur)} ${cell(r, c.first)}`).replace(/\s+/g, ' ').trim(), diploma_no: cleanNo(r[c.no]),
    date_ea: isoOf(cell(r, c.ea)), date_fc: isoOf(cell(r, c.fc)), date_mm: isoOf(cell(r, c.mm)),
    mm_lodge_name: cell(r, c.lodge).replace(/^(σεβ\.?\s*)?(σ\.?\s*σ\.?\s*)?στο[αά]\s*/i, '').replace(/^[«"]|[»"]$/g, '').trim(), mm_lodge_number: cell(r, c.lodgeNo).replace(/\.0+$/, ''),
  })).filter((x) => x.name && /^\d+$/.test(x.diploma_no));
}

// Σχέδιο εισαγωγής: για κάθε γραμμή το μέλος, οι συγκρούσεις και οι αλλαγές πεδίων
export function diplomaPlan(items, picks = {}) {
  const ms = db.all('member_registry'), byNo = new Map(ms.filter(hasDip).map((m) => [String(m.diploma_no).trim(), m]));
  const seenNo = new Map(), seenM = new Map();
  for (const it of items) seenNo.set(it.diploma_no, (seenNo.get(it.diploma_no) || 0) + 1);
  const rows = items.map((it, i) => {
    const mid = picks[i] || identify({ full_name: it.name }), m = mid ? db.get('member_registry', mid) : null, owner = byNo.get(it.diploma_no);
    const changes = [];
    if (m) {
      for (const k of ['diploma_no', 'date_ea', 'date_fc', 'date_mm', 'mm_lodge_name', 'mm_lodge_number']) {
        const nv = String(it[k] ?? '').trim(), ov = String(k.startsWith('date_') ? isoOf(m[k]) : m[k] ?? '').trim();
        if (nv && nv !== ov) changes.push({ k, from: ov, to: nv });
      }
      if (!String(m.degree || '').trim()) changes.push({ k: 'degree', from: '', to: 'Διδάσκαλος' });
      seenM.set(m.id, (seenM.get(m.id) || 0) + 1);
    }
    const status = !m ? 'none' : seenNo.get(it.diploma_no) > 1 ? 'dupfile' : owner && owner.id !== m.id ? 'taken' : changes.length ? (changes.some((c) => c.from) ? 'fix' : 'set') : 'same';
    return { i, ...it, m, owner, changes, status, picked: !!picks[i] };
  });
  for (const r of rows) if (r.m && seenM.get(r.m.id) > 1 && ['set', 'fix'].includes(r.status)) r.status = 'dupmember';
  return rows;
}
const STATUS = {
  set: ['ok', 'Θα συμπληρωθεί'], fix: ['warn', 'Θα ενημερωθεί (αλλαγή υπαρχόντων)'], same: ['', '✓ Ήδη πλήρες'], taken: ['bad', 'Ο αριθμός ανήκει σε άλλο μέλος'],
  dupfile: ['bad', 'Ο αριθμός υπάρχει δύο φορές στο αρχείο'], dupmember: ['bad', 'Το μέλος υπάρχει δύο φορές στο αρχείο'], none: ['warn', 'Δεν βρέθηκε — επιλέξτε μέλος'],
};
const applicable = (r) => ['set', 'fix'].includes(r.status);
const showVal = (k, v) => (!v ? '—' : k === 'diploma_no' ? `MM${v}` : k.startsWith('date_') ? fmtDate(v) : v);

export async function applyDiplomas(rows) {
  const todo = rows.filter(applicable);
  await db.save(`Διπλώματα Διδασκάλου: ${todo.length}`, (tx) => {
    for (const r of todo) {
      const other = tx.find('member_registry', (x) => String(x.diploma_no ?? '').trim() === r.diploma_no && x.id !== r.m.id);
      if (other) throw new Error(`Το Δίπλωμα ${r.diploma_no} ανήκει ήδη στο μέλος ${other.surname} ${other.first_name}.`);
      tx.update('member_registry', r.m.id, Object.fromEntries(r.changes.map((c) => [c.k, c.to])));
    }
  });
  return todo.length;
}

// Ενεργά μέλη ανά Στοά (από τις Στοές κάθε μέλους στο Μητρώο): με / χωρίς Δίπλωμα
export function lodgeDiplomaStats() {
  const ms = new Map(db.all('member_registry').filter((m) => m.active !== 0 && !noContact(m)).map((m) => [m.id, m]));
  const by = new Map();
  for (const l of db.all('member_lodges')) {
    const m = ms.get(l.member_id), no = lodgeNoKey(l.lodge_number);
    if (!m || !no || /ΔΙΑΓΡΑΦ/i.test(String(l.member_status || '').normalize('NFD').replace(/[̀-ͯ]/g, ''))) continue;
    const x = by.get(no) || by.set(no, { no, name: l.lodge_name, ids: new Set() }).get(no);
    x.ids.add(m.id);
  }
  const reg = new Map(lodgesAll().map((l) => [lodgeNoKey(l.number), l]));
  return sortBy([...by.values()].map((x) => {
    const list = [...x.ids].map((id) => ms.get(id)), w = list.filter(hasDip).length;
    return { no: x.no, name: (reg.get(x.no) || {}).name || x.name, total: list.length, with: w, without: list.length - w };
  }), (x) => Number(x.no) || 1e6, 'no');
}

const lodgeLine = (m) => `${m.mm_lodge_name || ''} ${m.mm_lodge_number || ''}`.trim();
const TABS = [['protocol', '📖 Πρωτόκολλο Διπλωμάτων'], ['list', '🎓 Μέλη με Δίπλωμα'], ['lodges', '🏛 Ανά Στοά'], ['import', '⬆ Εισαγωγή Excel']];

export function diplomasPage({ query = {} } = {}) {
  const tab = TABS.some(([k]) => k === query.tab) ? query.tab : 'list';
  const ms = db.all('member_registry'), withD = ms.filter(hasDip), byM = lodgesByMember();
  const nav = `<nav class="decltabs">${TABS.map(([k, l]) => `<a class="btn${k === tab ? ' primary' : ''}" href="#/members/diplomas?tab=${k}">${l}</a>`).join('')}
<button type="button" class="btn" data-act="template">⬇ Πρότυπο Excel</button></nav>`;
  let body = '', pageMembers = null, protocolRows = null;
  if (tab === 'protocol') {
    // 📖 Πρωτόκολλο Διπλωμάτων Διδασκάλων Τεκτόνων: κατά αριθμό Διπλώματος — από τις καρτέλες του Μητρώου (καμία ξεχωριστή λίστα)
    const q = String(query.q || '').trim(), yr = String(query.year || '').trim();
    let xs = withD;
    if (yr) xs = xs.filter((m) => String(isoOf(m.date_mm)).startsWith(yr));
    if (q) xs = xs.filter((m) => matchesCode(m, q) || fold(`${m.surname} ${m.first_name} ${m.first_name} ${m.surname} ${lodgeLine(m)}`).includes(fold(q)));
    xs = sortBy(xs, (m) => Number(cleanNo(m.diploma_no)) || 1e12, (m) => String(m.diploma_no));
    const years = [...new Set(withD.map((m) => String(isoOf(m.date_mm)).slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort().reverse();
    const row = (m, i) => [String(i + 1), `MM${cleanNo(m.diploma_no)}`, m.registry_no != null && m.registry_no !== '' ? `M${m.registry_no}` : '', `${m.surname || ''} ${m.first_name || ''}`.trim(),
      fmtDate(isoOf(m.date_mm)) || String(m.date_mm || ''), m.mm_lodge_name || '', String(m.mm_lodge_number ?? '')];
    const head = ['Α/Α', 'Αρ. Διπλώματος', 'Αρ. Μητρώου', 'Ονοματεπώνυμο', 'Ημ. Εγέρσεως (Διδάσκαλος)', 'Στοά Εγέρσεως', 'Αρ. Στοάς'];
    protocolRows = { head, rows: xs.map(row), title: `ΠΡΩΤΟΚΟΛΛΟ ΔΙΠΛΩΜΑΤΩΝ ΔΙΔΑΣΚΑΛΩΝ ΤΕΚΤΟΝΩΝ${yr ? ' — ' + yr : ''}` };
    body = `<form class="card filters vfilters f3" id="dpp"><input name="q" value="${esc(q)}" placeholder="🔎 Αδελφός, MM αριθμός, Στοά…">
<select name="year"><option value="">Κάθε έτος Εγέρσεως</option>${years.map((y) => `<option${y === yr ? ' selected' : ''}>${y}</option>`).join('')}</select><button>Αναζήτηση</button></form>
<div class="toolbar"><span class="muted">${xs.length} Διπλώματα</span><button type="button" class="btn primary" data-act="protoPdf">🖨 PDF Πρωτοκόλλου</button><button type="button" class="btn" data-act="protoXlsx">⬇ Excel</button></div>
<div class="memtable">${table(head.concat(['']), xs.map((m, i) => { const r = row(m, i); return [r[0], `<b class="official-number">${esc(r[1])}</b>`, esc(r[2]), `<a href="#/members/${m.id}">${esc(r[3])}</a>`,
  r[4] ? esc(r[4]) : '<span class="vwarn">λείπει</span>', esc(r[5]) || '<span class="muted">—</span>', esc(r[6]), `<a class="btn small" href="#/members/diploma?id=${m.id}">🎓 Δίπλωμα</a>`]; }), 'Δεν υπάρχουν Διπλώματα στο Μητρώο.')}</div>
<div class="print-area" id="dpPaper" hidden></div>`;
  } else if (tab === 'list') {
    const q = String(query.q || '').trim(), lno = String(query.lodge || '').trim(), yr = String(query.year || '').trim();
    const mode = ['without', 'all'].includes(query.mode) ? query.mode : 'with';
    let xs = mode === 'with' ? withD : mode === 'without' ? ms.filter((m) => !hasDip(m) && m.active !== 0 && !noContact(m)) : ms;
    if (lno) xs = xs.filter((m) => lodgeNoKey(m.mm_lodge_number) === lodgeNoKey(lno) || (byM[m.id] || []).some((l) => lodgeNoKey(l.lodge_number) === lodgeNoKey(lno)));
    if (yr) xs = xs.filter((m) => String(isoOf(m.date_mm)).startsWith(yr));
    if (q) xs = xs.filter((m) => matchesCode(m, q) || fold(`${m.surname} ${m.first_name} ${m.first_name} ${m.surname} ${lodgeLine(m)}`).includes(fold(q)));
    xs = sortBy(xs, (m) => (hasDip(m) ? Number(m.diploma_no) || 0 : 1e9), 'surname', 'first_name');
    pageMembers = xs;
    const years = [...new Set(withD.map((m) => String(isoOf(m.date_mm)).slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort().reverse();
    const printIds = xs.slice(0, 200).map((m) => m.id).join(',');
    body = `<form class="card filters vfilters" id="dpf"><input name="q" value="${esc(q)}" placeholder="🔎 Αδελφός, MM/M αριθμός, Στοά…">
<select name="mode"><option value="with"${mode === 'with' ? ' selected' : ''}>Με Δίπλωμα (${withD.length})</option><option value="without"${mode === 'without' ? ' selected' : ''}>Ενεργοί χωρίς Δίπλωμα</option><option value="all"${mode === 'all' ? ' selected' : ''}>Όλα τα μέλη</option></select>
<select name="lodge"><option value="">Όλες οι Στοές</option>${lodgesAll().map((l) => `<option value="${esc(l.number)}"${lno && lodgeNoKey(l.number) === lodgeNoKey(lno) ? ' selected' : ''}>${esc(l.number)} · ${esc(l.name)}</option>`).join('')}</select>
<select name="year"><option value="">Κάθε έτος Εγέρσεως</option>${years.map((y) => `<option${y === yr ? ' selected' : ''}>${y}</option>`).join('')}</select><button>Αναζήτηση</button></form>
<div class="toolbar"><span class="muted">${xs.length} μέλη</span>${exportBar()}<button type="button" class="btn small" data-act="exportList">⬇ Excel Διπλωμάτων</button>${printIds ? `<a class="btn small" href="#/members/card?ids=${printIds}">🪪 Κάρτες Μέλους της λίστας</a>` : ''}</div>
<div class="memtable">${table(['Αρ. Μητρώου', 'Ονοματεπώνυμο', 'Μαθητής', 'Εταίρος', 'Διδάσκαλος', 'Στοά Εγέρσεως', 'Στοές μέλους', ''], xs.slice(0, 500).map((m) => [regBadge(m),
  `<a href="#/members/${m.id}">${esc(m.surname)} ${esc(m.first_name)}</a>`, esc(fmtDate(isoOf(m.date_ea))), esc(fmtDate(isoOf(m.date_fc))), esc(fmtDate(isoOf(m.date_mm))), esc(lodgeLine(m)),
  `<small>${esc((byM[m.id] || []).map((l) => `${l.lodge_name} ${l.lodge_number}`.trim()).join(', '))}</small>`,
  `<a class="btn small" href="#/members/card?ids=${m.id}">🪪 Κάρτα Μέλους</a>`]), 'Δεν βρέθηκαν μέλη.')}</div>`;
  } else if (tab === 'lodges') {
    const st = lodgeDiplomaStats(), T = st.reduce((a, x) => ({ total: a.total + x.total, with: a.with + x.with }), { total: 0, with: 0 });
    body = `<div class="vstats"><span><b>${T.total}</b> ενεργές συμμετοχές μελών</span><span><b>${T.with}</b> με Δίπλωμα</span><span class="${T.total - T.with ? 'warn' : ''}"><b>${T.total - T.with}</b> χωρίς Δίπλωμα</span></div>
<div class="toolbar"><button type="button" class="btn small" data-act="exportLodges">⬇ Excel ανά Στοά</button></div>
${table(['Αρ.', 'Στοά', 'Ενεργά μέλη', 'Με Δίπλωμα', 'Χωρίς Δίπλωμα', ''], st.map((x) => [esc(x.no), `<b>${esc(x.name || '')}</b>`, x.total,
  `${x.with} <span class="bar"><i style="width:${x.total ? Math.round(100 * x.with / x.total) : 0}%"></i></span>`, x.without ? `<span class="vwarn">${x.without}</span>` : '<span class="vok">✓ 0</span>',
  `<a class="btn small" href="#/members/diplomas?tab=list&mode=all&lodge=${encodeURIComponent(x.no)}">Μέλη</a> ${x.without ? `<a class="btn small" href="#/members/diplomas?tab=list&mode=without&lodge=${encodeURIComponent(x.no)}">Χωρίς Δίπλωμα</a>` : ''}`]), 'Δεν υπάρχουν Στοές μελών στο Μητρώο.')}`;
  } else {
    body = isAdmin() ? `<div class="card"><h2 style="margin-top:0">Εισαγωγή Διπλωμάτων</h2>
<p class="muted">Excel με τις στήλες του <b>προτύπου</b> (⬇ Πρότυπο Excel): ${DIPLOMA_COLS.map(([, l]) => `<b>${esc(l)}</b>`).join(' · ')}.
Αναγνωρίζονται και «Επώνυμο» + «Όνομα». Συμπληρώνονται στην καρτέλα κάθε μέλους ο αριθμός Διπλώματος (Αρ. Μητρώου <span class="regno mm">MM…</span>),
οι ημερομηνίες Εισδοχής, Διελεύσεως, Εγέρσεως και η Στοά Εγέρσεως. Πριν την καταχώριση βλέπετε τι αλλάζει σε κάθε μέλος.</p>
<div class="toolbar"><label class="btn primary" style="cursor:pointer">⬆ Αρχείο Excel<input type="file" id="dpFile" accept=".xlsx,.xls,.csv" hidden></label></div>
<textarea id="dpPaste" class="short" placeholder="ή επικόλληση από Excel (με την πρώτη γραμμή επικεφαλίδων)"></textarea>
<div class="toolbar"><button type="button" class="btn" id="dpRead">Ανάγνωση επικόλλησης</button></div></div><div id="dpPlan"></div>`
      : '<div class="card nocontact">Η εισαγωγή Διπλωμάτων γίνεται μόνο από τον διαχειριστή.</div>';
  }
  return {
    title: 'Διπλώματα Διδασκάλου',
    html: `<p><a href="#/members">← Μητρώο Μελών</a></p><h1>🎓 Διπλώματα Διδασκάλου Τέκτονος <small class="muted">Certificate Master Mason</small></h1>
<p class="muted">Ο αριθμός Διπλώματος είναι ο <b>πραγματικός αριθμός μητρώου</b> (<span class="regno mm">MM12345</span>)· όσοι δεν έχουν κρατούν τον αριθμό τους με M (<span class="regno m">M1200</span>).</p>
<div class="vstats"><span><b>${withD.length}</b> με Δίπλωμα (MM)</span><span><b>${ms.length - withD.length}</b> χωρίς Δίπλωμα (M)</span></div>${nav}${body}`,
    mount(el) {
      if (pageMembers) bindExport(el, () => pageMembers, 'Διπλώματα Διδασκάλου');
      const fp = el.querySelector('#dpp');
      if (fp) fp.addEventListener('submit', (e) => { e.preventDefault(); go('/members/diplomas', { tab: 'protocol', ...Object.fromEntries(new FormData(fp)) }); });
      const f = el.querySelector('#dpf');
      if (f) f.addEventListener('submit', (e) => { e.preventDefault(); go('/members/diplomas', { tab: 'list', ...Object.fromEntries(new FormData(f)) }); });
      bind(el, {
        protoPdf() {
          const P = protocolRows, pa = el.querySelector('#dpPaper');
          pa.innerHTML = reportPaper(P.title, `Σύνολο: ${P.rows.length} Διπλώματα · ${new Date().toLocaleDateString('el-GR')}`,
            `<table><thead><tr>${P.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${P.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
          pa.hidden = false; printPaper('Protokollo_Diplomaton'); addEventListener('afterprint', () => { pa.hidden = true; }, { once: true });
        },
        protoXlsx: () => exportXlsx('Πρωτόκολλο Διπλωμάτων Διδασκάλων.xlsx', 'ΠΡΩΤΟΚΟΛΛΟ ΔΙΠΛΩΜΑΤΩΝ', protocolRows.head, protocolRows.rows, [6, 16, 12, 30, 22, 26, 10]),
        template: () => exportXlsx('Πρότυπο Διπλωμάτων Διδασκάλου.xlsx', 'ΔΙΠΛΩΜΑΤΑ', DIPLOMA_COLS.map(([, l]) => l),
          [['Παπαδόπουλος Ιωάννης', '12345', '2010-03-15', '2010-11-20', '2011-06-10', 'ΑΘΗΝΑ', '1']], [28, 16, 22, 22, 24, 22, 18]),
        exportList: () => exportXlsx('Διπλώματα Διδασκάλου.xlsx', 'ΔΙΠΛΩΜΑΤΑ', ['Αρ. Μητρώου', ...DIPLOMA_COLS.map(([, l]) => l)],
          sortBy(withD, (m) => Number(m.diploma_no) || 0).map((m) => [regCode(m), `${m.surname} ${m.first_name}`, m.diploma_no, isoOf(m.date_ea), isoOf(m.date_fc), isoOf(m.date_mm), m.mm_lodge_name || '', m.mm_lodge_number || '']), [14, 28, 16, 20, 20, 22, 22, 16]),
        exportLodges: () => exportXlsx('Διπλώματα ανά Στοά.xlsx', 'ΑΝΑ ΣΤΟΑ', ['Αρ. Στοάς', 'Στοά', 'Ενεργά μέλη', 'Με Δίπλωμα', 'Χωρίς Δίπλωμα'],
          lodgeDiplomaStats().map((x) => [x.no, x.name, x.total, x.with, x.without]), [10, 30, 14, 14, 16]),
      });
      const box = el.querySelector('#dpPlan');
      if (!box) return;
      let items = [], picks = {};
      const draw = () => {
        const rows = diplomaPlan(items, picks), n = rows.filter(applicable).length;
        box.innerHTML = !rows.length ? '<div class="card">Δεν βρέθηκαν γραμμές με όνομα και αριθμό Διπλώματος.</div>'
          : `<div class="vstats"><span><b>${rows.length}</b> γραμμές</span><span class="${n ? 'warn' : ''}"><b>${n}</b> προς καταχώριση</span><span><b>${rows.filter((r) => r.status === 'none').length}</b> χωρίς αντιστοίχιση</span><span><b>${rows.filter((r) => STATUS[r.status][0] === 'bad').length}</b> συγκρούσεις</span></div>
${table(['Από το αρχείο', 'Μέλος στο Μητρώο', 'Αλλαγές στην καρτέλα', 'Ενέργεια'], rows.map((r) => [`${esc(r.name)}<br><b>MM${esc(r.diploma_no)}</b>`,
  r.m ? `<a href="#/members/${r.m.id}">${esc(r.m.surname)} ${esc(r.m.first_name)}</a> ${regBadge(r.m)}${r.picked ? ' <small class="muted">(επιλογή)</small>' : ''}${r.status === 'taken' ? `<br><small class="vwarn">ο αριθμός ανήκει σε: ${esc(r.owner.surname)} ${esc(r.owner.first_name)}</small>` : ''}`
    : `<input class="dpPick" data-i="${r.i}" placeholder="🔎 Αναζήτηση μέλους…" autocomplete="off">`,
  r.changes.length ? `<small>${r.changes.map((c) => `${esc(FIELD_LABEL[c.k])}: ${c.from ? `<s>${esc(showVal(c.k, c.from))}</s> → ` : ''}<b>${esc(showVal(c.k, c.to))}</b>`).join('<br>')}</small>` : '—',
  `<span class="pill ${STATUS[r.status][0]}">${STATUS[r.status][1]}</span>`]))}
<p><button type="button" class="btn primary" id="dpApply"${n ? '' : ' disabled'}>✔ Καταχώριση σε ${n} μέλη</button></p>`;
        box.querySelectorAll('.dpPick').forEach((inp) => attachPicker(inp, memberItems, (mm) => { picks[inp.dataset.i] = mm.id; draw(); }));
        const b = box.querySelector('#dpApply');
        if (b) b.addEventListener('click', async () => {
          b.disabled = true;
          try { const k = await applyDiplomas(rows); flash(`Ενημερώθηκαν ${k} μέλη με τα στοιχεία Διπλώματος Διδασκάλου.`); go('/members/diplomas', { tab: 'list' }); }
          catch (e) { toast(e.message || String(e), 'error'); b.disabled = false; }
        });
      };
      const load = (rows) => { items = diplomaRows(rows); picks = {}; draw(); };
      el.querySelector('#dpFile').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try { const sh = (await readXlsx(file)).find((s) => s.rows.length); load(sh ? sh.rows : []); } catch (err) { toast(err.message || String(err), 'error'); }
        e.target.value = '';
      });
      el.querySelector('#dpRead').addEventListener('click', () => load(parsePasted(el.querySelector('#dpPaste').value)));
    },
  };
}
