// Επαρχιακές / Περιφερειακή Μεγάλη Στοά και ΕΜΣτΕ: στοιχεία, ΕπΜΔ και ΕπΜΓρ. (όνομα, email).
// Από εδώ τροφοδοτούνται οι παραλήπτες Επιστολών, ο Κατάλογος, οι Στοές και οι Επισκέψεις.
import { db } from '../core/store.js';
import { module } from '../core/app.js';
import { crud } from '../core/crud.js';
import { esc, sortBy } from '../core/util.js';
import { attachPicker, memberItems, addContactSource } from '../core/pickers.js';

export const PROVINCE_KINDS = ['Επαρχιακή', 'Περιφερειακή', 'Εθνική'];
const SEED = [
  ['ΕπΜΣτ. Αθηνών', 'Επαρχιακή Μεγάλη Στοά Αθηνών', 'athens.secretary@nglgreece.gr', 'ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Αθηνών', 'Επαρχιακή'],
  ['ΕπΜΣτ. Πειραιώς & Νήσων Αρχ. Αιγαίου', 'Επαρχιακή Μεγάλη Στοά Πειραιώς και Νήσων Αρχιπελάγους Αιγαίου', 'piraeus.secretary@nglgreece.gr', 'ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Πειραιώς και Νήσων Αρχιπελάγους Αιγαίου', 'Επαρχιακή'],
  ['ΕπΜΣτ. Ιονίων Νήσων', 'Επαρχιακή Μεγάλη Στοά Ιονίων Νήσων', 'ionian.secretary@nglgreece.gr', 'ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Ιονίων Νήσων', 'Επαρχιακή'],
  ['ΕπΜΣτ. Κεντρικής & Βορείου Ελλάδος', 'Επαρχιακή Μεγάλη Στοά Κεντρικής και Βορείου Ελλάδος', 'nglgr.prov.cent.north@gmail.com', 'ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Κεντρικής και Βορείου Ελλάδος', 'Επαρχιακή'],
  ['ΕπΜΣτ. Πελοποννήσου & Δυτικής Ελλάδας', 'Επαρχιακή Μεγάλη Στοά Πελοποννήσου και Δυτικής Ελλάδας', 'secretary.pr.pwg.nglgreece@gmail.com', 'ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Πελοποννήσου και Δυτικής Ελλάδας', 'Επαρχιακή'],
  ['ΠΜΣτ. Κύπρου', 'Περιφερειακή Μεγάλη Στοά Κύπρου', 'dglcyprus@nglgreece.gr', 'ΠερΜΓρ. Περιφερειακής Μεγάλης Στοάς Κύπρου', 'Περιφερειακή'],
  ['ΕΜΣτΕ Α.Ε. & Α.Τ.', 'Εθνική Μεγάλη Στοά της Ελλάδος των Αρχαίων, Ελευθέρων και Αποδεκτών Τεκτόνων', 'grand.secretary@nglgreece.gr', 'ΜΓρ. Εθνικής Μεγάλης Στοάς της Ελλάδος των Αρχαίων, Ελευθέρων και Αποδεκτών Τεκτόνων', 'Εθνική'],
];
db.seed('grand_lodges', () => SEED.map(([short, full_title, email, addressee, kind], i) => ({
  id: i + 1, short, full_title, kind, email, addressee, secretary_name: '', secretary_email: '', master_name: '', master_email: '', sort_order: (i + 1) * 10, active: 1, notes: '',
})));

// Εφάπαξ: επίσημα στοιχεία (συντομογραφία, πλήρης τίτλος, είδος, email Γραμματείας, «Προς») σε υπάρχουσα βάση·
// ΕπΜΔ, ΕπΜΓρ., σημειώσεις και σειρά δεν αλλάζουν. Όσες λείπουν προστίθενται.
const shortKey = (v) => String(v || '').replace(/\s+/g, ' ').trim();
db.migrate('provinces-official-2026-10', (tx) => {
  SEED.forEach(([short, full_title, email, addressee, kind], i) => {
    const ex = tx.find('grand_lodges', (p) => shortKey(p.short) === short);
    if (ex) tx.update('grand_lodges', ex.id, { short, full_title, email, addressee, kind });
    else tx.insert('grand_lodges', { short, full_title, kind, email, addressee, secretary_name: '', secretary_email: '', master_name: '', master_email: '', sort_order: (i + 1) * 10, active: 1, notes: '' });
  });
});
const provinceLodges = (p) => db.all('lodges').filter((l) => shortKey(l.provincial) === shortKey(p.short));

export const provincesAll = (activeOnly = false) => sortBy(db.all('grand_lodges').filter((p) => !activeOnly || p.active), 'sort_order', 'id');
export const regionalProvinces = () => provincesAll(true).filter((p) => p.kind !== 'Εθνική');
export const provincialChoices = () => regionalProvinces().map((p) => p.short);
export const provinceByShort = (s) => db.all('grand_lodges').find((p) => p.short === s) || null;

const ROLE_ABBR = { Επαρχιακή: ['ΕπΜΔ', 'ΕπΜΓρ.'], Περιφερειακή: ['ΠερΜΔ', 'ΠερΜΓρ.'], Εθνική: ['ΜΔ', 'ΜΓρ.'] };
// [Μέγας Διδάσκαλος, Μέγας Γραμματέας] της Επαρχίας: συντομογραφία, τίτλος, όνομα, email, «Προς»
export function provinceRoles(p) {
  const [gm, gs] = ROLE_ABBR[p.kind] || ROLE_ABBR['Επαρχιακή'];
  const gen = String(p.addressee || '').replace(/^\S+\.?\s+/, '') || p.full_title || p.short;
  const adj = (a) => (a.startsWith('Επ') ? 'Επαρχιακός ' : a.startsWith('Περ') ? 'Περιφερειακός ' : '');
  const mn = String(p.master_name || '').trim(), sn = String(p.secretary_name || '').trim();
  return [
    { role: 'gm', abbr: gm, label: adj(gm) + 'Μέγας Διδάσκαλος', name: mn, email: String(p.master_email || '').trim(), addressee: `${gm} ${gen}${mn ? ', ' + mn : ''}` },
    { role: 'gs', abbr: gs, label: adj(gs) + 'Μέγας Γραμματέας', name: sn, email: String(p.secretary_email || '').trim() || String(p.email || '').trim(), addressee: (p.addressee || `${gs} ${gen}`) + (sn ? ', ' + sn : '') },
  ];
}

addContactSource(() => provincesAll(true).flatMap((p) => {
  const [gm, gs] = provinceRoles(p);
  return [
    { name: p.addressee || p.short, email: p.email || '', sub: `${p.short} · Γραμματεία` },
    gm.email && { name: gm.addressee, email: gm.email, sub: `${p.short} · ${gm.abbr}` },
    gs.email && gs.email !== p.email && { name: gs.addressee, email: gs.email, sub: `${p.short} · ${gs.abbr}` },
  ].filter(Boolean);
}));

const fields = [
  { k: 'short', label: 'Συντομογραφία', required: true, placeholder: 'π.χ. ΕπΜΣτ. Αθηνών' },
  { k: 'kind', label: 'Είδος', type: 'select', options: PROVINCE_KINDS },
  { k: 'full_title', label: 'Πλήρης τίτλος', full: true },
  { k: 'addressee', label: '«Προς» — όπως τυπώνεται στην Επιστολή', full: true },
  { k: 'email', label: 'Email Γραμματείας (κοινό)', type: 'email', full: true },
  { k: 'master_pick', label: '🔎 ΕπΜΔ από το Μητρώο Μελών', placeholder: 'επώνυμο, όνομα…', full: true },
  { k: 'master_name', label: 'Μέγας Διδάσκαλος της Επαρχίας (ΕπΜΔ)' },
  { k: 'master_email', label: 'Email ΕπΜΔ', type: 'email' },
  { k: 'secretary_pick', label: '🔎 ΕπΜΓρ. από το Μητρώο Μελών', placeholder: 'επώνυμο, όνομα…', full: true },
  { k: 'secretary_name', label: 'Μέγας Γραμματέας της Επαρχίας (ΕπΜΓρ.)' },
  { k: 'secretary_email', label: 'Email ΕπΜΓρ. (αν κενό: email Γραμματείας)', type: 'email' },
  { k: 'sort_order', label: 'Σειρά εμφάνισης', type: 'number' },
  { k: 'active', label: 'Κατάσταση', type: 'select', options: [[1, 'Ενεργή'], [0, 'Ανενεργή (κρυφή από τις λίστες)']] },
  { k: 'notes', label: 'Σημειώσεις', type: 'textarea', full: true },
];
const pickKeys = ['master_pick', 'secretary_pick'];

module({
  id: 'provinces',
  routes: crud({
    table: 'grand_lodges', base: '/provinces', title: 'Επαρχιακές Μεγάλες Στοές', one: 'Επαρχία', fields,
    defaults: { kind: 'Επαρχιακή', active: 1, sort_order: 100 },
    name: (p) => p.short,
    sort: (xs) => sortBy(xs, 'sort_order', 'id'),
    search: ['short', 'full_title', 'email', 'master_name', 'master_email', 'secretary_name', 'secretary_email'],
    columns: [
      { label: 'Επαρχία', v: (p) => `<b>${esc(p.short)}</b>${p.active ? '' : ' <span class="pill warn">Ανενεργή</span>'}<br><small class="muted">${esc(p.full_title)}</small>` },
      { label: 'Στοές', v: (p) => { const ls = provinceLodges(p); return ls.length ? `<b>${ls.length}</b><br><small class="muted">${ls.map((l) => esc(l.number)).sort((x, y) => (Number(x) || 1e9) - (Number(y) || 1e9)).join(', ')}</small>` : '—'; } },
      { label: 'Email Γραμματείας', v: (p) => esc(p.email) },
      { label: 'ΕπΜΔ', v: (p) => `${esc(p.master_name || '—')}<br><small class="muted">${esc(p.master_email)}</small>` },
      { label: 'ΕπΜΓρ.', v: (p) => `${esc(p.secretary_name || '—')}<br><small class="muted">${esc(p.secretary_email)}</small>` },
    ],
    validate(d, tx, id) {
      for (const k of pickKeys) delete d[k];
      d.active = Number(d.active) ? 1 : 0;
      d.sort_order = Number(d.sort_order) || 0;
      if (!PROVINCE_KINDS.includes(d.kind)) d.kind = 'Επαρχιακή';
      if (tx.find('grand_lodges', (p) => p.short === d.short && p.id !== id)) throw new Error(`Υπάρχει ήδη εγγραφή «${d.short}».`);
      return d;
    },
    afterSave(tx, r, old) { // μετονομασία: ακολουθούν και οι Στοές της
      if (old && old.short !== r.short) for (const l of tx.all('lodges')) if (l.provincial === old.short) tx.update('lodges', l.id, { provincial: r.short });
    },
    mountForm(el) {
      for (const [pick, name, email] of [['master_pick', 'master_name', 'master_email'], ['secretary_pick', 'secretary_name', 'secretary_email']]) {
        const f = el.querySelector(`[name=${pick}]`);
        attachPicker(f, memberItems, (m) => {
          el.querySelector(`[name=${name}]`).value = `${m.first_name || ''} ${m.surname || ''}`.trim();
          if (m.email) el.querySelector(`[name=${email}]`).value = m.email;
        });
      }
    },
    excel: {
      file: 'EMSTE_EPARCHIES.xlsx', sheet: 'ΕΠΑΡΧΙΕΣ', key: 'short',
      cols: [{ k: 'short', label: 'Συντομογραφία', w: 34 }, { k: 'full_title', label: 'Πλήρης τίτλος', w: 52 }, { k: 'kind', label: 'Είδος', w: 13 }, { k: 'email', label: 'Email Γραμματείας', w: 34 },
        { k: 'addressee', label: '«Προς»', w: 52 }, { k: 'master_name', label: 'ΕπΜΔ', w: 28 }, { k: 'master_email', label: 'Email ΕπΜΔ', w: 32 }, { k: 'secretary_name', label: 'ΕπΜΓρ.', w: 28 }, { k: 'secretary_email', label: 'Email ΕπΜΓρ.', w: 32 }],
      canAdd: () => false,
    },
  }),
  menu: [],
});
