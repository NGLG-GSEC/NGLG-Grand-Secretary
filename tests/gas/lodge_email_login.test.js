// node tests/gas/lodge_email_login.test.js — είσοδος Γραμματέα ΜΟΝΟ με το email της Στοάς: κωδικός στο email → session → Μητρώο / αποθήκευση
const assert = require('assert');
const { makeEnv, hash } = require('./harness');
const E = makeEnv();
E.props.ADMIN_KEY = 'k';
const member = (id, sn) => ({ id, surname: sn, first_name: 'Α', email: '', mobile: '', degree: 'Διδάσκαλος', date_ea: '', date_fc: '', date_mm: '', ro: {}, lodge: { member_status: '1. ΤΑΚΤΙΚΟ' } });
const L = (no, name, login) => ({ meta: { number: no, name, provincial: 'Π', emails: [login], login_email: login }, members: [member(Number(no) * 10, 'Μέλος' + no)] });
let r = E.call({ action: 'admin_push', key: 'k', lodges: [L('2', 'ΑΚΡΟΠΟΛΙΣ', 'Akropolis02@Example.com'), L('104', 'ΑΚΡΟΠΟΛΙΣ', 'akro104@example.com')], codes: { 2: hash('2', 'ABCD-1234') } });
assert.ok(r.ok && r.written === 2, JSON.stringify(r));
// ο παλιός κωδικός Στοάς δεν ανοίγει Στοά που έχει email
assert.equal(E.call({ action: 'login', lodge: '2', code: 'ABCD-1234' }).error, 'email_only');
// άγνωστο email: ίδια απάντηση, κανένα email
assert.ok(E.call({ action: 'lodge_otp_send', email: 'other@example.com' }).ok && E.mails.length === 0);
r = E.call({ action: 'lodge_otp_send', email: 'akropolis02@example.com' });
assert.ok(r.ok && E.mails.length === 1 && E.mails[0].to === 'akropolis02@example.com' && /Στοά «ΑΚΡΟΠΟΛΙΣ» Αρ\. 2/.test(E.mails[0].htmlBody), JSON.stringify(E.mails[0]).slice(0, 200));
const code = /(\d{6})/.exec(E.mails[0].subject)[1];
r = E.call({ action: 'lodge_otp_verify', email: 'akropolis02@example.com', code });
assert.ok(r.ok && r.session && r.lodges.length === 1 && r.lodges[0].number === '2', JSON.stringify(r));
const S = r.session;
r = E.call({ action: 'login', lodge: '2', session: S });
assert.ok(r.ok && r.members.length === 1, JSON.stringify(r));
assert.equal(E.call({ action: 'login', lodge: '104', session: S }).error, 'unauthorized', 'μόνο η Στοά του email');
const ms = r.members.map((m) => ({ ...m, mobile: '6900000002' }));
r = E.call({ action: 'save', lodge: '2', session: S, base_version: r.version, members: ms, note_type: 'Διόρθωση στοιχείων', by: 'Γραμματέας' });
assert.ok(r.ok && r.changes === 1, JSON.stringify(r));
assert.ok(/akropolis02@example\.com/.test(E.call({ action: 'admin_pull', key: 'k' }).changes[0].by));
// αλλαγή email της Στοάς από την εφαρμογή → το παλιό session παύει, το νέο email παίρνει κωδικό
E.call({ action: 'admin_ack', key: 'k', ids: E.call({ action: 'admin_pull', key: 'k' }).changes.map((c) => c.id) });
E.call({ action: 'admin_push', key: 'k', lodges: [L('2', 'ΑΚΡΟΠΟΛΙΣ', 'new2@example.com')] });
assert.equal(E.call({ action: 'login', lodge: '2', session: S }).error, 'unauthorized');
E.call({ action: 'lodge_otp_send', email: 'akropolis02@example.com' });
assert.equal(E.mails.length, 1 + 1 /* αλλαγή */, 'το παλιό email δεν παίρνει πια κωδικό');
E.call({ action: 'lodge_otp_send', email: 'new2@example.com' });
assert.equal(E.mails[E.mails.length - 1].to, 'new2@example.com');
console.log('lodge email login: OK');
