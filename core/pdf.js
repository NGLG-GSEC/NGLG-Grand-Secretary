// PDF από το επίσημο έντυπο (Επιστολή / Διάταγμα) μέσα στον browser — για αποθήκευση στο Drive χωρίς παράθυρο εκτύπωσης.
// Βιβλιοθήκες τοπικά: vendor/html2canvas.min.js, vendor/jspdf.umd.min.js (καμία εξωτερική υπηρεσία).
const loaded = {};
export function loadScript(rel) {
  return (loaded[rel] ||= new Promise((ok, bad) => {
    const s = Object.assign(document.createElement('script'), { src: new URL(rel, import.meta.url).href, onload: ok, onerror: () => bad(new Error('Δεν φορτώθηκε: ' + rel)) });
    document.head.appendChild(s);
  }));
}

// el: το στοιχείο .paper (A4) → Blob PDF· μεγαλύτερα έντυπα σπάνε σε σελίδες A4
export async function paperPdf(el, { title = '', author = '' } = {}) {
  await Promise.all([loadScript('../vendor/html2canvas.min.js'), loadScript('../vendor/jspdf.umd.min.js')]);
  await Promise.all([...el.querySelectorAll('img')].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
  const canvas = await window.html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
  const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }), W = 210, H = 297, pageH = Math.floor(canvas.width * (H / W));
  pdf.setProperties({ title, author });
  // όχι κενή σελίδα για λίγα pixel που περισσεύουν (περιθώριο του εντύπου)
  const blank = (y) => { const h = Math.min(pageH, canvas.height - y); if (h < pageH * 0.04) return true; const d = canvas.getContext('2d').getImageData(0, y, canvas.width, h).data; for (let i = 0; i < d.length; i += 40) if (d[i] < 245 || d[i + 1] < 245 || d[i + 2] < 245) return false; return true; };
  for (let y = 0, first = true; y < canvas.height && (first || !blank(y)); y += pageH, first = false) {
    const part = document.createElement('canvas');
    part.width = canvas.width; part.height = Math.min(pageH, canvas.height - y);
    const g = part.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, part.width, part.height); g.drawImage(canvas, 0, -y);
    if (!first) pdf.addPage();
    pdf.addImage(part.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, W, (part.height * W) / part.width);
  }
  return pdf.output('blob');
}
