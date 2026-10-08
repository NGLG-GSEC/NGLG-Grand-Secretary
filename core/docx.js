// Έγγραφο Word (.docx) για επεξεργασία: επιστολόχαρτο με θυρεό, κείμενο, υπογραφή.
// Χωρίς εξωτερική υπηρεσία· το .docx (zip) γράφεται με το CFB του SheetJS (vendor/xlsx.full.min.js).
// blocks: [{ text, align: 'left'|'center'|'right'|'both', bold, italic, size (pt), color, before, after (pt), rule }
//          | { img: url, width (cm), align }]
import { XLSX } from './util.js';

const xe = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
  + 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
  + 'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"';

function pngSize(u8) { // IHDR: πλάτος/ύψος
  const v = new DataView(u8.buffer, u8.byteOffset);
  return [v.getUint32(16), v.getUint32(20)];
}

function para(b) { // σειρά στοιχείων κατά το σχήμα OOXML: pBdr → spacing → jc, b → i → color → sz
  const ppr = (b.rule ? '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="B18A43"/></w:pBdr>' : '')
    + `<w:spacing w:before="${Math.round((b.before || 0) * 20)}" w:after="${Math.round((b.after ?? 6) * 20)}"/><w:jc w:val="${b.align || 'left'}"/>`;
  const rpr = (b.bold ? '<w:b/>' : '') + (b.italic ? '<w:i/>' : '') + (b.color ? `<w:color w:val="${b.color}"/>` : '') + (b.size ? `<w:sz w:val="${b.size * 2}"/><w:szCs w:val="${b.size * 2}"/>` : '');
  const runs = String(b.text ?? '').split('\n').map((line, i) => `<w:r><w:rPr>${rpr}</w:rPr>${i ? '<w:br/>' : ''}<w:t xml:space="preserve">${xe(line)}</w:t></w:r>`).join('');
  return `<w:p><w:pPr>${ppr}</w:pPr>${runs}</w:p>`;
}

function image(b, rid, n, w, h) {
  const cx = Math.round((b.width || 4) * 360000), cy = Math.round(cx * h / w);
  return `<w:p><w:pPr><w:spacing w:before="${Math.round((b.before || 0) * 20)}" w:after="${Math.round((b.after ?? 4) * 20)}"/><w:jc w:val="${b.align || 'center'}"/></w:pPr><w:r><w:drawing>`
    + `<wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${n}" name="Εικόνα ${n}"/>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${n}" name="image${n}.png"/><pic:cNvPicPr/></pic:nvPicPr>`
    + `<pic:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm>`
    + '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>';
}

export async function makeDocx(blocks, { title = '', author = '' } = {}) {
  const X = await XLSX(), C = X.CFB, z = C.utils.cfb_new(), enc = new TextEncoder();
  const add = (p, s) => C.utils.cfb_add(z, p, typeof s === 'string' ? enc.encode(s) : s);
  const rels = [['rIdStyles', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles', 'styles.xml']];
  let body = '', n = 0;
  for (const b of blocks) {
    if (b.img) {
      let u8;
      try { const r = await fetch(b.img); if (!r.ok) continue; u8 = new Uint8Array(await r.arrayBuffer()); } catch { continue; }
      if (u8[1] !== 0x50) continue; // μόνο PNG
      n++;
      const rid = `rIdImg${n}`, [w, h] = pngSize(u8);
      add(`/word/media/image${n}.png`, u8);
      rels.push([rid, 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image', `media/image${n}.png`]);
      body += image(b, rid, n, w, h);
    } else body += para(b);
  }
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${NS}><w:body>${body}`
    + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1000" w:right="1250" w:bottom="1000" w:left="1250" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>';
  add('/word/document.xml', doc);
  add('/[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
    + '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
    + '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
    + '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>');
  add('/_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
    + '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  add('/docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
    + `xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xe(title)}</dc:title><dc:creator>${xe(author)}</dc:creator></cp:coreProperties>`);
  add('/word/_rels/document.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    + rels.map(([id, t, tg]) => `<Relationship Id="${id}" Type="${t}" Target="${tg}"/>`).join('') + '</Relationships>');
  add('/word/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    + '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Georgia" w:hAnsi="Georgia" w:cs="Times New Roman" w:eastAsia="Georgia"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="el-GR"/></w:rPr></w:rPrDefault>'
    + '<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>'
    + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>');
  const out = C.write(z, { fileType: 'zip', type: 'array', compression: true });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

// Επιστολόχαρτο ΕΜΣτΕ: κεφαλίδα + στοιχεία + κείμενο + κλείσιμο/υπογραφή
export function letterBlocks({ base = '', org, founded, gmTitle, gmName, number, date, place, title, to, cc, subject, paragraphs = [], closing, signature, signer, signerTitle }) {
  const B = [{ img: base + 'img/header_emblem.png', width: 3.2 }, { text: org, align: 'center', bold: true, size: 15, color: '1D2F5E', after: 0 }];
  if (founded) B.push({ text: `Έτος Ιδρύσεως ${founded}`, align: 'center', size: 10, color: 'B18A43', after: 0 });
  if (gmTitle || gmName) B.push({ text: [gmTitle, gmName].filter(Boolean).join('\n'), align: 'center', size: 10, after: 0 });
  B.push({ text: '', rule: true, after: 12 });
  B.push({ text: [number && `Αρ. Πρωτ.: ${number}`, [place, date].filter(Boolean).join(', ')].filter(Boolean).join('\n'), align: 'right', size: 11, after: 12 });
  if (title) B.push({ text: title, align: 'center', bold: true, size: 14, after: 10 });
  if (to) B.push({ text: `Προς: ${to}`, bold: true, after: cc ? 2 : 6 });
  if (cc) B.push({ text: `Κοιν.: ${cc}`, bold: true, after: 6 });
  if (subject) B.push({ text: `Θέμα: ${subject}`, bold: true, after: 12 });
  for (const p of paragraphs) if (String(p.text || '').trim()) for (const t of String(p.text).split(/\n\s*\n/)) B.push({ align: 'both', after: 8, ...p, text: t.trim() });
  if (closing) B.push({ text: closing, before: 14, after: 6 });
  if (signature) B.push({ img: signature, width: 4.5, align: 'center', before: 6, after: 0 });
  B.push({ text: [signer, signerTitle, org].filter(Boolean).join('\n'), align: 'center', bold: false, after: 0 });
  return B;
}
