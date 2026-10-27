// «ΕΙΔΙΚΟ ΣΗΜΑ ΕΓΚΡΙΣΗΣ ΕΣΩΤ. ΚΑΝΟΝΙΣΜΟΥ»: η εφαρμογή «Έγκριση Εσωτερικού Κανονισμού» μέσα στις Επιστολές.
// Συνθέτει την εικόνα (πλαίσιο, «ΕΓΚΡΙΣΗ ΕΣΩΤΕΡΙΚΟΥ ΚΑΝΟΝΙΣΜΟΥ με ΑΡ.ΠΡΩΤ», Στοά, ημερομηνία, υπογραφή Μ. Γραμματέα, σφραγίδα)
// που μπαίνει ως «ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ» στην επιστολή ή αποθηκεύεται ως JPEG. Οι Στοές 52, 62, 88 και 109 εξαιρούνται.
import { esc, download } from '../core/util.js';
import { db } from '../core/store.js';

export const APPROVAL_LODGES = [{"number":"1","name":"ΠΑΛΑΙΩΝ ΠΑΤΡΩΝ ΓΕΡΜΑΝΟΣ","administration":"ΕπΜΣτ.","province":"ΠΕΛ & Δ ΕΛΛΑΔΟΣ","seat":"Πάτρα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"2","name":"ΑΚΡΟΠΟΛΙΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"3","name":"ΠΑΡΘΕΝΩΝ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΑΓΓΛΟΦΩΝΗ"},{"number":"4","name":"ΜΙΑΟΥΛΗΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"5","name":"ΠΙΣΤΙΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"6","name":"ΟΜΟΝΟΙΑ ΣΤΟΑ ΜΕΓΑΛΟΥ ΔΙΔΑΣΚΑΛΟΥ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΕΙΔΙΚΗ"},{"number":"8","name":"ΗΛΙΟΤΡΟΠΙΟΝ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"9","name":"ΙΣΙΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΕΡΕΥΝΗΤΙΚΗ"},{"number":"10","name":"ΗΡΑΚΛΕΙΤΟΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"11","name":"ΑΘΗΝΑ ΣΟΦΙΑ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"12","name":"ΗΡΑΚΛΗΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"13","name":"GARIBALDI","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΙΤΑΛΟΦΩΝΗ"},{"number":"15","name":"ΕΜΠΕΔΟΚΛΗΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"16","name":"ΕΝΩΣΙΣ ΛΕΥΚΑΔΟΣ","administration":"ΕπΜΣτ.","province":"ΙΟΝΙΩΝ ΝΗΣΩΝ","seat":"Λευκάδα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"17","name":"ΑΝΑΓΕΝΝΗΣΙΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"18","name":"ΕΓΚΑΤΕΣΤΗΜΕΝΩΝ ΣΕΒΑΣΜΙΩΝ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΕΙΔΙΚΗ"},{"number":"19","name":"ΤΡΙΠΤΟΛΕΜΟΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"21","name":"ΑΤΤΙΚΟΣ ΑΣΤΗΡ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"23","name":"ΠΥΘΑΓΟΡΑΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"24","name":"ΦΙΛΙΚΗ ΕΤΑΙΡΕΙΑ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"26","name":"ΜΕΓΑΣ ΑΛΕΞΑΝΔΡΟΣ","administration":"ΕπΜΣτ.","province":"ΚΕΝΤΡΙΚΗΣ & ΒΟΡΕΙΟΥ ΕΛΛΑΔΟΣ","seat":"Καβάλας","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"28","name":"ΚΑΜΕΙΡΟΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Ρόδος","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"29","name":"ΚΑΣΣΑΝΔΡΟΣ","administration":"ΕπΜΣτ.","province":"ΚΕΝΤΡΙΚΗΣ & ΒΟΡΕΙΟΥ ΕΛΛΑΔΟΣ","seat":"Θεσσαλονίκη","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"30","name":"ΘΕΣΣΑΛΟΝΙΚΗ","administration":"ΕπΜΣτ.","province":"ΚΕΝΤΡΙΚΗΣ & ΒΟΡΕΙΟΥ ΕΛΛΑΔΟΣ","seat":"Θεσσαλονίκη","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"31","name":"ΣΩΚΡΑΤΗΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΓΕΡΜΑΝΟΦΩΝΗ"},{"number":"32","name":"ΔΙΩΝΗ","administration":"ΕπΜΣτ.","province":"ΠΕΛ & Δ ΕΛΛΑΔΟΣ","seat":"Ιωάννινα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"33","name":"ΠΟΣΕΙΔΩΝΙΑ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΕΡΕΥΝΗΤΙΚΗ"},{"number":"36","name":"ΔΕΙΝΟΚΡΑΤΗΣ","administration":"ΕπΜΣτ.","province":"ΚΕΝΤΡΙΚΗΣ & ΒΟΡΕΙΟΥ ΕΛΛΑΔΟΣ","seat":"Θεσσαλονίκη","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"39","name":"ΙΠΠΟΚΡΑΤΗΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΕΙΔΙΚΗ"},{"number":"42","name":"ΑΔΑΜΑΝΤΙΟΣ ΚΟΡΑΗΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"44","name":"ΒΥΖΑΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"48","name":"ΑΡΗΤΗ","administration":"ΕπΜΣτ.","province":"ΙΟΝΙΩΝ ΝΗΣΩΝ","seat":"Κέρκυρα","kind":"ΕΙΔΙΚΗ"},{"number":"50","name":"ΔΑΙΔΑΛΟΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Κρήτη","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"53","name":"BENEFICENZA","administration":"ΕπΜΣτ.","province":"ΙΟΝΙΩΝ ΝΗΣΩΝ","seat":"Κέρκυρα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"54","name":"ΑΡΓΩ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"55","name":"ΕΝΩΣΙΣ(ΚΥΠΡΟΣ)","administration":"ΠΜΣτ.","province":"ΚΥΠΡΟΥ","seat":"Λευκωσία","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"58","name":"LA FRANCE","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΓΑΛΛΟΦΩΝΗ"},{"number":"59","name":"ΟΜΗΡΟΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"60","name":"ΔΗΜΗΤΡΑ","administration":"ΕπΜΣτ.","province":"ΚΕΝΤΡΙΚΗΣ & ΒΟΡΕΙΟΥ ΕΛΛΑΔΟΣ","seat":"Λάρισας","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"61","name":"ΑΝΤΩΝΙΟΣ ΜΠΕΝΑΚΗΣ","administration":"ΕπΜΣτ.","province":"ΙΟΝΙΩΝ ΝΗΣΩΝ","seat":"Κέρκυρα","kind":"ΕΙΔΙΚΗ"},{"number":"64","name":"ΦΙΛΕΛΛΗΝΩΝ","administration":"ΠΜΣτ.","province":"ΚΥΠΡΟΥ","seat":"Λευκωσία","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"66","name":"ΠΥΘΑΓΟΡΑΣ","administration":"ΕπΜΣτ.","province":"ΙΟΝΙΩΝ ΝΗΣΩΝ","seat":"Κέρκυρα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"67","name":"ΕΛΛΗΝΟΓΛΩΣΣΟΝ ΞΕΝΟΔΟΧΕΙΟΝ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"69","name":"ΑΝΤΙΠΛΟΙΑΡΧΟΣ ΒΛΑΧΑΚΟΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"70","name":"ΠΛΑΤΩΝ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΕΡΕΥΝΗΤΙΚΗ"},{"number":"71","name":"ΛΗΔΡΑ","administration":"ΠΜΣτ.","province":"ΚΥΠΡΟΥ","seat":"Λευκωσία","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"74","name":"ΜΕΓΑΛΩΝ ΕΠΙΜΕΛΗΤΩΝ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΕΙΔΙΚΗ"},{"number":"76","name":"ΛΟΡΔΟΣ ΒΥΡΩΝ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"78","name":"ΑΘΗΝΑ ΣΤΑΘΜΙΑ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"80","name":"ΑΠΟΛΛΩΝΙΟΣ Ο ΡΟΔΙΟΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Ρόδος","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"84","name":"ΚΥΠΡΑΙΩΝ ΗΡΩΩΝ","administration":"ΠΜΣτ.","province":"ΚΥΠΡΟΥ","seat":"Λευκωσία","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"85","name":"RUDYARD KIPLING","administration":"ΕπΜΣτ.","province":"ΙΟΝΙΩΝ ΝΗΣΩΝ","seat":"Κέρκυρα","kind":"ΑΓΓΛΟΦΩΝΗ"},{"number":"86","name":"FRATELLI BANDIERA","administration":"ΕπΜΣτ.","province":"ΙΟΝΙΩΝ ΝΗΣΩΝ","seat":"Κέρκυρα","kind":"ΙΤΑΛΟΦΩΝΗ"},{"number":"89","name":"ΛΟΓΟΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"90","name":"ΑΘΑΝΑΣΙΟΣ ΛΕΥΚΑΔΙΤΗΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΕΙΔΙΚΗ"},{"number":"91","name":"ΕΛΛΗΝΩΝ ΗΡΩΩΝ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Λαμία","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"92","name":"ΙΩΑΝΝΗΣ ΚΑΠΟΔΙΣΤΡΙΑΣ","administration":"ΕπΜΣτ.","province":"ΙΟΝΙΩΝ ΝΗΣΩΝ","seat":"Κέρκυρα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"93","name":"ΦΙΛΟΓΕΝΕΙΑ","administration":"ΕπΜΣτ.","province":"ΙΟΝΙΩΝ ΝΗΣΩΝ","seat":"Κέρκυρα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"94","name":"ΔΙΟΝΥΣΙΟΣ ΡΩΜΑΣ","administration":"ΕπΜΣτ.","province":"ΙΟΝΙΩΝ ΝΗΣΩΝ","seat":"Κέρκυρα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"95","name":"LA ΡAIX","administration":"ΕπΜΣτ.","province":"ΙΟΝΙΩΝ ΝΗΣΩΝ","seat":"Κέρκυρα","kind":"ΓΑΛΛΟΦΩΝΗ"},{"number":"96","name":"ΘΕΜΙΣΤΟΚΛΗΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"97","name":"ΙΣΟΤΗΣ 1882","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"98","name":"ΔΩΔΩΝΗ","administration":"ΕπΜΣτ.","province":"ΠΕΛ & Δ ΕΛΛΑΔΟΣ","seat":"Ιωάννινα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"99","name":"ΚΑΘΗΚΟΝ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"100","name":"ΑΚΑΚΙΑ","administration":"ΕπΜΣτ.","province":"ΠΕΛ & Δ ΕΛΛΑΔΟΣ","seat":"Καλαματα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"101","name":"ΑΛΕΞΑΝΔΡΟΣ ΡΩΜΑΣ","administration":"ΕπΜΣτ.","province":"ΠΕΛ & Δ ΕΛΛΑΔΟΣ","seat":"Ζάκυνθος","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"102","name":"ΦΕΡΔΙΝΑΝΔΟΣ ΦΟΝ ΜΠΡΑΟΥΝΣΒΑΪΚ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"103","name":"ΠΛΑΤΩΝ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"104","name":"ΑΚΡΟΠΟΛΙΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"105","name":"ΠΡΟΜΗΘΕΥΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"106","name":"ΜΑΚΕΔΩΝ","administration":"ΕπΜΣτ.","province":"ΚΕΝΤΡΙΚΗΣ & ΒΟΡΕΙΟΥ ΕΛΛΑΔΟΣ","seat":"Θεσσαλονίκη","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"107","name":"ΑΤΛΑΝΤΙΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Σαντορίνη","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"108","name":"ΕΥΡΩΠΗ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"110","name":"ΜΥΚΟΝΟΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Μυκονος","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"111","name":"ΣΠΥΡΙΔΩΝ ΝΑΓΟΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"112","name":"ΗΦΑΙΣΤΙΑ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΕΡΕΥΝΗΤΙΚΗ"},{"number":"113","name":"ΔΗΜΗΤΗΡ 123","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Πειραιάς","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"114","name":"ΓΕΩΡΓΙΟΣ ΣΟΥΡΗΣ","administration":"ΕπΜΣτ.","province":"ΠΕΙΡΑΙΩΣ & ΑΡΧΙΠΕΛΑΓΟΥΣ ΑΙΓΑΙΟΥ","seat":"Συρος","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"115","name":"ΟΡΦΕΥΣ","administration":"ΕπΜΣτ.","province":"ΚΕΝΤΡΙΚΗΣ & ΒΟΡΕΙΟΥ ΕΛΛΑΔΟΣ","seat":"Κομοτηνή","kind":"ΚΑΝΟΝΙΚΗ"},{"number":"116","name":"ΕΥΣΤΑΘΙΟΣ ΛΙΑΚΟΠΟΥΛΟΣ","administration":"ΕπΜΣτ.","province":"ΑΘΗΝΩΝ","seat":"Αθήνα","kind":"ΕΙΔΙΚΗ"},{"number":"117","name":"ΣΠΥΡΟΣ ΣΑΜΑΡΑΣ","administration":"ΕπΜΣτ.","province":"ΙΟΝΙΩΝ ΝΗΣΩΝ","seat":"Κέρκυρα","kind":"ΕΙΔΙΚΗ"}];
export const APPROVAL_DRIVE = 'https://drive.google.com/drive/folders/1kKR7v86jjs5QJE9-K5uUebvS6nZd9J03?usp=sharing';
const BLUE = '#1e4b91', W = 1400, H = 730;
const IMGS = { signature: new URL('../img/approval-signature.jpg', import.meta.url).href, seal: new URL('../img/approval-seal.png', import.meta.url).href };
const loadImg = (src) => new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
let imgs = null;
const images = async () => (imgs ||= Promise.all([loadImg(IMGS.signature), loadImg(IMGS.seal)]).then(([signature, seal]) => ({ signature, seal })));

const normalizeText = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleUpperCase('el-GR');
const EXCLUDED = ['52', '62', '88', '109'];
// Ενιαίος κατάλογος: οι Στοές του σήματος + όσες ενεργές Στοές του καταλόγου της εφαρμογής λείπουν (π.χ. νέα 118 ΑΤΛΑΣ)·
// ΕπΜΣτ. και έδρα με τη γραφή του σήματος, από άλλη Στοά της ίδιας ΕπΜΣτ./Ανατολής
export function approvalLodges() {
  const all = db.all('lodges'), byNo = new Map(all.map((l) => [String(l.number), l])), have = new Set(APPROVAL_LODGES.map((l) => l.number));
  const prov = new Map(), seat = new Map();
  for (const a of APPROVAL_LODGES) { const l = byNo.get(a.number); if (!l) continue; if (l.provincial && !prov.has(l.provincial)) prov.set(l.provincial, a); if (l.orient && !seat.has(l.orient)) seat.set(l.orient, a.seat); }
  const extra = all.filter((l) => /^\d+$/.test(String(l.number)) && !have.has(String(l.number)) && !EXCLUDED.includes(String(l.number)) && (l.status || 'Ενεργή') !== 'Ανενεργή').map((l) => {
    const p = prov.get(l.provincial), m = /^(\S+)\s+(.*)$/.exec(String(l.provincial || ''));
    return { number: String(l.number), name: String(l.name || '').toUpperCase(), administration: p ? p.administration : m ? m[1] : '', province: p ? p.province : m ? m[2].toUpperCase() : '', seat: seat.get(l.orient) || l.orient || '', kind: String(l.kind || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase() };
  });
  return [...APPROVAL_LODGES, ...extra].sort((a, b) => Number(a.number) - Number(b.number));
}
export const approvalLodge = (n) => approvalLodges().find((l) => l.number === String(n || '').trim()) || null;
const prettyDate = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso || '') ? iso.split('-').reverse().join('/') : '—');
const safeFilePart = (s) => String(s).trim().replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/\s+/g, '_').slice(0, 90);
export const approvalFileName = (protocol, iso) => { const n = safeFilePart(protocol || ''); return n && iso ? `ΑρΠρωτοκόλλου_${n}_${iso.split('-').reverse().join('-')}.jpeg` : ''; };

function fitFont(ctx, text, width, size, weight = 700, min = 14) {
  while (size > min) { ctx.font = `${weight} ${size}px Arial, sans-serif`; if (ctx.measureText(text).width <= width) break; size -= 1; }
  ctx.font = `${weight} ${size}px Arial, sans-serif`;
  return size;
}
function wrappedWords(ctx, text, width, font) {
  ctx.font = font;
  const lines = []; let line = '';
  for (const word of text.split(/\s+/)) { const trial = line ? line + ' ' + word : word; if (line && ctx.measureText(trial).width > width) { lines.push(line); line = word; } else line = trial; }
  if (line) lines.push(line);
  return lines;
}
// Σχεδίαση της εικόνας (1400×730), όπως στην αρχική εφαρμογή
export function drawApproval(canvas, { protocol = '', date = '', lodge = null }, { signature, seal } = {}) {
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = BLUE; ctx.lineWidth = 4; ctx.strokeRect(42, 40, 1316, 650); ctx.lineWidth = 1.5; ctx.strokeRect(57, 55, 1286, 620);
  ctx.fillStyle = BLUE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const title = 'ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ';
  ctx.font = `800 ${fitFont(ctx, title, 1160, 42, 800, 29)}px Arial, sans-serif`; ctx.fillText(title, 700, 102);
  const approval = `ΕΓΚΡΙΣΗ ΕΣΩΤΕΡΙΚΟΥ ΚΑΝΟΝΙΣΜΟΥ με ΑΡ.ΠΡΩΤ: ${String(protocol).trim() || '—'}`;
  ctx.font = `800 ${fitFont(ctx, approval, 1190, 30, 800, 18)}px Arial, sans-serif`; ctx.fillText(approval, 700, 153);
  const l = lodge;
  const description = l ? `ΓΙΑ ΤΗΝ Σ. Στ. ${l.name}  ΥΠ. ΑΡΙΘΜ. ${l.number} στην ${l.administration} ${l.province} με έδρα ${l.seat} - ${l.kind}`
    : 'ΓΙΑ ΤΗΝ Σ. Στ. [ΣΤΟΑ]  ΥΠ. ΑΡΙΘΜ. [ΑΡΙΘΜΟΣ] στην [Επ/περ] [ΠΕΡΙΟΧΗ ΕΠΑΡΧΙΑ] με έδρα [ΕΔΡΑ] - [ΕΙΔΟΣ]';
  const descriptionFont = '700 24px Arial, sans-serif', maxWidth = 1190;
  ctx.font = descriptionFont;
  let lines;
  if (ctx.measureText(description).width <= maxWidth) lines = [description];
  else { // το πιο ισορροπημένο σημείο διαχωρισμού χωρίς να κοπεί λέξη
    const words = description.split(/\s+/); let best = null;
    for (let split = 1; split < words.length; split++) {
      const a = words.slice(0, split).join(' '), b = words.slice(split).join(' '), wa = ctx.measureText(a).width, wb = ctx.measureText(b).width;
      if (wa > maxWidth || wb > maxWidth) continue;
      const score = Math.max(wa, wb) + Math.abs(wa - wb) * 0.15;
      if (!best || score < best.score) best = { a, b, score };
    }
    lines = best ? [best.a, best.b] : wrappedWords(ctx, description, maxWidth, descriptionFont);
  }
  const ys = lines.length === 1 ? [223] : [211, 246];
  lines.forEach((t, i) => { ctx.font = descriptionFont; ctx.fillText(t, 700, ys[i] ?? (246 + 35 * (i - 1)), maxWidth); });
  ctx.strokeStyle = BLUE; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(105, 295); ctx.lineTo(1295, 295); ctx.stroke();
  ctx.fillStyle = BLUE; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.font = '700 30px Arial, sans-serif';
  ctx.fillText(`Αθήνα, ${prettyDate(date)}`, 122, 359);
  if (seal) ctx.drawImage(seal, 1040, 344, 250, 250);
  if (signature) {
    const w = 385, h = (w * signature.naturalHeight) / signature.naturalWidth, x = 440, y = 356;
    ctx.drawImage(signature, x, y, w, h);
    ctx.fillStyle = BLUE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 24px Arial, sans-serif'; ctx.fillText('ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ', x + w / 2, y + h + 29);
    ctx.font = '700 22px Arial, sans-serif'; ctx.fillText('Πσεβ. Αδ. Δημήτριος Σκιαδόπουλος', x + w / 2, y + h + 59);
  }
  return canvas;
}

// Παράθυρο της εφαρμογής: στοιχεία έγκρισης → προεπισκόπηση → «Χρήση στην επιστολή» (PNG data URL) ή «Αποθήκευση JPEG».
// → Promise<string|null>
export function openApprovalStamp({ protocol = '', date = '', lodge = '' } = {}) {
  return new Promise((done) => {
    const ov = Object.assign(document.createElement('div'), { className: 'gprev approval-app' });
    ov.innerHTML = `<div class="gprev-box" role="dialog" aria-label="Ειδικό σήμα έγκρισης εσωτερικού κανονισμού"><div class="gprev-bar"><b>🏛 ΕΙΔΙΚΟ ΣΗΜΑ ΕΓΚΡΙΣΗΣ ΕΣΩΤ. ΚΑΝΟΝΙΣΜΟΥ</b><button type="button" class="btn small" data-no>✕</button></div>
<div class="grid"><div><label>Αριθμός πρωτοκόλλου έγκρισης</label><input data-k="protocol" value="${esc(protocol)}" maxlength="75" autocomplete="off" placeholder="π.χ. 20562"><small class="muted">Εμφανίζεται δίπλα στην ένδειξη «ΑΡ.ΠΡΩΤ».</small></div>
<div><label>Ημερομηνία</label><input data-k="date" type="date" value="${esc(date)}"><small class="muted">Στην εικόνα: «Αθήνα, ΗΗ/ΜΜ/ΕΕΕΕ».</small></div>
<div class="full"><label>Αναζήτηση Στοάς</label><input data-k="search" type="search" placeholder="όνομα, αριθμός, περιοχή ή έδρα" autocomplete="off"></div>
<div class="full"><label>Επιλογή Στοάς</label><select data-k="lodge"></select><small class="muted">Οι Στοές 52, 62, 88 και 109 εξαιρούνται.</small></div>
<div class="full"><div class="approval-detail muted"></div></div></div>
<canvas class="approval-canvas" width="${W}" height="${H}" role="img" aria-label="Προεπισκόπηση του ειδικού σήματος"></canvas>
<p class="approval-state muted"></p>
<div class="toolbar"><button type="button" class="btn primary" data-use>✓ Χρήση στην επιστολή (ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ)</button><button type="button" class="btn" data-jpeg>⬇ Αποθήκευση JPEG</button>
<a class="btn" href="${APPROVAL_DRIVE}" target="_blank" rel="noopener noreferrer">ΕΞΕΡΧΟΜΕΝΟ ΠΡΩΤΟΚΟΛΛΟ ↗</a><button type="button" class="btn" data-no>Άκυρο</button></div></div>`;
    const $ = (k) => ov.querySelector(`[data-k="${k}"]`), canvas = ov.querySelector('canvas'), detail = ov.querySelector('.approval-detail'), st = ov.querySelector('.approval-state');
    let im = {};
    const options = () => {
      const keep = $('lodge').value || String(lodge || ''), q = normalizeText($('search').value.trim());
      $('lodge').innerHTML = '<option value="">— Επιλέξτε Στοά —</option>' + approvalLodges().filter((l) => !q || l.number === keep || normalizeText(`${l.number} ${l.name} ${l.province} ${l.seat} ${l.kind}`).includes(q))
        .map((l) => `<option value="${esc(l.number)}">Αρ. ${esc(l.number)} — ${esc(l.name)} (${esc(l.seat)})</option>`).join('');
      $('lodge').value = keep; if ($('lodge').selectedIndex < 0) $('lodge').value = '';
    };
    const cur = () => ({ protocol: $('protocol').value, date: $('date').value, lodge: approvalLodge($('lodge').value) });
    const render = () => {
      const c = cur();
      detail.textContent = c.lodge ? `Σ. Στ. ${c.lodge.name} · ΥΠ. ΑΡΙΘΜ. ${c.lodge.number} · ${c.lodge.administration} ${c.lodge.province} · Έδρα: ${c.lodge.seat} · Είδος: ${c.lodge.kind}` : 'Επιλέξτε μία Στοά για να συμπληρωθούν αυτόματα τα στοιχεία της.';
      drawApproval(canvas, c, im);
    };
    const check = () => {
      const c = cur();
      if (!c.protocol.trim()) { st.innerHTML = '<span class="warn">Συμπληρώστε τον αριθμό πρωτοκόλλου.</span>'; $('protocol').focus(); return null; }
      if (!c.date) { st.innerHTML = '<span class="warn">Επιλέξτε ημερομηνία.</span>'; return null; }
      if (!c.lodge) { st.innerHTML = '<span class="warn">Επιλέξτε μία Στοά από τον κατάλογο.</span>'; $('lodge').focus(); return null; }
      if (!im.seal || !im.signature) { st.innerHTML = '<span class="warn">Η σφραγίδα ή η υπογραφή δεν έχει φορτώσει ακόμη.</span>'; return null; }
      render(); return c;
    };
    const close = (v) => { ov.remove(); document.removeEventListener('keydown', key); done(v); };
    const key = (e) => { if (e.key === 'Escape') close(null); };
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.closest('[data-no]')) close(null);
      else if (e.target.closest('[data-use]')) { if (!check()) return; const c = document.createElement('canvas'); c.width = 1000; c.height = Math.round((1000 * H) / W); c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height); close(c.toDataURL('image/png')); }
      else if (e.target.closest('[data-jpeg]')) { const c = check(); if (!c) return; canvas.toBlob((b) => { if (b) { download(approvalFileName(c.protocol, c.date), b, 'image/jpeg'); st.textContent = 'Το JPEG δημιουργήθηκε και ξεκίνησε η λήψη.'; } }, 'image/jpeg', 0.97); }
    });
    ov.addEventListener('input', (e) => { if (e.target === $('search')) options(); render(); });
    ov.addEventListener('change', render);
    document.addEventListener('keydown', key);
    document.body.append(ov);
    options(); render();
    images().then((x) => { im = x; render(); });
  });
}
