// node tests/gas/lodge_portal_admin.test.js — σύνδεση διαχειριστή της Πύλης: κωδικός email (OTP) και «Σύνδεση με Google» (μόνο super admin)
const assert = require('assert');
const { makeEnv } = require('./harness');
const E = makeEnv();
E.props.SUPER_ADMINS = 'super@example.com';
E.props.ADMIN_EMAILS = 'gs@example.com, second@example.com';
E.props.GOOGLE_CLIENT_ID = 'cid.apps.googleusercontent.com';

// χωρίς κλειδί/σύνδεση: όχι
assert.equal(E.call({ action: 'admin_status' }).error, 'admin_unauthorized');
assert.equal(E.call({ action: 'admin_status', key: 'x' }).error, 'admin_unauthorized', 'χωρίς ADMIN_KEY κανένα κλειδί δεν περνά');

// OTP: άγνωστο email → ίδια απάντηση, κανένα email
let r = E.call({ action: 'admin_otp_send', email: 'stranger@example.com' });
assert.ok(r.ok && r.sent && E.mails.length === 0);
// διαχειριστής: 6ψήφιος κωδικός στο email του
r = E.call({ action: 'admin_otp_send', email: 'GS@example.com ' });
assert.ok(r.ok && E.mails.length === 1 && E.mails[0].to === 'gs@example.com', JSON.stringify(E.mails));
const code = /(\d{6})/.exec(E.mails[0].subject)[1];
assert.equal(E.call({ action: 'admin_otp_verify', email: 'gs@example.com', code: code === '000000' ? '111111' : '000000' }).error, 'otp_wrong');
r = E.call({ action: 'admin_otp_verify', email: 'gs@example.com', code });
assert.ok(r.ok && r.session && r.role === 'admin' && r.email === 'gs@example.com', JSON.stringify(r));
assert.equal(E.call({ action: 'admin_otp_verify', email: 'gs@example.com', code }).error, 'otp_expired', 'ο κωδικός ισχύει μία φορά');
const s1 = r.session;
r = E.call({ action: 'admin_status', session: s1 });
assert.ok(r.ok && r.who === 'gs@example.com' && r.role === 'admin', JSON.stringify(r));
assert.ok(E.call({ action: 'admin_pull', session: s1 }).ok);
assert.equal(E.call({ action: 'admin_pull', session: 'x'.repeat(40) }).error, 'admin_unauthorized');

// όριο λάθος προσπαθειών
E.call({ action: 'admin_otp_send', email: 'second@example.com' });
for (let i = 0; i < 5; i++) E.call({ action: 'admin_otp_verify', email: 'second@example.com', code: '99999' + i });
const c2 = /(\d{6})/.exec(E.mails[E.mails.length - 1].subject)[1];
assert.equal(E.call({ action: 'admin_otp_verify', email: 'second@example.com', code: c2 }).error, 'otp_expired', 'μετά από 5 λάθη ο κωδικός ακυρώνεται');

// Google: απευθείας μόνο για super admin, με token της εφαρμογής (ίδιο Client ID)
E.tokens.good = { aud: 'cid.apps.googleusercontent.com', email: 'super@example.com', email_verified: 'true', expires_in: '3500' };
E.tokens.other = { aud: 'other-app', email: 'super@example.com', email_verified: 'true', expires_in: '3500' };
E.tokens.admin = { aud: 'cid.apps.googleusercontent.com', email: 'gs@example.com', email_verified: 'true', expires_in: '3500' };
assert.equal(E.call({ action: 'admin_google', access_token: 'other' }).error, 'admin_unauthorized');
assert.equal(E.call({ action: 'admin_google', access_token: 'bad' }).error, 'admin_unauthorized');
assert.equal(E.call({ action: 'admin_google', access_token: 'admin' }).error, 'not_super_admin');
r = E.call({ action: 'admin_google', access_token: 'good' });
assert.ok(r.ok && r.role === 'super' && r.session, JSON.stringify(r));
assert.equal(E.call({ action: 'admin_status', session: r.session }).role, 'super');

// αφαίρεση από τη λίστα → η σύνδεση παύει αμέσως
E.props.ADMIN_EMAILS = 'second@example.com';
assert.equal(E.call({ action: 'admin_status', session: s1 }).error, 'admin_unauthorized');

// το παλιό κλειδί ADMIN_KEY εξακολουθεί να λειτουργεί
E.props.ADMIN_KEY = 'k-123';
assert.equal(E.call({ action: 'admin_status', key: 'k-123' }).role, 'key');
// doGet: μόνο πλήθη, όχι email
const g = JSON.parse(E.ctx.doGet().text);
assert.ok(g.version >= 2 && g.superAdmins === 1 && g.adminEmails === 1 && !JSON.stringify(g).includes('@'), JSON.stringify(g));
console.log('lodge portal admin: OK');
