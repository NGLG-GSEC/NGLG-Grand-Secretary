// Email: όλα τα μηνύματα ανοίγουν έτοιμα στο Gmail (παραλήπτες, θέμα, κείμενο) από τον σωστό λογαριασμό·
// ο χρήστης πατά «Αποστολή». Δύο λογαριασμοί αποστολής (Ρυθμίσεις):
//   official → Επιστολές & Διατάγματα (grand.secretary@nglgreece.gr)
//   general  → όλα τα υπόλοιπα (info@nglgreece.gr)
import { db } from './store.js';
import { esc, EMAIL_RE, splitEmails } from './util.js';

export const MAIL_SENDERS = {
  official: { key: 'mail_from_official', def: 'grand.secretary@nglgreece.gr', label: 'Επιστολές & Διατάγματα' },
  general: { key: 'mail_from_general', def: 'info@nglgreece.gr', label: 'Γενικά εξερχόμενα' },
};
db.defaultSettings({ mail_from_official: MAIL_SENDERS.official.def, mail_from_general: MAIL_SENDERS.general.def });

export function senderFor(kind = 'general') {
  const s = MAIL_SENDERS[kind], v = String(db.setting(s.key) || '').trim();
  return EMAIL_RE.test(v) ? v : s.def;
}

const list = (x) => (Array.isArray(x) ? x : splitEmails(x)).filter(Boolean).join(',');
export function gmailUrl({ to = '', cc = '', bcc = '', subject = '', body = '', kind = 'general' }) {
  const p = new URLSearchParams({ authuser: senderFor(kind), view: 'cm', fs: '1', to: list(to) });
  if (list(cc)) p.set('cc', list(cc));
  if (list(bcc)) p.set('bcc', list(bcc));
  p.set('su', subject); p.set('body', body);
  return 'https://mail.google.com/mail/u/?' + p.toString().replace(/\+/g, '%20');
}
export function mailtoUrl({ to = '', cc = '', bcc = '', subject = '', body = '' }) {
  const q = [cc && 'cc=' + encodeURIComponent(list(cc)), bcc && 'bcc=' + encodeURIComponent(list(bcc)), 'subject=' + encodeURIComponent(subject), 'body=' + encodeURIComponent(body)].filter(Boolean);
  return 'mailto:' + encodeURIComponent(list(to)).replace(/%40/g, '@').replace(/%2C/g, ',') + '?' + q.join('&');
}

export function senderBanner(kind) {
  return `<div class="card sender-box"><b>✉ Αποστολή από: ${esc(senderFor(kind))}</b> <span class="muted">(${esc(MAIL_SENDERS[kind].label)})</span><br>
<small class="muted">Ανοίγει το Gmail με αυτόν τον λογαριασμό — βεβαιωθείτε ότι είστε συνδεδεμένοι σε αυτόν. Αλλαγή: Διαχείριση → Ρυθμίσεις.</small></div>`;
}

// Κουμπιά αποστολής: Gmail (κύριο) και εναλλακτικά η εφαρμογή email της συσκευής.
export function mailButtons(msg, label = '✉ Άνοιγμα στο Gmail') {
  return `<a class="btn primary" target="_blank" rel="noopener" href="${esc(gmailUrl(msg))}">${esc(label)}</a>
<a class="btn" href="${esc(mailtoUrl(msg))}">📱 Εφαρμογή email συσκευής</a>`;
}

// Αντιγραφή μορφοποιημένου μηνύματος (HTML) για επικόλληση στο Gmail (π.χ. ευχές με τη «πλακέτα»).
export async function copyHtml(html, text) {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text || ''], { type: 'text/plain' }) })]);
    return true;
  } catch {
    const div = Object.assign(document.createElement('div'), { innerHTML: html, contentEditable: 'true' });
    Object.assign(div.style, { position: 'fixed', left: '-9999px' });
    document.body.appendChild(div);
    const r = document.createRange(); r.selectNodeContents(div);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    const ok = document.execCommand('copy'); div.remove(); s.removeAllRanges();
    return ok;
  }
}
export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch { prompt('Αντιγραφή:', t); return false; }
}
