// Google Drive: αποθήκευση αρχείων (Word, PDF) στον φάκελο της Μεγάλης Γραμματείας, απευθείας από τον browser.
// Σύνδεση με τον λογαριασμό Google του χρήστη (Google Identity Services)· χρειάζεται μόνο το «Client ID» στις Ρυθμίσεις.
// Αρχείο με το ίδιο όνομα στον φάκελο αντικαθίσταται (νέα έκδοση), ώστε να μη δημιουργούνται διπλά.
import { db } from './store.js';
import { loadScript } from './pdf.js';

export const DRIVE_FOLDER_DEFAULT = '1kKR7v86jjs5QJE9-K5uUebvS6nZd9J03';
db.defaultSettings({ drive_folder_id: DRIVE_FOLDER_DEFAULT, google_client_id: '' });
const SCOPE = 'https://www.googleapis.com/auth/drive';
const API = 'https://www.googleapis.com';
export const folderId = () => { const v = String(db.setting('drive_folder_id') || DRIVE_FOLDER_DEFAULT).trim(); const m = /folders\/([\w-]+)/.exec(v); return m ? m[1] : v; };
export const folderUrl = () => `https://drive.google.com/drive/folders/${folderId()}`;
export const driveReady = () => !!String(db.setting('google_client_id') || '').trim();

let token = null, expires = 0;
async function getToken(interactive = true) {
  if (token && Date.now() < expires - 60000) return token;
  if (!interactive) return null;
  const clientId = String(db.setting('google_client_id') || '').trim();
  if (!clientId) throw new Error('Δεν έχει οριστεί το Google Client ID (Ρυθμίσεις → Google Drive).');
  if (!(window.google && window.google.accounts && window.google.accounts.oauth2)) {
    await new Promise((ok, bad) => { const s = Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', onload: ok, onerror: () => bad(new Error('Δεν φορτώθηκε η σύνδεση Google.')) }); document.head.appendChild(s); });
  }
  return new Promise((ok, bad) => {
    const c = window.google.accounts.oauth2.initTokenClient({ client_id: clientId, scope: SCOPE, callback: (r) => {
      if (r && r.access_token) { token = r.access_token; expires = Date.now() + (Number(r.expires_in) || 3600) * 1000; ok(token); } else bad(new Error('Η σύνδεση με το Google δεν ολοκληρώθηκε.'));
    }, error_callback: (e) => bad(new Error('Google: ' + ((e && e.type) || 'ακύρωση'))) });
    c.requestAccessToken({ prompt: '' });
  });
}

async function api(path, opts = {}) {
  const t = await getToken();
  const r = await fetch(API + path, { ...opts, headers: { Authorization: `Bearer ${t}`, ...(opts.headers || {}) } });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Drive ${r.status}: ${(j.error && j.error.message) || r.statusText}`); }
  return r.json();
}

// Ανέβασμα (ή αντικατάσταση αν υπάρχει ίδιο όνομα) → { id, webViewLink }
export async function uploadFile(blob, name, mime) {
  const folder = folderId(), q = encodeURIComponent(`name = '${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and '${folder}' in parents and trashed = false`);
  const found = await api(`/drive/v3/files?q=${q}&fields=files(id)&supportsAllDrives=true&includeItemsFromAllDrives=true`);
  const meta = found.files && found.files[0] ? { name } : { name, parents: [folder], mimeType: mime };
  const body = new FormData();
  body.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  body.append('file', blob, name);
  const id = found.files && found.files[0] && found.files[0].id;
  return api(`/upload/drive/v3/files${id ? '/' + id : ''}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`, { method: id ? 'PATCH' : 'POST', body });
}

// Τίτλος αρχείου: «20545 - ΕΠΙΣΤΟΛΗ Θέμα»
export const docTitle = (seq, category, subject) => `${seq || ''} - ${String(category || 'ΕΠΙΣΤΟΛΗ').toUpperCase()} ${String(subject || '').trim()}`
  .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);

// Word + PDF ενός εγγράφου στο Drive και σημείωση των συνδέσμων στην εγγραφή (letters / decree_documents)
export async function saveDocToDrive(table, id, title, docxBlob, paperEl) {
  const { paperPdf } = await import('./pdf.js');
  const pdf = await paperPdf(paperEl, { title });
  const w = await uploadFile(docxBlob, title + '.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const p = await uploadFile(pdf, title + '.pdf', 'application/pdf');
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await db.save(`Drive: ${title}`, (tx) => tx.update(table, id, { drive_docx: w.webViewLink || '', drive_pdf: p.webViewLink || '', drive_saved_at: now, drive_title: title }));
  return { w, p };
}
const escA = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// Κουμπί + κατάσταση για τη σελίδα εγγράφου
export function driveBox(rec, title) {
  const saved = rec.drive_pdf && rec.drive_title === title;
  return `<div class="drivebox">${driveReady() ? `<button class="btn${saved ? '' : ' primary'}" data-act="drive">☁ ${saved ? 'Νέα αποθήκευση' : 'Αποθήκευση'} στο Drive (Word + PDF)</button>` : `<a class="btn" href="#/settings">☁ Ρύθμιση Google Drive</a>`}
${saved ? `<span class="vok">✓ Στο Drive ${escA(rec.drive_saved_at)}: <a href="${escA(rec.drive_docx)}" target="_blank" rel="noopener">Word</a> · <a href="${escA(rec.drive_pdf)}" target="_blank" rel="noopener">PDF</a></span>` : ''}
<small class="muted">Όνομα αρχείου: «${escA(title)}» · <a href="${escA(folderUrl())}" target="_blank" rel="noopener">φάκελος Drive</a></small></div>`;
}
