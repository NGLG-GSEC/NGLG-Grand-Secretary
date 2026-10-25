// Επίσημο έντυπο Α4 (θυρεός, τίτλοι, υπογραφή, σφραγίδα) για Επιστολές και Διατάγματα.
// Εκτύπωση ή αποθήκευση ως PDF γίνεται από τον browser (Εκτύπωση → «Αποθήκευση ως PDF»), με τέλεια ελληνικά.
import { db } from './store.js';
import { esc, fmtDate, linkify } from './util.js';
import { richHtml } from './rich.js';

// Ενιαία αποφώνηση και υπογραφή του Μεγάλου Γραμματέα (παντού)
export const GS_CLOSING = 'Με αφοσίωση και εκτίμηση,', GS_NAME = 'Πσεβ. Αδ. Δημήτριος Σκιαδόπουλος', GS_TITLE = 'Μέγας Γραμματεύς';
export const gsSignatureText = () => `${GS_CLOSING}\n\n${db.setting('grand_secretary_name') || GS_NAME}\n${db.setting('grand_secretary_title') || GS_TITLE}`;

db.defaultSettings({
  organization_name: 'Εθνική Μεγάλη Στοά της Ελλάδος', founded_year: '1986', grand_master_title: 'Μέγας Διδάσκαλος',
  grand_master_name: 'Σεβτ. Αδ. Ιωάννης Μπενετάτος', grand_secretary_name: GS_NAME,
  grand_secretary_title: GS_TITLE, closing: GS_CLOSING,
});
// Ενιαίος χαιρετισμός και υπογραφή σε όλες τις Επιστολές, τα email και τις αναφορές της Μεγάλης Γραμματείας (όχι στα Διατάγματα)
db.migrate('unified-closing-signature-2026-10', (tx) => {
  tx.setting('closing', GS_CLOSING); tx.setting('grand_secretary_name', GS_NAME); tx.setting('grand_secretary_title', GS_TITLE);
  tx.setting('visits_signer_name', GS_NAME); tx.setting('visits_signer_title', GS_TITLE);
  for (const t of tx.all('letter_templates')) if (t.closing && t.closing !== GS_CLOSING) tx.update('letter_templates', t.id, { closing: GS_CLOSING });
});

export const IMG = { emblem: 'img/header_emblem.png', seal: 'img/seal.png', signature: 'img/signature.png', nikolaos: 'img/signature_nikolaos.png', grandMaster: 'img/signature_grand_master.png', hmeis: 'img/hmeis.png', diorizomen: 'img/diorizomen.png', aponemei: 'img/aponemei.png', evarestoumetha: 'img/evarestoumetha.png' };

export function signerProfile(key) {
  if (key === 'nikolaos') return { key, name: 'Λίαν Σεβάσμιος Αδ. Νικόλαος Χατζηδημητρίου', title: 'Αν. Μέγας Γραμματεύς', img: IMG.nikolaos };
  return { key: 'dimitrios', name: db.setting('grand_secretary_name'), title: db.setting('grand_secretary_title'), img: IMG.signature };
}

export function letterhead() {
  const s = (k) => esc(db.setting(k));
  return `<div class="head"><img src="${IMG.emblem}" alt=""><h1>${s('organization_name')}</h1><div class="gold">Έτος Ιδρύσεως ${s('founded_year')}</div>
<div>${s('grand_master_title')}</div><div>${s('grand_master_name')}</div><div class="rule"></div></div>`;
}

// Κεφαλίδα κειμένων που διαμορφώνεται στη «Σχεδίαση σελίδας» του προτύπου (builder):
// { on, emblem: true|false, emblem_w: mm, lines: [{ text, size (pt), bold, italic, color: 'navy'|'gold'|'black' }] }
export const HEAD_COLORS = { navy: '#1f355d', gold: '#b18a43', black: '#111111' };
export function defaultHead() {
  const s = (k) => String(db.setting(k) || '');
  return { on: true, emblem: true, emblem_w: 34, lines: [
    { text: s('organization_name'), size: 22, bold: true, color: 'navy' },
    { text: s('founded_year') ? `Έτος Ιδρύσεως ${s('founded_year')}` : '', size: 11, color: 'gold' },
    { text: s('grand_master_title'), size: 11, color: 'navy' },
    { text: s('grand_master_name'), size: 11, color: 'navy' },
  ].filter((l) => l.text) };
}
export const headOn = (h) => !!(h && h.on && Array.isArray(h.lines));
export function customHead(h) {
  const line = (l) => `<div class="hl" style="font-size:${Math.min(40, Math.max(6, +l.size || 11))}pt;font-weight:${l.bold ? 700 : 400};font-style:${l.italic ? 'italic' : 'normal'};color:${HEAD_COLORS[l.color] || HEAD_COLORS.navy}">${esc(l.text || '')}</div>`;
  return `<div class="head head-custom">${h.emblem !== false ? `<img src="${IMG.emblem}" alt="" style="width:${Math.min(80, Math.max(8, +h.emblem_w || 34))}mm">` : ''}${(h.lines || []).map(line).join('')}<div class="rule"></div></div>`;
}

export function signatureBlock(signer, protoImg = '') {
  const p = signerProfile(signer);
  return `<div class="sigrow"><div class="sign"><img class="signature-img" src="${p.img}" alt=""><div class="signature-line"></div>
<b>${esc(p.name)}</b><div class="gs-title">${esc(p.title)}</div>${esc(db.setting('organization_name'))}</div>
<div class="seal"><img class="seal-img" src="${IMG.seal}" alt=""></div></div>${protoImg ? `<div class="proto-stamp"><img class="proto-img" src="${esc(protoImg)}" alt=""></div>` : ''}`;
}
// «ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ» της επιστολής (π.χ. το εγκεκριμένο πρωτόκολλο-σφραγίδα): κάτω από τη σφραγίδα, στο κέντρο (~400×200)
export const protocolImage = (x) => (x && x.protocol_image) || '';

// Πεδία της ίδιας της επιστολής μέσα στο κείμενο: συμπληρώνονται στο έγγραφο (σελίδα, PDF, Word, email) μόλις η επιστολή
// πάρει αριθμό πρωτοκόλλου («Έτοιμη»)· μέχρι τότε μένουν ως {πεδίο}. Γράφονται π.χ. {Αρ. Πρωτ.} ή {Αρ. Πρωτ.: }.
export const LETTER_FIELDS = [['Αρ. Πρωτ.', 'ο αριθμός πρωτοκόλλου της επιστολής (μπαίνει όταν οριστεί «Έτοιμη»)'], ['Ημερομηνία επιστολής', 'η ημερομηνία της επιστολής (του πρωτοκόλλου), π.χ. 19/10/2026']];
const PROTO_RE = /\{\s*(?:αρ\.?\s*πρωτ(?:οκόλλου|\.)?|αριθμός\s+πρωτοκόλλου)\s*:?\s*\}/giu;
const LDATE_RE = /\{\s*ημερομηνία\s+(?:επιστολής|πρωτοκόλλου)\s*:?\s*\}/giu;
export const hasProtocolField = (text) => new RegExp(PROTO_RE.source, 'iu').test(String(text || ''));
export function letterFields(text, x) {
  const t = String(text || '');
  if (!x || !x.protocol_seq) return t;
  return t.replace(PROTO_RE, String(x.protocol_seq)).replace(LDATE_RE, fmtDate(x.letter_date) || '');
}

export function letterPaper(x) {
  return `<article class="paper">${letterhead()}
<div class="meta"><div>Αρ. Πρωτ.: <b class="official-number">${esc(x.protocol_seq ? String(x.protocol_seq) : (x.protocol_no || 'θα δοθεί όταν οριστεί «Έτοιμη»'))}</b></div><div>Ημερομηνία: <b class="official-number">${esc(fmtDate(x.letter_date))}</b></div></div>
${x.recipient_name ? `<p><b>Προς:</b> ${esc(x.recipient_name)}</p>` : ''}${x.cc_name ? `<p class="cc-line"><b>Κοιν.:</b> <span>${esc(x.cc_name).replace(/\n/g, '<br>')}</span></p>` : ''}<p><b>Θέμα:</b> ${esc(letterFields(x.subject, x))}</p>
<div class="body">${richHtml(letterFields(x.body, x))}</div><p style="margin-top:10mm">${esc(x.closing || db.setting('closing'))}</p>${signatureBlock(x.signer, protocolImage(x))}</article>`;
}

// Εικόνες αποθηκευμένες στα δεδομένα (π.χ. φόντο/κεφαλίδα προτύπου Διατάγματος): <img data-dfile="templates/…">
const dfileUrls = new Map();
const MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' };
export async function dfileUrl(path) {
  if (dfileUrls.has(path)) return dfileUrls.get(path);
  const bytes = await db.file(path);
  if (!bytes) return '';
  const u = URL.createObjectURL(new Blob([bytes], { type: MIME[String(path).split('.').pop().toLowerCase()] || 'application/octet-stream' }));
  dfileUrls.set(path, u);
  return u;
}
export async function resolveFileImages(root = document) {
  await Promise.all([...root.querySelectorAll('img[data-dfile]:not([src])')].map(async (img) => {
    const u = await dfileUrl(img.dataset.dfile);
    if (u) { img.src = u; await img.decode().catch(() => {}); }
  }));
}
// Στρώσεις σελίδας από τη «Σχεδίαση σελίδας» ενός προτύπου: φόντο και κεφαλίδα σε θέση/διαστάσεις mm πάνω στο Α4.
// layout = { bg: { file, x, y, w, h, opacity }, header: { file, x, y, w, h } } · urls: προσωρινά src (πριν την αποθήκευση)
export function pageLayers(layout = {}, urls = {}) {
  const img = (k, cls, extra = '') => {
    const L = layout[k];
    if (!L || !(L.file || urls[k])) return '';
    const src = urls[k] ? ` src="${esc(urls[k])}"` : ` data-dfile="${esc(L.file)}"`;
    return `<img class="${cls}" data-layer="${k}" alt=""${src} style="left:${+L.x || 0}mm;top:${+L.y || 0}mm;width:${+L.w || 210}mm;height:${+L.h || 297}mm;${extra}">`;
  };
  return img('bg', 'layer layer-bg', `opacity:${layout.bg && layout.bg.opacity != null ? +layout.bg.opacity : 1}`) + img('header', 'layer layer-header');
}
// Περιθώριο κειμένου κάτω από την κεφαλίδα-εικόνα
export const layoutTop = (layout = {}, urls = {}) => { const h = layout.header; return h && (h.file || urls.header) ? +((+h.y || 0) + (+h.h || 0) + 4).toFixed(1) : null; };

// Μία σελίδα Α4: Επιστολή/Διάταγμα που ξεπερνά τη σελίδα σμικρύνεται ομοιόμορφα (ίδια διάταξη, ίδιες αλλαγές γραμμής)
// ώστε οθόνη, εκτύπωση και PDF να δείχνουν πάντα το ίδιο ένα φύλλο. Οι αναφορές (.report) μένουν πολυσέλιδες.
const A4_PX = (293 * 96) / 25.4; // ύψος Α4 με μικρό περιθώριο ασφαλείας
const DOC = '.paper:not(.report)';
export function fitPaper(p, a4 = false) {
  if (!p || p.classList.contains('report')) return 1;
  p.style.zoom = '1'; p.classList.toggle('a4', a4);
  const mh = p.style.minHeight; p.style.minHeight = '0';
  const h = p.scrollHeight; p.style.minHeight = mh;
  const s = h ? Math.min(1, A4_PX / h) : 1;
  p.style.zoom = '';
  const base = parseFloat(getComputedStyle(p).zoom) || 1; // π.χ. ζωντανή προεπισκόπηση σε σμίκρυνση
  p.style.zoom = String(+(base * s).toFixed(4));
  p.dataset.fit = String(+s.toFixed(4));
  return s;
}
const screenA4 = (p) => window.innerWidth >= 800 || !!p.closest('.dec-live');
export function fitPapers(root = document, print = false) {
  for (const p of root.querySelectorAll(DOC)) {
    if (print || screenA4(p)) fitPaper(p, print);
    else { p.classList.remove('a4'); p.style.zoom = ''; delete p.dataset.fit; }
  }
}
if (typeof document !== 'undefined') {
  let t = 0;
  const later = () => { cancelAnimationFrame(t); t = requestAnimationFrame(() => { fitPapers(); resolveFileImages().then(() => fitPapers()); }); };
  new MutationObserver((ms) => { if (ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && (n.matches(DOC) || n.querySelector?.(DOC))))) later(); })
    .observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('load', (e) => { if (e.target.tagName === 'IMG' && e.target.closest(DOC)) later(); }, true);
  addEventListener('resize', later);
  addEventListener('beforeprint', () => fitPapers(document, true));
  addEventListener('afterprint', () => fitPapers());
}

// Εκτύπωση: ο τίτλος της σελίδας γίνεται το όνομα του αρχείου PDF.
export function printPaper(fileName) {
  const old = document.title;
  document.title = fileName;
  const restore = () => { document.title = old; window.removeEventListener('afterprint', restore); };
  window.addEventListener('afterprint', restore);
  setTimeout(() => window.print(), 50);
}

// Αναφορά/τεύχος πολλών σελίδων (π.χ. Επετηρίδα, αναφορές) με επίσημη κεφαλίδα.
// Η ίδια αναφορά στα Αγγλικά (κεφαλίδα στα Αγγλικά· τα ελληνικά ονόματα με λατινικούς χαρακτήρες από τον καλούντα)
export function reportPaperEn(title, subtitle, inner, { grandMaster = '' } = {}) {
  const head = `<div class="head"><img src="${IMG.emblem}" alt=""><h1>National Grand Lodge of Greece</h1><div class="gold">Founded ${esc(db.setting('founded_year'))}</div>
<div>Grand Master</div><div>${esc(grandMaster)}</div><div class="rule"></div></div>`;
  return `<article class="paper report" lang="en">${head}<div class="dec-title">${esc(title)}</div>${subtitle ? `<div class="dec-date">${esc(subtitle)}</div>` : ''}${inner}</article>`;
}

export function reportPaper(title, subtitle, inner, { signatures = false } = {}) {
  const sig = signatures ? `<div class="decsig"><div><div class="t">ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ</div><img class="signature-img" src="${IMG.signature}" alt=""><div class="signature-line"></div><b>Δημήτριος Σκιαδόπουλος</b></div>
<div><img class="seal-img" src="${IMG.seal}" alt=""></div><div><div class="t">Ο ΜΕΓΑΣ ΔΙΔΑΣΚΑΛΟΣ</div><img class="signature-img" src="${IMG.grandMaster}" alt=""><div class="signature-line"></div><b>Ιωάννης Μπενετάτος</b></div></div>` : '';
  return `<article class="paper report">${letterhead()}<div class="dec-title">${esc(title)}</div>${subtitle ? `<div class="dec-date">${esc(subtitle)}</div>` : ''}${inner}${sig}</article>`;
}
