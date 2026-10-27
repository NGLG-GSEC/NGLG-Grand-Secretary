// Τοπική δοκιμή του lodge/apps-script/Code.gs: ψεύτικα DriveApp, PropertiesService, CacheService, MailApp κ.λπ. στη μνήμη.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
function makeEnv() {
  const props = {}, cache = {}, mails = [], tokens = {};
  let fid = 0;
  const mkFile = (name, text, parent) => { const f = { id: 'f' + (++fid), name, text, parent, created: new Date(Date.now() + fid),
    getName: () => f.name, getBlob: () => ({ getDataAsString: () => f.text }), setContent: (t) => { f.text = t; },
    getDateCreated: () => f.created, moveTo: (dir) => { f.parent.files.splice(f.parent.files.indexOf(f), 1); dir.files.push(f); f.parent = dir; } }; return f; };
  const iter = (xs) => { let i = 0; const a = xs.slice(); return { hasNext: () => i < a.length, next: () => a[i++] }; };
  const folders = {};
  const mkFolder = (name) => { const d = { id: 'd' + (++fid), name, files: [], folders: [],
    getId: () => d.id, getFoldersByName: (n) => iter(d.folders.filter((x) => x.name === n)),
    createFolder: (n) => { const x = mkFolder(n); d.folders.push(x); return x; },
    getFiles: () => iter(d.files), getFilesByName: (n) => iter(d.files.filter((x) => x.name === n)),
    createFile: (n, t) => { const x = mkFile(n, t, d); d.files.push(x); return x; } }; folders[d.id] = d; return d; };
  const ctx = {
    console, JSON, Date, Math, Object, Array, String, Number, RegExp, Error,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); } }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: { createFolder: (n) => mkFolder(n), getFolderById: (id) => { if (!folders[id]) throw new Error('nf'); return folders[id]; } },
    MailApp: { sendEmail: (to, subject, body, opt) => mails.push({ to, subject, body, opt }) },
    UrlFetchApp: { fetch: (url) => { const t = decodeURIComponent(String(url).split('access_token=')[1] || ''), info = tokens[t];
      return { getResponseCode: () => (info ? 200 : 400), getContentText: () => JSON.stringify(info || { error: 'invalid_token' }) }; } },
    Session: { getScriptTimeZone: () => 'Europe/Athens' },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' }, getUuid: () => crypto.randomUUID(), sleep: () => {},
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(s, 'utf8').digest()).map((b) => (b > 127 ? b - 256 : b)),
      formatDate: (d, tz, f) => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'numeric', year: '2-digit' }).formatToParts(d); const g = (t) => p.find((x) => x.type === t).value; return f === 'd' ? g('day') : f === 'M' ? g('month') : g('year'); },
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ setMimeType: () => ({ text: t }) }) },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/../../lodge/apps-script/Code.gs', 'utf8'), ctx);
  const call = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  return { ctx, props, mails, tokens, call, root: () => folders[props.FOLDER_ID] };
}
module.exports = { makeEnv, hash: (no, code) => crypto.createHash('sha256').update('nglg-lodge|' + no + '|' + String(code).trim().toUpperCase(), 'utf8').digest('hex') };
