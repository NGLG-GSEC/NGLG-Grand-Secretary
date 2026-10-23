// 📋 ΣΓΥ — Παρουσιολόγιο Συνεδρίασης (builder). Ο κατάλογος θέσεων (sgy_roster) είναι ένας για όλη την εφαρμογή:
// κατηγορία (Μέλη εξ Αξιώματος · Διορισμένα Μέλη υπό του ΜΔ · Αιρετά Μέλη Θητείας …) · ιδιότητα · μέλος του Μητρώου (ή όνομα / κενή θέση) · Επαρχία.
// Από αυτόν βγαίνουν το Παρουσιολόγιο, ο πίνακας ΣΓΥ, τα email (Bcc) και το WhatsApp. Εισαγωγή από κείμενο ή από το Word του Παρουσιολογίου·
// όλες οι αλλαγές γίνονται στη φόρμα και αποθηκεύονται μόνο με «💾 Αποθήκευση».
import { db } from '../core/store.js';
import { module, bind, go, flash, toast, confirmDo } from '../core/app.js';
import { esc, MONTHS_GEN, XLSX, download } from '../core/util.js';
import { attachPicker, memberItems } from '../core/pickers.js';
import { printPaper } from '../core/paper.js';
import { sgyRoster, matchList, categoryBasis } from './sgy.js';

export const EX_CAT = 'Μέλη εξ Αξιώματος';
const CAT_RE = /(Μέλη\s+εξ?\s+Αξιώματος|Διορισμένα\s+Μέλη.*|Αιρετά\s+Μέλη.*)$/i;
const ROLE_RE = /(Διδάσκαλος|ΜΔ|Μ\.Δ\.|Επόπτης|Πρόεδρος|Νομοφύλαξ|Γραμματ|Καγκελάριος|Θησαυροφύλαξ|Τελετάρχης|Επίτροπος|Επιθεωρητ|Αντιπρόεδρος)/;
const HONORIFIC = /^(Σεβτ|Πσεβ|Σεβ|Ελλ|Εντ)\.?\s*Αδ\.\s*/;
const clean = (s) => String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
export const ATT_DEFAULT = { council: 'ΣΥΜΒΟΥΛΙΟΝ ΓΕΝΙΚΩΝ ΥΠΟΘΕΣΕΩΝ', period: '', meeting: 'Τακτική Συνεδρίασις της', date: '', date_text: '', title: 'ΠΑΡΟΥΣΙΟΛΟΓΙΟ', footer: '', size: 10.5, row: 9 };
export function attSettings() {
  let s = {}; try { s = JSON.parse(db.setting('sgy_attendance') || '{}') || {}; } catch { s = {}; }
  const y = new Date().getFullYear(), per = new Date().getMonth() >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  return { ...ATT_DEFAULT, period: `Τεκτονική Περίοδος ${per}`, footer: `ΤΕΚΤΟΝΙΚΗ ΠΕΡΙΟΔΟΣ ${per}`, ...s };
}
export const attDate = (s) => { if (clean(s.date_text)) return clean(s.date_text); const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.date || ''); return m ? `${+m[3]}ας ${MONTHS_GEN[+m[2] - 1]} ${m[1]}` : '……'; };

// Κείμενο (όπως στο Παρουσιολόγιο) → θέσεις: { category, role, name, province }
export function parseRosterText(text) {
  let cat = EX_CAT; const seats = [];
  for (const raw of String(text || '').split(/\n/)) {
    const line = clean(raw); if (!line) continue;
    const c = CAT_RE.exec(line);
    if (c) { cat = clean(c[1]); continue; }
    if (/^(Ενώ|Και)\s/i.test(line) || /:$/.test(line)) continue; // συνδετικές φράσεις
    if (categoryBasis(cat) === '216') {
      const last = seats[seats.length - 1];
      if (ROLE_RE.test(line.replace(HONORIFIC, '')) && !HONORIFIC.test(line)) seats.push({ category: cat, role: line, name: '', province: '' });
      else if (last && last.category === cat && last.role && !last.name) last.name = line;
      else seats.push({ category: cat, role: '', name: line, province: '' });
    } else {
      const p = /\(([^()]*)\)\s*$/.exec(line), province = p ? clean(p[1]) : '';
      let name = clean(p ? line.slice(0, p.index) : line);
      if (/κεν[ηή]\s+θ[εέ]ση/i.test(name)) name = '';
      seats.push({ category: cat, role: '', name, province });
    }
  }
  return seats;
}
// Word (.docx) του Παρουσιολογίου → { text, header } (γραμμές για το parseRosterText και στοιχεία κεφαλίδας)
export async function docxRoster(file) {
  const X = await XLSX(), z = X.CFB.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' });
  const i = z.FullPaths.findIndex((p) => /(^|\/)word\/document\.xml$/.test(p)), f = i >= 0 ? z.FileIndex[i] : null;
  if (!f) throw new Error('Δεν είναι έγγραφο Word (.docx).');
  const xml = new TextDecoder().decode(f.content), body = xml.slice(xml.indexOf('<w:body'));
  const txt = (b) => clean((b.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));
  const lines = [], header = {};
  for (const m of body.matchAll(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g)) {
    const b = m[0];
    if (b.startsWith('<w:tbl>')) {
      for (const tr of b.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []) {
        const cells = (tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(txt);
        if (cells.length >= 3) lines.push(cells[0] || '—', cells[1] || ''); // ιδιότητα · όνομα · (υπογραφή)
        else if (cells.length) lines.push(/^\(/.test(cells[0]) ? `Κενή θέση ${cells[0]}` : cells[0] || 'Κενή θέση');
      }
    } else {
      const t = txt(b); if (!t) continue;
      if (CAT_RE.test(t)) lines.push(t);
      else if (/^Τεκτονική Περίοδος/i.test(t)) header.period = t;
      else if (/Συνεδρίασ/i.test(t)) header.meeting = t;
      else if (/^ΣΥΜΒΟΥΛΙΟΝ/i.test(t)) header.council = t;
      else if (/ΠΑΡΟΥΣΙΟΛΟΓΙΟ/i.test(t)) header.title = t;
      else if (/^\d{1,2}(ας|ης|η)?\s/.test(t)) header.date_text = t;
    }
  }
  return { text: lines.join('\n'), header };
}
const linkSeat = (s) => { if (s.member_id || !s.name) return s; const r = matchList(s.name.replace(HONORIFIC, ''))[0]; return r && r.member_id && !r.guess ? { ...s, member_id: r.member_id } : { ...s, guess_id: r && r.member_id }; };

// Το έντυπο (A4): ίδια διάταξη με το Word της Γραμματείας
// Κενή θέση: το κελί του ονόματος κόκκινο και στην προέκταση (στήλη υπογραφής) γκρι «Λείπει Διορισμός»
const VACANT = '<td class="att-vac"></td><td class="att-miss">Λείπει Διορισμός</td>';
export function attendancePaper(seats, s) {
  const cats = []; for (const x of seats) { const c = cats.find((k) => k.name === x.category) || (cats.push({ name: x.category, xs: [] }), cats[cats.length - 1]); c.xs.push(x); }
  const row = `style="height:${+s.row || 9}mm"`;
  return `<article class="paper report sgy-att" style="font-size:${+s.size || 10.5}pt">
<div class="att-h1">${esc(s.council)}</div><div class="att-h1">${esc(s.period)}</div><div class="att-h2">${esc(s.meeting)}</div><div class="att-date">${esc(attDate(s))}</div>
<div class="att-title">${esc(s.title)}</div>
${cats.map((c) => `<div class="att-cat">${esc(c.name)}</div><table class="att-t${categoryBasis(c.name) === '216' ? ' att-ex' : ''}"><tbody>${c.xs.map((x) => (categoryBasis(c.name) === '216'
    ? `<tr ${row}><td>${esc(x.role)}</td>${x.name ? `<td>${esc(x.name)}</td><td></td>` : VACANT}</tr>`
    : `<tr ${row}>${x.name ? `<td>${esc(x.name)}${x.province ? ` (${esc(x.province)})` : ''}</td><td></td>` : VACANT.replace('<td class="att-vac">', `<td class="att-vac">${x.province ? `(${esc(x.province)})` : ''}`)}</tr>`)).join('')}</tbody></table>`).join('')}
${s.footer ? `<div class="att-foot">${esc(s.footer)}</div>` : ''}</article>`;
}

function attendancePage() {
  const st = attSettings();
  let seats = sgyRoster().map((r) => ({ category: r.category || EX_CAT, role: r.role || '', name: r.name || '', province: r.province || '', member_id: r.member_id || null }));
  const f = (k, label, type = 'text') => `<label>${esc(label)}<input data-s="${k}" type="${type}" value="${esc(st[k] ?? '')}"${type === 'number' ? ' step="0.5"' : ''}></label>`;
  return {
    title: 'Παρουσιολόγιο ΣΓΥ',
    html: `<div class="noprint"><p><a href="#/sgy">← ΣΓΥ</a></p><h1>📋 Παρουσιολόγιο ΣΓΥ</h1>
<p class="muted">Ο κατάλογος θέσεων του ΣΓΥ (κατηγορία, ιδιότητα, μέλος, Επαρχία) είναι κοινός με τη σελίδα ΣΓΥ, τα email και το WhatsApp. Αλλάξτε ό,τι χρειάζεται — η προεπισκόπηση ενημερώνεται — και πατήστε «💾 Αποθήκευση».</p></div>
<div class="dz-split att-split"><div class="dz-controls noprint">
<div class="card"><h3 style="margin-top:0">Κεφαλίδα</h3><div class="grid">${f('council', 'Συμβούλιο')}${f('period', 'Τεκτονική Περίοδος')}${f('meeting', 'Συνεδρίαση')}${f('date', 'Ημερομηνία', 'date')}
${f('date_text', 'Ημερομηνία ως κείμενο (προαιρετικά)')}${f('title', 'Τίτλος')}${f('footer', 'Υποσέλιδο')}${f('size', 'Μέγεθος γραμμάτων (pt)', 'number')}${f('row', 'Ύψος γραμμής (mm)', 'number')}</div></div>
<div class="card"><h3 style="margin-top:0">Θέσεις <small class="muted" id="attCount"></small></h3><div id="attRows"></div>
<div class="toolbar"><button type="button" class="btn small" data-act="addSeat">+ Θέση</button><button type="button" class="btn small" data-act="addVacant">+ Κενή θέση</button><button type="button" class="btn small" data-act="addCat">+ Κατηγορία</button></div>
<datalist id="attCats"></datalist></div>
<details class="card fold"><summary><b>📥 Εισαγωγή καταλόγου (κείμενο ή Word)</b></summary>
<p class="muted">Επικολλήστε τον κατάλογο (κατηγορίες, ιδιότητα και όνομα, «Όνομα (Επαρχία)», «Κενή θέση (Επαρχία)») ή ανεβάστε το Word του Παρουσιολογίου. Αντικαθιστά τις θέσεις της φόρμας· αποθηκεύεται με «💾 Αποθήκευση».</p>
<label class="dz-file">⬆ Word (.docx)<input type="file" id="attDocx" accept=".docx"></label><textarea id="attText" rows="6" placeholder="Μέλη εξ Αξιώματος&#10;Μέγας Διδάσκαλος&#10;Σεβτ. Αδ. …&#10;…&#10;Αιρετά Μέλη Θητείας 2026 - 2029&#10;Όνομα Επώνυμο (Αθηνών)"></textarea>
<div class="toolbar"><button type="button" class="btn" data-act="parse">↧ Από το κείμενο</button></div></details>
<div class="toolbar"><button class="btn primary" data-act="save">💾 Αποθήκευση</button><button type="button" class="btn" data-act="print">🖨 Εκτύπωση</button><button type="button" class="btn" data-act="pdf">⬇ PDF</button></div></div>
<div class="dz-page"><div class="print-area" id="attPrev"></div></div></div>`,
    mount(el) {
      const prev = el.querySelector('#attPrev'), rowsBox = el.querySelector('#attRows');
      const draw = () => { prev.innerHTML = attendancePaper(seats, st); el.querySelector('#attCount').textContent = `${seats.length} θέσεις · ${seats.filter((x) => x.member_id).length} στο Μητρώο · ${seats.filter((x) => !x.name).length} κενές`; };
      const rows = () => {
        el.querySelector('#attCats').innerHTML = [...new Set([EX_CAT, ...seats.map((x) => x.category)])].map((c) => `<option value="${esc(c)}">`).join('');
        rowsBox.innerHTML = seats.map((x, i) => `${i === 0 || seats[i - 1].category !== x.category ? `<div class="att-ecat">${esc(x.category)}</div>` : ''}<div class="att-row" data-i="${i}">
<input data-f="category" list="attCats" value="${esc(x.category)}" title="Κατηγορία"><input data-f="role" value="${esc(x.role)}" placeholder="Ιδιότητα"${categoryBasis(x.category) === '216' ? '' : ' hidden'}>
<span class="att-name"><input data-f="name" value="${esc(x.name)}" placeholder="Όνομα (κενό = κενή θέση)" autocomplete="off"></span><input data-f="province" value="${esc(x.province)}" placeholder="Επαρχία">
<span class="att-st">${x.member_id ? '<span class="vok" title="Μέλος του Μητρώου">✓</span>' : x.name ? '<span class="vwarn" title="Δεν συνδέθηκε με μέλος του Μητρώου — επιλέξτε από τη λίστα">⚠</span>' : '<span class="muted" title="Λείπει Διορισμός">κενή</span>'}</span>
<button type="button" class="btn small" data-mv="-1" title="Πάνω">↑</button><button type="button" class="btn small" data-mv="1" title="Κάτω">↓</button><button type="button" class="btn small danger" data-rm title="Αφαίρεση">✕</button></div>`).join('');
        rowsBox.querySelectorAll('[data-f=name]').forEach((inp) => attachPicker(inp, (q) => memberItems(q), (m) => {
          const i = +inp.closest('[data-i]').dataset.i; seats[i] = { ...seats[i], member_id: m.id, name: `${m.first_name || ''} ${m.surname || ''}`.trim() }; rows(); draw();
        }));
        draw();
      };
      rowsBox.addEventListener('input', (e) => {
        const r = e.target.closest('[data-i]'), k = e.target.dataset.f; if (!r || !k) return;
        const i = +r.dataset.i; seats[i] = { ...seats[i], [k]: e.target.value }; if (k === 'name') seats[i].member_id = null;
        if (k === 'category') { rows(); return; }
        draw();
      });
      rowsBox.addEventListener('click', (e) => {
        const r = e.target.closest('[data-i]'); if (!r) return; const i = +r.dataset.i;
        if (e.target.closest('[data-rm]')) { seats.splice(i, 1); rows(); }
        const mv = e.target.closest('[data-mv]'); if (mv) { const j = i + Number(mv.dataset.mv); if (j >= 0 && j < seats.length) { [seats[i], seats[j]] = [seats[j], seats[i]]; rows(); } }
      });
      el.querySelector('.dz-controls').addEventListener('input', (e) => { const k = e.target.dataset.s; if (!k) return; st[k] = e.target.value; draw(); });
      const last = () => seats[seats.length - 1] || { category: EX_CAT };
      const load = (list, header = {}) => {
        seats = list.map(linkSeat).map((x) => ({ category: x.category, role: x.role === '—' ? '' : x.role, name: x.name, province: x.province, member_id: x.member_id || null }));
        for (const [k, v] of Object.entries(header)) { st[k] = v; const i = el.querySelector(`[data-s=${k}]`); if (i) i.value = v; }
        rows(); toast(`${seats.length} θέσεις — ελέγξτε και πατήστε «💾 Αποθήκευση».`);
      };
      el.querySelector('#attDocx').addEventListener('change', async (e) => {
        const file = e.target.files[0]; if (!file) return;
        try { const { text, header } = await docxRoster(file); el.querySelector('#attText').value = text; load(parseRosterText(text), header); }
        catch (err) { toast(err.message || String(err), 'error'); }
      });
      bind(el, {
        addSeat() { seats.push({ category: last().category, role: '', name: '', province: '', member_id: null }); rows(); },
        addVacant() { seats.push({ category: last().category, role: '', name: '', province: last().province || '', member_id: null }); rows(); },
        addCat() { const c = prompt('Νέα κατηγορία (π.χ. «Αιρετά Μέλη Θητείας 2027 - 2030»):'); if (c && c.trim()) { seats.push({ category: c.trim(), role: '', name: '', province: '', member_id: null }); rows(); } },
        parse() { const xs = parseRosterText(el.querySelector('#attText').value); if (!xs.length) { toast('Δεν βρέθηκαν θέσεις στο κείμενο.', 'error'); return; } load(xs); },
        async save() {
          const linked = seats.map(linkSeat), miss = linked.filter((x) => x.name && !x.member_id);
          if (miss.length && !confirmDo(`${miss.length} ονόματα δεν συνδέθηκαν με μέλος του Μητρώου (θα τυπώνονται, αλλά χωρίς email/WhatsApp):\n${miss.map((x) => '• ' + x.name).join('\n')}\n\nΣυνέχεια αποθήκευσης;`)) return;
          await db.save(`ΣΓΥ: Παρουσιολόγιο / κατάλογος θέσεων (${linked.length})`, (tx) => {
            tx.remove('sgy_roster', () => true);
            linked.forEach((x, i) => tx.insert('sgy_roster', { seq: i + 1, category: x.category, role: x.role || '', name: x.name || '', province: x.province || '', member_id: x.member_id || null }));
            tx.setting('sgy_attendance', JSON.stringify(Object.fromEntries(Object.keys(ATT_DEFAULT).map((k) => [k, st[k] ?? '']))));
          });
          flash('Το Παρουσιολόγιο και ο κατάλογος του ΣΓΥ αποθηκεύτηκαν.'); go('/sgy/attendance');
        },
        print: () => printPaper(`Παρουσιολόγιο ΣΓΥ ${attDate(st)}`),
        async pdf() { const { paperPdf } = await import('../core/pdf.js'); const t = `Παρουσιολόγιο ΣΓΥ ${attDate(st)}`; download(t + '.pdf', await paperPdf(prev.querySelector('.paper'), { title: t }), 'application/pdf'); },
      });
      rows();
    },
  };
}

module({ id: 'sgy-attendance', routes: { '/sgy/attendance': attendancePage } });
