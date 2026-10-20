/**
 * Backend για τη Δήλωση Διάθεσης Εκπροσώπησης Μ.Δ.
 * Αποθηκεύει τις δηλώσεις σε Google Sheet και επιστρέφει την αναφορά μόνο
 * - σε λογαριασμό Google της λίστας ADMIN_EMAILS (Σύνδεση με Google), ή
 * - με τον σωστό κωδικό (ADMIN_KEY στις Script Properties).
 *
 * Οδηγίες εγκατάστασης: δείτε README.md
 */

const HEADERS = ['Χρονοσήμανση', 'Αξιωματικός', 'Κωδικός Εργασίας', 'Α/Α Προβαδίσματος', 'Ακυρώθηκε'];
const COL = { time: 0, officer: 1, meeting: 2, rank: 3, cancelled: 4 };

// Μορφή κωδικού Εργασίας (π.χ. "atlas_118"). Οι Εργασίες ορίζονται μόνο
// στο index.html, ώστε η προσθήκη νέων να μη χρειάζεται νέα ανάπτυξη.
const MEETING_ID_PATTERN = /^[a-z0-9_]{1,40}$/;
const MAX_MEETINGS = 50;

const MAX_OFFICER_LENGTH = 200;

// Λογαριασμοί Google που βλέπουν την αναφορά χωρίς κωδικό: ΜΟΝΟ η ιδιότητα ADMIN_EMAILS
// στις Script Properties (χωρισμένα με κόμμα) — ο κώδικας είναι δημόσιος και δεν περιέχει email.
// Χωρίς ADMIN_EMAILS η αναφορά ανοίγει μόνο με τον κωδικό ADMIN_KEY.
// Με Client ID τύπου «External» (δικό του έργο Google Cloud) περνούν και λογαριασμοί @gmail.com.
const MAX_RANK = 10000;

// Έκδοση του κώδικα: φαίνεται ανοίγοντας το URL /exec στον browser
const VERSION = 4;

// Έλεγχος εγκατάστασης: ανοίξτε το URL /exec στον browser.
// Δείχνει μόνο αν υπάρχουν οι ρυθμίσεις, όχι τις τιμές τους.
function doGet() {
  return json_({
    ok: true,
    version: VERSION,
    googleClientId: prop_('GOOGLE_CLIENT_ID') ? 'ρυθμίστηκε' : 'ΛΕΙΠΕΙ',
    adminKey: prop_('ADMIN_KEY') ? 'ρυθμίστηκε' : 'ΛΕΙΠΕΙ',
    adminEmails: adminEmails_().length
  });
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }

  if (body.action === 'submit') return submit_(body);
  if (body.action === 'cancel') return cancel_(body);
  if (body.action === 'report') return report_(body);
  if (body.action === 'config') return config_();
  if (body.action === 'decide') return decide_(body);
  if (body.action === 'decisions') return json_({ ok: true, decisions: readDecisions_() });
  return json_({ ok: false, error: 'unknown_action' });
}

// Κοινός έλεγχος για υποβολή και ακύρωση
function parseRequest_(body) {
  const officer = String(body.officer || '').replace(/\s+/g, ' ').trim();
  const meetingIds = Array.isArray(body.meetings) ? body.meetings : [];
  const meetings = meetingIds
    .filter(id => typeof id === 'string' && MEETING_ID_PATTERN.test(id))
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .slice(0, MAX_MEETINGS);

  if (!officer || officer.length > MAX_OFFICER_LENGTH) return { error: 'invalid_officer' };
  if (meetings.length === 0) return { error: 'invalid_meetings' };
  return { officer: officer, meetings: meetings };
}

function submit_(body) {
  const req = parseRequest_(body);
  if (req.error) return json_({ ok: false, error: req.error });
  const rank = parseInt(body.rank, 10);
  const rankCell = rank > 0 && rank <= MAX_RANK ? rank : '';

  return withLock_(() => {
    const sheet = getSheet_();
    const existing = new Set(
      readRows_(sheet).filter(r => !r.cancelled)
        .map(r => normalize_(r.officer) + '|' + r.meetingId)
    );
    const now = new Date();
    const toAdd = [];
    req.meetings.forEach(id => {
      const key = normalize_(req.officer) + '|' + id;
      if (!existing.has(key)) {
        existing.add(key);
        toAdd.push([now, req.officer, id, rankCell, '']);
      }
    });
    if (toAdd.length) {
      sheet.getRange(sheet.getLastRow() + 1, 1, toAdd.length, HEADERS.length).setValues(toAdd);
    }
    return json_({ ok: true, added: toAdd.length, duplicates: req.meetings.length - toAdd.length });
  });
}

// Η ακύρωση δεν σβήνει τη γραμμή: σημειώνει την ώρα ακύρωσης στη στήλη «Ακυρώθηκε»
function cancel_(body) {
  const req = parseRequest_(body);
  if (req.error) return json_({ ok: false, error: req.error });

  return withLock_(() => {
    const sheet = getSheet_();
    const who = normalize_(req.officer);
    const now = new Date();
    let cancelled = 0;
    readRows_(sheet).forEach(r => {
      if (!r.cancelled && normalize_(r.officer) === who && req.meetings.indexOf(r.meetingId) !== -1) {
        sheet.getRange(r.row, COL.cancelled + 1).setValue(now);
        cancelled++;
      }
    });
    return json_({ ok: true, cancelled: cancelled });
  });
}

// Ό,τι χρειάζεται η σελίδα για το κουμπί «Σύνδεση με Google» (δημόσια στοιχεία)
function config_() {
  return json_({ ok: true, version: VERSION, googleClientId: prop_('GOOGLE_CLIENT_ID') });
}

// Ποιος ζητά: κωδικός ADMIN_KEY ή «Σύνδεση με Google» λογαριασμού της ADMIN_EMAILS· αλλιώς ''
function admin_(body) {
  const adminKey = prop_('ADMIN_KEY');
  if (adminKey && body.key && String(body.key) === adminKey) return 'κωδικός';
  const email = googleAdmin_(body.idToken);
  if (email) return email;
  Utilities.sleep(1000); // επιβράδυνση δοκιμών κωδικού
  return '';
}

function report_(body) {
  if (!admin_(body)) return json_({ ok: false, error: 'unauthorized' });
  const byMeeting = {};
  readRows_(getSheet_()).filter(r => !r.cancelled).forEach(r => {
    (byMeeting[r.meetingId] = byMeeting[r.meetingId] || []).push({ officer: r.officer, rank: r.rank });
  });
  return json_({ ok: true, data: byMeeting, decisions: readDecisions_() });
}

// ---- Απόφαση του Μεγάλου Διδασκάλου: ποιος εκπροσωπεί σε κάθε Εργασία (φύλλο «Αποφάσεις Μ.Δ.») ----
// Μία γραμμή ανά Εργασία· κενός εκπρόσωπος = χωρίς απόφαση. Οι αποφάσεις είναι δημόσιες (action 'decisions'),
// ώστε οι Μεγάλοι Αξιωματικοί να βλέπουν το πρόγραμμα· δηλώσεις και ποιος αποφάσισε μένουν μόνο στην αναφορά.
const DECISION_HEADERS = ['Κωδικός Εργασίας', 'Εκπρόσωπος', 'Χρονοσήμανση', 'Από'];
const DECISION_SHEET = 'Αποφάσεις Μ.Δ.';

function decide_(body) {
  const by = admin_(body);
  if (!by) return json_({ ok: false, error: 'unauthorized' });
  const id = String(body.meeting || '');
  const rep = String(body.representative || '').trim();
  if (!MEETING_ID_PATTERN.test(id)) return json_({ ok: false, error: 'invalid_meetings' });
  if (rep.length > MAX_OFFICER_LENGTH) return json_({ ok: false, error: 'invalid_officer' });
  return withLock_(() => {
    const sheet = getDecisionSheet_();
    const last = sheet.getLastRow();
    const ids = last < 2 ? [] : sheet.getRange(2, 1, last - 1, 1).getValues().map(r => String(r[0]));
    const i = ids.indexOf(id);
    const row = [id, rep, new Date(), by];
    if (i === -1) sheet.appendRow(row);
    else sheet.getRange(i + 2, 1, 1, DECISION_HEADERS.length).setValues([row]);
    return json_({ ok: true, decisions: readDecisions_() });
  });
}

function getDecisionSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(DECISION_SHEET) || ss.insertSheet(DECISION_SHEET, ss.getSheets().length); // στο τέλος: οι δηλώσεις μένουν το 1ο φύλλο
  const header = sheet.getRange(1, 1, 1, DECISION_HEADERS.length);
  if (header.getValues()[0].join('|') !== DECISION_HEADERS.join('|')) header.setValues([DECISION_HEADERS]);
  sheet.setFrozenRows(1);
  return sheet;
}

// { meetingId: "Εκπρόσωπος" } — μόνο όσες έχουν απόφαση
function readDecisions_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DECISION_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return {};
  const out = {};
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(r => {
    const id = String(r[0]), rep = String(r[1]).trim();
    if (id && rep) out[id] = rep;
  });
  return out;
}

// Επαληθεύει το διακριτικό «Σύνδεση με Google» στην Google και επιστρέφει
// το email, μόνο αν είναι επιβεβαιωμένο και ανήκει στη λίστα διαχειριστών.
function googleAdmin_(idToken) {
  const clientId = prop_('GOOGLE_CLIENT_ID');
  if (!clientId || typeof idToken !== 'string' || !idToken || idToken.length > 4096) return '';
  const res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return '';
  let t;
  try { t = JSON.parse(res.getContentText()); } catch (err) { return ''; }
  const email = String(t.email || '').toLowerCase();
  const verified = t.email_verified === true || t.email_verified === 'true';
  const issuer = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
  const fresh = Number(t.exp) * 1000 > Date.now();
  if (t.aud !== clientId || !verified || !issuer || !fresh) return '';
  return adminEmails_().indexOf(email) !== -1 ? email : '';
}

function adminEmails_() {
  const p = prop_('ADMIN_EMAILS');
  const list = p ? p.split(/[,;\s]+/) : [];
  return list.map(e => e.trim().toLowerCase()).filter(Boolean);
}

function prop_(name) {
  return String(PropertiesService.getScriptProperties().getProperty(name) || '').trim();
}

function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function getSheet_() {
  // Χρησιμοποιεί το πρώτο φύλλο του Sheet
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const header = sheet.getRange(1, 1, 1, HEADERS.length);
  if (header.getValues()[0].join('|') !== HEADERS.join('|')) header.setValues([HEADERS]);
  sheet.setFrozenRows(1);
  return sheet;
}

function readRows_(sheet) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HEADERS.length).getValues()
    .map((r, i) => ({
      row: i + 2,
      officer: String(r[COL.officer]),
      meetingId: String(r[COL.meeting]),
      rank: r[COL.rank] === '' ? null : Number(r[COL.rank]),
      cancelled: r[COL.cancelled] !== ''
    }))
    .filter(r => r.officer && r.meetingId);
}

// Για τον εντοπισμό διπλοεγγραφών: χωρίς τόνους, πεζά, ενιαία κενά
function normalize_(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
