// node tests/gas/announcements.test.js — Αναγγελίες: αποθήκευση Γραμματέα → ένα email ανά μέλος προς Επαρχία + Μεγάλη Γραμματεία, με θέμα το είδος της αλλαγής
const assert = require('assert');
const { makeEnv, hash } = require('./harness');
const E = makeEnv();
E.props.ADMIN_KEY = 'k';
E.props.ANNOUNCE_EMAILS = 'gs@example.com';
const member = (id, sn, fn, degree, extra = {}) => ({ id, surname: sn, first_name: fn, email: '', mobile: '', degree, date_ea: '', date_fc: '', date_mm: '', ro: {}, lodge: { member_status: '1. ΤΑΚΤΙΚΟ', capacity: 'Τακτικό', fee_rank: '1', ...extra } });
const lodge = { meta: { number: '31', name: 'ΣΩΚΡΑΤΗΣ', provincial: 'ΕπΜΣτ. Πειραιώς', emails: ['sokr@example.com'], login_email: 'sokr@example.com', province_email: 'piraeus@example.com' },
  members: [member(1, 'Αλφαίος', 'Γεώργιος', 'Εταίρος'), member(2, 'Βήτας', 'Νικόλαος', 'Διδάσκαλος'), member(3, 'Γάμμας', 'Πέτρος', 'Διδάσκαλος')] };
assert.ok(E.call({ action: 'admin_push', key: 'k', lodges: [lodge], codes: {} }).ok);
E.call({ action: 'lodge_otp_send', email: 'sokr@example.com' });
const code = /(\d{6})/.exec(E.mails[0].subject)[1];
const S = E.call({ action: 'lodge_otp_verify', email: 'sokr@example.com', code }).session;
const r0 = E.call({ action: 'login', lodge: '31', session: S });
const ms = r0.members.map((m) => JSON.parse(JSON.stringify(m)));
ms[0].degree = 'Διδάσκαλος'; ms[0].date_mm = '2026-10-20';                    // ανύψωση
ms[1].lodge.member_status = 'ΔΙΑΓΡΑΦΕΝ'; ms[1].lodge.dereg_date = '2026-10-21'; // διαγραφή
ms[2].lodge.fee_rank = '2';                                                     // 1η → 2η Στοά συνδρομής
ms.push({ surname: 'Νέος', first_name: 'Μαθητής', degree: 'Μαθητής', date_ea: '2026-10-22', lodge: { member_status: '1. ΤΑΚΤΙΚΟ', capacity: 'Τακτικό' } });
E.mails.length = 0;
const r = E.call({ action: 'save', lodge: '31', session: S, base_version: r0.version, members: ms, note_type: 'Αναγγελία Διδασκάλου Τέκτονος', by: 'Γραμματέας' });
assert.ok(r.ok && r.changes === 4, JSON.stringify(r));
const ann = E.mails.filter((m) => /^Αναγγελία μέλους/.test(m.subject));
assert.equal(ann.length, 4, E.mails.map((m) => m.subject).join('\n'));
assert.ok(ann.every((m) => m.to === 'piraeus@example.com,gs@example.com'), ann.map((m) => m.to).join(' | '));
const subj = (n) => ann.find((m) => m.subject.includes(n)).subject;
assert.equal(subj('Αλφαίος'), 'Αναγγελία μέλους Αλφαίος Γεώργιος — Στοά ΣΩΚΡΑΤΗΣ 31 — Ανύψωση σε Διδάσκαλο');
assert.ok(/Βήτας Νικόλαος — Στοά ΣΩΚΡΑΤΗΣ 31 — Διαγραφή/.test(subj('Βήτας')), subj('Βήτας'));
assert.ok(/Στοά συνδρομής: 2η/.test(subj('Γάμμας')), subj('Γάμμας'));
assert.ok(/Νέος Μαθητής — .* — Εισδοχή \(νέο μέλος — Μαθητής\)/.test(subj('Νέος')), subj('Νέος'));
assert.ok(/<b>2026-10-20<\/b>/.test(ann.find((m) => m.subject.includes('Αλφαίος')).htmlBody));
// η αλλαγή για την εφαρμογή κρατά τις αναγγελίες· και υπάρχει πλήρες αντίγραφο του Μητρώου (έκδοση) πριν/μετά
const ch = E.call({ action: 'admin_pull', key: 'k' }).changes[0];
assert.ok(ch.announced.length === 4 && ch.announced_to.includes('gs@example.com'), JSON.stringify(ch).slice(0, 300));
const vs = E.call({ action: 'admin_versions', key: 'k', lodge: '31' }).versions;
assert.ok(vs.length === 2, JSON.stringify(vs));
console.log('announcements: OK');
