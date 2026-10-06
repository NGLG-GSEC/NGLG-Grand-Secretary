// Επιλογή μέλους / επαφής με αναζήτηση (Μητρώο Μελών, Επαρχίες, Στοές). Χρησιμοποιείται σε όλες τις φόρμες.
import { db } from './store.js';
import { esc, matches, sortBy } from './util.js';

export const memberName = (m) => `${m.surname || ''} ${m.first_name || ''}`.trim();
export const memberLodges = (mid) => db.all('member_lodges').filter((l) => l.member_id === mid);
export function searchMembers(q, limit = 12) {
  if (!q || q.trim().length < 2) return [];
  const byM = {};
  for (const l of db.all('member_lodges')) (byM[l.member_id] ||= []).push(`${l.lodge_name} ${l.lodge_number}`);
  return sortBy(db.all('member_registry').filter((m) => matches(q, m.surname, m.first_name, m.surname_variants, m.first_name_variants, m.email, m.other_emails, m.mobile, m.other_mobiles, m.registry_no, (byM[m.id] || []).join(' '))), 'surname', 'first_name').slice(0, limit);
}

// Πεδίο αναζήτησης· onPick(item) όταν επιλεγεί. items(q) → [{label, sub, value}]
export function attachPicker(input, items, onPick) {
  const box = document.createElement('div');
  box.className = 'picker-list'; box.hidden = true;
  input.parentElement.classList.add('picker');
  input.after(box);
  let cur = [];
  const show = () => {
    cur = items(input.value.trim());
    box.innerHTML = cur.map((it, i) => `<button type="button" data-i="${i}"><b>${esc(it.label)}</b>${it.sub ? `<br><small class="muted">${esc(it.sub)}</small>` : ''}</button>`).join('')
      || (input.value.trim().length >= 2 ? '<div class="muted" style="padding:8px">Δεν βρέθηκε — συμπληρώστε χειροκίνητα.</div>' : '');
    box.hidden = !box.innerHTML;
  };
  input.addEventListener('input', show);
  input.addEventListener('focus', () => { if (input.value.trim()) show(); });
  box.addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; onPick(cur[+b.dataset.i].value); box.hidden = true; input.value = ''; });
  document.addEventListener('pointerdown', (e) => { if (!box.contains(e.target) && e.target !== input) box.hidden = true; });
}

export const memberItems = (q) => searchMembers(q).map((m) => ({ label: memberName(m), sub: [m.degree, m.email, m.mobile, memberLodges(m.id).map((l) => `${l.lodge_name} ${l.lodge_number}`).join(', ')].filter(Boolean).join(' · '), value: m }));

// Όλες οι επαφές για παραλήπτες: Επαρχίες (Γραμματεία, ΕπΜΔ, ΕπΜΓρ.), Στοές, μέλη
let contactSources = [];
export const addContactSource = (fn) => contactSources.push(fn);
export function contactItems(q) {
  if (!q || q.length < 2) return [];
  const out = [];
  for (const src of contactSources) for (const c of src()) if (matches(q, c.name, c.email, c.sub)) out.push({ label: c.name, sub: [c.sub, c.email].filter(Boolean).join(' · '), value: c });
  for (const m of searchMembers(q, 8)) out.push({ label: memberName(m), sub: ['Μέλος', m.email].filter(Boolean).join(' · '), value: { name: `${m.first_name} ${m.surname}`.trim(), email: m.email || '', member_id: m.id } });
  return out.slice(0, 20);
}
