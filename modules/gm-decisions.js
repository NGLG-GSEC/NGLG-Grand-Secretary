// Αποφάσεις του Μεγάλου Διδασκάλου (σελίδα Δηλώσεων → Αναφορά → «Απόφαση Μ.Δ.») → Επισκέψεις Στοών.
// Οι αποφάσεις διαβάζονται από το Google Apps Script των Δηλώσεων (δημόσια ενέργεια «decisions»· μόνο ο εκπρόσωπος ανά Εργασία)
// και οι Εργασίες από το declarations/config.js. Κάθε απόφαση αντιστοιχίζεται σε επίσκεψη (αριθμός Στοάς + ημερομηνία)
// και σε εκπρόσωπο (Εκπρόσωποι ή Επετηρίδα)· με «Εφαρμογή» ορίζεται ο εκπρόσωπος στην επίσκεψη (ή δημιουργείται η επίσκεψη).
import { db } from '../core/store.js';
import { module, go, flash, toast, table } from '../core/app.js';
import { esc, fold, dayStr } from '../core/util.js';
import { lodgeNoKey } from './lodges.js';
import { repCandidates, candRep, repIdIn, repLabel, isGM, visitsAll, visitsFlow } from './visits.js';

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
const STATUS = {
  pending: '<span class="muted">Εκκρεμεί απόφαση</span>',
  same: '<span class="vok">✓ Ήδη ορισμένος</span>',
  set: '<span class="pill ok">Θα οριστεί</span>',
  change: '<span class="pill warn">Θα αλλάξει</span>',
  create: '<span class="pill ok">Νέα επίσκεψη + ορισμός</span>',
  norep: '<span class="vwarn">⚠ Δεν εφαρμόζεται</span>',
};
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

function decisionsPage() {
  return {
    title: 'Αποφάσεις Μ.Δ.',
    html: `${visitsFlow(3)}<div class="hero"><h1>🗳 Αποφάσεις Μ.Δ. → Επισκέψεις Στοών</h1></div>
<p class="muted">Οι αποφάσεις που παίρνει ο Μέγας Διδάσκαλος στη <a href="#/declarations">Διαχειριστική Αναφορά των Δηλώσεων</a> («Απόφαση Μ.Δ. — Εκπρόσωπος»)
ορίζουν τον εκπρόσωπο στην αντίστοιχη επίσκεψη. Ελέγξτε τον πίνακα και πατήστε «Εφαρμογή».</p>
<div class="toolbar"><a class="btn" href="#/visits">← Επισκέψεις Στοών</a><button class="btn" id="gmdReload">⟳ Ανανέωση</button></div>
<div id="gmdBody"><div class="card">Φόρτωση αποφάσεων…</div></div>`,
    mount(el) {
      const box = el.querySelector('#gmdBody');
      const load = async () => {
        box.innerHTML = '<div class="card">Φόρτωση αποφάσεων…</div>';
        let rows;
        try { const cfg = await declarationsConfig(); rows = decisionPlan(cfg.MEETINGS, await fetchDecisions(cfg.API_URL)); }
        catch (e) { box.innerHTML = `<div class="card nocontact">${esc(e.message || String(e))}</div>`; return; }
        const n = rows.filter(actionable).length;
        box.innerHTML = `<div class="vstats"><span><b>${rows.filter((r) => r.d).length}</b> αποφάσεις</span><span class="${n ? 'warn' : ''}"><b>${n}</b> προς εφαρμογή</span><span><b>${rows.filter((r) => r.status === 'pending').length}</b> εκκρεμούν</span></div>
${table(['Ημερομηνία', 'Στοά', 'Απόφαση Μ.Δ.', 'Εκπρόσωπος στην εφαρμογή', 'Τρέχων εκπρόσωπος', 'Ενέργεια'], rows.map((r) => [
    esc(r.iso ? dayStr(r.iso) : r.m.date),
    `<b>${esc(r.m.name)}</b> Αρ. ${esc(r.m.no)}${r.v ? `<br><a href="#/visits/edit/${r.v.id}">επίσκεψη ${esc(dayStr(r.v.visit_date))}</a>` : '<br><small class="muted">χωρίς επίσκεψη</small>'}`,
    r.d ? `<b>${esc(r.d)}</b>` : '—',
    r.rep ? (r.rep.error ? `<span class="vwarn">${esc(r.rep.error)}</span>` : esc(r.rep.label)) : '—',
    r.cur ? esc(repLabel(r.cur)) : '<span class="muted">—</span>',
    STATUS[r.status],
  ]))}
<p><button class="btn primary" id="gmdApply"${n ? '' : ' disabled'}>✔ Εφαρμογή ${n} ${n === 1 ? 'απόφασης' : 'αποφάσεων'} στις Επισκέψεις</button>
${rows.some((r) => r.status === 'norep') ? ' <a class="btn" href="#/reps">Εκπρόσωποι</a>' : ''}</p>`;
        const b = box.querySelector('#gmdApply');
        b.addEventListener('click', async () => {
          b.disabled = true;
          try { const k = await applyPlan(rows); flash(`Εφαρμόστηκαν ${k} αποφάσεις του Μ.Δ. στις Επισκέψεις Στοών.`); go('/visits'); }
          catch (e) { toast(e.message || String(e), 'error'); b.disabled = false; }
        });
      };
      el.querySelector('#gmdReload').addEventListener('click', load);
      load();
    },
  };
}

module({ id: 'gm-decisions', routes: { '/visits/decisions': decisionsPage } });
