// Βιβλίο Εξερχόμενης Αλληλογραφίας (#/book): διαβάζει τα PDF του φακέλου Πρωτοκόλλου στο Google Drive (ή αρχεία από τον υπολογιστή)
// και φτιάχνει ένα ενιαίο PDF: Εξώφυλλο → κενή → Προλογικά κείμενα → Ευρετήριο (+ Διατάγματα) → έγγραφα από το παλαιότερο στο νεότερο.
// Κάθε φορά που πατιέται «Δημιουργία», το βιβλίο χτίζεται από την αρχή με ό,τι υπάρχει τότε στον φάκελο.
// Ο κανόνας για κάθε αρχείο βγαίνει από το όνομά του (βλ. core/book.js → classify):
//   cover.pdf → εξώφυλλο · «20545 …» ή «20.545_2026 …» → έγγραφο · «…_Book_DDMMYY_vN.pdf» → παλιό βιβλίο (εκτός) · οτιδήποτε άλλο → προλογικό
import { module, bind, toast } from '../core/app.js';
import { esc, download } from '../core/util.js';
import { folderId, driveReady, googleToken } from '../core/drive.js';

const API = 'https://www.googleapis.com';
const KINDS = { cover: 'Εξώφυλλο', front: 'Προλογικό', doc: 'Έγγραφο', skip: 'Εκτός' };
const LS = 'nglg-book';
const mem = () => { try { return JSON.parse(localStorage.getItem(LS) || '{}'); } catch { return {}; } };
const remember = (o) => { try { localStorage.setItem(LS, JSON.stringify({ ...mem(), ...o })); } catch { /* */ } };
const folderFrom = (v) => { const m = /folders\/([\w-]+)/.exec(String(v || '')); return m ? m[1] : String(v || '').trim(); };

// Τα αρχεία της τρέχουσας προετοιμασίας (κρατιούνται όσο είναι ανοιχτή η καρτέλα)
const state = { files: [], folder: '', source: '' };

async function driveJson(path) {
  const t = await googleToken();
  const r = await fetch(API + path, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Drive ${r.status}: ${(j.error && j.error.message) || r.statusText}`); }
  return r.json();
}
async function listFolder(folder) {
  const q = encodeURIComponent(`'${folder}' in parents and trashed = false and mimeType = 'application/pdf'`);
  const files = [];
  let token = '';
  do {
    const j = await driveJson(`/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,createdTime,modifiedTime,size)&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${token ? '&pageToken=' + token : ''}`);
    files.push(...(j.files || []));
    token = j.nextPageToken || '';
  } while (token);
  return files;
}
async function driveBytes(id) {
  const t = await googleToken();
  const r = await fetch(`${API}/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${t}` } });
  if (!r.ok) throw new Error(`Drive ${r.status}: λήψη αρχείου`);
  return r.arrayBuffer();
}
async function driveUpload(folder, name, bytes) {
  const t = await googleToken();
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify({ name, parents: [folder], mimeType: 'application/pdf' })], { type: 'application/json' }));
  body.append('file', new Blob([bytes], { type: 'application/pdf' }), name);
  const r = await fetch(`${API}/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`, { method: 'POST', headers: { Authorization: `Bearer ${t}` }, body });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Drive ${r.status}: ${(j.error && j.error.message) || r.statusText}`); }
  return r.json();
}
// Λήψη πολλών αρχείων παράλληλα (4 τη φορά)
async function fetchAll(items, onEach) {
  let i = 0, done = 0;
  const worker = async () => { while (i < items.length) { const it = items[i++]; if (!it.bytes) it.bytes = await driveBytes(it.id); onEach(++done, items.length); } };
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
}

function listHtml(B) {
  if (!state.files.length) return '<p class="muted">Δεν έχουν φορτωθεί αρχεία ακόμη.</p>';
  const count = (k) => state.files.filter((f) => f.kind === k).length;
  const order = { cover: 0, front: 1, doc: 2, skip: 3 };
  const rows = [...state.files].map((f, i) => ({ f, i })).sort((a, b) => order[a.f.kind] - order[b.f.kind] || new Date(a.f.created) - new Date(b.f.created));
  const covers = count('cover');
  const warn = [];
  if (!covers) warn.push('Δεν βρέθηκε εξώφυλλο (cover.pdf). Ορίστε ένα αρχείο ως «Εξώφυλλο» ή προσθέστε το στον φάκελο.');
  if (covers > 1) warn.push('Περισσότερα από ένα εξώφυλλα — θα χρησιμοποιηθεί το πρώτο.');
  return `${warn.map((w) => `<div class="card notice"><b>${esc(w)}</b></div>`).join('')}
<p><b>${count('doc')}</b> έγγραφα · <b>${count('front')}</b> προλογικά · <b>${covers}</b> εξώφυλλο · <span class="muted">${count('skip')} εκτός</span></p>
<div class="card tablecard"><table class="stack"><tr class="stack-head"><th>Ρόλος</th><th>Αρ. Πρωτ.</th><th>Ημερομηνία</th><th>Όνομα αρχείου</th></tr>
${rows.map(({ f, i }) => `<tr${f.kind === 'skip' ? ' class="muted"' : ''}><td data-label="Ρόλος"><select data-i="${i}" class="bk-kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}"${f.kind === k ? ' selected' : ''}>${l}</option>`).join('')}</select></td>
<td data-label="Αρ. Πρωτ.">${esc(B.protocolOf(f.name))}</td><td data-label="Ημερομηνία">${esc(B.athensDate(f.created))}</td><td data-label="Όνομα">${esc(f.name)}${B.decreeOf(f.name) ? ' <small class="pill">ΔΙΑΤΑΓΜΑ</small>' : ''}</td></tr>`).join('')}
</table></div>`;
}

module({
  id: 'book',
  routes: {
    '/book': () => {
      const m = mem();
      const folder = state.folder || m.folder || folderId();
      const year = m.year || new Date().getFullYear();
      return {
        title: 'Βιβλίο Εξερχομένων',
        keepScroll: true,
        html: `<h1>📚 Βιβλίο Εξερχόμενης Αλληλογραφίας</h1>
<p class="muted">Ένα PDF με όλα τα εξερχόμενα του φακέλου: Εξώφυλλο (cover.pdf) → κενή σελίδα → Προλογικά κείμενα → Ευρετήριο με αριθμό πρωτοκόλλου, ημερομηνία, θέμα και σελίδα → Ευρετήριο Διαταγμάτων → τα έγγραφα από το παλαιότερο στο νεότερο. Κάθε δημιουργία παίρνει ό,τι υπάρχει εκείνη τη στιγμή στον φάκελο.</p>
<div class="card"><h2 style="margin-top:0">1. Αρχεία</h2><div class="grid">
<div class="full"><label>Φάκελος Drive (σύνδεσμος ή ID)</label><input id="bkFolder" value="${esc(folder)}"></div></div>
<div class="toolbar" style="margin-top:10px">${driveReady() ? '<button class="btn primary" data-act="load">☁ Φόρτωση από το Drive</button>' : '<a class="btn" href="#/settings">☁ Ρύθμιση Google Drive</a>'}
<label class="btn">📁 Αρχεία από τον υπολογιστή<input type="file" id="bkLocal" accept="application/pdf,.pdf" multiple hidden></label>
${state.files.length ? '<button class="btn" data-act="clear">Καθαρισμός λίστας</button>' : ''}<a class="btn" href="https://drive.google.com/drive/folders/${esc(folderFrom(folder))}" target="_blank" rel="noopener">Άνοιγμα φακέλου ↗</a></div>
<small class="muted">Ρόλος από το όνομα: <b>cover.pdf</b> → εξώφυλλο · αρχεία που αρχίζουν με αριθμό πρωτοκόλλου (π.χ. «20545 …», «20.545_2026 …») → έγγραφα · τα παλιά βιβλία (…_Book_…) → εκτός · όλα τα άλλα → προλογικά κείμενα. Ο ρόλος αλλάζει από τη λίστα.</small>
<div id="bkList" style="margin-top:12px"><p class="muted">Φόρτωση…</p></div></div>
<div class="card"><h2 style="margin-top:0">2. Επιλογές</h2><div class="grid">
<div><label>Έτος (στους τίτλους)</label><input id="bkYear" inputmode="numeric" value="${esc(year)}"></div>
<div><label>Σειρά εγγράφων</label><select id="bkOrder"><option value="created"${m.order !== 'protocol' ? ' selected' : ''}>Ημερομηνία δημιουργίας (παλαιότερο → νεότερο)</option><option value="protocol"${m.order === 'protocol' ? ' selected' : ''}>Αριθμός πρωτοκόλλου</option></select></div>
<div class="full"><label>Τίτλος προλογικών κειμένων</label><input id="bkFrontTitle" value="${esc(m.frontTitle || 'ΚΕΙΜΕΝΑ ΤΟΥ ΜΕΓΑΛΟΥ ΔΙΔΑΣΚΑΛΟΥ')}"></div>
<div class="full"><label class="chk"><input type="checkbox" id="bkUpload"${m.upload !== false && driveReady() ? ' checked' : ''}${driveReady() ? '' : ' disabled'}> Αποθήκευση του βιβλίου και στον ίδιο φάκελο του Drive</label></div></div></div>
<div class="toolbar"><button class="btn primary" data-act="build">📖 Δημιουργία βιβλίου</button></div>
<div id="bkOut"></div>`,
        async mount(el) {
          const B = await import('../core/book.js');
          const list = el.querySelector('#bkList');
          const redraw = () => { list.innerHTML = listHtml(B); };
          redraw();
          list.addEventListener('change', (e) => { const s = e.target.closest('.bk-kind'); if (s) { state.files[+s.dataset.i].kind = s.value; redraw(); } });
          el.querySelector('#bkLocal').addEventListener('change', async (e) => {
            for (const file of e.target.files) {
              if (!/\.pdf$/i.test(file.name)) continue;
              state.files = state.files.filter((f) => f.name !== file.name);
              state.files.push({ name: file.name, created: new Date(file.lastModified).toISOString(), kind: B.classify(file.name), bytes: await file.arrayBuffer(), local: true });
            }
            e.target.value = ''; redraw(); toast('Προστέθηκαν αρχεία από τον υπολογιστή');
          });
          const out = el.querySelector('#bkOut');
          const say = (msg) => { out.innerHTML = `<div class="card"><div class="spinner" style="display:inline-block;vertical-align:middle;margin-right:8px"></div>${esc(msg)}</div>`; };
          bind(el, {
            async load() {
              const folder = folderFrom(el.querySelector('#bkFolder').value);
              if (!folder) throw new Error('Συμπληρώστε τον φάκελο του Drive.');
              say('Ανάγνωση φακέλου στο Drive…');
              const files = await listFolder(folder);
              state.folder = folder; remember({ folder });
              const local = state.files.filter((f) => f.local);
              state.files = [...files.map((f) => ({ id: f.id, name: f.name, created: f.createdTime, kind: B.classify(f.name) })), ...local];
              out.innerHTML = '';
              redraw();
              toast(`${files.length} αρχεία PDF στον φάκελο`);
            },
            clear() { state.files = []; redraw(); out.innerHTML = ''; },
            async build() {
              const year = el.querySelector('#bkYear').value.trim() || new Date().getFullYear();
              const order = el.querySelector('#bkOrder').value, frontTitle = el.querySelector('#bkFrontTitle').value.trim();
              const upload = el.querySelector('#bkUpload').checked;
              remember({ year, order, frontTitle, upload });
              const use = state.files.filter((f) => f.kind !== 'skip');
              if (!use.some((f) => f.kind === 'doc')) throw new Error('Δεν υπάρχουν έγγραφα. Πατήστε «Φόρτωση από το Drive» ή επιλέξτε αρχεία.');
              await fetchAll(use.filter((f) => !f.bytes), (d, n) => say(`Λήψη αρχείων από το Drive: ${d} από ${n}…`));
              const byTime = (a, b) => new Date(a.created) - new Date(b.created);
              const res = await B.buildBook({
                cover: use.find((f) => f.kind === 'cover') || null,
                front: use.filter((f) => f.kind === 'front').sort(byTime),
                docs: use.filter((f) => f.kind === 'doc'),
              }, { year, order, frontTitle, onProgress: say });
              const name = B.bookFileName(year, state.files.map((f) => f.name));
              download(name, new Blob([res.bytes], { type: 'application/pdf' }));
              let drive = '';
              if (upload) {
                say('Αποθήκευση στο Drive…');
                try {
                  const folder = state.folder || folderFrom(el.querySelector('#bkFolder').value);
                  const up = await driveUpload(folder, name, res.bytes);
                  state.files.push({ id: up.id, name, created: new Date().toISOString(), kind: 'skip' });
                  drive = `<a class="btn" href="${esc(up.webViewLink)}" target="_blank" rel="noopener">☁ Άνοιγμα στο Drive</a>`;
                } catch (e) { drive = `<span class="vwarn">Δεν αποθηκεύτηκε στο Drive: ${esc(e.message)}</span>`; }
              }
              const url = URL.createObjectURL(new Blob([res.bytes], { type: 'application/pdf' }));
              out.innerHTML = `<div class="card"><h2 style="margin-top:0">✓ ${esc(name)}</h2>
<p><b>${res.pages}</b> σελίδες · ${res.docs.length} έγγραφα · ${res.decrees.length} Διατάγματα · ${res.front.length} προλογικά · ευρετήριο σε ${res.indexPages} σελίδες</p>
${res.warnings.map((w) => `<div class="vwarn">⚠ ${esc(w)}</div>`).join('')}
<div class="toolbar"><a class="btn primary" href="${url}" download="${esc(name)}">⬇ Λήψη PDF</a><a class="btn" href="${url}" target="_blank" rel="noopener">Άνοιγμα</a>${drive}</div></div>`;
              redraw();
            },
          });
        },
      };
    },
  },
  tile: { order: 35, render: () => `<div class="dtile"><h3><a href="#/book">📚 Βιβλίο Εξερχομένων</a></h3><div class="muted">Όλα τα εξερχόμενα του φακέλου Πρωτοκόλλου σε ένα PDF, με ευρετήριο και ευρετήριο Διαταγμάτων</div>
<div class="acts"><a class="btn primary" href="#/book">Δημιουργία</a></div></div>` },
});
