// Μορφοποίηση κειμένου (Έντονα, Πλάγια, Μέγεθος) σε επιλεγμένο τμήμα: το κείμενο μένει απλό, με σημάνσεις
//   [b]…[/b]  [i]…[/i]  [size=14]…[/size]   (μέγεθος σε pt)
// richHtml → έντυπο/PDF/email HTML · richPlain → απλό κείμενο (email χωρίς HTML, WhatsApp) · richRuns → Word
import { esc, linkify } from './util.js';

export const SIZES = [['9', 'Μικρά'], ['13', 'Μεγάλα'], ['16', 'Πολύ μεγάλα'], ['20', 'Τίτλος']];
const TAG = /\[(\/?)(b|i|size)(?:=(\d{1,2}))?\]/g;
const okSize = (n) => Math.min(36, Math.max(6, Number(n) || 11.5));

export const richPlain = (t) => String(t ?? '').replace(TAG, '');

// Ζεύγη σημάνσεων → HTML (ανοιχτές/μονές σημάνσεις απλώς αφαιρούνται)
export function richHtml(t, { links = true } = {}) {
  let h = links ? linkify(t) : esc(t), prev;
  do {
    prev = h;
    h = h.replace(/\[b\]([\s\S]*?)\[\/b\]/g, '<b>$1</b>').replace(/\[i\]([\s\S]*?)\[\/i\]/g, '<i>$1</i>')
      .replace(/\[size=(\d{1,2})\]([\s\S]*?)\[\/size\]/g, (_, n, x) => `<span style="font-size:${okSize(n)}pt">${x}</span>`);
  } while (h !== prev);
  return h.replace(TAG, '');
}

// → [{ text, bold, italic, size }] για το Word
export function richRuns(t) {
  const out = [], st = { b: 0, i: 0, size: [] };
  let last = 0, m;
  const push = (s) => { if (s) out.push({ text: s, bold: st.b > 0, italic: st.i > 0, size: st.size.length ? okSize(st.size[st.size.length - 1]) : null }); };
  const s = String(t ?? '');
  TAG.lastIndex = 0;
  while ((m = TAG.exec(s))) {
    push(s.slice(last, m.index)); last = TAG.lastIndex;
    const close = m[1] === '/', k = m[2];
    if (k === 'size') { if (close) st.size.pop(); else st.size.push(m[3]); } else st[k] = Math.max(0, st[k] + (close ? -1 : 1));
  }
  push(s.slice(last));
  return out;
}

// Μπάρα μορφοποίησης πάνω από ένα textarea: τυλίγει το επιλεγμένο κείμενο
export function formatBar(ta) {
  if (!ta || ta.dataset.richBar) return;
  ta.dataset.richBar = '1';
  const bar = document.createElement('div');
  bar.className = 'richbar noprint';
  bar.innerHTML = `<button type="button" data-w="b" title="Έντονα (Ctrl+B)"><b>B</b></button><button type="button" data-w="i" title="Πλάγια (Ctrl+I)"><i>I</i></button>
<select data-w="size" title="Μέγεθος γραμμάτων"><option value="">Μέγεθος…</option>${SIZES.map(([v, l]) => `<option value="${v}">${l} (${v})</option>`).join('')}</select>
<button type="button" data-w="clear" title="Αφαίρεση μορφοποίησης από την επιλογή">✕ Καθαρισμός</button><small class="muted">Επιλέξτε κείμενο και πατήστε.</small>`;
  ta.before(bar);
  const wrap = (open, close) => {
    const a = ta.selectionStart, z = ta.selectionEnd, v = ta.value;
    if (a === z) { ta.focus(); return; }
    ta.value = v.slice(0, a) + open + v.slice(a, z) + close + v.slice(z);
    ta.setSelectionRange(a + open.length, z + open.length);
    ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const clear = () => {
    const a = ta.selectionStart, z = ta.selectionEnd, v = ta.value;
    const sel = a === z ? v : v.slice(a, z), clean = richPlain(sel);
    ta.value = a === z ? clean : v.slice(0, a) + clean + v.slice(z);
    ta.focus(); ta.dispatchEvent(new Event('input', { bubbles: true }));
  };
  bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) e.preventDefault(); }); // να μη χαθεί η επιλογή
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.w === 'clear') clear(); else wrap(`[${b.dataset.w}]`, `[/${b.dataset.w}]`);
  });
  const sel = bar.querySelector('select');
  sel.addEventListener('change', () => { // το textarea κρατά την επιλογή του και μετά την απώλεια εστίασης
    const n = sel.value; sel.value = '';
    if (n) wrap(`[size=${n}]`, '[/size]');
  });
  ta.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'b' || k === 'i') { e.preventDefault(); wrap(`[${k}]`, `[/${k}]`); }
  });
}
// Όλα τα «Κείμενο» της σελίδας
export const attachFormatBars = (root) => root.querySelectorAll('textarea[name=body], textarea[name=g_body], textarea[data-rich]').forEach(formatBar);
