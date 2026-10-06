// Συμβολικές Στοές — η κεντρική βάση Στοών (αριθμός, όνομα, Ανατολή, ΕπΜΣτ., email, Σεβάσμιος, Γραμματέας, Τυπικό, τόπος).
import { db } from '../core/store.js';
import { module } from '../core/app.js';
import { crud } from '../core/crud.js';
import { esc, sortBy, fold } from '../core/util.js';
import { addContactSource } from '../core/pickers.js';
import { provincialChoices } from './provinces.js';

export const LODGE_STATUSES = ['Ενεργή', 'Σε αργία', 'Ανενεργή'];
export const LODGE_KINDS = ['Κανονική', 'Ειδική', 'Ερευνητική', 'Αγγλόφωνη', 'Γαλλόφωνη', 'Γερμανόφωνη', 'Ιταλόφωνη'];
// Επίσημος κατάλογος Στοών (seed/lodges.json): αριθμός, όνομα, ΕπΜΣτ., Ανατολή, είδος, κατάσταση, Τυπικό, πλήρης τίτλος.
const official = async () => (await fetch(new URL('../seed/lodges.json', import.meta.url))).json();
const OFFICIAL_KEYS = ['name', 'provincial', 'orient', 'kind', 'status', 'ritual', 'full_title'];
db.seed('lodges', async () => (await official()).map((x, i) => ({ id: i + 1, ...x, email: '', master: '', secretary: '', secretary_email: '', meeting_place: '', notes: '', source: 'Επίσημος κατάλογος' })));
// Εφαρμογή του επίσημου καταλόγου σε υπάρχουσα βάση: ενημερώνει αυτά τα πεδία, προσθέτει όσες Στοές λείπουν·
// email, Σεβάσμιος, Γραμματέας, τόπος και σημειώσεις δεν αλλάζουν.
db.migrate('lodges-official-2026-10', async (tx) => {
  for (const x of await official()) {
    const ex = tx.find('lodges', (l) => lodgeNoKey(l.number) === lodgeNoKey(x.number));
    if (ex) tx.update('lodges', ex.id, Object.fromEntries(OFFICIAL_KEYS.map((k) => [k, x[k]])));
    else tx.insert('lodges', { ...x, email: '', master: '', secretary: '', secretary_email: '', meeting_place: '', notes: '', source: 'Επίσημος κατάλογος' });
  }
});

export const lodgeNoKey = (n) => { n = String(n ?? '').replace(/\s+/g, '').toUpperCase(); return n.replace(/^0+/, '') || n; };
export const cleanLodgeName = (v) => String(v || '').replace(/\s+/g, ' ').trim().split(' ')
  .map((w) => (/[A-Za-z]/.test(w) ? w.replace(/[ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ]/g, (c) => 'ABEZHIKMNOPTYX'['ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ'.indexOf(c)]) : w)).join(' ');
const sortKey = (x) => (/^\d+$/.test(String(x.number)) ? Number(x.number) : 1e9);
export const lodgesAll = (activeOnly = false) => sortBy(db.all('lodges').filter((x) => !activeOnly || (x.status || 'Ενεργή') !== 'Ανενεργή'), sortKey, 'number');
export function lodgeTitle(x) {
  const n = String(x.number || '').trim();
  let t = `Σεβ. Στοά «${String(x.name || '').trim()}»`;
  if (/^\d+$/.test(n)) t += ` υπ’ αριθμ. ${n}`;
  if (String(x.orient || '').trim()) t += `, Αν. ${x.orient.trim()}`;
  return t;
}
export const lodgeEmail = (x) => String(x.email || '').trim() || String(x.secretary_email || '').trim();
export const lodgeByNumber = (n) => db.all('lodges').find((l) => lodgeNoKey(l.number) === lodgeNoKey(n)) || null;
let countsMemo = { head: null, v: null };
export function lodgeMemberCounts() {
  if (countsMemo.head === db.head && countsMemo.v) return countsMemo.v;
  const active = new Set(db.all('member_registry').filter((m) => m.active !== 0).map((m) => m.id)), seen = {}, out = {};
  for (const l of db.all('member_lodges')) {
    const st = String(l.member_status || '').toUpperCase();
    if (!active.has(l.member_id) || st.includes('ΔΙΑΓΡΑΦΕΝ') || st.includes('ΜΕΤΕΣΘΕΝ')) continue;
    const k = lodgeNoKey(l.lodge_number), key = k + ':' + l.member_id;
    if (!k || seen[key]) continue;
    seen[key] = 1; out[k] = (out[k] || 0) + 1;
  }
  countsMemo = { head: db.head, v: out };
  return out;
}

addContactSource(() => lodgesAll(true).filter(lodgeEmail).map((l) => ({ name: lodgeTitle(l), email: lodgeEmail(l), sub: `Στοά ${l.number} · ${l.provincial || ''}` })));

const rituals = () => [...new Set(db.all('lodges').map((x) => String(x.ritual || '').trim()).filter(Boolean))].sort();
const fields = [
  { k: 'number', label: 'Αριθμός Στοάς', required: true },
  { k: 'name', label: 'Όνομα Στοάς', required: true },
  { k: 'orient', label: 'Ανατολή (πόλη)', placeholder: 'π.χ. Αθηνών' },
  { k: 'provincial', label: 'Επαρχιακή / Περιφερειακή Μεγάλη Στοά', type: 'select', empty: '— Χωρίς ορισμό —', options: () => provincialChoices() },
  { k: 'email', label: 'Email Στοάς', type: 'email' },
  { k: 'status', label: 'Κατάσταση', type: 'select', options: LODGE_STATUSES },
  { k: 'kind', label: 'Είδος', type: 'select', empty: '—', options: LODGE_KINDS },
  { k: 'full_title', label: 'Πλήρης τίτλος', full: true, placeholder: 'π.χ. ΣΣτ. 2 Ακρόπολις υπό την Σκ. της ΕπΜΣτ. Αθηνών' },
  { k: 'master', label: 'Σεβάσμιος' },
  { k: 'secretary', label: 'Γραμματέας' },
  { k: 'secretary_email', label: 'Email Γραμματέα', type: 'email' },
  { k: 'ritual', label: 'Τυπικό', placeholder: 'π.χ. Emulation, Σκωτικό', datalist: rituals },
  { k: 'meeting_place', label: 'Τόπος συνεδριάσεων', full: true, placeholder: 'π.χ. Τεκτονικόν Μέγαρον, Ερεσού 38, Αθήνα' },
  { k: 'notes', label: 'Σημειώσεις', type: 'textarea', full: true },
];

module({
  id: 'lodges',
  routes: crud({
    table: 'lodges', base: '/lodges', title: 'Συμβολικές Στοές', one: 'Στοά', fields,
    defaults: { status: 'Ενεργή', source: 'Χειροκίνητα' },
    name: (x) => `Στοά ${x.number} · ${x.name}`,
    sort: (xs) => sortBy(xs, sortKey, 'number'),
    filterHtml: (q) => `<select name="prov"><option value="">Όλες οι ΕπΜΣτ.</option>${provincialChoices().map((p) => `<option${p === q.prov ? ' selected' : ''}>${esc(p)}</option>`).join('')}<option value="-"${q.prov === '-' ? ' selected' : ''}>Χωρίς ορισμό</option></select>`,
    filter: (xs, q) => (q.prov === '-' ? xs.filter((x) => !x.provincial) : q.prov ? xs.filter((x) => x.provincial === q.prov) : xs),
    search: ['number', 'name', 'orient', 'provincial', 'email', 'master', 'secretary', 'secretary_email', 'ritual', 'meeting_place', 'kind', 'full_title'],
    intro: () => {
      const xs = db.all('lodges'), miss = xs.filter((x) => !lodgeEmail(x)).length, noprov = xs.filter((x) => !x.provincial).length;
      return miss || noprov ? `<p class="muted">Προς συμπλήρωση: ${miss} Στοές χωρίς email, ${noprov} χωρίς ορισμένη ΕπΜΣτ.</p>` : '';
    },
    columns: [
      { label: 'Αρ.', v: (x) => `<b>${esc(x.number)}</b>` },
      { label: 'Όνομα', v: (x) => esc(x.name) + (x.status && x.status !== 'Ενεργή' ? ` <span class="pill warn">${esc(x.status)}</span>` : '') },
      { label: 'Ανατολή', v: (x) => esc(x.orient) },
      { label: 'Είδος', v: (x) => esc(x.kind || '') },
      { label: 'Τυπικό', v: (x) => esc(x.ritual || '') },
      { label: 'ΕπΜΣτ.', v: (x) => esc(x.provincial || '—') },
      { label: 'Email', v: (x) => esc(lodgeEmail(x)) || '<span class="muted">—</span>' },
      { label: 'Σεβάσμιος', v: (x) => esc(x.master) },
      { label: 'Ενεργά μέλη', v: (x) => { const n = lodgeMemberCounts()[lodgeNoKey(x.number)] || 0; return `<a href="#/members?field=lodge&q=${encodeURIComponent(x.number)}">${n}</a>`; } },
    ],
    validate(d, tx, id) {
      d.name = cleanLodgeName(d.name); d.number = lodgeNoKey(d.number);
      if (!LODGE_STATUSES.includes(d.status)) d.status = 'Ενεργή';
      if (tx.find('lodges', (x) => lodgeNoKey(x.number) === d.number && x.id !== id)) throw new Error(`Υπάρχει ήδη Στοά με αριθμό ${d.number}.`);
      return d;
    },
    excel: {
      file: 'EMSTE_SYMBOLIKES_STOES.xlsx', sheet: 'ΣΥΜΒΟΛΙΚΕΣ ΣΤΟΕΣ', key: 'number',
      cols: [{ k: 'number', label: 'Αριθμός', aliases: ['Αρ.', 'Αρ', 'Number', 'No'], w: 9 }, { k: 'name', label: 'Όνομα', aliases: ['Στοά', 'Name', 'Lodge'], w: 32 }, { k: 'orient', label: 'Ανατολή', aliases: ['Πόλη', 'Orient', 'City'], w: 16 },
        { k: 'provincial', label: 'Επαρχιακή Μεγάλη Στοά', aliases: ['ΕπΜΣτ.', 'ΕπΜΣτ', 'Provincial'], w: 34 }, { k: 'email', label: 'Email Στοάς', aliases: ['Email'], w: 32 }, { k: 'master', label: 'Σεβάσμιος', aliases: ['Master'], w: 26 },
        { k: 'secretary', label: 'Γραμματέας', aliases: ['Secretary'], w: 26 }, { k: 'secretary_email', label: 'Email Γραμματέα', aliases: ['Secretary Email'], w: 32 }, { k: 'status', label: 'Κατάσταση', aliases: ['Status'], w: 12 },
        { k: 'ritual', label: 'Τυπικό', aliases: ['Ritual'], w: 18 }, { k: 'meeting_place', label: 'Τόπος συνεδριάσεων', aliases: ['Τόπος', 'Venue'], w: 40 }, { k: 'notes', label: 'Σημειώσεις', aliases: ['Notes'], w: 30 },
        { k: 'kind', label: 'Είδος', aliases: ['ΕΙΔΟΣ'], w: 14 }, { k: 'full_title', label: 'Πλήρης τίτλος', aliases: ['Πληρης', 'Πλήρης'], w: 70 }],
      normalize(d) {
        d.number = lodgeNoKey(d.number);
        if (d.name) d.name = cleanLodgeName(d.name);
        if (d.provincial) d.provincial = provincialChoices().find((p) => fold(p) === fold(d.provincial)) || d.provincial;
        if (d.status && !LODGE_STATUSES.includes(d.status)) d.status = 'Ενεργή';
        const ex = db.all('lodges').find((x) => lodgeNoKey(x.number) === d.number);
        if (ex) d.number = ex.number;
        return d;
      },
      canAdd: (d) => !!d.name,
    },
  }),
});
