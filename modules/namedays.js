// Εορτολόγιο — εορτάζοντες μέλη (σταθερές και κινητές εορτές από το Πάσχα), ευχές με «πλακέτα» ΕΜΣτΕ ανά πρόσωπο
// (σωστή προσφώνηση από το αξίωμα, κρυφή κοινοποίηση στην Επαρχία), ιστορικό ευχών, αναφορά στον ΜΔ, εορτολόγιο ονομάτων.
import { db } from '../core/store.js';
import { module, onSubmit, go, bind, notice, toast, table } from '../core/app.js';
import { crud } from '../core/crud.js';
import { esc, foldName, today, addDays, parseIso, isoDate, dayStr, fmtDate, sortBy, EMAIL_RE, splitEmails, exportXlsx, DAYS } from '../core/util.js';
import { senderBanner, gmailUrl, copyHtml, mailButtons } from '../core/mail.js';
import { reportPaper, printPaper } from '../core/paper.js';
import { noContact } from '../core/pickers.js';
import { lodgesByMember, memberLodgesLine } from './members.js';
import { lodgeByNumber } from './lodges.js';
import { provinceByShort, provinceRoles, provincesAll } from './provinces.js';
import { repRank, REP_RANKS } from './visits.js';

const RULES = { '': '—', george: 'Αγ. Γεωργίου (μετά το Πάσχα αν πέφτει πριν)', mark: 'Αγ. Μάρκου (μετά το Πάσχα αν πέφτει πριν)' };
const RK = ['Αδ.', 'Σεβ.', 'Λίαν Σεβ.', 'Πσεβ.', 'Σεβτ.'], TITLE = ['Αδ.', 'Σεβ. Αδ.', 'Λίαν Σεβ. Αδ.', 'Πσεβ. Αδ.', 'Σεβτ. Αδ.'];
const VOC = ['Αδελφέ', 'Σεβάσμιε Αδελφέ', 'Λίαν Σεβάσμιε Αδελφέ', 'Πανσεβάσμιε Αδελφέ', 'Σεβασμιώτατε Αδελφέ'];
const SUBJECT_DEFAULT = 'Χρόνια πολλά για την ονομαστική σας εορτή';
const BODY_DEFAULT = 'Προς: {Τίτλος} {Όνομα} {Επώνυμο}\n\nΑγαπητέ {Προσφώνηση},\n\nΣας μεταφέρω, με ιδιαίτερη χαρά, τις θερμότερες ευχές του Σεβτ. Αδ. Ιωάννη Μπενετάτου, Μεγάλου Διδασκάλου της Εθνικής Μεγάλης Στοάς της Ελλάδος, για την ονομαστική σας εορτή.\n\nΕύχεται από καρδιάς υγεία, χαρά, οικογενειακή ευτυχία και κάθε καλό στη ζωή και στο έργο σας.\n\nΟ Μέγας Γραμματεύς\nΠσεβ. Αδ. Δημήτριος Σκιαδόπουλος';
db.defaultSettings({ greet_subject: SUBJECT_DEFAULT, greet_body: BODY_DEFAULT, greet_bcc_self: '' });

const ndKey = (first) => (first ? foldName(String(first).split(' ')[0].split('-')[0]) : '');
db.seed('namedays', async () => {
  const xs = await (await fetch('seed/namedays.json')).json();
  return xs.map((x, i) => ({ id: i + 1, name: x.name, name_key: ndKey(x.name), official: x.official || '', md: x.md || '', easter: x.easter ?? null, rule: x.rule || '', note: x.note || '' }));
});
db.seed('greetings_log', () => []);
// Εφάπαξ: συμπλήρωση του εορτολογίου (ονόματα χωρίς ημερομηνία, χαϊδευτικά, ξενόγλωσσα) από seed/namedays-complete.json.
// Ονόματα που έχουν ήδη ημερομηνία (π.χ. διορθωμένα από τον χρήστη) δεν αλλάζουν.
db.migrate('namedays-complete-2026-10', async (tx) => {
  const xs = await (await fetch('seed/namedays-complete.json')).json();
  for (const x of xs) {
    const k = ndKey(x.name), row = { official: x.official || x.name, md: x.md || '', easter: x.easter ?? null, rule: x.rule || '' };
    const ex = tx.all('namedays').filter((n) => n.name_key === k);
    if (!ex.length) tx.insert('namedays', { name: x.name, name_key: k, ...row, note: 'Συμπληρωματικό εορτολόγιο' });
    else for (const n of ex) if (!n.md && (n.easter == null || n.easter === '')) tx.update('namedays', n.id, { ...row, note: '' });
  }
});

export function orthodoxEaster(y) {
  const a = y % 4, b = y % 7, c = y % 19, d = (19 * c + 15) % 30, e = (2 * a + 4 * b - d + 34) % 7, mo = Math.floor((d + e + 114) / 31), da = ((d + e + 114) % 31) + 1;
  const r = new Date(y, mo - 1, da); r.setDate(r.getDate() + 13); return r;
}
export function namedayIn(it, y) {
  if (it.easter != null && it.easter !== '' && /^-?\d+$/.test(String(it.easter))) { const d = orthodoxEaster(y); d.setDate(d.getDate() + Number(it.easter)); return d; }
  if (!/^\d{2}-\d{2}$/.test(it.md || '')) return null;
  const [m, dd] = it.md.split('-').map(Number), d = new Date(y, m - 1, dd);
  if (d.getMonth() !== m - 1) return null;
  const E = orthodoxEaster(y);
  if (it.rule === 'george' && d < E) { const x = new Date(E); x.setDate(x.getDate() + 1); return x; }
  if (it.rule === 'mark' && d < E) { const x = new Date(E); x.setDate(x.getDate() + 2); return x; }
  return d;
}
const label = (it) => it.official || it.name || '';
export const greetEmail = (m) => noContact(m) ? '' : [m.email || '', ...splitEmails(m.other_emails)].map((e) => e.trim()).find((e) => EMAIL_RE.test(e)) || '';
const sentMap = () => Object.fromEntries(db.all('greetings_log').filter((g) => g.member_id).map((g) => [`${g.member_id}|${g.feast_date}`, g.sent_on]));

const hasDay = (it) => !!it && (/^\d{2}-\d{2}$/.test(it.md || '') || (it.easter != null && it.easter !== '' && /^-?\d+$/.test(String(it.easter))));
// Ένα όνομα → η εγγραφή με ημερομηνία (οι σύνθετες χωρίς ημερομηνία δεν «κρύβουν» την κύρια)
function namedayIndex() {
  const idx = {};
  for (const it of sortBy(db.all('namedays'), 'name_key')) if (!idx[it.name_key] || (!hasDay(idx[it.name_key]) && hasDay(it))) idx[it.name_key] = it;
  return idx;
}
// Κάλυψη: πόσα ενεργά μέλη του Μητρώου έχουν γνωστή ονομαστική εορτή, και ποια ονόματα λείπουν
export function coverage() {
  const idx = namedayIndex(), ms = db.all('member_registry').filter((x) => x.active !== 0 && !noContact(x)), miss = {};
  let ok = 0;
  for (const m of ms) { if (hasDay(idx[ndKey(m.first_name)])) ok++; else { const n = String(m.first_name || '').split(' ')[0].trim(); if (n) miss[n] = (miss[n] || 0) + 1; } }
  return { members: ms.length, ok, missing: Object.entries(miss).sort((a, b) => b[1] - a[1]) };
}

// Κενό διάστημα: ποια ονόματα εορτάζουν τότε (ώστε να φαίνεται ότι ο έλεγχος έγινε) και ποιοι είναι οι επόμενοι εορτάζοντες
function emptyRange(frm, to) {
  const d0 = parseIso(frm), d1 = parseIso(to), names = [];
  for (const it of db.all('namedays')) for (let y = d0.getFullYear(); y <= d1.getFullYear(); y++) { const d = namedayIn(it, y); if (d && d >= d0 && d <= d1) names.push(`${label(it)} (${fmtDate(isoDate(d)).slice(0, 5)})`); }
  const next = celebrants(addDays(to, 1), addDays(to, 120)).slice(0, 6);
  return `<div class="card"><b>Κανένα ενεργό μέλος του Μητρώου δεν εορτάζει σε αυτό το διάστημα.</b>
<p class="muted">Ονόματα που εορτάζουν τότε: ${esc([...new Set(names)].join(', ') || '—')}.</p>
${next.length ? `<p>Επόμενοι εορτάζοντες: ${next.map((g) => `<a href="#/namedays?frm=${g.date}&to=${g.date}">${esc(fmtDate(g.date).slice(0, 5))} ${esc(g.label)} (${g.members.length})</a>`).join(' · ')}</p>` : ''}</div>`;
}

export function celebrants(frm, to) {
  const idx = namedayIndex();
  const d0 = parseIso(frm), d1 = parseIso(to), groups = {}, byM = lodgesByMember();
  for (const m of db.all('member_registry').filter((x) => x.active !== 0 && !noContact(x))) {
    const it = idx[ndKey(m.first_name)];
    if (!it) continue;
    for (let y = d0.getFullYear(); y <= d1.getFullYear(); y++) {
      const d = namedayIn(it, y);
      if (!d || d < d0 || d > d1) continue;
      const k = isoDate(d) + '|' + label(it);
      (groups[k] ||= { date: isoDate(d), label: label(it), movable: it.easter != null || !!it.rule, members: [] }).members.push({ ...m, lodges: byM[m.id] || [] });
    }
  }
  const out = sortBy(Object.values(groups), 'date', (g) => foldName(g.label));
  for (const g of out) g.members = sortBy(g.members, (m) => foldName(m.surname), (m) => foldName(m.first_name));
  return out;
}

// Προσφώνηση: από τον υψηλότερο βαθμό (εκπρόσωπος, Επετηρίδα, Σεβάσμιος Στοάς)
function rankIdx(m) {
  let k = -1;
  for (const r of db.all('reps').filter((r) => r.member_id === m.id)) { const rk = repRank(r); if (REP_RANKS.includes(rk)) k = Math.max(k, REP_RANKS.indexOf(rk)); }
  for (const o of db.all('member_degrees_offices').filter((o) => o.member_id === m.id)) { k = Math.max(k, 0); const rk = repRank({ office: o.office || '' }); if (rk) k = Math.max(k, REP_RANKS.indexOf(rk)); }
  const names = [foldName(`${m.first_name} ${m.surname}`), foldName(`${m.surname} ${m.first_name}`)];
  if (db.all('lodges').some((l) => l.master && names.includes(foldName(l.master)))) k = Math.max(k, 0);
  return k;
}
function bccProvince(m, own = '') {
  const out = [];
  for (const l of m.lodges || []) {
    if (String(l.member_status || '').toUpperCase().includes('ΔΙΑΓΡΑΦ')) continue;
    const p = provinceByShort((lodgeByNumber(l.lodge_number || '') || {}).provincial || '');
    if (!p) continue;
    for (const e of [p.email || '', provinceRoles(p)[0].email]) if (e && EMAIL_RE.test(e) && e.toLowerCase() !== own.toLowerCase() && !out.includes(e)) out.push(e);
  }
  return out;
}
const fill = (t, m, rk, lbl, d) => t.replaceAll('{Προσφώνηση}', VOC[rk + 1]).replaceAll('{Τίτλος}', TITLE[rk + 1]).replaceAll('{Όνομα}', m.first_name || '').replaceAll('{Επώνυμο}', m.surname || '').replaceAll('{Εορτή}', lbl || '').replaceAll('{Ημερομηνία}', dayStr(d));
const PLAQUE = '<table width="100%" cellpadding="0" cellspacing="0" style="border:6px ridge #c9a54e;border-collapse:separate;margin:0 0 26px"><tr><td bgcolor="#14234a" align="center" style="background-color:#14234a;padding:6px">'
  + '<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#14234a" style="border:1px solid #c9a54e;border-collapse:separate;background-color:#14234a"><tr><td align="center" bgcolor="#14234a" style="padding:12px 10px 12px;text-align:center;background-color:#14234a">'
  + '<div style="color:#c9a54e;font-size:12px;letter-spacing:8px">✦ ✦ ✦</div><div style="font-family:Georgia,\'Times New Roman\',serif;font-size:27px;font-weight:bold;letter-spacing:5px;line-height:1.3;color:#f0d78c;margin-top:4px">ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ</div>'
  + '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:20px;font-weight:bold;letter-spacing:8px;line-height:1.4;color:#f0d78c">ΤΗΣ ΕΛΛΑΔΟΣ</div><div style="color:#c9a54e;font-size:12px;letter-spacing:8px;margin-top:4px">✦ ✦ ✦</div></td></tr></table></td></tr></table>';
export function greetHtml(text) {
  const ps = esc(text.trim()).split(/\n{2,}/), last = ps.length - 1;
  const out = ps.map((p, i) => {
    p = p.replace('Σεβτ. Αδ. Ιωάννη Μπενετάτου', '<b style="color:#1f3f8f">Σεβτ. Αδ. Ιωάννη Μπενετάτου</b>');
    const br = p.replace(/\n/g, '<br>');
    if (/^Προς(\s|:)/.test(p)) return `<p style="margin:0 0 20px;font-size:18px"><span style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#7a6a3a">Προς</span><br><b style="color:#1d2f5e">${br.replace(/^Προς\s*:?\s*/, '')}</b></p>`;
    if (i === last && last > 1) { const [t, ...rest] = p.split('\n'); return `<p style="margin:30px 0 0;text-align:right;line-height:1.5">${rest.length ? `<span style="font-style:italic;color:#4a5068">${t}</span><br><b>${rest.join('<br>')}</b>` : t}</p>`; }
    return `<p style="margin:0 0 14px;${p.startsWith('Αγαπητ') ? '' : 'text-align:justify'}">${br}</p>`;
  }).join('');
  return `<div style="max-width:620px;margin:0 auto;font-family:Georgia,'Times New Roman',serif;color:#1b1f2a;font-size:16px;line-height:1.6">${PLAQUE}${out}</div>`;
}

function range(q) {
  const t = today(), frm = parseIso(q.frm) ? q.frm : t, to = parseIso(q.to) ? q.to : addDays(t, 30);
  return [frm, to < frm ? frm : to];
}

function listPage({ query }) {
  const [frm, to] = range(query), sent = sentMap();
  const gs = celebrants(frm, to).map((g) => ({ ...g, members: g.members.filter((m) => (!query.mail || greetEmail(m)) && !(query.hide && sent[`${m.id}|${g.date}`])) })).filter((g) => g.members.length);
  const cov = coverage();
  const covHtml = !cov.members ? '<div class="card nocontact">Το Μητρώο Μελών είναι κενό σε αυτή τη βάση — κάντε πρώτα «Εισαγωγή μελών» (Μητρώα → Μητρώο Μελών).</div>'
    : `<p class="muted">Μητρώο: <b>${cov.members}</b> ενεργά μέλη · <b>${cov.ok}</b> με γνωστή ονομαστική εορτή${cov.missing.length ? ` · <b>${cov.members - cov.ok}</b> χωρίς (π.χ. ${cov.missing.slice(0, 12).map(([n, c]) => `${esc(n)} ${c}`).join(', ')}) — <a href="#/namedays/calendar">συμπλήρωση στο Εορτολόγιο ονομάτων</a>` : ''}.</p>`;
  const people = gs.reduce((s, g) => s + g.members.length, 0), withMail = gs.reduce((s, g) => s + g.members.filter(greetEmail).length, 0);
  let last = '';
  const body = gs.map((g) => {
    const head = g.date !== last ? `<h2 class="ndday">${esc(dayStr(g.date))}${g.date === today() ? ' · Σήμερα' : ''}</h2>` : '';
    last = g.date;
    const rows = g.members.map((m) => [greetEmail(m) ? `<input type="checkbox" name="k" value="${m.id}|${g.date}|${esc(g.label)}" style="width:auto">` : '',
      `<b>${esc(m.surname)}</b> ${esc(m.first_name)}${sent[`${m.id}|${g.date}`] ? ` <span class="vok">✓ Ευχές ${esc(fmtDate(sent[`${m.id}|${g.date}`]))}</span>` : ''}`,
      `<span class="muted">${esc(memberLodgesLine(m.lodges))}</span>`, esc(m.mobile || '—'), esc(greetEmail(m) || '—')]);
    return `${head}<div class="card" style="margin:8px 0"><h3 style="margin-top:0">${esc(g.label)} <small class="muted">${g.members.length} ${g.members.length === 1 ? 'μέλος' : 'μέλη'}${g.movable ? ' · κινητή εορτή' : ''}</small></h3>${table(['✓', 'Ονοματεπώνυμο', 'Στοές', 'Κινητό', 'Email'], rows)}</div>`;
  }).join('') || emptyRange(frm, to);
  return {
    title: 'Εορτολόγιο',
    html: `<h1>🎉 Εορτολόγιο</h1>${notice(query.msg)}${covHtml}<div class="toolbar"><a class="btn" href="#/namedays/report">Αναφορά ευχών σήμερα (ΜΔ)</a><button class="btn" data-act="xlsx">⬇ Excel εορταζόντων</button><a class="btn" href="#/namedays/calendar">Εορτολόγιο ονομάτων</a></div>
<form class="card ndf" id="flt"><label>Από <input type="date" name="frm" value="${esc(frm)}"></label><label>Έως <input type="date" name="to" value="${esc(to)}"></label>
<label><input type="checkbox" name="mail"${query.mail ? ' checked' : ''}> Μόνο με email</label><label><input type="checkbox" name="hide"${query.hide ? ' checked' : ''}> Απόκρυψη όσων έλαβαν ευχές</label><button>Προβολή</button></form>
<p><b>${people}</b> εορτάζοντες · <b>${new Set(gs.map((g) => g.date)).size}</b> ημέρες · <b>${withMail}</b> με email · <b>${gs.length}</b> εορτές</p>
<form id="sel"><div class="toolbar"><button class="btn primary">✉ Ευχές στους επιλεγμένους</button><button type="button" class="btn" data-act="all">Επιλογή όλων</button></div>${body}</form>`,
    mount(el) {
      onSubmit(el.querySelector('#flt'), (d) => go('/namedays', { frm: d.frm, to: d.to, mail: d.mail ? '1' : '', hide: d.hide ? '1' : '' }));
      el.querySelector('#sel').addEventListener('submit', (e) => {
        e.preventDefault();
        const ks = [...el.querySelectorAll('input[name=k]:checked')].map((c) => c.value);
        if (!ks.length) { toast('Επιλέξτε τουλάχιστον έναν εορτάζοντα με email.', 'error'); return; }
        sessionStorage.setItem('nglg-greet', JSON.stringify(ks)); go('/namedays/greet');
      });
      bind(el, {
        all: () => el.querySelectorAll('input[name=k]').forEach((c) => (c.checked = true)),
        xlsx: () => exportXlsx(`eortazontes-${frm}-${to}.xlsx`, 'ΕΟΡΤΑΖΟΝΤΕΣ', ['Ημερομηνία', 'Ημέρα', 'Εορτή', 'Επώνυμο', 'Όνομα', 'Στοές', 'Email', 'Κινητό', 'Ευχές'],
          gs.flatMap((g) => g.members.map((m) => [fmtDate(g.date), DAYS[parseIso(g.date).getDay()], g.label, m.surname, m.first_name, memberLodgesLine(m.lodges), greetEmail(m), m.mobile || '', sent[`${m.id}|${g.date}`] ? fmtDate(sent[`${m.id}|${g.date}`]) : ''])), [12, 10, 18, 20, 16, 40, 30, 16, 12]),
      });
    },
  };
}

function greetPage() {
  let keys = [];
  try { keys = JSON.parse(sessionStorage.getItem('nglg-greet') || '[]'); } catch { /* */ }
  const ms = Object.fromEntries(db.all('member_registry').map((m) => [m.id, m])), byM = lodgesByMember(), sent = sentMap();
  const items = keys.map((k) => { const [mid, d, ...l] = k.split('|'); const m = ms[mid]; return m && !noContact(m) && parseIso(d) ? { k, m: { ...m, lodges: byM[m.id] || [] }, date: d, label: l.join('|'), email: greetEmail(m) } : null; }).filter(Boolean);
  if (!items.length) return '<h1>Δεν επιλέχθηκαν εορτάζοντες</h1><p><a href="#/namedays">← Εορτολόγιο</a></p>';
  items.forEach((it) => (it.rk = rankIdx(it.m)));
  const selfBcc = splitEmails(db.setting('greet_bcc_self'));
  const rows = items.map((it, i) => [`<b>${esc(it.m.surname)} ${esc(it.m.first_name)}</b><br><small class="muted">${esc(it.label)} · ${esc(dayStr(it.date))}</small>${sent[`${it.m.id}|${it.date}`] ? `<br><span class="vwarn">έλαβε ήδη ευχές ${esc(fmtDate(sent[`${it.m.id}|${it.date}`]))}</span>` : ''}`,
    `${esc(it.email)}<br><small class="muted">Κρυφή κοιν. Επαρχίας: ${esc(bccProvince(it.m, it.email).join(', ') || '—')}</small>`,
    `<select data-rk="${i}" style="width:auto">${RK.map((x, j) => `<option value="${j - 1}"${it.rk === j - 1 ? ' selected' : ''}>${x}</option>`).join('')}</select>`,
    `<div class="toolbar"><button type="button" class="btn small primary" data-act="open" data-i="${i}">1. 📋 Αντιγραφή & Gmail</button><button type="button" class="btn small" data-act="done" data-i="${i}">2. ✓ Στάλθηκε</button></div><span data-res="${i}"></span>`]);
  return {
    title: 'Ευχές',
    html: `<p><a href="#/namedays">← Εορτολόγιο</a></p><h1>Ευχές ονομαστικής εορτής</h1>${senderBanner('general')}
<div class="card"><p class="muted" style="margin-top:0">Για κάθε εορτάζοντα: <b>1.</b> πατήστε «Αντιγραφή & Gmail» — αντιγράφεται το μορφοποιημένο μήνυμα (με την πλακέτα) και ανοίγει το Gmail με παραλήπτη, κρυφή κοινοποίηση και θέμα· στο Gmail πατήστε <b>Επικόλληση</b> (Ctrl+V) στο κείμενο και «Αποστολή». <b>2.</b> Πατήστε «Στάλθηκε» για το ιστορικό.
Τα {Τίτλος}, {Προσφώνηση}, {Όνομα}, {Επώνυμο}, {Εορτή}, {Ημερομηνία} συμπληρώνονται αυτόματα.</p>
<label>Θέμα</label><input id="gSubj" value="${esc(db.setting('greet_subject'))}"><label style="margin-top:10px">Κείμενο</label><textarea id="gBody" style="min-height:240px">${esc(db.setting('greet_body'))}</textarea>
<div style="margin:8px 0;display:flex;flex-wrap:wrap;gap:6px 18px"><label class="chk"><input type="checkbox" id="gProv" checked> Κρυφή κοινοποίηση στη Γραμματεία και στον ΕπΜΔ της Επαρχίας</label>
<label class="chk"><input type="checkbox" id="gSelf"${selfBcc.length ? ' checked' : ' disabled'}> Κρυφή κοινοποίηση και σε: ${esc(selfBcc.join(', ') || '— (ορίζεται στις Ρυθμίσεις)')}</label></div>
<div class="toolbar"><button type="button" class="btn" data-act="saveTpl">Αποθήκευση κειμένου ως προτύπου</button><button type="button" class="btn" data-act="resetTpl">Επαναφορά αρχικού κειμένου</button></div></div>
<h3>Παραλήπτες (${items.length})</h3>${table(['Εορτάζων', 'Email', 'Προσφώνηση', 'Ενέργειες'], rows)}<h3>Δείγμα όπως θα φτάσει</h3><div class="card" id="sample"></div>`,
    mount(el) {
      const S = el.querySelector('#gSubj'), B = el.querySelector('#gBody');
      const rk = (i) => Number(el.querySelector(`[data-rk="${i}"]`).value);
      const msg = (i) => { const it = items[i], r = rk(i), text = fill(B.value, it.m, r, it.label, it.date);
        const bcc = [...new Set([...(el.querySelector('#gProv').checked ? bccProvince(it.m, it.email) : []), ...(el.querySelector('#gSelf').checked ? selfBcc : [])])].filter((e) => e.toLowerCase() !== it.email.toLowerCase());
        return { to: it.email, bcc, subject: fill(S.value, it.m, r, it.label, it.date), text, html: greetHtml(text) }; };
      const sample = () => { el.querySelector('#sample').innerHTML = msg(0).html; };
      sample(); B.addEventListener('input', sample); el.querySelectorAll('[data-rk]').forEach((s) => s.addEventListener('change', sample));
      bind(el, {
        async open(d) { const m = msg(Number(d.i)); await copyHtml(m.html, 'Εθνική Μεγάλη Στοά της Ελλάδος\n\n' + m.text); window.open(gmailUrl({ to: m.to, bcc: m.bcc, subject: m.subject, body: '', kind: 'general' }), '_blank', 'noopener'); toast('Αντιγράφηκε — επικολλήστε το στο Gmail.'); },
        async done(d) {
          const i = Number(d.i), it = items[i], m = msg(i);
          await db.save(`Ευχές: ${it.m.surname} ${it.m.first_name}`, (tx) => tx.insert('greetings_log', { member_id: it.m.id, registry_no: it.m.registry_no ?? null, feast_date: it.date, feast: it.label, name: `${it.m.surname} ${it.m.first_name}`, email: it.email, subject: m.subject, bcc: m.bcc.join(', '), sent_on: today(), sent_at: new Date().toISOString().slice(0, 19), source: 'app' }));
          el.querySelector(`[data-res="${i}"]`).innerHTML = '<span class="vok">✓ Καταχωρίστηκε</span>';
        },
        async saveTpl() { await db.save('Ευχές: πρότυπο κειμένου', (tx) => { tx.setting('greet_subject', S.value); tx.setting('greet_body', B.value); }); toast('Το πρότυπο αποθηκεύτηκε.'); },
        resetTpl() { S.value = SUBJECT_DEFAULT; B.value = BODY_DEFAULT; sample(); },
      });
    },
  };
}

function reportPage({ query }) {
  const d = query.d && parseIso(query.d) ? query.d : today(), rows = sortBy(db.all('greetings_log').filter((g) => g.sent_on === d), 'sent_at', 'name');
  const nat = provincesAll().find((p) => p.kind === 'Εθνική'), gm = nat ? provinceRoles(nat)[0].email : '';
  const body = `Σεβασμιώτατε Μεγάλε Διδάσκαλε,\n\nσας υποβάλλω συνημμένα την αναφορά αποστολής ευχών ονομαστικής εορτής εκ μέρους σας για ${d === today() ? 'σήμερα, ' : ''}${dayStr(d)}.\n\nΑπεστάλησαν ${rows.length} email ευχών:\n` + rows.map((r, i) => `${i + 1}. ${r.name}`).join('\n') + `\n\n${db.setting('visits_signer_name') || ''}\n${db.setting('visits_signer_title') || ''}`;
  const tbl = `<table><thead><tr><th>Α/Α</th><th>Ονοματεπώνυμο</th><th>Email</th><th>Θέμα</th><th>Ώρα</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.email)}</td><td>${esc(r.subject)}</td><td>${esc(String(r.sent_at || '').slice(11, 16))}</td></tr>`).join('') || '<tr><td colspan="5">Δεν έχουν καταχωριστεί ευχές.</td></tr>'}</tbody></table>`;
  return {
    title: 'Αναφορά ευχών',
    html: `<div class="noprint"><h1>Αναφορά ευχών</h1><form class="toolbar" id="df"><input type="date" name="d" value="${esc(d)}" style="width:auto"><button class="btn">Προβολή</button><button type="button" class="btn primary" data-act="print">⬇ PDF / Εκτύπωση</button><a class="btn" href="#/namedays">Εορτολόγιο</a></form>
${rows.length ? `<div class="card">${senderBanner('general')}<p>Αποστολή στον Μεγάλο Διδάσκαλο (${esc(gm || 'ορίστε email ΜΔ στην εγγραφή «ΕΜΣτΕ» των Επαρχιών')}): πατήστε «PDF», αποθηκεύστε το και επισυνάψτε το.</p>
<div class="toolbar">${mailButtons({ to: gm, subject: `Αναφορά αποστολής ευχών ονομαστικής εορτής — ${dayStr(d)}`, body, kind: 'general' })}</div></div>` : ''}</div>
<div class="print-area">${reportPaper(`Αναφορά αποστολής ευχών από ΜΔ · ${dayStr(d)}`, `Απεστάλησαν ${rows.length} email.`, tbl)}</div>`,
    mount(el) { onSubmit(el.querySelector('#df'), (x) => go('/namedays/report', x)); bind(el, { print: () => printPaper(`anafora-eyxon-${d}`) }); },
  };
}

const y = () => new Date().getFullYear();
module({
  id: 'namedays',
  routes: {
    '/namedays': listPage, '/namedays/greet': greetPage, '/namedays/report': reportPage,
    ...crud({
      table: 'namedays', base: '/namedays/calendar', title: 'Εορτολόγιο ονομάτων', one: 'Όνομα', name: (x) => x.name,
      intro: () => '<p class="muted">Η αντιστοίχιση γίνεται με το <b>πρώτο όνομα</b> του μέλους (χωρίς τόνους). Οι κινητές εορτές ορίζονται ως ημέρες από το Πάσχα (π.χ. «0» = Πάσχα).</p>',
      fields: [{ k: 'name', label: 'Όνομα (όπως γράφεται στο Μητρώο)', required: true }, { k: 'official', label: 'Επίσημη ονομασία εορτής', placeholder: 'π.χ. Γεώργιος' },
        { k: 'md', label: 'Σταθερή ημερομηνία (ΜΜ-ΗΗ)', placeholder: 'π.χ. 04-23' }, { k: 'easter', label: 'Ή κινητή: ημέρες από το Πάσχα', placeholder: 'π.χ. 0 ή 50' },
        { k: 'rule', label: 'Κανόνας', type: 'select', options: Object.entries(RULES) }, { k: 'note', label: 'Σημείωση', full: true }],
      sort: (xs) => sortBy(xs, 'name_key'), search: ['name', 'official', 'note'],
      columns: [{ label: 'Όνομα', v: (x) => `<b>${esc(x.name)}</b>` }, { label: 'Εορτή', v: (x) => esc(x.official) },
        { label: 'Φέτος', v: (x) => { const d = namedayIn(x, y()); return d ? esc(dayStr(isoDate(d))) : '<span class="muted">χωρίς εορτή</span>'; } },
        { label: 'Κανόνας', v: (x) => (x.easter != null && x.easter !== '' ? `Πάσχα ${Number(x.easter) >= 0 ? '+' : ''}${x.easter}` : esc(x.md)) + (x.rule ? ' · ' + esc(RULES[x.rule]) : '') }],
      validate(d) {
        if (d.md) { const m = /^(\d{2})-(\d{2})$/.exec(d.md), dt = m && new Date(2024, m[1] - 1, m[2]); if (!m || dt.getMonth() !== m[1] - 1) throw new Error('Η ημερομηνία πρέπει να είναι έγκυρη, στη μορφή ΜΜ-ΗΗ (π.χ. 04-23).'); }
        d.easter = /^-?\d+$/.test(d.easter) ? Number(d.easter) : null;
        if (!(d.rule in RULES)) d.rule = '';
        return { ...d, name_key: ndKey(d.name) };
      },
    }),
  },
  banner: () => {
    const t = today(), gs = celebrants(t, addDays(t, 7));
    if (!gs.length) return '';
    const by = {};
    for (const g of gs) { const x = (by[g.date] ||= [0, []]); x[0] += g.members.length; x[1].push(g.label); }
    const nm = (d) => { const k = Math.round((parseIso(d) - parseIso(t)) / 864e5); return k === 0 ? 'Σήμερα' : k === 1 ? 'Αύριο' : k === 2 ? 'Μεθαύριο' : dayStr(d).slice(0, -5); };
    return `<div class="card noprint" style="border-left:5px solid #b18a43">🎉 <b>Εορτάζοντες:</b> ${Object.entries(by).sort().map(([d, [n, ls]]) => `<b>${esc(nm(d))}</b> ${n} ${n === 1 ? 'μέλος' : 'μέλη'} <span class="muted">(${esc(ls.join(', '))})</span>`).join(' · ')} <a class="btn small" href="#/namedays">Εορτολόγιο &amp; ευχές</a></div>`;
  },
  tile: { order: 35, render: () => {
    const t = today(), todays = celebrants(t, t), sent = sentMap(), pending = todays.reduce((s, g) => s + g.members.filter((m) => greetEmail(m) && !sent[`${m.id}|${g.date}`]).length, 0);
    const n7 = celebrants(t, addDays(t, 7)).reduce((s, g) => s + g.members.length, 0);
    return `<div class="dtile gold"><h3><a href="#/namedays">🎉 Εορτολόγιο</a></h3><div class="big">${todays.reduce((s, g) => s + g.members.length, 0)} εορτάζουν σήμερα</div><div class="muted">${n7} τις επόμενες 7 ημέρες</div>${pending ? `<div class="warn">${pending} χωρίς ευχές σήμερα</div>` : ''}
<div class="acts"><a class="btn primary" href="#/namedays?frm=${t}&to=${addDays(t, 7)}">Εορτάζοντες & ευχές</a><a class="btn" href="#/namedays/report">Αναφορά ΜΔ</a></div></div>`;
  } },
});

