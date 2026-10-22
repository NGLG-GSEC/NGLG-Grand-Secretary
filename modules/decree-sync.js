// Διάταγμα → Επετηρίδα → Μητρώο: μία λογική για όλη την εφαρμογή.
// Ένα Διάταγμα απονέμει αξίωμα/τίτλο σε μέλος του Μητρώου· η Επετηρίδα δείχνει ακριβώς αυτή την τάξη τίτλων· ο Τίτλος
// (προσφώνηση) του μέλους στο Μητρώο ακολουθεί την Επετηρίδα (namedays.js → syncMemberTitles). Εδώ:
//   planDecreeSync()  — τι θα αλλάξει (για επιβεβαίωση από τον χρήστη πριν γίνει)
//   applyDecreeSync() — εφαρμογή μέσα στη συναλλαγή του Διατάγματος και καταγραφή στο Διάταγμα (ep_sync) ως υπενθύμιση
//   revertDecreeSync() — αναίρεση όταν το Διάταγμα διαγράφεται ή αλλάζει (μόνο ό,τι δεν άλλαξε στο μεταξύ)
// Κανόνες: ΔΙΟΡΙΖΟΜΕΝ (αξίωμα με θέση προβαδίσματος) → «Εν ενεργεία», και ανώτατο αξίωμα/προσφώνηση αν είναι ανώτερα·
// ΑΠΟΝΕΜΕΙ (Πρώην …) → ανώτατο αξίωμα/προσφώνηση αν είναι ανώτερα· Τάξις ΜΔ δι’ Υπηρεσίας → ΤΜΔ.
import { db } from '../core/store.js';
import { identify, canonicalId } from '../core/people.js';
import { DEC_MAP, OFFICE_FORMS, precedenceOf } from './decree-catalog.js';
import { honorificLevel } from './epeteirida-table.js';

const EP_FIELDS = ['rank', 'title', 'honorific', 'decree_no', 'decree_year', 'active', 'current', 'tmd', 'tmd_decree', 'member_id'];
export const EP_LABEL = { rank: 'Ανώτατο αξίωμα', title: 'Τίτλος', honorific: 'Προσφώνηση', decree_no: 'Αρ. διατάγματος', decree_year: 'Έτος', active: 'Ενεργός', current: 'Εν ενεργεία αξίωμα', tmd: 'ΤΜΔ', tmd_decree: 'Διάταγμα ΤΜΔ' };
const parse = (v, def) => { try { return typeof v === 'string' ? JSON.parse(v || 'null') ?? def : v ?? def; } catch { return def; } };
export const decreeMeta = (d) => { const r = parse(d.rules, {}); return Array.isArray(r) ? { action: 'appoint' } : { action: r.action || 'appoint', award_office: r.award_office || '', decree_office: r.decree_office || '' }; };
export const decreePeople = (d) => parse(d.appointments, []);
export const syncInfo = (d) => parse(d && d.ep_sync, null);
const prec = (rank) => precedenceOf(rank) ?? 999;
const better = (rank, than) => prec(rank) < prec(than);
const show = (k, v) => (v === '' || v == null ? '—' : k === 'active' || k === 'tmd' ? (Number(v) ? 'ΝΑΙ' : 'ΟΧΙ') : String(v));

// Γραμμές Επετηρίδας ενός προσώπου (και μη συνδεδεμένες με βέβαιο ονοματεπώνυμο), η «κύρια» πρώτη.
// Η ταυτοποίηση γίνεται στο ενιαίο ευρετήριο προσώπων (db, με μνήμη)· ένα νέο μέλος της συναλλαγής απλώς δεν έχει γραμμές.
function personRows(src, mid) {
  const id = canonicalId(mid), nameOf = new Map();
  const who = (r) => { if (!nameOf.has(r.id)) nameOf.set(r.id, identify({ full_name: r.full_name })); return nameOf.get(r.id); };
  return src.all('epeteirida').filter((r) => (r.member_id ? canonicalId(r.member_id) === id || Number(r.member_id) === Number(mid) : r.member_id == null && r.full_name && who(r) === id))
    .sort((a, b) => prec(a.rank) - prec(b.rank) || (Number(b.decree_year) || 0) - (Number(a.decree_year) || 0));
}
const memberOf = (src, a) => (a.member_id && src.get('member_registry', Number(a.member_id)) ? canonicalId(Number(a.member_id), src)
  : identify({ surname: a.last_name, first_name: a.first_name, email: a.email, mobile: a.mobile }, src));

// d: { action, office|decree_office|award_office, decree_no, decree_year }, people: [{ member_id, first_name, last_name, … }]
export function planDecreeSync(d, people, src = db, selfId = null) {
  const action = d.action || decreeMeta(d).action, no = d.decree_no, year = d.decree_year, dn = `${no}/${year}`;
  const office = action === 'appoint' ? d.office || d.decree_office || decreeMeta(d).decree_office : action === 'award' ? d.award_office || decreeMeta(d).award_office : '';
  const out = [];
  for (const a of people) {
    const name = `${a.last_name || ''} ${a.first_name || ''}`.trim(), mid = memberOf(src, a);
    if (action === 'appoint' && precedenceOf(office) == null) { out.push({ name, member_id: mid, note: `Το αξίωμα «${office}» δεν ανήκει στην τάξη προβαδίσματος — δεν αλλάζει την Επετηρίδα.`, set: {} }); continue; }
    const rows = mid ? personRows(src, mid) : [], main = rows[0] || null, set = {};
    const cur = (k) => (main ? main[k] ?? '' : '');
    if (action === 'appoint' || action === 'award') {
      const rank = action === 'appoint' ? office : `Πρώην ${office}`, hon = (DEC_MAP[office] || {}).hon_short || (OFFICE_FORMS[office] || [])[2] || '';
      if (!main || better(rank, cur('rank'))) Object.assign(set, { rank, title: rank, decree_no: no, decree_year: year });
      if (hon && (honorificLevel(hon) ?? -1) > (honorificLevel(cur('honorific')) ?? -1)) set.honorific = hon;
      if (action === 'appoint') {
        // «Εν ενεργεία» μόνο από το πιο πρόσφατο Διάταγμα διορισμού του μέλους
        const newer = src.all('decree_documents').some((x) => x.id !== selfId && decreeMeta(x).action === 'appoint' && (Number(x.decree_year) > Number(year) || (Number(x.decree_year) === Number(year) && Number(x.decree_no) > Number(no)))
          && decreePeople(x).some((p) => memberOf(db, p) === mid));
        if (!newer) Object.assign(set, { active: 1, current: `${office} — Διάταγμα ${dn}` });
      }
    } else if (action === 'service_award') Object.assign(set, { tmd: 1, tmd_decree: dn });
    if (mid && main && !main.member_id) set.member_id = mid;
    for (const k of Object.keys(set)) if (main && String(main[k] ?? '') === String(set[k])) delete set[k];
    out.push({ name, member_id: mid, ep_id: main ? main.id : null, create: !main && !!mid && Object.keys(set).length > 0, before: main ? Object.fromEntries(EP_FIELDS.map((k) => [k, main[k] ?? ''])) : null, set,
      note: !mid ? 'Δεν βρέθηκε στο Μητρώο — θα δημιουργηθεί με την έκδοση· ξαναδείτε την Επετηρίδα.' : '' });
  }
  return out;
}
export const planChanges = (plan) => plan.filter((p) => Object.keys(p.set).length);
export function planText(plan) {
  const lines = plan.map((p) => {
    const ch = Object.entries(p.set).filter(([k]) => k !== 'member_id').map(([k, v]) => `${EP_LABEL[k] || k}: ${p.before ? `${show(k, p.before[k])} → ` : ''}${show(k, v)}`);
    return `• ${p.name}${p.create ? ' (νέα εγγραφή στην Επετηρίδα)' : ''}: ${ch.length ? ch.join(' · ') : p.note || 'καμία αλλαγή (ήδη ενημερωμένη)'}`;
  });
  return lines.join('\n');
}

// Εφαρμογή μέσα σε συναλλαγή· γράφει στο Διάταγμα τι έγινε (ep_sync) για υπενθύμιση/αναίρεση
export function applyDecreeSync(tx, d) {
  const plan = planDecreeSync(d, decreePeople(d), tx, d.id), done = [];
  const nextAa = () => Math.max(0, ...tx.all('epeteirida').map((r) => Number(r.aa) || 0)) + 1;
  for (const p of plan) {
    if (!Object.keys(p.set).length) continue;
    if (p.create) {
      const r = tx.insert('epeteirida', { aa: nextAa(), active: 0, title: '', honorific: '', full_name: p.name, rank: '', province: '', decree_no: '', decree_year: '', tmd: 0, tmd_decree: '', current: '', member_id: p.member_id, ...p.set });
      done.push({ ep_id: r.id, created: true, name: p.name, member_id: p.member_id, after: p.set });
    } else {
      tx.update('epeteirida', p.ep_id, p.set);
      done.push({ ep_id: p.ep_id, created: false, name: p.name, member_id: p.member_id, before: Object.fromEntries(Object.keys(p.set).map((k) => [k, p.before[k]])), after: p.set });
    }
  }
  tx.update('decree_documents', d.id, { ep_sync: JSON.stringify({ at: new Date().toISOString(), changes: done, text: planText(plan) }) });
  return done;
}
// Αναίρεση: επαναφέρει μόνο τα πεδία που έχουν ακόμη την τιμή που έγραψε το Διάταγμα
export function revertDecreeSync(tx, d) {
  const s = syncInfo(d);
  if (!s) return 0;
  let n = 0;
  for (const c of s.changes || []) {
    const r = tx.get('epeteirida', c.ep_id);
    if (!r) continue;
    const same = Object.keys(c.after).every((k) => String(r[k] ?? '') === String(c.after[k]));
    if (c.created) { if (same) { tx.remove('epeteirida', c.ep_id); n++; } continue; }
    const back = Object.fromEntries(Object.keys(c.after).filter((k) => String(r[k] ?? '') === String(c.after[k])).map((k) => [k, c.before[k] ?? '']));
    if (Object.keys(back).length) { tx.update('epeteirida', c.ep_id, back); n++; }
  }
  tx.update('decree_documents', d.id, { ep_sync: '' });
  return n;
}
