// PDF από το επίσημο έντυπο (Επιστολή / Διάταγμα) μέσα στον browser — για αποθήκευση στο Drive χωρίς παράθυρο εκτύπωσης.
// Βιβλιοθήκες τοπικά: vendor/html2canvas.min.js, vendor/jspdf.umd.min.js (καμία εξωτερική υπηρεσία).
const loaded = {};
export function loadScript(rel) {
  return (loaded[rel] ||= new Promise((ok, bad) => {
    const s = Object.assign(document.createElement('script'), { src: new URL(rel, import.meta.url).href, onload: ok, onerror: () => bad(new Error('Δεν φορτώθηκε: ' + rel)) });
    document.head.appendChild(s);
  }));
}

// el: το στοιχείο .paper (A4) → Blob PDF μίας σελίδας Α4 (ό,τι ξεπερνά σμικρύνεται, όπως στην προεπισκόπηση)
export async function paperPdf(el, { title = '', author = '' } = {}) {
  await Promise.all([loadScript('../vendor/html2canvas.min.js'), loadScript('../vendor/jspdf.umd.min.js')]);
  await Promise.all([...el.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  const keep = { zoom: el.style.zoom, a4: el.classList.contains('a4') };
  el.style.zoom = '1'; el.classList.add('a4');
  let canvas;
  try { canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false }); }
  finally { el.style.zoom = keep.zoom; el.classList.toggle('a4', keep.a4); }
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, H = 297;
  pdf.setProperties({ title, author });
  const h = (canvas.height * W) / canvas.width; // ύψος σε mm με πλάτος σελίδας
  if (h <= H) pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, h);
  else { const w = (W * H) / h; pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', (W - w) / 2, 0, w, H); }
  return pdf.output('blob');
}
