// 🖨 Κάρτα Μέλους (Α4): όλα τα στοιχεία ενός μέλους από το ενιαίο Μητρώο — Αρ. Μητρώου, Δίπλωμα Διδασκάλου, τεκτονική πορεία
// (Εισδοχή, Διέλευση, Έγερση, Στοά Εγέρσεως), Στοές με ιδιότητα, συνδρομή και ημερομηνίες Β΄/Α΄ Επόπτη και Σεβασμίου,
// Επετηρίδα και Διατάγματα που τον αφορούν. (Το επίσημο Δίπλωμα Διδασκάλου Τέκτονος είναι ξεχωριστό έντυπο.)
import { db } from '../core/store.js';
import { bind } from '../core/app.js';
import { esc, sortBy, fmtDate, today } from '../core/util.js';
import { regCode, canonicalId } from '../core/people.js';
import { noContact } from '../core/pickers.js';
import { IMG, printPaper } from '../core/paper.js';
import { isoOf, lodgesByMember, capacityOf, feeRankLabel } from './members.js';
import { epeteiridaOf } from './epeteirida-table.js';

const d = (v) => esc(fmtDate(isoOf(v)) || '');
const dash = (v) => (String(v ?? '').trim() ? esc(v) : '<span class="mc-empty">—</span>');
const tbl = (head, rows, empty) => (rows.length ? `<table class="mc-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`
  : `<p class="mc-empty">${esc(empty)}</p>`);
const kv = (pairs) => `<dl class="mc-kv">${pairs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

// Διατάγματα που αφορούν το μέλος (από την Επετηρίδα των Διαταγμάτων: member_degrees_offices)
export function memberDecrees(m) {
  const id = canonicalId(m.id), docs = new Map(db.all('decree_documents').map((x) => [x.id, x]));
  return sortBy(db.all('member_degrees_offices').filter((o) => canonicalId(o.member_id) === id && (o.decree_id || o.decree_no)),
    (o) => -(Number(o.decree_year) || 0), (o) => -(Number(o.decree_no) || 0)).map((o) => ({ ...o, doc: docs.get(o.decree_id) || null }));
}

export function memberCardPaper(m) {
  const ls = lodgesByMember()[m.id] || [], ep = epeteiridaOf(m.id), decs = memberDecrees(m), blocked = noContact(m);
  const status = blocked ? '⛔ Διαγραμμένος' : m.active !== 0 ? 'Ενεργός' : 'Ανενεργός';
  // αξιώματα σε Στοές: Σεβάσμιος, Α΄ Επόπτης, Β΄ Επόπτης (από τις Στοές του μέλους)
  const offices = [['wm_date', 'Σεβάσμιος'], ['sw_date', 'Α΄ Επόπτης'], ['jw_date', 'Β΄ Επόπτης']]
    .flatMap(([k, t]) => ls.filter((l) => l[k]).map((l) => [esc(t), esc(`${l.lodge_name} ${l.lodge_number}`.trim()), d(l[k])]));
  return `<article class="paper member-card">
<header class="mc-head"><img src="${IMG.emblem}" alt=""><div><div class="mc-org">ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ · ΜΕΓΑΛΗ ΓΡΑΜΜΑΤΕΙΑ</div>
<div class="mc-title">ΚΑΡΤΑ ΜΕΛΟΥΣ</div></div><div class="mc-reg"><small>Αρ. Μητρώου</small><b>${esc(regCode(m) || '—')}</b></div></header>
<div class="mc-name">${m.title && m.title !== 'Αδ.' ? `<small>${esc(m.title)}</small> ` : ''}${esc(m.surname || '')} ${esc(m.first_name || '')}</div>
<section><h3>Στοιχεία μέλους</h3>${kv([['Αρ. Μητρώου', esc(regCode(m) || '—')], ['Δίπλωμα Διδασκάλου', String(m.diploma_no ?? '').trim() ? `MM${esc(m.diploma_no)}` : '<span class="mc-empty">—</span>'],
  ['Βαθμός', dash(m.degree)], ['Κατάσταση', esc(status)], ['Email', blocked ? '⛔' : dash(m.email)], ['Κινητό', blocked ? '⛔' : dash(m.mobile)]])}</section>
<section><h3>Τεκτονική πορεία</h3>${kv([['Εισδοχή — Μαθητής', d(m.date_ea) || '<span class="mc-empty">—</span>'], ['Διέλευση — Εταίρος', d(m.date_fc) || '<span class="mc-empty">—</span>'],
  ['Έγερση — Διδάσκαλος', d(m.date_mm) || '<span class="mc-empty">—</span>'], ['Στοά Εγέρσεως', dash(`${m.mm_lodge_name || ''} ${m.mm_lodge_number || ''}`.trim())]])}</section>
<section><h3>Στοές</h3>${tbl(['Στοά', 'Ιδιότητα', 'Συνδρομή', 'Κατάσταση', 'Ημ. ιδιότητας', 'Β΄ Επόπτης', 'Α΄ Επόπτης', 'Σεβάσμιος', 'Διαγραφή'],
  ls.map((l) => [`<b>${esc(`${l.lodge_name} ${l.lodge_number}`.trim())}</b>`, dash(capacityOf(l)), dash(feeRankLabel(l.fee_rank)), dash(l.member_status), d(l.capacity_date), d(l.jw_date), d(l.sw_date), d(l.wm_date), d(l.dereg_date)]),
  'Δεν έχουν καταχωριστεί Στοές.')}
${offices.length ? `<p class="mc-sub">Αξιώματα σε Στοές: ${offices.map(([t, l, x]) => `<b>${t}</b> ${l}${x ? ` (${x})` : ''}`).join(' · ')}</p>` : ''}</section>
<section><h3>Επετηρίδα</h3>${tbl(['Ανώτατο αξίωμα / βαθμός', 'Τίτλος κατά το Σύνταγμα', 'Προσφώνηση', 'Διάταγμα', 'Εν ενεργεία', 'ΤΜΔ', 'Επαρχία / Στοά'],
  ep.map((r) => [`<b>${dash(r.rank)}</b>`, dash(r.title), dash(r.honorific), dash(r.decree_no ? `${r.decree_no}${r.decree_year ? '/' + r.decree_year : ''}` : r.decree_year), Number(r.active) ? `ΝΑΙ${r.current ? ' — ' + esc(r.current) : ''}` : dash(r.current),
    Number(r.tmd) ? `ΝΑΙ ${esc(r.tmd_decree || '')}` : '—', dash(r.province)]), 'Δεν υπάρχει στην Επετηρίδα.')}</section>
<section><h3>Διατάγματα</h3>${tbl(['Διάταγμα', 'Ημερομηνία', 'Αξίωμα / Τίτλος', 'Περί'],
  decs.map((o) => [`<b>${esc(o.decree_no ? `${o.decree_no}/${o.decree_year || ''}` : o.decree_year || '')}</b>`, o.doc ? d(o.doc.decree_date) : '', dash(o.office), dash(o.doc && o.doc.matter)]), 'Δεν υπάρχουν Διατάγματα στο Αρχείο.')}</section>
${m.deregistered_note || m.additional_lodges ? `<section><h3>Σημειώσεις</h3>${m.deregistered_note ? `<p>${esc(m.deregistered_note)}</p>` : ''}${m.additional_lodges ? `<p class="mc-sub">${esc(m.additional_lodges)}</p>` : ''}</section>` : ''}
<footer class="mc-foot">Εκτύπωση ${esc(fmtDate(today()))} · Μεγάλη Γραμματεία ΕΜΣτΕ · Ενιαίο Μητρώο Μελών</footer></article>`;
}

export function memberCardPage({ query = {} } = {}) {
  const ms = String(query.ids || '').split(',').map(Number).filter(Boolean).map((id) => db.get('member_registry', id)).filter(Boolean);
  const back = ms.length === 1 ? `#/members/${ms[0].id}` : '#/members/diplomas';
  return {
    title: 'Κάρτα Μέλους',
    html: `<div class="noprint"><p><a href="${back}">← Πίσω</a></p><h1>🖨 Κάρτα Μέλους ${ms.length > 1 ? `<small class="muted">${ms.length} κάρτες</small>` : ''}</h1>
<div class="toolbar"><button type="button" class="btn primary" data-act="print">🖨 Εκτύπωση / PDF</button></div></div>
<div class="print-area">${ms.length ? ms.map(memberCardPaper).join('') : '<div class="card">Δεν βρέθηκαν μέλη.</div>'}</div>`,
    mount(el) { bind(el, { print: () => printPaper(ms.length === 1 ? `Κάρτα Μέλους ${regCode(ms[0])} ${ms[0].surname} ${ms[0].first_name}` : 'Κάρτες Μελών') }); },
  };
}
