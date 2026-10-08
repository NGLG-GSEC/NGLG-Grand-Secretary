// Επίσημο έντυπο Α4 (θυρεός, τίτλοι, υπογραφή, σφραγίδα) για Επιστολές και Διατάγματα.
// Εκτύπωση ή αποθήκευση ως PDF γίνεται από τον browser (Εκτύπωση → «Αποθήκευση ως PDF»), με τέλεια ελληνικά.
import { db } from './store.js';
import { esc, fmtDate, linkify } from './util.js';

db.defaultSettings({
  organization_name: 'Εθνική Μεγάλη Στοά της Ελλάδος', founded_year: '1986', grand_master_title: 'Μέγας Διδάσκαλος',
  grand_master_name: 'Σεβτ. Αδ. Ιωάννης Μπενετάτος', grand_secretary_name: 'Πανσεβ. Αδ. Δημήτριος Σκιαδόπουλος',
  grand_secretary_title: 'Μέγας Γραμματέας', closing: 'Με αδελφικούς χαιρετισμούς,',
});

export const IMG = { emblem: 'img/header_emblem.png', seal: 'img/seal.png', signature: 'img/signature.png', nikolaos: 'img/signature_nikolaos.png', grandMaster: 'img/signature_grand_master.png' };

export function signerProfile(key) {
  if (key === 'nikolaos') return { key, name: 'Λίαν Σεβάσμιος Αδ. Νικόλαος Χατζηδημητρίου', title: 'Αν. Μέγας Γραμματέας', img: IMG.nikolaos };
  return { key: 'dimitrios', name: db.setting('grand_secretary_name'), title: db.setting('grand_secretary_title'), img: IMG.signature };
}

export function letterhead() {
  const s = (k) => esc(db.setting(k));
  return `<div class="head"><img src="${IMG.emblem}" alt=""><h1>${s('organization_name')}</h1><div class="gold">Έτος Ιδρύσεως ${s('founded_year')}</div>
<div>${s('grand_master_title')}</div><div>${s('grand_master_name')}</div><div class="rule"></div></div>`;
}

export function signatureBlock(signer) {
  const p = signerProfile(signer);
  return `<div class="sigrow"><div class="sign"><img class="signature-img" src="${p.img}" alt=""><div class="signature-line"></div>
<b>${esc(p.name)}</b><div class="gs-title">${esc(p.title)}</div>${esc(db.setting('organization_name'))}</div>
<div class="seal"><img class="seal-img" src="${IMG.seal}" alt=""></div></div>`;
}

export function letterPaper(x) {
  return `<article class="paper">${letterhead()}
<div class="meta"><div>Αρ. Πρωτ.: <b class="official-number">${esc(x.protocol_seq ? String(x.protocol_seq) : (x.protocol_no || 'θα δοθεί όταν οριστεί «Έτοιμη»'))}</b></div><div>Ημερομηνία: <b class="official-number">${esc(fmtDate(x.letter_date))}</b></div></div>
${x.recipient_name ? `<p><b>Προς:</b> ${esc(x.recipient_name)}</p>` : ''}<p><b>Θέμα:</b> ${esc(x.subject)}</p>
<div class="body">${linkify(x.body)}</div><p style="margin-top:10mm">${esc(x.closing || db.setting('closing'))}</p>${signatureBlock(x.signer)}</article>`;
}

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
  const later = () => { cancelAnimationFrame(t); t = requestAnimationFrame(() => fitPapers()); };
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
export function reportPaper(title, subtitle, inner, { signatures = false } = {}) {
  const sig = signatures ? `<div class="decsig"><div><div class="t">ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ</div><img class="signature-img" src="${IMG.signature}" alt=""><div class="signature-line"></div><b>Δημήτριος Σκιαδόπουλος</b></div>
<div><img class="seal-img" src="${IMG.seal}" alt=""></div><div><div class="t">Ο ΜΕΓΑΣ ΔΙΔΑΣΚΑΛΟΣ</div><img class="signature-img" src="${IMG.grandMaster}" alt=""><div class="signature-line"></div><b>Ιωάννης Μπενετάτος</b></div></div>` : '';
  return `<article class="paper report">${letterhead()}<div class="dec-title">${esc(title)}</div>${subtitle ? `<div class="dec-date">${esc(subtitle)}</div>` : ''}${inner}${sig}</article>`;
}
