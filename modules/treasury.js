// Ταμείο — ετήσιες εισφορές (συνδρομές) προς την ΕΜΣτΕ, υπολογισμένες από το Μητρώο (μία πηγή: member_lodges).
// Κανόνες: ενεργό τακτικό μέλος → στη Στοά πλήρους (1ης) συνδρομής 200 €· σε κάθε άλλη Στοά (2η, 3η …) όπου είναι
// κανονικό τακτικό μέλος +20 € (10 € σε ορισμένες ειδικές Στοές)· Επίτιμο, Ομότιμο (και Αριστίνδην, Ισόβιο) 0 €· Μέτοικο 1/3.
// Τα ποσά και οι ειδικές Στοές ρυθμίζονται στο «Ταμείο → Ρυθμίσεις». Σύνολα ανά μέλος, ανά Στοά, ανά Επαρχία.
// Προβολή περιορισμένη σε email Γραμματέα Στοάς (μόνο η Στοά του) ή email Επαρχιακής Γραμματείας (μόνο οι Στοές της Επαρχίας).
import { db } from '../core/store.js';
import { module, bind, go, flash, toast, table, notice } from '../core/app.js';
import { esc, fold, sortBy, exportXlsx } from '../core/util.js';
import { noContact } from '../core/pickers.js';
import { regCode } from '../core/people.js';
import { lodgesByMember, capacityOf, lodgeDeregged } from './members.js';
import { lodgeNoKey, lodgeByNumber, lodgesAll } from './lodges.js';
import { provincesAll } from './provinces.js';

db.defaultSettings({ fee_full: 200, fee_extra: 20, fee_extra_special: 10, fee_special_lodges: '', fee_metoikos: 66.67 });

// Ιδιότητα → είδος εισφοράς: 'regular' (πλήρης / επιπλέον), 'third' (Μέτοικο: 1/3 της πλήρους), 'exempt' (0 €)
const KIND = { Τακτικό: 'regular', Υιοθετημένο: 'regular', Επανελθόν: 'regular', Θεράπων: 'regular', Μέτοικο: 'third',
  Ομότιμο: 'exempt', Επίτιμο: 'exempt', Αριστίνδην: 'exempt', Ισόβιο: 'exempt' };
const NONE = 'Χωρίς Επαρχία';
const num = (v, d) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : d; };
export const feeSettings = () => ({
  full: num(db.setting('fee_full'), 200), extra: num(db.setting('fee_extra'), 20), special: num(db.setting('fee_extra_special'), 10), metoikos: num(db.setting('fee_metoikos'), 66.67),
  specialLodges: new Set(String(db.setting('fee_special_lodges') || '').split(/[\s,;]+/).map(lodgeNoKey).filter(Boolean)),
});
export const euro = (n) => `${(Math.round(n * 100) / 100).toLocaleString('el-GR', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })} €`;
const memberActive = (m) => m && m.active !== 0 && !noContact(m);

// Όλες οι γραμμές εισφορών: μία ανά (ενεργό μέλος × ενεργή Στοά του)
let memo = { head: undefined, v: null };
export function feeLines() {
  if (memo.v && memo.head === db.head) return memo.v;
  const cfg = feeSettings(), byM = lodgesByMember(), out = [];
  for (const m of db.all('member_registry')) {
    if (!memberActive(m)) continue;
    const ls = (byM[m.id] || []).filter((l) => !lodgeDeregged(l) && String(l.lodge_number || '').trim());
    if (!ls.length) continue;
    const capOf = (l) => capacityOf(l) || 'Τακτικό', kindOf = (l) => KIND[capOf(l)] || 'regular';
    // Στοά πλήρους συνδρομής: όπου «1» (Κ. 269) ανάμεσα στις Στοές με συνδρομή· αλλιώς η πρώτη (σειρά στο Μητρώο)
    const paying = ls.filter((l) => kindOf(l) !== 'exempt');
    const primary = paying.find((l) => Number(l.fee_rank) === 1) || sortBy(paying, (l) => Number(l.fee_rank) || 99, (l) => Number(l.seq) || 99)[0] || null;
    for (const l of ls) {
      const no = lodgeNoKey(l.lodge_number), lodge = lodgeByNumber(no), k = kindOf(l);
      let type, amount, note = '';
      if (k === 'exempt') { type = 'exempt'; amount = 0; }
      else if (l === primary) { type = 'full'; amount = k === 'third' ? cfg.metoikos : cfg.full; if (Number(l.fee_rank) !== 1) note = 'Στοά πλήρους συνδρομής χωρίς ορισμό — υποτίθεται'; }
      else if (k === 'regular') { type = 'extra'; amount = cfg.specialLodges.has(no) ? cfg.special : cfg.extra; if (Number(l.fee_rank) === 1) note = 'δύο Στοές πλήρους συνδρομής — μετρά ως επιπλέον'; }
      else { type = 'exempt'; amount = 0; }
      out.push({ m, l, member_id: m.id, lodge_no: no, lodge_name: (lodge && lodge.name) || l.lodge_name || '', province: (lodge && lodge.provincial) || NONE, cap: capOf(l), assumedCap: !capacityOf(l), type, amount, note });
    }
  }
  memo = { head: db.head, v: out };
  return out;
}
const sum = (xs) => xs.reduce((a, x) => a + x.amount, 0);
const agg = (xs) => ({ total: sum(xs), members: new Set(xs.map((x) => x.member_id)).size, full: xs.filter((x) => x.type === 'full').length, fullSum: sum(xs.filter((x) => x.type === 'full')),
  extra: xs.filter((x) => x.type === 'extra').length, extraSum: sum(xs.filter((x) => x.type === 'extra')), exempt: xs.filter((x) => x.type === 'exempt').length, notes: xs.filter((x) => x.note || x.assumedCap).length });
export const lodgeFeeTotal = (no) => agg(feeLines().filter((x) => x.lodge_no === lodgeNoKey(no)));

// Προβολή ως: email Γραμματέα / Στοάς → μόνο η Στοά του· email Επαρχιακής Γραμματείας (ή ΕπΜΓρ.) → οι Στοές της Επαρχίας
export function feeScope(email) {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return null;
  const same = (v) => String(v || '').trim().toLowerCase() === e;
  const lodges = lodgesAll().filter((l) => same(l.email) || same(l.secretary_email)).map((l) => lodgeNoKey(l.number));
  const provs = provincesAll().filter((p) => same(p.email) || same(p.secretary_email)).map((p) => p.short);
  return { email: e, lodges: new Set(lodges), provinces: new Set(provs), label: [...provs.map((p) => p), ...lodges.map((n) => { const l = lodgeByNumber(n); return `Στοά ${l ? l.name : ''} ${n}`; })].join(' · ') };
}
const inScope = (scope) => (x) => !scope || scope.lodges.has(x.lodge_no) || scope.provinces.has(x.province);
const scoped = (query) => { const s = feeScope(query.as); return { scope: s, lines: feeLines().filter(inScope(s)) }; };

const TABS = [['/treasury', '📊 Σύνοψη'], ['/treasury/lodges', '🏛 Ανά Στοά'], ['/treasury/members', '👤 Ανά μέλος'], ['/treasury/provinces', '🗺 Ανά Επαρχία'], ['/treasury/settings', '⚙ Ρυθμίσεις']];
function shell(cur, query, scope, inner) {
  const as = query.as ? `?as=${encodeURIComponent(query.as)}` : '';
  return `<div class="hero"><h1>💶 Ταμείο — Ετήσιες εισφορές</h1></div>${notice(query.msg)}
<nav class="toolbar tre-tabs">${TABS.map(([h, l]) => `<a class="btn${h === cur ? ' primary' : ''}" href="#${h}${h === '/treasury/settings' ? '' : as}">${l}</a>`).join('')}</nav>
<form class="card filters tre-as" id="treAs"><label>Προβολή ως email (Γραμματέα Στοάς ή Επαρχιακής Γραμματείας)<input name="as" type="email" value="${esc(query.as || '')}" placeholder="π.χ. email Γραμματέα Στοάς"></label><button>Προβολή</button>${query.as ? `<a class="btn" href="#${cur}">Όλα</a>` : ''}</form>
${scope ? `<p class="${scope.lodges.size || scope.provinces.size ? 'vok' : 'vwarn'}">👁 Προβολή ως <b>${esc(scope.email)}</b>: ${scope.lodges.size || scope.provinces.size ? esc(scope.label) : 'δεν αντιστοιχεί σε Στοά ή Επαρχία (email Στοάς / Γραμματέα / Επαρχιακής Γραμματείας)'}</p>` : ''}
${inner}`;
}
const mountShell = (el, cur) => { const f = el.querySelector('#treAs'); if (f) f.addEventListener('submit', (e) => { e.preventDefault(); const v = new FormData(f).get('as'); go(cur, v ? { as: String(v).trim() } : {}); }); };
const stat = (label, value, sub = '') => `<div class="tre-stat"><small>${esc(label)}</small><b>${value}</b>${sub ? `<small class="muted">${sub}</small>` : ''}</div>`;
const byKey = (xs, k) => { const g = new Map(); for (const x of xs) (g.get(x[k]) || g.set(x[k], []).get(x[k])).push(x); return g; };
const provOrder = () => provincesAll().map((p) => p.short);
const lodgeRows = (lines) => sortBy([...byKey(lines, 'lodge_no').entries()].map(([no, xs]) => ({ no, name: xs[0].lodge_name, province: xs[0].province, ...agg(xs) })), (r) => Number(r.no) || 1e9, 'no');
const provRows = (lines) => { const o = provOrder(); return sortBy([...byKey(lines, 'province').entries()].map(([p, xs]) => ({ p, lodges: new Set(xs.map((x) => x.lodge_no)).size, ...agg(xs) })), (r) => (o.indexOf(r.p) + 1) || 999); };
const asQ = (query, extra = {}) => new URLSearchParams({ ...(query.as ? { as: query.as } : {}), ...extra }).toString();

function summaryPage({ query }) {
  const { scope, lines } = scoped(query), a = agg(lines), cfg = feeSettings(), provs = provRows(lines), top = sortBy(lodgeRows(lines), (r) => -r.total).slice(0, 8);
  return { title: 'Ταμείο', html: shell('/treasury', query, scope, `
<div class="tre-stats">${stat('Σύνολο εισφορών', `<span class="tre-big">${euro(a.total)}</span>`, `${a.members} ενεργά μέλη`)}${stat('Πλήρεις συνδρομές (1η Στοά)', euro(a.fullSum), `${a.full} × ${euro(cfg.full)}`)}
${stat('Επιπλέον Στοές (2η, 3η …)', euro(a.extraSum), `${a.extra} × ${euro(cfg.extra)}${cfg.specialLodges.size ? ` (ή ${euro(cfg.special)})` : ''}`)}${stat('Απαλλαγές', String(a.exempt), 'Επίτιμα, Ομότιμα κ.ά. — 0 €')}</div>
${a.notes ? `<p class="vwarn">⚠ ${a.notes} γραμμές με υπόθεση (χωρίς ιδιότητα ή χωρίς ορισμό Στοάς πλήρους συνδρομής) — <a href="#/treasury/members?${asQ(query, { notes: 1 })}">έλεγχος</a></p>` : ''}
<div class="tre-grid"><div class="card"><h2 style="margin-top:0">Ανά Επαρχία</h2>${table(['Επαρχία', 'Στοές', 'Μέλη', 'Σύνολο'], provs.map((r) => [`<a href="#/treasury/lodges?${asQ(query, { prov: r.p })}">${esc(r.p)}</a>`, r.lodges, r.members, `<b>${euro(r.total)}</b>`]))}</div>
<div class="card"><h2 style="margin-top:0">Μεγαλύτερες Στοές</h2>${table(['Στοά', 'Μέλη', 'Σύνολο'], top.map((r) => [`<a href="#/treasury/members?${asQ(query, { lodge: r.no })}">${esc(r.name)} ${esc(r.no)}</a>`, r.members, `<b>${euro(r.total)}</b>`]))}
<p><a href="#/treasury/lodges?${asQ(query)}">Όλες οι Στοές →</a></p></div></div>`), mount: (el) => mountShell(el, '/treasury') };
}

function lodgesPage({ query }) {
  const { scope, lines } = scoped(query), prov = query.prov || '', xs = lodgeRows(prov ? lines.filter((x) => x.province === prov) : lines), a = agg(xs.length ? lines.filter((x) => !prov || x.province === prov) : []);
  const provs = [...new Set(lines.map((x) => x.province))];
  const rows = xs.map((r) => [`<b>${esc(r.no)}</b>`, `<a href="#/treasury/members?${asQ(query, { lodge: r.no })}">${esc(r.name)}</a>`, esc(r.province), r.full, euro(r.fullSum), r.extra, euro(r.extraSum), r.exempt, `<b>${euro(r.total)}</b>`]);
  return { title: 'Ταμείο — Ανά Στοά', html: shell('/treasury/lodges', query, scope, `
<form class="toolbar" id="treProv"><select name="prov"><option value="">Όλες οι Επαρχίες</option>${provs.map((p) => `<option${p === prov ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select><button class="btn">Φίλτρο</button>
<button type="button" class="btn" data-act="xlsx">⬇ Excel</button><span class="muted">${xs.length} Στοές · σύνολο <b>${euro(a.total)}</b></span></form>
${table(['Αρ.', 'Στοά', 'Επαρχία', '1η Στοά', '€ πλήρεις', '2η/3η…', '€ επιπλέον', 'Απαλλ.', 'Σύνολο'], rows)}`),
    mount(el) {
      mountShell(el, '/treasury/lodges');
      el.querySelector('#treProv').addEventListener('submit', (e) => { e.preventDefault(); go('/treasury/lodges', { ...(query.as ? { as: query.as } : {}), ...(new FormData(e.target).get('prov') ? { prov: new FormData(e.target).get('prov') } : {}) }); });
      bind(el, { xlsx: () => exportXlsx('TAMEIO_STOES.xlsx', 'Ανά Στοά', ['Αρ.', 'Στοά', 'Επαρχία', 'Μέλη', 'Πλήρεις (1η Στοά)', '€ πλήρεις', 'Επιπλέον Στοές', '€ επιπλέον', 'Απαλλαγές', 'Σύνολο €'],
        xs.map((r) => [r.no, r.name, r.province, r.members, r.full, r.fullSum, r.extra, r.extraSum, r.exempt, r.total]), [8, 28, 34, 8, 12, 12, 12, 12, 10, 12]) });
    } };
}

const TYPE_LABEL = { full: 'Πλήρης (1η Στοά)', extra: 'Επιπλέον Στοά', exempt: 'Απαλλαγή' };
function membersPage({ query }) {
  const { scope, lines } = scoped(query);
  let xs = lines;
  if (query.lodge) xs = xs.filter((x) => x.lodge_no === lodgeNoKey(query.lodge));
  if (query.prov) xs = xs.filter((x) => x.province === query.prov);
  if (query.notes) xs = xs.filter((x) => x.note || x.assumedCap);
  if (query.q) { const q = fold(query.q); xs = xs.filter((x) => fold(`${x.m.surname} ${x.m.first_name} ${regCode(x.m)}`).includes(q)); }
  // ανά μέλος: όλες οι Στοές του (και εκτός φίλτρου Στοάς φαίνεται το σύνολό του)
  const all = byKey(lines, 'member_id'), ids = sortBy([...new Set(xs.map((x) => x.member_id))].map((id) => all.get(id)[0].m), 'surname', 'first_name');
  const shown = ids.slice(0, 500), a = agg(xs);
  const lodge = query.lodge ? lodgeByNumber(query.lodge) : null;
  const rows = shown.map((m) => { const ls = all.get(m.id), here = xs.filter((x) => x.member_id === m.id);
    return [esc(regCode(m) || ''), `<a href="#/members/card?ids=${m.id}"><b>${esc(m.surname || '')}</b> ${esc(m.first_name || '')}</a>`,
      ls.map((x) => `${esc(x.lodge_name)} ${esc(x.lodge_no)} <small class="muted">${esc(x.cap)}${x.assumedCap ? '?' : ''} · ${TYPE_LABEL[x.type]}</small> <b>${euro(x.amount)}</b>${x.note ? ` <span class="pill warn">${esc(x.note)}</span>` : ''}`).join('<br>'),
      query.lodge ? `<b>${euro(sum(here))}</b>` : '', `<b>${euro(sum(ls))}</b>`]; });
  return { title: 'Ταμείο — Ανά μέλος', html: shell('/treasury/members', query, scope, `
<form class="toolbar" id="treM"><input name="q" value="${esc(query.q || '')}" placeholder="🔎 Επώνυμο, όνομα, Αρ. Μητρώου"><button class="btn">Αναζήτηση</button>${query.lodge || query.prov || query.notes || query.q ? `<a class="btn" href="#/treasury/members?${asQ(query)}">Καθαρισμός</a>` : ''}
<button type="button" class="btn" data-act="xlsx">⬇ Excel</button></form>
<p class="muted">${lodge ? `Στοά <b>${esc(lodge.name)} ${esc(lodge.number)}</b> · ` : ''}${query.prov ? `<b>${esc(query.prov)}</b> · ` : ''}${ids.length} μέλη · εισφορές ${lodge ? 'της Στοάς' : ''} <b>${euro(a.total)}</b>${ids.length > 500 ? ' · εμφανίζονται τα πρώτα 500' : ''}</p>
${table(['Αρ. Μητρώου', 'Μέλος', 'Στοές · ιδιότητα · εισφορά', lodge ? 'Στη Στοά' : '', 'Σύνολο μέλους'].filter(Boolean), rows.map((r) => (lodge ? r : r.filter((_, i) => i !== 3))))}`),
    mount(el) {
      mountShell(el, '/treasury/members');
      el.querySelector('#treM').addEventListener('submit', (e) => { e.preventDefault(); go('/treasury/members', { ...query, q: new FormData(e.target).get('q') || '' }); });
      bind(el, { xlsx: () => exportXlsx('TAMEIO_MELI.xlsx', 'Ανά μέλος', ['Αρ. Μητρώου', 'Επώνυμο', 'Όνομα', 'Στοά', 'Αρ.', 'Επαρχία', 'Ιδιότητα', 'Είδος', 'Εισφορά €', 'Σημείωση'],
        xs.map((x) => [regCode(x.m) || '', x.m.surname || '', x.m.first_name || '', x.lodge_name, x.lodge_no, x.province, x.cap, TYPE_LABEL[x.type], x.amount, x.note || (x.assumedCap ? 'χωρίς ιδιότητα — Τακτικό' : '')]), [12, 20, 16, 24, 6, 30, 14, 16, 10, 36]) });
    } };
}

function provincesPage({ query }) {
  const { scope, lines } = scoped(query), xs = provRows(lines), a = agg(lines);
  return { title: 'Ταμείο — Ανά Επαρχία', html: shell('/treasury/provinces', query, scope, `
<div class="toolbar"><button type="button" class="btn" data-act="xlsx">⬇ Excel</button><span class="muted">Σύνολο <b>${euro(a.total)}</b></span></div>
${table(['Επαρχία', 'Στοές', 'Μέλη', '1η Στοά', '€ πλήρεις', '2η/3η…', '€ επιπλέον', 'Απαλλ.', 'Σύνολο'], xs.map((r) => [`<a href="#/treasury/lodges?${asQ(query, { prov: r.p })}">${esc(r.p)}</a>`, r.lodges, r.members, r.full, euro(r.fullSum), r.extra, euro(r.extraSum), r.exempt, `<b>${euro(r.total)}</b>`]))}`),
    mount(el) {
      mountShell(el, '/treasury/provinces');
      bind(el, { xlsx: () => exportXlsx('TAMEIO_EPARXIES.xlsx', 'Ανά Επαρχία', ['Επαρχία', 'Στοές', 'Μέλη', 'Πλήρεις', '€ πλήρεις', 'Επιπλέον', '€ επιπλέον', 'Απαλλαγές', 'Σύνολο €'],
        xs.map((r) => [r.p, r.lodges, r.members, r.full, r.fullSum, r.extra, r.extraSum, r.exempt, r.total]), [36, 8, 8, 10, 12, 10, 12, 10, 12]) });
    } };
}

function settingsPage({ query }) {
  const c = feeSettings();
  return { title: 'Ταμείο — Ρυθμίσεις', html: shell('/treasury/settings', query, null, `
<form id="treS" class="card grid"><div><label>Πλήρης συνδρομή (Στοά 1ης συνδρομής) €</label><input name="fee_full" inputmode="decimal" value="${esc(c.full)}"></div>
<div><label>Επιπλέον Στοά (2η, 3η …) €</label><input name="fee_extra" inputmode="decimal" value="${esc(c.extra)}"></div>
<div><label>Επιπλέον Στοά — στις ειδικές Στοές €</label><input name="fee_extra_special" inputmode="decimal" value="${esc(c.special)}"></div>
<div><label>Μέτοικο μέλος (1/3 της συνδρομής) €</label><input name="fee_metoikos" inputmode="decimal" value="${esc(c.metoikos)}"></div>
<div class="full"><label>Ειδικές Στοές (αριθμοί, χωρισμένοι με κόμμα) — εκεί η επιπλέον εισφορά είναι η «ειδική»</label><input name="fee_special_lodges" value="${esc([...c.specialLodges].join(', '))}" placeholder="π.χ. 3, 31, 85"></div>
<div class="full"><small class="muted">Χωρίς εισφορά: Επίτιμο, Ομότιμο, Αριστίνδην, Ισόβιο. Κανονικά τακτικά: Τακτικό, Υιοθετημένο, Επανελθόν, Θεράπων. Χωρίς ιδιότητα στο Μητρώο → Τακτικό (σημειώνεται «?»).
Στοά πλήρους συνδρομής: η Στοά με «Στοά πλήρους συνδρομής» στο Μητρώο· αν δεν έχει οριστεί, η πρώτη Στοά του μέλους.</small></div>
<div class="full toolbar"><button class="btn primary">💾 Αποθήκευση</button></div></form>`),
    mount(el) {
      el.querySelector('#treS').addEventListener('submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target), n = (k, d) => num(f.get(k), d);
        const special = String(f.get('fee_special_lodges') || '').split(/[\s,;]+/).map(lodgeNoKey).filter(Boolean), bad = special.filter((x) => !lodgeByNumber(x));
        if (bad.length) { toast(`Άγνωστες Στοές: ${bad.join(', ')}`, 'error'); return; }
        await db.save('Ταμείο: ρυθμίσεις εισφορών', (tx) => { tx.setting('fee_full', n('fee_full', 200)); tx.setting('fee_extra', n('fee_extra', 20)); tx.setting('fee_extra_special', n('fee_extra_special', 10)); tx.setting('fee_metoikos', n('fee_metoikos', 66.67)); tx.setting('fee_special_lodges', special.join(', ')); });
        flash('Οι ρυθμίσεις του Ταμείου αποθηκεύτηκαν.'); go('/treasury');
      });
    } };
}

module({
  id: 'treasury',
  routes: { '/treasury': summaryPage, '/treasury/lodges': lodgesPage, '/treasury/members': membersPage, '/treasury/provinces': provincesPage, '/treasury/settings': settingsPage },
  tile: { order: 27, render: () => { const a = agg(feeLines()); return `<div class="dtile"><h3><a href="#/treasury">💶 Ταμείο</a></h3><div class="big">${euro(a.total)}</div><div class="muted">${a.members} ενεργά μέλη · ${a.full} πλήρεις · ${a.extra} επιπλέον Στοές</div>
<div class="acts"><a class="btn primary" href="#/treasury">Σύνοψη</a><a class="btn" href="#/treasury/lodges">Ανά Στοά</a></div></div>`; } },
});
