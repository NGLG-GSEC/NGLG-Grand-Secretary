// node tests/gas/lodge_portal.test.js — έλεγχος της ροής: δημοσίευση → σύνδεση Γραμματέα → αλλαγή → έκδοση + email → λήψη → επαναφορά
const assert = require('assert');
const { makeEnv, hash } = require('./harness');
const E = makeEnv();
E.props.ADMIN_KEY = 'admin-test';
const member = (id, sn, fn, extra = {}) => ({ id, surname: sn, first_name: fn, email: '', mobile: '', degree: 'Διδάσκαλος', date_ea: '', date_fc: '', date_mm: '', ro: { office: 'Σεβάσμιος', office_date: '2020-06-01' }, lodge: { member_status: '1. ΤΑΚΤΙΚΟ' }, ...extra });
const lodge = { meta: { number: '118', name: 'ΑΤΛΑΣ', provincial: 'ΕπΜΣτ. Πειραιώς', emails: ['atlas@example.com'] }, members: [member(1, 'Α', 'Β'), member(2, 'Γ', 'Δ')] };

assert.equal(E.call({ action: 'admin_push', key: 'wrong', lodges: [] }).error, 'admin_unauthorized');
let r = E.call({ action: 'admin_push', key: 'admin-test', lodges: [lodge], codes: { 118: hash('118', 'ABCD-1234') } });
assert.ok(r.ok && r.written === 1, JSON.stringify(r));
r = E.call({ action: 'admin_push', key: 'admin-test', lodges: [lodge] });
assert.equal(r.written, 0, 'ίδια δεδομένα: καμία νέα έκδοση');

assert.equal(E.call({ action: 'login', lodge: '118', code: 'λάθος' }).error, 'unauthorized');
r = E.call({ action: 'login', lodge: '118', code: 'abcd-1234' });
assert.ok(r.ok && r.members.length === 2 && r.version === 1 && r.lodge.name === 'ΑΤΛΑΣ', JSON.stringify(r));
assert.ok(/^ΕνημέρωσηΜΓΣτοά118έκδοση1-\d+[Α-Ωα-ωΐ]+\d\d$/.test(r.version_name), r.version_name);

const ms = r.members.map((m) => ({ ...m }));
ms[0] = { ...ms[0], mobile: '6900000001', lodge: { ...ms[0].lodge, member_status: 'ΔΙΑΓΡΑΦΕΝ' }, ro: { office: 'ΧΑΚΕΡ' }, registry_no: 999 };
ms.push({ surname: 'Νέος', first_name: 'Μαθητής', degree: 'Μαθητής', date_ea: '2026-10-20', lodge: { member_status: '1. ΤΑΚΤΙΚΟ' } });
r = E.call({ action: 'save', lodge: '118', code: 'ABCD-1234', base_version: 1, members: ms, note_type: 'Αναγγελία Εισδοχής', note: 'Μύηση 20/10', by: 'Γραμματέας' });
assert.ok(r.ok && r.changes === 2 && /^ΑλλαγήΣτοά118έκδοση2-/.test(r.version_name), JSON.stringify(r));
assert.equal(E.mails.length, 1);
assert.equal(E.mails[0].subject, 'Στοά ΑΤΛΑΣ 118 - Αλλαγή στο Μητρώο');
assert.ok(E.mails[0].to === 'atlas@example.com' && /Αναγγελία Εισδοχής — Μύηση 20\/10/.test(E.mails[0].body) && /ΝΕΟ ΜΕΛΟΣ: Νέος Μαθητής/.test(E.mails[0].body) && /Κινητό: — → 6900000001/.test(E.mails[0].body), E.mails[0].body);
assert.equal(E.call({ action: 'save', lodge: '118', code: 'ABCD-1234', base_version: 1, members: ms }).error, 'conflict');

r = E.call({ action: 'login', lodge: '118', code: 'ABCD-1234' });
assert.equal(r.members[0].ro.office, 'Σεβάσμιος', 'τα πεδία μόνο-ανάγνωσης δεν αλλάζουν');
assert.equal(r.members.length, 3);

// η εφαρμογή δεν πατά αλλαγή που δεν έχει λάβει
r = E.call({ action: 'admin_push', key: 'admin-test', lodges: [lodge] });
assert.deepEqual(r.skipped, ['118']);
r = E.call({ action: 'admin_pull', key: 'admin-test' });
assert.equal(r.changes.length, 1);
const ch = r.changes[0];
assert.ok(ch.lodge === '118' && ch.note_type === 'Αναγγελία Εισδοχής' && ch.changes.length === 2 && ch.changes.some((c) => c.is_new));
assert.deepEqual(ch.changes.find((c) => c.id === 1).fields.member_status, ['1. ΤΑΚΤΙΚΟ', 'ΔΙΑΓΡΑΦΕΝ']);
assert.equal(E.call({ action: 'admin_ack', key: 'admin-test', ids: [ch.id] }).acked, 1);
assert.equal(E.call({ action: 'admin_pull', key: 'admin-test' }).changes.length, 0);

// επαναφορά στην έκδοση 1: ο 1 ξαναγίνεται ενεργός, ο νέος μένει
r = E.call({ action: 'admin_versions', key: 'admin-test', lodge: '118' });
assert.deepEqual(r.versions.map((v) => v.version), [2, 1]);
r = E.call({ action: 'admin_restore', key: 'admin-test', lodge: '118', version: 1 });
assert.ok(r.ok && /^ΕπαναφοράΣτοά118έκδοση3-/.test(r.version_name) && r.changes === 1, JSON.stringify(r));
r = E.call({ action: 'login', lodge: '118', code: 'ABCD-1234' });
assert.equal(r.members.length, 3);
assert.equal(r.members.find((m) => m.id === 1).lodge.member_status, '1. ΤΑΚΤΙΚΟ');
assert.equal(E.call({ action: 'admin_pull', key: 'admin-test' }).changes[0].source, 'restore');

// πολλοί λάθος κωδικοί → κλείδωμα
for (let i = 0; i < 8; i++) E.call({ action: 'login', lodge: '2', code: 'x' });
assert.equal(E.call({ action: 'login', lodge: '2', code: 'x' }).error, 'too_many_tries');
console.log('lodge portal Apps Script: OK');
