// Ο σκελετός της εφαρμογής: ενότητες (modules), διαδρομές (#/…), μενού, πλακίδια Αρχικής, μηνύματα, φόρμες.
// Κάθε ενότητα δηλώνεται με app.module({...}) στο δικό της αρχείο· το μενού και η Αρχική χτίζονται αυτόματα,
// οπότε για μια αλλαγή αρκεί να ανοίξει κανείς μόνο το αρχείο της ενότητας.
import { db } from './store.js';
import { esc } from './util.js';

const routes = [], menus = [], tiles = [], banners = [];
export const modules = [];

export function module(def) {
  modules.push(def);
  for (const [pattern, handler] of Object.entries(def.routes || {})) {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
    routes.push({ pattern, re, keys, handler, module: def.id });
  }
  for (const m of [].concat(def.menu || [])) menus.push({ order: 50, ...m, module: def.id });
  if (def.tile) tiles.push({ order: 50, ...(typeof def.tile === 'function' ? { render: def.tile } : def.tile) });
  if (def.banner) banners.push(def.banner);
}
export const allRoutes = () => routes.map((r) => r.pattern);
export const tilesHtml = () => '<div class="dash">' + [...tiles].sort((a, b) => a.order - b.order).map((t) => { try { return t.render() || ''; } catch (e) { console.error(e); return ''; } }).join('') + '</div>';
export const bannersHtml = () => banners.map((b) => { try { return b() || ''; } catch (e) { console.error(e); return ''; } }).join('');

// ---- Υπογράφων (Δημήτρης / Νικόλαος), αποθηκεύεται σε αυτή τη συσκευή ----
export const ACTORS = { dimitrios: 'Δημήτρης Σκιαδόπουλος', nikolaos: 'Νικόλαος Χατζηδημητρίου' };
export const actor = () => { try { return localStorage.getItem('nglg-actor') || 'dimitrios'; } catch { return 'dimitrios'; } };
export const setActor = (a) => { try { localStorage.setItem('nglg-actor', a); } catch { /* */ } };

// ---- Πλοήγηση ----
export const href = (path, query) => '#' + path + (query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)).toString() : '');
export function go(path, query) { const h = href(path, query); if (location.hash === h) render(); else location.hash = h; }
function parseHash() {
  const h = decodeURI(location.hash.replace(/^#/, '')) || '/';
  const [path, qs] = h.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

// ---- Μηνύματα ----
export function toast(msg, kind = 'ok') {
  const box = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + kind; t.textContent = msg; t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  box.appendChild(t);
  setTimeout(() => t.remove(), kind === 'error' ? 9000 : 3500);
}
export function flash(msg) { sessionStorage.setItem('nglg-flash', msg); }

// Φόρμες: συλλογή τιμών, κλείδωμα κουμπιού κατά την αποθήκευση, εμφάνιση σφαλμάτων.
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name || el.disabled) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.type === 'file') o[el.name] = el.multiple ? [...el.files] : el.files[0] || null;
    else if (el.multiple && el.tagName === 'SELECT') o[el.name] = [...el.selectedOptions].map((x) => x.value);
    else o[el.name] = el.value;
  }
  return o;
}
export function onSubmit(form, fn) {
  if (typeof form === 'string') form = document.querySelector(form);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btns = form.querySelectorAll('button');
    btns.forEach((b) => (b.disabled = true));
    try { await fn(formData(form), e.submitter, form); }
    catch (err) { console.warn(err); toast(err.message || String(err), 'error'); }
    finally { btns.forEach((b) => (b.disabled = false)); }
  });
}
export class UserError extends Error {}
export const fail = (msg) => { throw new UserError(msg); };
export function confirmDo(msg) { return window.confirm(msg); }

// Ενέργειες σε κουμπιά: <button data-act="όνομα" data-id="5">, χειρίζονται από mount() → bind(el, {όνομα: fn})
export function bind(el, actions) {
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || !el.contains(b) || !actions[b.dataset.act]) return;
    e.preventDefault();
    b.disabled = true;
    try { await actions[b.dataset.act](b.dataset, b); }
    catch (err) { console.warn(err); toast(err.message || String(err), 'error'); }
    finally { b.disabled = false; }
  });
}

// ---- Σελίδα ----
function navHtml() {
  const groups = [...menus].sort((a, b) => a.order - b.order);
  const items = groups.map((m) => {
    if (m.href) return `<a href="${m.href}">${esc(m.title)}</a>`;
    const links = m.items.map((i) => (i.sep ? '<div class="navdrop-sep"></div>' : `<a href="${i.href}"${i.external ? ' target="_blank" rel="noopener"' : ''}>${esc(i.label)}</a>`)).join('');
    return `<details class="navdrop ${m.cls || ''}"><summary>${esc(m.title)} <span class="caret">▾</span></summary><div class="navdrop-menu">${links}</div></details>`;
  }).join('');
  const who = actor();
  return `<header class="top has-nav"><div class="brand"><a href="#/" class="brandname"><b>Μεγάλη Γραμματεία · ΕΜΣΤΕ</b></a>
<span class="actor-pill" title="Υπογράφων">✍ ${esc(ACTORS[who])}</span><span id="syncPill" class="sync-pill" hidden>Αποθήκευση…</span></div>
<button type="button" class="navtoggle" aria-expanded="false" aria-controls="mainnav">☰ Μενού</button>
<nav id="mainnav" aria-label="Κύριο μενού"><a href="#/">Αρχική</a>${items}<a href="#/identity">Υπογράφων</a></nav></header>`;
}

function wireNav(root) {
  const top = root.querySelector('.top'), nav = top.querySelector('nav'), btn = top.querySelector('.navtoggle');
  const drops = nav.querySelectorAll('details.navdrop'), mobile = matchMedia('(max-width:1180px)');
  const closeDrops = (except) => drops.forEach((d) => { if (d !== except) d.open = false; });
  const setNav = (open) => { top.classList.toggle('nav-open', open); btn.setAttribute('aria-expanded', open); btn.textContent = open ? '✕ Κλείσιμο' : '☰ Μενού'; if (!open) closeDrops(); };
  btn.addEventListener('click', () => setNav(!top.classList.contains('nav-open')));
  drops.forEach((d) => d.addEventListener('toggle', () => {
    if (!d.open) return;
    closeDrops(d);
    const m = d.querySelector('.navdrop-menu');
    m.classList.remove('align-right');
    if (!mobile.matches && m.getBoundingClientRect().right > document.documentElement.clientWidth - 8) m.classList.add('align-right');
  }));
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setNav(false); });
  document.addEventListener('pointerdown', (e) => { if (!top.contains(e.target)) { closeDrops(); if (mobile.matches) setNav(false); } });
}

let renderSeq = 0;
// Συνδεδεμένη συσκευή με email + κωδικό, αλλά χωρίς ενεργή συνεδρία → σελίδα εισόδου
const sealedPending = () => { try { return JSON.parse(localStorage.getItem('nglg-connection') || 'null')?.kind === 'sealed'; } catch { return false; } };
export async function render() {
  const seq = ++renderSeq;
  const { path, query } = parseHash();
  const root = document.getElementById('app');
  if (!db.backend && path !== '/connect' && path !== '/portal' && path !== '/login') { location.hash = sealedPending() ? '#/login' : '#/connect'; return; }
  let r = null, params = {};
  for (const x of routes) { const m = x.re.exec(path); if (m) { r = x; x.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1]))); break; } }
  let out;
  try {
    out = r ? await r.handler({ params, query, path }) : { title: 'Δεν βρέθηκε', html: '<h1>Η σελίδα δεν βρέθηκε</h1><p><a href="#/">← Αρχική</a></p>' };
  } catch (e) {
    console.error(e);
    out = { title: 'Σφάλμα', html: `<h1>Σφάλμα</h1><div class="card">${esc(e.message || e)}</div><p><a href="#/">← Αρχική</a></p>` };
  }
  if (seq !== renderSeq) return;
  if (typeof out === 'string') out = { html: out };
  const bare = out.bare || !db.backend;
  root.innerHTML = (bare ? '' : navHtml()) + `<main class="wrap">${out.html}</main>`;
  document.title = (out.title ? out.title + ' · ' : '') + 'Μεγάλη Γραμματεία';
  if (!bare) wireNav(root);
  const msg = sessionStorage.getItem('nglg-flash');
  if (msg) { sessionStorage.removeItem('nglg-flash'); toast(msg); }
  if (!out.keepScroll) window.scrollTo(0, 0);
  const main = root.querySelector('main');
  if (out.mount) try { await out.mount(main); } catch (e) { console.error(e); toast(e.message, 'error'); }
  const f = main.querySelector('[autofocus]');
  if (f && matchMedia('(min-width:800px)').matches) f.focus();
}

// Γκρι πρόταση μέσα σε κενό πεδίο → πραγματικό κείμενο με Tab (ή διπλό πάτημα στο κινητό).
// Ισχύει για data-suggest και για υποδείξεις-τιμές (π.χ. «2026 - 2027»)· όχι για παραδείγματα «π.χ. …» ή οδηγίες αναζήτησης.
const NOT_VALUE = /^(π\.χ\.|🔎|—)|από το Μητρώο|αναζήτηση|προαιρετικ|πολλά με|γράψτε|επιλέξτε|πληκτρολογ|(…|\.\.\.)\s*$|^https?:|ghp_/i;
export function suggestion(el) {
  if (!el || !el.matches || !el.matches('input, textarea') || el.value || el.readOnly || el.disabled) return '';
  if (/^(checkbox|radio|file|date|search|password|hidden|number)$/.test(el.type) || el.closest('.filters, .msearch, .picker') || el.name === 'q') return '';
  const ph = el.dataset.suggest || el.getAttribute('placeholder') || '';
  return el.dataset.suggest ? ph : NOT_VALUE.test(ph.trim()) || /[,;]/.test(ph) ? '' : ph.trim();
}
function acceptSuggestion(el) {
  const v = suggestion(el);
  if (!v) return false;
  el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

export function start() {
  document.addEventListener('keydown', (e) => { if (e.key === 'Tab' && !e.shiftKey && !e.altKey && !e.ctrlKey) acceptSuggestion(e.target); });
  document.addEventListener('dblclick', (e) => acceptSuggestion(e.target));
  window.addEventListener('hashchange', render);
  db.on((ev) => {
    const p = document.getElementById('syncPill');
    if (ev.type === 'busy' && p) { p.hidden = !ev.busy; }
  });
  // Όταν επιστρέφετε στην καρτέλα, φέρνει τις αλλαγές που έκανε κάποιος άλλος στο μεταξύ.
  let last = Date.now();
  const sync = async () => {
    if (!db.backend || db.busy || Date.now() - last < 15000) return;
    last = Date.now();
    try { if (await db.refresh() && !document.querySelector('main form :focus')) render(); } catch (e) { console.warn(e); }
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync(); });
  window.addEventListener('focus', sync);
  render();
}

// Κοινά κομμάτια HTML
export const card = (inner, cls = '') => `<div class="card ${cls}">${inner}</div>`;
export const notice = (msg) => (msg ? `<div class="card notice"><b>${esc(msg)}</b></div>` : '');
export function table(headers, rows, empty = 'Δεν υπάρχουν εγγραφές.') {
  const head = '<tr class="stack-head">' + headers.map((h) => `<th>${esc(h)}</th>`).join('') + '</tr>';
  const body = rows.length ? rows.map((r) => '<tr>' + r.map((c, i) => `<td data-label="${esc(headers[i])}"${/Ενέργειες/.test(headers[i]) ? ' class="actions-cell"' : ''}>${c ?? ''}</td>`).join('') + '</tr>').join('')
    : `<tr><td colspan="${headers.length}" class="muted nolabel">${esc(empty)}</td></tr>`;
  return `<div class="card tablecard"><table class="stack">${head}${body}</table></div>`;
}
export const opt = (value, label, sel) => `<option value="${esc(value)}"${String(sel ?? '') === String(value) ? ' selected' : ''}>${esc(label ?? value)}</option>`;
export const field = (label, inner, cls = '') => `<div class="${cls}"><label>${esc(label)}</label>${inner}</div>`;
export const input = (name, value = '', attrs = '') => `<input name="${name}" value="${esc(value)}" ${attrs}>`;
export function pager(total, page, size, mk) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages < 2) return '';
  return `<div class="toolbar">${page > 1 ? `<a class="btn" href="${mk(page - 1)}">← Προηγούμενη</a>` : ''}<span class="muted" style="align-self:center">Σελίδα ${page} από ${pages}</span>${page < pages ? `<a class="btn" href="${mk(page + 1)}">Επόμενη →</a>` : ''}</div>`;
}
