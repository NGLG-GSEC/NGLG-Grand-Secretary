// Μικρά κοινά εργαλεία: διαφυγή HTML, αναζήτηση χωρίς τόνους, ημερομηνίες, email, Excel.

export const esc = (x) => String(x ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);

// Αναζήτηση: χωρίς τόνους, ς=σ, και τα ελληνικά γράμματα που μοιάζουν με λατινικά ταυτίζονται (π.χ. «ΡAIX» = «PAIX»).
const ACC_FROM = 'άέήίόύώϊϋΐΰςαβεζηικμνορτυχ', ACC_TO = 'aehioyωiyiyσabezhikmnoptyx';
const ACC = Object.fromEntries([...ACC_FROM].map((c, i) => [c, ACC_TO[i]]));
export const fold = (v) => String(v ?? '').toLowerCase().replace(/./gu, (c) => ACC[c] || c);
export const foldName = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ').trim();
export function matches(q, ...fields) {
  const hay = fold(fields.join(' ')), digits = fields.join(' ').replace(/\D/g, '');
  return fold(q).split(/\s+/).filter(Boolean).every((w) => hay.includes(w) || (/^\+?[\d\s-]{3,}$/.test(w) && digits.includes(w.replace(/\D/g, ''))));
}

export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const parseIso = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
export const fmtDate = (s) => { const d = parseIso(s); return d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : (s || ''); };
export const addDays = (s, n) => { const d = parseIso(s); d.setDate(d.getDate() + n); return isoDate(d); };
export const DAYS = ['Κυριακή', 'Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο'];
export const MONTHS_GEN = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
export const dayStr = (s) => { const d = parseIso(s); return d ? `${DAYS[d.getDay()]} ${fmtDate(s)}` : (s || ''); };
export const longDate = (s) => { const d = parseIso(s); return d ? `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}` : (s || ''); };

export const EMAIL_RE = /^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/;
export const splitEmails = (s) => String(s || '').split(/[\s,;]+/).filter(Boolean);
export const validEmails = (s) => splitEmails(s).filter((e) => EMAIL_RE.test(e));

export const grUpper = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().normalize('NFC');

export function linkify(text) {
  return esc(text).replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g, (raw) => {
    let trail = '';
    while (raw && '.,;:!?)]}'.includes(raw.slice(-1))) { trail = raw.slice(-1) + trail; raw = raw.slice(0, -1); }
    const href = raw.startsWith('http') ? raw : 'https://' + raw;
    return `<a href="${href}" target="_blank" rel="noopener noreferrer">${raw}</a>${trail}`;
  });
}

export function download(name, data, type = 'application/octet-stream') {
  const url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export const safeFileName = (s) => String(s || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();

// Excel (SheetJS, μέσα στην εφαρμογή: vendor/xlsx.full.min.js · φορτώνεται μόνο όταν χρειαστεί)
let xlsxLib;
export async function XLSX() {
  if (xlsxLib) return xlsxLib;
  await new Promise((ok, bad) => {
    const s = Object.assign(document.createElement('script'), { src: new URL('../vendor/xlsx.full.min.js', import.meta.url).href, onload: ok, onerror: () => bad(new Error('Δεν φορτώθηκε η βιβλιοθήκη Excel.')) });
    document.head.appendChild(s);
  });
  return (xlsxLib = window.XLSX);
}
export async function exportXlsx(fileName, sheetName, headers, rows, widths) {
  const X = await XLSX();
  const ws = X.utils.aoa_to_sheet([headers, ...rows.map((r) => r.map((v) => v ?? ''))]);
  if (widths) ws['!cols'] = widths.map((w) => ({ wch: w }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  X.writeFile(wb, fileName);
}
export async function readXlsx(file) {
  const X = await XLSX();
  const wb = X.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  return wb.SheetNames.map((n) => ({ name: n, rows: X.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd' }) }));
}

export const sortBy = (arr, ...keys) => [...arr].sort((a, b) => {
  for (const k of keys) {
    const f = typeof k === 'function' ? k : (x) => x[k];
    const x = f(a), y = f(b);
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x ?? '').localeCompare(String(y ?? ''), 'el', { numeric: true });
  }
  return 0;
});

// Επικόλληση από Excel: γραμμές με στηλοθέτες (Tab) — τα κελιά με εισαγωγικά μπορεί να έχουν αλλαγές γραμμής
export function parsePasted(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  const t = String(text || '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"' && cell === '') q = true;
    else if (c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
