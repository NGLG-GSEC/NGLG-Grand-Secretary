// 🎓 Δίπλωμα Διδασκάλου Τέκτονος (Certificate Master Mason) — το επίσημο έντυπο της Γραμματείας (A3, ελληνικά & αγγλικά).
// Πρότυπο: «Πρότυπα» → ΔΙΠΛΩΜΑ ΔΙΔΑΣΚΑΛΟΥ ΤΕΚΤΟΝΟΣ (letter_templates, kind 'diploma'). Κάθε στοιχείο του εντύπου είναι ένα πλαίσιο
// σε mm πάνω στη σελίδα (θέσεις από το αρχικό diploma_master_dt.pptx)· η «Σχεδίαση Διπλώματος» (builder) αλλάζει θέση, μέγεθος,
// γραμματοσειρά, στοίχιση, περιστροφή και κείμενο, και αποθηκεύει μόνο τις διαφορές στο layout του προτύπου.
// Έκδοση: Μητρώο → μέλος → τα πεδία {…} συμπληρώνονται από την καρτέλα του (Δίπλωμα, Εισδοχή, Έγερση, Στοά) και διορθώνονται πριν την εκτύπωση.
import { db } from '../core/store.js';
import { module, go, bind, flash, toast, confirmDo } from '../core/app.js';
import { esc } from '../core/util.js';
import { regCode } from '../core/people.js';
import { attachPicker, memberItems } from '../core/pickers.js';
import { IMG, printPaper, GS_NAME } from '../core/paper.js';
import { isoOf, lodgesByMember } from './members.js';

export const DIPLOMA_KEY = 'diploma-mm';
export const PAGE = { w: 297, h: 420 }; // A3 κατακόρυφο (mm)
const SCRIPT = "'PF Champion Script Pro','Noto Serif',serif", ATHENIAN = "'SKAthenianOldFacePolUni_W','Noto Serif',serif";

const GR_TEXT = 'Πρός πάντα ἐνδιαφερόμενον\nΤαῦτα πιστοποιοῦν ὅτι ὁ Ἀδελφός ἡμῶν\n**{Όνομα}**\n'
  + 'Τοῦ ὁποίου ἡ ὑπογραφή ἐμφαίνεται εἰς τό περιθώριον ἐμυήθη κανονικῶς εἰς τον Ἐλευθεροτεκτονισμόν\n'
  + 'τήν {ΕΙΣ ημέρα}ην ἡμέραν τοῦ μηνός {ΕΙΣ μήνας} {ΕΙΣ έτος} Ε.Κ. {ΕΙΣ Ε.Φ.} Ε.Φ. εἰς την Στοάν {Στοά} ὑπ’ ἀριθ. {Αρ. Στοάς} '
  + 'καί ἀποδείξας ὅτι κατέχει τά κατάλληλα προσόντα κανονικῶς διῆλθεν πρός τόν δεύτερον καί ἠγέρθη εἰς τόν τρίτον βαθμούς, '
  + 'ἔχει δέ δεόντως καταχωρισθῆ εἰς τά Μητρῷα τῆς Μεγάλης ταύτης Στοᾶς.\n'
  + 'Εἰς μαρτυρίαν τούτου θέτω τήν ἐμήν ὑπογραφήν καί ἀποτυπῶ τήν Σφραγῖδα τῆς Ἐθνικῆς Μεγάλης Στοᾶς τῆς Ἑλλάδος σήμερον '
  + 'τήν {ΕΚΔ ημέρα}ην ἡμέραν τοῦ μηνός {ΕΚΔ μήνας} {ΕΚΔ έτος} Ε.Κ. {ΕΚΔ Ε.Φ.} Ε.Φ. '
  + 'Τό Δίπλωμα τοῦτο δέν παρέχει εἰς Ἀδελφόν δικαίωμα εἰσόδου ἐντός οἱασδήποτε Στοᾶς ἄνευ τῆς δεούσης Ἐξετάσεως.';
const EN_HEAD = 'To all whom it may concern\nThese are to certify that our Brother\n**{NAME}**';
const EN_TEXT = 'Whose signature appears in the margin hereof was regularly initiated into Free Masonry on the {ΕΙΣ day} of {ΕΙΣ month} {ΕΙΣ έτος} AD {ΕΙΣ Ε.Φ.} AL '
  + 'in {LODGE} Lodge No. {Αρ. Στοάς} and, been proven qualified was regularly passed to the second and raised to the third degrees '
  + 'and that he is duly registered in the books of this Grand Lodge accordingly.\n'
  + 'In testimony where of I have hereon subscribed my name, and affixed the Seal of the National Grand Lodge of Greece in Athens '
  + 'this {ΕΚΔ day} day of {ΕΚΔ month} {ΕΚΔ έτος} AD {ΕΚΔ Ε.Φ.} AL.\n'
  + 'This Certificate shall not entitle a Brother to admission into any Lodge without due Examination.';

// Τα στοιχεία του εντύπου (x, y, w, h σε mm· size σε pt· rot σε μοίρες γύρω από το κέντρο)
export const BOXES = {
  header: { label: 'Κεφαλίδα (θυρεός, τίτλοι)', type: 'img', src: 'img/diploma/header.jpg', x: 27, y: 7.2, w: 244.7, h: 149 },
  pillars: { label: 'Εικόνα κιόνων', type: 'img', src: 'img/diploma/pillars.jpg', x: 9.8, y: 157.3, w: 281.9, h: 206 },
  gr: { label: 'Ελληνικό κείμενο', type: 'text', text: GR_TEXT, x: 56.7, y: 164.6, w: 85.5, h: 145.8, size: 17, font: SCRIPT, align: 'center', fit: true },
  en_head: { label: 'Αγγλικά — εισαγωγή και όνομα', type: 'text', text: EN_HEAD, x: 159.2, y: 164.3, w: 81.3, h: 27.8, size: 17, font: SCRIPT, align: 'center', fit: true },
  en: { label: 'Αγγλικό κείμενο', type: 'text', text: EN_TEXT, x: 158, y: 189.1, w: 82.5, h: 137.2, size: 17, font: SCRIPT, align: 'center', fit: true },
  margin: { label: 'Περιθώριο υπογραφής μέλους', type: 'shape', shape: 'margin', x: 15.2, y: 224.5, w: 18, h: 61 },
  date_top: { label: 'Περιθώριο — ημερομηνία (πάνω)', type: 'text', text: '{Ημ. Έκδοσης}', x: 16.3, y: 234.7, w: 29.7, h: 10.3, rot: -90, size: 18, bold: true, font: SCRIPT, align: 'right' },
  date_bottom: { label: 'Περιθώριο — ημερομηνία (κάτω)', type: 'text', text: '{Ημ. Εγέρσεως}', x: 16, y: 264.6, w: 29.7, h: 10.3, rot: -90, size: 18, bold: true, font: SCRIPT, align: 'left' },
  dno: { label: 'Αριθμός Διπλώματος', type: 'text', text: '{Αρ. Διπλώματος}', x: 85.3, y: 343.4, w: 28.4, h: 9, rot: 8.2, size: 18, bold: true, font: "Calibri,'Noto Serif',sans-serif", align: 'left', style: 'stamp' },
  seal: { label: 'Θέση σφραγίδας', type: 'shape', shape: 'seal', x: 124.3, y: 363.7, w: 50, h: 50 },
  gs_frame: { label: 'Πλαίσιο υπογραφής Μ. Γραμματέως', type: 'img', src: 'img/diploma/frame.png', x: 11.4, y: 365.1, w: 84.4, h: 24.6 },
  gs_sig: { label: 'Υπογραφή Μ. Γραμματέως', type: 'img', src: IMG.signature, x: 29.3, y: 369.1, w: 41.9, h: 16.8, contain: true },
  gs_title: { label: 'Τίτλος Μ. Γραμματέως', type: 'text', text: 'Ο Μέγας Γραμματεύς', x: 13, y: 387.8, w: 81.3, h: 8.5, size: 14, font: ATHENIAN, align: 'center' },
  gs_name: { label: 'Όνομα Μ. Γραμματέως', type: 'text', text: '{Μέγας Γραμματεύς}', x: 11.4, y: 396.3, w: 81.3, h: 8.5, size: 14, bold: true, font: ATHENIAN, align: 'center', fit: true },
  gm_frame: { label: 'Πλαίσιο υπογραφής Μ. Διδασκάλου', type: 'img', src: 'img/diploma/frame.png', x: 204.4, y: 364.9, w: 84.4, h: 24.6 },
  gm_sig: { label: 'Υπογραφή Μ. Διδασκάλου', type: 'img', src: IMG.grandMaster, x: 227.3, y: 367.5, w: 38.7, h: 18.4, contain: true },
  gm_title: { label: 'Τίτλος Μ. Διδασκάλου', type: 'text', text: 'Ο Μέγας Διδάσκαλος', x: 206, y: 387.8, w: 79.7, h: 8.5, size: 14, font: ATHENIAN, align: 'center' },
  gm_name: { label: 'Όνομα Μ. Διδασκάλου', type: 'text', text: '{Μέγας Διδάσκαλος}', x: 207.6, y: 396.3, w: 79.7, h: 8.5, size: 14, bold: true, font: ATHENIAN, align: 'center', fit: true },
  // μικρά γράμματα πάνω στην εικόνα των κιόνων (όπως στο αρχικό)
  m_s: { label: 'Γράμμα «Σ» (εικόνα)', type: 'text', text: 'Σ', x: 111.8, y: 319.7, w: 6.1, h: 7.7, size: 12, font: "Calibri,'Noto Serif',sans-serif", align: 'left' },
  m_a: { label: 'Γράμμα «Α» (εικόνα)', type: 'text', text: 'Α', x: 180.9, y: 340.6, w: 6.1, h: 7.3, size: 11, font: "Calibri,'Noto Serif',sans-serif", align: 'left' },
  m_k: { label: 'Γράμμα «Κ» (εικόνα)', type: 'text', text: 'Κ', x: 190.8, y: 339.6, w: 5.8, h: 7.3, size: 11, font: "Calibri,'Noto Serif',sans-serif", align: 'left' },
  m_b: { label: 'Γράμμα «B.» (εικόνα)', type: 'text', text: 'B.', x: 114.9, y: 312.9, w: 5.6, h: 12.8, rot: -48, size: 12, color: '#7f7f7f', font: "Calibri,'Noto Serif',sans-serif", align: 'left' },
  m_k2: { label: 'Γράμμα «K.» (εικόνα)', type: 'text', text: 'K.', x: 115.6, y: 306.3, w: 8.6, h: 7.7, rot: -79.2, size: 12, color: '#7f7f7f', font: "Calibri,'Noto Serif',sans-serif", align: 'left' },
};
export const FIELDS = [ // πεδία έκδοσης (από το Μητρώο, διορθώνονται πριν την εκτύπωση)
  ['name', 'Ονοματεπώνυμο (ελληνικά)'], ['name_en', 'Ονοματεπώνυμο (λατινικά, κεφαλαία)'], ['dno', 'Αρ. Διπλώματος'],
  ['ea', 'Ημ. Εισδοχής (μύησης)', 'date'], ['mm', 'Ημ. Εγέρσεως', 'date'], ['issue', 'Ημ. Έκδοσης Διπλώματος', 'date'],
  ['lodge', 'Στοά (ελληνικά)'], ['lodge_en', 'Lodge (λατινικά)'], ['lodge_no', 'Αρ. Στοάς'],
];
export const PLACEHOLDERS = [
  ['Όνομα', 'ονοματεπώνυμο'], ['NAME', 'ονοματεπώνυμο με λατινικά'], ['Αρ. Διπλώματος', 'αριθμός Διπλώματος'],
  ['ΕΙΣ ημέρα', 'ημέρα Εισδοχής (15)'], ['ΕΙΣ μήνας', 'μήνας Εισδοχής (Μαρτίου)'], ['ΕΙΣ έτος', 'έτος (2021)'], ['ΕΙΣ Ε.Φ.', 'έτος Φωτός (6021)'],
  ['ΕΙΣ day', '15th'], ['ΕΙΣ month', 'March'], ['Στοά', 'Στοά'], ['LODGE', 'Lodge'], ['Αρ. Στοάς', 'αριθμός Στοάς'],
  ['ΕΚΔ ημέρα', 'ημέρα έκδοσης'], ['ΕΚΔ μήνας', 'μήνας έκδοσης'], ['ΕΚΔ έτος', 'έτος έκδοσης'], ['ΕΚΔ Ε.Φ.', 'έτος Φωτός έκδοσης'], ['ΕΚΔ day', '1st'], ['ΕΚΔ month', 'April'],
  ['Ημ. Εισδοχής', '15/3/2021'], ['Ημ. Εγέρσεως', 'ημ/νία Εγέρσεως'], ['Ημ. Έκδοσης', 'ημ/νία έκδοσης'], ['Μέγας Γραμματεύς', 'από τις Ρυθμίσεις'], ['Μέγας Διδάσκαλος', 'από τις Ρυθμίσεις'],
];

const MONTHS_GR = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αὐγούστου', 'Σεπτεμβρίου', 'Ὀκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου'];
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ordinal = (n) => `${n}${[11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;
const parts = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? { y: +m[1], m: +m[2], d: +m[3] } : null; };
const dmy = (iso) => { const p = parts(iso); return p ? `${p.d}/${p.m}/${p.y}` : ''; };

// Μεταγραφή ελληνικών → λατινικά (ΕΛΟΤ 743, απλοποιημένη)
export function greeklish(s) {
  const t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  const VF = 'ΑΕΗΙΟΥΩΒΓΔΖΛΜΝΡ'; // ΑΥ/ΕΥ → AV/EV πριν από φωνήεν ή ηχηρό
  const one = { Α: 'A', Β: 'V', Γ: 'G', Δ: 'D', Ε: 'E', Ζ: 'Z', Η: 'I', Θ: 'TH', Ι: 'I', Κ: 'K', Λ: 'L', Μ: 'M', Ν: 'N', Ξ: 'X', Ο: 'O', Π: 'P', Ρ: 'R', Σ: 'S', Τ: 'T', Υ: 'Y', Φ: 'F', Χ: 'CH', Ψ: 'PS', Ω: 'O' };
  let out = '';
  for (let i = 0; i < t.length; i++) {
    const c = t[i], n = t[i + 1] || '', start = !/[Α-Ω]/.test(t[i - 1] || ''), end = !/[Α-Ω]/.test(t[i + 2] || '');
    const two = c + n;
    if (two === 'ΟΥ') { out += 'OU'; i++; continue; }
    if ((two === 'ΑΥ' || two === 'ΕΥ')) { out += (c === 'Α' ? 'A' : 'E') + (VF.includes(t[i + 2] || '') ? 'V' : 'F'); i++; continue; }
    if (two === 'ΜΠ') { out += start || end ? 'B' : 'MP'; i++; continue; }
    if (two === 'ΝΤ') { out += start ? 'D' : 'NT'; i++; continue; }
    if (two === 'ΓΚ') { out += start ? 'G' : 'NK'; i++; continue; }
    if (two === 'ΓΓ') { out += 'NG'; i++; continue; }
    if (two === 'ΓΧ') { out += 'NCH'; i++; continue; }
    out += one[c] ?? c;
  }
  return out;
}

export const diplomaTemplate = () => db.all('letter_templates').find((t) => t.key === DIPLOMA_KEY) || null;
const layoutRaw = (t) => { let L = t && t.layout; if (typeof L === 'string') { try { L = JSON.parse(L); } catch { L = {}; } } return L && typeof L === 'object' ? L : {}; };
// Πλαίσια: προεπιλογές + αλλαγές του προτύπου
export function diplomaBoxes(t = diplomaTemplate()) {
  const over = layoutRaw(t).boxes || {};
  return Object.fromEntries(Object.entries(BOXES).map(([k, b]) => [k, { ...b, ...(over[k] || {}) }]));
}

db.migrate('diploma-template-2026-10', (tx) => {
  if (tx.all('letter_templates').some((t) => t.key === DIPLOMA_KEY)) return;
  tx.insert('letter_templates', { key: DIPLOMA_KEY, kind: 'diploma', name: 'ΔΙΠΛΩΜΑ ΔΙΔΑΣΚΑΛΟΥ ΤΕΚΤΟΝΟΣ', body: '', active: 1, layout: {} });
});

// Τιμές πεδίων από την καρτέλα του μέλους
export function diplomaValues(m) {
  const ls = lodgesByMember()[m.id] || [], l0 = ls[0] || {};
  const lodge = String(m.mm_lodge_name || l0.lodge_name || '').trim(), name = `${m.first_name || ''} ${m.surname || ''}`.replace(/\s+/g, ' ').trim();
  // Ημ. Εισδοχής: από την καρτέλα· αλλιώς η ημερομηνία μύησης στη Στοά (ιδιότητα «Τακτικό»), η παλαιότερη
  const eaLodge = ls.filter((l) => /τακτικ/i.test(String(l.capacity || l.member_status || '')) && isoOf(l.capacity_date)).map((l) => isoOf(l.capacity_date)).sort()[0] || '';
  return { name, name_en: greeklish(name), dno: String(m.diploma_no ?? '').trim(), ea: isoOf(m.date_ea) || eaLodge, mm: isoOf(m.date_mm) || '',
    issue: new Date().toISOString().slice(0, 10), lodge, lodge_en: greeklish(lodge), lodge_no: String(m.mm_lodge_name ? m.mm_lodge_number ?? '' : l0.lodge_number ?? '').trim() };
}
export function placeholderMap(v) {
  const ea = parts(v.ea), is = parts(v.issue), map = {
    Όνομα: v.name, NAME: v.name_en, 'Αρ. Διπλώματος': v.dno, Στοά: v.lodge, LODGE: v.lodge_en, 'Αρ. Στοάς': v.lodge_no,
    'Ημ. Εισδοχής': dmy(v.ea), 'Ημ. Εγέρσεως': dmy(v.mm), 'Ημ. Έκδοσης': dmy(v.issue),
    'Μέγας Γραμματεύς': db.setting('grand_secretary_name') || GS_NAME, 'Μέγας Διδάσκαλος': db.setting('grand_master_name') || '',
  };
  for (const [p, d] of [['ΕΙΣ', ea], ['ΕΚΔ', is]]) Object.assign(map, d ? { [`${p} ημέρα`]: String(d.d), [`${p} μήνας`]: MONTHS_GR[d.m - 1], [`${p} έτος`]: String(d.y), [`${p} Ε.Φ.`]: String(d.y + 4000),
    [`${p} day`]: ordinal(d.d), [`${p} month`]: MONTHS_EN[d.m - 1] } : { [`${p} ημέρα`]: '……', [`${p} μήνας`]: '……', [`${p} έτος`]: '……', [`${p} Ε.Φ.`]: '……', [`${p} day`]: '……', [`${p} month`]: '……' });
  return map;
}
const fill = (text, map) => String(text || '').replace(/\{([^{}]+)\}/g, (all, k) => (k in map ? (map[k] || '……') : all));
const textHtml = (text, map) => esc(fill(text, map)).split('\n').map((line) => `<div>${line.replace(/\*\*(.+?)\*\*/g, '<b class="dip-big">$1</b>') || '&nbsp;'}</div>`).join('');

export function diplomaSheet(v, boxes = diplomaBoxes(), { edit = false } = {}) {
  const map = placeholderMap(v);
  const box = (k, b) => {
    if (b.hidden && !edit) return '';
    const st = `left:${b.x}mm;top:${b.y}mm;width:${b.w}mm;height:${b.h}mm;${b.rot ? `transform:rotate(${b.rot}deg);` : ''}`;
    const inner = b.type === 'img' ? `<img src="${esc(b.src)}" alt="" style="object-fit:${b.contain ? 'contain' : 'fill'}">`
      : b.type === 'shape' ? '' : `<div class="dip-txt" style="font-family:${esc(b.font || SCRIPT)};font-size:${b.size}pt;text-align:${b.align || 'center'};${b.bold ? 'font-weight:700;' : ''}${b.color ? `color:${esc(b.color)};` : ''}">${textHtml(b.text, map)}</div>`;
    return `<div class="dip-box dip-${b.type}${b.shape ? ` dip-${b.shape}` : ''}${b.style ? ` dip-${b.style}` : ''}${b.fit ? ' dip-fit' : ''}${b.hidden ? ' dip-hidden' : ''}" data-box="${k}" style="${st}">${inner}${edit ? `<span class="dip-tag">${esc(b.label)}</span><span class="dip-rs" data-rs="${k}">◢</span>` : ''}</div>`;
  };
  return `<div class="dip-sheet${edit ? ' dip-edit' : ''}">${Object.entries(boxes).map(([k, b]) => box(k, b)).join('')}</div>`;
}
// Κείμενα που δεν χωρούν στο πλαίσιο: μικραίνουν (έως 60%)
export function fitDiploma(root) {
  for (const b of root.querySelectorAll('.dip-fit')) {
    const t = b.querySelector('.dip-txt');
    if (!t) continue;
    t.style.fontSize = ''; const base = parseFloat(getComputedStyle(t).fontSize);
    let f = base;
    while (t.scrollHeight > b.clientHeight + 1 && f > base * 0.6) { f *= 0.96; t.style.fontSize = f + 'px'; }
    b.classList.toggle('dip-shrunk', f < base);
  }
}
// Οθόνη: σμίκρυνση του A3 στο πλάτος της σελίδας (στην εκτύπωση πάντα 1:1)
export function zoomDiploma(view) {
  const s = view.querySelector('.dip-sheet'); if (!s) return 1;
  const z = Math.min(1, (view.clientWidth || 800) / (PAGE.w * 96 / 25.4));
  s.style.zoom = String(z);
  return z;
}
const PRINT_CSS = '<style>@media print{@page{size:297mm 420mm;margin:0}}</style>';

function issuePage({ query = {} }) {
  const m = query.id ? db.get('member_registry', Number(query.id)) : null, t = diplomaTemplate();
  const v = m ? diplomaValues(m) : null;
  return {
    title: 'Δίπλωμα Διδασκάλου Τέκτονος',
    html: `${PRINT_CSS}<div class="noprint"><p><a href="${m ? `#/members/${m.id}` : '#/members/diplomas'}">← Πίσω</a></p>
<h1>🎓 Δίπλωμα Διδασκάλου Τέκτονος ${m ? `<small class="muted">${esc(v.name)} ${esc(regCode(m) || '')}</small>` : ''}</h1>
<div class="card mc-find"><label>🔎 Μέλος του Μητρώου</label><input id="dipFind" placeholder="Επώνυμο, όνομα, MM/M αριθμός, email ή κινητό" autocomplete="off"></div>
${m ? `<div class="card"><h3 style="margin-top:0">Στοιχεία του Διπλώματος <small class="muted">από την καρτέλα του μέλους — διορθώστε αν χρειάζεται (δεν αλλάζει το Μητρώο)</small></h3>
<div class="grid dip-fields">${FIELDS.map(([k, label, type]) => `<label>${esc(label)}<input name="${k}" type="${type || 'text'}" value="${esc(v[k] || '')}"></label>`).join('')}</div>
${!v.dno ? '<p class="vwarn">⚠ Το μέλος δεν έχει αριθμό Διπλώματος στο Μητρώο.</p>' : ''}${!v.ea || !v.mm ? `<p class="vwarn">⚠ Λείπει στο Μητρώο η ${[!v.ea && 'Ημ. Εισδοχής (μύησης)', !v.mm && 'Ημ. Εγέρσεως (Διδάσκαλος)'].filter(Boolean).join(' και η ')} — <a href="#/members/${m.id}">συμπληρώστε την στην καρτέλα του μέλους</a> ώστε να έρχεται αυτόματα.</p>` : ''}
${String(m.date_ea || '').trim() && !/^\d{4}-\d{2}-\d{2}$/.test(isoOf(m.date_ea)) ? `<p class="vwarn">⚠ Η Ημ. Εισδοχής στο Μητρώο («${esc(m.date_ea)}») δεν είναι σε αναγνωρίσιμη μορφή.</p>` : ''}${String(m.date_mm || '').trim() && !/^\d{4}-\d{2}-\d{2}$/.test(isoOf(m.date_mm)) ? `<p class="vwarn">⚠ Η Ημ. Εγέρσεως στο Μητρώο («${esc(m.date_mm)}») δεν είναι σε αναγνωρίσιμη μορφή.</p>` : ''}
<div class="toolbar"><button type="button" class="btn primary" data-act="print">🖨 Εκτύπωση Διπλώματος (A3)</button>${t ? `<a class="btn" href="#/templates/${t.id}/diploma">🎨 Σχεδίαση / στοίχιση</a>` : ''}<a class="btn" href="#/members/${m.id}">Καρτέλα μέλους</a><a class="btn" href="#/members/diplomas?tab=protocol">📖 Πρωτόκολλο Διπλωμάτων</a></div>
<p class="muted">Εκτύπωση σε χαρτί A3 κατακόρυφα, κλίμακα 100%, χωρίς περιθώρια. Οι ημερομηνίες γράφονται σε ελληνικά και αγγλικά αυτόματα.</p></div>` : '<p class="muted">Αναζητήστε ένα μέλος για να εκδώσετε το Δίπλωμά του.</p>'}</div>
${m ? `<div class="print-area dip-view">${diplomaSheet(v)}</div>` : ''}`,
    mount(el) {
      attachPicker(el.querySelector('#dipFind'), (q) => memberItems(q), (mm) => go('/members/diploma', { id: mm.id }));
      if (!m) return;
      const view = el.querySelector('.dip-view');
      const redraw = (e) => {
        const auto = { name: 'name_en', lodge: 'lodge_en' }[e.target.name]; // τα λατινικά ακολουθούν τα ελληνικά
        if (auto) el.querySelector(`[name=${auto}]`).value = greeklish(e.target.value);
        for (const i of el.querySelectorAll('.dip-fields input')) v[i.name] = i.value;
        view.innerHTML = diplomaSheet(v); zoomDiploma(view); fitDiploma(view);
      };
      el.querySelector('.dip-fields').addEventListener('input', redraw);
      const ready = () => { zoomDiploma(view); fitDiploma(view); };
      ready(); document.fonts?.ready.then(ready); addEventListener('resize', ready);
      bind(el, { print: () => { const s = view.querySelector('.dip-sheet'); s.style.zoom = '1'; fitDiploma(view); printPaper(`Δίπλωμα ${v.dno ? 'MM' + v.dno + ' ' : ''}${v.name}`); setTimeout(ready, 1500); } });
    },
  };
}

// 🎨 Σχεδίαση Διπλώματος: επιλογή πλαισίου, σύρσιμο/μέγεθος στην προεπισκόπηση, τιμές σε mm, κείμενο και γραμματοσειρά
function designPage({ params, query = {} }) {
  const t = db.get('letter_templates', params.id);
  if (!t || t.kind !== 'diploma') return '<h1>Δεν βρέθηκε το πρότυπο Διπλώματος</h1>';
  const sampleM = query.id ? db.get('member_registry', Number(query.id)) : null;
  const sample = sampleM ? diplomaValues(sampleM) : { name: 'Γεώργιος Παπαδόπουλος', name_en: 'GEORGIOS PAPADOPOULOS', dno: '12345', ea: '2021-03-15', mm: '2022-06-20', issue: new Date().toISOString().slice(0, 10), lodge: 'ΑΡΜΟΝΙΑ', lodge_en: 'ARMONIA', lodge_no: '12' };
  const num = (f, label, step = 0.5) => `<label>${label}<input type="number" step="${step}" data-f="${f}"></label>`;
  return {
    title: 'Σχεδίαση Διπλώματος',
    html: `${PRINT_CSS}<div class="noprint"><p><a href="#/templates">← Πρότυπα</a> · <a href="#/members/diploma">🎓 Έκδοση Διπλώματος</a></p><h1>🎨 Σχεδίαση — ${esc(t.name)}</h1>
<p class="muted">Σελίδα A3 (297 × 420 mm), όπως το αρχικό αρχείο της Γραμματείας. Πατήστε ένα στοιχείο στην προεπισκόπηση (ή διαλέξτε το από τη λίστα), σύρετέ το για μετακίνηση και τη γωνία ◢ για μέγεθος — ή γράψτε τιμές σε mm. Ισχύει για κάθε Δίπλωμα που εκδίδεται.</p>
<div class="card mc-find"><label>🔎 Προεπισκόπηση με μέλος του Μητρώου</label><input id="dipFind" placeholder="${esc(sampleM ? sample.name : 'δείγμα: Γεώργιος Παπαδόπουλος')}" autocomplete="off"></div></div>
<div class="dz-split"><div class="dz-controls noprint"><div class="card"><label>Στοιχείο<select id="dipSel">${Object.entries(BOXES).map(([k, b]) => `<option value="${k}">${esc(b.label)}</option>`).join('')}</select></label>
<div class="dz-nums">${num('x', 'X (mm)')}${num('y', 'Y (mm)')}${num('w', 'Πλάτος (mm)')}${num('h', 'Ύψος (mm)')}${num('rot', 'Περιστροφή (°)', 1)}</div>
<div class="dz-nums" id="dipTxtNums">${num('size', 'Μέγεθος (pt)')}<label>Στοίχιση<select data-f="align"><option value="left">Αριστερά</option><option value="center">Κέντρο</option><option value="right">Δεξιά</option><option value="justify">Πλήρης</option></select></label>
<label class="chk"><input type="checkbox" data-f="bold"> Έντονα</label><label class="chk"><input type="checkbox" data-f="fit"> Σμίκρυνση αν δεν χωρά</label></div>
<label class="chk"><input type="checkbox" data-f="hidden"> Απόκρυψη στο έντυπο</label>
<div id="dipTxtBox"><label>Κείμενο <small class="muted">(νέα γραμμή = αλλαγή γραμμής · **…** = έντονα και μεγαλύτερα)</small><textarea data-f="text" rows="8"></textarea></label>
<details><summary>Πεδία {…} από το Μητρώο</summary><p class="muted">${PLACEHOLDERS.map(([k, d]) => `<code>{${esc(k)}}</code> ${esc(d)}`).join(' · ')}</p></details></div>
<div class="toolbar"><button type="button" class="btn small" data-act="resetOne">↺ Αρχική θέση στοιχείου</button><button type="button" class="btn small danger" data-act="resetAll">↺ Όλα στο αρχικό</button></div></div>
<div class="toolbar"><button class="btn primary" data-act="save">💾 Αποθήκευση σχεδίασης</button><button type="button" class="btn" data-act="print">🖨 Δοκιμαστική εκτύπωση</button><a class="btn" href="#/templates">Ακύρωση</a></div></div>
<div class="dz-page"><div class="print-area dip-view" id="dipView"></div></div></div>`,
    mount(el) {
      const L = layoutRaw(t), over = JSON.parse(JSON.stringify(L.boxes || {})), view = el.querySelector('#dipView'), sel = el.querySelector('#dipSel');
      const cur = () => ({ ...BOXES[sel.value], ...(over[sel.value] || {}) });
      const set = (k, f, val) => { over[k] = { ...(over[k] || {}), [f]: val }; };
      let zoom = 1;
      const draw = () => {
        view.innerHTML = diplomaSheet(sample, Object.fromEntries(Object.keys(BOXES).map((k) => [k, { ...BOXES[k], ...(over[k] || {}) }])), { edit: true });
        zoom = zoomDiploma(view); fitDiploma(view);
        view.querySelector(`[data-box="${sel.value}"]`)?.classList.add('dip-on');
      };
      const inputs = () => {
        const b = cur(), txt = b.type === 'text';
        el.querySelector('#dipTxtNums').hidden = !txt; el.querySelector('#dipTxtBox').hidden = !txt;
        for (const i of el.querySelectorAll('[data-f]')) {
          if (document.activeElement === i) continue;
          const val = b[i.dataset.f];
          if (i.type === 'checkbox') i.checked = !!val; else i.value = val ?? (i.dataset.f === 'rot' ? 0 : '');
        }
      };
      el.querySelector('.dz-controls').addEventListener('input', (e) => {
        const i = e.target.closest('[data-f]'); if (!i) return;
        const f = i.dataset.f, val = i.type === 'checkbox' ? i.checked : i.type === 'number' ? (i.value === '' ? 0 : Math.round(Number(i.value) * 10) / 10) : i.value;
        set(sel.value, f, val); draw();
      });
      sel.addEventListener('change', () => { inputs(); draw(); });
      // σύρσιμο / αλλαγή μεγέθους (px → mm με βάση τη σμίκρυνση)
      view.addEventListener('pointerdown', (e) => {
        const bx = e.target.closest('[data-box]'); if (!bx) return;
        const k = bx.dataset.box, rs = !!e.target.closest('[data-rs]');
        if (sel.value !== k) { sel.value = k; inputs(); view.querySelectorAll('.dip-on').forEach((x) => x.classList.remove('dip-on')); bx.classList.add('dip-on'); }
        const b0 = cur(), sx = e.clientX, sy = e.clientY, mm = 25.4 / 96 / zoom;
        e.preventDefault(); bx.setPointerCapture?.(e.pointerId);
        const move = (ev) => {
          const dx = (ev.clientX - sx) * mm, dy = (ev.clientY - sy) * mm, r = (n) => Math.round(n * 10) / 10;
          if (rs) Object.assign(over[k] = over[k] || {}, { w: r(Math.max(2, b0.w + dx)), h: r(Math.max(2, b0.h + dy)) });
          else Object.assign(over[k] = over[k] || {}, { x: r(b0.x + dx), y: r(b0.y + dy) });
          const b = cur(); Object.assign(bx.style, { left: b.x + 'mm', top: b.y + 'mm', width: b.w + 'mm', height: b.h + 'mm' });
          inputs();
        };
        const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); draw(); };
        addEventListener('pointermove', move); addEventListener('pointerup', up);
      });
      attachPicker(el.querySelector('#dipFind'), (q) => memberItems(q), (mm) => go(`/templates/${t.id}/diploma`, { id: mm.id }));
      bind(el, {
        resetOne() { delete over[sel.value]; inputs(); draw(); },
        resetAll() { if (!confirmDo('Επαναφορά όλων των στοιχείων στις θέσεις του αρχικού Διπλώματος;')) return; for (const k of Object.keys(over)) delete over[k]; inputs(); draw(); },
        async save() {
          const clean = Object.fromEntries(Object.entries(over).map(([k, o]) => [k, Object.fromEntries(Object.entries(o).filter(([f, val]) => String(val) !== String(BOXES[k][f] ?? (f === 'rot' ? 0 : f === 'bold' || f === 'fit' || f === 'hidden' ? false : ''))))]).filter(([, o]) => Object.keys(o).length));
          try { await db.save('Σχεδίαση Διπλώματος Διδασκάλου', (tx) => tx.update('letter_templates', t.id, { layout: { ...L, boxes: clean } })); flash('Η σχεδίαση του Διπλώματος αποθηκεύτηκε.'); go('/templates'); }
          catch (err) { toast(err.message || String(err), 'error'); }
        },
        print() { view.querySelector('.dip-sheet').style.zoom = '1'; view.querySelector('.dip-sheet').classList.remove('dip-edit'); fitDiploma(view); printPaper('Δίπλωμα — δοκιμή'); setTimeout(draw, 1500); },
      });
      inputs(); draw(); document.fonts?.ready.then(draw); addEventListener('resize', () => { zoom = zoomDiploma(view); });
    },
  };
}

export { issuePage as diplomaIssuePage };
module({ id: 'diploma', routes: { '/templates/:id/diploma': designPage } });
