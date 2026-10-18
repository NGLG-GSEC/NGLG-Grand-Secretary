// Βιβλίο Εξερχόμενης Αλληλογραφίας: ένα PDF από τα αρχεία του φακέλου Πρωτοκόλλου, μέσα στον browser (χωρίς διακομιστή).
// Σειρά: Εξώφυλλο → κενή σελίδα → Προλογικά κείμενα → Ευρετήριο (όλα τα έγγραφα + Διατάγματα) → έγγραφα (παλαιότερο → νεότερο).
// Αρίθμηση σελίδων κάτω δεξιά από τη 3η σελίδα· οι γραμμές του ευρετηρίου είναι σύνδεσμοι προς τη σελίδα· σελιδοδείκτες (bookmarks).
// Βιβλιοθήκες τοπικά: vendor/pdf-lib.min.js, vendor/fontkit.umd.min.js, vendor/fonts/DejaVuSans*.ttf (ελληνικά).
import { loadScript } from './pdf.js';

const TZ = 'Europe/Athens';
const A4 = [595.28, 841.89];
const NAVY = [0x1f / 255, 0x2a / 255, 0x5a / 255], GOLD = [0xb8 / 255, 0x96 / 255, 0x3e / 255];
const ZEBRA = [0xf3 / 255, 0xf1 / 255, 0xea / 255], GRID = [0.73, 0.73, 0.73], GREY = [0.33, 0.33, 0.33];

const upperNoAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// Ημερομηνία (ώρα Ελλάδος) από ISO / Date → «dd.mm.yyyy»
export function athensDate(when) {
  const d = when instanceof Date ? when : new Date(when);
  if (isNaN(d)) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year}`;
}

// Τι είναι κάθε αρχείο, από το όνομά του: εξώφυλλο, έγγραφο με αριθμό πρωτοκόλλου, παλαιότερο βιβλίο (εκτός) ή προλογικό κείμενο
export const isCover = (name) => /^\s*cover\b.*\.pdf$/i.test(name) || /^\s*εξ[ωώ]φυλλο\b/i.test(name);
export const isBook = (name) => /_Book_\d{6}_v\d+\.pdf$/i.test(name) || /^\s*ΒΙΒΛΙΟ\s/i.test(upperNoAccents(name));
export const protocolOf = (name) => { const m = /^\s*(\d{2})\.?(\d{3})(?!\d)/.exec(name); return m ? m[1] + m[2] : ''; };
export function classify(name) {
  if (isBook(name)) return 'skip';
  if (isCover(name)) return 'cover';
  if (protocolOf(name)) return 'doc';
  return 'front';
}

// Θέμα από το όνομα αρχείου: χωρίς αριθμό πρωτοκόλλου, κατάληξη, «_2026», κάτω παύλες
export function subjectOf(name) {
  let s = String(name || '').replace(/\.pdf$/i, '').replace(/(\.docx)?\s*\(\d+\)$/i, '').replace(/\.docx?$/i, '');
  s = s.replace(/^\s*\d{2}\.?\d{3}(?!\d)(_20\d\d)?[\s_-]*/, '').replace(/_+$/, '').replace(/_/g, ' ').replace(/^-\s*/, '');
  return s.replace(/\s+/g, ' ').trim() || String(name || '').replace(/\.pdf$/i, '');
}
// Διάταγμα: η λέξη ΔΙΑΤΑΓΜΑ (με ή χωρίς τόνο, κεφαλαία ή πεζά) στο όνομα· ο αριθμός του αν ακολουθεί
export function decreeOf(name) {
  const u = upperNoAccents(name);
  if (!u.includes('ΔΙΑΤΑΓΜΑ')) return null;
  const m = /ΔΙΑΤΑΓΜΑ[\s\-_.]*(?:ΥΠ[\s.]*ΑΡΙΘ[ΜΟΣ.]*\s*)?(\d{1,4})/.exec(u);
  return m ? m[1] : '—';
}

// Στοιχεία ενός εγγράφου για το ευρετήριο. created: ημερομηνία δημιουργίας (Drive createdTime ή lastModified του αρχείου)
export function describe(name, created) {
  return { name, created, num: protocolOf(name), date: athensDate(created), subject: subjectOf(name), decree: decreeOf(name) };
}

// Σειρά εγγράφων: 'created' (ημερομηνία δημιουργίας) ή 'protocol' (αριθμός πρωτοκόλλου, μετά ημερομηνία)
export function orderDocs(docs, order = 'created') {
  const t = (d) => new Date(d.created).getTime() || 0;
  return [...docs].sort(order === 'protocol' ? (a, b) => (+a.num - +b.num) || (t(a) - t(b)) : (a, b) => (t(a) - t(b)) || (+a.num - +b.num));
}

// Όνομα αρχείου: «Εξερχόμενα_2026_Book_181026_v1.pdf» (ημερομηνία DDMMYY και έκδοση)
export function bookFileName(year, existingNames = [], when = new Date()) {
  const [dd, mm, yyyy] = athensDate(when).split('.');
  const stamp = dd + mm + yyyy.slice(2);
  const re = new RegExp(`_Book_${stamp}_v(\\d+)\\.pdf$`, 'i');
  const v = existingNames.reduce((n, x) => { const m = re.exec(x); return m ? Math.max(n, +m[1]) : n; }, 0) + 1;
  return `Εξερχόμενα_${year}_Book_${stamp}_v${v}.pdf`;
}

async function libs() {
  await Promise.all([loadScript('../vendor/pdf-lib.min.js'), loadScript('../vendor/fontkit.umd.min.js')]);
  return { PDFLib: window.PDFLib, fontkit: window.fontkit };
}
const fontBytes = (f) => fetch(new URL(`../vendor/fonts/${f}`, import.meta.url)).then((r) => { if (!r.ok) throw new Error('Δεν φορτώθηκε η γραμματοσειρά ' + f); return r.arrayBuffer(); });

// ---- Ευρετήριο: απλή στοιχειοθέτηση σε σελίδες Α4 (τίτλοι, πίνακες με επανάληψη κεφαλίδας, αναδίπλωση κειμένου) ----
const M = { l: 36, r: 36, t: 40, b: 40 };
const W = A4[0] - M.l - M.r;
const SZ = { cell: 7.8, head: 7.3, title: 15, sub: 9.5 };
const PAD = 2.6, LEAD = 1.23;

function wrap(text, font, size, width) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? line + ' ' + word : word;
      if (font.widthOfTextAtSize(tryLine, size) <= width) { line = tryLine; continue; }
      if (line) out.push(line);
      line = '';
      let w = word;
      while (font.widthOfTextAtSize(w, size) > width) { // πολύ μεγάλη λέξη: σπάσιμο
        let i = w.length - 1;
        while (i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > width) i--;
        out.push(w.slice(0, i)); w = w.slice(i);
      }
      line = w;
    }
    out.push(line);
  }
  return out.length ? out : [''];
}

// cols: [{ h: 'Κεφαλίδα', w: πλάτος, align: 'c'|'l', v: (row) => κείμενο }], rows: αντικείμενα (με .page για τον σύνδεσμο)
function layoutIndex(blocks, F) {
  const pages = [];
  let ops = null, y = 0;
  const newPage = () => { ops = []; pages.push(ops); y = A4[1] - M.t; };
  const room = (h) => y - h >= M.b;
  newPage();
  for (const b of blocks) {
    if (b.type === 'break') { if (ops.length) newPage(); continue; }
    if (b.type === 'space') { y -= b.h; continue; }
    if (b.type === 'title' || b.type === 'sub') {
      const size = b.type === 'title' ? SZ.title : SZ.sub, font = b.type === 'title' ? F.bold : F.reg;
      const lines = wrap(b.text, font, size, W);
      const h = lines.length * size * LEAD + (b.type === 'title' ? 4 : 10);
      if (!room(h + (b.keep || 0))) newPage();
      for (const ln of lines) { y -= size * LEAD; ops.push({ k: 'text', x: M.l + W / 2, y: y + size * 0.22, size, font, color: b.type === 'title' ? NAVY : GREY, text: ln, align: 'c' }); }
      y -= b.type === 'title' ? 4 : 10;
      continue;
    }
    if (b.type === 'table') {
      const head = b.cols.map((c) => wrap(c.h, F.bold, SZ.head, c.w - 2 * PAD));
      const headH = Math.max(...head.map((l) => l.length)) * SZ.head * LEAD + 2 * PAD;
      const drawHead = () => {
        let x = M.l;
        ops.push({ k: 'rect', x: M.l, y: y - headH, w: W, h: headH, color: NAVY });
        b.cols.forEach((c, i) => { head[i].forEach((ln, j) => ops.push({ k: 'text', x: x + c.w / 2, y: y - PAD - (j + 1) * SZ.head * LEAD + SZ.head * 0.28, size: SZ.head, font: F.bold, color: [1, 1, 1], text: ln, align: 'c' })); x += c.w; });
        y -= headH;
        ops.push({ k: 'line', x1: M.l, y1: y, x2: M.l + W, y2: y, t: 1.2, color: GOLD });
      };
      const cellLines = (r) => b.cols.map((c) => wrap(c.v(r), F.reg, SZ.cell, c.w - 2 * PAD));
      const rows = b.rows.map((r) => { const ls = cellLines(r); return { r, ls, h: Math.max(...ls.map((l) => l.length)) * SZ.cell * LEAD + 2 * PAD }; });
      if (!room(headH + (rows[0] ? rows[0].h : 0))) newPage();
      drawHead();
      rows.forEach((row, n) => {
        if (!room(row.h)) { newPage(); drawHead(); }
        if (n % 2) ops.push({ k: 'rect', x: M.l, y: y - row.h, w: W, h: row.h, color: ZEBRA });
        let x = M.l;
        b.cols.forEach((c, i) => {
          const ls = row.ls[i], top = y - (row.h - ls.length * SZ.cell * LEAD) / 2;
          ls.forEach((ln, j) => ops.push({ k: 'text', x: c.align === 'l' ? x + PAD : x + c.w / 2, y: top - (j + 1) * SZ.cell * LEAD + SZ.cell * 0.28, size: SZ.cell, font: F.reg, color: [0, 0, 0], text: ln, align: c.align === 'l' ? 'l' : 'c', fill: c.fill ? () => c.fill(row.r) : null }));
          if (i) ops.push({ k: 'line', x1: x, y1: y, x2: x, y2: y - row.h, t: 0.25, color: GRID });
          x += c.w;
        });
        y -= row.h;
        ops.push({ k: 'line', x1: M.l, y1: y, x2: M.l + W, y2: y, t: 0.25, color: GRID });
        ops.push({ k: 'link', x: M.l, y, w: W, h: row.h, target: row.r });
      });
      ops.push({ k: 'frame' }); // περίγραμμα του τμήματος του πίνακα σε αυτή τη σελίδα
      continue;
    }
  }
  return pages;
}

function drawOps(page, ops, PDFLib, linkTo) {
  const { rgb } = PDFLib;
  let top = null, bottom = null;
  for (const o of ops) {
    if (o.k === 'rect') { page.drawRectangle({ x: o.x, y: o.y, width: o.w, height: o.h, color: rgb(...o.color) }); if (o.color === NAVY) top = top ?? o.y + o.h; }
    else if (o.k === 'line') { page.drawLine({ start: { x: o.x1, y: o.y1 }, end: { x: o.x2, y: o.y2 }, thickness: o.t, color: rgb(...o.color) }); bottom = o.y1; }
    else if (o.k === 'text') {
      const text = o.fill ? o.fill() : o.text;
      const w = o.font.widthOfTextAtSize(text, o.size);
      page.drawText(text, { x: o.align === 'c' ? o.x - w / 2 : o.x, y: o.y, size: o.size, font: o.font, color: rgb(...o.color) });
    } else if (o.k === 'link') linkTo(page, o);
    else if (o.k === 'frame' && top != null && bottom != null) { page.drawRectangle({ x: M.l, y: bottom, width: W, height: top - bottom, borderColor: rgb(...NAVY), borderWidth: 0.6 }); top = bottom = null; }
  }
}

// Σελιδοδείκτες (PDF outline) — η pdf-lib δεν έχει έτοιμη λειτουργία, οπότε χτίζονται τα λεξικά απευθείας
function addOutline(pdf, PDFLib, tree) {
  const { PDFName, PDFHexString, PDFNumber, PDFNull } = PDFLib;
  const ctx = pdf.context, pages = pdf.getPages();
  const dest = (i) => ctx.obj([pages[i].ref, PDFName.of('XYZ'), PDFNull, PDFNull, PDFNull]);
  const build = (items, parentRef) => {
    const refs = items.map(() => ctx.nextRef());
    items.forEach((it, i) => {
      const d = ctx.obj({});
      d.set(PDFName.of('Title'), PDFHexString.fromText(it.title));
      d.set(PDFName.of('Parent'), parentRef);
      d.set(PDFName.of('Dest'), dest(it.page));
      if (i > 0) d.set(PDFName.of('Prev'), refs[i - 1]);
      if (i < items.length - 1) d.set(PDFName.of('Next'), refs[i + 1]);
      if (it.children && it.children.length) {
        const kids = build(it.children, refs[i]);
        d.set(PDFName.of('First'), kids[0]); d.set(PDFName.of('Last'), kids[kids.length - 1]);
        d.set(PDFName.of('Count'), PDFNumber.of(-it.children.length)); // κλειστό αρχικά
      }
      ctx.assign(refs[i], d);
    });
    return refs;
  };
  const rootRef = ctx.nextRef();
  const top = build(tree, rootRef);
  ctx.assign(rootRef, ctx.obj({ Type: 'Outlines', First: top[0], Last: top[top.length - 1], Count: PDFNumber.of(top.length) }));
  pdf.catalog.set(PDFName.of('Outlines'), rootRef);
  pdf.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'));
}

/**
 * Δημιουργία του βιβλίου.
 * @param {{bytes:ArrayBuffer|Uint8Array}|null} cover
 * @param {{name:string, created:string|Date, bytes:ArrayBuffer|Uint8Array}[]} front  προλογικά κείμενα (με αυτή τη σειρά)
 * @param {{name:string, created:string|Date, bytes:ArrayBuffer|Uint8Array}[]} docs   έγγραφα πρωτοκόλλου
 * @param {{year:number|string, order?:'created'|'protocol', frontTitle?:string, frontSubtitle?:string, onProgress?:(msg:string)=>void}} opts
 * @returns {Promise<{bytes:Uint8Array, pages:number, docs:object[], front:object[], warnings:string[]}>}
 */
export async function buildBook({ cover, front = [], docs = [] }, opts = {}) {
  const { year = new Date().getFullYear(), order = 'created', frontTitle = 'ΚΕΙΜΕΝΑ ΤΟΥ ΜΕΓΑΛΟΥ ΔΙΔΑΣΚΑΛΟΥ', frontSubtitle = '', onProgress = () => {} } = opts;
  const { PDFLib, fontkit } = await libs();
  const { PDFDocument, PDFName, rgb } = PDFLib;
  const warnings = [];
  const out = await PDFDocument.create();
  out.registerFontkit(fontkit);
  const [r, bd] = await Promise.all([fontBytes('DejaVuSans.ttf'), fontBytes('DejaVuSans-Bold.ttf')]);
  const F = { reg: await out.embedFont(r, { subset: true }), bold: await out.embedFont(bd, { subset: true }) };
  const known = new Set(F.reg.getCharacterSet());
  const clean = (s) => [...String(s ?? '')].map((c) => (known.has(c.codePointAt(0)) ? c : c === '\t' ? ' ' : '?')).join('');

  // Άνοιγμα όλων των αρχείων (ένα χαλασμένο αρχείο δεν σταματά το βιβλίο)
  const open = async (item, label) => {
    try { return await PDFDocument.load(item.bytes, { ignoreEncryption: true, updateMetadata: false }); }
    catch (e) { warnings.push(`Παραλείφθηκε (δεν ανοίγει ως PDF): ${label}`); return null; }
  };
  onProgress('Άνοιγμα αρχείων…');
  const coverDoc = cover ? await open(cover, 'εξώφυλλο') : null;
  if (!coverDoc) warnings.push('Δεν βρέθηκε εξώφυλλο (cover.pdf)· το βιβλίο ξεκινά με κενή σελίδα.');
  const F2 = [];
  for (const f of front) { const d = await open(f, f.name); if (d) F2.push({ ...describe(f.name, f.created), title: clean(subjectOf(f.name)), src: d, pages: d.getPageCount() }); }
  let D = [];
  for (const f of docs) { const d = await open(f, f.name); if (d) D.push({ ...describe(f.name, f.created), src: d, pages: d.getPageCount() }); }
  D = orderDocs(D, order);
  D.forEach((d) => { d.subject = clean(d.subject); });
  const seen = {};
  D.forEach((d) => (seen[d.num] = (seen[d.num] || 0) + 1));
  const dup = Object.entries(seen).filter(([, n]) => n > 1).map(([k]) => k);
  if (dup.length) warnings.push(`Ίδιος αριθμός πρωτοκόλλου σε περισσότερα αρχεία: ${dup.join(', ')}`);
  const decrees = D.filter((d) => d.decree).sort((a, b) => (+a.decree || 1e9) - (+b.decree || 1e9) || (new Date(a.created) - new Date(b.created)));

  // Ευρετήριο: πρώτα στοιχειοθέτηση (για να ξέρουμε πόσες σελίδες πιάνει), μετά αρίθμηση, μετά σχεδίαση
  const pg = (r) => String(r.page ?? '');
  const blocks = [];
  if (F2.length) {
    blocks.push({ type: 'title', text: clean(frontTitle), keep: 60 });
    if (frontSubtitle) blocks.push({ type: 'sub', text: clean(frontSubtitle) });
    blocks.push({ type: 'table', rows: F2, cols: [
      { h: 'Α/Α', w: 26, v: (x) => String(F2.indexOf(x) + 1) }, { h: 'Ημερομηνία', w: 64, v: (x) => x.date },
      { h: 'Τίτλος', w: 339, align: 'l', v: (x) => x.title }, { h: 'Σελίδες', w: 42, v: (x) => String(x.pages) }, { h: 'Σελίδα', w: 52, v: () => '0000', fill: pg }] });
    blocks.push({ type: 'space', h: 22 });
  }
  blocks.push({ type: 'title', text: `ΕΥΡΕΤΗΡΙΟ ΕΞΕΡΧΟΜΕΝΗΣ ΑΛΛΗΛΟΓΡΑΦΙΑΣ ${year}`, keep: 60 });
  blocks.push({ type: 'sub', text: `${order === 'protocol' ? 'Κατά αριθμό πρωτοκόλλου' : 'Κατά χρονολογική σειρά'} · ${D.length} έγγραφα` });
  blocks.push({ type: 'table', rows: D, cols: [
    { h: 'Α/Α', w: 26, v: (x) => String(D.indexOf(x) + 1) }, { h: 'Αρ. Πρωτ.', w: 50, v: (x) => x.num }, { h: 'Ημερομηνία', w: 62, v: (x) => x.date },
    { h: 'Θέμα', w: 341, align: 'l', v: (x) => x.subject }, { h: 'Σελίδα', w: 44, v: () => '0000', fill: pg }] });
  blocks.push({ type: 'break' });
  blocks.push({ type: 'title', text: `ΕΥΡΕΤΗΡΙΟ ΔΙΑΤΑΓΜΑΤΩΝ ${year}`, keep: 60 });
  blocks.push({ type: 'sub', text: `Έγγραφα με τη λέξη «ΔΙΑΤΑΓΜΑ» στο όνομα αρχείου · ${decrees.length} έγγραφα` });
  blocks.push({ type: 'table', rows: decrees, cols: [
    { h: 'Διάταγμα', w: 56, v: (x) => x.decree }, { h: 'Αρ. Πρωτ.', w: 50, v: (x) => x.num }, { h: 'Ημερομηνία', w: 62, v: (x) => x.date },
    { h: 'Όνομα / Θέμα', w: 311, align: 'l', v: (x) => x.subject }, { h: 'Σελίδα', w: 44, v: () => '0000', fill: pg }] });
  onProgress('Ευρετήριο…');
  const idxPages = layoutIndex(blocks, F);

  // Σελίδες με τη σειρά του βιβλίου (αριθμός σελίδας = θέση + 1)
  let n = 0;
  const addCopied = async (src) => { const ps = await out.copyPages(src, src.getPageIndices()); ps.forEach((p) => out.addPage(p)); n += ps.length; };
  if (coverDoc) await addCopied(coverDoc); else { out.addPage(A4); n++; }
  out.addPage(A4); n++; // κενή σελίδα
  for (const f of F2) { onProgress(`Προλογικά: ${f.title}`); f.page = n + 1; await addCopied(f.src); }
  const idxStart = n;
  const idx = idxPages.map(() => out.addPage(A4)); n += idx.length;
  for (let i = 0; i < D.length; i++) { const d = D[i]; if (i % 10 === 0) onProgress(`Έγγραφα ${i + 1}–${Math.min(i + 10, D.length)} από ${D.length}…`); d.page = n + 1; await addCopied(d.src); }

  // Σχεδίαση ευρετηρίου με συνδέσμους προς τις σελίδες
  const all = out.getPages();
  const linkTo = (page, o) => {
    const i = (o.target.page || 0) - 1;
    if (i < 0 || !all[i]) return;
    const annot = out.context.obj({ Type: 'Annot', Subtype: 'Link', Rect: [o.x, o.y, o.x + o.w, o.y + o.h], Border: [0, 0, 0], Dest: [all[i].ref, 'XYZ', null, null, null] });
    const ref = out.context.register(annot);
    const annots = page.node.lookup(PDFName.of('Annots'));
    if (annots) annots.push(ref); else page.node.set(PDFName.of('Annots'), out.context.obj([ref]));
  };
  idx.forEach((p, i) => drawOps(p, idxPages[i], PDFLib, linkTo));

  // Αρίθμηση κάτω δεξιά (όχι στο εξώφυλλο και στην κενή σελίδα)
  onProgress('Αρίθμηση σελίδων…');
  all.forEach((p, i) => {
    if (i < 2) return;
    const { width } = p.getSize(), rot = (p.getRotation().angle % 360 + 360) % 360;
    const box = p.getCropBox ? p.getCropBox() : { x: 0, y: 0, width, height: p.getSize().height };
    const t = String(i + 1), w = F.reg.widthOfTextAtSize(t, 8.5);
    if (rot === 0) p.drawText(t, { x: box.x + box.width - 28 - w, y: box.y + 14, size: 8.5, font: F.reg, color: rgb(...NAVY) });
    else { // περιστραμμένη σελίδα: ο αριθμός να φαίνεται κάτω δεξιά όπως διαβάζεται
      const { degrees } = PDFLib, H = box.height, Wd = box.width;
      const pos = { 90: { x: box.x + Wd - 14, y: box.y + H - 28 - w }, 180: { x: box.x + 28 + w, y: box.y + H - 14 }, 270: { x: box.x + 14, y: box.y + 28 + w } }[rot];
      p.drawText(t, { ...pos, size: 8.5, font: F.reg, color: rgb(...NAVY), rotate: degrees(rot) });
    }
  });

  const decreeStart = idxStart + Math.max(0, idxPages.findIndex((ops) => ops.some((o) => o.k === 'text' && /^ΕΥΡΕΤΗΡΙΟ ΔΙΑΤΑΓΜΑΤΩΝ/.test(o.text))));
  addOutline(out, PDFLib, [
    ...(F2.length ? [{ title: clean(frontTitle), page: F2[0].page - 1, children: F2.map((f) => ({ title: f.title, page: f.page - 1 })) }] : []),
    { title: 'Ευρετήριο', page: idxStart, children: [{ title: 'Ευρετήριο Διαταγμάτων', page: decreeStart }] },
    ...(D.length ? [{ title: 'Έγγραφα', page: D[0].page - 1, children: D.map((d) => ({ title: `${d.num} — ${d.subject}`, page: d.page - 1 })) }] : []),
    ...(decrees.length ? [{ title: 'Διατάγματα', page: decrees[0].page - 1, children: decrees.map((d) => ({ title: `Διάταγμα ${d.decree} — ${d.num}`, page: d.page - 1 })) }] : []),
  ]);
  out.setTitle(`Αρχείο Εξερχόμενης Αλληλογραφίας ${year}`);
  out.setAuthor('Μεγάλη Γραμματεία ΕΜΣτΕ');
  out.setCreator('Ψηφιακή Μεγάλη Γραμματεία');
  onProgress('Αποθήκευση PDF…');
  const bytes = await out.save({ useObjectStreams: true });
  const strip = ({ src, ...x }) => x;
  return { bytes, pages: out.getPageCount(), docs: D.map(strip), front: F2.map(strip), decrees: decrees.map(strip), indexPages: idx.length, warnings };
}
