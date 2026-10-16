// Επαφές Google (εξαγωγή «Google CSV» από το Google Contacts): μεμονωμένες επαφές και ομάδες (ετικέτες, π.χ. «Μ.Αξ.2026», «ΔΙΟΙΚΗΣΗ»).
// Τα στοιχεία αποθηκεύονται μόνο στο ιδιωτικό αποθετήριο δεδομένων. Χρησιμοποιούνται στους παραλήπτες των Επιστολών
// (Προς, Email παραλήπτη, Κοιν.) και σε κάθε αναζήτηση επαφής.
import { db } from '../core/store.js';
import { module, bind, go, flash, toast, confirmDo, table } from '../core/app.js';
import { esc, matches, sortBy, EMAIL_RE } from '../core/util.js';
import { addContactSource, titledName, noContact } from '../core/pickers.js';
import { identify, person } from '../core/people.js';
import { emailHash } from './settings.js';

const SKIP_LABELS = /^\*\s*(myContacts|starred)$/i;
const REMOVED = ['7da049a6']; // διευθύνσεις που αφαιρέθηκαν από Κοιν./Bcc (αποτύπωμα) — δεν μπαίνουν σε ομαδικές αποστολές
const removed = (e) => REMOVED.includes(emailHash(e));

// CSV με εισαγωγικά και αλλαγές γραμμής μέσα σε πεδία
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const t = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"' && cell === '') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
const split3 = (v) => String(v || '').split(/\s*:::\s*/).map((x) => x.trim()).filter(Boolean);
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Google CSV → [{ name, title, org, emails, phones, labels }]
export function contactsFromGoogleCsv(text) {
  const [head, ...rows] = parseCsv(text);
  if (!head) return [];
  const H = head.map((h) => clean(h).toLowerCase()), col = (r, n) => { const i = H.indexOf(n.toLowerCase()); return i >= 0 ? r[i] || '' : ''; };
  const multi = (r, kind) => H.map((h, i) => (new RegExp(`^${kind} \\d+ - value$`).test(h) ? split3(r[i]) : [])).flat();
  return rows.map((r) => {
    const first = clean(col(r, 'First Name')), mid = clean(col(r, 'Middle Name')), last = clean(col(r, 'Last Name'));
    const emails = [...new Set(multi(r, 'e-mail').filter((e) => EMAIL_RE.test(e)).map((e) => e.trim()))];
    const name = clean([first, mid, last].filter(Boolean).join(' ')) || clean(col(r, 'File As')) || clean(col(r, 'Nickname')) || emails[0] || '';
    return {
      name, title: clean(col(r, 'Organization Title')), org: clean(col(r, 'Organization Name')),
      emails, phones: [...new Set(multi(r, 'phone').map(clean))],
      labels: split3(col(r, 'Labels')).filter((l) => !SKIP_LABELS.test(l)),
    };
  }).filter((c) => c.name && c.emails.length);
}

const list = (v) => (Array.isArray(v) ? v : String(v || '').split(/\s*[,;]\s*/).filter(Boolean));
// Ενιαίο Μητρώο: η επαφή που είναι μέλος συνδέεται με αυτό· email και όνομα (με τίτλο) έρχονται από το Μητρώο
const memberOf = (c) => { const p = c.member_id ? person(c.member_id) : null; return p && !noContact(p.member) ? p : null; };
export const contactEmail = (c) => { const p = memberOf(c); return (p && p.email) || list(c.emails)[0] || ''; };
export const contactName = (c) => { const p = memberOf(c); return p ? titledName(p.member) : (c.title ? `${c.name}, ${c.title}` : c.name); };
const linkMember = (c, tx) => identify({ email: list(c.emails)[0], full_name: c.name }, tx) || list(c.emails).slice(1).map((e) => identify({ email: e }, tx)).find(Boolean) || null;
export const contactsAll = () => sortBy(db.all('contacts'), (c) => c.name);
export function contactGroups() {
  const g = {};
  for (const c of contactsAll()) for (const l of list(c.labels)) (g[l] ||= []).push(c);
  return Object.entries(g).sort(([a], [b]) => a.localeCompare(b, 'el')).map(([name, members]) => ({
    name, members, emails: [...new Set(members.map(contactEmail).filter((e) => e && !removed(e)))],
  }));
}

// Συγχώνευση: ίδια επαφή = ίδιο όνομα και ίδιο πρώτο email → ενημέρωση (ένωση ετικετών/τηλεφώνων)
export async function importContacts(lists) {
  const all = lists.flat(), key = (c) => `${clean(c.name).toLowerCase()}|${String(list(c.emails)[0] || '').toLowerCase()}`;
  let added = 0, updated = 0;
  await db.save(`Επαφές Google: εισαγωγή ${all.length}`, (tx) => {
    const cur = new Map(tx.all('contacts').map((c) => [key(c), c]));
    for (const c of all) {
      const k = key(c), old = cur.get(k);
      const row = { name: c.name, title: c.title, org: c.org, emails: list(c.emails).join(', '), phones: list(c.phones).join(', '), labels: list(c.labels).join(', '), member_id: linkMember(c, tx) };
      if (old) {
        const merged = { ...row, emails: [...new Set([...list(old.emails), ...list(c.emails)])].join(', '), phones: [...new Set([...list(old.phones), ...list(c.phones)])].join(', '),
          labels: [...new Set([...list(old.labels), ...list(c.labels)])].join(', '), title: c.title || old.title, org: c.org || old.org };
        tx.update('contacts', old.id, merged); cur.set(k, { ...old, ...merged }); updated++;
      } else { const r = tx.insert('contacts', row); cur.set(k, r); added++; }
    }
  });
  return { added, updated };
}

// Ομάδες και επαφές στις αναζητήσεις παραληπτών (Προς, Email, Κοιν.)
addContactSource(() => [
  ...contactGroups().map((g) => ({ name: g.name, email: g.emails.join(', '), sub: `👥 Ομάδα επαφών · ${g.emails.length} email` })),
  ...contactsAll().filter((c) => !c.member_id).map((c) => ({ name: contactName(c), email: contactEmail(c), sub: ['Επαφή Google', c.org].filter(Boolean).join(' · ') })), // τα μέλη βρίσκονται ήδη από το Μητρώο
]);

function contactsPage({ query }) {
  const gs = contactGroups(), sel = query.g || '';
  let xs = contactsAll();
  if (sel) xs = xs.filter((c) => list(c.labels).includes(sel));
  if (query.q) xs = xs.filter((c) => matches(query.q, c.name, c.emails, c.title, c.org, c.labels));
  return {
    title: 'Επαφές',
    html: `<h1>👥 Επαφές & Ομάδες</h1>
<div class="card"><h2 style="margin-top:0">Εισαγωγή από Google Contacts</h2>
<p class="muted">Στο <a href="https://contacts.google.com" target="_blank" rel="noopener">Google Contacts</a>: επιλογή επαφών ή ετικέτας → «Εξαγωγή» → <b>Google CSV</b>. Μπορείτε να επιλέξετε πολλά αρχεία μαζί.
Οι ετικέτες (π.χ. «Μ.Αξ.2026», «ΔΙΟΙΚΗΣΗ») γίνονται <b>ομάδες</b>· οι ίδιες επαφές δεν διπλασιάζονται.</p>
<input type="file" id="gcsv" accept=".csv,text/csv" multiple> <button class="btn primary" data-act="imp">⬆ Εισαγωγή</button></div>
<div class="card"><h2 style="margin-top:0">Ομάδες (${gs.length})</h2><div class="chips">${gs.map((g) => `<a class="pill${g.name === sel ? ' ok' : ''}" href="#/contacts?g=${encodeURIComponent(g.name)}">${esc(g.name)} · ${g.emails.length}</a>`).join(' ') || '<span class="muted">Καμία ακόμη.</span>'}${sel ? ' <a class="btn small" href="#/contacts">Όλες</a>' : ''}</div></div>
<form class="toolbar" id="cq"><input name="q" value="${esc(query.q || '')}" placeholder="🔎 Αναζήτηση επαφής…"><button class="btn">Αναζήτηση</button>${xs.length && sel ? `<button type="button" class="btn" data-act="copy">📋 Αντιγραφή email ομάδας</button>` : ''}</form>
${table(['Ονοματεπώνυμο', 'Τίτλος / Οργανισμός', 'Email', 'Τηλέφωνο', 'Ομάδες', ''], xs.map((c) => [esc(c.name) + (memberOf(c) ? `<br><a class="pill ok" href="#/members/${memberOf(c).id}">✓ Μητρώο: ${esc(titledName(memberOf(c).member))}</a>` : ''), esc([c.title, c.org].filter(Boolean).join(' · ')), esc(contactEmail(c)) + (memberOf(c) ? '<br><small class="muted">από το Μητρώο</small>' : ''), esc(c.phones), esc(c.labels),
  `<button class="btn small danger" data-act="del" data-id="${c.id}">✕</button>`]))}
${contactsAll().length ? '<p><button class="btn danger" data-act="delall">Διαγραφή όλων των επαφών</button></p>' : ''}`,
    mount(el) {
      el.querySelector('#cq').addEventListener('submit', (e) => { e.preventDefault(); go('/contacts', { ...query, q: e.target.q.value }); });
      bind(el, {
        async imp() {
          const fs = [...el.querySelector('#gcsv').files];
          if (!fs.length) { toast('Επιλέξτε αρχείο CSV.', 'error'); return; }
          const lists = await Promise.all(fs.map(async (f) => contactsFromGoogleCsv(await f.text())));
          if (!lists.flat().length) { toast('Δεν βρέθηκαν επαφές με email στα αρχεία.', 'error'); return; }
          const r = await importContacts(lists);
          flash(`Επαφές: ${r.added} νέες, ${r.updated} ενημερώθηκαν.`); go('/contacts');
        },
        async copy() { const g = gs.find((x) => x.name === sel); await navigator.clipboard.writeText(g ? g.emails.join(', ') : ''); toast('Αντιγράφηκαν.'); },
        async del(d) { await db.save('Διαγραφή επαφής', (tx) => tx.remove('contacts', Number(d.id))); go('/contacts', query); },
        async delall() { if (!confirmDo('Διαγραφή όλων των επαφών;')) return; await db.save('Διαγραφή επαφών', (tx) => tx.replace('contacts', [])); go('/contacts'); },
      });
    },
  };
}

db.migrate('contacts-link-registry-2026-10', (tx) => { for (const c of tx.all('contacts')) if (!c.member_id) { const mid = linkMember(c, tx); if (mid) tx.update('contacts', c.id, { member_id: mid }); } });

module({ id: 'contacts', routes: { '/contacts': contactsPage } });
