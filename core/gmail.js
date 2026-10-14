// Αποστολή με Gmail και συνημμένο PDF, σε υπολογιστή, tablet και κινητό (Android, iPhone).
// Με Google Client ID (Ρυθμίσεις → Google): δημιουργείται «Πρόχειρο» στο Gmail του λογαριασμού αποστολής (π.χ. info@nglgreece.gr)
// με Προς / Κοιν. / Bcc / θέμα / κείμενο και το PDF συνημμένο, και ανοίγει στο Gmail (σελίδα ή εφαρμογή)· ο χρήστης πατά «Αποστολή».
// Χωρίς Client ID: κινητό → κοινοποίηση του PDF στην εφαρμογή Gmail (οι διευθύνσεις αντιγράφονται)· υπολογιστής → λήψη PDF + Gmail έτοιμο.
import { esc, download } from './util.js';
import { senderFor, gmailUrl, withMailHeader, MAIL_HEADER } from './mail.js';
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
// Κείμενο email σε HTML: θυρεός (80px), «ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ» (μπλε, έντονα 16px), «Μεγάλη Γραμματεία» (14px), μετά το κείμενο
const LOGO_CID = 'nglg-emblem';
export function mailHtml(body) {
  const t = String(body || '').replace(/^\s+/, '').replace(new RegExp('^' + MAIL_HEADER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*'), '');
  const txt = esc(t).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>').replace(/\r?\n/g, '<br>');
  return `<!doctype html><html><body style="margin:0;padding:0"><div style="font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.55;color:#1f2a44">
<div style="text-align:center;margin:0 0 18px"><img src="cid:${LOGO_CID}" alt="ΕΜΣτΕ" height="80" style="height:80px;width:auto;display:block;margin:0 auto 6px">
<div style="color:#1d2f5e;font-weight:bold;font-size:16px;letter-spacing:.02em">ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ</div><div style="font-size:14px;font-weight:normal;color:#1f2a44">Μεγάλη Γραμματεία</div></div>
<div>${txt}</div></div></body></html>`;
}
let logoB64 = null;
async function loadLogo() {
  if (logoB64 !== null) return logoB64;
  try { const r = await fetch(new URL('../img/header_emblem.png', import.meta.url)); logoB64 = r.ok ? b64(new Uint8Array(await r.arrayBuffer())) : ''; } catch { logoB64 = ''; }
  return logoB64;
}
export function buildMime({ from, to, cc, bcc, subject, body, attachments = [], logo = '' }) {
  const B = 'nglg_' + Math.random().toString(36).slice(2), A = B + '_alt', R = B + '_rel';
  const h = [`From: ${from}`, `To: ${list(to).join(', ')}`, list(cc).length && `Cc: ${list(cc).join(', ')}`, list(bcc).length && `Bcc: ${list(bcc).join(', ')}`,
    `Subject: ${hdr(subject || '')}`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${B}"`].filter(Boolean).join('\r\n');
  const plain = `Content-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(u8b64(withMailHeader(body)))}`;
  const html = `Content-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(u8b64(mailHtml(body)))}`;
  const alt = `Content-Type: multipart/alternative; boundary="${A}"\r\n\r\n--${A}\r\n${plain}\r\n--${A}\r\n${html}\r\n--${A}--`;
  const part = logo
    ? `Content-Type: multipart/related; boundary="${R}"\r\n\r\n--${R}\r\n${alt}\r\n--${R}\r\nContent-Type: image/png; name="emblem.png"\r\nContent-ID: <${LOGO_CID}>\r\nContent-Disposition: inline; filename="emblem.png"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(logo)}\r\n--${R}--`
    : alt;
  let m = `${h}\r\n\r\n--${B}\r\n${part}`;
  for (const a of attachments) {
    m += `\r\n--${B}\r\nContent-Type: ${a.type}; name="${hdr(a.name)}"\r\nContent-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(a.name)}\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(a.b64)}`;
  }
  return m + `\r\n--${B}--\r\n`;
}

// → { id, messageId }
export async function createDraft(msg, attachments, kind) {
  const from = senderFor(kind), token = await googleToken(GMAIL_SCOPE, from);
  const raw = btoa(buildMime({ ...msg, from, attachments, logo: await loadLogo() })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ message: { raw } }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Gmail ${r.status}: ${(j.error && j.error.message) || r.statusText}`); }
  const j = await r.json();
  return { id: j.id, messageId: j.message && j.message.id };
}
// Άμεση αποστολή από τον λογαριασμό αποστολής (π.χ. info@nglgreece.gr) → { id }
// Ελέγχεται πρώτα ότι ο συνδεδεμένος λογαριασμός Google είναι ο σωστός, ώστε να μη φύγει από άλλο email.
export async function sendNow(msg, attachments, kind) {
  const from = senderFor(kind), token = await googleToken(GMAIL_SCOPE, from), H = { Authorization: `Bearer ${token}` };
  const pr = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: H });
  if (pr.ok) {
    const me = String((await pr.json()).emailAddress || '').toLowerCase();
    if (me && me !== from.toLowerCase()) throw new Error(`Ο λογαριασμός Google που επιλέχθηκε είναι ${me}, όχι ${from}. Δεν στάλθηκε τίποτα — πατήστε ξανά και επιλέξτε τον ${from}.`);
  }
  const raw = btoa(buildMime({ ...msg, from, attachments, logo: await loadLogo() })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Gmail ${r.status}: ${(j.error && j.error.message) || r.statusText}`); }
  return r.json();
}
// Σύνδεσμοι ανοίγματος του Προχείρου
export const draftWebUrl = (kind, messageId) => `https://mail.google.com/mail/u/${encodeURIComponent(senderFor(kind))}/#drafts${messageId ? '?compose=' + messageId : ''}`;
export const gmailAppUrl = (kind, messageId) => (isIOS() ? 'googlegmail:///'
  : isAndroid() ? `intent://mail.google.com/mail/#Intent;scheme=https;package=com.google.android.gm;S.browser_fallback_url=${encodeURIComponent(draftWebUrl(kind, messageId))};end`
    : draftWebUrl(kind, messageId));

const blobB64 = async (blob) => b64(new Uint8Array(await blob.arrayBuffer()));
const chips = (xs) => list(xs).map((e) => `<span class="mchip">${esc(e)}</span>`).join('') || '<span class="muted">—</span>';

// Καρτέλα αποστολής: getMsg() → { to, cc, bcc, subject, body }, getPdf() → Promise<{ blob, name }>
// onSent: καλείται μετά την άμεση αποστολή (π.χ. σημείωση «ενημερώθηκε»)
export function mailSheet(el, { getMsg, getPdf, kind = 'general', pdfName = '', onDone = null, onSent = null }) {
  const box = el.querySelector('.mailsheet');
  const render = () => {
    const m = getMsg();
    box.innerHTML = `<div class="ms-head"><span class="ms-g">M</span><div><b>Gmail</b> · <span class="muted">${esc(senderFor(kind))}</span></div></div>
<div class="ms-row"><span>Προς</span><div>${chips(m.to)}</div></div><div class="ms-row"><span>Κοιν.</span><div>${chips(m.cc)}</div></div><div class="ms-row"><span>Bcc</span><div>${chips(m.bcc)}</div></div>
<div class="ms-row"><span>Θέμα</span><div><b>${esc(m.subject || '')}</b></div></div>
<div class="ms-row"><span>📎</span><div><span class="mchip att">${esc(pdfName || 'PDF επιστολής')}.pdf</span></div></div>
<div class="ms-acts"><button type="button" class="btn primary big" data-ms="send">📤 Αποστολή τώρα από ${esc(senderFor(kind))}</button>
<button type="button" class="btn big" data-ms="go">✉ Άνοιγμα στο Gmail με το PDF (έλεγχος πριν την αποστολή)</button></div><div class="ms-state muted"></div>`;
    box.querySelector('[data-ms=go]').onclick = go;
    box.querySelector('[data-ms=send]').onclick = send;
  };
  const state = (h) => { box.querySelector('.ms-state').innerHTML = h; };
  async function send(ev) {
    const b = ev.currentTarget, from = senderFor(kind);
    let m = getMsg();
    if (!list(m.to).length) { state('<span class="warn">Συμπληρώστε τον παραλήπτη (Προς).</span>'); return; }
    if (!driveReady()) { state('<span class="warn">Για άμεση αποστολή χρειάζεται το Google Client ID (Ρυθμίσεις → Google). Μέχρι τότε χρησιμοποιήστε «Άνοιγμα στο Gmail».</span>'); return; }
    const n = list(m.bcc).length;
    if (!window.confirm(`Αποστολή τώρα από ${from};\n\nΠρος: ${list(m.to).join(', ')}${list(m.cc).length ? `\nΚοιν.: ${list(m.cc).join(', ')}` : ''}${n ? `\nBcc: ${n} παραλήπτες` : ''}\nΘέμα: ${m.subject || ''}\nΣυνημμένο: ${pdfName || 'PDF επιστολής'}.pdf`)) return;
    box.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try {
      state('⏳ Ετοιμάζεται το PDF…');
      const pdf = await getPdf();
      m = getMsg();
      state(`⏳ Αποστολή από ${esc(from)}…`);
      await sendNow(m, [{ name: pdf.name, type: 'application/pdf', b64: await blobB64(pdf.blob) }], kind);
      state(`<div class="ms-ok">✓ Το email στάλθηκε από <b>${esc(from)}</b> με το PDF συνημμένο (θα το βρείτε στα «Απεσταλμένα» του Gmail).</div>`);
      b.textContent = '✓ Στάλθηκε';
      if (onSent) await onSent();
    } catch (e) {
      state(`<span class="warn">${esc(e.message || e)}</span>`);
      box.querySelectorAll('button').forEach((x) => { x.disabled = false; });
    }
  }
  async function go(ev) {
    const b = ev.currentTarget, desktop = !isMobile();
    let m = getMsg();
    b.disabled = true;
    const win = desktop ? window.open('about:blank', '_blank') : null; // πριν από την αναμονή, ώστε να μη μπλοκαριστεί
    try {
      state('⏳ Ετοιμάζεται το PDF…');
      const pdf = await getPdf();
      m = getMsg(); // π.χ. ο Αρ. Πρωτ. στο θέμα, αν η επιστολή μόλις δημιουργήθηκε
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
        box.querySelector('[data-ms=share]').onclick = () => navigator.share({ files: [file], title: m.subject, text: withMailHeader(m.body) }).then(() => onDone && onDone()).catch(() => {});
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
