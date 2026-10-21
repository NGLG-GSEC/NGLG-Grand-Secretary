// Διατάγματα — ΔΙΟΡΙΖΟΜΕΝ / ΑΠΟΝΕΜΕΙ / ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ: σύνταξη κειμένου, αρίθμηση (Διατάγματος και
// πρωτοκόλλου), επίσημο έντυπο, PDF/εκτύπωση, αποστολή, αρχείο. Κάθε Διάταγμα ενημερώνει αυτόματα την Επετηρίδα.
import { db } from '../core/store.js';
import { module, onSubmit, go, flash, bind, confirmDo, table, notice, toast } from '../core/app.js';
import { esc, today, fmtDate, matches, sortBy, safeFileName, parseIso, MONTHS_GEN, download, splitEmails, EMAIL_RE } from '../core/util.js';
import { makeDocx, letterBlocks } from '../core/docx.js';
import { richHtml } from '../core/rich.js';
import { docTitle, driveBox, saveDocToDrive } from '../core/drive.js';
import { letterhead, IMG, printPaper, pageLayers, layoutTop, customHead, defaultHead, headOn, HEAD_COLORS } from '../core/paper.js';
import { mailButtons, senderBanner } from '../core/mail.js';
import { attachPicker, memberItems, contactItems } from '../core/pickers.js';
import { DECREE_KINDS, DECREE_PLACEHOLDERS, GENERAL_BODY, decreeKey, decreeTemplate, layoutOf } from './decree-templates.js';
import { gmName } from './letter-fill.js';
import { nextProtocol, askProtocol, claimProtocol } from './protocol.js';
import { findMember, insertMember } from './members.js';
import { identify } from '../core/people.js';
import { DEC_OFFICES, AWARD_OFFICES, AWARD_MAP, DEC_MAP, DEC_BASIS, HON_ACC_BY_SHORT, HONORIFIC_OPTIONS, OFFICE_FORMS, DEGREE_CC_DEFAULT, PRECEDENCE } from './decree-catalog.js';

db.defaultSettings({ decree_cc: DEGREE_CC_DEFAULT.join(', '), decree_first_no: '513' });
const ACTIONS = { appoint: 'ΔΙΟΡΙΖΟΜΕΝ', award: 'ΑΠΟΝΕΜΕΙ', service_award: 'ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ' };
const SERVICE_MATTER = 'Απονομή της Τάξεως του Μεγάλου Διδασκάλου δι’ Υπηρεσίας προς την Τεκτονικήν';

// ---------------------------------------------------------------- κείμενο
const proper = (v) => String(v || '').trim().split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');
const splitName = (v) => { const p = String(v || '').trim().split(/\s+/).filter(Boolean); return [p[0] || '', p.slice(1).join(' ')]; };
const accName = (name) => proper(String(name || '').trim().split(/\s+/).map((w) => w.endsWith('ος') ? w.slice(0, -2) + 'ον' : w.endsWith('ης') ? w.slice(0, -2) + 'ην' : w.endsWith('ας') ? w.slice(0, -2) + 'αν' : w.endsWith('ων') ? w.slice(0, -2) + 'ωνα' : w).join(' '));
function displayName(a) {
  const dfn = String(a.decree_first_name || '').trim(), dln = String(a.decree_last_name || '').trim();
  if (dfn || dln) return proper(`${dfn} ${dln}`);
  if (String(a.decree_name || '').trim()) return proper(a.decree_name);
  let fn = String(a.first_name || '').trim(), ln = String(a.last_name || '').trim();
  if (!fn && !ln) [fn, ln] = splitName(a.full_name);
  return accName(`${fn} ${ln}`);
}
const gdate = (iso) => { const d = parseIso(iso || today()); return `${d.getDate()}ην ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`; };
// Γενικό Διάταγμα: κείμενο από το πρότυπο με τα πεδία συμπληρωμένα
export const fillGeneral = (text, { matter = '', date = today(), no = '' } = {}) => String(text || '')
  .replace(/\{\s*Περί\s*\}/g, matter || '……').replace(/\{\s*ημερομηνία\s*\}/g, gdate(date)).replace(/\{\s*Μέγας Διδάσκαλος\s*\}/g, gmName()).replace(/\{\s*Αρ\. Διατάγματος\s*\}/g, no || '……');

export function decreeBody(matter, apps, iso, action = 'appoint', awardOffice = '', period = '') {
  const rules = action === 'appoint' ? [...new Set(apps.map((a) => a.rule).filter(Boolean))] : ['19'];
  const end = 'Εγένετο εν τω Τεκτονικώ Μεγάρω της πόλεως των Αθηνών, την ' + gdate(iso) + '.';
  if (action === 'service_award') {
    return { rules, body: ['ΗΜΕΙΣ', 'Ο Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος,', 'Σεβασμιώτατος Αδελφός Ιωάννης Μπενετάτος', '', 'λαβόντες υπ’ όψιν τον Κανόνα 19 του Βιβλίου Γενικών Νόμων και', 'Κανονισμών,', '',
      'ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ', '', 'την Τάξιν του Μεγάλου Διδασκάλου', '', 'δι’ Υπηρεσίας προς την Τεκτονικήν, ' + (apps.length === 1 ? 'στον κάτωθι Αδελφόν:' : 'στους κάτωθι Αδελφούς:'), '',
      ...apps.map((a) => '• ' + displayName(a)), '', end].join('\n').trim() };
  }
  const out = ['ΗΜΕΙΣ', 'Ο Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος,', 'Σεβασμιώτατος Αδελφός Ιωάννης Μπενετάτος,', 'λαβόντες υπ’ όψιν ' + (rules.length === 1 ? 'τον Κανόνα ' : 'τους Κανόνας ') + rules.join(' και '),
    'του Βιβλίου των Γενικών Νόμων και Κανονισμών,', `περί ${matter},`, ''];
  if (action === 'award') {
    out.push('ΑΠΟΝΕΜΕΙ', '', 'τον Τίτλον του ' + (AWARD_MAP[awardOffice] || awardOffice), apps.length === 1 ? 'τον κάτωθι Αδελφόν:' : 'τους κάτωθι Αδελφούς:', '', ...apps.map((a) => '• ' + displayName(a)));
  } else {
    out.push('ΔΙΟΡΙΖΟΜΕΝ', '');
    for (const a of apps) {
      const m = DEC_MAP[a.office] || {}, hon = m.hon_acc || HON_ACC_BY_SHORT[a.honorific] || '';
      out.push('ως', m.acc || String(a.office || '').toUpperCase(), hon ? `τον ${hon} Αδελφόν` : 'τον Αδελφόν', displayName(a), 'δια την Τεκτονικήν Περίοδον ' + period + '.', '');
    }
  }
  out.push(end);
  return { rules, body: out.join('\n').trim() };
}

const meta = (d) => {
  let r = d.rules;
  try { if (typeof r === 'string') r = JSON.parse(r || '{}'); } catch { r = {}; }
  if (Array.isArray(r)) r = { rules: r };
  return { rules: r.rules || [], action: r.action || 'appoint', award_office: r.award_office || '', decree_office: r.decree_office || '', period: r.period || `${d.decree_year} - ${Number(d.decree_year) + 1}` };
};
const apps = (d) => { try { return typeof d.appointments === 'string' ? JSON.parse(d.appointments || '[]') : d.appointments || []; } catch { return []; } };
const decreeNo = (d) => `${d.decree_no}/${d.decree_year}`;
// Ονόματα των Αδελφών στο Διάταγμα (η γραμμή μετά το «… Αδελφόν» και οι γραμμές «• …»): έντονα, 20px
const NAME_AFTER = /^(τον [^\n]*Αδελφόν\n)([^\n]+)$/gm, NAME_BULLET = /^(• )([^\n]+)$/gm;
// Χωρίς κενή γραμμή ανάμεσα στο «… Κανονισμών,» και στο «περί …» (και στα ήδη αποθηκευμένα Διατάγματα)
const tightPeri = (t) => String(t || '').replace(/(Γενικών Νόμων και Κανονισμών,)[ \t]*\n\s*\n(\s*περί )/, '$1\n$2');
const markNames = (text, wrap) => String(text || '').replace(NAME_AFTER, (_, a, n) => a + wrap(n)).replace(NAME_BULLET, (_, a, n) => a + wrap(n));
const fileName = (d) => (d.protocol_seq ? docTitle(d.protocol_seq, 'ΔΙΑΤΑΓΜΑ', `${decreeNo(d)} ${d.matter || ''}`) : safeFileName(`ΔΙΑΤΑΓΜΑ ${decreeNo(d)} ${d.matter || ''}`));
// Εικόνα της Σχεδίασης σελίδας ως PNG (το Word δέχεται με ασφάλεια PNG)
async function layerPng(path) {
  const bytes = await db.file(path);
  if (!bytes) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return bytes;
  const bmp = await createImageBitmap(new Blob([bytes]));
  const c = Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  c.getContext('2d').drawImage(bmp, 0, 0);
  return new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer());
}
// Word του Διατάγματος (με επιστολόχαρτο ή με τη Σχεδίαση σελίδας του προτύπου), για λήψη και Drive
// Λέξεις του Διατάγματος που γράφονται ως καλλιγραφική εικόνα (cls: θέση/μέγεθος στο css, word: πλάτος στο Word σε cm)
const DECREE_ARTWORK = { ΗΜΕΙΣ: { img: IMG.hmeis, cls: 'hmeis', word: 3.3 }, ΔΙΟΡΙΖΟΜΕΝ: { img: IMG.diorizomen, cls: 'diorizomen', word: 2.6 },
  ΑΠΟΝΕΜΕΙ: { img: IMG.aponemei, cls: 'aponemei', word: 3.1 } };
// «ΔΙΟΡΙΖΟΜΕΝ» (εικόνα της πράξης): πλάτος/ύψος σε mm, πάντα στο κέντρο, κάθετη μετατόπιση dy (mm)·
// προαιρετικά δική του εικόνα ανά πρότυπο (Σχεδίαση σελίδας → layout.dior.file)
export const DIOR_DEFAULT = { w: 45, h: 20.7, dy: 0 }, DIOR_RATIO = 0.4608;
const diorOf = (L) => ({ ...DIOR_DEFAULT, ...((L && L.dior) || {}) });
const diorStyle = (o) => `width:${Math.max(5, +o.w || DIOR_DEFAULT.w)}mm;height:${Math.max(3, +o.h || DIOR_DEFAULT.h)}mm;top:${+o.dy || 0}mm`;
function diorHtml(L, urls = {}) {
  const o = diorOf(L), src = urls.dior ? ` src="${esc(urls.dior)}"` : o.file ? ` data-dfile="${esc(o.file)}"` : ` src="${IMG.diorizomen}"`;
  return `<span class="act-art diorizomen" role="img" aria-label="ΔΙΟΡΙΖΟΜΕΝ" style="${diorStyle(o)}"><img alt=""${src}></span>`;
}
async function decreeDocxBlob(d) {
  const S = (k) => db.setting(k) || '', L = layoutOf(decreeTemplate(decreeKey(d))), top = layoutTop(L), dio = diorOf(L);
  const dioPng = dio.file ? await layerPng(dio.file) : null, dioImg = dioPng ? URL.createObjectURL(new Blob([dioPng], { type: 'image/png' })) : IMG.diorizomen;
  const anchors = [];
  for (const k of ['bg', 'header']) {
    const x = L[k];
    if (!x || !x.file) continue;
    const bytes = await layerPng(x.file);
    if (bytes) anchors.push({ bytes, x: +x.x || 0, y: +x.y || 0, w: +x.w || 210, h: +x.h || 297, behind: k === 'bg', opacity: k === 'bg' ? (x.opacity ?? 1) : null });
  }
  const PT = 72 / 25.4, MARGIN_TOP = 1000 / 1440 * 25.4; // περιθώριο σελίδας (mm)
  const blocks = letterBlocks({ noHead: top != null, topSpace: top != null ? (top - MARGIN_TOP) * PT : 0, org: S('organization_name'), founded: S('founded_year'), gmTitle: S('grand_master_title'), gmName: S('grand_master_name'),
    number: d.protocol_seq ? String(d.protocol_seq) : (d.protocol_no || ''), date: fmtDate(d.decree_date), place: 'Εν Αθήναις', title: `ΔΙΑΤΑΓΜΑ υπ’ αριθμ. ${decreeNo(d)}`,
    paragraphs: (decreeKey(d) === 'decree-general' ? String(d.body || '') : markNames(tightPeri(d.body), (n) => `[b][size=15]${n}[/size][/b]`)).split(/\n\s*\n/).map((t) => ({ text: t.trim(), align: 'center', bold: /^(ΗΜΕΙΣ|ΔΙΟΡΙΖΟΜΕΝ|ΑΠΟΝΕΜΕΙ|ΕΥΑΡΕΣΤΟΥΜΕΘΑ)/.test(t.trim()) })),
    artwork: Object.fromEntries(Object.entries(DECREE_ARTWORK).map(([w, a]) => [w, w === 'ΔΙΟΡΙΖΟΜΕΝ' ? { img: dioImg, width: +(Math.max(5, +dio.w) / 10).toFixed(2) } : { img: a.img, width: a.word }])),
    signature: IMG.signature, signer: 'Δημήτριος Σκιαδόπουλος', signerTitle: 'Ο ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ',
    head: headOn(L.head) ? { ...L.head, lines: L.head.lines.map((l) => ({ ...l, hex: (HEAD_COLORS[l.color] || HEAD_COLORS.navy).slice(1).toUpperCase() })) } : null });
  return makeDocx(blocks, { title: d.subject, author: 'Μεγάλη Γραμματεία', anchors });
}
const nextDecreeNo = (tx) => Math.max(tx.all('decree_documents').reduce((m, d) => Math.max(m, Number(d.decree_no) || 0), 0) + 1, Number(db.setting('decree_first_no')) || 513);

// Έντυπο Διατάγματος· η σελίδα (φόντο/κεφαλίδα) από τη «Σχεδίαση σελίδας» του προτύπου του
// opts: { layout, urls } για ζωντανή προβολή στη σχεδίαση πριν την αποθήκευση
export function decreePaper(d, opts = {}) {
  const action = meta(d).action, general = decreeKey(d) === 'decree-general';
  const L = opts.layout || layoutOf(decreeTemplate(decreeKey(d))), urls = opts.urls || {}, layers = pageLayers(L, urls), top = layoutTop(L, urls);
  const bodyHtml = general ? richHtml(d.body, { links: false }).replace(/^([Α-ΩΆ-Ώ][Α-ΩΆ-ΏΪΫ ’'΄-]{3,})$/gm, '<b>$1</b>')
    : markNames(richHtml(tightPeri(d.body), { links: false }).replace(/^(ΗΜΕΙΣ|ΔΙΟΡΙΖΟΜΕΝ|ΑΠΟΝΕΜΕΙ|ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ)$/gm, '<b>$1</b>'), (n) => `<span class="dec-name">${n}</span>`);
  // «ΗΜΕΙΣ» / «ΔΙΟΡΙΖΟΜΕΝ»: καλλιγραφικές εικόνες, μεγάλες και πίσω από το κείμενο (πιάνουν λίγο ύψος — το κεφαλαίο απλώνεται προς τα πάνω)
  // η γραμμή μόνο με τη λέξη (ό,τι μορφοποίηση κι αν έχει: έντονα, μέγεθος, κενά) γίνεται εικόνα
  const hmeisHtml = Object.entries(DECREE_ARTWORK).reduce((h, [w, a]) => h.replace(new RegExp(`^(?:<[^>]+>|[ \\t])*${w}(?:</[^>]+>|[ \\t])*$`, 'm'),
    w === 'ΔΙΟΡΙΖΟΜΕΝ' ? diorHtml(L, urls) : `<span class="${a.cls}" role="img" aria-label="${w}"><img src="${a.img}" alt=""></span>`), bodyHtml);
  const withOffice = officeImage(hmeisHtml, L, urls);
  return `<article class="paper decree${layers ? ' has-layers' : ''}"${top != null ? ` style="--pt:${top}mm"` : ''}>${layers}${top != null ? '' : headOn(L.head) ? customHead(L.head) : letterhead()}<div class="dec-title">ΔΙΑΤΑΓΜΑ</div>
<div class="dec-no official-number">${action === 'service_award' ? 'υπ’ αριθ. ' : 'υπ’ αριθμ. '}${esc(decreeNo(d))}, ημερ. ${esc(fmtDate(d.decree_date))}</div>
<div class="decbody">${withOffice}</div>
<div class="decsig"><div><div class="t">ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ</div><img class="signature-img" src="${IMG.signature}" alt=""><div class="signature-line"></div><b>Δημήτριος Σκιαδόπουλος</b></div>
<div><img class="seal-img" src="${IMG.seal}" alt=""></div><div><div class="t">Ο ΜΕΓΑΣ ΔΙΔΑΣΚΑΛΟΣ</div><img class="signature-img" src="${IMG.grandMaster}" alt=""><div class="signature-line"></div><b>Ιωάννης Μπενετάτος</b></div></div></article>`;
}

// «Εικόνα αξιώματος» της Σχεδίασης σελίδας: δίπλα στη γραμμή του αξιώματος (μετά το «ως» του ΔΙΟΡΙΖΟΜΕΝ ή «τον Τίτλον του …»),
// κεντραρισμένη κάθετα στη γραμμή, στο κέντρο-δεξιά του Α4 (x = αριστερή άκρη σε mm από την άκρη της σελίδας), ώστε να μην ακουμπά το κείμενο·
// dy = κάθετη μετατόπιση (mm) από το κέντρο της γραμμής
export const OFFICE_DEFAULT = { size: 90, x: 150, dy: 0 };
const officeStyle = (px, x, dy) => `width:${px}px;height:${px}px;left:calc(${x}mm - var(--padl, 16mm));transform:translateY(calc(-50% + .75em + ${dy}mm))`;
export function officeImage(html, L, urls = {}) {
  const o = L && L.office;
  if (!o || !(o.file || urls.office)) return html;
  const px = Math.min(300, Math.max(20, +o.size || OFFICE_DEFAULT.size)), x = +o.x || OFFICE_DEFAULT.x, dy = +o.dy || 0;
  const src = urls.office ? ` src="${esc(urls.office)}"` : ` data-dfile="${esc(o.file)}"`;
  const img = `<img class="dec-office-img" data-layer="office" alt=""${src} style="${officeStyle(px, x, dy)}">`;
  return html.replace(/^(ως\n)([^\n]+)$/gm, `$1<span class="dec-office">$2</span>${img}`).replace(/^(τον Τίτλον του [^\n]+)$/m, `<span class="dec-office">$1</span>${img}`);
}

// Επετηρίδα: κάθε Διάταγμα γράφει τα αξιώματα/τίτλους στο member_degrees_offices (δημιουργεί μέλος αν λείπει).
export const epOfficeLabel = (m, a) => (m.action === 'appoint' ? a.office || m.decree_office || '' : m.action === 'award' ? (m.award_office ? 'Πρώην ' + m.award_office : '') : 'Τάξις του Μεγάλου Διδασκάλου δι’ Υπηρεσίας');
function syncOffices(tx, d) {
  tx.remove('member_degrees_offices', (o) => o.decree_id === d.id);
  const m = meta(d);
  for (const a of apps(d)) {
    let mid = a.member_id && tx.get('member_registry', a.member_id) ? a.member_id : null;
    const cand = { surname: a.last_name, first_name: a.first_name, email: a.email, mobile: a.mobile };
    if (!mid) mid = identify(cand, tx) || findMember(tx, cand) || insertMember(tx, cand);
    tx.insert('member_degrees_offices', { member_id: mid, record_type: m.action, degree: '', office: epOfficeLabel(m, a), decree_id: d.id, decree_no: d.decree_no, decree_year: d.decree_year, valid_from: '', valid_to: '', is_current: 1, notes: '' });
  }
}

// ---------------------------------------------------------------- φόρμα
const officeOpts = (sel) => '<option value="">— Επιλογή ενεργού αξιώματος —</option>' + DEC_OFFICES.map(([p, o, r]) => `<option value="${esc(o)}"${o === sel ? ' selected' : ''}>${esc(o)} — Καν. ${r}${p == null ? ' — χωρίς αριθμό προβαδίσματος' : ''}</option>`).join('');
const awardOpts = (sel) => '<option value="">— Επιλογή πρώην Μεγάλου Αξιωματικού —</option>' + AWARD_OFFICES.map(([o]) => `<option value="${esc(o)}"${o === sel ? ' selected' : ''}>${esc('Πρώην ' + o)}</option>`).join('');
function personRow(a = {}) {
  let fn = a.first_name || '', ln = a.last_name || '';
  if (!fn && !ln) [fn, ln] = splitName(a.full_name);
  let dfn = a.decree_first_name || '', dln = a.decree_last_name || '';
  if (!dfn && !dln && a.decree_name) [dfn, dln] = splitName(a.decree_name);
  const v = (x) => esc(x || '');
  return `<div class="card dec-person"><div class="grid">
<div class="full"><label>🔎 Αναζήτηση στο Μητρώο Μελών</label><input class="registry-search" placeholder="Επώνυμο, όνομα, email ή κινητό" autocomplete="off"><small class="muted">Επιλέξτε Αδελφό από το Μητρώο ή συμπληρώστε χειροκίνητα.</small></div>
<input type="hidden" class="mid" value="${v(a.member_id)}">
<div><label>Όνομα</label><input class="fn" value="${v(fn)}" required></div><div><label>Επώνυμο</label><input class="ln" value="${v(ln)}" required></div>
<div class="member-honorific"><label>Τίτλος</label><select class="hon"><option value="">— Επιλογή —</option>${HONORIFIC_OPTIONS.map((o) => `<option${o === a.honorific ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
<div class="member-former-office"><label>Πρώην αξίωμα</label><input class="former" value="${v(a.former_office)}"></div>
<div><label>Email</label><input class="em" value="${v(a.email)}" inputmode="email" required></div><div><label>Κινητό</label><input class="mob" value="${v(a.mobile)}" inputmode="tel" required></div>
<div><label>Όνομα στο Διάταγμα (αιτιατική — προαιρετικό)</label><input class="dfn" value="${v(dfn)}" placeholder="π.χ. Δημήτριον"></div>
<div><label>Επώνυμο στο Διάταγμα (αιτιατική — προαιρετικό)</label><input class="dln" value="${v(dln)}" placeholder="π.χ. Σκιαδόπουλον"></div></div>
<div style="text-align:right"><button type="button" class="btn small" data-act="rmPerson">Αφαίρεση</button></div></div>`;
}

function infoTables() {
  const rows = sortBy(DEC_OFFICES, (x) => (x[0] == null ? 9999 : x[0]), (x) => x[1]).map(([p, o, r]) => [`<b>${p ?? '—'}</b>`, esc(o), `<b>Καν. ${r}</b>`]);
  const groups = {};
  for (const [, o, r] of DEC_OFFICES) (groups[r] ||= []).push(o);
  const grows = [[`<b>Καν. 19</b>`, `<b>ΑΠΟΝΕΜΕΙ</b><br><small>${esc(DEC_BASIS['19'])}</small>`], ...sortBy(Object.keys(groups), Number).map((r) => [`<b>Καν. ${r}</b>`, `<small>${esc(DEC_BASIS[r] || '')}</small><div>${groups[r].map((o) => '• ' + esc(o)).join('<br>')}</div>`])];
  return `<details class="card fold"><summary><b>Πίνακες: Προβάδισμα — Αξίωμα — Κανόνας · Ομαδοποιήσεις κατά Κανόνα</b></summary><div class="cols2" style="margin-top:10px">
${table(['Προβάδισμα', 'Αξίωμα / Διορισμός', 'Κανόνας'], rows)}${table(['Κανόνας', 'Ομαδοποίηση'], grows)}</div></details>
<details class="card fold"><summary><b>Τάξις και προβάδισμα των μελών της Μεγάλης Στοάς (άρθρο 5)</b></summary><ol style="margin-top:10px">${PRECEDENCE.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></details>`;
}

function decreeForm(d, query = {}) {
  const m = d ? meta(d) : { action: ['appoint', 'award', 'service_award'].includes(query.action) ? query.action : 'appoint', award_office: '', decree_office: '', period: `${new Date().getFullYear()} - ${new Date().getFullYear() + 1}` };
  const list = d ? apps(d) : [];
  if (m.action === 'appoint' && !m.decree_office && list.length) m.decree_office = list[0].office || '';
  const key = d ? decreeKey(d) : DECREE_KINDS[query.kind] ? query.kind : 'decree-appoint', gen = key === 'decree-general';
  const gBody = d && gen ? d.body_src || d.body : decreeTemplate('decree-general').body || GENERAL_BODY;
  m.key = key;
  return { m, html: `<div class="dec-split"><div class="dec-formcol"><form id="df">
<div class="card dec-kind"><label>Είδος Διατάγματος (Πρότυπο)</label><div class="dec-kinds">${Object.entries(DECREE_KINDS).map(([k, v]) => `<label class="chip"><input type="radio" name="template_key" value="${k}"${k === key ? ' checked' : ''}${d && d.id ? ' disabled' : ''}><span><b>${esc(v.name)}</b><small>${esc(v.short)}</small></span></label>`).join('')}</div>
<small class="muted">${d && d.id ? 'Το είδος δεν αλλάζει σε εκδομένο Διάταγμα. ' : ''}Σελίδα (φόντο, κεφαλίδα): <a href="#/templates">Πρότυπα</a> → «🎨 Σχεδίαση σελίδας».</small>${d && d.id ? `<input type="hidden" name="template_key" value="${key}">` : ''}</div>
<fieldset class="plainfs" id="generalPart"${gen ? '' : ' disabled hidden'}><div class="card"><div class="grid">
<div class="full"><label>Περί</label><input name="g_matter" value="${esc(d && gen ? d.matter : '')}" placeholder="π.χ. ιδρύσεως της Στοάς «……»"></div>
<div class="full"><label>Κείμενο Διατάγματος</label><textarea name="g_body" style="min-height:320px">${esc(gBody)}</textarea><small class="muted">Από το πρότυπο «ΓΕΝΙΚΟ ΔΙΑΤΑΓΜΑ». Πεδία: ${DECREE_PLACEHOLDERS.map(([k, h]) => `{${esc(k)}} = ${esc(h)}`).join(' · ')}. Γραμμές με ΚΕΦΑΛΑΙΑ τυπώνονται έντονα.</small></div>
<div class="full"><label>🔎 Παραλήπτες από τον Κατάλογο (Στοές, Επαρχίες, μέλη)</label><input id="gPick" placeholder="Στοά, Επαρχία, όνομα…" autocomplete="off"></div>
<div><label>Προς (για το email)</label><input name="g_to_name" value="${esc(d && gen ? d.recipient_name : '')}"></div><div><label>Email παραληπτών</label><input name="g_to_email" value="${esc(d && gen ? d.recipient_email : '')}" placeholder="πολλά με κόμμα"></div>
</div></div></fieldset>
<fieldset class="plainfs" id="appointPart"${gen ? ' disabled hidden' : ''}><div class="card"><div class="grid"><div><label>Πράξη Διατάγματος</label><select name="action" id="dAction">${Object.entries(ACTIONS).map(([k, v]) => `<option value="${k}"${k === m.action ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
<div id="matterWrap"><label>Περί</label><input name="matter" value="${esc(d ? d.matter : '')}"></div></div></div>
<div class="card" id="officeCard"><label id="officeLabel">Ενεργός Μέγας Αξιωματικός</label><select name="office" id="dOffice"></select></div>
<div class="card" id="periodCard"><label>Τεκτονική Περίοδος</label><input name="period" value="${esc(m.period)}" placeholder="2026 - 2027"></div>
<div class="card" id="serviceText" hidden><h3 style="margin-top:0">Σταθερό κείμενο — Τάξις του Μεγάλου Διδασκάλου</h3><p style="text-align:center;white-space:pre-line"><b>ΗΜΕΙΣ</b>
Ο Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος, Σεβασμιώτατος Αδελφός Ιωάννης Μπενετάτος
λαβόντες υπ’ όψιν τον Κανόνα 19 του Βιβλίου Γενικών Νόμων και Κανονισμών,
<b>ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ</b> <b>την Τάξιν του Μεγάλου Διδασκάλου</b> δι’ Υπηρεσίας προς την Τεκτονικήν</p>
<p class="muted">Δεν απαιτείται αξίωμα, τίτλος ή Τεκτονική Περίοδος· εισάγονται μόνο τα στοιχεία του Αδελφού.</p></div>
<h2 id="peopleHead">Διοριζόμενοι Αδελφοί</h2><div id="people">${(list.length ? list : [{}]).map(personRow).join('')}</div></fieldset>
<div class="toolbar"><button type="button" class="btn" data-act="addPerson"${gen ? ' hidden' : ''}>+ Προσθήκη Αδελφού</button><button class="btn primary">${d && d.id ? '💾 Αποθήκευση Διατάγματος' : 'Έκδοση Διατάγματος'}</button>
<a class="btn" href="${d && d.id ? '#/decrees/' + d.id : '#/decrees'}">Ακύρωση</a></div></form></div>
<aside class="dec-live"><div class="dec-live-head">👁 Προεπισκόπηση <small class="muted">— ενημερώνεται καθώς συμπληρώνετε</small></div><div id="dprev" aria-live="polite"></div></aside></div>${infoTables()}` };
}

function mountDecreeForm(el, d, m0) {
  const f = el.querySelector('#df'), sel = el.querySelector('#dOffice'), act = el.querySelector('#dAction');
  let mode = null;
  const sync = () => {
    const a = act.value, service = a === 'service_award', award = a === 'award';
    if (mode !== a && !service) { sel.innerHTML = award ? awardOpts(mode === null ? m0.award_office : '') : officeOpts(mode === null ? m0.decree_office : ''); }
    mode = a;
    el.querySelector('#officeCard').hidden = service;
    el.querySelector('#officeLabel').textContent = award ? 'Πρώην Μέγας Αξιωματικός' : 'Ενεργός Μέγας Αξιωματικός';
    el.querySelector('#periodCard').hidden = a !== 'appoint';
    el.querySelector('#matterWrap').hidden = service;
    const mt = f.querySelector('[name=matter]'); // ΔΙΟΡΙΖΟΜΕΝ → «περί Διορισμού Μεγάλων Αξιωματικών»
    if (a === 'appoint' && !mt.value.trim()) { mt.value = APPOINT_MATTER; mt.dispatchEvent(new Event('input', { bubbles: true })); }
    if (a !== 'appoint' && mt.value === APPOINT_MATTER) { mt.value = ''; mt.dispatchEvent(new Event('input', { bubbles: true })); }
    el.querySelector('#serviceText').hidden = !service;
    el.querySelectorAll('.member-honorific,.member-former-office').forEach((x) => (x.hidden = service));
    el.querySelector('#peopleHead').textContent = service ? 'Στοιχεία Αδελφού που θα λάβει την Τάξη του Μεγάλου Διδασκάλου' : award ? 'Αδελφοί προς Απονομή' : 'Διοριζόμενοι Αδελφοί';
    syncHon();
  };
  const syncHon = () => { if (act.value !== 'appoint') return; const t = (OFFICE_FORMS[sel.value] || [])[2]; if (t) el.querySelectorAll('.dec-person .hon').forEach((h) => (h.value = t)); };
  const wire = (row) => attachPicker(row.querySelector('.registry-search'), memberItems, (mm) => {
    row.querySelector('.mid').value = mm.id; row.querySelector('.fn').value = mm.first_name || ''; row.querySelector('.ln').value = mm.surname || '';
    row.querySelector('.em').value = mm.email || ''; row.querySelector('.mob').value = mm.mobile || ''; syncHon();
  });
  el.querySelectorAll('.dec-person').forEach(wire);
  act.addEventListener('change', sync); sel.addEventListener('change', syncHon);
  sync();
  // Είδος Διατάγματος: Γενικό (ελεύθερο κείμενο) ή Διορισμού ΜΑΞ (πρόσωπα)
  const isGen = () => (f.querySelector('[name=template_key]:checked') || f.querySelector('[name=template_key][type=hidden]') || {}).value === 'decree-general';
  const syncKind = () => {
    const g = isGen(), gp = el.querySelector('#generalPart'), ap = el.querySelector('#appointPart');
    gp.disabled = gp.hidden = !g; ap.disabled = ap.hidden = g; el.querySelector('[data-act=addPerson]').hidden = g;
  };
  f.querySelectorAll('[name=template_key]').forEach((r) => r.addEventListener('change', syncKind));
  syncKind();
  attachPicker(el.querySelector('#gPick'), contactItems, (c) => {
    if (c.email) f.g_to_email.value = [...new Set([...splitEmails(f.g_to_email.value), c.email])].join(', ');
    if (c.name) f.g_to_name.value = [f.g_to_name.value, c.name].filter(Boolean).join(' · ');
  });
  bind(el, {
    addPerson() { const z = document.createElement('div'); z.innerHTML = personRow(); const r = z.firstElementChild; el.querySelector('#people').appendChild(r); wire(r); sync(); },
    rmPerson(_, b) { b.closest('.dec-person').remove(); },
  });
  // Ζωντανή προεπισκόπηση: το Διάταγμα όπως θα εκδοθεί, με «……» όπου λείπει κάτι
  const DOTS = '……';
  const draft = () => {
    const data = Object.fromEntries(new FormData(f)), action = data.action, service = action === 'service_award';
    if (isGen()) {
      const date = d ? d.decree_date : today(), year = d ? d.decree_year : new Date().getFullYear();
      const no = d ? d.decree_no : Math.max(db.all('decree_documents').reduce((x, y) => Math.max(x, Number(y.decree_no) || 0), 0) + 1, Number(db.setting('decree_first_no')) || 513);
      return { template_key: 'decree-general', decree_no: no, decree_year: year, decree_date: date, body: fillGeneral(data.g_body, { matter: String(data.g_matter || '').trim(), date, no: `${no}/${year}` }), rules: JSON.stringify({ action: 'general' }) };
    }
    const office = service ? '' : data.office || '', period = String(data.period || '').trim() || DOTS;
    const matter = service ? SERVICE_MATTER : String(data.matter || '').trim() || DOTS;
    const people = [...el.querySelectorAll('.dec-person')].map((r) => {
      const q = (c) => String((r.querySelector(c) || {}).value || '').trim();
      return { first_name: proper(q('.fn')) || DOTS, last_name: proper(q('.ln')) || DOTS, decree_first_name: proper(q('.dfn')), decree_last_name: proper(q('.dln')),
        honorific: q('.hon'), office: action === 'appoint' ? office || DOTS : '', rule: action === 'appoint' ? (DEC_MAP[office] || {}).rule || '' : '19' };
    });
    const date = d ? d.decree_date : today(), year = d ? d.decree_year : new Date().getFullYear();
    const no = d ? d.decree_no : Math.max(db.all('decree_documents').reduce((x, y) => Math.max(x, Number(y.decree_no) || 0), 0) + 1, Number(db.setting('decree_first_no')) || 513);
    const { body } = decreeBody(matter, people.length ? people : [{ first_name: DOTS, last_name: DOTS }], date, action, action === 'award' ? office || DOTS : '', period);
    return { template_key: 'decree-appoint', decree_no: no, decree_year: year, decree_date: date, body, rules: JSON.stringify({ action }) };
  };
  const pv = el.querySelector('#dprev');
  let tmr;
  const preview = () => { clearTimeout(tmr); tmr = setTimeout(() => { try { pv.innerHTML = decreePaper(draft()); } catch (e) { console.warn(e); } }, 120); };
  f.addEventListener('input', preview); f.addEventListener('change', preview);
  el.addEventListener('click', (e) => { if (e.target.closest('[data-act], .picker-list button')) setTimeout(preview, 50); });
  preview();
  onSubmit(f, async (data) => {
    if (isGen()) {
      const matter = String(data.g_matter || '').trim(), src = String(data.g_body || '').trim(), emails = splitEmails(data.g_to_email), bad = emails.filter((e) => !EMAIL_RE.test(e));
      if (!matter) throw new Error('Συμπληρώστε το «Περί».');
      if (!src) throw new Error('Συμπληρώστε το κείμενο του Διατάγματος.');
      if (bad.length) throw new Error('Μη έγκυρο email: ' + bad.join(', '));
      const id = await db.save(d ? `Διάταγμα ${decreeNo(d)}: ενημέρωση` : `Νέο Γενικό Διάταγμα: ${matter}`, (tx) => {
        const date = d ? d.decree_date : today(), no = d ? d.decree_no : nextDecreeNo(tx), year = d ? d.decree_year : new Date().getFullYear();
        const row = { template_key: 'decree-general', decree_no: no, decree_year: year, decree_date: date, subject: `ΔΙΑΤΑΓΜΑ υπ’ αριθμ. ${no}/${year} – ${matter}`, matter,
          body: fillGeneral(src, { matter, date, no: `${no}/${year}` }), body_src: src, rules: JSON.stringify({ action: 'general' }), appointments: '[]',
          recipient_name: String(data.g_to_name || '').trim(), recipient_email: emails.join(', ') };
        const r = d ? tx.update('decree_documents', d.id, row) : tx.insert('decree_documents', { ...row, status: 'draft' });
        tx.remove('member_degrees_offices', (o) => o.decree_id === r.id);
        return r.id;
      });
      flash(d ? 'Το Διάταγμα αποθηκεύτηκε.' : 'Το Γενικό Διάταγμα εκδόθηκε.'); go(`/decrees/${id}`); return;
    }
    const action = data.action, service = action === 'service_award';
    const matter = service ? SERVICE_MATTER : String(data.matter || '').trim();
    const office = service ? '' : data.office, period = String(data.period || '').trim();
    if (!service && !matter) throw new Error('Συμπληρώστε το «Περί».');
    if (action === 'award' && !AWARD_MAP[office]) throw new Error('Επιλέξτε Πρώην Αξίωμα.');
    if (action === 'appoint' && !DEC_MAP[office]) throw new Error('Επιλέξτε ενεργό Αξίωμα.');
    if (action === 'appoint' && !period) throw new Error('Συμπληρώστε την Τεκτονική Περίοδο.');
    const people = [...el.querySelectorAll('.dec-person')].map((r) => {
      const q = (c) => String(r.querySelector(c).value || '').trim();
      const fn = proper(q('.fn')), ln = proper(q('.ln')), em = q('.em'), mo = q('.mob');
      let hon = q('.hon');
      if (!fn || !ln || !em || !mo) throw new Error('Ελέγξτε όνομα, επώνυμο, email και κινητό κάθε Αδελφού.');
      if (!service && !hon) throw new Error('Επιλέξτε τίτλο Αδελφού.');
      if (action === 'appoint' && DEC_MAP[office].hon_short) hon = DEC_MAP[office].hon_short;
      return { member_id: Number(q('.mid')) || null, registry_no: (db.get('member_registry', Number(q('.mid'))) || {}).registry_no ?? '', first_name: fn, last_name: ln, full_name: `${fn} ${ln}`, decree_first_name: proper(q('.dfn')), decree_last_name: proper(q('.dln')),
        honorific: service ? '' : hon, former_office: service ? '' : q('.former'), email: em, mobile: mo, office: action === 'appoint' ? office : '', rule: action === 'appoint' ? DEC_MAP[office].rule : '19' };
    });
    if (!people.length) throw new Error('Συμπληρώστε τουλάχιστον έναν Αδελφό.');
    const id = await db.save(d ? `Διάταγμα ${decreeNo(d)}: ενημέρωση` : `Νέο Διάταγμα: ${matter}`, (tx) => {
      const date = d ? d.decree_date : today(), no = d ? d.decree_no : nextDecreeNo(tx), year = d ? d.decree_year : new Date().getFullYear();
      const { body, rules } = decreeBody(matter, people, date, action, action === 'award' ? office : '', period);
      const row = { template_key: 'decree-appoint', decree_no: no, decree_year: year, decree_date: date, subject: `ΔΙΑΤΑΓΜΑ υπ’ αριθμ. ${no}/${year} – ${matter}`, body, matter,
        rules: JSON.stringify({ rules, action, award_office: action === 'award' ? office : '', decree_office: action === 'appoint' ? office : '', period: action === 'appoint' ? period : '' }),
        appointments: JSON.stringify(people), recipient_name: people.map((a) => a.full_name).join(', '), recipient_email: [...new Set(people.map((a) => a.email.toLowerCase()))].join(', ') };
      let r;
      if (d) r = tx.update('decree_documents', d.id, row);
      else r = tx.insert('decree_documents', { ...row, status: 'draft' }); // αρ. πρωτοκόλλου μόνο όταν οριστεί «Έτοιμο»
      if (service) tx.remove('member_degrees_offices', (o) => o.decree_id === r.id); else syncOffices(tx, r);
      return r.id;
    });
    flash(d ? 'Το Διάταγμα αποθηκεύτηκε.' : 'Το Διάταγμα εκδόθηκε.'); go(`/decrees/${id}`);
  });
}

function viewDecree({ params }) {
  const d = db.get('decree_documents', params.id);
  if (!d) return '<h1>Δεν βρέθηκε το Διάταγμα</h1>';
  const to = decreeKey(d) === 'decree-general' ? splitEmails(d.recipient_email) : apps(d).map((a) => a.email).filter(Boolean);
  const wa = 'https://wa.me/?text=' + encodeURIComponent(`Παρακαλώ να ελέγξετε το email σας και στα spam.\n\nΔΙΑΤΑΓΜΑ υπ’ αριθμ. ${decreeNo(d)}\n${d.matter}`);
  return {
    title: d.subject,
    html: `<section class="card send-panel noprint"><h3>${esc(DECREE_KINDS[decreeKey(d)].name)} — Αποστολή & Αποθήκευση</h3>${senderBanner('official')}
<div class="toolbar"><button class="btn primary" data-act="pdf">⬇ PDF / Εκτύπωση</button>${mailButtons({ to, cc: db.setting('decree_cc'), subject: d.subject, body: d.body, kind: 'official' }, '✉ Αποστολή με Email')}
<a class="btn" target="_blank" rel="noopener" href="${wa}">WhatsApp μήνυμα</a>${d.status === 'ready' ? '' : '<button class="btn primary" data-act="ready">✅ Έτοιμο: απόδοση αρ. πρωτοκόλλου</button>'}</div>
<p class="send-help">Αρ. Πρωτ.: <b>${esc(d.protocol_no || 'θα δοθεί όταν οριστεί «Έτοιμο»')}</b>${d.protocol_seq ? ' <button class="btn small" data-act="protocol">✏ Αλλαγή αρ. πρωτοκόλλου</button>' : ''} · Κοινοποίηση: ${esc(db.setting('decree_cc'))} (αλλαγή στις Ρυθμίσεις).</p>${driveBox(d, fileName(d))}
<div class="toolbar"><button class="btn" data-act="word">⬇ Word</button></div></section>
<div class="toolbar noprint"><a class="btn" href="#/decrees/${d.id}/edit">Επεξεργασία Διατάγματος</a><a class="btn" href="#/decrees/new?copy_from=${d.id}">Νέο πάνω σε αυτό</a><a class="btn" href="#/decrees">Αρχείο Διαταγμάτων</a>
<button class="btn danger" data-act="del">Διαγραφή</button></div><div class="print-area">${decreePaper(d)}</div>`,
    mount(el) {
      bind(el, {
        pdf: () => printPaper(fileName(d)),
        async word() { download(fileName(d) + '.docx', await decreeDocxBlob(d)); },
        async drive() { await saveDocToDrive('decree_documents', d.id, fileName(d), null, el.querySelector('.print-area .paper')); flash('Αποθηκεύτηκε στο Drive (Word + PDF).'); go(`/decrees/${d.id}`); },
        async ready() {
          const manual = d.protocol_seq ? 0 : askProtocol({ table: 'decree_documents', id: d.id });
          if (manual === null) return;
          await db.save(`Διάταγμα ${decreeNo(d)}: έτοιμο`, (tx) => { const p = d.protocol_seq ? null : nextProtocol(tx, 'Διάταγμα', '', manual); tx.update('decree_documents', d.id, { status: 'ready', ...(p ? { protocol_seq: p.seq, protocol_year: p.year, protocol_no: p.no } : {}) }); });
          flash('Το Διάταγμα είναι έτοιμο και πήρε αριθμό πρωτοκόλλου.'); go(`/decrees/${d.id}`);
        },
        async protocol() {
          const n = askProtocol({ table: 'decree_documents', id: d.id }, Number(d.protocol_seq));
          if (!n) return;
          await db.save(`Διάταγμα ${decreeNo(d)}: αρ. πρωτοκόλλου ${n}`, (tx) => { claimProtocol(tx, n); tx.update('decree_documents', d.id, { protocol_seq: n, protocol_no: String(n) }); });
          flash(`Ο αριθμός πρωτοκόλλου άλλαξε σε ${n}.`); go(`/decrees/${d.id}`);
        },
        async del() {
          if (!confirmDo('Οριστική διαγραφή του Διατάγματος;')) return;
          await db.save(`Διαγραφή Διατάγματος ${decreeNo(d)}`, (tx) => { tx.remove('member_degrees_offices', (o) => o.decree_id === d.id); tx.remove('decree_documents', d.id); });
          flash('Το Διάταγμα διαγράφηκε.'); go('/decrees');
        },
      });
    },
  };
}

// ---------------------------------------------------------------- Σχεδίαση σελίδας προτύπου Διατάγματος
// Εικόνα κεφαλίδας και εικόνα φόντου: ανέβασμα, θέση και διαστάσεις (mm) πάνω στο Α4 — με σύρσιμο ή με αριθμούς.
const A4 = { w: 210, h: 297 };
const LAYER_LABEL = { header: 'Κεφαλίδα (εικόνα στην κορυφή)', bg: 'Φόντο (εικόνα πίσω από το κείμενο)' };
export const APPOINT_MATTER = 'Διορισμού Μεγάλων Αξιωματικών'; // «Περί» όταν η πράξη είναι ΔΙΟΡΙΖΟΜΕΝ
function sampleDecree(key) {
  const date = today(), year = new Date().getFullYear(), no = Math.max(db.all('decree_documents').reduce((x, y) => Math.max(x, Number(y.decree_no) || 0), 0) + 1, Number(db.setting('decree_first_no')) || 513);
  if (key === 'decree-general') return { template_key: key, decree_no: no, decree_year: year, decree_date: date, rules: '{"action":"general"}', body: fillGeneral(decreeTemplate(key).body || GENERAL_BODY, { matter: 'ιδρύσεως της Στοάς «Δείγμα»', date, no: `${no}/${year}` }) };
  const { body } = decreeBody(APPOINT_MATTER, [{ first_name: 'Ιωάννης', last_name: 'Παπαδόπουλος', office: 'Μέγας Γραμματεύς', honorific: 'Πσεβ. Αδ.', rule: (DEC_MAP['Μέγας Γραμματεύς'] || {}).rule || '' }], date, 'appoint', '', `${year} - ${year + 1}`);
  return { template_key: key, decree_no: no, decree_year: year, decree_date: date, rules: '{"action":"appoint"}', body };
}
function designPage({ params }) {
  const t = db.get('letter_templates', params.id);
  if (!t || t.kind !== 'decree') return '<h1>Δεν βρέθηκε πρότυπο Διατάγματος</h1>';
  const num = (k, f, label, step = 0.5) => `<label>${label}<input type="number" step="${step}" data-k="${k}" data-f="${f}"></label>`;
  const card = (k) => `<div class="card dz-layer" data-layer="${k}"><h3 style="margin-top:0">${esc(LAYER_LABEL[k])}</h3>
<label class="dz-file">🖼 Ανέβασμα εικόνας (PNG, JPG, WEBP)<input type="file" accept="image/png,image/jpeg,image/webp" data-up="${k}"></label>
<div class="dz-has" data-has="${k}"><div class="dz-nums">${num(k, 'x', 'Θέση X (mm)')}${num(k, 'y', 'Θέση Y (mm)')}${num(k, 'w', 'Πλάτος (mm)')}${num(k, 'h', 'Ύψος (mm)')}</div>
<label class="chk"><input type="checkbox" data-lock="${k}" checked> Διατήρηση αναλογιών</label>
${k === 'bg' ? '<label>Διαφάνεια<input type="range" min="0.05" max="1" step="0.05" data-k="bg" data-f="opacity"></label>' : ''}
<div class="toolbar"><button type="button" class="btn small" data-preset="${k}:full">${k === 'bg' ? 'Όλη η σελίδα' : 'Όλο το πλάτος'}</button><button type="button" class="btn small" data-preset="${k}:center">Κέντρο οριζόντια</button>
<button type="button" class="btn small danger" data-preset="${k}:remove">Αφαίρεση εικόνας</button></div></div>
<small class="muted" data-none="${k}">${k === 'header' ? 'Χωρίς εικόνα: χρησιμοποιείται η κανονική κεφαλίδα (θυρεός και τίτλοι).' : 'Χωρίς φόντο.'}</small></div>`;
  const headCard = `<div class="card dz-layer" data-layer="head"><h3 style="margin-top:0">Κεφαλίδα κειμένων (builder)</h3>
<label class="chk"><input type="checkbox" id="hdOn"> Προσαρμοσμένη κεφαλίδα — έμβλημα και γραμμές κειμένου</label>
<div id="hdBox"><div class="dz-nums"><label class="chk"><input type="checkbox" id="hdEmb"> Έμβλημα</label><label>Πλάτος εμβλήματος (mm)<input type="number" step="1" id="hdEmbW"></label></div>
<div id="hdLines"></div><div class="toolbar"><button type="button" class="btn small" data-hd="add">+ Γραμμή</button><button type="button" class="btn small" data-hd="reset">↺ Επαναφορά από τις Ρυθμίσεις</button></div></div>
<small class="muted">Ισχύει όταν δεν υπάρχει εικόνα κεφαλίδας. Χωρίς προσαρμογή: η κανονική κεφαλίδα (Ρυθμίσεις).</small></div>`;
  const officeCard = `<div class="card dz-layer" data-layer="office"><h3 style="margin-top:0">Εικόνα αξιώματος (δίπλα στο αξίωμα του διορισμού)</h3>
<label class="dz-file">🖼 Ανέβασμα εικόνας (JPEG, PNG)<input type="file" accept="image/jpeg,image/png,image/webp" data-up="office"></label>
<div class="dz-has" data-has="office"><div class="dz-nums"><label>Μέγεθος (px, τετράγωνο)<input type="number" step="1" data-o="size"></label><label>Θέση X (mm από αριστερά)<input type="number" step="0.5" data-o="x"></label><label>Κάθετη μετατόπιση (mm, + κάτω)<input type="number" step="0.5" data-o="dy"></label></div>
<small class="muted">Στην προεπισκόπηση: σύρετε την εικόνα (πλαίσιο «Αξίωμα») για μετακίνηση και τη γωνία ◢ για μέγεθος.</small>
<div class="toolbar"><button type="button" class="btn small" data-opreset="default">90×90 · κέντρο-δεξιά</button><button type="button" class="btn small danger" data-preset="office:remove">Αφαίρεση εικόνας</button></div></div>
<small class="muted" data-none="office">Χωρίς εικόνα. Μπαίνει στο ύψος της γραμμής του αξιώματος, στο δεξί μισό της σελίδας, χωρίς να ακουμπά το κείμενο.</small></div>`;
  const diorCard = `<div class="card dz-layer" data-layer="dior"><h3 style="margin-top:0">ΔΙΟΡΙΖΟΜΕΝ (εικόνα της πράξης)</h3>
<label class="dz-file">🖼 Άλλη εικόνα για το ΔΙΟΡΙΖΟΜΕΝ (PNG, JPEG)<input type="file" accept="image/png,image/jpeg,image/webp" data-up="dior"></label>
<div class="dz-nums"><label>Πλάτος (mm)<input type="number" step="0.5" data-a="w"></label><label>Ύψος (mm)<input type="number" step="0.5" data-a="h"></label>
<label>Κάθετη μετατόπιση (mm, + κάτω)<input type="number" step="0.5" data-a="dy"></label></div>
<div><label class="chk"><input type="checkbox" id="dLock" checked> Διατήρηση αναλογιών</label></div>
<div class="toolbar"><button type="button" class="btn small" data-apreset="default">↺ Προεπιλεγμένο μέγεθος</button><button type="button" class="btn small" data-apreset="orig" id="dOrig">Αρχική εικόνα</button></div>
<small class="muted">Πάντα στο κέντρο της σελίδας. Στην προεπισκόπηση: σύρετε πάνω-κάτω (πλαίσιο «ΔΙΟΡΙΖΟΜΕΝ») και τη γωνία ◢ για μέγεθος.</small></div>`;
  return {
    title: 'Σχεδίαση σελίδας',
    html: `<p><a href="#/templates">← Πρότυπα</a></p><h1>🎨 Σχεδίαση σελίδας — ${esc(t.name)}</h1>
<p class="muted">Ανεβάστε εικόνα κεφαλίδας και φόντου και τοποθετήστε τες στη σελίδα Α4 (210 × 297 mm): σύρετε την εικόνα για να τη μετακινήσετε και τη γωνία ◢ για να αλλάξετε μέγεθος — ή γράψτε τις τιμές σε mm. Ισχύει για κάθε Διάταγμα αυτού του είδους (οθόνη, εκτύπωση, PDF).</p>
<div class="dz-split"><div class="dz-controls">${card('header')}${headCard}${diorCard}${officeCard}${card('bg')}
<div class="toolbar"><button class="btn primary" data-act="saveLayout">💾 Αποθήκευση σχεδίασης</button><a class="btn" href="#/templates">Ακύρωση</a></div></div>
<div class="dz-page"><div class="dz-wrap" id="dzp"></div></div></div>`,
    mount(el) {
      const L = JSON.parse(JSON.stringify(layoutOf(t))), urls = {}, pending = {}, ratio = {};
      const sample = sampleDecree(t.key);
      const box = el.querySelector('#dzp');
      const r1 = (v) => Math.round(v * 10) / 10;
      const syncInputs = () => {
        for (const k of ['header', 'bg']) {
          const has = !!(L[k] && (L[k].file || urls[k]));
          el.querySelector(`[data-has=${k}]`).hidden = !has; el.querySelector(`[data-none=${k}]`).hidden = has;
          if (has) for (const i of el.querySelectorAll(`[data-k=${k}]`)) if (document.activeElement !== i) i.value = L[k][i.dataset.f] ?? (i.dataset.f === 'opacity' ? 1 : 0);
        }
        const ho = !!(L.office && (L.office.file || urls.office));
        el.querySelector('[data-has=office]').hidden = !ho; el.querySelector('[data-none=office]').hidden = ho;
        if (ho) for (const i of el.querySelectorAll('[data-o]')) if (document.activeElement !== i) i.value = L.office[i.dataset.o] ?? OFFICE_DEFAULT[i.dataset.o];
        const dv = diorOf(L);
        for (const i of el.querySelectorAll('[data-a]')) if (document.activeElement !== i) i.value = dv[i.dataset.a];
        el.querySelector('#dOrig').style.display = dv.file || urls.dior ? '' : 'none';
        const on = headOn(L.head);
        el.querySelector('#hdOn').checked = on; el.querySelector('#hdBox').hidden = !on;
        if (on) { el.querySelector('#hdEmb').checked = L.head.emblem !== false; if (document.activeElement !== el.querySelector('#hdEmbW')) el.querySelector('#hdEmbW').value = L.head.emblem_w ?? 34; }
      };
      // γραμμές της κεφαλίδας (ξαναχτίζονται μόνο σε προσθήκη/αφαίρεση/μετακίνηση, ώστε να μη χάνεται η εστίαση)
      const COLORS = { navy: 'Μπλε', gold: 'Χρυσό', black: 'Μαύρο' };
      const drawLines = () => {
        const box2 = el.querySelector('#hdLines');
        box2.innerHTML = headOn(L.head) ? L.head.lines.map((l, i) => `<div class="hd-line" data-i="${i}"><input data-f="text" value="${esc(l.text || '')}" placeholder="Κείμενο γραμμής ${i + 1}">
<div class="hd-opts"><label>pt<input type="number" step="0.5" data-f="size" value="${esc(l.size ?? 11)}"></label><label class="chk"><input type="checkbox" data-f="bold"${l.bold ? ' checked' : ''}><b>B</b></label>
<label class="chk"><input type="checkbox" data-f="italic"${l.italic ? ' checked' : ''}><i>I</i></label><select data-f="color">${Object.entries(COLORS).map(([v, n]) => `<option value="${v}"${(l.color || 'navy') === v ? ' selected' : ''}>${n}</option>`).join('')}</select>
<button type="button" class="btn small" data-hd="up" title="Πάνω">↑</button><button type="button" class="btn small" data-hd="down" title="Κάτω">↓</button><button type="button" class="btn small danger" data-hd="del" title="Αφαίρεση">✕</button></div></div>`).join('') : '';
      };
      const place = (k) => { // ενημέρωση εικόνας + πλαισίου χωρίς νέα απόδοση
        const p = box.querySelector('.paper'); if (!p) return;
        for (const n of p.querySelectorAll(`[data-layer=${k}]`)) Object.assign(n.style, { left: L[k].x + 'mm', top: L[k].y + 'mm', width: L[k].w + 'mm', height: L[k].h + 'mm' });
        if (k === 'header') { const top = layoutTop(L, urls); if (top != null) p.style.setProperty('--pt', top + 'mm'); }
      };
      // εικόνα αξιώματος: ενημέρωση εικόνων και πλαισίου χωρίς νέα απόδοση (το πλαίσιο πάνω στην 1η εικόνα)
      const placeOffice = () => {
        const p = box.querySelector('.paper'), o = L.office; if (!p || !o) return;
        const px = Math.min(300, Math.max(20, +o.size || OFFICE_DEFAULT.size));
        p.querySelectorAll('.dec-office-img').forEach((i) => { i.style.cssText = officeStyle(px, +o.x || OFFICE_DEFAULT.x, +o.dy || 0); });
        const i = p.querySelector('.dec-office-img'), h = p.querySelector('.dz-office'); if (!i || !h) return;
        const pr = p.getBoundingClientRect(), ir = i.getBoundingClientRect(), mm = A4.w / pr.width;
        Object.assign(h.style, { left: (ir.left - pr.left) * mm + 'mm', top: (ir.top - pr.top) * mm + 'mm', width: ir.width * mm + 'mm', height: ir.height * mm + 'mm' });
      };
      // ΔΙΟΡΙΖΟΜΕΝ: ενημέρωση εικόνας και πλαισίου χωρίς νέα απόδοση
      const placeDior = () => {
        const p = box.querySelector('.paper'); if (!p) return;
        const a = p.querySelector('.act-art.diorizomen'), h = p.querySelector('.dz-dior'); if (!a) return;
        a.style.cssText = diorStyle(diorOf(L));
        if (!h) return;
        const pr = p.getBoundingClientRect(), ar = a.getBoundingClientRect(), mm = A4.w / pr.width;
        Object.assign(h.style, { left: (ar.left - pr.left) * mm + 'mm', top: (ar.top - pr.top) * mm + 'mm', width: ar.width * mm + 'mm', height: ar.height * mm + 'mm' });
      };
      const render = () => {
        box.innerHTML = decreePaper(sample, { layout: L, urls });
        const p = box.querySelector('.paper');
        for (const k of ['bg', 'header']) {
          if (!(L[k] && (L[k].file || urls[k]))) continue;
          const h = document.createElement('div');
          h.className = `dz-box dz-${k}`; h.dataset.layer = k; h.title = 'Σύρετε για μετακίνηση · γωνία για μέγεθος';
          h.innerHTML = `<span class="dz-tag">${k === 'bg' ? 'Φόντο' : 'Κεφαλίδα'}</span><span class="dz-h" data-resize="${k}">◢</span>`;
          p.appendChild(h); place(k);
        }
        if (p.querySelector('.act-art.diorizomen')) {
          const h = document.createElement('div');
          h.className = 'dz-box dz-dior'; h.dataset.layer = 'dior'; h.title = 'Σύρετε πάνω-κάτω · γωνία για μέγεθος';
          h.innerHTML = '<span class="dz-tag">ΔΙΟΡΙΖΟΜΕΝ</span><span class="dz-h" data-resize="dior">◢</span>';
          p.appendChild(h); placeDior();
        }
        if (p.querySelector('.dec-office-img')) {
          const h = document.createElement('div');
          h.className = 'dz-box dz-office'; h.dataset.layer = 'office'; h.title = 'Σύρετε για μετακίνηση · γωνία για μέγεθος';
          h.innerHTML = '<span class="dz-tag">Αξίωμα</span><span class="dz-h" data-resize="office">◢</span>';
          p.appendChild(h); placeOffice();
        }
        // τα πλαίσια ακολουθούν τη διάταξη (γραμματοσειρές, εικόνες που φορτώνουν αργότερα)
        if (ro) ro.disconnect();
        ro = new ResizeObserver(() => { placeDior(); placeOffice(); });
        ro.observe(p.querySelector('.decbody'));
        syncInputs();
      };
      let ro = null;
      // σύρσιμο / αλλαγή μεγέθους (px → mm με βάση το πλάτος της σελίδας στην οθόνη)
      box.addEventListener('pointerdown', (e) => {
        const b = e.target.closest('.dz-box'); if (!b) return;
        e.preventDefault();
        const k = b.dataset.layer, resize = !!e.target.closest('[data-resize]'), p = box.querySelector('.paper');
        if (k === 'dior') L.dior = diorOf(L);
        const mm = A4.w / p.getBoundingClientRect().width, start = { ...L[k] }, x0 = e.clientX, y0 = e.clientY;
        b.setPointerCapture(e.pointerId);
        const move = (ev) => {
          const dx = (ev.clientX - x0) * mm, dy = (ev.clientY - y0) * mm;
          if (k === 'dior') { // πάντα στο κέντρο: μόνο κάθετη μετατόπιση· η γωνία αλλάζει πλάτος (και ύψος)
            if (resize) {
              const w = Math.max(5, r1(start.w + 2 * dx)); // κεντραρισμένο: η γωνία απλώνει και προς τις δύο πλευρές
              L.dior.w = w; L.dior.h = el.querySelector('#dLock').checked ? r1(w * (ratio.dior || DIOR_RATIO)) : Math.max(3, r1(start.h + dy));
            } else L.dior.dy = r1((+start.dy || 0) + dy);
            placeDior(); syncInputs(); return;
          }
          if (k === 'office') { // μέγεθος σε px (1 mm = 96/25.4 px), θέση X και κάθετη μετατόπιση σε mm
            if (resize) L.office.size = Math.max(20, Math.min(300, Math.round((+start.size || OFFICE_DEFAULT.size) + dx * 96 / 25.4)));
            else { L.office.x = r1((+start.x || OFFICE_DEFAULT.x) + dx); L.office.dy = r1((+start.dy || 0) + dy); }
            placeOffice(); syncInputs(); return;
          }
          if (resize) {
            const w = Math.max(5, r1(start.w + dx));
            L[k].w = w; L[k].h = el.querySelector(`[data-lock=${k}]`).checked && ratio[k] ? r1(w * ratio[k]) : Math.max(5, r1(start.h + dy));
          } else { L[k].x = r1(start.x + dx); L[k].y = r1(start.y + dy); }
          place(k); syncInputs();
        };
        const up = () => { b.removeEventListener('pointermove', move); b.removeEventListener('pointerup', up); render(); };
        b.addEventListener('pointermove', move); b.addEventListener('pointerup', up);
      });
      const headInput = (e) => {
        const t = e.target;
        if (t.id === 'hdOn') { L.head = t.checked ? (L.head && L.head.lines ? { ...L.head, on: true } : defaultHead()) : { ...(L.head || {}), on: false }; drawLines(); render(); return true; }
        if (!headOn(L.head)) return false;
        if (t.id === 'hdEmb') { L.head.emblem = t.checked; render(); return true; }
        if (t.id === 'hdEmbW') { L.head.emblem_w = Number(t.value) || 34; render(); return true; }
        const row = t.closest('.hd-line'); if (!row || !t.dataset.f) return false;
        const l = L.head.lines[Number(row.dataset.i)], f = t.dataset.f;
        l[f] = t.type === 'checkbox' ? t.checked : f === 'size' ? Number(t.value) || 11 : t.value;
        render(); return true;
      };
      el.addEventListener('input', (e) => {
        if (headInput(e)) return;
        if (e.target.dataset.a) {
          const v = Number(e.target.value); if (!Number.isFinite(v)) return;
          const f = e.target.dataset.a, lock = el.querySelector('#dLock').checked, rt = ratio.dior || DIOR_RATIO;
          L.dior = diorOf(L); L.dior[f] = v;
          if (lock && f === 'w') L.dior.h = r1(v * rt); if (lock && f === 'h') L.dior.w = r1(v / rt);
          placeDior(); syncInputs(); return;
        }
        if (e.target.dataset.o && L.office) { const v = Number(e.target.value); if (Number.isFinite(v)) { L.office[e.target.dataset.o] = v; placeOffice(); } return; }
        const i = e.target; if (!i.dataset.k || !L[i.dataset.k]) return;
        const k = i.dataset.k, f = i.dataset.f, v = Number(i.value);
        if (!Number.isFinite(v)) return;
        L[k][f] = v;
        if (el.querySelector(`[data-lock=${k}]`).checked && ratio[k]) { if (f === 'w') L[k].h = r1(v * ratio[k]); if (f === 'h') L[k].w = r1(v / ratio[k]); }
        if (f === 'opacity') render(); else { place(k); syncInputs(); }
      });
      el.addEventListener('change', async (e) => {
        if (e.target.type === 'checkbox' || e.target.tagName === 'SELECT') { if (headInput(e)) return; }
        const k = e.target.dataset.up; if (!k || !e.target.files[0]) return;
        const file = e.target.files[0], ext = (file.name.split('.').pop() || 'png').toLowerCase().replace('jpeg', 'jpg');
        if (file.size > 6 * 1024 * 1024) { e.target.value = ''; toast('Η εικόνα είναι μεγαλύτερη από 6 MB.', 'error'); return; }
        const bytes = new Uint8Array(await file.arrayBuffer()), url = URL.createObjectURL(file);
        const img = new Image(); img.src = url; await img.decode().catch(() => {});
        ratio[k] = img.naturalWidth ? img.naturalHeight / img.naturalWidth : 0;
        pending[k] = { bytes, ext: ['png', 'jpg', 'webp'].includes(ext) ? ext : 'png' }; urls[k] = url;
        const old = L[k] || {};
        if (k === 'bg') L.bg = { file: old.file || '', x: 0, y: 0, w: A4.w, h: A4.h, opacity: old.opacity ?? 0.25 };
        else if (k === 'dior') { const o = diorOf(L); L.dior = { ...o, file: o.file || '', h: r1(o.w * (ratio.dior || DIOR_RATIO)) }; }
        else if (k === 'office') L.office = { file: old.file || '', size: old.size || OFFICE_DEFAULT.size, x: old.x || OFFICE_DEFAULT.x };
        else { const w = 180; L.header = { file: old.file || '', x: 15, y: 8, w, h: r1(ratio.header ? w * ratio.header : 40) }; }
        if (k === 'bg') el.querySelector('[data-lock=bg]').checked = false;
        e.target.value = '';
        render();
      });
      el.addEventListener('click', (e) => {
        const h = e.target.closest('[data-hd]');
        if (h) {
          const act = h.dataset.hd, row = h.closest('.hd-line'), i = row ? Number(row.dataset.i) : -1;
          if (act === 'reset') L.head = defaultHead();
          else if (headOn(L.head)) {
            const xs = L.head.lines;
            if (act === 'add') xs.push({ text: '', size: 11, color: 'navy' });
            if (act === 'del') xs.splice(i, 1);
            if (act === 'up' && i > 0) [xs[i - 1], xs[i]] = [xs[i], xs[i - 1]];
            if (act === 'down' && i < xs.length - 1) [xs[i + 1], xs[i]] = [xs[i], xs[i + 1]];
          }
          drawLines(); render(); return;
        }
        const ap = e.target.closest('[data-apreset]');
        if (ap) {
          const o = diorOf(L);
          if (ap.dataset.apreset === 'orig') { L.dior = { ...o, file: '' }; delete urls.dior; delete pending.dior; ratio.dior = DIOR_RATIO; o.file = ''; }
          L.dior = { ...diorOf(L), w: DIOR_DEFAULT.w, h: r1(DIOR_DEFAULT.w * (ratio.dior || DIOR_RATIO)), dy: 0 };
          render(); return;
        }
        if (e.target.closest('[data-opreset]') && L.office) { Object.assign(L.office, OFFICE_DEFAULT); render(); return; }
        const b = e.target.closest('[data-preset]'); if (!b) return;
        const [k, what] = b.dataset.preset.split(':');
        if (what === 'remove') { L[k] = null; delete urls[k]; delete pending[k]; }
        if (what === 'full') { if (k === 'bg') Object.assign(L.bg, { x: 0, y: 0, w: A4.w, h: A4.h }); else Object.assign(L.header, { x: 0, y: 0, w: A4.w, h: r1(ratio.header ? A4.w * ratio.header : L.header.h) }); }
        if (what === 'center') L[k].x = r1((A4.w - L[k].w) / 2);
        render();
      });
      // λόγος διαστάσεων για ήδη αποθηκευμένες εικόνες
      for (const k of ['header', 'bg']) if (L[k] && L[k].file && L[k].w) ratio[k] = L[k].h / L[k].w;
      ratio.dior = L.dior && L.dior.w && L.dior.h ? L.dior.h / L.dior.w : DIOR_RATIO;
      drawLines();
      bind(el, {
        async saveLayout() {
          await db.save(`Πρότυπο «${t.name}»: σχεδίαση σελίδας`, (tx) => {
            const out = JSON.parse(JSON.stringify(L));
            for (const [k, f] of Object.entries(pending)) {
              const path = `templates/${t.key || 'tpl' + t.id}-${k}-${Date.now()}.${f.ext}`;
              tx.putFile(path, f.bytes); out[k].file = path;
            }
            for (const k of ['header', 'bg', 'office']) if (out[k] && !out[k].file) out[k] = null;
            tx.update('letter_templates', t.id, { layout: out });
          });
          flash('Η σχεδίαση σελίδας αποθηκεύτηκε.'); go(`/templates/${t.id}/design`);
        },
      });
      render();
    },
  };
}

function archive({ query }) {
  let xs = sortBy(db.all('decree_documents'), (d) => -(d.decree_year || 0), (d) => -(d.decree_no || 0));
  if (query.q) xs = xs.filter((d) => (/^\d+$/.test(query.q) && String(d.decree_no) === query.q) || matches(query.q, d.subject, d.matter, d.recipient_name, d.recipient_email));
  if (query.from) xs = xs.filter((d) => (d.decree_date || '') >= query.from);
  if (query.to) xs = xs.filter((d) => (d.decree_date || '') <= query.to);
  return {
    title: 'Αρχείο Διαταγμάτων',
    html: `<div class="hero"><div><h1>Αρχείο Διαταγμάτων</h1><p class="muted">Ανεξάρτητο από το Αρχείο Επιστολών.</p></div><a class="btn primary" href="#/decrees/new">+ Νέο Διάταγμα</a></div>${notice(query.msg)}
<form class="filters" id="flt"><input name="q" value="${esc(query.q || '')}" placeholder="Αριθμός, περί, όνομα" autofocus><input type="date" name="from" value="${esc(query.from || '')}"><input type="date" name="to" value="${esc(query.to || '')}"><button>Αναζήτηση</button></form>
${table(['Αρ. Διατάγματος', 'Ημερομηνία', 'Περί', 'Αδελφοί', 'Ενέργειες'], xs.slice(0, 500).map((d) => [`<span class="official-number">${esc(decreeNo(d))}</span>`, esc(fmtDate(d.decree_date)), esc(d.matter), esc(d.recipient_name),
  `<a href="#/decrees/${d.id}">Άνοιγμα</a> · <a href="#/decrees/${d.id}/edit">Επεξεργασία</a> · <a href="#/decrees/new?copy_from=${d.id}">Νέο πάνω σε αυτό</a>`]), 'Δεν βρέθηκαν Διατάγματα.')}`,
    mount(el) { onSubmit(el.querySelector('#flt'), (q) => go('/decrees', q)); },
  };
}

module({
  id: 'decrees',
  routes: {
    '/decrees': archive,
    '/decrees/new': ({ query }) => {
      let src = query.copy_from ? db.get('decree_documents', query.copy_from) : null;
      if (src) src = { ...src, id: undefined };
      const { m, html } = decreeForm(src, query);
      const n = Math.max(db.all('decree_documents').reduce((x, d) => Math.max(x, Number(d.decree_no) || 0), 0) + 1, Number(db.setting('decree_first_no')) || 513);
      return { title: 'Νέο Διάταγμα', html: `<h1>Νέο Διάταγμα</h1><div class="card decree-banner"><b>Επόμενος αριθμός Διατάγματος: <span class="official-number">${n}/${new Date().getFullYear()}</span></b> · Ξεχωριστό αρχείο — δεν δημιουργεί επιστολή.</div>${html}`,
        mount: (el) => mountDecreeForm(el, null, m) };
    },
    '/decrees/:id': viewDecree,
    '/templates/:id/design': designPage,
    '/decrees/:id/edit': ({ params }) => {
      const d = db.get('decree_documents', params.id);
      if (!d) return '<h1>Δεν βρέθηκε το Διάταγμα</h1>';
      const { m, html } = decreeForm(d);
      return { title: 'Επεξεργασία Διατάγματος', html: `<h1>Επεξεργασία Διατάγματος <span class="official-number">${esc(decreeNo(d))}</span></h1>${html}`, mount: (el) => mountDecreeForm(el, d, m) };
    },
  },
  tile: { order: 20, render: () => {
    const xs = db.all('decree_documents'), y = new Date().getFullYear();
    return `<div class="dtile gold"><h3><a href="#/decrees">Διατάγματα</a></h3><div class="big">${xs.filter((d) => Number(d.decree_year) === y).length} φέτος</div><div class="muted">${xs.length} συνολικά</div>
<div class="acts"><a class="btn primary" href="#/decrees/new">+ Νέο</a><a class="btn" href="#/decrees">Αρχείο</a></div></div>`;
  } },
});
