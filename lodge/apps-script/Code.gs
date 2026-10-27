/**
 * Πύλη Γραμματέων Στοών — server (Google Apps Script)
 *
 * Ο Γραμματέας κάθε Στοάς βλέπει και διορθώνει ΜΟΝΟ το Μητρώο της Στοάς του, με τον προσωπικό κωδικό της Στοάς.
 * Κάθε «Αποθήκευση» γίνεται νέα έκδοση (π.χ. «ΑλλαγήΣτοά118έκδοση3-27Οκτ26») στο Drive, ώστε να υπάρχει επαναφορά,
 * και φεύγει email προς τη Στοά με τις αλλαγές (από τον λογαριασμό που ανέπτυξε το script — info@nglgreece.gr).
 * Η εφαρμογή της Μεγάλης Γραμματείας (ADMIN_KEY) στέλνει τα μητρώα και τους κωδικούς, παίρνει τις αλλαγές και τις περνά στο Μητρώο.
 *
 * Script Properties (Ρυθμίσεις έργου → Ιδιότητες σεναρίου):
 *   ADMIN_KEY   — μυστικό κλειδί που γράφεται και στην εφαρμογή (Πύλη Γραμματέων → Ρύθμιση). Υποχρεωτικό.
 *   BCC_EMAILS  — (προαιρετικό) κρυφή κοινοποίηση κάθε email αλλαγής, χωρισμένα με κόμμα.
 * Ο κώδικας είναι δημόσιος: δεν περιέχει κωδικούς, email ή δεδομένα μελών. Οδηγίες: lodge/README.md
 */

const VERSION = 1;
const ROOT_NAME = 'Μητρώα Στοών — Πύλη Γραμματέων';
const MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
const MAX_TRIES = 8; // λάθος κωδικοί ανά Στοά ανά 15 λεπτά

// Πεδία που αλλάζει ο Γραμματέας: στοιχεία & κατάσταση μελών (όχι Αρ. Μητρώου, Δίπλωμα, Επετηρίδα)
const MEMBER_FIELDS = ['surname', 'first_name', 'email', 'mobile', 'degree', 'date_ea', 'date_fc', 'date_mm'];
const LODGE_FIELDS = ['member_status', 'capacity', 'capacity_date', 'jw_date', 'sw_date', 'wm_date', 'dereg_date'];
const LABELS = {
  surname: 'Επώνυμο', first_name: 'Όνομα', email: 'Email', mobile: 'Κινητό', degree: 'Βαθμός',
  date_ea: 'Ημ. μύησης', date_fc: 'Ημ. Εταίρου', date_mm: 'Ημ. Διδασκάλου',
  member_status: 'Κατάσταση στη Στοά', capacity: 'Ιδιότητα', capacity_date: 'Ημ. ιδιότητας',
  jw_date: 'Ημ. Β΄ Επόπτη', sw_date: 'Ημ. Α΄ Επόπτη', wm_date: 'Ημ. Σεβασμίου', dereg_date: 'Ημ. διαγραφής'
};
const NOTE_TYPES = ['Αναγγελία Διδασκάλου Τέκτονος', 'Αναγγελία Εισδοχής', 'Αναγγελία Διέλευσης', 'Αναγγελία νέων Αρχών',
  'Αναγγελία Διαγραφής', 'Αναγγελία Υιοθεσίας / Επανόδου', 'Διόρθωση στοιχείων', 'Άλλο'];

function doGet() {
  return json_({ ok: true, service: 'lodge-portal', version: VERSION, adminKey: prop_('ADMIN_KEY') ? 'ρυθμίστηκε' : 'ΛΕΙΠΕΙ', lodges: Object.keys(codes_()).length });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  try {
    switch (b.action) {
      case 'login': return json_(login_(b));
      case 'save': return json_(withLock_(() => save_(b)));
      case 'admin_status': admin_(b); return json_({ ok: true, version: VERSION, lodges: Object.keys(codes_()).length });
      case 'admin_push': admin_(b); return json_(withLock_(() => push_(b)));
      case 'admin_pull': admin_(b); return json_(pull_());
      case 'admin_ack': admin_(b); return json_(withLock_(() => ack_(b)));
      case 'admin_versions': admin_(b); return json_({ ok: true, versions: versions_(lodgeNo_(b.lodge)) });
      case 'admin_restore': admin_(b); return json_(withLock_(() => restore_(b)));
      default: return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------------------------------------------------------------- Γραμματέας Στοάς
function login_(b) {
  const no = lodgeNo_(b.lodge);
  checkCode_(no, b.code);
  const cur = readCurrent_(no);
  if (!cur) return { ok: false, error: 'no_registry' };
  return { ok: true, lodge: cur.meta, members: cur.members, version: cur.version, version_name: cur.version_name, note_types: NOTE_TYPES };
}

function save_(b) {
  const no = lodgeNo_(b.lodge);
  checkCode_(no, b.code);
  const cur = readCurrent_(no);
  if (!cur) return { ok: false, error: 'no_registry' };
  if (Number(b.base_version) !== Number(cur.version)) return { ok: false, error: 'conflict', version: cur.version };
  const next = cleanMembers_(b.members, cur.members);
  const changes = diff_(cur.members, next);
  if (!changes.length) return { ok: false, error: 'no_changes' };
  const noteType = NOTE_TYPES.indexOf(b.note_type) >= 0 ? b.note_type : '';
  const note = String(b.note || '').slice(0, 2000);
  const by = String(b.by || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const rec = writeVersion_(no, cur, next, 'Αλλαγή', { changes: changes, note_type: noteType, note: note, by: by, source: 'lodge' });
  mailChange_(cur.meta, rec);
  return { ok: true, version: rec.version, version_name: rec.version_name, changes: changes.length, mailed: rec.mailed || '' };
}

// Μόνο τα επιτρεπτά πεδία· τα μέλη χωρίς id (νέα) παίρνουν προσωρινό κλειδί «n…»· μέλη άλλης Στοάς δεν γίνονται δεκτά
function cleanMembers_(list, prev) {
  const known = {};
  prev.forEach(function (m) { known[String(m.id)] = m; });
  const out = [];
  (Array.isArray(list) ? list : []).slice(0, 2000).forEach(function (m, i) {
    const id = m && m.id != null && known[String(m.id)] ? known[String(m.id)].id : null;
    const base = id != null ? known[String(id)] : { lodge: {}, ro: {} };
    const x = { id: id != null ? id : 'n' + Date.now().toString(36) + i, ro: base.ro || {}, lodge: {} };
    if (id == null) x.is_new = true;
    MEMBER_FIELDS.forEach(function (k) { x[k] = str_(m && m[k] !== undefined ? m[k] : base[k]); });
    LODGE_FIELDS.forEach(function (k) { x.lodge[k] = str_(m && m.lodge && m.lodge[k] !== undefined ? m.lodge[k] : (base.lodge || {})[k]); });
    if (id == null && !x.surname && !x.first_name) return; // κενή νέα γραμμή
    out.push(x);
  });
  // Μέλη που λείπουν από την υποβολή μένουν όπως ήταν (ο Γραμματέας δεν σβήνει μέλη — μόνο διαγραφή με κατάσταση)
  prev.forEach(function (m) { if (!out.some(function (x) { return String(x.id) === String(m.id); })) out.push(m); });
  return out;
}

function diff_(prev, next) {
  const before = {};
  prev.forEach(function (m) { before[String(m.id)] = m; });
  const out = [];
  next.forEach(function (m) {
    const o = before[String(m.id)];
    const fields = {};
    MEMBER_FIELDS.forEach(function (k) { const a = o ? str_(o[k]) : '', z = str_(m[k]); if (a !== z) fields[k] = [a, z]; });
    LODGE_FIELDS.forEach(function (k) { const a = o ? str_((o.lodge || {})[k]) : '', z = str_((m.lodge || {})[k]); if (a !== z) fields[k] = [a, z]; });
    if (Object.keys(fields).length) out.push({ id: m.id, is_new: !o, name: (m.surname + ' ' + m.first_name).trim(), fields: fields });
  });
  return out;
}

function checkCode_(no, code) {
  const cache = CacheService.getScriptCache(), key = 'tries_' + no, tries = Number(cache.get(key) || 0);
  if (tries >= MAX_TRIES) throw new Error('too_many_tries');
  const want = codes_()[no];
  if (!want || hash_(no, code) !== want) {
    cache.put(key, String(tries + 1), 900);
    throw new Error('unauthorized');
  }
}

// ---------------------------------------------------------------- Μεγάλη Γραμματεία (εφαρμογή)
function admin_(b) {
  const k = prop_('ADMIN_KEY');
  if (!k || String(b.key || '') !== k) throw new Error('admin_unauthorized');
}

// { lodges: [{ meta, members }], codes: { no: hash | '' } } — μόνο όσες Στοές άλλαξαν γίνονται νέα έκδοση
function push_(b) {
  if (b.codes && typeof b.codes === 'object') {
    const c = codes_();
    Object.keys(b.codes).forEach(function (no) { const h = String(b.codes[no] || ''); if (h) c[lodgeNo_(no)] = h; else delete c[lodgeNo_(no)]; });
    PropertiesService.getScriptProperties().setProperty('CODES', JSON.stringify(c));
  }
  let written = 0;
  const skipped = [], pending = pendingLodges_();
  (Array.isArray(b.lodges) ? b.lodges : []).forEach(function (L) {
    const no = lodgeNo_(L.meta && L.meta.number);
    // Αλλαγή Γραμματέα που δεν έχει περάσει ακόμη στην εφαρμογή: δεν την πατάμε (πρώτα «Λήψη αλλαγών»)
    if (pending[no]) { skipped.push(no); return; }
    const cur = readCurrent_(no);
    const members = (L.members || []).map(function (m) {
      const x = { id: m.id, ro: m.ro || {}, lodge: {} };
      MEMBER_FIELDS.forEach(function (k) { x[k] = str_(m[k]); });
      LODGE_FIELDS.forEach(function (k) { x.lodge[k] = str_((m.lodge || {})[k]); });
      return x;
    });
    const meta = { number: no, name: str_(L.meta.name), provincial: str_(L.meta.provincial), emails: (L.meta.emails || []).map(str_).filter(Boolean) };
    if (cur && JSON.stringify(cur.members) === JSON.stringify(members) && JSON.stringify(cur.meta) === JSON.stringify(meta)) return;
    writeVersion_(no, cur || { version: 0, members: [], meta: meta }, members, 'ΕνημέρωσηΜΓ', { source: 'app', changes: [], meta: meta });
    written++;
  });
  return { ok: true, written: written, skipped: skipped, lodges: Object.keys(codes_()).length };
}
function pendingLodges_() {
  const out = {}, it = sub_(root_(), '_αλλαγές').getFiles();
  while (it.hasNext()) { try { out[String(JSON.parse(it.next().getBlob().getDataAsString()).lodge)] = true; } catch (e) { /* */ } }
  return out;
}

// Αλλαγές των Γραμματέων που δεν έχει πάρει ακόμη η εφαρμογή
function pull_() {
  const dir = sub_(root_(), '_αλλαγές'), out = [];
  const it = dir.getFiles();
  while (it.hasNext()) { const f = it.next(); try { out.push(JSON.parse(f.getBlob().getDataAsString())); } catch (e) { /* χαλασμένο αρχείο */ } }
  out.sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
  return { ok: true, changes: out };
}

function ack_(b) {
  const ids = (b.ids || []).map(String), dir = sub_(root_(), '_αλλαγές'), done = sub_(root_(), '_εφαρμοσμένες');
  let n = 0;
  const it = dir.getFiles();
  while (it.hasNext()) { const f = it.next(); if (ids.indexOf(f.getName().replace(/\.json$/, '')) >= 0) { f.moveTo(done); n++; } }
  return { ok: true, acked: n };
}

function versions_(no) {
  const dir = sub_(root_(), 'Στοά ' + no), out = [];
  const it = dir.getFiles();
  while (it.hasNext()) {
    const f = it.next(), m = /έκδοση(\d+)/.exec(f.getName());
    if (m && f.getName() !== 'τρέχον.json') out.push({ version: Number(m[1]), name: f.getName().replace(/\.json$/, ''), at: f.getDateCreated().toISOString() });
  }
  return out.sort(function (a, b) { return b.version - a.version; });
}

// Επαναφορά: η παλιά έκδοση γίνεται νέα τρέχουσα έκδοση και καταγράφεται ως αλλαγή, ώστε η εφαρμογή να την περάσει στο Μητρώο
function restore_(b) {
  const no = lodgeNo_(b.lodge), v = Number(b.version), cur = readCurrent_(no);
  if (!cur) return { ok: false, error: 'no_registry' };
  const f = versionFile_(no, v);
  if (!f) return { ok: false, error: 'no_version' };
  const old = JSON.parse(f.getBlob().getDataAsString());
  // μέλη που προστέθηκαν μετά την παλιά έκδοση μένουν (η επαναφορά δεν σβήνει μέλη)
  const ids = {};
  old.members.forEach(function (m) { ids[String(m.id)] = true; });
  const next = old.members.filter(function (m) { return cur.members.some(function (c) { return String(c.id) === String(m.id); }); })
    .concat(cur.members.filter(function (m) { return !ids[String(m.id)]; }));
  const changes = diff_(cur.members, next);
  const rec = writeVersion_(no, cur, next, 'ΕπαναφοράΣτοά', { changes: changes, note_type: 'Επαναφορά', note: 'Επαναφορά στην έκδοση ' + old.version_name, source: 'restore' });
  return { ok: true, version: rec.version, version_name: rec.version_name, changes: changes.length };
}

// ---------------------------------------------------------------- αποθήκευση (Drive)
function writeVersion_(no, cur, members, kind, extra) {
  const v = Number(cur.version || 0) + 1, name = versionName_(kind, no, v, new Date());
  const meta = extra.meta || cur.meta;
  const snap = { version: v, version_name: name, at: new Date().toISOString(), meta: meta, members: members };
  const dir = sub_(root_(), 'Στοά ' + no);
  dir.createFile(name + '.json', JSON.stringify(snap), 'application/json');
  putFile_(dir, 'τρέχον.json', JSON.stringify(snap));
  const rec = { id: name, lodge: no, lodge_name: meta.name, version: v, version_name: name, at: snap.at, kind: kind,
    source: extra.source, note_type: extra.note_type || '', note: extra.note || '', by: extra.by || '', changes: extra.changes || [] };
  // στην εφαρμογή πηγαίνουν οι αλλαγές των Γραμματέων και οι επαναφορές (όχι οι δικές της ενημερώσεις)
  if (extra.source !== 'app') sub_(root_(), '_αλλαγές').createFile(name + '.json', JSON.stringify(rec), 'application/json');
  return rec;
}

// «ΑλλαγήΣτοά118έκδοση3-27Οκτ26»
function versionName_(kind, no, v, d) {
  const tz = Session.getScriptTimeZone() || 'Europe/Athens';
  const day = Number(Utilities.formatDate(d, tz, 'd')), mon = Number(Utilities.formatDate(d, tz, 'M')) - 1, yy = Utilities.formatDate(d, tz, 'yy');
  const k = kind === 'Αλλαγή' ? 'ΑλλαγήΣτοά' : kind === 'ΕνημέρωσηΜΓ' ? 'ΕνημέρωσηΜΓΣτοά' : kind;
  return k + no + 'έκδοση' + v + '-' + day + MONTHS[mon] + yy;
}

function readCurrent_(no) {
  const dir = sub_(root_(), 'Στοά ' + no), it = dir.getFilesByName('τρέχον.json');
  return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString()) : null;
}
function versionFile_(no, v) {
  const it = sub_(root_(), 'Στοά ' + no).getFiles();
  while (it.hasNext()) { const f = it.next(); if (new RegExp('έκδοση' + v + '-').test(f.getName())) return f; }
  return null;
}
function putFile_(dir, name, text) {
  const it = dir.getFilesByName(name);
  if (it.hasNext()) it.next().setContent(text); else dir.createFile(name, text, 'application/json');
}
function root_() {
  const p = PropertiesService.getScriptProperties(), id = p.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* σβήστηκε: νέος */ } }
  const f = DriveApp.createFolder(ROOT_NAME);
  p.setProperty('FOLDER_ID', f.getId());
  return f;
}
function sub_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

// ---------------------------------------------------------------- email προς τη Στοά
function mailChange_(meta, rec) {
  const to = (meta.emails || []).filter(function (e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); });
  if (!to.length) return;
  const subject = 'Στοά ' + meta.name + ' ' + meta.number + ' - Αλλαγή στο Μητρώο';
  const lines = rec.changes.map(function (c, i) {
    const f = Object.keys(c.fields).map(function (k) { return '   ' + (LABELS[k] || k) + ': ' + (c.fields[k][0] || '—') + ' → ' + (c.fields[k][1] || '—'); }).join('\n');
    return (i + 1) + '. ' + (c.is_new ? 'ΝΕΟ ΜΕΛΟΣ: ' : '') + c.name + '\n' + f;
  }).join('\n\n');
  const body = 'ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ\nΜΕΓΑΛΗ ΓΡΑΜΜΑΤΕΙΑ\n\n'
    + 'Στοά ' + meta.name + ' Αρ. ' + meta.number + ' — αλλαγές στο Μητρώο Μελών\n'
    + 'Έκδοση: ' + rec.version_name + '\n'
    + (rec.note_type || rec.note ? 'Σημείωση: ' + [rec.note_type, rec.note].filter(String).join(' — ') + '\n' : '')
    + (rec.by ? 'Καταχώριση από: ' + rec.by + '\n' : '')
    + '\n' + lines + '\n\n'
    + 'Οι αλλαγές καταχωρίστηκαν από τη Γραμματεία της Στοάς στην Πύλη Γραμματέων και περνούν στο Μητρώο της Μεγάλης Γραμματείας.\n'
    + 'Αν δεν τις κάνατε εσείς, ενημερώστε άμεσα τη Μεγάλη Γραμματεία.';
  const opt = { name: 'Μεγάλη Γραμματεία ΕΜΣτΕ' }, bcc = String(prop_('BCC_EMAILS') || '').trim();
  if (bcc) opt.bcc = bcc;
  MailApp.sendEmail(to.join(','), subject, body, opt);
  rec.mailed = to.join(', ');
}

// ---------------------------------------------------------------- βοηθητικά
function codes_() { try { return JSON.parse(prop_('CODES') || '{}'); } catch (e) { return {}; } }
// ίδιος υπολογισμός με την εφαρμογή: SHA-256 του «nglg-lodge|<αρ>|<κωδικός>» σε hex
function hash_(no, code) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'nglg-lodge|' + no + '|' + String(code || '').trim().toUpperCase(), Utilities.Charset.UTF_8);
  return bytes.map(function (x) { return ((x + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
function lodgeNo_(v) { const n = String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase(); const k = n.replace(/^0+/, '') || n; if (!/^[0-9Α-ΩA-Z]{1,6}$/.test(k)) throw new Error('bad_lodge'); return k; }
function str_(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 200); }
function prop_(n) { return PropertiesService.getScriptProperties().getProperty(n); }
function withLock_(fn) { const l = LockService.getScriptLock(); l.waitLock(30000); try { return fn(); } finally { l.releaseLock(); } }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
