// Συμβολικές Στοές — η κεντρική βάση Στοών (αριθμός, όνομα, Ανατολή, ΕπΜΣτ., email, Σεβάσμιος, Γραμματέας, Τυπικό, τόπος).
import { db } from '../core/store.js';
import { module } from '../core/app.js';
import { crud } from '../core/crud.js';
import { esc, sortBy, fold } from '../core/util.js';
import { addContactSource } from '../core/pickers.js';
import { provincialChoices } from './provinces.js';

export const LODGE_STATUSES = ['Ενεργή', 'Σε αργία', 'Ανενεργή'];
const SEED = '1|ΠΑΛΑΙΩΝ ΠΑΤΡΩΝ ΓΕΡΜΑΝΟΣ;2|ΑΚΡΟΠΟΛΙΣ;3|ΠΑΡΘΕΝΩΝ;4|ΜΙΑΟΥΛΗΣ;5|ΠΙΣΤΙΣ;8|ΗΛΙΟΤΡΟΠΙΟΝ;9|ΙΣΙΣ;10|ΗΡΑΚΛΕΙΤΟΣ;12|ΗΡΑΚΛΗΣ;13|GARIBALDI;15|ΕΜΠΕΔΟΚΛΗΣ;16|ΕΝΩΣΙΣ ΛΕΥΚΑΔΟΣ;17|ΑΝΑΓΕΝΝΗΣΙΣ;18|ΕΓΚΑΤΕΣΤΗΜΕΝΩΝ ΣΕΒΑΣΜΙΩΝ;19|ΤΡΙΠΤΟΛΕΜΟΣ;21|ΑΤΤΙΚΟΣ ΑΣΤΗΡ;23|ΠΥΘΑΓΟΡΑΣ;24|ΦΙΛΙΚΗ ΕΤΑΙΡΕΙΑ;26|ΜΕΓΑΣ ΑΛΕΞΑΝΔΡΟΣ;28|ΚΑΜΕΙΡΟΣ;29|ΚΑΣΣΑΝΔΡΟΣ;30|ΘΕΣΣΑΛΟΝΙΚΗ;31|ΣΩΚΡΑΤΗΣ;32|ΔΙΩΝΗ;36|ΔΕΙΝΟΚΡΑΤΗΣ;42|ΑΔΑΜΑΝΤΙΟΣ ΚΟΡΑΗΣ;44|ΒΥΖΑΣ;48|ΑΡΗΤΗ;50|ΔΑΙΔΑΛΟΣ;52|SAINT GEORGE;53|BENEFICENZA;54|ΑΡΓΩ;55|ΕΝΩΣΙΣ (ΚΥΠΡΟΣ);58|LA FRANCE;59|ΟΜΗΡΟΣ;60|ΔΗΜΗΤΡΑ;61|ΑΝΤΩΝΙΟΣ ΜΠΕΝΑΚΗΣ;62|ΠΛΟΥΤΑΡΧΟΣ;64|ΦΙΛΕΛΛΗΝΩΝ;66|ΠΥΘΑΓΟΡΑΣ;67|ΕΛΛΗΝΟΓΛΩΣΣΟΝ ΞΕΝΟΔΟΧΕΙΟΝ;69|ΑΝΤΙΠΛΟΙΑΡΧΟΣ ΒΛΑΧΑΚΟΣ;71|ΛΗΔΡΑ;73|ΑΧΙΛΛΕΥΣ Ο ΜΥΡΜΙΔΩΝ;76|ΛΟΡΔΟΣ ΒΥΡΩΝ;78|ΑΘΗΝΑ ΣΤΑΘΜΙΑ;80|ΑΠΟΛΛΩΝΙΟΣ Ο ΡΟΔΙΟΣ;84|ΚΥΠΡΑΙΩΝ ΗΡΩΩΝ;85|RUDYARD KIPLING;86|FRATELLI BANDIERA;88|ΑΓΙΟΥ ΙΩΑΝΝΟΥ;89|ΛΟΓΟΣ;90|ΑΘΑΝΑΣΙΟΣ ΛΕΥΚΑΔΙΤΗΣ;91|ΕΛΛΗΝΩΝ ΗΡΩΩΝ;92|ΙΩΑΝΝΗΣ ΚΑΠΟΔΙΣΤΡΙΑΣ;93|ΦΙΛΟΓΕΝΕΙΑ;94|ΔΙΟΝΥΣΙΟΣ ΡΩΜΑΣ;95|LA PAIX;96|ΘΕΜΙΣΤΟΚΛΗΣ;97|ΙΣΟΤΗΣ 1882;98|ΔΩΔΩΝΗ;99|ΚΑΘΗΚΟΝ;100|ΑΚΑΚΙΑ;101|ΑΛΕΞΑΝΔΡΟΣ ΡΩΜΑΣ;102|ΦΕΡΔΙΝΑΝΔΟΣ ΦΟΝ ΜΠΡΑΟΥΝΣΒΑΪΚ;103|ΠΛΑΤΩΝ 1990;104|ΑΚΡΟΠΟΛΙΣ 2010;105|ΠΡΟΜΗΘΕΥΣ 2014;106|ΜΑΚΕΔΩΝ;107|ΑΤΛΑΝΤΙΣ;108|ΕΥΡΩΠΗ;109|ΑΡΙΣΤΟΜΕΝΗΣ;111|ΣΠΥΡΙΔΩΝ ΝΑΓΟΣ;112|ΗΦΑΙΣΤΙΑ;113|ΔΗΜΗΤΗΡ;114|ΓΕΩΡΓΙΟΣ ΣΟΥΡΗΣ;115|ΟΡΦΕΥΣ;Φ|ΦΟΙΝΙΞ ΚΕΡΚΥΡΑΣ';
db.seed('lodges', () => SEED.split(';').map((s, i) => { const [number, name] = s.split('|'); return { id: i + 1, number, name, orient: '', provincial: '', email: '', master: '', secretary: '', secretary_email: '', status: 'Ενεργή', ritual: '', meeting_place: '', notes: '', source: 'Μητρώο Μελών' }; }));

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
    search: ['number', 'name', 'orient', 'provincial', 'email', 'master', 'secretary', 'secretary_email', 'ritual', 'meeting_place'],
    intro: () => {
      const xs = db.all('lodges'), miss = xs.filter((x) => !lodgeEmail(x)).length, noprov = xs.filter((x) => !x.provincial).length;
      return miss || noprov ? `<p class="muted">Προς συμπλήρωση: ${miss} Στοές χωρίς email, ${noprov} χωρίς ορισμένη ΕπΜΣτ.</p>` : '';
    },
    columns: [
      { label: 'Αρ.', v: (x) => `<b>${esc(x.number)}</b>` },
      { label: 'Όνομα', v: (x) => esc(x.name) + (x.status && x.status !== 'Ενεργή' ? ` <span class="pill warn">${esc(x.status)}</span>` : '') },
      { label: 'Ανατολή', v: (x) => esc(x.orient) },
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
        { k: 'ritual', label: 'Τυπικό', aliases: ['Ritual'], w: 18 }, { k: 'meeting_place', label: 'Τόπος συνεδριάσεων', aliases: ['Τόπος', 'Venue'], w: 40 }, { k: 'notes', label: 'Σημειώσεις', aliases: ['Notes'], w: 30 }],
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
