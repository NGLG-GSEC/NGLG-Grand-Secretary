// Η κοινή βάση όλων των σελίδων. Κάθε πίνακας είναι ένα αρχείο data/<πίνακας>.json (λίστα εγγραφών) στο αποθετήριο
// δεδομένων· οι ρυθμίσεις στο data/settings.json και τα συνημμένα αρχεία στον φάκελο files/.
//
//   db.all('lodges')            όλες οι εγγραφές (μόνο ανάγνωση)
//   db.get('lodges', 5)         μία εγγραφή
//   db.setting('closing')       μία ρύθμιση
//   await db.save('Μήνυμα', tx => { tx.insert(...); tx.update(...); })
//
// Η save() είναι «συναλλαγή»: αν στο μεταξύ αποθήκευσε κάποιος άλλος, φορτώνει τα νέα δεδομένα και ξανατρέχει
// τη συνάρτηση (έτσι π.χ. ο αριθμός πρωτοκόλλου δεν διπλασιάζεται ποτέ).
import { Conflict, kvGet, kvSet, toBytes } from './backend.js';

const dec = new TextDecoder();
const TABLE_RE = /^data\/([a-z0-9_]+)\.json$/;
export const nowIso = () => new Date().toISOString().slice(0, 19);

function serialize(rows) {
  // μία εγγραφή ανά γραμμή → καθαρό ιστορικό αλλαγών στο GitHub
  return Array.isArray(rows) ? '[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n' : JSON.stringify(rows, null, 1) + '\n';
}

class Tx {
  constructor(db) { this.db = db; this.tables = {}; this.settingsCopy = null; this.files = []; this.dirty = new Set(); }
  _t(name) {
    if (!this.tables[name]) this.tables[name] = (this.db.tables[name] || []).map((r) => ({ ...r }));
    return this.tables[name];
  }
  all(name) { return this._t(name); }
  get(name, id) { id = Number(id); return this._t(name).find((r) => r.id === id) || null; }
  find(name, fn) { return this._t(name).find(fn) || null; }
  nextId(name) { return this._t(name).reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1; }
  insert(name, row) {
    const t = this._t(name), ts = nowIso();
    const r = { id: this.nextId(name), created_at: ts, updated_at: ts, ...row };
    if (r.id == null || t.some((x) => x.id === r.id)) r.id = this.nextId(name);
    t.push(r); this.dirty.add(name); return r;
  }
  update(name, id, patch) {
    const r = this.get(name, id);
    if (!r) throw new Error('Η εγγραφή δεν βρέθηκε.');
    Object.assign(r, patch, { updated_at: nowIso() }); this.dirty.add(name); return r;
  }
  remove(name, idOrFn) {
    const t = this._t(name), fn = typeof idOrFn === 'function' ? idOrFn : (r) => r.id === Number(idOrFn);
    const keep = t.filter((r) => !fn(r)), n = t.length - keep.length;
    if (n) { this.tables[name] = keep; this.dirty.add(name); }
    return n;
  }
  replace(name, rows) { this.tables[name] = rows.map((r) => ({ ...r })); this.dirty.add(name); }
  setting(key, val) {
    if (!this.settingsCopy) this.settingsCopy = { ...this.db.settings };
    if (val === undefined) return this.settingsCopy[key];
    this.settingsCopy[key] = val; this.dirty.add('settings');
  }
  putFile(path, bytes) { this.files.push({ path: 'files/' + path, data: bytes }); }
  deleteFile(path) { this.files.push({ path: 'files/' + path, delete: true }); }
}

export class Store {
  constructor() {
    this.tables = {}; this.settings = {}; this.files = {}; this.head = null; this.backend = null;
    this.defaults = {}; this.seeds = []; this.listeners = new Set(); this.busy = 0;
  }
  // Οι ενότητες δηλώνουν τις προεπιλεγμένες ρυθμίσεις και τα αρχικά δεδομένα τους (π.χ. οι 78 Στοές).
  defaultSettings(obj) { Object.assign(this.defaults, obj); }
  seed(name, fn) { this.seeds.push({ name, fn }); }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(ev) { for (const f of this.listeners) try { f(ev); } catch (e) { console.error(e); } }

  cacheName() { return 'nglg-cache:' + this.backend.kind + ':' + this.backend.label; }

  async open(backend) {
    this.backend = backend; this.tables = {}; this.settings = {}; this.head = null;
    await backend.check();
    await this.refresh(true);
    await this.runSeeds();
  }
  async refresh(force = false) {
    const st = await this.backend.load();
    if (!force && st.head === this.head) return false;
    const cache = (await kvGet(this.cacheName(), 'files')) || {};
    const want = Object.entries(st.files).filter(([p]) => TABLE_RE.test(p) || p === 'data/settings.json');
    const fresh = {};
    let i = 0;
    const worker = async () => {
      while (i < want.length) {
        const [path, sha] = want[i++];
        if (cache[path] && cache[path].sha === sha) { fresh[path] = cache[path]; continue; }
        if (this.files[path] === sha && this.parsed && this.parsed[path] !== undefined) { fresh[path] = { sha, text: this.parsed[path] }; continue; }
        fresh[path] = { sha, text: dec.decode(await this.backend.read(path, sha)) };
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    const tables = {};
    let settings = {};
    for (const [path, { text }] of Object.entries(fresh)) {
      const m = TABLE_RE.exec(path);
      try {
        if (path === 'data/settings.json') settings = JSON.parse(text);
        else if (m) tables[m[1]] = JSON.parse(text);
      } catch (e) { console.error('Σφάλμα ανάγνωσης', path, e); }
    }
    this.tables = tables; this.settings = settings; this.files = st.files; this.head = st.head;
    this.parsed = Object.fromEntries(Object.entries(fresh).map(([p, v]) => [p, v.text]));
    kvSet(this.cacheName(), 'files', fresh);
    this.emit({ type: 'refresh' });
    return true;
  }
  async runSeeds() {
    const missing = Object.keys(this.defaults).filter((k) => this.settings[k] === undefined);
    const seeds = this.seeds.filter((s) => !this.tables[s.name]);
    if (!missing.length && !seeds.length) return;
    await this.save('Αρχικά δεδομένα εφαρμογής', async (tx) => {
      for (const k of Object.keys(this.defaults)) if (tx.setting(k) === undefined) tx.setting(k, this.defaults[k]);
      for (const s of this.seeds) if (!this.tables[s.name]) tx.replace(s.name, await s.fn(tx));
    });
  }

  all(name) { return this.tables[name] || []; }
  get(name, id) { id = Number(id); return this.all(name).find((r) => r.id === id) || null; }
  setting(key) { const v = this.settings[key]; return v === undefined ? this.defaults[key] : v; }
  hasFile(path) { return !!this.files['files/' + path]; }
  async file(path) {
    const sha = this.files['files/' + path];
    if (!sha) return null;
    const key = 'blob:' + sha, hit = await kvGet(this.cacheName(), key);
    if (hit) return hit;
    const bytes = await this.backend.read('files/' + path, sha);
    kvSet(this.cacheName(), key, bytes);
    return bytes;
  }

  async save(message, fn) {
    this.busy++; this.emit({ type: 'busy', busy: this.busy });
    try {
      for (let attempt = 0; attempt < 6; attempt++) {
        if (attempt) await this.refresh(true);
        const tx = new Tx(this);
        const result = await fn(tx);
        if (!tx.dirty.size && !tx.files.length) return result;
        const changes = [...tx.files];
        for (const name of tx.dirty) {
          if (name === 'settings') changes.push({ path: 'data/settings.json', data: serialize(tx.settingsCopy) });
          else changes.push({ path: `data/${name}.json`, data: serialize(tx.tables[name]) });
        }
        try {
          const res = await this.backend.commit(this.head, changes, message);
          for (const name of tx.dirty) { if (name === 'settings') this.settings = tx.settingsCopy; else this.tables[name] = tx.tables[name]; }
          for (const [p, s] of Object.entries(res.files)) { if (s) this.files[p] = s; else delete this.files[p]; }
          this.head = res.head;
          const cache = {};
          for (const c of changes) if (!c.delete && (TABLE_RE.test(c.path) || c.path === 'data/settings.json')) cache[c.path] = { sha: res.files[c.path], text: typeof c.data === 'string' ? c.data : dec.decode(toBytes(c.data)) };
          const old = (await kvGet(this.cacheName(), 'files')) || {};
          kvSet(this.cacheName(), 'files', { ...old, ...cache });
          this.parsed = { ...(this.parsed || {}), ...Object.fromEntries(Object.entries(cache).map(([p, v]) => [p, v.text])) };
          this.emit({ type: 'saved', message, tables: [...tx.dirty] });
          return result;
        } catch (e) {
          if (!(e instanceof Conflict)) throw e;
        }
      }
      throw new Error('Δεν ήταν δυνατή η αποθήκευση (πολλές ταυτόχρονες αλλαγές). Δοκιμάστε ξανά.');
    } finally {
      this.busy--; this.emit({ type: 'busy', busy: this.busy });
    }
  }
}

export const db = new Store();
