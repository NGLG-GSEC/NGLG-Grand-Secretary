// Επιστολές — νέα (με πρότυπο ή «πάνω σε» παλαιότερη), προβολή στο επίσημο έντυπο, PDF/εκτύπωση, αποστολή, αρχείο.
// Και τα Πρότυπα Επιστολών.
import { db } from '../core/store.js';
import { module, onSubmit, go, flash, toast, bind, confirmDo, table, notice, actor, ACTORS } from '../core/app.js';
import { crud } from '../core/crud.js';
import { esc, foldName, today, fmtDate, matches, sortBy, safeFileName, latinFileName, EMAIL_RE, splitEmails, download, outgoingProtocolBtn } from '../core/util.js';
import { richPlain } from '../core/rich.js';
import { letterPaper, printPaper, signerProfile, IMG, fitPaper, letterFields, LETTER_FIELDS, protocolImage, hasProtocolField } from '../core/paper.js';
import { makeDocx, letterBlocks } from '../core/docx.js';
import { docTitle, driveBox, saveDocToDrive } from '../core/drive.js';
import { mailButtons, senderBanner, withLetterCc, senderFor, MAIL_SENDERS } from '../core/mail.js';
import { sgyEmails, SGY_TO_NAME } from './sgy.js';
import { mailSheet, bccWithout } from '../core/gmail.js';
import { attachPicker, contactItems } from '../core/pickers.js';
import { nextProtocol, askProtocol, askNextProtocol, claimProtocol, setNextProtocol, suggestedProtocol, legacyDecreeLetterIds } from './protocol.js';
import { lodgesAll, lodgeByNumber } from './lodges.js';
import { provinceLetter } from './visits.js';
import { PLACEHOLDERS, hasPlaceholders, fillPlaceholders, fillContext, lodgeRecipients, missingPlaceholders, GM_VISIT, REP_VISIT, repRecipients, dayWithArticle, dateWords } from './letter-fill.js';

const TEMPLATE_SEED = [['Ελεύθερη επιστολή', ''], ['Επίσκεψη ΜΔ', 'Αγαπητοί Αδελφοί,\n\n[Κορμός επιστολής επίσκεψης Μεγάλου Διδασκάλου]'], ['Επίσκεψη ΜΔ με εκπρόσωπο', 'Αγαπητοί Αδελφοί,\n\n[Κορμός επιστολής επίσκεψης με εκπρόσωπο]'],
  ['Συλλυπητήρια', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο συλλυπητηρίων]'], ['Συγχαρητήρια', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο συγχαρητηρίων]'], ['Ευχαριστήρια', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο ευχαριστηρίων]'],
  ['Πρόσκληση', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο πρόσκλησης]'], ['Ανακοίνωση', 'Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο ανακοίνωσης]']];
db.seed('letter_templates', () => TEMPLATE_SEED.map(([name, body], i) => ({ id: i + 1, name, body, active: 1 })));

const PH_HELP = 'Πεδία που συμπληρώνονται από τη βάση: ' + PLACEHOLDERS.map(([k, d]) => `{${k}} = ${d}`).join(' · ') + ' · Πεδία της επιστολής: ' + LETTER_FIELDS.map(([k, d]) => `{${k}} = ${d}`).join(' · ');
const templates = () => sortBy(db.all('letter_templates').filter((t) => t.active && t.name !== 'ΔΙΑΤΑΓΜΑΤΑ' && t.kind !== 'decree' && t.kind !== 'diploma'), 'id');
export const lettersAll = () => { const dec = legacyDecreeLetterIds(); return db.all('letters').filter((l) => !dec.has(l.id)); };
const STATUS = { draft: 'Πρόχειρη', ready: 'Έτοιμη' };
const statusPill = (s) => `<span class="pill ${s === 'ready' ? 'ok' : 'warn'}">${STATUS[s] || esc(s)}</span>`;
// Όνομα αρχείου (PDF, Word, Drive): «20545 - ΕΠΙΣΤΟΛΗ Θέμα» — κατηγορία ΕΠΙΣΤΟΛΗ ή ΕΠΙΣΚΕΨΗ
export const LETTER_CATEGORIES = { ΕΠΙΣΤΟΛΗ: 'Επιστολή', ΕΠΙΣΚΕΨΗ: 'Επίσκεψη', ΣΓΥ: 'ΣΓΥ' };
const category = (x) => (LETTER_CATEGORIES[x.category] ? x.category : 'ΕΠΙΣΤΟΛΗ');
// Ο αριθμός πρωτοκόλλου δίνεται μόνο όταν η επιστολή οριστεί «Έτοιμη»· οι πρόχειρες δεν δεσμεύουν αριθμό.
// Ενέργειες αριθμού πρωτοκόλλου (σελίδα επιστολής και Αρχείο): προσθήκη (η επιστολή γίνεται Έτοιμη) ή αλλαγή
async function readyLetter(x, back, query) {
  const manual = x.protocol_seq ? 0 : askProtocol({ table: 'letters', id: x.id });
  if (manual === null) return;
  await db.save(`Επιστολή ${x.subject}: έτοιμη`, (tx) => { tx.update('letters', x.id, { status: 'ready' }); assignProtocol(tx, x.id, manual); });
  flash('Η επιστολή είναι έτοιμη και πήρε αριθμό πρωτοκόλλου.'); go(back, query);
}
async function changeLetterProtocol(x, back, query) {
  const n = askProtocol({ table: 'letters', id: x.id }, Number(x.protocol_seq));
  if (!n) return;
  await db.save(`Επιστολή ${x.subject}: αρ. πρωτοκόλλου ${n}`, (tx) => { claimProtocol(tx, n); tx.update('letters', x.id, { protocol_seq: n, protocol_no: String(n) }); });
  flash(`Ο αριθμός πρωτοκόλλου άλλαξε σε ${n}.`); go(back, query);
}
async function deleteLetter(x, back, query) {
  const what = [x.protocol_no && `αρ. πρωτ. ${x.protocol_no}`, x.subject && `«${x.subject}»`].filter(Boolean).join(' ');
  if (!confirmDo(`Οριστική διαγραφή της επιστολής${what ? ' ' + what : ''}; Η ενέργεια δεν αναιρείται (μένει μόνο στο ιστορικό του GitHub).`)) return;
  await db.save(`Διαγραφή επιστολής ${x.protocol_no || x.subject || x.id}`, (tx) => { tx.remove('letters', x.id); for (const l of tx.all('letters')) if (l.source_letter_id === x.id) tx.update('letters', l.id, { source_letter_id: null }); });
  flash('Η επιστολή διαγράφηκε.'); go(back, query);
}
function assignProtocol(tx, id, manual = 0) {
  const r = tx.get('letters', id);
  if (!r || r.protocol_seq) return r;
  const p = nextProtocol(tx, 'Επιστολή', '', manual);
  return tx.update('letters', id, { protocol_seq: p.seq, protocol_year: p.year, protocol_no: p.no, letter_date: r.letter_date_manual && r.letter_date ? r.letter_date : today() }); // ημερομηνία που όρισε ο χρήστης μένει
}
const fileName = (x) => (x.protocol_seq ? docTitle(x.protocol_seq, category(x), letterFields(x.subject, x)) : safeFileName(`${category(x)} ${letterFields(x.subject, x)}`));

// Word (.docx) για επεξεργασία, με το επιστολόχαρτο της ΕΜΣτΕ
export async function letterDocxBlob(x) {
  const S = (k) => db.setting(k) || '', p = signerProfile(x.signer);
  const blocks = letterBlocks({ org: S('organization_name'), founded: S('founded_year'), gmTitle: S('grand_master_title'), gmName: S('grand_master_name'),
    number: x.protocol_seq ? String(x.protocol_seq) : (x.protocol_no || ''), date: fmtDate(x.letter_date || today()), place: 'Εν Αθήναις', to: x.recipient_name, cc: x.cc_name || '', subject: letterFields(x.subject, x),
    paragraphs: [{ text: letterFields(x.body, x) }], closing: x.closing || S('closing'), signature: p.img, signer: p.name, signerTitle: p.title, protoImg: protocolImage(x) });
  return makeDocx(blocks, { title: letterFields(x.subject, x), author: p.name });
}
export async function letterDocx(x) { download(fileName(x) + '.docx', await letterDocxBlob(x)); }
// Άνοιγμα στο Ψηφιακό Έντυπο (diatagma/) με τα στοιχεία της επιστολής
export function openInDigitalForm(x) {
  const p = signerProfile(x.signer);
  try {
    localStorage.setItem('nglg-diatagma-prefill', JSON.stringify({ num: x.protocol_seq ? String(x.protocol_seq) : (x.protocol_no || ''), date: x.letter_date || today(), place: 'Εν Αθήναις', doctype: 'ΕΠΙΣΤΟΛΗ', subject: letterFields(x.subject, x),
      p0: [x.recipient_name && `Προς: ${x.recipient_name}`, x.cc_name && `Κοιν.: ${x.cc_name}`].filter(Boolean).join('\n'), p1: richPlain(letterFields(x.body, x)), p2: '', greet: x.closing || db.setting('closing') || '', signer: p.name, sigtitle: p.title,
      useSig: p.img === IMG.signature, mailto: x.recipient_email || '' }));
  } catch { /* χωρίς localStorage: ανοίγει κενό */ }
  location.href = 'diatagma/';
}

function visitOf(q) {
  if (q.visit_id) return db.get('visits', q.visit_id);
  if (!/θα εκπροσωπήσουν οι κάτωθι|Κοινοποιείται στον/.test(q.body || '') && !/^Εκπροσώπηση ΜΔ — Εγκατάσταση/.test(q.subject || '')) return null;
  const m = /Αρ\. (\S+) — \S+ (\d{2})\/(\d{2})\/(\d{4})/.exec(q.subject || '');
  return m ? db.all('visits').find((v) => String(v.lodge_number) === m[1] && v.visit_date === `${m[4]}-${m[3]}-${m[2]}`) || null : null;
}
// Πλαίσιο «Συμπλήρωση από τη βάση» για πρότυπα με πεδία {…}: από Επίσκεψη ή από Στοά + ημερομηνία
const upcomingVisits = () => sortBy(db.all('visits').filter((v) => v.visit_date >= today()), 'visit_date');
const visitLabel = (v) => `${fmtDate(v.visit_date)} — «${v.lodge || ''}»${v.lodge_number ? ' αρ. ' + v.lodge_number : ''}`;
function fillPanel(x, query) {
  const t = x.template_id ? db.get('letter_templates', x.template_id) : null, show = !!t && hasPlaceholders([t.body, t.subject].join(' '));
  const sel = Number(query.visit_id) || 0, sv = sel ? db.get('visits', sel) : null, vs = [...(sv && sv.visit_date < today() ? [sv] : []), ...upcomingVisits()];
  return `<div class="full card fill-box" id="fillBox"${show ? '' : ' hidden'}><b>⚙ Συμπλήρωση από τη βάση</b> <small class="muted">— τα πεδία του προτύπου (${PLACEHOLDERS.map(([k]) => '{' + esc(k) + '}').join(', ')}) γεμίζουν αυτόματα.</small>
<div class="grid"><div class="full"><label>Από Επίσκεψη (επόμενες)</label><select id="fillVisit"><option value="">— ή επιλέξτε Στοά και ημερομηνία παρακάτω —</option>${vs.map((v) => `<option value="${v.id}"${v.id === sel ? ' selected' : ''}>${esc(visitLabel(v))}</option>`).join('')}</select></div>
<div><label>Στοά</label><input id="fillLodge" list="fillLodges" placeholder="αριθμός ή όνομα" autocomplete="off"><datalist id="fillLodges">${lodgesAll(true).map((l) => `<option value="${esc(l.number)} · ${esc(l.name)}">`).join('')}</datalist></div>
<div><label>Ημερομηνία εργασιών</label><input id="fillDate" type="date"></div></div>
<p class="muted" id="fillState"></p></div>`;
}

// «ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ» (π.χ. το εγκεκριμένο πρωτόκολλο-σφραγίδα): φορτώνεται στην επιστολή όταν το πρότυπο τη ζητά·
// μπαίνει κάτω από τη σφραγίδα, στο κέντρο (~400×200)· αποθηκεύεται ως PNG (και για το Word)
export const asksProtoImage = (t) => !!t && (String(t.ask_proto_image ?? '') === '1' || (String(t.ask_proto_image ?? '') === '' && hasProtocolField([t.subject, t.body].join(' '))));
async function pngDataUrl(file, max = 800) {
  const img = await createImageBitmap(file), k = Math.min(1, max / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.max(1, Math.round(img.width * k)), height: Math.max(1, Math.round(img.height * k)) });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}
const protoPreview = (v) => (v ? `<img class="proto-img" src="${esc(v)}" alt="ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ">` : '<span class="warn">Δεν έχει φορτωθεί ακόμη εικόνα.</span>');
function protoImageBox(x) {
  const t = x.template_id ? db.get('letter_templates', x.template_id) : null;
  return `<div class="full card proto-card" id="protoBox"${x.protocol_image || x.reg_file || asksProtoImage(t) ? '' : ' hidden'}><b>🖼 ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ</b> <small class="muted">— φορτώστε την εικόνα του εγκεκριμένου πρωτοκόλλου (σφραγίδα)· μπαίνει κάτω από τη σφραγίδα της ΕΜΣτΕ, στο κέντρο, ~400×200, χωρίς να καλύπτει κείμενο.</small>
<input type="hidden" name="protocol_image" value="${esc(x.protocol_image || '')}"><div class="proto-preview">${protoPreview(x.protocol_image)}</div>
<div class="toolbar"><button type="button" class="btn primary" data-act="approvalStamp">🏛 ΕΙΔΙΚΟ ΣΗΜΑ ΕΓΚΡΙΣΗΣ ΕΣΩΤ. ΚΑΝΟΝΙΣΜΟΥ</button><label class="btn">📤 Φόρτωση εικόνας<input type="file" id="protoImgFile" accept="image/*" hidden></label><button type="button" class="btn danger" data-act="protoImgDel">Αφαίρεση</button></div>
<div class="reg-pdf"><b>📎 Εγκεκριμένος Εσωτερικός Κανονισμός (PDF)</b> <small class="muted">— δεύτερο PDF της επιστολής· επισυνάπτεται στο email όταν το επιλέξετε και φαίνεται στο Αρχείο Επιστολών μαζί με την επιστολή.</small>
<div class="reg-name">${regLabel(x)}</div><input type="hidden" name="reg_remove" value="">
<div class="toolbar"><label class="btn">📤 Επιλογή PDF Κανονισμού<input type="file" id="regFile" accept="application/pdf,.pdf" hidden></label><button type="button" class="btn danger" data-act="regDel">Αφαίρεση PDF</button></div></div></div>`;
}
const regLabel = (x, pending) => (pending ? `📄 <b>${esc(pending)}</b> <small class="muted">(θα αποθηκευτεί με την επιστολή)</small>` : x.reg_file ? `📄 <b>${esc(x.reg_name || 'Εσωτερικός Κανονισμός.pdf')}</b>` : '<span class="muted">Δεν έχει επισυναφθεί PDF.</span>');
// Η επιστολή στάλθηκε με email: σημείωση στην επιστολή και, αν ανήκει σε Επίσκεψη, «ενημερώθηκε» στην Επίσκεψη (ενιαία κατάσταση)
async function markLetterSent(x) {
  await db.save(`Επιστολή ${x.protocol_no || x.id}: στάλθηκε με email`, (tx) => {
    tx.update('letters', x.id, { sent_at: today() });
    const v = x.visit_id ? tx.get('visits', x.visit_id) : null;
    if (v) tx.update('visits', v.id, { prov_notified_at: today(), prov_notified_date: v.visit_date, prov_notified_rep: v.rep_id ?? null });
  });
}
// Πρότυπο «Έγκριση Εσωτερικού Κανονισμού» (ενεργό, όχι αντίγραφο· αλλιώς το πρώτο που ταιριάζει)
const isKanonismos = (t) => !!t && !t.kind && foldName(t.name).includes('εγκρισ') && foldName(t.name).includes('εσωτερικου κανονισμου');
export function kanonismosTemplate() {
  const ts = sortBy(db.all('letter_templates').filter(isKanonismos), 'id');
  return ts.find((t) => t.active && !/αντιγραφο/.test(foldName(t.name))) || ts.find((t) => t.active) || ts[0] || null;
}
// Κείμενο του προτύπου «Έγκριση Εσωτερικού Κανονισμού» (κανόνας 136)
export const KANONISMOS_BODY = `Φίλτατε Αδ. Γραμματέα,
Σας ενημερώνουμε ότι συμφώνως προς τον κανόνα 136 του Βιβλίου των Γενικών Νόμων και Κανονισμών της Εθνικής Μεγάλης Στοάς της Ελλάδος, ο υποβληθείς προς έγκριση Εσωτερικός Κανονισμός της Στοάς σας, [b]ενεκρίθη υπό του Σεβασμιωτάτου Μεγάλου Διδασκάλου της Εθνικής Μεγάλης Στοάς της Ελλάδος, Σεβτ. Αδ. Ιωάννη Μπενετάτου[/b].

Σας υπενθυμίζεται, ότι ο αριθμός Πρωτοκόλλου [b][size=16]{Αριθμός Πρωτοκόλλου}[/size][/b] και η ημερομηνία εγκρίσεως {Ημερομηνία επιστολής} θα πρέπει να αναγραφεί στα τυπωμένα ή φωτοτυπημένα αντίτυπα, οπως το ειδικό σήμα που αναγράφεται παρακάτω. Δέον όπως διανείμετε εις τα μέλη της Στοάς σας καθως και εις την Μεγάλη Γραμματεία το εγκεκριμένο αντίγραφο.
Στον εγκεκριμμένο εσωτερικό κανονισμό δέον οπως στο τέλος του εγγράφου υπάρχει το κάτωθι κείμενο:
ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ
Εν Αθήναις την {Ημερομηνία επιστολής}

Ουδέν εκ των οριζομένων εις τον παρόντα Εσωτερικόν Κανονισμόν δύναται να ερμηνευθεί ως αντικατάστασις ή τροποποίησις των κανόνων του Βιβλίου Γενικών Νόμων και Κανονισμών δια την διακυβέρνησιν της Συντεχνίας, οι οποίοι μνημονεύονται εις το παρόν, ενώ εις περίπτωσιν αντιφάσεως, υπερισχύει πάντοτε το Βιβλίον των Συνταγμάτων.

Ο παρών Εσωτερικός Κανονισμός ενεκρίθη υπό του Σεβτ. Μεγάλου Διδασκάλου με την υπ’ αριθμόν πρωτ. [b][size=16]{Αριθμός Πρωτοκόλλου}[/size][/b], επιστολή εγκρίσεώς του.


Ο Μέγας Γραμματεύς                                                                         Ο Μέγας Διδάσκαλος
ΠΣεβ. Αδ. Δημήτριος Σκιαδόπουλος                             Σεβτ. Αδ. Ιωάννης Μπενετάτος`;
db.migrate('template-kanonismos-body-2026-10', (tx) => {
  const ts = tx.all('letter_templates').filter(isKanonismos);
  if (ts.length) for (const t of ts) { if (!/αντιγραφο/.test(foldName(t.name))) tx.update('letter_templates', t.id, { body: KANONISMOS_BODY }); }
  else tx.insert('letter_templates', { name: 'Έγκριση Εσωτερικού Κανονισμού', subject: 'Έγκριση Εσωτερικού Κανονισμού', body: KANONISMOS_BODY, active: 1 });
});
// Ο εγκεκριμένος Εσωτερικός Κανονισμός (PDF) μιας επιστολής → { blob, name }
export async function regPdf(x) {
  const bytes = x && x.reg_file ? await db.file(x.reg_file) : null;
  if (!bytes) throw new Error('Δεν βρέθηκε το PDF του Εσωτερικού Κανονισμού.');
  return { blob: new Blob([bytes], { type: 'application/pdf' }), name: x.reg_name || 'Εσωτερικός Κανονισμός.pdf' };
}
async function downloadReg(x, b) {
  const old = b && b.textContent; if (b) { b.disabled = true; b.textContent = '⏳'; }
  try { const r = await regPdf(x); download(r.name, r.blob, 'application/pdf'); } catch (e) { toast(e.message || String(e), 'error'); } finally { if (b) { b.disabled = false; b.textContent = old; } }
}

function letterForm(x, query = {}) {
  const tpl = templates();
  return `<form id="lf" class="grid card">
<div><label>Πρότυπο / Περίπτωση</label><select name="template_id" id="tplSel"><option value="">— Επιλογή —</option>${tpl.map((t) => `<option value="${t.id}"${Number(x.template_id) === t.id ? ' selected' : ''}>${t.id}. ${esc(t.name)}</option>`).join('')}</select></div>
<div><label>Ημερομηνία</label><input type="date" name="letter_date" value="${esc(x.letter_date || today())}"></div>
${fillPanel(x, query)}
<div class="full"><label>🔎 Παραλήπτης από τον Κατάλογο / Μητρώο</label><input id="rcptPick" placeholder="Επαρχία, Στοά, ΕπΜΔ, όνομα μέλους…" autocomplete="off"></div>
<input type="hidden" name="recipient_member_id" value="${esc(x.recipient_member_id || '')}"><input type="hidden" name="visit_id" value="${esc(x.visit_id || '')}"><input type="hidden" name="closing" value="${esc(x.closing || '')}"><input type="hidden" name="category" value="${esc(category(x))}">
<div><label>Παραλήπτης («Προς»)</label><input name="recipient_name" value="${esc(x.recipient_name || '')}"></div>
<div><label>Email παραλήπτη</label><input name="recipient_email" value="${esc(x.recipient_email || '')}" inputmode="email" placeholder="πολλά με κόμμα"><input id="emailPick" class="subpick" placeholder="+ Προσθήκη email από επαφή ή ομάδα…" autocomplete="off"></div>
<div class="full"><label>Κοιν. (στο έντυπο, κάτω από το «Προς»)</label><input id="ccPick" class="subpick" placeholder="🔎 Κοιν.: επαφή ή ομάδα (μπαίνει στο έντυπο και το email της στους παραλήπτες)…" autocomplete="off"><textarea name="cc_name" rows="2" style="min-height:0">${esc(x.cc_name || '')}</textarea></div>
<div class="full"><label>Θέμα</label><input name="subject" value="${esc(x.subject || '')}" required></div>
<div class="full"><label>Κείμενο</label><textarea name="body" required>${esc(x.body || '')}</textarea><small class="muted">Οι σύνδεσμοι (https://… ή www.…) μένουν ενεργοί στο τελικό έγγραφο.</small></div>
${protoImageBox(x)}
<div><label>Κατάσταση</label><select name="status"><option value="draft"${x.status !== 'ready' ? ' selected' : ''}>Πρόχειρη</option><option value="ready"${x.status === 'ready' ? ' selected' : ''}>Έτοιμη</option></select></div>
<div><label>Υπογράφων</label><select name="signer">${Object.entries(ACTORS).map(([k, v]) => `<option value="${k}"${(x.signer || actor()) === k ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
<div class="full toolbar"><button class="btn${x.protocol_seq ? ' primary' : ''}">💾 Αποθήκευση</button>${x.protocol_seq ? '' : '<button type="button" class="btn primary" data-act="ready">✅ Έτοιμη: Αποθήκευση & απόδοση αρ. πρωτοκόλλου</button>'}<button type="button" class="btn" data-act="preview">👁 Προεπισκόπηση</button><button type="button" class="btn" data-act="form">🖋 Ψηφιακό Έντυπο</button><button type="button" class="btn" data-act="word">⬇ Word</button>
<a class="btn" href="${x.id ? '#/letters/' + x.id : '#/letters'}">Ακύρωση</a></div></form>
<section id="pv" class="print-area" hidden></section>`;
}

function mountLetterForm(el, x, isNew) {
  const f = el.querySelector('#lf');
  attachPicker(el.querySelector('#rcptPick'), contactItems, (c) => {
    f.recipient_name.value = c.name || ''; f.recipient_email.value = c.email || ''; f.recipient_member_id.value = c.member_id || '';
    const l = c.lodge_number && lodgeByNumber(c.lodge_number); // Στοά ως παραλήπτης → και τα {Στοά}, {Αρ. Στοάς} του προτύπου (θέμα, κείμενο)
    if (l) { fv.value = ''; fl.value = `${l.number} · ${l.name}`; apply(false); }
  });
  // Προσθήκη (όχι αντικατάσταση): email παραληπτών και Κοιν. από επαφές/ομάδες
  const addEmails = (v) => { f.recipient_email.value = [...new Set([...splitEmails(f.recipient_email.value), ...splitEmails(v)])].join(', '); f.recipient_email.dispatchEvent(new Event('input', { bubbles: true })); };
  attachPicker(el.querySelector('#emailPick'), contactItems, (c) => addEmails(c.email));
  attachPicker(el.querySelector('#ccPick'), contactItems, (c) => {
    const lines = f.cc_name.value.split('\n').map((s) => s.trim()).filter(Boolean);
    if (c.name && !lines.includes(c.name)) f.cc_name.value = [...lines, c.name].join('\n');
    addEmails(c.email); f.cc_name.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Πρότυπο + στοιχεία από τη βάση → κείμενο, θέμα, παραλήπτες
  const box = el.querySelector('#fillBox'), fv = el.querySelector('#fillVisit'), fl = el.querySelector('#fillLodge'), fd = el.querySelector('#fillDate'), state = el.querySelector('#fillState');
  let tpl = x.template_id ? db.get('letter_templates', x.template_id) : null, auto = { body: f.body.value, subject: f.subject.value }, autoRcpt = null;
  const ctx = () => {
    const v = fv.value ? db.get('visits', fv.value) : null;
    if (v) return fillContext({ visit: v });
    const no = String(fl.value).split('·')[0].trim(), l = no ? lodgeByNumber(no) : null;
    return fillContext({ lodge_number: l ? l.number : '', date: fd.value });
  };
  const apply = (force) => {
    if (!tpl) return;
    const c = ctx(); if (c.visit_id) f.visit_id.value = c.visit_id;
    const body = fillPlaceholders(tpl.body, c), subject = tpl.subject ? fillPlaceholders(tpl.subject, c) : f.subject.value;
    const edited = (f.body.value.trim() && f.body.value !== auto.body) || (f.subject.value.trim() && f.subject.value !== auto.subject);
    if (!force && edited && !confirmDo('Αντικατάσταση του κειμένου με το πρότυπο συμπληρωμένο από τη βάση;')) return;
    f.body.value = body; f.subject.value = subject; auto = { body, subject };
    if (tpl.closing) f.closing.value = tpl.closing;
    if (LETTER_CATEGORIES[tpl.category]) f.category.value = tpl.category;
    if (tpl.category === 'ΣΓΥ' && !f.recipient_name.value.trim()) f.recipient_name.value = SGY_TO_NAME; // παραλήπτες: όλα τα μέλη σε Bcc
    if (tpl.key === REP_VISIT.key && c.rep) {
      const r = repRecipients(c);
      f.recipient_name.value = r.toName; f.recipient_email.value = [r.to, r.cc].filter(Boolean).join(', '); f.cc_name.value = r.ccName; f.recipient_member_id.value = ''; autoRcpt = f.recipient_email.value;
    } else if (c.lodge && (tpl.key === GM_VISIT.key || !f.recipient_email.value.trim() || f.recipient_email.value === autoRcpt)) {
      const r = lodgeRecipients(c);
      const repMail = c.repEmail && /\{\s*Εκπρόσωπος\s*\}/.test(tpl.body + (tpl.subject || '')) ? c.repEmail : '';
      f.recipient_name.value = r.toName; f.recipient_email.value = [...new Set([r.to, r.cc, repMail].join(', ').split(/\s*,\s*/).filter(Boolean))].join(', '); f.recipient_member_id.value = ''; autoRcpt = f.recipient_email.value;
    }
    const miss = missingPlaceholders(body + ' ' + subject);
    state.innerHTML = c.lodge ? `✓ Στοά «${esc(c.lodge)}»${c.lodge_number ? ' αρ. ' + esc(c.lodge_number) : ''}${c.date ? ` · ${esc(dayWithArticle(c.date))}, ${esc(dateWords(c.date))}` : ''}${c.rep ? ` · Εκπρόσωπος: ${esc(c.rep)}` : ''}`
      + (miss.length ? ` — <span class="warn">λείπουν: ${miss.map((k) => '{' + esc(k) + '}').join(', ')}</span>` : '')
      + (tpl.key === GM_VISIT.key && c.lodge && !lodgeRecipients(c).lodgeMail ? ' — <span class="warn">η Στοά δεν έχει email (Συμβολικές Στοές)</span>' : '') : 'Επιλέξτε Επίσκεψη ή Στοά και ημερομηνία.';
  };
  const pbox = el.querySelector('#protoBox'), setProto = (v) => { f.protocol_image.value = v; pbox.querySelector('.proto-preview').innerHTML = protoPreview(v); };
  el.querySelector('#protoImgFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try { setProto(await pngDataUrl(file)); } catch { toast('Δεν διαβάστηκε η εικόνα· δοκιμάστε PNG ή JPG.'); }
    e.target.value = '';
  });
  let regPending = null; // { name, bytes } — νέο PDF Κανονισμού, αποθηκεύεται μαζί με την επιστολή
  el.querySelector('#regFile').addEventListener('change', async (e) => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 4)) !== '%PDF') { toast('Το αρχείο δεν είναι PDF.', 'error'); return; }
    regPending = { name: file.name.replace(/\.pdf$/i, '') + '.pdf', bytes }; f.reg_remove.value = '';
    pbox.querySelector('.reg-name').innerHTML = regLabel(x, regPending.name);
  });
  el.querySelector('#tplSel').addEventListener('change', (e) => {
    tpl = db.get('letter_templates', e.target.value);
    pbox.hidden = !(f.protocol_image.value || x.reg_file || asksProtoImage(tpl));
    box.hidden = !(tpl && hasPlaceholders([tpl.body, tpl.subject].join(' ')));
    if (tpl) apply(false);
    // «Έγκριση Εσωτερικού Κανονισμού»: ανοίγει αμέσως το ΕΙΔΙΚΟ ΣΗΜΑ ΕΓΚΡΙΣΗΣ (αν δεν έχει ήδη εικόνα)
    if (isKanonismos(tpl) && !f.protocol_image.value) el.querySelector('[data-act=approvalStamp]').click();
  });
  fv.addEventListener('change', () => { if (fv.value) { fl.value = ''; fd.value = ''; } apply(true); });
  for (const i of [fl, fd]) i.addEventListener('change', () => { fv.value = ''; apply(true); });
  if (tpl && !box.hidden && (fv.value || !f.body.value.trim() || hasPlaceholders(f.body.value))) apply(true);
  if (!x.id && isKanonismos(tpl) && !f.protocol_image.value) setTimeout(() => { const b = el.querySelector('[data-act=approvalStamp]'); if (b && b.isConnected) b.click(); }, 0); // νέα επιστολή από το μενού «+ Έγκριση Εσωτ. Κανονισμού»
  const cur = () => ({ ...x, ...Object.fromEntries(new FormData(f)), letter_date: f.letter_date.value || x.letter_date || today() });
  bind(el, { protoImgDel: () => setProto(''),
    regDel() { regPending = null; f.reg_remove.value = '1'; pbox.querySelector('.reg-name').innerHTML = '<span class="muted">Δεν έχει επισυναφθεί PDF.</span>'; },
    async approvalStamp() { // η εφαρμογή «Έγκριση Εσωτερικού Κανονισμού»: η εικόνα μπαίνει ως ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ
      if (document.querySelector('.approval-app')) return; // ήδη ανοιχτό (π.χ. αυτόματο άνοιγμα με την επιλογή του προτύπου)
      const { openApprovalStamp } = await import('./approval-stamp.js');
      const no = String(fl.value).split('·')[0].trim() || (/(?:αριθ|αρ)\S*\s*(\d+)\s*$/i.exec(f.recipient_name.value) || [])[1] || '';
      const v = await openApprovalStamp({ protocol: String(x.protocol_seq || suggestedProtocol()), date: f.letter_date.value || x.letter_date || today(), lodge: no, onDate: (d) => { f.letter_date.value = d; } });
      if (v) { setProto(v); toast('Το ειδικό σήμα μπήκε ως ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ.'); }
    }, ready() { f.status.value = 'ready'; f.requestSubmit(); }, form: () => openInDigitalForm(cur()), word: () => letterDocx(cur()), preview() {
    const d = Object.fromEntries(new FormData(f));
    const pv = el.querySelector('#pv');
    pv.innerHTML = letterPaper({ ...x, ...d, letter_date: d.letter_date || x.letter_date || today() });
    pv.hidden = false; pv.scrollIntoView({ behavior: 'smooth' });
  } });
  onSubmit(f, async (d) => {
    const emails = splitEmails(d.recipient_email), bad = emails.filter((e) => !EMAIL_RE.test(e));
    if (bad.length) throw new Error('Μη έγκυρο email: ' + bad.join(', '));
    const row = { subject: d.subject.trim(), body: d.body.trim(), template_id: d.template_id ? Number(d.template_id) : null, recipient_name: d.recipient_name.trim(),
      recipient_email: emails.join(', '), recipient_member_id: d.recipient_member_id ? Number(d.recipient_member_id) : null, visit_id: Number(d.visit_id) || x.visit_id || null, cc_name: String(d.cc_name || '').trim(), closing: String(d.closing || '').trim(), category: LETTER_CATEGORIES[d.category] ? d.category : 'ΕΠΙΣΤΟΛΗ', status: d.status, signer: d.signer, protocol_image: String(d.protocol_image || '') };
    // Ημερομηνία: επεξεργάσιμη· αν αλλάξει από τον χρήστη μένει και όταν δοθεί αριθμός πρωτοκόλλου
    const ld = /^\d{4}-\d{2}-\d{2}$/.test(String(d.letter_date || '')) ? d.letter_date : (x.letter_date || today());
    row.letter_date = ld;
    if (ld !== (x.letter_date || today())) row.letter_date_manual = true;
    // «Έτοιμη» χωρίς αριθμό: πρόταση του επόμενου αριθμού πρωτοκόλλου ή χειροκίνητος
    const manualProtocol = row.status === 'ready' && !x.protocol_seq ? askProtocol({ table: 'letters', id: x.id }) : 0;
    if (manualProtocol === null) return;
    const id = await db.save(isNew ? `Νέα Επιστολή: ${row.subject}` : `Επιστολή ${x.protocol_no || x.id}: ενημέρωση`, (tx) => {
      const r = isNew ? tx.insert('letters', { ...row, source_letter_id: x.source_letter_id || null, visit_id: row.visit_id || x.visit_id || null }) : tx.update('letters', x.id, row);
      if (regPending) { const path = `letters/kanonismos-${r.id}-${Date.now()}.pdf`; tx.putFile(path, regPending.bytes); tx.update('letters', r.id, { reg_file: path, reg_name: regPending.name }); }
      else if (d.reg_remove) tx.update('letters', r.id, { reg_file: '', reg_name: '' });
      if (row.status === 'ready') assignProtocol(tx, r.id, manualProtocol);
      return r.id;
    });
    flash(d.status === 'ready' ? 'Η επιστολή είναι έτοιμη και πήρε αριθμό πρωτοκόλλου.' : isNew ? 'Η επιστολή αποθηκεύτηκε ως πρόχειρη (χωρίς αριθμό πρωτοκόλλου).' : 'Αποθηκεύτηκε.');
    go(`/letters/${id}`);
  });
}

// Αποστολή: λογαριασμός και Bcc — οι Επιστολές Επισκέψεων από τα γενικά εξερχόμενα (info@) με το Bcc των Επισκέψεων
// Κείμενο του email: το κείμενο της επιστολής, ο χαιρετισμός (αποφώνηση) και η υπογραφή, όπως στο έντυπο
const mailBody = (x) => { const p = signerProfile(x.signer);
  return [letterFields(x.body, x), x.closing || db.setting('closing'), [p.name, p.title, db.setting('organization_name')].filter(Boolean).join('\n')].filter((t) => String(t || '').trim()).join('\n\n'); };
// Λογαριασμός αποστολής: της επιστολής (επιλογή στην καρτέλα αποστολής) → του προτύπου → Επισκέψεις από info@, οι άλλες από grand.secretary@
const MAIL_KINDS = { official: 1, general: 1 };
const mailKind = (x) => { const t = x.template_id ? db.get('letter_templates', x.template_id) : null;
  return MAIL_KINDS[x.mail_kind] ? x.mail_kind : t && MAIL_KINDS[t.mail_kind] ? t.mail_kind : category(x) === 'ΕΠΙΣΚΕΨΗ' ? 'general' : 'official'; };
// ΣΓΥ: όλα τα μέλη του Συμβουλίου σε Bcc (όχι ορατά μεταξύ τους)· Επίσκεψη: οι σταθεροί παραλήπτες Bcc των Ρυθμίσεων
const mailBcc = (x, to = '', cc = '') => (category(x) === 'ΕΠΙΣΚΕΨΗ' ? bccWithout(db.setting('visit_bcc') || '', to, cc) : category(x) === 'ΣΓΥ' ? bccWithout(sgyEmails().join(', '), to, cc) : '');
// PDF μιας επιστολής (χωρίς να είναι ανοιχτή στην οθόνη)
export const letterFileName = (x) => fileName(x);
export async function letterPdf(x) {
  const { paperPdf } = await import('../core/pdf.js');
  const host = Object.assign(document.createElement('div'), { className: 'print-area', innerHTML: letterPaper(x) });
  Object.assign(host.style, { position: 'fixed', left: '-10000px', top: '0' });
  document.body.appendChild(host);
  try { const p = host.querySelector('.paper'); fitPaper(p); return { blob: await paperPdf(p, { title: fileName(x) }), name: fileName(x) + '.pdf' }; }
  finally { host.remove(); }
}
// WhatsApp με το PDF της επιστολής: κινητό/tablet → κοινοποίηση του αρχείου (διαλέγετε WhatsApp ή WhatsApp Business)· υπολογιστής → λήψη PDF + WhatsApp έτοιμο για επισύναψη
const waText = (x) => fileName(x); // το μήνυμα είναι το όνομα του αρχείου, π.χ. «20545 - ΕΠΙΣΤΟΛΗ Θέμα»
export async function waSendPdf(x, b) {
  const old = b && b.textContent;
  if (b) { b.disabled = true; b.textContent = '⏳ Ετοιμάζεται το PDF…'; }
  try {
    const { blob } = await letterPdf(x);
    const name = latinFileName(fileName(x)) + '.pdf'; // λατινικό όνομα: τα ελληνικά αλλοιώνονται στο WhatsApp
    const file = new File([blob], name, { type: 'application/pdf' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name, text: waText(x) }); } catch (e) { if (e && e.name !== 'AbortError') throw e; }
    } else {
      download(name, blob, 'application/pdf');
      window.open('https://wa.me/?text=' + encodeURIComponent(waText(x)), '_blank', 'noopener');
      toast('Το PDF κατέβηκε· επισυνάψτε το (📎) στη συνομιλία του WhatsApp που άνοιξε.');
    }
  } finally { if (b) { b.disabled = false; b.textContent = old; } }
}
// Η επιστολή μιας Επίσκεψης (Έτοιμη, με αρ. πρωτοκόλλου)· αν δεν υπάρχει, καταχωρίζεται τώρα
export async function ensureVisitLetter(v) {
  const has = sortBy(db.all('letters').filter((l) => l.visit_id === v.id && l.status === 'ready'), (l) => -(l.protocol_seq || 0))[0];
  if (has) return has;
  const manual = askProtocol({}, 0, 'Για να επισυναφθεί το PDF, η επιστολή της Επίσκεψης θα καταχωριστεί ως «Έτοιμη» με αριθμό πρωτοκόλλου.');
  if (manual === null) throw new Error('Ακυρώθηκε.');
  const q = provinceLetter(v);
  const id = await db.save(`Νέα Επιστολή: ${q.subject}`, (tx) => {
    const r = tx.insert('letters', { subject: q.subject, body: q.body, template_id: q.template_id ? Number(q.template_id) : null, recipient_name: q.to_name, recipient_email: q.to_email,
      recipient_member_id: null, cc_name: q.cc_name || '', closing: q.closing || '', category: q.category || 'ΕΠΙΣΚΕΨΗ', status: 'ready', signer: actor(), letter_date: today(), visit_id: v.id });
    assignProtocol(tx, r.id, manual);
    return r.id;
  });
  return db.get('letters', id);
}

function viewLetter({ params }) {
  const x = db.get('letters', params.id);
  if (!x) return '<h1>Δεν βρέθηκε η επιστολή</h1>';
  const wa = 'https://wa.me/?text=' + encodeURIComponent(`Παρακαλώ να ελέγξετε το email σας και στα spam.\n\n${db.setting('organization_name')}\nΑρ. Πρωτ.: ${x.protocol_no}\nΘέμα: ${letterFields(x.subject, x)}`);
  return {
    title: letterFields(x.subject, x),
    html: `<section class="card send-panel noprint"><h3>Αποστολή & Αποθήκευση</h3>${senderBanner(mailKind(x))}
<div class="toolbar"><button class="btn primary" data-act="pdf">⬇ PDF / Εκτύπωση</button>${mailButtons(withLetterCc({ to: x.recipient_email, bcc: mailBcc(x, x.recipient_email), subject: letterFields(x.subject, x), body: mailBody(x), kind: mailKind(x) }), '✉ Αποστολή με Email')}
${x.reg_file ? '<button class="btn" data-act="regpdf">📎 Εσωτ. Κανονισμός (PDF)</button>' : ''}<button class="btn" data-act="word">⬇ Word (επεξεργασία)</button><button class="btn" data-act="form">🖋 Ψηφιακό Έντυπο</button>
<button class="btn" data-act="wapdf">🟢 WhatsApp / Business με PDF</button><a class="btn" target="_blank" rel="noopener" href="${wa}">WhatsApp μήνυμα</a>${x.status === 'ready' ? '' : '<button class="btn primary" data-act="ready">✅ Έτοιμη: απόδοση αρ. πρωτοκόλλου</button>'}</div>
${x.status === 'ready' ? `<p class="noprint">${x.sent_at ? `<span class="vok">✓ Στάλθηκε με email ${esc(fmtDate(x.sent_at))}</span>` : '<button class="btn small" data-act="markSent" title="Για email που στάλθηκε εκτός εφαρμογής (π.χ. «Άνοιγμα στο Gmail»)">✓ Σημείωση ως σταλμένη</button>'}</p><div class="mailsheet"></div>` : '<p class="send-help">Για αποστολή με συνημμένο PDF ορίστε πρώτα την επιστολή «✅ Έτοιμη» (αριθμός πρωτοκόλλου).</p>'}${driveBox(x, fileName(x))}</section>
<div class="toolbar noprint"><a class="btn" href="#/letters/${x.id}/edit">Επεξεργασία</a><a class="btn" href="#/letters/new?copy_from=${x.id}">Νέα πάνω σε αυτή</a><a class="btn" href="#/letters">Αρχείο Επιστολών</a>
${x.protocol_seq ? '<button class="btn" data-act="protocol">✏ Αλλαγή αρ. πρωτοκόλλου</button>' : ''}<button class="btn danger" data-act="del">Διαγραφή</button> ${statusPill(x.status)}</div>
<div class="print-area">${letterPaper(x)}</div>`,
    mount(el) {
      if (x.status === 'ready') mailSheet(el, { kind: mailKind(x), pdfName: fileName(x),
        extras: x.reg_file ? [{ label: `Εσωτερικός Κανονισμός: ${x.reg_name || 'PDF'}`, name: x.reg_name || 'Εσωτερικός Κανονισμός.pdf', load: () => regPdf(x) }] : [],
        // μετά την αποστολή: η επιστολή σημειώνεται «στάλθηκε» και, αν ανήκει σε Επίσκεψη, η Επίσκεψη «ενημερώθηκε» (ενιαία κατάσταση)
        onSent: () => markLetterSent(x),
        onKind: async (k) => { await db.save(`Επιστολή ${x.protocol_no || x.id}: λογαριασμός αποστολής`, (tx) => { tx.update('letters', x.id, { mail_kind: k }); }); toast(`Η επιστολή θα στέλνεται από ${senderFor(k)}.`); go(`/letters/${x.id}`); }, getMsg: () => withLetterCc({ to: x.recipient_email, cc: '', bcc: mailBcc(x, x.recipient_email), subject: letterFields(x.subject, x), body: mailBody(x) }),
        getPdf: async () => ({ blob: await (await import('../core/pdf.js')).paperPdf(el.querySelector('.print-area .paper'), { title: fileName(x) }), name: fileName(x) + '.pdf' }) });
      bind(el, {
        pdf: () => printPaper(fileName(x)),
        word: () => letterDocx(x),
        wapdf: (_, b) => waSendPdf(x, b),
        regpdf: (_, b) => downloadReg(x, b),
        async markSent() { await markLetterSent(x); flash('Η επιστολή σημειώθηκε ως σταλμένη.'); go(`/letters/${x.id}`); },
        async drive(_, b) {
          b.disabled = true; b.textContent = '☁ Αποθήκευση…';
          try { await saveDocToDrive('letters', x.id, fileName(x), null, el.querySelector('.print-area .paper')); flash('Αποθηκεύτηκε στο Drive (Word + PDF).'); go(`/letters/${x.id}`); }
          catch (e) { b.disabled = false; b.textContent = '☁ Αποθήκευση στο Drive (PDF)'; throw e; }
        },
        form: () => openInDigitalForm(x),
        ready: () => readyLetter(x, `/letters/${x.id}`),
        protocol: () => changeLetterProtocol(x, `/letters/${x.id}`),
        del: () => deleteLetter(x, '/letters'),
      });
    },
  };
}

function archive({ query }) {
  let xs = sortBy(lettersAll(), (x) => -(x.protocol_seq || 0));
  if (query.q) xs = xs.filter((x) => matches(query.q, x.protocol_no, x.subject, x.recipient_name, x.recipient_email));
  if (LETTER_CATEGORIES[query.category]) xs = xs.filter((x) => category(x) === query.category);
  if (query.from) xs = xs.filter((x) => (x.letter_date || '') >= query.from);
  if (query.to) xs = xs.filter((x) => (x.letter_date || '') <= query.to);
  const shown = xs.slice(0, 500);
  return {
    title: 'Αρχείο Επιστολών',
    html: `<div class="hero"><h1>Αρχείο Επιστολών</h1><div class="toolbar"><a class="btn primary" href="#/letters/new">+ Νέα Επιστολή</a>${outgoingProtocolBtn('📂 ΑΡΧΕΙΟ ΕΞΕΡΧΟΜΕΝΩΝ', 'protogreen')}</div></div>${notice(query.msg)}
<div class="card protonext"><span>Επόμενος αριθμός πρωτοκόλλου: <b class="official-number" id="protonext">${suggestedProtocol()}</b></span><button type="button" class="btn small" data-act="nextproto">✏ Αλλαγή επόμενου αριθμού</button>
<small class="muted">Ενιαία αρίθμηση Επιστολών και Διαταγμάτων. Όταν γράφετε αριθμό σε ένα έγγραφο, η αρίθμηση συνεχίζει από εκεί· οι αριθμοί που υπάρχουν ήδη παραλείπονται.</small></div>
<form class="filters" id="flt"><input name="q" value="${esc(query.q || '')}" placeholder="Αρ. πρωτ., θέμα, παραλήπτης" autofocus><input type="date" name="from" value="${esc(query.from || '')}"><input type="date" name="to" value="${esc(query.to || '')}"><button>Αναζήτηση</button></form>
<p class="muted">${xs.length} επιστολές${xs.length > 500 ? ' (εμφανίζονται οι 500 πιο πρόσφατες)' : ''}</p>
${table(['Αρ. Πρωτ.', 'Ημερομηνία', 'Θέμα', 'Παραλήπτης', 'Κατάσταση', 'Ενέργειες'], shown.map((x) => [`<span class="official-number">${esc(x.protocol_no)}</span> <button type="button" class="btn small" data-act="dlpdf" data-id="${x.id}" title="Λήψη PDF">⬇ PDF</button>${x.reg_file ? ` <button type="button" class="btn small" data-act="regpdf" data-id="${x.id}" title="${esc(x.reg_name || '')}">📎 Κανονισμός</button>` : ''}`, esc(fmtDate(x.letter_date)), esc(letterFields(x.subject, x)), esc(x.recipient_name), statusPill(x.status),
  `<a href="#/letters/${x.id}">Άνοιγμα</a> · <a href="#/letters/${x.id}/edit">Επεξεργασία</a> · <a href="#/letters/new?copy_from=${x.id}">Νέα πάνω σε αυτή</a> · ${x.protocol_seq ? `<button type="button" class="btn small" data-act="proto" data-id="${x.id}">✏ Αλλαγή αρ. πρωτ.</button>` : `<button type="button" class="btn small" data-act="addproto" data-id="${x.id}">➕ Αρ. πρωτοκόλλου</button>`} · <button type="button" class="btn wa-btn" data-act="wapdf" data-id="${x.id}">🟢 WhatsApp / Business PDF</button> · <button type="button" class="btn small danger" data-act="dellet" data-id="${x.id}">🗑 Διαγραφή</button>`]), 'Δεν βρέθηκαν επιστολές.')}`,
    mount(el) {
      onSubmit(el.querySelector('#flt'), (d) => go('/letters', d));
      const back = () => ['/letters', query];
      bind(el, {
        wapdf: (d, b) => waSendPdf(db.get('letters', d.id), b),
        regpdf: (d, b) => downloadReg(db.get('letters', d.id), b),
        async dlpdf(d, b) { // λήψη του PDF της επιστολής από το αρχείο
          const old = b.textContent; b.disabled = true; b.textContent = '⏳';
          try { const r = await letterPdf(db.get('letters', d.id)); download(r.name, r.blob, 'application/pdf'); } finally { b.disabled = false; b.textContent = old; }
        },
        proto: (d) => changeLetterProtocol(db.get('letters', d.id), ...back()),
        dellet: (d) => deleteLetter(db.get('letters', d.id), ...back()),
        addproto(d) {
          if (!confirmDo('Η επιστολή θα οριστεί «Έτοιμη» και θα πάρει αριθμό πρωτοκόλλου. Συνέχεια;')) return;
          return readyLetter(db.get('letters', d.id), ...back());
        },
        async nextproto() {
          const n = askNextProtocol();
          if (!n) return;
          await db.save(`Επόμενος αριθμός πρωτοκόλλου: ${n}`, (tx) => setNextProtocol(tx, n));
          flash(`Ο επόμενος αριθμός πρωτοκόλλου είναι ${suggestedProtocol()}.`); go(...back());
        },
      });
    },
  };
}

module({
  id: 'letters',
  routes: {
    '/letters': archive,
    '/letters/new': ({ query }) => {
      // Επιστολή Επίσκεψης: πάντα από το τρέχον πρότυπο (και από παλιούς συνδέσμους με το παλιό κείμενο προς τον ΕπΜΓρ.)
      const vis = visitOf(query);
      if (vis) query = { ...query, ...provinceLetter(vis) };
      // Μενού «Έγγραφα → + Έγκριση Εσωτερικού Κανονισμού»: το ενεργό πρότυπο με αυτό το όνομα (όποιος κι αν είναι ο αριθμός του)
      if (query.template === 'kanonismos') { const t = kanonismosTemplate(); if (t) query = { ...query, template_id: String(t.id) }; }
      let x = { status: 'draft', signer: actor() };
      if (query.copy_from) { const s = db.get('letters', query.copy_from); if (s) x = { ...x, template_id: s.template_id, subject: s.subject, body: s.body, recipient_name: s.recipient_name, recipient_email: s.recipient_email, recipient_member_id: s.recipient_member_id, cc_name: s.cc_name || '', closing: s.closing || '', category: s.category || 'ΕΠΙΣΤΟΛΗ', source_letter_id: s.id }; }
      else if (query.template_id) { const t = db.get('letter_templates', query.template_id); if (t) x = { ...x, template_id: t.id, body: t.body, subject: t.subject || '', closing: t.closing || '', category: t.category || 'ΕΠΙΣΤΟΛΗ' }; }
      if (query.template_id && !x.template_id && db.get('letter_templates', query.template_id)) x.template_id = Number(query.template_id);
      if (query.to_name || query.to_email) Object.assign(x, { recipient_name: query.to_name || '', recipient_email: query.to_email || '' });
      if (query.subject || query.body) Object.assign(x, { subject: query.subject || '', body: query.body || '' });
      if (query.closing) x.closing = query.closing;
      if (query.cc_name) x.cc_name = query.cc_name;
      if (query.visit_id) x.visit_id = Number(query.visit_id);
      if (LETTER_CATEGORIES[query.category]) x.category = query.category;
      return { title: 'Νέα Επιστολή', html: `<h1>Νέα Επιστολή</h1><div class="card signer-card noprint"><b>Υπογράφων:</b> ${esc(ACTORS[actor()])} <a class="btn small" href="#/identity">Αλλαγή</a></div>${letterForm(x, query)}`, mount: (el) => mountLetterForm(el, x, true) };
    },
    '/letters/:id': viewLetter,
    // Μόνο το έντυπο της επιστολής (χωρίς μενού, αποστολή, παραλήπτες email) — π.χ. από τον Αρ. Πρωτ. της Αναφοράς εκπροσώπησης
    '/letters/:id/preview': ({ params }) => {
      const x = db.get('letters', params.id);
      if (!x) return { title: 'Επιστολή', bare: true, html: '<p class="lmsg">Δεν βρέθηκε η επιστολή.</p>' };
      return { title: `Επιστολή ${x.protocol_seq || ''}`, bare: true,
        html: `<div class="lbar noprint"><a class="back" href="javascript:history.back()">← Πίσω</a><span>Αρ. Πρωτ. ${esc(String(x.protocol_seq || x.protocol_no || ''))}</span><button type="button" class="btn" data-act="print">🖨 Εκτύπωση</button><button type="button" class="btn" data-act="pdf">⬇ PDF</button></div>
<div class="print-area lwrap">${letterPaper(x)}</div>`,
        mount(el) {
          const p = el.querySelector('.paper'); if (p) fitPaper(p);
          bind(el, { print: () => window.print(), async pdf() { const r = await letterPdf(x); download(r.name, r.blob, 'application/pdf'); } });
        } };
    },
    '/letters/:id/edit': ({ params }) => {
      const x = db.get('letters', params.id);
      if (!x) return '<h1>Δεν βρέθηκε η επιστολή</h1>';
      return { title: 'Επεξεργασία επιστολής', html: `<h1>Επεξεργασία <span class="official-number">${esc(x.protocol_no)}</span></h1>${letterForm(x)}`, mount: (el) => mountLetterForm(el, x, false) };
    },
    ...crud({
      table: 'letter_templates', base: '/templates', title: 'Πρότυπα Επιστολών', one: 'Πρότυπο', name: (t) => t.name,
      fields: [{ k: 'name', label: 'Όνομα', required: true, full: true }, { k: 'subject', label: 'Θέμα (προαιρετικό)', full: true, help: PH_HELP },
        { k: 'body', label: 'Κορμός επιστολής', type: 'textarea', full: true, help: PH_HELP }, { k: 'closing', label: 'Αποφώνηση (προαιρετική)', placeholder: 'π.χ. Με εκτίμηση και αδελφική αγάπη,' },
        { k: 'category', label: 'Κατηγορία πρωτοκόλλου', type: 'select', options: Object.entries(LETTER_CATEGORIES).map(([k]) => [k, k]) }, { k: 'active', label: 'Ενεργό', type: 'select', options: [[1, 'Ναι'], [0, 'Όχι']] },
        { k: 'mail_kind', label: 'Αποστολή email από', type: 'select', options: () => [['', 'Αυτόματα (Επισκέψεις: γενικά εξερχόμενα · άλλες: Επιστολές & Διατάγματα)'], ...Object.entries(MAIL_SENDERS).map(([k, v]) => [k, `${senderFor(k)} — ${v.label}`])], help: 'Αλλάζει και ανά επιστολή, στην καρτέλα «Αποστολή».' },
        { k: 'ask_proto_image', label: 'ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ: ζητείται στη νέα επιστολή', type: 'select', options: [['', 'Αυτόματα — όταν το κείμενο έχει {Αρ. Πρωτ.}'], ['1', 'Ναι, πάντα'], ['0', 'Όχι']], help: 'Η εικόνα (π.χ. το εγκεκριμένο πρωτόκολλο-σφραγίδα) φορτώνεται σε κάθε επιστολή και μπαίνει κάτω από τη σφραγίδα, στο κέντρο, ~400×200.' }],
      defaults: { active: 1 },
      // Νέο αντίγραφο: χωρίς το κλειδί (key), ώστε τα Διατάγματα/Δίπλωμα να συνεχίζουν να βρίσκουν το αρχικό πρότυπο
      copy: { omit: ['key'], prepare: (r) => ({ ...r, name: `${r.name} (αντίγραφο)` }) },
      sort: (xs) => sortBy(xs.filter((t) => t.name !== 'ΔΙΑΤΑΓΜΑΤΑ'), 'id'),
      // Κατηγορίες: Επιστολές · Επισκέψεις · ΣΓΥ · Διατάγματα (και τα πρότυπα ΣΓΥ μαζί στη σελίδα ΣΓΥ)
      filter: (xs, q) => (q.category === 'ΔΙΑΤΑΓΜΑ' ? xs.filter((t) => t.kind === 'decree' || t.kind === 'diploma') : LETTER_CATEGORIES[q.category] ? xs.filter((t) => !t.kind && (t.category || 'ΕΠΙΣΤΟΛΗ') === q.category) : xs),
      intro: () => { const q = (location.hash.split('?')[1] || '').match(/category=([^&]+)/), cur = q ? decodeURIComponent(q[1]) : '';
        return `<div class="toolbar tpl-cats">${[['', 'Όλα'], ['ΕΠΙΣΤΟΛΗ', 'Επιστολές'], ['ΕΠΙΣΚΕΨΗ', 'Επισκέψεις'], ['ΣΓΥ', '🏛 ΣΓΥ'], ['ΔΙΑΤΑΓΜΑ', '📜 Διατάγματα & Δίπλωμα']].map(([k, l]) => `<a class="btn small${k === cur ? ' primary' : ''}" href="#/templates${k ? '?category=' + encodeURIComponent(k) : ''}">${l}</a>`).join('')}</div>`; },
      validate: (d) => ({ ...d, active: Number(d.active) ? 1 : 0 }),
      columns: [{ label: 'Αρ.', v: (t) => `<b>${t.id}</b>` }, { label: 'Όνομα', v: (t) => `<b>${esc(t.name)}</b>${t.kind === 'decree' ? ' <span class="pill">📜 Διάταγμα</span><br><a class="btn small" href="#/templates/' + t.id + '/design">🎨 Σχεδίαση σελίδας</a>' : t.kind === 'diploma' ? ` <span class="pill">🎓 Δίπλωμα A3</span><br><a class="btn small" href="#/templates/${t.id}/diploma">🎨 Σχεδίαση Διπλώματος</a> <a class="btn small" href="#/members/diploma">🖨 Έκδοση</a>` : ''}${t.category === 'ΣΓΥ' && !t.kind ? ` <span class="pill">🏛 ΣΓΥ</span><br><a class="btn small" href="#/letters/new?category=ΣΓΥ&template_id=${t.id}&to_name=${encodeURIComponent(SGY_TO_NAME)}">✉ Νέα επιστολή ΣΓΥ</a>` : ''}${hasPlaceholders([t.body, t.subject].join(' ')) ? ' <span class="pill ok">⚙ από τη βάση</span>' : ''}` }, { label: 'Κορμός', v: (t) => `<small class="muted">${esc(String(t.body || '').slice(0, 120))}</small>` }, { label: 'Ενεργό', v: (t) => (t.active ? '✓' : '—') }],
    }),
  },
  tile: { order: 10, render: () => {
    const xs = lettersAll(), drafts = xs.filter((x) => x.status !== 'ready').length, last = sortBy(xs, (x) => -(x.protocol_seq || 0))[0];
    return `<div class="dtile green"><h3><a href="#/letters">Επιστολές</a></h3><div class="big">${xs.length}</div>${drafts ? `<div class="warn">${drafts} πρόχειρες</div>` : ''}
${last ? `<div class="muted">Τελευταία: ${esc(last.protocol_no)}</div>` : ''}<div class="acts"><a class="btn primary" href="#/letters/new">+ Νέα</a><a class="btn" href="#/letters">Αρχείο</a></div></div>`;
  } },
});
