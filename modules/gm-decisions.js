// Αποφάσεις του Μεγάλου Διδασκάλου (σελίδα Δηλώσεων → Αναφορά → «Απόφαση Μ.Δ.») → Επισκέψεις Στοών.
// Οι αποφάσεις διαβάζονται από το Google Apps Script των Δηλώσεων (δημόσια ενέργεια «decisions»· μόνο ο εκπρόσωπος ανά Εργασία)
// και οι Εργασίες από το declarations/config.js. Κάθε απόφαση αντιστοιχίζεται σε επίσκεψη (αριθμός Στοάς + ημερομηνία)
// και σε εκπρόσωπο (Εκπρόσωποι ή Επετηρίδα)· με «Εφαρμογή» ορίζεται ο εκπρόσωπος στην επίσκεψη (ή δημιουργείται η επίσκεψη).
import { db } from '../core/store.js';
import { module, go, flash, toast, onSubmit } from '../core/app.js';
import { esc, fold, dayStr, today, addDays } from '../core/util.js';
import { lodgeNoKey } from './lodges.js';
import { repCandidates, candRep, repIdIn, repLabel, isGM, visitsAll, visitsFlow, repOptions, NOBODY, meetingIdOf, kindOf } from './visits.js';

export const GM_SELF = 'Ο Μέγας Διδάσκαλος (αυτοπροσώπως)';
const CONFIG_URL = 'declarations/config.js';

// Εργασίες και διεύθυνση του Apps Script από το κοινό αρχείο της σελίδας Δηλώσεων
export async function declarationsConfig() {
  const res = await fetch(CONFIG_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('Δεν βρέθηκε το ' + CONFIG_URL);
  // eslint-disable-next-line no-new-func
  return new Function(`${await res.text()}\nreturn { MEETINGS, API_URL };`)();
}
export async function fetchDecisions(apiUrl) {
  const res = await fetch(apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'decisions' }) });
  if (!res.ok) throw new Error('Το Apps Script δεν απάντησε (' + res.status + ').');
  const r = await res.json();
  if (!r.ok) throw new Error(r.error === 'unknown_action' ? 'Το Apps Script τρέχει παλιά έκδοση του Code.gs — χρειάζεται η έκδοση 4 (νέα ανάπτυξη).' : 'Σφάλμα Apps Script: ' + (r.error || '?'));
  return r.decisions || {};
}

const isoOf = (s) => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(String(s || '')); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };
const days = (a, b) => Math.abs((new Date(a) - new Date(b)) / 864e5);

// «Αλμπάνης Αναστάσιος (Ο Αναπληρωτής Μέγας Διδάσκαλος)», «Σκιαδόπουλος Σπυρίδων του Μιχαήλ (Στ. ΘΕΜΙΣΤΟΚΛΗΣ 96) (Πρώην Μέγας Ξιφοφόρος)»
function parseOfficer(text) {
  const t = String(text || '').trim(), groups = [...t.matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim());
  const words = fold(t.replace(/\(.*$/, '').replace(/\s+του\s+.*$/i, '')).split(/\s+/).filter(Boolean);
  return { surname: words[0] || '', first: words[1] || '', title: fold((groups[groups.length - 1] || '').replace(/^ο\s+/i, '')) };
}
const officeHas = (office, title) => !!title && fold(office).split(' · ').some((o) => o.replace(/\s*\(\d{4}\)\s*$/, '').trim() === title);

// Απόφαση → { value, label } για την επιλογή εκπροσώπου (id εκπροσώπου ή «e:» υποψήφιος της Επετηρίδας)· αλλιώς { error }
export function repForDecision(text, cands = repCandidates()) {
  if (text === GM_SELF) {
    const r = db.all('reps').find(isGM);
    if (r) return { value: String(r.id), label: repLabel(r) };
    const c = cands.find((x) => x.offices.includes('Μέγας Διδάσκαλος'));
    return c ? { value: 'e:' + c.key, label: repLabel(candRep(c)) } : { error: 'Δεν βρέθηκε ο Μέγας Διδάσκαλος στους Εκπροσώπους ή στην Επετηρίδα' };
  }
  const p = parseOfficer(text);
  if (!p.surname) return { error: 'Κενή απόφαση' };
  const hit = (sn, fn) => fold(sn) === p.surname && (!p.first || fold(fn).split(/\s+/)[0] === p.first);
  const pick = (xs, office) => (xs.length > 1 ? xs.filter((x) => officeHas(office(x), p.title)) : xs);
  const rs = pick(db.all('reps').filter((r) => hit(r.surname, r.name)), (r) => r.office);
  if (rs.length === 1) return { value: String(rs[0].id), label: repLabel(rs[0]) };
  const cs = pick(cands.filter((c) => hit(c.surname, c.name)), (c) => c.offices.join(' · '));
  if (!rs.length && cs.length === 1) return { value: 'e:' + cs[0].key, label: repLabel(candRep(cs[0])) + ' (από την Επετηρίδα)' };
  return { error: rs.length + cs.length > 1 ? 'Περισσότεροι από ένας με το ίδιο όνομα — ορίστε τον χειροκίνητα' : 'Δεν βρέθηκε στους Εκπροσώπους ή στην Επετηρίδα' };
}

// Εργασία → επίσκεψη: ίδιος αριθμός Στοάς και ίδια ημερομηνία· αλλιώς ίδια Στοά έως 14 ημέρες απόσταση
export function visitForMeeting(m, vs = visitsAll()) {
  const iso = isoOf(m.date), same = vs.filter((v) => lodgeNoKey(v.lodge_number) === lodgeNoKey(m.no));
  return same.find((v) => v.visit_date === iso) || same.filter((v) => iso && days(v.visit_date, iso) <= 14).sort((a, b) => days(a.visit_date, iso) - days(b.visit_date, iso))[0] || null;
}

// Σχέδιο εφαρμογής: μία γραμμή ανά Εργασία
export function decisionPlan(meetings, decisions) {
  const cands = repCandidates(), vs = visitsAll();
  return meetings.map((m) => {
    const d = decisions[m.id] || '', v = visitForMeeting(m, vs), iso = isoOf(m.date);
    const cur = v && v.rep_id > 0 ? db.get('reps', v.rep_id) : null;
    if (!d) return { m, iso, v, cur, d, status: 'pending' };
    const rep = repForDecision(d, cands);
    if (rep.error) return { m, iso, v, cur, d, rep, status: 'norep' };
    const status = !v ? 'create' : !cur ? 'set' : String(cur.id) === rep.value ? 'same' : 'change';
    return { m, iso, v, cur, d, rep, status };
  });
}
const actionable = (r) => ['set', 'change', 'create'].includes(r.status);

export async function applyPlan(rows) {
  const todo = rows.filter(actionable), cands = repCandidates(), done = {};
  await db.save(`Αποφάσεις Μ.Δ. → Επισκέψεις: ${todo.length}`, (tx) => {
    for (const r of todo) {
      const rid = (done[r.rep.value] ||= repIdIn(tx, r.rep.value, cands)); // ίδιος υποψήφιος της Επετηρίδας καταχωρείται μία φορά
      if (r.v) tx.update('visits', r.v.id, { rep_id: rid });
      else {
        const reg = tx.find('lodges', (l) => lodgeNoKey(l.number) === lodgeNoKey(r.m.no));
        tx.insert('visits', { visit_date: r.iso, lodge: reg ? reg.name : r.m.name, lodge_number: r.m.no, location: (reg || {}).meeting_place || '', province: (reg || {}).provincial || '', rep_id: rid, notes: r.m.note || '' });
      }
    }
  });
  return todo.length;
}

// ③ Αποφάσεις Μ.Δ. — μέσα στην εφαρμογή, πάνω στις ίδιες τις Επισκέψεις (μία πηγή: πίνακας visits, πεδίο rep_id).
// Για κάθε προσεχή Εργασία: ποιοι δήλωσαν διάθεση (σελίδα Δηλώσεων, με τον κωδικό πρόσβασης), τυχόν απόφαση που πάρθηκε εκεί,
// και επιλογή εκπροσώπου: ο ίδιος ο ΜΔ · όσοι δήλωσαν · εν ενεργεία Μεγάλοι Αξιωματικοί · Πρώην Μεγάλοι Αξιωματικοί · ΟΥΔΕΙΣ.
const KEY_STORE = 'nglg-decl-key';
const sessKey = () => { try { return sessionStorage.getItem(KEY_STORE) || ''; } catch { return ''; } };
const setSessKey = (k) => { try { if (k) sessionStorage.setItem(KEY_STORE, k); else sessionStorage.removeItem(KEY_STORE); } catch { /* */ } };
async function postApi(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Το Apps Script δεν απάντησε (' + res.status + ').');
  return res.json();
}
// Κωδικός Εργασίας της σελίδας Δηλώσεων → Επίσκεψη (νέοι κωδικοί l<αρ>_<ημ/νία>, και οι παλιοί του config.js)
export function visitOfMeetingId(id, oldMeetings = [], vs = visitsAll()) {
  const v = vs.find((x) => meetingIdOf(x) === id); if (v) return v;
  const m = oldMeetings.find((x) => x.id === id); return m ? visitForMeeting(m, vs) : null;
}
// Ενιαία λογική εκπροσώπησης: η Επίσκεψη (visits.rep_id) είναι η μία πηγή. Μια απόφαση που πάρθηκε στη σελίδα Δηλώσεων
// (Apps Script, «decisions») περνά αυτόματα στην Επίσκεψη — μόνο όταν είναι ΝΕΑ (άλλη από την τελευταία που είδε η εφαρμογή,
// πεδίο decl_decision), ώστε μια μεταγενέστερη αλλαγή στις Επισκέψεις να μην πατιέται από παλιά απόφαση. Η πρώτη φορά, σε Επίσκεψη
// που έχει ήδη εκπρόσωπο, απλώς καταγράφεται. Οι αλλαγές της εφαρμογής φτάνουν στη σελίδα Δηλώσεων με το programme.json.
let syncing = null, lastSync = 0;
export function syncDeclDecisions(force = false) {
  if (syncing) return syncing;
  if (!db.backend || (!force && Date.now() - lastSync < 20000)) return Promise.resolve(0);
  lastSync = Date.now();
  syncing = (async () => {
    let cfg; try { cfg = await declarationsConfig(); } catch { return 0; }
    if (!cfg || !cfg.API_URL) return 0;
    let decisions; try { decisions = await fetchDecisions(cfg.API_URL); } catch { return 0; }
    const cands = repCandidates(), todo = [];
    for (const [id, text] of Object.entries(decisions)) {
      const v = visitOfMeetingId(id, cfg.MEETINGS || []);
      if (!v || !text || v.decl_decision === text) continue;
      if (v.decl_decision === undefined && Number(v.rep_id)) { todo.push({ v, text, rep: null }); continue; }
      const rep = repForDecision(text, cands);
      if (!rep.error) todo.push({ v, text, rep });
    }
    if (!todo.length) return 0;
    const applied = todo.filter((t) => t.rep).length, done = {};
    await db.save(`Αποφάσεις Μ.Δ. (σελίδα Δηλώσεων) → Επισκέψεις: ${applied || 'καταγραφή'}`, (tx) => {
      for (const t of todo) {
        const patch = { decl_decision: t.text };
        if (t.rep) patch.rep_id = (done[t.rep.value] ||= repIdIn(tx, t.rep.value, cands));
        tx.update('visits', t.v.id, patch);
      }
    });
    return applied;
  })().catch((e) => { console.warn('Αποφάσεις Μ.Δ.:', e); return 0; }).finally(() => { syncing = null; });
  return syncing;
}
// Απόφαση από τη σελίδα Δηλώσεων όταν το Apps Script δεν έχει ακόμη «decide» (παλιό Code.gs): περνά απευθείας στην Επίσκεψη
export async function applyDeclDecision(meetingId, text) {
  let cfg = {}; try { cfg = (await declarationsConfig()) || {}; } catch { /* */ }
  const v = visitOfMeetingId(meetingId, cfg.MEETINGS || []);
  if (!v) throw new Error('Δεν βρέθηκε η Επίσκεψη της Εργασίας.');
  const cands = repCandidates(), rep = text ? repForDecision(text, cands) : null;
  if (rep && rep.error && /Περισσότεροι/.test(rep.error)) throw new Error(rep.error);
  await db.save(`Απόφαση Μ.Δ. (σελίδα Δηλώσεων) → Επίσκεψη ${v.lodge || ''} ${v.visit_date || ''}`, (tx) => {
    let rid = null;
    if (rep && !rep.error) rid = repIdIn(tx, rep.value, cands);
    else if (rep) { // δεν υπάρχει στους Εκπροσώπους ούτε στην Επετηρίδα: νέος Εκπρόσωπος από το κείμενο «Επώνυμο Όνομα (Αξίωμα)»
      const t = String(text).trim(), office = ((t.match(/\(([^()]*)\)\s*$/) || [])[1] || '').trim(), [surname = '', ...rest] = t.replace(/\(.*$/, '').trim().split(/\s+/);
      rid = tx.insert('reps', { surname, name: rest.join(' '), office, email: '', mobile: '' }).id;
    }
    tx.update('visits', v.id, text ? { decl_decision: text, rep_id: rid } : { decl_decision: '', rep_id: null });
  });
  return v.id;
}
let firstSync = true;
db.on((ev) => { if (ev.type === 'refresh' && firstSync && db.backend && db.backend.kind === 'github') { firstSync = false; setTimeout(() => syncDeclDecisions(true), 800); } });

function decisionsPage({ query = {} }) {
  // Προεπιλογή: μόνο όσες περιμένουν απόφαση (χωρίς εκπρόσωπο)· με «Και όσες έχουν ήδη εκπρόσωπο» για αλλαγή απόφασης
  const frm = query.frm || today(), to = query.to || addDays(frm, 60), prov = query.prov || '', all = query.all === '1', open = !all;
  // Όπου πηγαίνει ο ίδιος ο ΜΔ δεν χρειάζεται απόφαση για εκπρόσωπο: δεν εμφανίζεται εδώ (φαίνεται στις Επισκέψεις Στοών)
  const gmSelf = (v) => Number(v.rep_id) > 0 && isGM(db.get('reps', Number(v.rep_id)));
  const base = visitsAll().filter((v) => v.visit_date >= frm && v.visit_date <= to && (!prov || v.province === prov));
  const gmN = base.filter(gmSelf).length, rest = base.filter((v) => !gmSelf(v));
  const vs = open ? rest.filter((v) => !Number(v.rep_id)) : rest, doneN = rest.length - vs.length;
  const provs = [...new Set(visitsAll().map((v) => v.province).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'el'));
  return {
    title: 'Αποφάσεις Μ.Δ.',
    html: `${visitsFlow(3)}<div class="hero"><h1>🗳 Αποφάσεις Μ.Δ. — Εκπρόσωποι στις Εγκαταστάσεις</h1></div>
<details class="card fold"><summary><b>Πώς λειτουργεί</b></summary><ol class="steps"><li>Οι Εργασίες είναι οι <a href="#/visits">Επισκέψεις Στοών</a> (① Πρόγραμμα Εγκαταστάσεων)· η σελίδα Δηλώσεων τις παίρνει αυτόματα.</li>
<li>Οι Μεγάλοι Αξιωματικοί δηλώνουν διάθεση στη <a href="#/declarations">σελίδα Δηλώσεων</a> (②). Εδώ φαίνονται με «🔒 Δηλώσεις» (κωδικός πρόσβασης, μόνο για αυτή την καρτέλα).</li>
<li>Για κάθε Εργασία ο ΜΔ αποφασίζει: ο ίδιος, κάποιος που δήλωσε, εν ενεργεία ή Πρώην Μέγας Αξιωματικός, ή ΟΥΔΕΙΣ — «✔ Αποθήκευση». Η απόφαση γράφεται στην Επίσκεψη και φαίνεται παντού (πρόγραμμα, δημόσια σελίδα, Μητρώο του μέλους).</li>
<li>Μετά: ④ Ενημερώσεις (εκπρόσωπος, Επαρχία) και ⑤ Αναφορά.</li></ol></details>
<form class="card filters vfilters" id="gdf"><input type="date" name="frm" value="${esc(frm)}"><input type="date" name="to" value="${esc(to)}">
<select name="prov"><option value="">Όλες οι Επαρχίες</option>${provs.map((p) => `<option${p === prov ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>
<label class="chk"><input type="checkbox" name="all" value="1"${all ? ' checked' : ''}> Και όσες έχουν ήδη εκπρόσωπο (για αλλαγή)</label><button>Προβολή</button></form>
<div class="toolbar"><button type="button" class="btn" id="gdKey">🔒 Δηλώσεις διάθεσης</button><span class="muted" id="gdState"></span></div>
<div class="vstats"><span><b>${vs.length}</b> Εργασίες</span><span class="${vs.filter((v) => !Number(v.rep_id)).length ? 'warn' : ''}"><b>${vs.filter((v) => !Number(v.rep_id)).length}</b> χωρίς εκπρόσωπο</span>${doneN ? `<span>✓ <b>${doneN}</b> με εκπρόσωπο ήδη — δεν εμφανίζονται</span>` : ''}${gmN ? `<span>★ <b>${gmN}</b> με τον Μ.Δ. αυτοπροσώπως — δεν εμφανίζονται εδώ, βλ. <a href="#/visits">Επισκέψεις Στοών</a></span>` : ''}</div>
<div id="gdList" class="gd-list">${vs.length ? '' : `<div class="card">${open ? 'Δεν υπάρχουν Εργασίες που περιμένουν απόφαση στο διάστημα.' : 'Δεν υπάρχουν Εργασίες στο διάστημα.'}</div>`}</div>
${vs.length ? '<div class="toolbar gd-save"><button type="button" class="btn primary" id="gdSave">✔ Αποθήκευση αποφάσεων</button></div>' : ''}`,
    mount(el) {
      onSubmit(el.querySelector('#gdf'), (d) => go('/visits/decisions', { ...d, all: d.all ? '1' : '' }));
      const box = el.querySelector('#gdList'), state = el.querySelector('#gdState');
      let declared = {}, decided = {}, oldMeetings = [], cfg = null;
      const cands = repCandidates();
      const draw = () => {
        if (!vs.length) return;
        box.innerHTML = vs.map((v) => {
          const r = Number(v.rep_id) > 0 ? db.get('reps', Number(v.rep_id)) : null, ds = declared[v.id] || [], dec = decided[v.id];
          const dOpts = ds.map((o) => ({ o, rep: repForDecision(o.officer, cands) })).filter((x) => !x.rep.error);
          const decRep = dec ? repForDecision(dec, cands) : null;
          return `<div class="card gd-card${Number(v.rep_id) ? '' : ' gd-open'}" data-v="${v.id}"><div class="gd-head"><div class="gd-date">${esc(dayStr(v.visit_date))}</div>
<div><b>${esc(v.lodge || '')}</b> Αρ. ${esc(v.lodge_number || '')} <span class="pill">${esc(kindOf(v))}</span><br><small class="muted">${esc(v.province || '')}${v.location ? ' · ' + esc(v.location) : ''}</small></div>
<div class="gd-cur">${Number(v.rep_id) === NOBODY ? '<span class="pill">ΟΥΔΕΙΣ</span>' : r ? `<span class="vok">✓ ${esc(repLabel(r))}</span>` : '<span class="vwarn">χωρίς εκπρόσωπο</span>'}</div></div>
${ds.length ? `<div class="gd-decl">✋ Δήλωσαν: ${ds.map((o) => { const x = dOpts.find((y) => y.o === o); return x ? `<button type="button" class="btn small" data-pick="${esc(x.rep.value)}">${esc(o.officer)}</button>` : `<span class="muted">${esc(o.officer)}</span>`; }).join(' ')}</div>` : ''}
${decRep && !decRep.error && decRep.value !== String(v.rep_id) ? `<div class="gd-decl">🗳 Απόφαση στη σελίδα Δηλώσεων: <button type="button" class="btn small primary" data-pick="${esc(decRep.value)}">${esc(dec)}</button></div>` : ''}
<select class="gd-sel" data-v="${v.id}"><option value="">— Επιλογή εκπροσώπου —</option>${dOpts.length ? `<optgroup label="✋ Δήλωσαν διάθεση">${dOpts.map((x) => `<option value="${esc(x.rep.value)}">${esc(x.rep.label)}</option>`).join('')}</optgroup>` : ''}${repOptions(v.rep_id)}</select></div>`;
        }).join('');
        box.querySelectorAll('.gd-sel').forEach((s) => { if (!Array.from(s.options).some((o) => o.selected && o.value)) s.value = ''; });
      };
      box.addEventListener('click', (e) => { const b = e.target.closest('[data-pick]'); if (!b) return; const s = b.closest('.gd-card').querySelector('.gd-sel'); s.value = b.dataset.pick; s.classList.add('gd-changed'); });
      box.addEventListener('change', (e) => { if (e.target.matches('.gd-sel')) e.target.classList.add('gd-changed'); });
      const load = async () => {
        try { cfg = cfg || await declarationsConfig(); oldMeetings = cfg.MEETINGS || []; } catch { cfg = null; }
        const msgs = [];
        if (cfg && cfg.API_URL) {
          try { const r = await postApi(cfg.API_URL, { action: 'decisions' }); if (r.ok) { decided = {}; for (const [id, t] of Object.entries(r.decisions || {})) { const v = visitOfMeetingId(id, oldMeetings); if (v && t) decided[v.id] = t; } } }
          catch { /* οι αποφάσεις παίρνονται εδώ */ }
          const key = sessKey();
          if (key) {
            try {
              const r = await postApi(cfg.API_URL, { action: 'report', key });
              if (!r.ok) { setSessKey(''); msgs.push(r.error === 'unauthorized' ? 'Λάθος κωδικός δηλώσεων.' : 'Σφάλμα δηλώσεων: ' + r.error); }
              else { declared = {}; let n = 0; for (const [id, xs] of Object.entries(r.data || {})) { const v = visitOfMeetingId(id, oldMeetings); if (v) { (declared[v.id] ||= []).push(...xs); n += xs.length; } } msgs.push(`✓ ${n} δηλώσεις διάθεσης`); }
            } catch (err) { msgs.push(err.message || String(err)); }
          }
        }
        state.textContent = msgs.join(' · ');
        draw();
      };
      el.querySelector('#gdKey').addEventListener('click', () => { const k = prompt('Κωδικός πρόσβασης της σελίδας Δηλώσεων (μένει μόνο σε αυτή την καρτέλα):', ''); if (k) { setSessKey(k.trim()); state.textContent = 'Φόρτωση…'; load(); } });
      const sv = el.querySelector('#gdSave');
      if (sv) sv.addEventListener('click', async () => {
        const ch = [...box.querySelectorAll('.gd-sel.gd-changed')].filter((s) => s.value && s.value !== String(db.get('visits', Number(s.dataset.v)).rep_id));
        if (!ch.length) { toast('Δεν άλλαξε καμία απόφαση.'); return; }
        sv.disabled = true;
        try {
          const done = {};
          await db.save(`Αποφάσεις Μ.Δ.: ${ch.length} εκπρόσωποι`, (tx) => { for (const s of ch) { const rid = (done[s.value] ||= repIdIn(tx, s.value, cands)); tx.update('visits', Number(s.dataset.v), { rep_id: rid }); } });
          flash(`Αποθηκεύτηκαν ${ch.length} αποφάσεις του Μ.Δ. — επόμενο βήμα: ④ Ενημερώσεις.`); go('/visits/decisions', query);
        } catch (err) { toast(err.message || String(err), 'error'); sv.disabled = false; }
      });
      draw(); load();
      syncDeclDecisions().then((n) => { if (n && el.isConnected) { flash(`✓ ${n} απόφαση(-εις) από τη σελίδα Δηλώσεων πέρασαν στις Επισκέψεις.`); go('/visits/decisions', query); } });
    },
  };
}

module({ id: 'gm-decisions', routes: { '/visits/decisions': decisionsPage } });
