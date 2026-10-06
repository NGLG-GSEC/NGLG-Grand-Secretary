// Πού φυλάσσονται τα δεδομένα. Δύο υλοποιήσεις με το ίδιο περιβάλλον:
//   GitHubBackend — ιδιωτικό αποθετήριο GitHub (κοινά δεδομένα για όλους, με ιστορικό κάθε αλλαγής)
//   LocalBackend  — μόνο σε αυτόν τον browser (δοκιμή/επίδειξη, χωρίς σύνδεση)
// Περιβάλλον: load() → {head, files:{path:sha}}, read(path, sha) → Uint8Array,
//             commit(head, changes, message) → {head, files} ή ρίχνει Conflict όταν κάποιος άλλος αποθήκευσε στο μεταξύ.

export class Conflict extends Error {}

const enc = new TextEncoder();
const b64 = (bytes) => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s.replace(/\s/g, '')), (c) => c.charCodeAt(0));
export const toBytes = (x) => (typeof x === 'string' ? enc.encode(x) : x);

export class GitHubBackend {
  constructor({ owner, repo, token, branch = 'main', api = 'https://api.github.com' }) {
    Object.assign(this, { owner, repo, token, branch, api });
    this.kind = 'github';
    this.label = `${owner}/${repo}`;
  }
  async req(path, opts = {}) {
    const r = await fetch(`${this.api}/repos/${this.owner}/${this.repo}${path}`, {
      ...opts,
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.token}`, 'X-GitHub-Api-Version': '2022-11-28',
                 ...(opts.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    if (r.status === 401) throw new Error('Ο κωδικός πρόσβασης GitHub (token) δεν είναι έγκυρος ή έληξε.');
    if (r.status === 404 && path === '') throw new Error(`Δεν βρέθηκε το αποθετήριο ${this.label} ή ο κωδικός δεν έχει πρόσβαση σε αυτό.`);
    return r;
  }
  async json(path, opts) {
    const r = await this.req(path, opts);
    if (!r.ok) { const e = new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`); e.status = r.status; throw e; }
    return r.json();
  }
  async check() {
    const r = await this.json('');
    if (!r.private) throw new Error(`Το αποθετήριο ${this.label} είναι δημόσιο. Για προστασία των προσωπικών δεδομένων πρέπει να είναι ιδιωτικό (Private).`);
    if (r.permissions && !r.permissions.push) throw new Error('Ο κωδικός έχει μόνο ανάγνωση· χρειάζεται και εγγραφή (Contents: Read and write).');
    return r;
  }
  async head() {
    const r = await this.req(`/git/ref/heads/${this.branch}`);
    if (r.status === 404 || r.status === 409) return null; // κενό αποθετήριο
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return (await r.json()).object.sha;
  }
  async init() {
    // Το Git Data API δεν δουλεύει σε εντελώς κενό αποθετήριο· η πρώτη εγγραφή γίνεται με το Contents API.
    const text = '# Δεδομένα «Ψηφιακής Μεγάλης Γραμματείας»\n\nΙΔΙΩΤΙΚΟ — μην το κάνετε δημόσιο. Η εφαρμογή γράφει εδώ αυτόματα.\n';
    await this.json('/contents/README.md', { method: 'PUT', body: JSON.stringify({ message: 'Αρχικοποίηση δεδομένων', content: b64(enc.encode(text)), branch: this.branch }) });
  }
  async load() {
    let head = await this.head();
    if (!head) { await this.init(); head = await this.head(); }
    const commit = await this.json(`/git/commits/${head}`);
    const tree = await this.json(`/git/trees/${commit.tree.sha}?recursive=1`);
    const files = {};
    for (const e of tree.tree) if (e.type === 'blob') files[e.path] = e.sha;
    this._tree = commit.tree.sha;
    return { head, files, tree: commit.tree.sha };
  }
  async read(path, sha) {
    const r = await this.json(`/git/blobs/${sha}`);
    return unb64(r.content);
  }
  async commit(head, changes, message) {
    const cur = await this.head();
    if (cur !== head) throw new Conflict();
    const commit = await this.json(`/git/commits/${head}`);
    const entries = [];
    for (const c of changes) {
      if (c.delete) { entries.push({ path: c.path, mode: '100644', type: 'blob', sha: null }); continue; }
      const blob = await this.json('/git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(toBytes(c.data)), encoding: 'base64' }) });
      entries.push({ path: c.path, mode: '100644', type: 'blob', sha: blob.sha });
      c.sha = blob.sha;
    }
    const tree = await this.json('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: commit.tree.sha, tree: entries }) });
    const next = await this.json('/git/commits', { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [head] }) });
    const r = await this.req(`/git/refs/heads/${this.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: next.sha, force: false }) });
    if (r.status === 422 || r.status === 409) throw new Conflict();
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const files = {};
    for (const c of changes) files[c.path] = c.delete ? null : c.sha;
    return { head: next.sha, files };
  }
}

// ---- Τοπική αποθήκευση (IndexedDB) ----
function idb(name) {
  return new Promise((ok, bad) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => bad(r.error);
  });
}
export async function kvGet(dbName, key) {
  try {
    const d = await idb(dbName);
    return await new Promise((ok) => { const q = d.transaction('kv').objectStore('kv').get(key); q.onsuccess = () => ok(q.result); q.onerror = () => ok(undefined); });
  } catch { return undefined; }
}
export async function kvSet(dbName, key, val) {
  try {
    const d = await idb(dbName);
    await new Promise((ok) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(val, key); t.oncomplete = ok; t.onerror = ok; });
  } catch { /* χωρίς IndexedDB: απλώς χωρίς προσωρινή μνήμη */ }
}

async function sha(bytes) {
  const h = await crypto.subtle.digest('SHA-1', bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class LocalBackend {
  constructor(name = 'nglg-local') { this.name = name; this.kind = 'local'; this.label = 'μόνο σε αυτή τη συσκευή'; }
  async check() { return true; }
  async load() {
    const st = (await kvGet(this.name, 'state')) || { head: '0', files: {} };
    return { head: st.head, files: { ...st.files } };
  }
  async read(path, s) { return (await kvGet(this.name, 'blob:' + s)) || new Uint8Array(); }
  async commit(head, changes, message) {
    const st = (await kvGet(this.name, 'state')) || { head: '0', files: {} };
    if (st.head !== head) throw new Conflict();
    const files = {};
    for (const c of changes) {
      if (c.delete) { delete st.files[c.path]; files[c.path] = null; continue; }
      const bytes = toBytes(c.data), s = await sha(bytes);
      await kvSet(this.name, 'blob:' + s, bytes);
      st.files[c.path] = s; files[c.path] = s;
    }
    st.head = String(Number(st.head) + 1);
    const log = (await kvGet(this.name, 'log')) || [];
    log.push({ head: st.head, message, at: new Date().toISOString() });
    await kvSet(this.name, 'log', log.slice(-500));
    await kvSet(this.name, 'state', st);
    return { head: st.head, files };
  }
}
