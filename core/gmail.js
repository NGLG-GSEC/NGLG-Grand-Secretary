// Αποστολή με Gmail και συνημμένο PDF, σε υπολογιστή, tablet και κινητό (Android, iPhone).
// Με Google Client ID (Ρυθμίσεις → Google): δημιουργείται «Πρόχειρο» στο Gmail του λογαριασμού αποστολής (π.χ. info@nglgreece.gr)
// με Προς / Κοιν. / Bcc / θέμα / κείμενο και το PDF συνημμένο, και ανοίγει στο Gmail (σελίδα ή εφαρμογή)· ο χρήστης πατά «Αποστολή».
// Χωρίς Client ID: κινητό → κοινοποίηση του PDF στην εφαρμογή Gmail (οι διευθύνσεις αντιγράφονται)· υπολογιστής → λήψη PDF + Gmail έτοιμο.
import { esc, download } from './util.js';
import { senderFor, gmailUrl, withMailHeader, MAIL_HEADER, MAIL_SENDERS } from './mail.js';
import { richPlain, richHtml } from './rich.js';
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
  const txt = richHtml(t).replace(/\r?\n/g, '<br>');
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
// htmlBody: έτοιμο HTML (π.χ. ευχές με την πλακέτα) αντί του προεπιλεγμένου με τον θυρεό
export function buildMime({ from, to, cc, bcc, subject, body, attachments = [], logo = '', htmlBody = '' }) {
  const B = 'nglg_' + Math.random().toString(36).slice(2), A = B + '_alt', R = B + '_rel';
  const h = [`From: ${from}`, `To: ${list(to).join(', ')}`, list(cc).length && `Cc: ${list(cc).join(', ')}`, list(bcc).length && `Bcc: ${list(bcc).join(', ')}`,
    `Subject: ${hdr(subject || '')}`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${B}"`].filter(Boolean).join('\r\n');
  const plain = `Content-Type: text/plain; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(u8b64(richPlain(withMailHeader(body))))}`;
  const html = `Content-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap(u8b64(htmlBody || mailHtml(body)))}`;
  const alt = `Content-Type: multipart/alternative; boundary="${A}"\r\n\r\n--${A}\r\n${plain}\r\n--${A}\r\n${html}\r\n--${A}--`;
  const part = logo && !htmlBody
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
  const raw = btoa(buildMime({ ...msg, from, attachments, logo: msg.htmlBody ? '' : await loadLogo() })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
  const raw = btoa(buildMime({ ...msg, from, attachments, logo: msg.htmlBody ? '' : await loadLogo() })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', { method: 'POST', headers: { ...H, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw }) });
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Gmail ${r.status}: ${(j.error && j.error.message) || r.statusText}`); }
  return r.json();
}
// Σύνδεσμοι ανοίγματος του Προχείρου
export const draftWebUrl = (kind, messageId) => `https://mail.google.com/mail/u/${encodeURIComponent(senderFor(kind))}/#drafts${messageId ? '?compose=' + messageId : ''}`;
export const gmailAppUrl = (kind, messageId) => (isIOS() ? 'googlegmail:///'
  : isAndroid() ? `intent://mail.google.com/mail/#Intent;scheme=https;package=com.google.android.gm;S.browser_fallback_url=${encodeURIComponent(draftWebUrl(kind, messageId))};end`
    : draftWebUrl(kind, messageId));

// Προεπισκόπηση πριν από κάθε άμεση αποστολή: Από / Προς / Κοιν. / Bcc / Θέμα / το κείμενο όπως θα φτάσει / συνημμένα → επιβεβαίωση
// → Promise<boolean> (true μόνο με «Επιβεβαίωση αποστολής»)
export function confirmSend({ from, msg, attachments = [], note = '' }) {
  return new Promise((done) => {
    const html = (msg.htmlBody || mailHtml(msg.body)).replace(`cid:${LOGO_CID}`, new URL('../img/header_emblem.png', import.meta.url).href);
    const ov = Object.assign(document.createElement('div'), { className: 'gprev send-preview' });
    ov.innerHTML = `<div class="gprev-box" role="dialog" aria-label="Προεπισκόπηση πριν την αποστολή"><div class="gprev-bar"><b>👁 Προεπισκόπηση πριν την αποστολή</b><button type="button" class="btn small" data-no>✕</button></div>
<div class="ms-row"><span>Από</span><div><b>${esc(from)}</b></div></div><div class="ms-row"><span>Προς</span><div>${chips(msg.to)}</div></div>
<div class="ms-row"><span>Κοιν.</span><div>${chips(msg.cc)}</div></div><div class="ms-row"><span>Bcc</span><div>${chips(msg.bcc)}</div></div>
<div class="ms-row"><span>Θέμα</span><div><b>${esc(msg.subject || '')}</b></div></div>
<div class="ms-row"><span>📎</span><div>${attachments.length ? attachments.map((a) => `<span class="mchip att">${esc(a)}</span>`).join('') : '<span class="muted">χωρίς συνημμένο</span>'}</div></div>
<p class="muted" style="margin:10px 0 4px">Κείμενο του email:</p><iframe class="send-preview-body" title="Κείμενο του email" sandbox="" srcdoc="${esc(html)}"></iframe>
${note ? `<p class="warn">${esc(note)}</p>` : ''}<div class="toolbar" style="margin-top:12px"><button type="button" class="btn primary big" data-yes>📤 Επιβεβαίωση αποστολής</button><button type="button" class="btn big" data-no>Άκυρο</button></div></div>`;
    const close = (v) => { ov.remove(); document.removeEventListener('keydown', key); done(v); };
    const key = (e) => { if (e.key === 'Escape') close(false); };
    ov.addEventListener('click', (e) => { if (e.target.closest('[data-yes]')) close(true); else if (e.target === ov || e.target.closest('[data-no]')) close(false); });
    document.addEventListener('keydown', key);
    document.body.append(ov);
  });
}

const blobB64 = async (blob) => b64(new Uint8Array(await blob.arrayBuffer()));
const chips = (xs) => list(xs).map((e) => `<span class="mchip">${esc(e)}</span>`).join('') || '<span class="muted">—</span>';

// Καρτέλα αποστολής: getMsg() → { to, cc, bcc, subject, body }, getPdf() → Promise<{ blob, name }>
// onSent: καλείται μετά την άμεση αποστολή (π.χ. σημείωση «ενημερώθηκε»)· onKind(kind): αλλαγή λογαριασμού αποστολής
// extras: πρόσθετα συνημμένα [{ label, name, load: () => Promise<{ blob, name }> }] (π.χ. ο εγκεκριμένος Εσωτερικός Κανονισμός) — επιλογή με κουτάκι
export function mailSheet(el, { getMsg: baseMsg, getPdf, kind = 'general', pdfName = '', onDone = null, onSent = null, onKind = null, extras = [] }) {
  const box = el.querySelector('.mailsheet');
  // Προς / Κοιν. / Bcc διορθώνονται εδώ (χειρόγραφα email ή από τις Επαφές) και υπερισχύουν των αρχικών
  const edits = {}, getMsg = () => ({ ...baseMsg(), ...edits }), extraOn = extras.map(() => true);
  const extraFiles = async () => Promise.all(extras.filter((_, i) => extraOn[i]).map(async (x) => { const f = await x.load(); return { name: f.name || x.name, type: 'application/pdf', blob: f.blob }; }));
  const allAttachments = async (pdf) => [{ name: pdf.name, type: 'application/pdf', b64: await blobB64(pdf.blob) }, ...await Promise.all((await extraFiles()).map(async (f) => ({ name: f.name, type: f.type, b64: await blobB64(f.blob) })))];
  const field = (f, label, m) => `<div class="ms-row"><span>${label}</span><div><input class="ms-input" data-f="${f}" value="${esc(list(m[f]).join(', '))}" placeholder="email, χωρισμένα με κόμμα" inputmode="email" autocomplete="off">
<input class="ms-pick" data-pick="${f}" placeholder="🔎 + από τις Επαφές (όνομα, ομάδα ή email)…" autocomplete="off"></div></div>`;
  const render = () => {
    const m = getMsg();
    box.innerHTML = `<div class="ms-head"><span class="ms-g">M</span><div><b>Gmail</b> · <label class="ms-from">Αποστολή από <select data-ms="from">${Object.entries(MAIL_SENDERS).map(([k, v]) => `<option value="${k}"${k === kind ? ' selected' : ''}>${esc(senderFor(k))} — ${esc(v.label)}</option>`).join('')}</select></label></div></div>
${field('to', 'Προς', m)}${field('cc', 'Κοιν.', m)}${field('bcc', 'Bcc', m)}
<div class="ms-row"><span>Θέμα</span><div><b>${esc(m.subject || '')}</b></div></div>
<div class="ms-row"><span>📎</span><div><span class="mchip att">${esc(pdfName || 'PDF επιστολής')}.pdf</span>${extras.map((x, i) => `<label class="ms-extra"><input type="checkbox" data-extra="${i}"${extraOn[i] ? ' checked' : ''}> ${esc(x.label || x.name)}</label>`).join('')}</div></div>
<div class="ms-acts"><button type="button" class="btn primary big" data-ms="send">📤 Αποστολή τώρα από ${esc(senderFor(kind))}</button>
<button type="button" class="btn big" data-ms="go">✉ Άνοιγμα στο Gmail με το PDF (έλεγχος πριν την αποστολή)</button></div><div class="ms-state muted"></div>`;
    for (const i of box.querySelectorAll('.ms-input')) i.addEventListener('input', () => { edits[i.dataset.f] = i.value; });
    for (const c of box.querySelectorAll('[data-extra]')) c.addEventListener('change', () => { extraOn[Number(c.dataset.extra)] = c.checked; });
    import('./pickers.js').then(({ attachPicker, contactItems }) => {
      for (const p of box.querySelectorAll('.ms-pick')) attachPicker(p, contactItems, (c) => {
        const inp = box.querySelector(`.ms-input[data-f="${p.dataset.pick}"]`), add = list(c.email);
        if (!add.length) { state('<span class="warn">Η επαφή δεν έχει email.</span>'); return; }
        inp.value = [...new Map([...list(inp.value), ...add].map((e) => [e.toLowerCase(), e])).values()].join(', ');
        edits[p.dataset.pick] = inp.value; p.value = '';
      });
    });
    box.querySelector('[data-ms=from]').onchange = async (e) => { kind = e.target.value; render(); if (onKind) await onKind(kind); };
    box.querySelector('[data-ms=go]').onclick = go;
    box.querySelector('[data-ms=send]').onclick = send;
  };
  const state = (h) => { box.querySelector('.ms-state').innerHTML = h; };
  async function send(ev) {
    const b = ev.currentTarget, from = senderFor(kind);
    let m = getMsg();
    if (!list(m.to).length) { state('<span class="warn">Συμπληρώστε τον παραλήπτη (Προς).</span>'); return; }
    if (!driveReady()) { state('<span class="warn">Για άμεση αποστολή χρειάζεται το Google Client ID (Ρυθμίσεις → Google). Μέχρι τότε χρησιμοποιήστε «Άνοιγμα στο Gmail».</span>'); return; }
    if (!await confirmSend({ from, msg: m, attachments: [`${pdfName || 'PDF επιστολής'}.pdf`, ...extras.filter((_, i) => extraOn[i]).map((x) => x.name)] })) return;
    box.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try {
      state('⏳ Ετοιμάζεται το PDF…');
      const pdf = await getPdf();
      m = getMsg();
      state(`⏳ Αποστολή από ${esc(from)}…`);
      await sendNow(m, await allAttachments(pdf), kind);
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
        const d = await createDraft(m, await allAttachments(pdf), kind);
        const app = gmailAppUrl(kind, d.messageId);
        if (win) win.location.href = draftWebUrl(kind, d.messageId);
        state(`<div class="ms-ok">✓ Το email είναι έτοιμο στα <b>Πρόχειρα</b> του Gmail (${esc(senderFor(kind))}) με το PDF συνημμένο — πατήστε «Αποστολή» στο Gmail.</div>
<a class="btn primary" href="${esc(app)}"${desktop ? ' target="_blank" rel="noopener"' : ''}>✉ Άνοιγμα Gmail</a>${isMobile() ? ' <small class="muted">Στην εφαρμογή Gmail: Μενού → Πρόχειρα.</small>' : ''}`);
        if (onDone) onDone();
        return;
      }
      // Χωρίς σύνδεση Google
      const file = new File([pdf.blob], pdf.name, { type: 'application/pdf' }), files = [file, ...(await extraFiles()).map((x) => new File([x.blob], x.name, { type: x.type }))];
      if (!desktop && navigator.canShare && navigator.canShare({ files })) {
        if (win) win.close();
        await copyText([m.to, m.cc, m.bcc].filter(Boolean).join(', '));
        state(`<div class="ms-ok">Οι διευθύνσεις αντιγράφηκαν. Πατήστε «Κοινοποίηση» και επιλέξτε <b>Gmail</b>· επικολλήστε τις διευθύνσεις.</div>
<button type="button" class="btn primary" data-ms="share">📎 Κοινοποίηση PDF στο Gmail</button>`);
        box.querySelector('[data-ms=share]').onclick = () => navigator.share({ files, title: m.subject, text: richPlain(withMailHeader(m.body)) }).then(() => onDone && onDone()).catch(() => {});
        return;
      }
      download(pdf.name, pdf.blob, 'application/pdf');
      for (const x of files.slice(1)) download(x.name, x, x.type);
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
