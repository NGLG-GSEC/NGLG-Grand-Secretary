// 🏛 ΣΓΥ — Συμβούλιο Γενικών Υποθέσεων (Κανόνες 216–219). Ένας κατάλογος για όλη την εφαρμογή:
//   • εκ του αξιώματος (Κανών 216): αυτόματα από τα εν ενεργεία αξιώματα της Επετηρίδας/Διαταγμάτων (και οι Διατελέσαντες ΜΔ)
//   • διοριζόμενα (Κανών 217): αυτόματα από Διάταγμα «Μέλος Συμβουλίου Γενικών Υποθέσεων»
//   • εκλεγόμενα (Κανόνες 218–219) και κάθε άλλο μέλος: χειροκίνητα ή με ταυτοποίηση λίστας ονομάτων/email/κινητών στο Μητρώο
// Τα πρόσωπα είναι πάντα μέλη του ενιαίου Μητρώου (τίτλος, Επετηρίδα, Στοές, email, κινητό από την καρτέλα τους).
// Ο πίνακας sgy_members (ιδιωτικό αποθετήριο δεδομένων) κρατά μόνο τις προσθήκες/αλλαγές/εξαιρέσεις.
// Από εδώ: νέα Επιστολή προς ΣΓΥ (κατηγορία ΣΓΥ — Bcc όλα τα μέλη, πρωτόκολλο με το «Έτοιμο»), email και WhatsApp.
import { db } from '../core/store.js';
import { module, bind, go, flash, toast, confirmDo, table } from '../core/app.js';
import { esc, fold, sortBy } from '../core/util.js';
import { identify, canonicalId, regCode, digits10 } from '../core/people.js';
import { attachPicker, memberItems, noContact, titledName, memberLodges } from '../core/pickers.js';
import { precedenceOf } from './decree-catalog.js';
import { highestOfficeText, epeteiridaAll } from './epeteirida-table.js';
import { hasActiveList, isCurrentRecord } from './epeteirida-import.js';
import { masonicYear } from './visits.js';

export const SGY_NAME = 'Συμβούλιο Γενικών Υποθέσεων';
export const SGY_TO_NAME = 'Προς τα Μέλη του Συμβουλίου Γενικών Υποθέσεων';
// Κανών 216: μέλη εκ του αξιώματος
export const EX_OFFICIO = ['Μέγας Διδάσκαλος', 'Αντικαταστάτης Μέγας Διδάσκαλος', 'Αναπληρωτής Μέγας Διδάσκαλος', 'Βοηθός Μέγας Διδάσκαλος',
  'Επαρχιακός Μέγας Διδάσκαλος', 'Περιφερειακός Μέγας Διδάσκαλος', 'Πρώτος Μέγας Επόπτης', 'Δεύτερος Μέγας Επόπτης',
  'Πρόεδρος του Συμβουλίου Γενικών Υποθέσεων', 'Μέγας Νομοφύλαξ', 'Μέγας Γραμματεύς', 'Μέγας Καγκελάριος', 'Μέγας Γραμματεύς Εκπαιδεύσεως',
  'Μέγας Θησαυροφύλαξ', 'Πρόεδρος του Μεγάλου Αγαθοεργού Σώματος', 'Μέγας Τελετάρχης', 'Μέγας Επίτροπος των Έργων', 'Μέγας Επιθεωρητής Περιοχής'];
const APPOINTED = 'Μέλος Συμβουλίου Γενικών Υποθέσεων';
export const SGY_BASIS = {
  '216': 'Κανών 216 — εκ του αξιώματος', '216m': 'Κανών 216 — Διατελέσας Μέγας Διδάσκαλος', '216p': 'Κανών 216 — Αμέσως Πρώην Πρόεδρος',
  '217': 'Κανών 217 — διοριζόμενο', '218': 'Κανόνες 218–219 — εκλεγόμενο', 'trans': 'Μεταβατική διάταξη Καν. 216', 'other': 'Άλλο',
};
const base = (o) => String(o || '').replace(/\s*\(\d{4}\)\s*$/, '').trim();
const roleOrder = (r) => { const b = base(r).replace(/^Πρώην /, ''); return r === 'Μέγας Διδάσκαλος' ? 0 : /^Πρώην Μέγας Διδάσκαλος/.test(r) ? 1.5 : precedenceOf(b) ?? (b === APPOINTED || /Μέλος/.test(r) ? 900 : 800); };

// Αυτόματα μέλη από αξιώματα (Διατάγματα/Επετηρίδα): { member_id, role, basis }
export function sgyAuto(src = db) {
  const act = hasActiveList(), y0 = Number(masonicYear().from.slice(0, 4)), out = new Map();
  const add = (mid, role, basis) => { const id = canonicalId(mid, src); if (!id) return; const c = out.get(id); if (!c || roleOrder(role) < roleOrder(c.role)) out.set(id, { member_id: id, role, basis, auto: true }); };
  for (const o of src.all('member_degrees_offices')) {
    if (!o.member_id) continue;
    const off = base(o.office);
    if (off === 'Πρώην Μέγας Διδάσκαλος') { add(o.member_id, off, '216m'); continue; }
    if (!isCurrentRecord(o, act, y0)) continue;
    if (EX_OFFICIO.includes(off)) add(o.member_id, off, '216');
    else if (off === APPOINTED) add(o.member_id, off, '217');
  }
  for (const r of epeteiridaAll()) { // ο Μέγας Διδάσκαλος και οι Διατελέσαντες από την Επετηρίδα
    if (!r.member_id) continue;
    if (Number(r.active) && /^Μέγας Διδάσκαλος$/.test(String(r.rank || '').trim())) add(r.member_id, 'Μέγας Διδάσκαλος', '216');
    if (/^Πρώην Μέγας Διδάσκαλος$/.test(String(r.rank || '').trim())) add(r.member_id, 'Πρώην Μέγας Διδάσκαλος', '216m');
  }
  return out;
}
// Ο κατάλογος του ΣΓΥ: αυτόματα + χειροκίνητα (που υπερισχύουν), χωρίς τις εξαιρέσεις, κατά τάξη προβαδίσματος
export function sgyMembers(src = db) {
  const map = sgyAuto(src);
  for (const r of src.all('sgy_members')) {
    const id = canonicalId(r.member_id, src); if (!id) continue;
    if (Number(r.excluded)) { map.delete(id); continue; }
    const a = map.get(id) || {};
    map.set(id, { ...a, member_id: id, role: r.role || a.role || 'Μέλος', basis: r.basis || a.basis || 'other', province: r.province || '', term: r.term || '', notes: r.notes || '', row_id: r.id, auto: !!a.auto });
  }
  return sortBy([...map.values()].map((x) => ({ ...x, m: src.get('member_registry', x.member_id) })).filter((x) => x.m),
    (x) => roleOrder(x.role), (x) => x.m.surname || '', (x) => x.m.first_name || '');
}
const usable = (x) => !noContact(x.m);
export const sgyEmails = () => [...new Set(sgyMembers().filter(usable).map((x) => String(x.m.email || '').trim().toLowerCase()).filter(Boolean))];
const waNo = (m) => { const d = digits10(m.mobile); return d.length === 10 ? '30' + d : ''; };
export const sgyLetterUrl = () => `#/letters/new?category=ΣΓΥ&to_name=${encodeURIComponent(SGY_TO_NAME)}`;

// Ταυτοποίηση λίστας (ονόματα, email, κινητά — μία γραμμή ανά Αδελφό) στο Μητρώο
export function matchList(text) {
  return String(text || '').split(/\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const email = ((line.match(/[^\s<>,;"'()]+@[^\s<>,;"'()]+\.[a-z]{2,}/i) || [''])[0]).toLowerCase(), mob = digits10((line.match(/(?:\+?30)?\s*69\d[\d\s]{7,}/) || [''])[0]);
    const name = line.replace(/[^\s,;<>]+@[^\s,;<>]+/g, ' ').replace(/(?:\+?30)?\s*69\d[\d\s]{7,}/g, ' ').replace(/[<>,;:|\t"]+/g, ' ').replace(/\s+/g, ' ').trim();
    const parts = name.split(' ');
    const id = identify({ email, mobile: mob, full_name: name }) || (parts.length >= 2 ? identify({ surname: parts[parts.length - 1], first_name: parts[0] }) : null);
    return { line, name, email, mobile: mob, member_id: id ? canonicalId(id) : null };
  });
}

function sgyPage({ query = {} }, inRegistry = false) {
  const xs = sgyMembers(), emails = sgyEmails(), q = fold(query.q || '');
  const shown = q ? xs.filter((x) => fold(`${x.m.surname} ${x.m.first_name} ${x.role} ${x.m.email} ${regCode(x.m)}`).includes(q)) : xs;
  const rows = shown.map((x, i) => {
    const m = x.m, blocked = noContact(m), wa = waNo(m), ls = memberLodges(m.id).map((l) => `${l.lodge_name} ${l.lodge_number}`.trim()).filter(Boolean);
    return [`<b>${i + 1}</b>`,
      `<a href="#/members/${m.id}"><b>${esc(titledName(m))}</b></a><br><small class="muted">${esc(regCode(m) || '')}${ls.length ? ' · ' + esc(ls.join(', ')) : ''}</small>`,
      `<b>${esc(x.role)}</b><br><small class="muted">${esc(SGY_BASIS[x.basis] || x.basis || '')}${x.auto ? ' · αυτόματα' : ''}${x.province ? ' · ' + esc(x.province) : ''}${x.term ? ' · ' + esc(x.term) : ''}</small>`,
      `<small>${esc(highestOfficeText(m.id) || '—')}</small>`,
      blocked ? '⛔' : m.email ? `<a href="mailto:${esc(m.email)}">${esc(m.email)}</a>` : '<span class="vwarn">χωρίς email</span>',
      blocked ? '⛔' : m.mobile ? esc(m.mobile) : '<span class="vwarn">χωρίς κινητό</span>',
      `${!blocked && wa ? `<a class="btn small wa-btn sgy-wa" target="_blank" rel="noopener" data-wa="${wa}" href="https://wa.me/${wa}">WhatsApp</a> ` : ''}<a class="btn small" href="#/members/card?ids=${m.id}">🪪</a> <button type="button" class="btn small danger" data-act="drop" data-id="${m.id}" title="Αφαίρεση από το ΣΓΥ">✕</button>`];
  });
  const back = inRegistry ? '<p><a href="#/members">← Μητρώο Μελών</a> · <a href="#/sgy">🏛 Ενότητα ΣΓΥ</a></p>' : '<p><a href="#/">← Αρχική</a> · <a href="#/members/sgy">Μητρώο Μελών ΣΓΥ</a></p>';
  return {
    title: inRegistry ? 'Μητρώο Μελών ΣΓΥ' : 'ΣΓΥ',
    html: `${back}<div class="hero"><div><h1>🏛 ${inRegistry ? 'Μητρώο Μελών ΣΓΥ' : 'ΣΓΥ — Συμβούλιο Γενικών Υποθέσεων'}</h1>
<p class="muted">${xs.length} μέλη · ${emails.length} με email · ${xs.filter((x) => waNo(x.m)).length} με κινητό. Εκ του αξιώματος (Καν. 216) και διοριζόμενα (Καν. 217) έρχονται αυτόματα από τα Διατάγματα και την Επετηρίδα· τα εκλεγόμενα (Καν. 218–219) προστίθενται εδώ.</p></div>
<div class="toolbar"><a class="btn primary" href="${sgyLetterUrl()}">✉ Νέα Επιστολή προς ΣΓΥ</a><button type="button" class="btn" data-act="wa">💬 WhatsApp σε όλους</button></div></div>
<div class="card noprint" id="sgyWa" hidden><h3 style="margin-top:0">💬 Μήνυμα WhatsApp προς τα μέλη του ΣΓΥ</h3><textarea id="sgyWaText" rows="4">Αγαπητέ Αδελφέ,\n\n</textarea>
<p class="muted">Πατήστε ένα-ένα τα ονόματα: ανοίγει η συνομιλία με έτοιμο το μήνυμα (το WhatsApp δεν επιτρέπει μαζική αποστολή από σύνδεσμο).</p><div class="sgy-walist">${xs.filter((x) => usable(x) && waNo(x.m)).map((x) => `<a class="btn small wa-btn" target="_blank" rel="noopener" data-wa="${waNo(x.m)}" href="https://wa.me/${waNo(x.m)}">${esc(`${x.m.surname} ${x.m.first_name}`)}</a>`).join(' ')}</div></div>
<div class="toolbar noprint"><button type="button" class="btn small" data-act="copyEmails">📋 Αντιγραφή email (${emails.length})</button><button type="button" class="btn small" data-act="copyMobiles">📋 Αντιγραφή κινητών</button>
<a class="btn small" href="mailto:?bcc=${encodeURIComponent(emails.join(','))}">✉ Email σε όλους (Bcc)</a><button type="button" class="btn small" data-act="xlsx">⬇ Excel</button><button type="button" class="btn small" data-act="print">🖨 Εκτύπωση</button></div>
<form class="filters noprint" id="sgyFlt"><input name="q" value="${esc(query.q || '')}" placeholder="Αναζήτηση: όνομα, ιδιότητα, email, MM/M"><button>Αναζήτηση</button></form>
<div class="print-area">${table(['Α/Α', 'Ονοματεπώνυμο (Μητρώο)', 'Ιδιότητα στο ΣΓΥ', 'Επετηρίδα', 'Email', 'Κινητό', ''], rows, 'Δεν υπάρχουν μέλη ΣΓΥ — προσθέστε από κάτω.')}</div>
<details class="card fold noprint" open><summary><b>+ Προσθήκη μέλους ΣΓΥ</b></summary><div class="grid" style="margin-top:10px">
<div class="full"><label>🔎 Μέλος του Μητρώου</label><input id="sgyFind" placeholder="Επώνυμο, όνομα, MM/M, email ή κινητό" autocomplete="off"><input type="hidden" id="sgyMid"><small class="muted" id="sgyPicked"></small></div>
<div><label>Ιδιότητα στο ΣΓΥ</label><input id="sgyRole" value="Μέλος" list="sgyRoles"><datalist id="sgyRoles">${['Μέλος', 'Πρόεδρος', 'Αντιπρόεδρος', 'Αμέσως Πρώην Πρόεδρος', 'Γραμματεύς', 'Διοριζόμενο Μέλος', 'Εκλεγόμενο Μέλος', ...EX_OFFICIO].map((r) => `<option value="${esc(r)}">`).join('')}</datalist></div>
<div><label>Βάση</label><select id="sgyBasis">${Object.entries(SGY_BASIS).map(([k, v]) => `<option value="${k}"${k === '218' ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
<div><label>Επαρχία / Στοές Κέντρου</label><input id="sgyProv" placeholder="π.χ. Μακεδονίας ή Στοές Κέντρου"></div><div><label>Θητεία</label><input id="sgyTerm" placeholder="π.χ. 2026–2029"></div>
</div><div class="toolbar"><button type="button" class="btn primary" data-act="add">+ Προσθήκη στο ΣΓΥ</button></div></details>
<details class="card fold noprint"><summary><b>📥 Ταυτοποίηση λίστας ονομάτων / email / κινητών στο Μητρώο</b></summary>
<p class="muted">Επικολλήστε μία γραμμή ανά Αδελφό (όνομα, email ή κινητό — π.χ. από email προς το ΣΓΥ ή από ομάδα Επαφών Google). Η εφαρμογή βρίσκει ποιος είναι στο Μητρώο, με τίτλο, αξίωμα και στοιχεία· μετά «Προσθήκη».</p>
<textarea id="sgyList" rows="6" placeholder="Παπαδόπουλος Γεώργιος <g.papadopoulos@example.com>&#10;6944123456&#10;…"></textarea>
<div class="toolbar"><button type="button" class="btn" data-act="match">🔎 Ταυτοποίηση</button></div><div id="sgyMatch"></div></details>`,
    mount(el) {
      bind(el, {
        wa() { const c = el.querySelector('#sgyWa'); c.hidden = !c.hidden; },
        async copyEmails() { await navigator.clipboard.writeText(emails.join(', ')).catch(() => {}); toast(`Αντιγράφηκαν ${emails.length} email.`); },
        async copyMobiles() { const ms = xs.filter(usable).map((x) => x.m.mobile).filter(Boolean); await navigator.clipboard.writeText(ms.join(', ')).catch(() => {}); toast(`Αντιγράφηκαν ${ms.length} κινητά.`); },
        print: () => window.print(),
        async xlsx() {
          const { exportXlsx } = await import('../core/util.js');
          exportXlsx('ΣΓΥ — Μέλη', 'ΣΓΥ', ['Α/Α', 'Επώνυμο', 'Όνομα', 'Τίτλος', 'Αρ. Μητρώου', 'Ιδιότητα στο ΣΓΥ', 'Βάση', 'Επετηρίδα', 'Email', 'Κινητό'],
            xs.map((x, i) => [i + 1, x.m.surname, x.m.first_name, titledName(x.m).replace(`${x.m.first_name} ${x.m.surname}`, '').trim(), regCode(x.m), x.role, SGY_BASIS[x.basis] || '', highestOfficeText(x.m.id), noContact(x.m) ? '' : x.m.email || '', noContact(x.m) ? '' : x.m.mobile || '']), [6, 18, 16, 14, 12, 28, 30, 30, 30, 16]);
        },
        async drop(ds) {
          const x = xs.find((y) => y.member_id === Number(ds.id)); if (!x) return;
          if (!confirmDo(`Αφαίρεση του ${titledName(x.m)} από το ΣΓΥ;${x.auto ? '\n\nΕίναι μέλος αυτόματα (από το αξίωμά του)· θα σημειωθεί ως εξαίρεση.' : ''}`)) return;
          await db.save(`ΣΓΥ: αφαίρεση ${x.m.surname}`, (tx) => {
            if (x.row_id) tx.remove('sgy_members', x.row_id);
            if (x.auto) tx.insert('sgy_members', { member_id: x.member_id, excluded: 1, role: '', basis: '', notes: 'Εξαίρεση' });
          });
          go(location.hash.slice(1).split('?')[0], query);
        },
        async add() {
          const mid = Number(el.querySelector('#sgyMid').value); if (!mid) { toast('Επιλέξτε μέλος του Μητρώου.', 'error'); return; }
          await addSgy([{ member_id: mid, role: el.querySelector('#sgyRole').value.trim() || 'Μέλος', basis: el.querySelector('#sgyBasis').value, province: el.querySelector('#sgyProv').value.trim(), term: el.querySelector('#sgyTerm').value.trim() }]);
          go(location.hash.slice(1).split('?')[0], query);
        },
        match() {
          const res = matchList(el.querySelector('#sgyList').value), have = new Set(xs.map((x) => x.member_id)), box = el.querySelector('#sgyMatch');
          box.innerHTML = table(['Γραμμή', 'Μέλος του Μητρώου', 'Τίτλος / Επετηρίδα', 'Email / Κινητό', ''], res.map((r, i) => {
            const m = r.member_id && db.get('member_registry', r.member_id);
            return [esc(r.line), m ? `<b>${esc(titledName(m))}</b><br><small class="muted">${esc(regCode(m))}</small>` : '<span class="vwarn">Δεν βρέθηκε στο Μητρώο</span>', m ? `<small>${esc(highestOfficeText(m.id) || '—')}</small>` : '',
              m ? `<small>${esc(m.email || '—')}<br>${esc(m.mobile || '—')}</small>` : '', m ? (have.has(m.id) ? '<span class="vok">✓ ήδη στο ΣΓΥ</span>' : `<label class="chk"><input type="checkbox" data-mi="${i}" checked> προσθήκη</label>`) : ''];
          })) + (res.some((r) => r.member_id && !have.has(r.member_id)) ? '<div class="toolbar"><button type="button" class="btn primary" id="sgyAddAll">+ Προσθήκη των επιλεγμένων (Κανόνες 218–219)</button></div>' : '');
          const btn = box.querySelector('#sgyAddAll');
          if (btn) btn.addEventListener('click', async () => {
            const pick = [...box.querySelectorAll('[data-mi]:checked')].map((c) => res[+c.dataset.mi]).filter((r) => r.member_id);
            await addSgy([...new Map(pick.map((r) => [r.member_id, { member_id: r.member_id, role: 'Μέλος', basis: '218' }])).values()]);
            go(location.hash.slice(1).split('?')[0], query);
          });
        },
      });
      el.querySelector('#sgyWaText').addEventListener('input', (e) => { for (const a of el.querySelectorAll('[data-wa]')) a.href = `https://wa.me/${a.dataset.wa}?text=${encodeURIComponent(e.target.value)}`; });
      attachPicker(el.querySelector('#sgyFind'), (q2) => memberItems(q2), (m) => { el.querySelector('#sgyMid').value = m.id; el.querySelector('#sgyPicked').textContent = `✓ ${titledName(m)} ${regCode(m)} — ${highestOfficeText(m.id) || ''}`; });
      el.querySelector('#sgyFlt').addEventListener('submit', (e) => { e.preventDefault(); go(location.hash.slice(1).split('?')[0], { q: e.target.q.value }); });
    },
  };
}
export async function addSgy(items) {
  if (!items.length) return 0;
  await db.save(`ΣΓΥ: προσθήκη ${items.length}`, (tx) => {
    for (const it of items) {
      tx.remove('sgy_members', (r) => canonicalId(r.member_id) === canonicalId(it.member_id));
      tx.insert('sgy_members', { member_id: it.member_id, role: it.role || 'Μέλος', basis: it.basis || 'other', province: it.province || '', term: it.term || '', notes: '', excluded: 0 });
    }
  });
  flash(`Προστέθηκαν ${items.length} μέλη στο ΣΓΥ.`);
  return items.length;
}
export const sgyRegistryPage = (ctx) => sgyPage(ctx, true);

module({ id: 'sgy', routes: { '/sgy': (ctx) => sgyPage(ctx, false) } });
