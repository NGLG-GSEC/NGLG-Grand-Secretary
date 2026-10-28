/**
 * Πύλη Γραμματέων Στοών — server (Google Apps Script)
 *
 * Ο Γραμματέας κάθε Στοάς βλέπει και διορθώνει ΜΟΝΟ το Μητρώο της Στοάς του, με τον προσωπικό κωδικό της Στοάς.
 * Κάθε «Αποθήκευση» γίνεται νέα έκδοση (π.χ. «ΑλλαγήΣτοά118έκδοση3-27Οκτ26») στο Drive, ώστε να υπάρχει επαναφορά,
 * και φεύγει email προς τη Στοά με τις αλλαγές (από τον λογαριασμό που ανέπτυξε το script — info@nglgreece.gr).
 * Η εφαρμογή της Μεγάλης Γραμματείας (ADMIN_KEY) στέλνει τα μητρώα και τους κωδικούς, παίρνει τις αλλαγές και τις περνά στο Μητρώο.
 *
 * Script Properties (Ρυθμίσεις έργου → Ιδιότητες σεναρίου):
 *   ADMIN_KEY        — (προαιρετικό) μυστικό κλειδί διαχείρισης· αν οριστεί και στην εφαρμογή, συνδέεται χωρίς άλλο βήμα.
 *   SUPER_ADMINS     — email super admin (χωρισμένα με κόμμα): σύνδεση ΑΠΕΥΘΕΙΑΣ με «Σύνδεση με Google» (ή και με κωδικό email).
 *   ADMIN_EMAILS     — email διαχειριστών (χωρισμένα με κόμμα): σύνδεση με κωδικό μιας χρήσης (OTP) που στέλνεται στο email τους.
 *   GOOGLE_CLIENT_ID — το Google Client ID της εφαρμογής (Ρυθμίσεις → Google)· χρειάζεται για τη «Σύνδεση με Google».
 *   BCC_EMAILS       — (προαιρετικό) κρυφή κοινοποίηση κάθε email αλλαγής, χωρισμένα με κόμμα.
 *   ANNOUNCE_EMAILS  — email της Μεγάλης Γραμματείας για τις «Αναγγελίες» (μαζί με το email της Επαρχίας της Στοάς), χωρισμένα με κόμμα.
 * Ο κώδικας είναι δημόσιος: δεν περιέχει κωδικούς, email ή δεδομένα μελών. Οδηγίες: lodge/README.md
 */

const VERSION = 6;
const SESSION_SECONDS = 21600; // σύνδεση διαχειριστή: 6 ώρες
const OTP_SECONDS = 600, OTP_MAX_SENDS = 5, OTP_MAX_TRIES = 5;
const ROOT_NAME = 'Μητρώα Στοών — Πύλη Γραμματέων';
const MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
const MAX_TRIES = 8; // λάθος κωδικοί ανά Στοά ανά 15 λεπτά

// Πεδία που αλλάζει ο Γραμματέας: στοιχεία & κατάσταση μελών (όχι Αρ. Μητρώου, Δίπλωμα, Επετηρίδα)
const MEMBER_FIELDS = ['surname', 'first_name', 'email', 'mobile', 'degree', 'date_ea', 'date_fc', 'date_mm'];
const LODGE_FIELDS = ['member_status', 'capacity', 'capacity_date', 'jw_date', 'sw_date', 'wm_date', 'dereg_date', 'fee_rank'];
const LABELS = {
  surname: 'Επώνυμο', first_name: 'Όνομα', email: 'Email', mobile: 'Κινητό', degree: 'Βαθμός',
  date_ea: 'Ημ. μύησης', date_fc: 'Ημ. Εταίρου', date_mm: 'Ημ. Διδασκάλου',
  member_status: 'Κατάσταση στη Στοά', capacity: 'Ιδιότητα', capacity_date: 'Ημ. ιδιότητας',
  jw_date: 'Ημ. Β΄ Επόπτη', sw_date: 'Ημ. Α΄ Επόπτη', wm_date: 'Ημ. Σεβασμίου', dereg_date: 'Ημ. διαγραφής', fee_rank: 'Στοά συνδρομής'
};
const NOTE_TYPES = ['Αναγγελία Διδασκάλου Τέκτονος', 'Αναγγελία Εισδοχής', 'Αναγγελία Διέλευσης', 'Αναγγελία νέων Αρχών',
  'Αναγγελία Διαγραφής', 'Αναγγελία Υιοθεσίας / Επανόδου', 'Διόρθωση στοιχείων', 'Άλλο'];

function doGet() {
  return json_({ ok: true, service: 'lodge-portal', version: VERSION, adminKey: prop_('ADMIN_KEY') ? 'ρυθμίστηκε' : '—',
    superAdmins: emails_('SUPER_ADMINS').length, adminEmails: emails_('ADMIN_EMAILS').length, googleClientId: prop_('GOOGLE_CLIENT_ID') ? 'ρυθμίστηκε' : '—',
    lodges: Object.keys(codes_()).length });
}

// Έλεγχος από τον editor: επιλέξτε «testSetup» → ▶ Run (δίνει και την άδεια αποστολής email). Γράφει στο Execution log τι λείπει
// και στέλνει δοκιμαστικό email σε κάθε SUPER_ADMINS / ADMIN_EMAILS — αν φτάσει, θα φτάνει και ο κωδικός σύνδεσης.
function testSetup() {
  const to = emails_('SUPER_ADMINS').concat(emails_('ADMIN_EMAILS'));
  Logger.log(JSON.stringify({ version: VERSION, superAdmins: emails_('SUPER_ADMINS').length, adminEmails: emails_('ADMIN_EMAILS').length,
    googleClientId: prop_('GOOGLE_CLIENT_ID') ? 'ρυθμίστηκε' : 'ΛΕΙΠΕΙ', announceEmails: emails_('ANNOUNCE_EMAILS').length, mailQuota: MailApp.getRemainingDailyQuota() }));
  if (!to.length) { Logger.log('ΛΕΙΠΟΥΝ τα SUPER_ADMINS / ADMIN_EMAILS στις Script Properties — χωρίς αυτά δεν στέλνεται κωδικός.'); return; }
  to.forEach(function (email) {
    MailApp.sendEmail(email, 'Δοκιμή — Πύλη Γραμματέων Στοών', 'Η αποστολή email της Πύλης λειτουργεί. Ρόλος: ' + roleOf_(email) + '.', { name: 'Μεγάλη Γραμματεία ΕΜΣτΕ' });
    Logger.log('Δοκιμαστικό email → ' + email + ' (' + roleOf_(email) + ')');
  });
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad_request' }); }
  try {
    switch (b.action) {
      case 'lodge_lookup': return json_(lodgeLookup_(b));
      case 'lodge_otp_send': return json_(lodgeOtpSend_(b));
      case 'lodge_otp_verify': return json_(lodgeOtpVerify_(b));
      case 'login': return json_(login_(b));
      case 'save': return json_(withLock_(() => save_(b)));
      case 'prov_otp_send': return json_(provOtpSend_(b));
      case 'prov_otp_verify': return json_(provOtpVerify_(b));
      case 'prov_load': return json_(provLoad_(b));
      case 'prov_save': return json_(withLock_(() => provSave_(b)));
      case 'admin_prov_push': admin_(b); return json_(withLock_(() => provPush_(b)));
      case 'admin_prov_pull': admin_(b); return json_({ ok: true, changes: provChanges_() });
      case 'admin_prov_ack': admin_(b); return json_(withLock_(() => provAck_(b)));
      case 'admin_otp_send': return json_(otpSend_(b));
      case 'admin_otp_verify': return json_(otpVerify_(b));
      case 'admin_google': return json_(googleLogin_(b));
      case 'admin_status': { const who = admin_(b); return json_({ ok: true, version: VERSION, lodges: Object.keys(codes_()).length, who: who.email, role: who.role }); }
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
// Είσοδος στη Στοά: με σύνδεση από κωδικό στο email της Στοάς (session)· ο παλιός κωδικός Στοάς μόνο όπου δεν έχει οριστεί email Στοάς
function lodgeAuth_(no, b) {
  if (b.session) {
    const raw = /^[\w-]{20,80}$/.test(String(b.session)) ? CacheService.getScriptCache().get('lsess_' + b.session) : null;
    const s = raw ? JSON.parse(raw) : null, cur = readCurrent_(no);
    if (!s || s.lodges.indexOf(no) === -1 || !cur || String(cur.meta.login_email || '') !== s.email) throw new Error('unauthorized');
    return s.email;
  }
  const cur = readCurrent_(no);
  if (cur && cur.meta && cur.meta.login_email) throw new Error('email_only');
  checkCode_(no, b.code);
  return '';
}
function logins_() { try { return JSON.parse(prop_('LOGINS') || '{}'); } catch (e) { return {}; } }
// Ο Γραμματέας γράφει μόνο τον αριθμό της Στοάς («Φ» ή «φ» για τη Φοίνιξ Κερκύρας): ο κωδικός πηγαίνει στο καταχωρισμένο email της Στοάς
function lodgeEmailOf_(no) { const cur = readCurrent_(no); return cur && cur.meta ? String(cur.meta.login_email || '') : ''; }
function maskEmail_(e) { const p = String(e).split('@'); return p[0].slice(0, 2) + '•'.repeat(Math.max(3, p[0].length - 2)) + '@' + p[1]; }
function lodgeLookup_(b) {
  const no = lodgeNo_(b.lodge), cur = readCurrent_(no);
  if (!cur) return { ok: true, lodge: no, found: false };
  const e = String(cur.meta.login_email || '');
  return { ok: true, lodge: no, found: true, name: cur.meta.name, has_email: !!e, masked: e ? maskEmail_(e) : '' };
}
// Κωδικός μιας χρήσης στο email της Στοάς (μόνο αυτό το email ανοίγει τη Στοά)
function lodgeOtpSend_(b) {
  if (b.lodge != null && b.lodge !== '' && !b.email) { const e = lodgeEmailOf_(lodgeNo_(b.lodge)); if (!e) throw new Error('no_email'); b = { email: e }; }
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('bad_email');
  const nos = logins_()[email] || [];
  if (!nos.length) { Utilities.sleep(800); return { ok: true, sent: true }; } // ίδια απάντηση για άγνωστο email
  const cache = CacheService.getScriptCache(), nKey = 'lotpn_' + email, n = Number(cache.get(nKey) || 0);
  if (n >= OTP_MAX_SENDS) throw new Error('too_many_tries');
  const code = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000).padStart(6, '0');
  cache.put('lotp_' + email, otpHash_(email, code), OTP_SECONDS); cache.put('lotpt_' + email, '0', OTP_SECONDS); cache.put(nKey, String(n + 1), 900);
  const names = nos.map(function (no) { const c = readCurrent_(no); return 'Σεβ. Στοά «' + (c ? c.meta.name : '') + '» Αρ. ' + no; }).join(', ');
  const html = '<div style="font-family:Georgia,serif;max-width:560px;margin:auto;border:1px solid #d9cfb4;border-radius:10px;overflow:hidden">'
    + '<div style="background:#1d2f5e;color:#fff;padding:18px 22px;text-align:center"><div style="font-size:18px;letter-spacing:.06em">ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ</div><div style="font-size:12px;letter-spacing:.3em;color:#e5c98d;margin-top:4px">ΜΕΓΑΛΗ ΓΡΑΜΜΑΤΕΙΑ</div></div>'
    + '<div style="padding:22px;color:#1f2937;font-size:15px;line-height:1.6"><p>Προς τη Γραμματεία της <b>' + names + '</b>,</p>'
    + '<p>Ο κωδικός σας για την <b>Πύλη Γραμματέων Στοών</b> (Μητρώο Μελών της Στοάς) είναι:</p>'
    + '<div style="text-align:center;margin:18px 0"><span style="display:inline-block;font-size:32px;letter-spacing:.35em;font-weight:bold;color:#1d2f5e;background:#f7f3e8;border:1px solid #d9cfb4;border-radius:8px;padding:10px 18px">' + code + '</span></div>'
    + '<p>Γράψτε τον στο πεδίο «Κωδικός» της σελίδας. Ισχύει για 10 λεπτά και μία μόνο χρήση.</p>'
    + '<p style="color:#6b7280;font-size:13px">Αν δεν ζητήσατε εσείς τον κωδικό, αγνοήστε αυτό το μήνυμα.</p>'
    + '<p style="margin-top:22px">Με αδελφικούς χαιρετισμούς,<br><b>Μεγάλη Γραμματεία ΕΜΣτΕ</b></p></div></div>';
  MailApp.sendEmail({ to: email, subject: 'Κωδικός σύνδεσης ' + code + ' — Πύλη Γραμματέων Στοών (ΕΜΣτΕ)', htmlBody: html,
    body: 'Κωδικός για την Πύλη Γραμματέων Στοών: ' + code + ' (ισχύει 10 λεπτά).', name: 'Μεγάλη Γραμματεία ΕΜΣτΕ' });
  return { ok: true, sent: true };
}
function lodgeOtpVerify_(b) {
  if (b.lodge != null && b.lodge !== '' && !b.email) b = { email: lodgeEmailOf_(lodgeNo_(b.lodge)), code: b.code };
  const email = String(b.email || '').trim().toLowerCase(), code = String(b.code || '').replace(/\D/g, '');
  const cache = CacheService.getScriptCache(), want = cache.get('lotp_' + email), tries = Number(cache.get('lotpt_' + email) || 0);
  if (!want || tries >= OTP_MAX_TRIES) throw new Error('otp_expired');
  if (code.length !== 6 || otpHash_(email, code) !== want) { cache.put('lotpt_' + email, String(tries + 1), OTP_SECONDS); throw new Error('otp_wrong'); }
  cache.put('lotp_' + email, '', 1);
  const nos = logins_()[email] || [];
  if (!nos.length) throw new Error('unauthorized');
  const sid = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('lsess_' + sid, JSON.stringify({ email: email, lodges: nos }), SESSION_SECONDS);
  return { ok: true, session: sid, email: email, lodges: nos.map(function (no) { const c = readCurrent_(no); return { number: no, name: c ? c.meta.name : '' }; }) };
}

function login_(b) {
  const no = lodgeNo_(b.lodge);
  lodgeAuth_(no, b);
  const cur = readCurrent_(no);
  if (!cur) return { ok: false, error: 'no_registry' };
  return { ok: true, lodge: cur.meta, members: cur.members, version: cur.version, version_name: cur.version_name, note_types: NOTE_TYPES };
}

function save_(b) {
  const no = lodgeNo_(b.lodge);
  const email = lodgeAuth_(no, b);
  const cur = readCurrent_(no);
  if (!cur) return { ok: false, error: 'no_registry' };
  if (Number(b.base_version) !== Number(cur.version)) return { ok: false, error: 'conflict', version: cur.version };
  const next = cleanMembers_(b.members, cur.members);
  const changes = diff_(cur.members, next);
  if (!changes.length) return { ok: false, error: 'no_changes' };
  const noteType = NOTE_TYPES.indexOf(b.note_type) >= 0 ? b.note_type : '';
  const note = String(b.note || '').slice(0, 2000);
  const by = (String(b.by || '').replace(/\s+/g, ' ').trim().slice(0, 120) + (email ? ' (' + email + ')' : '')).trim();
  const rec = writeVersion_(no, cur, next, 'Αλλαγή', { changes: changes, note_type: noteType, note: note, by: by, source: 'lodge' });
  mailChange_(cur.meta, rec);
  announce_(cur.meta, rec);
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
// Διαχειριστής: κλειδί ADMIN_KEY ή σύνδεση (session) από κωδικό email (OTP) / «Σύνδεση με Google» → { email, role }
function admin_(b) {
  const k = prop_('ADMIN_KEY');
  if (k && b.key && String(b.key) === k) return { email: '', role: 'key' };
  const sid = String(b.session || '');
  if (/^[\w-]{20,80}$/.test(sid)) {
    const email = CacheService.getScriptCache().get('sess_' + sid), role = email ? roleOf_(email) : '';
    if (role) return { email: email, role: role };
  }
  throw new Error('admin_unauthorized');
}
function emails_(prop) { return String(prop_(prop) || '').split(/[,;\s]+/).map(function (e) { return e.trim().toLowerCase(); }).filter(Boolean); }
function roleOf_(email) { const e = String(email || '').trim().toLowerCase(); return !e ? '' : emails_('SUPER_ADMINS').indexOf(e) !== -1 ? 'super' : emails_('ADMIN_EMAILS').indexOf(e) !== -1 ? 'admin' : ''; }
function newSession_(email) {
  const sid = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put('sess_' + sid, email, SESSION_SECONDS);
  return { ok: true, session: sid, email: email, role: roleOf_(email), expires_in: SESSION_SECONDS };
}
function otpHash_(email, code) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'nglg-otp|' + email + '|' + code, Utilities.Charset.UTF_8);
  return bytes.map(function (x) { return ((x + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
// Κωδικός μιας χρήσης (6 ψηφία, 10 λεπτά) στο email διαχειριστή. Η απάντηση είναι ίδια και για άγνωστο email (δεν αποκαλύπτεται ποιοι είναι διαχειριστές).
function otpSend_(b) {
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('bad_email');
  if (!roleOf_(email)) { Utilities.sleep(800); return { ok: true, sent: true }; }
  const cache = CacheService.getScriptCache(), nKey = 'otpn_' + email, n = Number(cache.get(nKey) || 0);
  if (n >= OTP_MAX_SENDS) throw new Error('too_many_tries');
  const code = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000).padStart(6, '0'); // τυχαίο UUID v4
  cache.put('otp_' + email, otpHash_(email, code), OTP_SECONDS);
  cache.put('otpt_' + email, '0', OTP_SECONDS);
  cache.put(nKey, String(n + 1), 900);
  MailApp.sendEmail(email, 'Κωδικός σύνδεσης Πύλης Γραμματέων: ' + code,
    'Κωδικός μιας χρήσης για τη διαχείριση της Πύλης Γραμματέων Στοών: ' + code + '\n\nΙσχύει 10 λεπτά. Αν δεν τον ζητήσατε εσείς, αγνοήστε αυτό το μήνυμα.',
    { name: 'Μεγάλη Γραμματεία ΕΜΣτΕ' });
  return { ok: true, sent: true };
}
function otpVerify_(b) {
  const email = String(b.email || '').trim().toLowerCase(), code = String(b.code || '').replace(/\D/g, '');
  const cache = CacheService.getScriptCache(), want = cache.get('otp_' + email), tries = Number(cache.get('otpt_' + email) || 0);
  if (!want || tries >= OTP_MAX_TRIES) throw new Error('otp_expired');
  if (code.length !== 6 || otpHash_(email, code) !== want) { cache.put('otpt_' + email, String(tries + 1), OTP_SECONDS); throw new Error('otp_wrong'); }
  cache.put('otp_' + email, '', 1);
  if (!roleOf_(email)) throw new Error('admin_unauthorized');
  return newSession_(email);
}
// «Σύνδεση με Google»: access token της εφαρμογής (scope openid email) → επαλήθευση στην Google· απευθείας μόνο για SUPER_ADMINS
function googleLogin_(b) {
  const clientId = String(prop_('GOOGLE_CLIENT_ID') || '').trim(), tok = String(b.access_token || '');
  if (!clientId) throw new Error('no_google_client_id');
  if (!tok || tok.length > 4096) throw new Error('admin_unauthorized');
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(tok), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('admin_unauthorized');
  let t; try { t = JSON.parse(res.getContentText()); } catch (e) { throw new Error('admin_unauthorized'); }
  const email = String(t.email || '').toLowerCase(), verified = t.email_verified === true || t.email_verified === 'true';
  if ((t.aud !== clientId && t.azp !== clientId) || !verified || Number(t.expires_in || 0) <= 0) throw new Error('admin_unauthorized');
  if (roleOf_(email) !== 'super') throw new Error('not_super_admin');
  return newSession_(email);
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
    const le = String(L.meta.login_email || '').trim().toLowerCase();
    const meta = { number: no, name: str_(L.meta.name), provincial: str_(L.meta.provincial), emails: (L.meta.emails || []).map(str_).filter(Boolean), login_email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(le) ? le : '', province_email: str_(L.meta.province_email).toLowerCase() };
    // email εισόδου → Στοές (ευρετήριο για τον κωδικό στο email)
    const lg = logins_(); Object.keys(lg).forEach(function (e) { lg[e] = lg[e].filter(function (x) { return x !== no; }); if (!lg[e].length) delete lg[e]; });
    if (meta.login_email) (lg[meta.login_email] = lg[meta.login_email] || []).push(no);
    PropertiesService.getScriptProperties().setProperty('LOGINS', JSON.stringify(lg));
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

// ---------------------------------------------------------------- Επαρχίες: στοιχεία Γραμματέων των Στοών τους
// Η Επαρχιακή Γραμματεία μπαίνει με το email της (κωδικός μιας χρήσης από τον λογαριασμό του script) και βλέπει ΜΟΝΟ τις Στοές της:
// email Στοάς (το κλειδί της Στοάς), ονοματεπώνυμο και κινητό Γραμματέα· έλεγχος αν ο Γραμματέας είναι μέλος της Στοάς και αν έχει Δίπλωμα Διδασκάλου.
// Η εφαρμογή στέλνει Επαρχίες, Στοές και μέλη (admin_prov_push) και παίρνει τις αλλαγές (admin_prov_pull / admin_prov_ack).
function provData_() { const it = sub_(root_(), '_επαρχίες').getFilesByName('επαρχίες.json'); return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString()) : { provinces: [] }; }
function provSaveData_(d) { putFile_(sub_(root_(), '_επαρχίες'), 'επαρχίες.json', JSON.stringify(d)); }
function provChanges_() { const it = sub_(root_(), '_επαρχίες').getFilesByName('αλλαγές.json'); return it.hasNext() ? JSON.parse(it.next().getBlob().getDataAsString()) : []; }
function provSaveChanges_(xs) { putFile_(sub_(root_(), '_επαρχίες'), 'αλλαγές.json', JSON.stringify(xs)); }
function provsOf_(email) { const e = String(email || '').trim().toLowerCase(); return provData_().provinces.filter(function (p) { return (p.logins || []).indexOf(e) !== -1; }); }
function provPush_(b) {
  const provinces = (Array.isArray(b.provinces) ? b.provinces : []).map(function (p) {
    return { short: str_(p.short), title: str_(p.title), logins: (p.logins || []).map(function (e) { return String(e || '').trim().toLowerCase(); }).filter(function (e) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e); }),
      lodges: (p.lodges || []).map(function (l) { return { number: lodgeNo_(l.number), name: str_(l.name), lodge_email: str_(l.lodge_email).toLowerCase(), secretary_first: str_(l.secretary_first), secretary_last: str_(l.secretary_last), secretary_mobile: str_(l.secretary_mobile),
        members: (l.members || []).slice(0, 3000).map(function (m) { return { id: m.id, s: str_(m.s), f: str_(m.f), mm: m.mm ? 1 : 0 }; }) }; }) };
  });
  // αλλαγές Επαρχιών που δεν έχει πάρει ακόμη η εφαρμογή: μένουν (δεν πατιούνται από τη δημοσίευση)
  const pend = {}; provChanges_().forEach(function (c) { pend[c.lodge] = c.values; });
  provinces.forEach(function (p) { p.lodges.forEach(function (l) { if (pend[l.number]) Object.keys(pend[l.number]).forEach(function (k) { l[k] = pend[l.number][k]; }); }); });
  provSaveData_({ provinces: provinces, at: new Date().toISOString() });
  return { ok: true, provinces: provinces.length, lodges: provinces.reduce(function (a, p) { return a + p.lodges.length; }, 0), pending: Object.keys(pend).length };
}
function provAck_(b) {
  const ids = Array.isArray(b.ids) ? b.ids.map(String) : [];
  const rest = provChanges_().filter(function (c) { return ids.indexOf(String(c.id)) === -1; });
  provSaveChanges_(rest);
  return { ok: true, left: rest.length };
}
const plain_ = function (s) { return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/Σ/g, 'Σ').replace(/ς/g, 'Σ').replace(/[^A-ZΑ-Ω ]/g, ' ').replace(/\s+/g, ' ').trim(); };
// Ο Γραμματέας στο Μητρώο της Στοάς: ίδιο επώνυμο και όνομα (ή αρχή του ονόματος)
function provCheck_(l) {
  const ln = plain_(l.secretary_last), fn = plain_(l.secretary_first);
  if (!ln) return { status: 'empty' };
  const hits = (l.members || []).filter(function (m) { const s = plain_(m.s), f = plain_(m.f); return s === ln && (!fn || f === fn || f.indexOf(fn) === 0 || fn.indexOf(f) === 0); });
  if (!hits.length) return { status: 'notfound' };
  if (hits.length > 1) return { status: 'ambiguous', count: hits.length };
  return { status: 'found', name: hits[0].s + ' ' + hits[0].f, mm: hits[0].mm ? 1 : 0 };
}
function provView_(p) {
  return { short: p.short, title: p.title, lodges: p.lodges.map(function (l) { return { number: l.number, name: l.name, lodge_email: l.lodge_email, secretary_first: l.secretary_first, secretary_last: l.secretary_last, secretary_mobile: l.secretary_mobile, check: provCheck_(l) }; }) };
}
function provSession_(b) {
  const sid = String(b.session || ''), email = /^[\w-]{20,80}$/.test(sid) ? CacheService.getScriptCache().get('psess_' + sid) : '';
  if (!email) throw new Error('unauthorized');
  const ps = provsOf_(email);
  if (!ps.length) throw new Error('unauthorized');
  return { email: email, provinces: ps };
}
function provOtpSend_(b) {
  const email = String(b.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('bad_email');
  const ps = provsOf_(email);
  if (!ps.length) { Utilities.sleep(800); return { ok: true, sent: true }; } // ίδια απάντηση: δεν αποκαλύπτεται ποια email έχουν πρόσβαση
  const cache = CacheService.getScriptCache(), nKey = 'potpn_' + email, n = Number(cache.get(nKey) || 0);
  if (n >= OTP_MAX_SENDS) throw new Error('too_many_tries');
  const code = String(parseInt(Utilities.getUuid().replace(/-/g, '').slice(0, 12), 16) % 1000000).padStart(6, '0');
  cache.put('potp_' + email, otpHash_(email, code), OTP_SECONDS); cache.put('potpt_' + email, '0', OTP_SECONDS); cache.put(nKey, String(n + 1), 900);
  const who = ps.map(function (p) { return p.title || p.short; }).join(', ');
  const html = '<div style="font-family:Georgia,serif;max-width:560px;margin:auto;border:1px solid #d9cfb4;border-radius:10px;overflow:hidden">'
    + '<div style="background:#1d2f5e;color:#fff;padding:18px 22px;text-align:center"><div style="font-size:18px;letter-spacing:.06em">ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ</div><div style="font-size:12px;letter-spacing:.3em;color:#e5c98d;margin-top:4px">ΜΕΓΑΛΗ ΓΡΑΜΜΑΤΕΙΑ</div></div>'
    + '<div style="padding:22px;color:#1f2937;font-size:15px;line-height:1.6"><p>Προς τη Γραμματεία της <b>' + who + '</b>,</p>'
    + '<p>Ο κωδικός σας για τη σελίδα <b>«Γραμματείς Στοών»</b> της Μεγάλης Γραμματείας είναι:</p>'
    + '<div style="text-align:center;margin:18px 0"><span style="display:inline-block;font-size:32px;letter-spacing:.35em;font-weight:bold;color:#1d2f5e;background:#f7f3e8;border:1px solid #d9cfb4;border-radius:8px;padding:10px 18px">' + code + '</span></div>'
    + '<p>Γράψτε τον στο πεδίο «Κωδικός» της σελίδας. Ισχύει για 10 λεπτά και μία μόνο χρήση.</p>'
    + '<p style="color:#6b7280;font-size:13px">Αν δεν ζητήσατε εσείς τον κωδικό, αγνοήστε αυτό το μήνυμα.</p>'
    + '<p style="margin-top:22px">Με αδελφικούς χαιρετισμούς,<br><b>Μεγάλη Γραμματεία ΕΜΣτΕ</b></p></div></div>';
  MailApp.sendEmail({ to: email, subject: 'Κωδικός σύνδεσης ' + code + ' — Γραμματείς Στοών (ΕΜΣτΕ)', htmlBody: html,
    body: 'Κωδικός για τη σελίδα «Γραμματείς Στοών»: ' + code + ' (ισχύει 10 λεπτά).', name: 'Μεγάλη Γραμματεία ΕΜΣτΕ' });
  return { ok: true, sent: true };
}
function provOtpVerify_(b) {
  const email = String(b.email || '').trim().toLowerCase(), code = String(b.code || '').replace(/\D/g, '');
  const cache = CacheService.getScriptCache(), want = cache.get('potp_' + email), tries = Number(cache.get('potpt_' + email) || 0);
  if (!want || tries >= OTP_MAX_TRIES) throw new Error('otp_expired');
  if (code.length !== 6 || otpHash_(email, code) !== want) { cache.put('potpt_' + email, String(tries + 1), OTP_SECONDS); throw new Error('otp_wrong'); }
  cache.put('potp_' + email, '', 1);
  const ps = provsOf_(email);
  if (!ps.length) throw new Error('unauthorized');
  const sid = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  cache.put('psess_' + sid, email, SESSION_SECONDS);
  return { ok: true, session: sid, email: email, provinces: ps.map(provView_) };
}
function provLoad_(b) { const s = provSession_(b); return { ok: true, email: s.email, provinces: s.provinces.map(provView_) }; }
function provSave_(b) {
  const s = provSession_(b), no = lodgeNo_(b.lodge), d = provData_();
  const allowed = s.provinces.map(function (p) { return p.short; });
  let target = null;
  d.provinces.forEach(function (p) { if (allowed.indexOf(p.short) !== -1) p.lodges.forEach(function (l) { if (l.number === no) target = l; }); });
  if (!target) throw new Error('not_your_lodge');
  const v = { lodge_email: str_(b.lodge_email).toLowerCase(), secretary_first: str_(b.secretary_first), secretary_last: str_(b.secretary_last), secretary_mobile: str_(b.secretary_mobile) };
  if (v.lodge_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.lodge_email)) throw new Error('bad_email');
  if (v.secretary_mobile && String(v.secretary_mobile).replace(/\D/g, '').length < 10) throw new Error('bad_mobile');
  Object.keys(v).forEach(function (k) { target[k] = v[k]; });
  provSaveData_(d);
  const check = provCheck_(target), xs = provChanges_().filter(function (c) { return c.lodge !== no; });
  xs.push({ id: 'p' + no + '-' + Date.now(), at: new Date().toISOString(), by: s.email, lodge: no, lodge_name: target.name, values: v, check: check });
  provSaveChanges_(xs);
  return { ok: true, lodge: provView_({ lodges: [target] }).lodges[0] };
}

// ---------------------------------------------------------------- Αναγγελίες: κάθε αλλαγή μέλους → Επαρχία της Στοάς + Μεγάλη Γραμματεία
// Ένα email ανά μέλος, με θέμα το είδος της αλλαγής (π.χ. «Αναγγελία μέλους Όνομα Επώνυμο — Στοά Χ 12 — Διδάσκαλος»).
const plainUp_ = function (v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase(); };
function announceKind_(c) {
  const f = c.fields || {}, to = function (k) { return f[k] ? String(f[k][1] || '') : ''; }, kinds = [];
  if (c.is_new) kinds.push(/ΥΙΟΘΕΤ/.test(plainUp_(to('capacity'))) ? 'Υιοθεσία (νέο μέλος)' : /ΕΠΑΝΕΛΘ/.test(plainUp_(to('capacity'))) ? 'Επάνοδος (νέο μέλος)' : 'Εισδοχή (νέο μέλος — Μαθητής)');
  if (f.member_status && /ΔΙΑΓΡΑΦ/.test(plainUp_(to('member_status')))) kinds.push('Διαγραφή');
  else if (f.member_status && /ΔΙΑΓΡΑΦ/.test(plainUp_(f.member_status[0]))) kinds.push('Επάνοδος / άρση διαγραφής');
  else if (f.member_status) kinds.push('Κατάσταση: ' + to('member_status'));
  const deg = plainUp_(to('degree'));
  if (!c.is_new && f.degree) kinds.push(/ΜΑΘΗΤ/.test(deg) ? 'Εισδοχή (Μαθητής)' : /ΕΤΑΙΡ/.test(deg) ? 'Διέλευση (Εταίρος)' : /ΔΙΔΑΣΚ/.test(deg) ? 'Ανύψωση σε Διδάσκαλο' : 'Βαθμός: ' + to('degree'));
  else if (!c.is_new) { if (f.date_mm && to('date_mm')) kinds.push('Ανύψωση σε Διδάσκαλο'); else if (f.date_fc && to('date_fc')) kinds.push('Διέλευση (Εταίρος)'); else if (f.date_ea && to('date_ea')) kinds.push('Εισδοχή (Μαθητής)'); }
  if (!c.is_new && f.capacity) kinds.push('Ιδιότητα: ' + (to('capacity') || '—'));
  if (f.fee_rank) kinds.push('Στοά συνδρομής: ' + (to('fee_rank') === '1' ? '1η (πλήρης)' : to('fee_rank') ? to('fee_rank') + 'η' : '—'));
  if (f.wm_date && to('wm_date')) kinds.push('Σεβάσμιος'); if (f.sw_date && to('sw_date')) kinds.push('Α΄ Επόπτης'); if (f.jw_date && to('jw_date')) kinds.push('Β΄ Επόπτης');
  if (!kinds.length) kinds.push('Μεταβολή στοιχείων');
  return kinds;
}
function announce_(meta, rec) {
  const to = [String(meta.province_email || '').trim()].concat(String(prop_('ANNOUNCE_EMAILS') || '').split(/[,;\s]+/))
    .map(function (e) { return String(e || '').trim().toLowerCase(); }).filter(function (e, i, a) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && a.indexOf(e) === i; });
  rec.announced = [];
  if (!to.length) return;
  rec.changes.forEach(function (c) {
    const kinds = announceKind_(c), name = String(c.name || '').trim();
    const subject = 'Αναγγελία μέλους ' + name + ' — Στοά ' + meta.name + ' ' + meta.number + ' — ' + kinds.join(' · ');
    const rows = Object.keys(c.fields || {}).map(function (k) { return '<tr><td style="padding:4px 10px;color:#4b5260">' + (LABELS[k] || k) + '</td><td style="padding:4px 10px">' + (c.fields[k][0] || '—') + '</td><td style="padding:4px 10px"><b>' + (c.fields[k][1] || '—') + '</b></td></tr>'; }).join('');
    const html = '<div style="font-family:Georgia,serif;max-width:620px;border:1px solid #d9cfb4;border-radius:10px;overflow:hidden">'
      + '<div style="background:#1d2f5e;color:#fff;padding:14px 20px"><div style="letter-spacing:.06em">ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ</div><div style="font-size:12px;letter-spacing:.25em;color:#e5c98d">ΑΝΑΓΓΕΛΙΑ ΜΕΤΑΒΟΛΗΣ ΜΗΤΡΩΟΥ</div></div>'
      + '<div style="padding:18px 20px;font-size:15px;line-height:1.55"><p><b>' + kinds.join(' · ') + '</b></p><p>Μέλος: <b>' + name + '</b><br>Σεβ. Στοά «' + meta.name + '» Αρ. ' + meta.number + (meta.provincial ? ' · ' + meta.provincial : '') + '</p>'
      + '<table style="border-collapse:collapse;font-size:14px;margin:8px 0"><tr style="background:#f3f1ea"><th style="padding:4px 10px;text-align:left">Πεδίο</th><th style="padding:4px 10px;text-align:left">Πριν</th><th style="padding:4px 10px;text-align:left">Τώρα</th></tr>' + rows + '</table>'
      + (rec.note_type || rec.note ? '<p>Σημείωση Γραμματέα: ' + [rec.note_type, rec.note].filter(Boolean).join(' — ') + '</p>' : '')
      + '<p style="color:#6b7280;font-size:13px">Καταχώριση: ' + (rec.by || 'Γραμματεία της Στοάς') + ' · Έκδοση Μητρώου: ' + rec.version_name + '</p></div></div>';
    MailApp.sendEmail({ to: to.join(','), subject: subject, htmlBody: html, body: subject + '\n' + Object.keys(c.fields || {}).map(function (k) { return (LABELS[k] || k) + ': ' + (c.fields[k][0] || '—') + ' → ' + (c.fields[k][1] || '—'); }).join('\n'), name: 'Μεγάλη Γραμματεία ΕΜΣτΕ' });
    rec.announced.push({ id: c.id, subject: subject, kinds: kinds });
  });
  // η καταγραφή της αλλαγής κρατά και τις αναγγελίες που στάλθηκαν (για τον «Έλεγχο αλλαγών» της εφαρμογής)
  const f = sub_(root_(), '_αλλαγές').getFilesByName(rec.id + '.json');
  if (f.hasNext()) { const file = f.next(), x = JSON.parse(file.getBlob().getDataAsString()); x.announced = rec.announced; x.announced_to = to; file.setContent(JSON.stringify(x)); }
}

// ---------------------------------------------------------------- βοηθητικά
function codes_() { try { return JSON.parse(prop_('CODES') || '{}'); } catch (e) { return {}; } }
// ίδιος υπολογισμός με την εφαρμογή: SHA-256 του «nglg-lodge|<αρ>|<κωδικός>» σε hex
function hash_(no, code) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'nglg-lodge|' + no + '|' + String(code || '').trim().toUpperCase(), Utilities.Charset.UTF_8);
  return bytes.map(function (x) { return ((x + 256) % 256).toString(16).padStart(2, '0'); }).join('');
}
function lodgeNo_(v) { const n = String(v == null ? '' : v).replace(/\s+/g, '').toUpperCase().replace(/^F$/, 'Φ'); const k = n.replace(/^0+/, '') || n; if (!/^[0-9Α-ΩA-Z]{1,6}$/.test(k)) throw new Error('bad_lodge'); return k; }
function str_(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, 200); }
function prop_(n) { return PropertiesService.getScriptProperties().getProperty(n); }
function withLock_(fn) { const l = LockService.getScriptLock(); l.waitLock(30000); try { return fn(); } finally { l.releaseLock(); } }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
