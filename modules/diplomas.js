// Διπλώματα Διδασκάλου Τέκτονος (Certificate Master Mason): ο αριθμός διπλώματος είναι ο πραγματικός αριθμός μητρώου (MM…).
// Εισαγωγή από Excel ή επικόλληση (ονοματεπώνυμο + αριθμός): αντιστοίχιση με το Μητρώο, προεπισκόπηση, έλεγχος συγκρούσεων
// (ίδιος αριθμός σε άλλο μέλος, διαφορετικό δίπλωμα, διπλές γραμμές) και εφαρμογή μόνο των επιλεγμένων.
import { db } from '../core/store.js';
import { go, flash, toast, table } from '../core/app.js';
import { esc, sortBy, readXlsx, parsePasted } from '../core/util.js';
import { identify } from '../core/people.js';
import { attachPicker, memberItems } from '../core/pickers.js';
import { regBadge, isAdmin } from './members.js';

const NAME_H = /ονοματεπ|full.?name|^name$|^ονομα\s*επωνυμο/i, SUR_H = /^επ[ωώ]νυμο|surname|last.?name/i, FIRST_H = /^[όο]νομα$|first.?name/i;
const NO_H = /δ[ιί]πλωμ|diploma|certificate|αρ\.?\s*(διπλ|μητρ)|^αρ(ιθμ[οό]ς)?\.?$|number|^no\.?$/i;
const cleanNo = (v) => String(v ?? '').trim().replace(/^[MΜ]{2}\s*-?/i, '').replace(/\.0+$/, '').replace(/\s+/g, '');

// Γραμμές → [{ name, no }]: με επικεφαλίδες (Ονοματεπώνυμο | Επώνυμο + Όνομα, Αρ. Διπλώματος) ή χωρίς (όνομα, αριθμός)
export function diplomaRows(rows) {
  // μία στήλη «Ονοματεπώνυμο 12345» (επικόλληση χωρίς tab) → [όνομα, αριθμός]
  const rs = rows.filter((r) => r.some((c) => String(c ?? '').trim())).map((r) => {
    const t = r.filter((c) => String(c ?? '').trim());
    const m = t.length === 1 && /^(.*?)[\s,;]+((?:[MΜ]{2}\s*-?)?\d+)\s*$/i.exec(String(t[0]).trim());
    return m ? [m[1], m[2]] : r;
  });
  if (!rs.length) return [];
  const h = rs[0].map((c) => String(c ?? '').trim());
  const col = (re) => h.findIndex((x) => re.test(x));
  let iName = col(NAME_H), iSur = col(SUR_H), iFirst = col(FIRST_H), iNo = col(NO_H), body = rs.slice(1);
  if (iNo < 0 || (iName < 0 && iSur < 0)) { // χωρίς επικεφαλίδες: η στήλη με αριθμούς είναι το δίπλωμα, το υπόλοιπο το όνομα
    body = rs; iNo = rs[0].findIndex((c) => /^\s*([MΜ]{2}\s*-?)?\d+\s*$/i.test(String(c ?? ''))); iName = -1; iSur = -1;
    if (iNo < 0) return [];
  }
  return body.map((r) => {
    const name = iName >= 0 ? String(r[iName] ?? '').trim() : iSur >= 0 ? `${String(r[iSur] ?? '').trim()} ${iFirst >= 0 ? String(r[iFirst] ?? '').trim() : ''}`.trim()
      : r.filter((_, i) => i !== iNo).map((c) => String(c ?? '').trim()).filter(Boolean).join(' ');
    return { name: name.replace(/\s+/g, ' '), no: cleanNo(r[iNo]) };
  }).filter((x) => x.name && /^\d+$/.test(x.no));
}

// Σχέδιο: για κάθε γραμμή το μέλος και τι θα γίνει
export function diplomaPlan(items, picks = {}) {
  const ms = db.all('member_registry'), byNo = new Map(ms.filter((m) => String(m.diploma_no ?? '').trim()).map((m) => [String(m.diploma_no).trim(), m]));
  const seenNo = new Map(), seenM = new Map();
  for (const it of items) seenNo.set(it.no, (seenNo.get(it.no) || 0) + 1);
  const rows = items.map((it, i) => {
    const mid = picks[i] || identify({ full_name: it.name }), m = mid ? db.get('member_registry', mid) : null, owner = byNo.get(it.no);
    let status;
    if (!m) status = 'none';
    else if (seenNo.get(it.no) > 1) status = 'dupfile';
    else if (owner && owner.id !== m.id) status = 'taken';
    else if (String(m.diploma_no ?? '').trim() === it.no) status = 'same';
    else if (String(m.diploma_no ?? '').trim()) status = 'diff';
    else status = 'set';
    if (m) seenM.set(m.id, (seenM.get(m.id) || 0) + 1);
    return { i, ...it, m, owner, status, picked: !!picks[i] };
  });
  for (const r of rows) if (r.m && seenM.get(r.m.id) > 1 && ['set', 'diff'].includes(r.status)) r.status = 'dupmember';
  return rows;
}
const STATUS = {
  set: ['ok', 'Θα οριστεί'], same: ['', '✓ Ήδη ορισμένο'], diff: ['warn', 'Άλλο δίπλωμα — θα αλλάξει'], taken: ['bad', 'Ο αριθμός ανήκει σε άλλο μέλος'],
  dupfile: ['bad', 'Ο αριθμός υπάρχει δύο φορές στο αρχείο'], dupmember: ['bad', 'Το μέλος υπάρχει δύο φορές στο αρχείο'], none: ['warn', 'Δεν βρέθηκε — επιλέξτε μέλος'],
};
const applicable = (r) => ['set', 'diff'].includes(r.status);

export async function applyDiplomas(rows) {
  const todo = rows.filter(applicable);
  await db.save(`Διπλώματα Διδασκάλου: ${todo.length}`, (tx) => {
    for (const r of todo) {
      const other = tx.find('member_registry', (x) => String(x.diploma_no ?? '').trim() === r.no && x.id !== r.m.id);
      if (other) throw new Error(`Το Δίπλωμα ${r.no} ανήκει ήδη στο μέλος ${other.surname} ${other.first_name}.`);
      tx.update('member_registry', r.m.id, { diploma_no: r.no });
    }
  });
  return todo.length;
}

export function diplomasPage() {
  const ms = db.all('member_registry'), withD = ms.filter((m) => String(m.diploma_no ?? '').trim());
  const list = sortBy(withD, (m) => Number(m.diploma_no) || 0);
  return {
    title: 'Διπλώματα Διδασκάλου',
    html: `<p><a href="#/members">← Μητρώο Μελών</a></p><h1>🎓 Διπλώματα Διδασκάλου Τέκτονος <small class="muted">Certificate Master Mason</small></h1>
<p class="muted">Ο αριθμός του Διπλώματος είναι ο <b>πραγματικός αριθμός μητρώου</b>: <span class="regno mm">MM12345</span>.
Όσοι δεν έχουν Δίπλωμα κρατούν τον αριθμό τους με πρόθεμα M: <span class="regno m">M1200</span>.</p>
<div class="vstats"><span><b>${withD.length}</b> με Δίπλωμα (MM)</span><span><b>${ms.length - withD.length}</b> χωρίς Δίπλωμα (M)</span></div>
${isAdmin() ? `<div class="card"><h2 style="margin-top:0">Εισαγωγή αριθμών Διπλώματος</h2>
<p class="muted">Excel με <b>Ονοματεπώνυμο</b> (ή Επώνυμο και Όνομα) και <b>Αρ. Διπλώματος</b> — ή επικόλληση γραμμών «Ονοματεπώνυμο ⇥ Αριθμός».</p>
<div class="toolbar"><label class="btn primary" style="cursor:pointer">⬆ Αρχείο Excel<input type="file" id="dpFile" accept=".xlsx,.xls,.csv" hidden></label></div>
<textarea id="dpPaste" class="short" placeholder="Παπαδόπουλος Ιωάννης	12345"></textarea>
<div class="toolbar"><button class="btn" id="dpRead">Ανάγνωση επικόλλησης</button></div></div><div id="dpPlan"></div>`
  : '<div class="card nocontact">Η εισαγωγή αριθμών Διπλώματος γίνεται μόνο από τον διαχειριστή.</div>'}
<h2>Μέλη με Δίπλωμα (${withD.length})</h2>
${table(['Αρ. Μητρώου', 'Επώνυμο', 'Όνομα', 'Βαθμός', ''], list.map((m) => [regBadge(m), esc(m.surname), esc(m.first_name), esc(m.degree || ''), `<a class="btn small" href="#/members/${m.id}">Καρτέλα</a>`]), 'Δεν έχουν καταχωριστεί ακόμη Διπλώματα.')}
<p class="muted">Η εκτύπωση του Διπλώματος (πρότυπο εντύπου) θα προστεθεί εδώ.</p>`,
    mount(el) {
      if (!isAdmin()) return;
      let items = [], picks = {};
      const box = el.querySelector('#dpPlan');
      const draw = () => {
        const rows = diplomaPlan(items, picks), n = rows.filter(applicable).length;
        box.innerHTML = !rows.length ? '<div class="card">Δεν βρέθηκαν γραμμές με όνομα και αριθμό Διπλώματος.</div>'
          : `<div class="vstats"><span><b>${rows.length}</b> γραμμές</span><span class="${n ? 'warn' : ''}"><b>${n}</b> προς καταχώριση</span><span><b>${rows.filter((r) => r.status === 'none').length}</b> χωρίς αντιστοίχιση</span><span><b>${rows.filter((r) => STATUS[r.status][0] === 'bad').length}</b> συγκρούσεις</span></div>
${table(['Από το αρχείο', 'Αρ. Διπλώματος', 'Μέλος στο Μητρώο', 'Σημερινός αρ.', 'Ενέργεια'], rows.map((r) => [esc(r.name), `<b>MM${esc(r.no)}</b>`,
  r.m ? `<a href="#/members/${r.m.id}">${esc(r.m.surname)} ${esc(r.m.first_name)}</a>${r.picked ? ' <small class="muted">(επιλογή)</small>' : ''}${r.status === 'taken' ? `<br><small class="vwarn">ανήκει σε: ${esc(r.owner.surname)} ${esc(r.owner.first_name)}</small>` : ''}`
    : `<input class="dpPick" data-i="${r.i}" placeholder="🔎 Αναζήτηση μέλους…" autocomplete="off">`,
  r.m ? regBadge(r.m) : '—', `<span class="pill ${STATUS[r.status][0]}">${STATUS[r.status][1]}</span>`]))}
<p><button class="btn primary" id="dpApply"${n ? '' : ' disabled'}>✔ Καταχώριση ${n} Διπλωμάτων</button></p>`;
        box.querySelectorAll('.dpPick').forEach((inp) => attachPicker(inp, memberItems, (it) => { picks[inp.dataset.i] = it.value.id; draw(); }));
        const b = box.querySelector('#dpApply');
        if (b) b.addEventListener('click', async () => {
          b.disabled = true;
          try { const k = await applyDiplomas(rows); flash(`Καταχωρίστηκαν ${k} Διπλώματα Διδασκάλου.`); go('/members/diplomas'); }
          catch (e) { toast(e.message || String(e), 'error'); b.disabled = false; }
        });
      };
      const load = (rows) => { items = diplomaRows(rows); picks = {}; draw(); };
      el.querySelector('#dpFile').addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { const sh = await readXlsx(f); load(sh.flatMap((s) => (s.rows.length ? [s] : [])).slice(0, 1).flatMap((s) => s.rows)); } catch (err) { toast(err.message || String(err), 'error'); }
        e.target.value = '';
      });
      el.querySelector('#dpRead').addEventListener('click', () => load(parsePasted(el.querySelector('#dpPaste').value)));
    },
  };
}
