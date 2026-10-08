// Διατάγματα — ΔΙΟΡΙΖΟΜΕΝ / ΑΠΟΝΕΜΕΙ / ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ: σύνταξη κειμένου, αρίθμηση (Διατάγματος και
// πρωτοκόλλου), επίσημο έντυπο, PDF/εκτύπωση, αποστολή, αρχείο. Κάθε Διάταγμα ενημερώνει αυτόματα την Επετηρίδα.
import { db } from '../core/store.js';
import { module, onSubmit, go, flash, bind, confirmDo, table, notice } from '../core/app.js';
import { esc, today, fmtDate, matches, sortBy, safeFileName, parseIso, MONTHS_GEN, download } from '../core/util.js';
import { makeDocx, letterBlocks } from '../core/docx.js';
import { docTitle, driveBox, saveDocToDrive } from '../core/drive.js';
import { letterhead, IMG, printPaper } from '../core/paper.js';
import { mailButtons, senderBanner } from '../core/mail.js';
import { attachPicker, memberItems } from '../core/pickers.js';
import { nextProtocol } from './protocol.js';
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

export function decreeBody(matter, apps, iso, action = 'appoint', awardOffice = '', period = '') {
  const rules = action === 'appoint' ? [...new Set(apps.map((a) => a.rule).filter(Boolean))] : ['19'];
  const end = 'Εγένετο εν τω Τεκτονικώ Μεγάρω της πόλεως των Αθηνών, την ' + gdate(iso) + '.';
  if (action === 'service_award') {
    return { rules, body: ['ΗΜΕΙΣ', 'Ο Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος,', 'Σεβασμιώτατος Αδελφός Ιωάννης Μπενετάτος', '', 'λαβόντες υπ’ όψιν τον Κανόνα 19 του Βιβλίου Γενικών Νόμων και', 'Κανονισμών,', '',
      'ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ', '', 'την Τάξιν του Μεγάλου Διδασκάλου', '', 'δι’ Υπηρεσίας προς την Τεκτονικήν, ' + (apps.length === 1 ? 'στον κάτωθι Αδελφόν:' : 'στους κάτωθι Αδελφούς:'), '',
      ...apps.map((a) => '• ' + displayName(a)), '', end].join('\n').trim() };
  }
  const out = ['ΗΜΕΙΣ', 'Ο Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος,', 'Σεβασμιώτατος Αδελφός Ιωάννης Μπενετάτος,', 'λαβόντες υπ’ όψιν ' + (rules.length === 1 ? 'τον Κανόνα ' : 'τους Κανόνας ') + rules.join(' και '),
    'του Βιβλίου των Γενικών Νόμων και Κανονισμών,', '', `περί ${matter},`, ''];
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
const fileName = (d) => (d.protocol_seq ? docTitle(d.protocol_seq, 'ΔΙΑΤΑΓΜΑ', `${decreeNo(d)} ${d.matter || ''}`) : safeFileName(`ΔΙΑΤΑΓΜΑ ${decreeNo(d)} ${d.matter || ''}`));
// Word του Διατάγματος (με επιστολόχαρτο), για το Drive
async function decreeDocxBlob(d) {
  const S = (k) => db.setting(k) || '';
  const blocks = letterBlocks({ org: S('organization_name'), founded: S('founded_year'), gmTitle: S('grand_master_title'), gmName: S('grand_master_name'),
    number: d.protocol_seq ? String(d.protocol_seq) : (d.protocol_no || ''), date: fmtDate(d.decree_date), place: 'Εν Αθήναις', title: `ΔΙΑΤΑΓΜΑ υπ’ αριθμ. ${decreeNo(d)}`,
    paragraphs: String(d.body || '').split(/\n\s*\n/).map((t) => ({ text: t.trim(), align: 'center', bold: /^(ΗΜΕΙΣ|ΔΙΟΡΙΖΟΜΕΝ|ΑΠΟΝΕΜΕΙ|ΕΥΑΡΕΣΤΟΥΜΕΘΑ)/.test(t.trim()) })),
    signature: IMG.signature, signer: 'Δημήτριος Σκιαδόπουλος', signerTitle: 'Ο ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ' });
  return makeDocx(blocks, { title: d.subject, author: 'Μεγάλη Γραμματεία' });
}
const nextDecreeNo = (tx) => Math.max(tx.all('decree_documents').reduce((m, d) => Math.max(m, Number(d.decree_no) || 0), 0) + 1, Number(db.setting('decree_first_no')) || 513);

export function decreePaper(d) {
  const action = meta(d).action;
  return `<article class="paper decree">${letterhead()}<div class="dec-title">ΔΙΑΤΑΓΜΑ</div>
<div class="dec-no official-number">${action === 'service_award' ? 'υπ’ αριθ. ' : 'υπ’ αριθμ. '}${esc(decreeNo(d))}</div><div class="dec-date official-number">${esc(fmtDate(d.decree_date))}</div>
<div class="decbody">${esc(d.body).replace(/^(ΗΜΕΙΣ|ΔΙΟΡΙΖΟΜΕΝ|ΑΠΟΝΕΜΕΙ|ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ)$/gm, '<b>$1</b>')}</div>
<div class="decsig"><div><div class="t">ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ</div><img class="signature-img" src="${IMG.signature}" alt=""><div class="signature-line"></div><b>Δημήτριος Σκιαδόπουλος</b></div>
<div><img class="seal-img" src="${IMG.seal}" alt=""></div><div><div class="t">Ο ΜΕΓΑΣ ΔΙΔΑΣΚΑΛΟΣ</div><img class="signature-img" src="${IMG.grandMaster}" alt=""><div class="signature-line"></div><b>Ιωάννης Μπενετάτος</b></div></div></article>`;
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
  return { m, html: `<div class="dec-split"><div class="dec-formcol"><form id="df"><div class="card"><div class="grid"><div><label>Πράξη Διατάγματος</label><select name="action" id="dAction">${Object.entries(ACTIONS).map(([k, v]) => `<option value="${k}"${k === m.action ? ' selected' : ''}>${v}</option>`).join('')}</select></div>
<div id="matterWrap"><label>Περί</label><input name="matter" value="${esc(d ? d.matter : '')}"></div></div></div>
<div class="card" id="officeCard"><label id="officeLabel">Ενεργός Μέγας Αξιωματικός</label><select name="office" id="dOffice"></select></div>
<div class="card" id="periodCard"><label>Τεκτονική Περίοδος</label><input name="period" value="${esc(m.period)}" placeholder="2026 - 2027"></div>
<div class="card" id="serviceText" hidden><h3 style="margin-top:0">Σταθερό κείμενο — Τάξις του Μεγάλου Διδασκάλου</h3><p style="text-align:center;white-space:pre-line"><b>ΗΜΕΙΣ</b>
Ο Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος, Σεβασμιώτατος Αδελφός Ιωάννης Μπενετάτος
λαβόντες υπ’ όψιν τον Κανόνα 19 του Βιβλίου Γενικών Νόμων και Κανονισμών,
<b>ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ</b> <b>την Τάξιν του Μεγάλου Διδασκάλου</b> δι’ Υπηρεσίας προς την Τεκτονικήν</p>
<p class="muted">Δεν απαιτείται αξίωμα, τίτλος ή Τεκτονική Περίοδος· εισάγονται μόνο τα στοιχεία του Αδελφού.</p></div>
<h2 id="peopleHead">Διοριζόμενοι Αδελφοί</h2><div id="people">${(list.length ? list : [{}]).map(personRow).join('')}</div>
<div class="toolbar"><button type="button" class="btn" data-act="addPerson">+ Προσθήκη Αδελφού</button><button class="btn primary">${d && d.id ? '💾 Αποθήκευση Διατάγματος' : 'Έκδοση Διατάγματος'}</button>
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
  bind(el, {
    addPerson() { const z = document.createElement('div'); z.innerHTML = personRow(); const r = z.firstElementChild; el.querySelector('#people').appendChild(r); wire(r); sync(); },
    rmPerson(_, b) { b.closest('.dec-person').remove(); },
  });
  // Ζωντανή προεπισκόπηση: το Διάταγμα όπως θα εκδοθεί, με «……» όπου λείπει κάτι
  const DOTS = '……';
  const draft = () => {
    const data = Object.fromEntries(new FormData(f)), action = data.action, service = action === 'service_award';
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
    return { decree_no: no, decree_year: year, decree_date: date, body, rules: JSON.stringify({ action }) };
  };
  const pv = el.querySelector('#dprev');
  let tmr;
  const preview = () => { clearTimeout(tmr); tmr = setTimeout(() => { try { pv.innerHTML = decreePaper(draft()); } catch (e) { console.warn(e); } }, 120); };
  f.addEventListener('input', preview); f.addEventListener('change', preview);
  el.addEventListener('click', (e) => { if (e.target.closest('[data-act], .picker-list button')) setTimeout(preview, 50); });
  preview();
  onSubmit(f, async (data) => {
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
      return { member_id: Number(q('.mid')) || null, registry_no: q('.mid'), first_name: fn, last_name: ln, full_name: `${fn} ${ln}`, decree_first_name: proper(q('.dfn')), decree_last_name: proper(q('.dln')),
        honorific: service ? '' : hon, former_office: service ? '' : q('.former'), email: em, mobile: mo, office: action === 'appoint' ? office : '', rule: action === 'appoint' ? DEC_MAP[office].rule : '19' };
    });
    if (!people.length) throw new Error('Συμπληρώστε τουλάχιστον έναν Αδελφό.');
    const id = await db.save(d ? `Διάταγμα ${decreeNo(d)}: ενημέρωση` : `Νέο Διάταγμα: ${matter}`, (tx) => {
      const date = d ? d.decree_date : today(), no = d ? d.decree_no : nextDecreeNo(tx), year = d ? d.decree_year : new Date().getFullYear();
      const { body, rules } = decreeBody(matter, people, date, action, action === 'award' ? office : '', period);
      const row = { decree_no: no, decree_year: year, decree_date: date, subject: `ΔΙΑΤΑΓΜΑ υπ’ αριθμ. ${no}/${year} – ${matter}`, body, matter,
        rules: JSON.stringify({ rules, action, award_office: action === 'award' ? office : '', decree_office: action === 'appoint' ? office : '', period: action === 'appoint' ? period : '' }),
        appointments: JSON.stringify(people), recipient_name: people.map((a) => a.full_name).join(', '), recipient_email: [...new Set(people.map((a) => a.email.toLowerCase()))].join(', ') };
      let r;
      if (d) r = tx.update('decree_documents', d.id, row);
      else { const p = nextProtocol(tx, 'Διάταγμα', matter); r = tx.insert('decree_documents', { ...row, status: 'draft', protocol_seq: p.seq, protocol_no: p.no }); }
      if (service) tx.remove('member_degrees_offices', (o) => o.decree_id === r.id); else syncOffices(tx, r);
      return r.id;
    });
    flash(d ? 'Το Διάταγμα αποθηκεύτηκε.' : 'Το Διάταγμα εκδόθηκε.'); go(`/decrees/${id}`);
  });
}

function viewDecree({ params }) {
  const d = db.get('decree_documents', params.id);
  if (!d) return '<h1>Δεν βρέθηκε το Διάταγμα</h1>';
  const to = apps(d).map((a) => a.email).filter(Boolean);
  const wa = 'https://wa.me/?text=' + encodeURIComponent(`Παρακαλώ να ελέγξετε το email σας και στα spam.\n\nΔΙΑΤΑΓΜΑ υπ’ αριθμ. ${decreeNo(d)}\n${d.matter}`);
  return {
    title: d.subject,
    html: `<section class="card send-panel noprint"><h3>Διάταγμα — Αποστολή & Αποθήκευση</h3>${senderBanner('official')}
<div class="toolbar"><button class="btn primary" data-act="pdf">⬇ PDF / Εκτύπωση</button>${mailButtons({ to, cc: db.setting('decree_cc'), subject: d.subject, body: d.body, kind: 'official' }, '✉ Αποστολή με Email')}
<a class="btn" target="_blank" rel="noopener" href="${wa}">WhatsApp μήνυμα</a>${d.status === 'ready' ? '' : '<button class="btn" data-act="ready">Σήμανση ως έτοιμο</button>'}</div>
<p class="send-help">Αρ. Πρωτ.: <b>${esc(d.protocol_no || '—')}</b> · Κοινοποίηση: ${esc(db.setting('decree_cc'))} (αλλαγή στις Ρυθμίσεις).</p>${driveBox(d, fileName(d))}
<div class="toolbar"><button class="btn" data-act="word">⬇ Word</button></div></section>
<div class="toolbar noprint"><a class="btn" href="#/decrees/${d.id}/edit">Επεξεργασία Διατάγματος</a><a class="btn" href="#/decrees/new?copy_from=${d.id}">Νέο πάνω σε αυτό</a><a class="btn" href="#/decrees">Αρχείο Διαταγμάτων</a>
<button class="btn danger" data-act="del">Διαγραφή</button></div><div class="print-area">${decreePaper(d)}</div>`,
    mount(el) {
      bind(el, {
        pdf: () => printPaper(fileName(d)),
        async word() { download(fileName(d) + '.docx', await decreeDocxBlob(d)); },
        async drive() { await saveDocToDrive('decree_documents', d.id, fileName(d), await decreeDocxBlob(d), el.querySelector('.print-area .paper')); flash('Αποθηκεύτηκε στο Drive (Word + PDF).'); go(`/decrees/${d.id}`); },
        async ready() { await db.save(`Διάταγμα ${decreeNo(d)}: έτοιμο`, (tx) => tx.update('decree_documents', d.id, { status: 'ready' })); flash('Σημειώθηκε ως έτοιμο.'); go(`/decrees/${d.id}`); },
        async del() {
          if (!confirmDo('Οριστική διαγραφή του Διατάγματος;')) return;
          await db.save(`Διαγραφή Διατάγματος ${decreeNo(d)}`, (tx) => { tx.remove('member_degrees_offices', (o) => o.decree_id === d.id); tx.remove('decree_documents', d.id); });
          flash('Το Διάταγμα διαγράφηκε.'); go('/decrees');
        },
      });
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
