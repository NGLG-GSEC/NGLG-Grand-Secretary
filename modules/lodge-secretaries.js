// Γραμματείς Στοών (Επαρχίες) — οι Επαρχιακές Γραμματείες καταχωρίζουν, στη δημόσια σελίδα secretaries/ (κωδικός στο email τους),
// για κάθε Στοά της Επαρχίας τους: το επίσημο email της Στοάς (το κλειδί της Στοάς) και ονοματεπώνυμο + κινητό του Γραμματέα.
// Μία πηγή: ο κατάλογος Στοών (lodges: email, secretary, secretary_last/first, secretary_mobile). Ο server (Apps Script της Πύλης) κρατά
// αντίγραφο ανά Επαρχία και τα μέλη κάθε Στοάς μόνο για τον έλεγχο «ο Γραμματέας είναι μέλος της Στοάς · έχει Δίπλωμα Διδασκάλου».
import { db } from '../core/store.js';
import { module, bind, toast, go, flash, table } from '../core/app.js';
import { esc, fold, sortBy, fmtDate, EMAIL_RE } from '../core/util.js';
import { lodgesAll, lodgeNoKey } from './lodges.js';
import { provincesAll } from './provinces.js';
import { lodgesByMember, lodgeDeregged } from './members.js';
import { portalApi, portalReady } from './lodge-portal.js';

export const SECRETARIES_PAGE = 'https://nglg-gsec.github.io/NGLG-Grand-Secretary/secretaries/';
db.seed('lodge_secretary_log', () => []);
// Ιονίων Νήσων: και το email της Επαρχιακής Γραμματείας του pglionianislands.gr (από τις Επαφές της Μεγάλης Γραμματείας)
db.migrate('province-ionian-secretary-email-2026-10', (tx) => {
  const p = tx.find('grand_lodges', (x) => String(x.short || '').includes('Ιονίων'));
  if (p && !String(p.secretary_email || '').trim()) tx.update('grand_lodges', p.id, { secretary_email: 'provincialgrandsecretary@pglionianislands.gr' });
});

const S = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const plain = (v) => fold(v).toUpperCase().replace(/[^A-ZΑ-Ω ]/g, ' ').replace(/\s+/g, ' ').trim();
// Γραμματέας της Στοάς: επώνυμο / όνομα (νέα πεδία, ή από το παλιό «Γραμματέας» = «Επώνυμο Όνομα»)
export function secretaryOf(l) {
  const last = S(l.secretary_last), first = S(l.secretary_first);
  if (last || first) return { last, first };
  const [a = '', ...b] = S(l.secretary).split(' ');
  return { last: a, first: b.join(' ') };
}
const membersOf = (no) => {
  const byM = lodgesByMember(), out = [];
  for (const m of db.all('member_registry')) {
    if (m.active === 0) continue;
    if ((byM[m.id] || []).some((r) => lodgeNoKey(r.lodge_number) === no && !lodgeDeregged(r))) out.push(m);
  }
  return out;
};
const hasDiploma = (m) => !!S(m.diploma_no);
// ίδιος έλεγχος με τον server: ίδιο επώνυμο και όνομα (ή αρχή του) ανάμεσα στα ενεργά μέλη της Στοάς
export function secretaryCheck(l) {
  const { last, first } = secretaryOf(l), ln = plain(last), fn = plain(first);
  if (!ln) return { status: 'empty' };
  const hits = membersOf(lodgeNoKey(l.number)).filter((m) => { const s = plain(m.surname), f = plain(m.first_name); return s === ln && (!fn || f === fn || f.startsWith(fn) || fn.startsWith(f)); });
  if (!hits.length) return { status: 'notfound' };
  if (hits.length > 1) return { status: 'ambiguous', count: hits.length };
  return { status: 'found', member: hits[0], mm: hasDiploma(hits[0]) };
}
const checkHtml = (c) => (c.status === 'empty' ? '<span class="muted">—</span>' : c.status === 'notfound' ? '<span class="vwarn">⚠ όχι μέλος της Στοάς</span>'
  : c.status === 'ambiguous' ? `<span class="vwarn">⚠ ${c.count} συνώνυμοι</span>` : `<a class="vok" href="#/members/card?ids=${c.member.id}">✓ μέλος</a> · ${c.mm ? '<span class="vok">✓ Δίπλωμα Διδασκάλου</span>' : '<span class="vwarn">⚠ χωρίς Δίπλωμα</span>'}`);

// Δημοσίευση στον server: Επαρχίες (email εισόδου), Στοές και τα ενεργά μέλη τους (μόνο για τον έλεγχο)
export function provincePayload() {
  const lodges = lodgesAll(true).filter((l) => (l.status || 'Ενεργή') !== 'Ανενεργή');
  return provincesAll(true).map((p) => ({ short: p.short, title: p.full_title || p.short, logins: [p.email, p.secretary_email].map((e) => S(e).toLowerCase()).filter((e) => EMAIL_RE.test(e)),
    lodges: lodges.filter((l) => S(l.provincial) === S(p.short)).map((l) => { const s = secretaryOf(l), no = lodgeNoKey(l.number);
      return { number: no, name: S(l.name), lodge_email: S(l.email).toLowerCase(), secretary_first: s.first, secretary_last: s.last, secretary_mobile: S(l.secretary_mobile),
        members: membersOf(no).map((m) => ({ id: m.id, s: S(m.surname), f: S(m.first_name), mm: hasDiploma(m) ? 1 : 0 })) }; }) })).filter((p) => p.logins.length && p.lodges.length);
}
export const pushSecretaries = () => portalApi({ action: 'admin_prov_push', provinces: provincePayload() });
// Λήψη αλλαγών των Επαρχιών → κατάλογος Στοών (μία αποθήκευση) → επιβεβαίωση → νέα δημοσίευση
export async function syncSecretaries() {
  const r = await portalApi({ action: 'admin_prov_pull' }), xs = r.changes || [];
  if (xs.length) {
    await db.save(`Γραμματείς Στοών (Επαρχίες): ${xs.length} ${xs.length === 1 ? 'Στοά' : 'Στοές'}`, (tx) => {
      for (const c of xs) {
        const l = tx.find('lodges', (x) => lodgeNoKey(x.number) === lodgeNoKey(c.lodge)); if (!l) continue;
        const v = c.values || {}, patch = { secretary_last: S(v.secretary_last), secretary_first: S(v.secretary_first), secretary_mobile: S(v.secretary_mobile) };
        patch.secretary = `${patch.secretary_last} ${patch.secretary_first}`.trim();
        if (S(v.lodge_email)) patch.email = S(v.lodge_email).toLowerCase();
        tx.update('lodges', l.id, patch);
        tx.insert('lodge_secretary_log', { rec_id: c.id, lodge_number: lodgeNoKey(c.lodge), lodge_name: l.name, at: c.at, by: c.by, ...patch, lodge_email: patch.email || '', check: (c.check || {}).status || '' });
      }
    });
    await portalApi({ action: 'admin_prov_ack', ids: xs.map((c) => c.id) });
  }
  await pushSecretaries();
  return xs.length;
}
let autoDone = false;
db.on((ev) => {
  if (ev.type !== 'refresh' || autoDone || !db.backend || db.backend.kind !== 'github' || !portalReady()) return;
  autoDone = true;
  setTimeout(async () => { try { const n = await syncSecretaries(); if (n) toast(`Γραμματείς Στοών: ${n} ${n === 1 ? 'Στοά ενημερώθηκε' : 'Στοές ενημερώθηκαν'} από τις Επαρχίες.`); } catch (e) { console.warn('Γραμματείς Στοών:', e); } }, 4000);
});

export const inviteMail = () => ({ subject: 'Γραμματείς Στοών — καταχώριση στοιχείων ανά Επαρχία',
  body: `Σεβαστοί Αδελφοί,\n\nΠαρακαλούμε όπως, για κάθε Στοά της Επαρχίας σας, καταχωρίσετε στη σελίδα της Μεγάλης Γραμματείας:\n${SECRETARIES_PAGE}\n\n`
    + '• το επίσημο email της Στοάς (όχι το προσωπικό του Γραμματέα),\n• το ονοματεπώνυμο και το κινητό του Γραμματέα της Στοάς.\n\n'
    + 'Είσοδος: γράψτε το email της Επαρχιακής Γραμματείας σας και θα λάβετε κωδικό μιας χρήσης από το info@nglgreece.gr.\n'
    + 'Η σελίδα δείχνει μόνο τις Στοές της Επαρχίας σας και ελέγχει αν ο Γραμματέας είναι μέλος της Στοάς και αν έχει Δίπλωμα Διδασκάλου.\n\nΜε αδελφικούς χαιρετισμούς,\nΜεγάλη Γραμματεία ΕΜΣτΕ' });

function secretariesPage({ query = {} }) {
  const prov = query.prov || '', provs = provincesAll(true), ls = lodgesAll(true).filter((l) => (l.status || 'Ενεργή') !== 'Ανενεργή' && (!prov || S(l.provincial) === prov));
  const log = new Map(); for (const x of sortBy(db.all('lodge_secretary_log'), (x) => x.at || '')) log.set(x.lodge_number, x);
  const rows = ls.map((l) => { const s = secretaryOf(l), c = secretaryCheck(l), last = log.get(lodgeNoKey(l.number));
    return { l, c, html: [`<b>${esc(l.number)}</b>`, `<a href="#/lodges/edit/${l.id}">${esc(l.name)}</a><br><small class="muted">${esc(l.provincial || '—')}</small>`, S(l.email) ? esc(l.email) : '<span class="vwarn">χωρίς email Στοάς</span>',
      `${esc(`${s.last} ${s.first}`.trim()) || '<span class="muted">—</span>'}${l.secretary_mobile ? `<br><small><a href="tel:${esc(String(l.secretary_mobile).replace(/[^\d+]/g, ''))}">${esc(l.secretary_mobile)}</a></small>` : ''}`,
      checkHtml(c), last ? `<small>${esc(fmtDate(String(last.at || '').slice(0, 10)))}<br>${esc(last.by || '')}</small>` : '<small class="muted">—</small>'] }; });
  const full = rows.filter((r) => S(r.l.email) && r.c.status === 'found').length, mail = inviteMail();
  return {
    title: 'Γραμματείς Στοών (Επαρχίες)',
    html: `<div class="hero"><h1>🗂 Γραμματείς Στοών — από τις Επαρχίες</h1></div>
<p class="muted">Οι Επαρχιακές Γραμματείες μπαίνουν στη σελίδα <a href="${SECRETARIES_PAGE}" target="_blank" rel="noopener">${SECRETARIES_PAGE} ↗</a> με το email τους (κωδικός μιας χρήσης από το info@)
και βλέπουν <b>μόνο τις Στοές της Επαρχίας τους</b>: επίσημο email Στοάς, ονοματεπώνυμο και κινητό Γραμματέα. Οι αλλαγές περνούν εδώ στον κατάλογο Στοών με το άνοιγμα της εφαρμογής ή με «⬇ Λήψη».
Έλεγχος από το Μητρώο: ο Γραμματέας είναι ενεργό μέλος της Στοάς και έχει Δίπλωμα Διδασκάλου.</p>
${portalReady() ? '' : '<p class="vwarn">Χρειάζεται πρώτα η ρύθμιση και σύνδεση της <a href="#/lodge-portal">Πύλης Γραμματέων</a> (ίδιο Apps Script, νέα έκδοση του Code.gs).</p>'}
<div class="toolbar"><button type="button" class="btn primary" data-act="sync">⬇ Λήψη αλλαγών & ⬆ δημοσίευση</button><button type="button" class="btn" data-act="push">⬆ Δημοσίευση στις Επαρχίες</button>
<button type="button" class="btn" data-act="copyMail">📋 Αντιγραφή πρόσκλησης προς τις Επαρχίες</button><span class="muted" id="sst"></span></div>
<form class="toolbar" id="sprov"><select name="prov"><option value="">Όλες οι Επαρχίες</option>${provs.map((p) => `<option${p.short === prov ? ' selected' : ''}>${esc(p.short)}</option>`).join('')}</select><button class="btn">Φίλτρο</button>
<span class="muted"><b>${full}</b> από ${rows.length} Στοές πλήρεις (email Στοάς + Γραμματέας μέλος της)</span></form>
<details class="card fold"><summary><b>Email εισόδου ανά Επαρχία</b> <small class="muted">(email Γραμματείας και email ΕπΜΓρ. της Επαρχίας)</small></summary>
${table(['Επαρχία', 'Email εισόδου'], provs.map((p) => [esc(p.short), esc([p.email, p.secretary_email].map(S).filter(Boolean).join(', ')) || '<span class="vwarn">—</span>']))}<p><a href="#/provinces">Επαρχίες → αλλαγή email</a></p></details>
${table(['Αρ.', 'Στοά', 'Email Στοάς', 'Γραμματέας · κινητό', 'Μητρώο', 'Τελευταία αλλαγή'], rows.map((r) => r.html))}`,
    mount(el) {
      const st = el.querySelector('#sst'), busy = async (m, fn) => { st.textContent = '⏳ ' + m; try { return await fn(); } catch (e) { toast(e.message || String(e), 'error'); return null; } finally { st.textContent = ''; } };
      el.querySelector('#sprov').addEventListener('submit', (e) => { e.preventDefault(); const v = new FormData(e.target).get('prov'); go('/lodge-secretaries', v ? { prov: v } : {}); });
      bind(el, {
        async sync() { const n = await busy('Λήψη…', syncSecretaries); if (n !== null) { flash(n ? `Ενημερώθηκαν ${n} Στοές από τις Επαρχίες.` : 'Δεν υπάρχουν νέες αλλαγές· οι Στοές δημοσιεύτηκαν.'); go('/lodge-secretaries', query); } },
        async push() { const r = await busy('Δημοσίευση…', pushSecretaries); if (r) toast(`✓ Δημοσιεύτηκαν ${r.provinces} Επαρχίες, ${r.lodges} Στοές${r.pending ? ` · ${r.pending} περιμένουν λήψη` : ''}.`); },
        async copyMail() { try { await navigator.clipboard.writeText(`${mail.subject}\n\n${mail.body}`); toast('Η πρόσκληση αντιγράφηκε.'); } catch { toast('Δεν επιτράπηκε η αντιγραφή.', 'error'); } },
      });
    },
  };
}

module({ id: 'lodge-secretaries', routes: { '/lodge-secretaries': secretariesPage } });
