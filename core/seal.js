// Πρόσβαση χρήστη με email + κωδικό: το κλειδί GitHub (token) κλειδώνεται με τον κωδικό (PBKDF2 600.000 επαναλήψεις + AES-GCM)
// και ταξιδεύει μόνο μέσα στον προσωπικό σύνδεσμο πρόσκλησης. Τίποτα δεν δημοσιεύεται· ο κωδικός δεν αποθηκεύεται πουθενά.
const ITER = 600000, enc = new TextEncoder(), dec = new TextDecoder();
const b64u = (u8) => btoa(String.fromCharCode(...u8)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Uint8Array.from(atob(String(s).replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const normEmail = (e) => String(e || '').trim().toLowerCase();

async function keyFor(email, password, salt) {
  const base = await crypto.subtle.importKey('raw', enc.encode(`${normEmail(email)}\n${password}`), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// → συμβολοσειρά για τον σύνδεσμο: περιέχει email και αποθετήριο (όχι μυστικά) και το κλειδωμένο token
export async function seal({ email, repo, token }, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFor(email, password, salt), enc.encode(JSON.stringify({ email: normEmail(email), repo, token }))));
  return b64u(enc.encode(JSON.stringify({ v: 1, e: normEmail(email), r: repo, s: b64u(salt), i: b64u(iv), c: b64u(ct) })));
}
export function readSeal(blob) {
  try { const o = JSON.parse(dec.decode(unb64u(blob))); return o && o.v === 1 && o.e && o.c ? o : null; } catch { return null; }
}
// email + κωδικός → { email, repo, token }· λάθος στοιχεία → σφάλμα
export async function unseal(blob, email, password) {
  const o = readSeal(blob);
  if (!o) throw new Error('Ο σύνδεσμος πρόσβασης δεν είναι έγκυρος.');
  if (normEmail(email) !== o.e) throw new Error('Λάθος email ή κωδικός.');
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64u(o.i) }, await keyFor(email, password, unb64u(o.s)), unb64u(o.c));
    const x = JSON.parse(dec.decode(pt));
    if (x.email !== o.e) throw new Error();
    return x;
  } catch { throw new Error('Λάθος email ή κωδικός.'); }
}
export const strongEnough = (p) => String(p).length >= 10 && /[A-Za-zΑ-Ωα-ω]/.test(p) && /\d/.test(p);
