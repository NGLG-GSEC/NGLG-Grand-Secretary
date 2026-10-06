// Πρότζεκτ ΜΔ — π.χ. ίδρυση νέας Στοάς ή Σώματος: στοιχεία, Στοές/ομάδες με υπεύθυνο, μέλη, επαφές, αρχεία και
// σύνδεσμοι, ημερολόγιο εργασιών, αναφορά. Τα αρχεία (εικόνες/PDF) φυλάσσονται στο αποθετήριο δεδομένων (files/projects/).
import { db } from '../core/store.js';
import { module, onSubmit, go, flash, bind, confirmDo, table, toast } from '../core/app.js';
import { esc, fold, today, fmtDate, parseIso, sortBy } from '../core/util.js';
import { reportPaper, printPaper } from '../core/paper.js';
import { attachPicker, memberItems, noContact, NO_CONTACT } from '../core/pickers.js';
import { lodgesByMember, memberLodgesLine } from './members.js';

export const TYPES = { lodge: 'Ίδρυση νέας Στοάς', body: 'Ίδρυση νέου Σώματος', other: 'Άλλο έργο' };
export const STATUSES = { plan: 'Σχεδιασμός', active: 'Σε εξέλιξη', hold: 'Σε αναμονή', done: 'Ολοκληρώθηκε' };
const FILE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'application/pdf': '.pdf' };
const MAX = 20 * 1024 * 1024;

const daysTo = (p) => { const d = parseIso(p.target_date); return d ? Math.round((d - parseIso(today())) / 864e5) : null; };
export const projectLate = (p) => p.status !== 'done' && daysTo(p) !== null && daysTo(p) < 0;
function due(p) {
  if (p.status === 'done') return 'Ολοκληρώθηκε';
  const d = daysTo(p);
  if (d === null) return 'Χωρίς ημερομηνία στόχου';
  if (d < 0) return `Εκπρόθεσμο κατά ${-d} ${d === -1 ? 'ημέρα' : 'ημέρες'}`;
  return d === 0 ? 'Ο στόχος είναι σήμερα' : `${d} ${d === 1 ? 'ημέρα' : 'ημέρες'} έως τον στόχο`;
}
const unitLabel = (p) => (p.ptype === 'other' ? 'Ομάδες εργασίας' : 'Στοές');
const initials = (t) => String(t || '').split(/\s+/).filter((w) => /\p{L}/u.test(w[0] || '')).map((w) => w[0].toUpperCase()).join('').slice(0, 3) || '?';
const of = (t, pid) => db.all(t).filter((x) => x.project_id === pid);
const fileUrls = new Map();
async function fileUrl(f) {
  if (fileUrls.has(f.stored_name)) return fileUrls.get(f.stored_name);
  const bytes = await db.file('projects/' + f.stored_name);
  const u = bytes ? URL.createObjectURL(new Blob([bytes], { type: f.content_type })) : '';
  fileUrls.set(f.stored_name, u); return u;
}
async function sniff(file) {
  const b = new Uint8Array(await file.slice(0, 12).arrayBuffer()), s = String.fromCharCode(...b);
  if (b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (s.startsWith('\x89PNG')) return 'image/png';
  if (s.startsWith('GIF8')) return 'image/gif';
  if (s.startsWith('RIFF') && s.slice(8, 12) === 'WEBP') return 'image/webp';
  if (s.startsWith('%PDF')) return 'application/pdf';
  return '';
}
async function shrink(file, max = 1600) {
  const img = await createImageBitmap(file), k = Math.min(1, max / Math.max(img.width, img.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(img.width * k), height: Math.round(img.height * k) });
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Uint8Array(await (await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.86))).arrayBuffer());
}
const rnd = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
const cover = (p, big) => `<div class="pcover${big ? ' big' : ''}">${p.cover_file ? `<img data-file="${p.cover_file}" alt="">` : `<span>${esc(initials(p.title))}</span>`}</div>`;
async function loadImages(el) {
  for (const img of el.querySelectorAll('img[data-file]')) { const f = db.get('project_files', img.dataset.file); if (f) img.src = await fileUrl(f); }
}

function listPage({ query }) {
  const all = sortBy(db.all('projects'), (p) => p.status === 'done', (p) => p.target_date || '9999'), ql = fold(query.q || '');
  const xs = all.filter((p) => (!query.st || p.status === query.st) && (!ql || fold(p.title + ' ' + (TYPES[p.ptype] || '')).includes(ql)));
  const cards = xs.map((p) => `<a class="pcard" href="#/projects/${p.id}">${cover(p)}<div class="pbody"><small class="muted">${esc(TYPES[p.ptype] || '')}</small><div style="font-weight:bold;font-size:1.05rem">${esc(p.title || 'Χωρίς τίτλο')}</div>
<div class="muted">Έναρξη ${esc(fmtDate(p.start_date) || '—')} · Στόχος ${esc(fmtDate(p.target_date) || '—')}</div><div><span class="pchip">${esc(STATUSES[p.status] || '')}</span><span class="${projectLate(p) ? 'plate' : 'muted'}">${esc(due(p))}</span></div>
<div class="muted">${of('project_units', p.id).length} ${unitLabel(p).toLowerCase()} · ${of('project_members', p.id).length} μέλη · ${of('project_contacts', p.id).length} επαφές · ${of('project_files', p.id).length} αρχεία</div></div></a>`).join('');
  return {
    title: 'Πρότζεκτ ΜΔ',
    html: `<h1>Πρότζεκτ ΜΔ</h1><div class="toolbar"><a class="btn primary" href="#/projects/new">+ Νέο πρότζεκτ</a></div>
<form class="card pf pfs" id="flt"><input name="q" value="${esc(query.q || '')}" placeholder="Αναζήτηση πρότζεκτ…"><select name="st"><option value="">Όλες οι καταστάσεις</option>${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}"${k === query.st ? ' selected' : ''}>${v}</option>`).join('')}</select><button>Αναζήτηση</button></form>
${all.length ? `<p><b>${all.length}</b> πρότζεκτ · <b>${all.filter((p) => p.status === 'active').length}</b> σε εξέλιξη · <b>${all.filter(projectLate).length}</b> εκπρόθεσμα</p>` : ''}
${xs.length ? `<div class="pgrid">${cards}</div>` : `<div class="card">${all.length ? 'Κανένα πρότζεκτ δεν ταιριάζει με την αναζήτηση.' : 'Δεν υπάρχουν ακόμη πρότζεκτ. Πατήστε «Νέο πρότζεκτ» — π.χ. ίδρυση νέας Στοάς ή νέου Σώματος.'}</div>`}`,
    mount(el) { onSubmit(el.querySelector('#flt'), (d) => go('/projects', d)); loadImages(el); },
  };
}

function newPage() {
  return {
    title: 'Νέο πρότζεκτ',
    html: `<h1>Νέο πρότζεκτ</h1><form id="nf" class="grid card"><div class="full"><label>Τίτλος</label><input name="title" required placeholder="π.χ. Ίδρυση Σ.Σ. «…»"></div>
<div><label>Είδος</label><select name="ptype" id="pt">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
<div id="nunits" hidden><label>Πόσες Στοές θα έχει το Σώμα</label><input name="units" type="number" min="0" max="50" value="4"><small class="muted">Δημιουργούνται ως «Στοά 1», «Στοά 2»… και μετονομάζονται αργότερα.</small></div>
<div><label>Ημερομηνία έναρξης</label><input type="date" name="start_date" value="${today()}"></div><div><label>Ημερομηνία στόχου</label><input type="date" name="target_date"></div>
<div class="full toolbar"><button class="btn primary">Δημιουργία</button><a class="btn" href="#/projects">Άκυρο</a></div></form>`,
    mount(el) {
      el.querySelector('#pt').addEventListener('change', (e) => (el.querySelector('#nunits').hidden = e.target.value !== 'body'));
      onSubmit(el.querySelector('#nf'), async (d) => {
        const title = d.title.trim(); if (!title) throw new Error('Συμπληρώστε τίτλο.');
        const id = await db.save(`Νέο πρότζεκτ: ${title}`, (tx) => {
          const p = tx.insert('projects', { title, ptype: TYPES[d.ptype] ? d.ptype : 'other', status: 'plan', start_date: parseIso(d.start_date) ? d.start_date : '', target_date: parseIso(d.target_date) ? d.target_date : '', description: '', notes: '', cover_file: null });
          const names = d.ptype === 'lodge' ? [title] : d.ptype === 'body' ? Array.from({ length: Math.max(0, Math.min(50, Number(d.units) || 0)) }, (_, i) => `Στοά ${i + 1}`) : [];
          names.forEach((n, i) => tx.insert('project_units', { project_id: p.id, name: n, leader_member_id: null, notes: '', sort: i }));
          return p.id;
        });
        go(`/projects/${id}`);
      });
    },
  };
}

function projectPage({ params }) {
  const p = db.get('projects', params.id);
  if (!p) return '<h1>Δεν βρέθηκε το πρότζεκτ</h1>';
  const pid = p.id, units = sortBy(of('project_units', pid), 'sort', 'id'), members = of('project_members', pid).map((x) => db.get('member_registry', x.member_id)).filter(Boolean);
  const contacts = of('project_contacts', pid), files = of('project_files', pid).filter((f) => f.kind !== 'cover'), logs = sortBy(of('project_log', pid), (x) => x.log_date || '', 'id').reverse();
  const byM = lodgesByMember(), word = p.ptype === 'other' ? 'Ομάδα' : 'Στοά', mname = (id) => { const m = db.get('member_registry', id); return m ? `${m.surname} ${m.first_name}` : ''; };
  const opt = (o, sel) => Object.entries(o).map(([k, v]) => `<option value="${k}"${k === sel ? ' selected' : ''}>${v}</option>`).join('');
  const sec = (t, extra = '') => `<h2 style="margin:26px 0 8px">${t} ${extra}</h2>`;
  return {
    title: p.title,
    html: `<div class="toolbar noprint"><a class="btn" href="#/projects">← Όλα τα πρότζεκτ</a><button class="btn" data-act="report">⬇ Αναφορά (PDF)</button><button class="btn danger" data-act="del">Διαγραφή</button></div>
<div class="noprint"><h1>${esc(p.title)}</h1><p class="${projectLate(p) ? 'plate' : 'muted'}">${esc(due(p))}</p>
<div class="card pmain"><div>${cover(p, true)}<input type="file" id="coverIn" accept="image/png,image/jpeg,image/webp,image/gif" style="margin-top:8px"><div class="toolbar"><button class="btn small" data-act="cover">${p.cover_file ? 'Αλλαγή εικόνας' : 'Εικόνα προφίλ'}</button>${p.cover_file ? '<button class="btn small" data-act="rmCover">Αφαίρεση</button>' : ''}</div></div>
<form id="pf" class="grid"><div class="full"><label>Τίτλος</label><input name="title" value="${esc(p.title)}" required></div><div><label>Είδος</label><select name="ptype">${opt(TYPES, p.ptype)}</select></div><div><label>Κατάσταση</label><select name="status">${opt(STATUSES, p.status)}</select></div>
<div><label>Ημερομηνία έναρξης</label><input type="date" name="start_date" value="${esc(p.start_date || '')}"></div><div><label>Ημερομηνία στόχου</label><input type="date" name="target_date" value="${esc(p.target_date || '')}"></div>
<div class="full"><label>Περιγραφή</label><textarea name="description" class="short">${esc(p.description || '')}</textarea></div><div class="full"><label>Σημειώσεις</label><textarea name="notes" class="short">${esc(p.notes || '')}</textarea></div>
<div class="full"><button class="btn primary">Αποθήκευση στοιχείων</button></div></form></div>
${sec(unitLabel(p), `<small class="muted">${units.length}</small>`)}<form id="uf" class="card">${units.map((x, i) => `<div class="prow" data-uid="${x.id}"><div><label>${p.ptype === 'lodge' ? 'Όνομα Στοάς' : `${word} ${i + 1}`}</label><input name="uname" value="${esc(x.name)}"></div>
<div style="grid-column:span 2"><label>Υπεύθυνος</label><input type="hidden" name="uleader" value="${x.leader_member_id || ''}"><input class="upick" value="${esc(mname(x.leader_member_id))}" placeholder="🔎 Από το Μητρώο Μελών…" autocomplete="off"></div>
<div style="grid-column:span 2"><label>Σημειώσεις</label><input name="unotes" value="${esc(x.notes || '')}"></div><div>${p.ptype === 'lodge' ? '' : `<button type="button" class="btn small" data-act="rmUnit" data-id="${x.id}">✕</button>`}</div></div>`).join('') || '<p class="muted">Δεν υπάρχουν ακόμη.</p>'}
<div class="toolbar" style="margin-top:8px">${units.length ? '<button class="btn primary">Αποθήκευση</button>' : ''}${p.ptype === 'lodge' ? '' : `<button type="button" class="btn" data-act="addUnit">+ ${word}</button>`}</div></form>
${sec('Μέλη', `<small class="muted">${members.length}</small>`)}<div class="card"><input id="mPick" placeholder="🔎 Προσθήκη μέλους — πληκτρολογήστε όνομα ή επώνυμο…" autocomplete="off">
${members.length ? table(['Ονοματεπώνυμο', 'Στοές', 'Κινητό', 'Email', 'Ενέργειες'], members.map((m) => [`<b>${esc(m.surname)}</b> ${esc(m.first_name)}<div class="muted">${esc(m.degree || '')}</div>`, `<span class="muted">${esc(memberLodgesLine(byM[m.id]))}</span>`, esc(m.mobile || '—'), esc(m.email || '—'), `<button class="btn small" data-act="rmMember" data-id="${m.id}">✕</button>`])) : '<p class="muted">Δεν έχουν προστεθεί ακόμη μέλη.</p>'}</div>
${sec('Επαφές &amp; συνεργάτες', '<small class="muted">εκτός μελών</small>')}<form id="cf" class="card">${contacts.map((x) => `<div class="prow" data-cid="${x.id}">${[['name', 'Ονοματεπώνυμο'], ['role', 'Ιδιότητα / φορέας'], ['phone', 'Τηλέφωνο'], ['email', 'Email'], ['notes', 'Σημειώσεις']].map(([k, l]) => `<div><label>${l}</label><input name="${k}" value="${esc(x[k] || '')}"></div>`).join('')}
<div><button type="button" class="btn small" data-act="rmContact" data-id="${x.id}">✕</button></div></div>`).join('') || '<p class="muted">Δεν υπάρχουν ακόμη εξωτερικές επαφές.</p>'}
<div class="toolbar" style="margin-top:8px">${contacts.length ? '<button class="btn primary">Αποθήκευση</button>' : ''}<button type="button" class="btn" data-act="addContact">+ Επαφή</button></div></form>
${sec('Αρχεία &amp; σύνδεσμοι', `<small class="muted">${files.length}</small>`)}<div class="card"><div class="toolbar"><input type="file" id="filesIn" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" style="max-width:100%"><button class="btn" data-act="upload">+ Φωτογραφίες / PDF</button></div>
<form id="lf" class="pf pf3" style="margin:8px 0"><input name="name" placeholder="Τίτλος συνδέσμου"><input name="url" placeholder="https://…" required><button class="btn">+ Σύνδεσμος</button></form>
<div class="files">${files.map((f) => `<div class="fitem"><a class="fthumb" ${f.kind === 'link' ? `href="${esc(f.url)}"` : `href="#" data-open="${f.id}"`} target="_blank" rel="noopener">${f.kind === 'image' ? `<img data-file="${f.id}" alt="">` : f.kind === 'pdf' ? 'PDF' : '🔗'}</a>
<div class="fmeta"><b>${esc(f.name)}</b><br><span class="muted">${f.kind === 'link' ? esc(String(f.url).replace(/^https?:\/\//, '').slice(0, 40)) : (f.kind === 'pdf' ? 'PDF' : 'Φωτογραφία') + ' · ' + esc(fmtDate(f.added_on))}</span><br><button class="btn small" data-act="rmFile" data-id="${f.id}" style="margin-top:4px">✕ Αφαίρεση</button></div></div>`).join('') || '<p class="muted">Δεν υπάρχουν ακόμη αρχεία ή σύνδεσμοι.</p>'}</div><small class="muted">Εικόνες (JPG, PNG, WEBP, GIF) και PDF έως 20 MB.</small></div>
${sec('Πληροφορίες &amp; ημερολόγιο εργασιών')}<div class="card"><form id="logf" class="pf pfl"><input type="date" name="log_date" value="${today()}"><input name="text" placeholder="π.χ. Συνάντηση με τα ιδρυτικά μέλη" required><button class="btn primary">Προσθήκη</button></form>
${logs.length ? table(['Ημερομηνία', 'Καταχώριση', 'Ενέργειες'], logs.map((x) => [`<b>${esc(fmtDate(x.log_date) || '—')}</b>`, `<span style="white-space:pre-wrap">${esc(x.text)}</span>`, `<button class="btn small" data-act="rmLog" data-id="${x.id}">✕</button>`])) : '<p class="muted">Δεν υπάρχουν ακόμη καταχωρίσεις.</p>'}</div></div>
<div class="print-area" id="pa" hidden></div>`,
    async mount(el) {
      const reload = (msg) => { if (msg) flash(msg); go(`/projects/${pid}`); };
      const touch = (tx) => tx.update('projects', pid, {});
      el.querySelectorAll('.upick').forEach((inp) => attachPicker(inp, memberItems, (m) => { inp.previousElementSibling.value = m.id; inp.value = `${m.surname} ${m.first_name}`; }));
      attachPicker(el.querySelector('#mPick'), memberItems, async (m) => {
        if (of('project_members', pid).some((x) => x.member_id === m.id)) return toast('Το μέλος υπάρχει ήδη.');
        await db.save(`Πρότζεκτ «${p.title}»: νέο μέλος`, (tx) => { tx.insert('project_members', { project_id: pid, member_id: m.id }); touch(tx); }); reload();
      });
      onSubmit(el.querySelector('#pf'), async (d) => {
        if (!d.title.trim()) throw new Error('Συμπληρώστε τίτλο.');
        await db.save(`Πρότζεκτ «${p.title}»: στοιχεία`, (tx) => {
          tx.update('projects', pid, { title: d.title.trim(), ptype: TYPES[d.ptype] ? d.ptype : p.ptype, status: STATUSES[d.status] ? d.status : p.status, start_date: parseIso(d.start_date) ? d.start_date : '', target_date: parseIso(d.target_date) ? d.target_date : '', description: d.description, notes: d.notes });
          if (d.ptype === 'lodge' && !units.length) tx.insert('project_units', { project_id: pid, name: d.title.trim(), leader_member_id: null, notes: '', sort: 0 });
        }); reload('Αποθηκεύτηκε.');
      });
      onSubmit(el.querySelector('#uf'), async () => {
        await db.save(`Πρότζεκτ «${p.title}»: ${unitLabel(p)}`, (tx) => { for (const r of el.querySelectorAll('[data-uid]')) tx.update('project_units', r.dataset.uid, { name: r.querySelector('[name=uname]').value.trim(), leader_member_id: Number(r.querySelector('[name=uleader]').value) || null, notes: r.querySelector('[name=unotes]').value }); touch(tx); });
        reload('Αποθηκεύτηκε.');
      });
      onSubmit(el.querySelector('#cf'), async () => {
        await db.save(`Πρότζεκτ «${p.title}»: επαφές`, (tx) => { for (const r of el.querySelectorAll('[data-cid]')) tx.update('project_contacts', r.dataset.cid, Object.fromEntries(['name', 'role', 'phone', 'email', 'notes'].map((k) => [k, r.querySelector(`[name=${k}]`).value.trim()]))); touch(tx); });
        reload('Αποθηκεύτηκε.');
      });
      onSubmit(el.querySelector('#lf'), async (d) => {
        let url = d.url.trim(); if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        await db.save(`Πρότζεκτ «${p.title}»: σύνδεσμος`, (tx) => { tx.insert('project_files', { project_id: pid, kind: 'link', name: d.name.trim() || url.replace(/^https?:\/\//i, ''), url, stored_name: '', content_type: '', size: 0, added_on: today() }); touch(tx); }); reload();
      });
      onSubmit(el.querySelector('#logf'), async (d) => { await db.save(`Πρότζεκτ «${p.title}»: ημερολόγιο`, (tx) => { tx.insert('project_log', { project_id: pid, log_date: parseIso(d.log_date) ? d.log_date : today(), text: d.text.trim() }); touch(tx); }); reload(); });
      const dropFile = (tx, f) => { if (f && f.stored_name) tx.deleteFile('projects/' + f.stored_name); if (f) tx.remove('project_files', f.id); };
      bind(el, {
        async addUnit() { await db.save(`Πρότζεκτ «${p.title}»: νέα ${word}`, (tx) => tx.insert('project_units', { project_id: pid, name: `${word} ${units.length + 1}`, leader_member_id: null, notes: '', sort: units.length })); reload(); },
        async rmUnit(d) { if (confirmDo('Αφαίρεση;')) { await db.save(`Πρότζεκτ «${p.title}»: αφαίρεση ${word}`, (tx) => tx.remove('project_units', d.id)); reload(); } },
        async rmMember(d) { await db.save(`Πρότζεκτ «${p.title}»: αφαίρεση μέλους`, (tx) => tx.remove('project_members', (x) => x.project_id === pid && x.member_id === Number(d.id))); reload(); },
        async addContact() { await db.save(`Πρότζεκτ «${p.title}»: νέα επαφή`, (tx) => tx.insert('project_contacts', { project_id: pid, name: '', role: '', phone: '', email: '', notes: '' })); reload(); },
        async rmContact(d) { await db.save(`Πρότζεκτ «${p.title}»: αφαίρεση επαφής`, (tx) => tx.remove('project_contacts', d.id)); reload(); },
        async rmLog(d) { await db.save(`Πρότζεκτ «${p.title}»: ημερολόγιο`, (tx) => tx.remove('project_log', d.id)); reload(); },
        async rmFile(d) { if (confirmDo('Αφαίρεση;')) { await db.save(`Πρότζεκτ «${p.title}»: αφαίρεση αρχείου`, (tx) => { dropFile(tx, tx.get('project_files', d.id)); if (p.cover_file === Number(d.id)) tx.update('projects', pid, { cover_file: null }); }); reload(); } },
        async upload() {
          const fs = [...el.querySelector('#filesIn').files];
          if (!fs.length) throw new Error('Επιλέξτε αρχεία.');
          const ready = [];
          for (const f of fs) {
            if (f.size > MAX) throw new Error(`«${f.name}»: μέγιστο μέγεθος 20 MB.`);
            const ct = await sniff(f); if (!ct) throw new Error(`«${f.name}»: επιτρέπονται εικόνες (JPG, PNG, WEBP, GIF) και PDF.`);
            ready.push({ f, ct, bytes: new Uint8Array(await f.arrayBuffer()), name: rnd() + FILE_TYPES[ct] });
          }
          await db.save(`Πρότζεκτ «${p.title}»: ${ready.length} αρχεία`, (tx) => { for (const r of ready) { tx.putFile('projects/' + r.name, r.bytes); tx.insert('project_files', { project_id: pid, kind: r.ct === 'application/pdf' ? 'pdf' : 'image', name: r.f.name, url: '', stored_name: r.name, content_type: r.ct, size: r.bytes.length, added_on: today() }); } touch(tx); });
          reload(`Ανέβηκαν ${ready.length} αρχεία.`);
        },
        async cover() {
          const f = el.querySelector('#coverIn').files[0]; if (!f) throw new Error('Επιλέξτε εικόνα.');
          const ct = await sniff(f); if (!ct || ct === 'application/pdf') throw new Error('Η εικόνα προφίλ πρέπει να είναι φωτογραφία.');
          const bytes = await shrink(f), name = rnd() + '.jpg';
          await db.save(`Πρότζεκτ «${p.title}»: εικόνα προφίλ`, (tx) => {
            tx.putFile('projects/' + name, bytes);
            const r = tx.insert('project_files', { project_id: pid, kind: 'cover', name: 'Εικόνα προφίλ', url: '', stored_name: name, content_type: 'image/jpeg', size: bytes.length, added_on: today() });
            if (p.cover_file) dropFile(tx, tx.get('project_files', p.cover_file));
            tx.update('projects', pid, { cover_file: r.id });
          }); reload('Η εικόνα αποθηκεύτηκε.');
        },
        async rmCover() { await db.save(`Πρότζεκτ «${p.title}»: χωρίς εικόνα`, (tx) => { dropFile(tx, tx.get('project_files', p.cover_file)); tx.update('projects', pid, { cover_file: null }); }); reload(); },
        async del() {
          if (!confirmDo('Διαγραφή του πρότζεκτ μαζί με τα αρχεία του;')) return;
          await db.save(`Διαγραφή πρότζεκτ «${p.title}»`, (tx) => {
            for (const f of tx.all('project_files').filter((x) => x.project_id === pid)) dropFile(tx, f);
            for (const t of ['project_units', 'project_members', 'project_contacts', 'project_log']) tx.remove(t, (x) => x.project_id === pid);
            tx.remove('projects', pid);
          }); flash('Το πρότζεκτ διαγράφηκε.'); go('/projects');
        },
        async report() {
          const pa = el.querySelector('#pa'), lead = (id) => { const m = db.get('member_registry', id); return m ? [`${m.surname} ${m.first_name}`, noContact(m) ? NO_CONTACT : [m.mobile, m.email].filter(Boolean).join(' · ')] : ['—', '']; };
          const t = (h, rows) => `<h3>${h}</h3><table><thead><tr>${rows[0].map((x) => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td style="white-space:pre-wrap">${esc(c ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
          let inner = `<p style="text-align:center">${esc(`${TYPES[p.ptype] || ''} · ${STATUSES[p.status] || ''} · Έναρξη ${fmtDate(p.start_date) || '—'} · Στόχος ${fmtDate(p.target_date) || '—'} · ${due(p)}`)}</p>`;
          if (p.cover_file) inner += `<p style="text-align:center"><img data-file="${p.cover_file}" style="max-width:70mm;max-height:50mm" alt=""></p>`;
          if (p.description) inner += `<h3>Περιγραφή</h3><p style="white-space:pre-wrap">${esc(p.description)}</p>`;
          if (units.length) inner += t(unitLabel(p), [['Όνομα', 'Υπεύθυνος', 'Επικοινωνία', 'Σημειώσεις'], ...units.map((x) => [x.name, ...lead(x.leader_member_id), x.notes])]);
          if (members.length) inner += t(`Μέλη (${members.length})`, [['Ονοματεπώνυμο', 'Στοές', 'Κινητό', 'Email'], ...members.map((m) => [`${m.surname} ${m.first_name}`, memberLodgesLine(byM[m.id]), m.mobile, m.email])]);
          if (contacts.length) inner += t('Επαφές & συνεργάτες', [['Ονοματεπώνυμο', 'Ιδιότητα', 'Τηλέφωνο', 'Email', 'Σημειώσεις'], ...contacts.map((x) => [x.name, x.role, x.phone, x.email, x.notes])]);
          if (files.length) inner += t('Αρχεία & σύνδεσμοι', [['Τίτλος', 'Είδος', 'Ημερομηνία'], ...files.map((f) => [f.name, f.kind === 'link' ? f.url : f.kind === 'pdf' ? 'PDF' : 'Φωτογραφία', fmtDate(f.added_on)])]);
          if (logs.length) inner += t('Ημερολόγιο εργασιών', [['Ημερομηνία', 'Καταχώριση'], ...logs.map((x) => [fmtDate(x.log_date), x.text])]);
          pa.innerHTML = reportPaper(p.title, 'Πρότζεκτ Μεγάλου Διδασκάλου', inner);
          await loadImages(pa); pa.hidden = false; printPaper(`projekt-${p.title}`);
          window.addEventListener('afterprint', () => (pa.hidden = true), { once: true });
        },
      });
      el.addEventListener('click', async (e) => { const a = e.target.closest('[data-open]'); if (!a) return; e.preventDefault(); const u = await fileUrl(db.get('project_files', a.dataset.open)); if (u) window.open(u, '_blank'); });
      await loadImages(el);
    },
  };
}

module({
  id: 'projects',
  routes: { '/projects': listPage, '/projects/new': newPage, '/projects/:id': projectPage },
  tile: { order: 45, render: () => {
    const ps = db.all('projects'), late = ps.filter(projectLate).length;
    return `<div class="dtile"><h3><a href="#/projects">Πρότζεκτ ΜΔ</a></h3><div class="big">${ps.filter((p) => p.status === 'active').length} σε εξέλιξη</div><div class="muted">${ps.length} συνολικά</div>${late ? `<div class="warn">${late} εκπρόθεσμα</div>` : ''}
<div class="acts"><a class="btn primary" href="#/projects">Πρότζεκτ</a><a class="btn" href="#/projects/new">+ Νέο</a></div></div>`;
  } },
});
