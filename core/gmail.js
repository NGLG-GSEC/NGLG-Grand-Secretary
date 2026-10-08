// Αποστολή με Gmail και συνημμένο PDF, σε υπολογιστή, tablet και κινητό (Android, iPhone).
// Με Google Client ID (Ρυθμίσεις → Google): δημιουργείται «Πρόχειρο» στο Gmail του λογαριασμού αποστολής (π.χ. info@nglgreece.gr)
// με Προς / Κοιν. / Bcc / θέμα / κείμενο και το PDF συνημμένο, και ανοίγει στο Gmail (σελίδα ή εφαρμογή)· ο χρήστης πατά «Αποστολή».
// Χωρίς Client ID: κινητό → κοινοποίηση του PDF στην εφαρμογή Gmail (οι διευθύνσεις αντιγράφονται)· υπολογιστής → λήψη PDF + Gmail έτοιμο.
import { esc, download } from './util.js';
import { senderFor, gmailUrl } from './mail.js';
import { googleToken, driveReady } from './drive.js';
import { copyText } from './mail.js';

const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
const UA = navigator.userAgent || '';
export const isIOS = () => /iPad|iPhone|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/i.test(UA);
const isMobile = () => isIOS() || isAndroid();

// Διευθύνσεις από ελεύθερο κείμενο: «Όνομα <email>», αριθμημένες λίστες, κόμματα, αλλαγές γραμμής
const list = (x) => [...new Map((String(x || '').match(/[^\s<>,;:"'()]+@[^\s<>,;:"'()]+\.[A-Za-z]{2,}/g) || []).map((e) => [e.toLowerCase(), e])).values()];
// Bcc χωρίς όσους είναι ήδη σε Προς/Κοιν.
export const bccWithout = (bcc, ...others) => { const o = new Set(others.flatMap((x) => list(x)).map((e) => e.toLowerCase())); return list(bcc).filter((e) => !o.has(e.toLowerCase())).join(', '); };

const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
const u8b64 = (str) => b64(new TextEncoder().encode(str));
const hdr = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${u8b64(s)}?=`);
const wrap = (s) => s.replace(/.{1,76}/g, '$&\r\n');
export function buildMime({ from, to, cc, bcc, subject, body, attachments = [] }) {
  const B = 'nglg_' + Math.random().toString(36).slice(2);
  const h = [`From: ${from}`, `To: ${list(to).join(', ')}`, list(cc).length && `Cc: ${list(cc).join(', ')}`, list(bcc).length && `Bcc: ${list(bcc).join(', ')}`,
    `Subject: ${hdr(subject || '')}`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${B}"`].filter(Boolean).join('\r\n');
  let m = `${h}\r\n\r\n--${B}\r\nContent-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(u8b64(body || ''))}`;
  for (const a of attachments) {
    m += `\r\n--${B}\r\nContent-Type: ${a.type}; name="${hdr(a.name)}"\r\nContent-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(a.name)}\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(a.b64)}`;
  }
  return m + `\r\n--${B}--\r\n`;
}

// → { id, messageId }
export async function createDraft(msg, attachments, kind) {
  const from = senderFor(kind), token = await googleToken(GMAIL_SCOPE, from);
  const raw = btoa(buildMime({ ...msg, from, attachments })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { raw } }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Gmail ${r.status}: ${(j.error && j.error.message) || r.statusText}`); }
  const j = await r.json();
  return { id: j.id, messageId: j.message && j.message.id };
}
// Σύνδεσμοι ανοίγματος του Προχείρου
export const draftWebUrl = (kind, messageId) => `https://mail.google.com/mail/u/${encodeURIComponent(senderFor(kind))}/#drafts${messageId ? '?compose=' + messageId : ''}`;
export const gmailAppUrl = (kind, messageId) => (isIOS() ? 'googlegmail:///'
  : isAndroid() ? `intent://mail.google.com/mail/#Intent;scheme=https;package=com.google.android.gm;S.browser_fallback_url=${encodeURIComponent(draftWebUrl(kind, messageId))};end`
    : draftWebUrl(kind, messageId));

const blobB64 = async (blob) => b64(new Uint8Array(await blob.arrayBuffer()));
const chips = (xs) => list(xs).map((e) => `<span class="mchip">${esc(e)}</span>`).join('') || '<span class="muted">—</span>';

// Καρτέλα αποστολής: getMsg() → { to, cc, bcc, subject, body }, getPdf() → Promise<{ blob, name }>
export function mailSheet(el, { getMsg, getPdf, kind = 'general', pdfName = '', onDone = null }) {
  const box = el.querySelector('.mailsheet');
  const render = () => {
    const m = getMsg();
    box.innerHTML = `<div class="ms-head"><span class="ms-g">M</span><div><b>Gmail</b> · <span class="muted">${esc(senderFor(kind))}</span></div></div>
<div class="ms-row"><span>Προς</span><div>${chips(m.to)}</div></div><div class="ms-row"><span>Κοιν.</span><div>${chips(m.cc)}</div></div><div class="ms-row"><span>Bcc</span><div>${chips(m.bcc)}</div></div>
<div class="ms-row"><span>Θέμα</span><div><b>${esc(m.subject || '')}</b></div></div>
<div class="ms-row"><span>📎</span><div><span class="mchip att">${esc(pdfName || 'PDF επιστολής')}.pdf</span></div></div>
<div class="ms-acts"><button type="button" class="btn primary big" data-ms="go">✉ Άνοιγμα στο Gmail με το PDF</button></div><div class="ms-state muted"></div>`;
    box.querySelector('[data-ms=go]').onclick = go;
  };
  const state = (h) => { box.querySelector('.ms-state').innerHTML = h; };
  async function go(ev) {
    const b = ev.currentTarget, m = getMsg(), desktop = !isMobile();
    b.disabled = true;
    const win = desktop ? window.open('about:blank', '_blank') : null; // πριν από την αναμονή, ώστε να μη μπλοκαριστεί
    try {
      state('⏳ Ετοιμάζεται το PDF…');
      const pdf = await getPdf();
      if (driveReady()) {
        state('⏳ Δημιουργείται το email στο Gmail…');
        const d = await createDraft(m, [{ name: pdf.name, type: 'application/pdf', b64: await blobB64(pdf.blob) }], kind);
        const app = gmailAppUrl(kind, d.messageId);
        if (win) win.location.href = draftWebUrl(kind, d.messageId);
        state(`<div class="ms-ok">✓ Το email είναι έτοιμο στα <b>Πρόχειρα</b> του Gmail (${esc(senderFor(kind))}) με το PDF συνημμένο — πατήστε «Αποστολή» στο Gmail.</div>
<a class="btn primary" href="${esc(app)}"${desktop ? ' target="_blank" rel="noopener"' : ''}>✉ Άνοιγμα Gmail</a>${isMobile() ? ' <small class="muted">Στην εφαρμογή Gmail: Μενού → Πρόχειρα.</small>' : ''}`);
        if (onDone) onDone();
        return;
      }
      // Χωρίς σύνδεση Google
      const file = new File([pdf.blob], pdf.name, { type: 'application/pdf' });
      if (!desktop && navigator.canShare && navigator.canShare({ files: [file] })) {
        if (win) win.close();
        await copyText([m.to, m.cc, m.bcc].filter(Boolean).join(', '));
        state(`<div class="ms-ok">Οι διευθύνσεις αντιγράφηκαν. Πατήστε «Κοινοποίηση» και επιλέξτε <b>Gmail</b>· επικολλήστε τις διευθύνσεις.</div>
<button type="button" class="btn primary" data-ms="share">📎 Κοινοποίηση PDF στο Gmail</button>`);
        box.querySelector('[data-ms=share]').onclick = () => navigator.share({ files: [file], title: m.subject, text: m.body }).then(() => onDone && onDone()).catch(() => {});
        return;
      }
      download(pdf.name, pdf.blob, 'application/pdf');
      const url = gmailUrl({ ...m, kind });
      if (win) win.location.href = url; else window.open(url, '_blank', 'noopener');
      state('<div class="ms-ok">Το PDF κατέβηκε· σύρετέ το στο email του Gmail. <small class="muted">(Με το Google Client ID στις Ρυθμίσεις επισυνάπτεται αυτόματα.)</small></div>');
      if (onDone) onDone();
    } catch (e) {
      if (win) win.close();
      state(`<span class="warn">${esc(e.message || e)}</span>`);
    } finally { b.disabled = false; }
  }
  render();
  return { render };
}
