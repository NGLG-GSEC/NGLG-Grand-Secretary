// node tests/gas/province_secretaries.test.js — Επαρχίες: κωδικός στο email → μόνο οι Στοές τους → στοιχεία Γραμματέα + email Στοάς → έλεγχος Μητρώου → λήψη
const assert = require('assert');
const { makeEnv } = require('./harness');
const E = makeEnv();
E.props.ADMIN_KEY = 'k';
const prov = (short, logins, lodges) => ({ short, title: short, logins, lodges });
const lodge = (number, name, members) => ({ number, name, lodge_email: '', secretary_first: '', secretary_last: '', secretary_mobile: '', members });
let r = E.call({ action: 'admin_prov_push', key: 'k', provinces: [
  prov('ΕπΜΣτ. Αθηνών', ['athens@example.com'], [lodge('2', 'ΑΚΡΟΠΟΛΙΣ', [{ id: 1, s: 'Παπαδόπουλος', f: 'Γεώργιος', mm: 1 }, { id: 2, s: 'Νικολάου', f: 'Ιωάννης', mm: 0 }])]),
  prov('ΕπΜΣτ. Ιονίων Νήσων', ['ionian@example.com', 'Alt@Example.com'], [lodge('16', 'ΕΝΩΣΙΣ', [{ id: 3, s: 'Ζαχαρίου', f: 'Πέτρος', mm: 1 }])])] });
assert.ok(r.ok && r.provinces === 2 && r.lodges === 2, JSON.stringify(r));
assert.equal(E.call({ action: 'admin_prov_push', key: 'x', provinces: [] }).error, 'admin_unauthorized');

// άγνωστο email: ίδια απάντηση, κανένα email
assert.ok(E.call({ action: 'prov_otp_send', email: 'nobody@example.com' }).ok && E.mails.length === 0);
r = E.call({ action: 'prov_otp_send', email: 'alt@example.com' });
assert.ok(r.ok && E.mails.length === 1 && E.mails[0].to === 'alt@example.com' && /ΜΕΓΑΛΗ ΓΡΑΜΜΑΤΕΙΑ/.test(E.mails[0].htmlBody) && /ΕπΜΣτ\. Ιονίων Νήσων/.test(E.mails[0].htmlBody), JSON.stringify(E.mails[0]).slice(0, 300));
const code = /(\d{6})/.exec(E.mails[0].subject)[1];
assert.equal(E.call({ action: 'prov_otp_verify', email: 'alt@example.com', code: code === '000000' ? '111111' : '000000' }).error, 'otp_wrong');
r = E.call({ action: 'prov_otp_verify', email: 'alt@example.com', code });
assert.ok(r.ok && r.session && r.provinces.length === 1 && r.provinces[0].lodges.length === 1 && r.provinces[0].lodges[0].number === '16', JSON.stringify(r));
assert.ok(!JSON.stringify(r).includes('Ζαχαρίου'), 'τα μέλη της Στοάς δεν στέλνονται στη σελίδα');
const S = r.session;
// μόνο οι Στοές της Επαρχίας
assert.equal(E.call({ action: 'prov_save', session: S, lodge: '2', lodge_email: 'x@example.com' }).error, 'not_your_lodge');
assert.equal(E.call({ action: 'prov_save', session: 'y'.repeat(40), lodge: '16' }).error, 'unauthorized');
assert.equal(E.call({ action: 'prov_save', session: S, lodge: '16', lodge_email: 'όχι-email' }).error, 'bad_email');
r = E.call({ action: 'prov_save', session: S, lodge: '16', lodge_email: 'Enosis16@Example.com', secretary_first: 'Πέτρος', secretary_last: 'ΖΑΧΑΡΙΟΥ', secretary_mobile: '6900000016' });
assert.ok(r.ok && r.lodge.lodge_email === 'enosis16@example.com' && r.lodge.check.status === 'found' && r.lodge.check.mm === 1, JSON.stringify(r));
r = E.call({ action: 'prov_save', session: S, lodge: '16', lodge_email: 'enosis16@example.com', secretary_first: 'Άγνωστος', secretary_last: 'Τρίτος', secretary_mobile: '' });
assert.equal(r.lodge.check.status, 'notfound');
r = E.call({ action: 'prov_load', session: S });
assert.equal(r.provinces[0].lodges[0].secretary_last, 'Τρίτος');
// εφαρμογή: μία (η τελευταία) αλλαγή ανά Στοά· μια νέα δημοσίευση δεν την πατά μέχρι τη λήψη
r = E.call({ action: 'admin_prov_pull', key: 'k' });
assert.ok(r.changes.length === 1 && r.changes[0].lodge === '16' && r.changes[0].by === 'alt@example.com' && r.changes[0].values.secretary_last === 'Τρίτος', JSON.stringify(r));
E.call({ action: 'admin_prov_push', key: 'k', provinces: [prov('ΕπΜΣτ. Ιονίων Νήσων', ['alt@example.com'], [lodge('16', 'ΕΝΩΣΙΣ', [])])] });
const s2 = E.call({ action: 'prov_load', session: S });
assert.equal(s2.provinces[0].lodges[0].lodge_email, 'enosis16@example.com', 'η αλλαγή που περιμένει λήψη μένει');
assert.equal(E.call({ action: 'admin_prov_ack', key: 'k', ids: [r.changes[0].id] }).left, 0);
console.log('province secretaries: OK');
