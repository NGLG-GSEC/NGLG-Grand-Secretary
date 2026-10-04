# Κατάλογος — όλα τα στοιχεία επικοινωνίας σε μία σελίδα: Επαρχίες (Γραμματεία, ΕπΜΔ, ΕπΜΓρ.) και Συμβολικές Στοές,
# με αναζήτηση, αντιγραφή email και «Επιστολή προς…» με ένα πάτημα.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

DIRECTORY_JS='''<script>
(function(){
 function copy(t,btn){const done=()=>{const o=btn.textContent;btn.textContent='✓ Αντιγράφηκε';setTimeout(()=>btn.textContent=o,1400)};
  if(navigator.clipboard&&window.isSecureContext)navigator.clipboard.writeText(t).then(done,()=>prompt('Αντιγραφή:',t));else prompt('Αντιγραφή:',t);}
 document.addEventListener('click',e=>{const b=e.target.closest('[data-copy]');if(!b)return;e.preventDefault();
  let t=b.dataset.copy;if(t==='@visible'){t=[...document.querySelectorAll('#dirLodges tbody tr:not([hidden]) [data-mail]')].map(x=>x.dataset.mail).filter(Boolean).join(', ');}
  if(t)copy(t,b);});
 const q=document.getElementById('dirQ'),pv=document.getElementById('dirProv');
 const fold=t=>t.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/ς/g,'σ');
 function filt(){const w=fold(q.value).split(/\\s+/).filter(Boolean),p=pv.value;let n=0;
  document.querySelectorAll('[data-hay]').forEach(el=>{const ok=w.every(x=>fold(el.dataset.hay).includes(x))&&(!p||!el.dataset.prov||el.dataset.prov===p);el.hidden=!ok;if(ok&&el.tagName==='TR')n++;});
  document.getElementById('dirCount').textContent=n;}
 q.addEventListener('input',filt);pv.addEventListener('change',filt);
})();
</script>'''

def _dir_mail(email,name=''):
    if not email:return '<span class="muted">—</span>'
    return (f'<a href="mailto:{esc(email)}" data-mail="{esc(email)}">{esc(email)}</a> '
            f'<button type="button" class="btn" style="padding:2px 8px;min-height:0" data-copy="{esc(email)}" title="Αντιγραφή">📋</button>')

def _dir_letter(name,email):
    return f'<a class="btn" style="padding:3px 9px;min-height:0" href="/new?to_name={quote(name)}&to_email={quote(email)}">✉ Επιστολή</a>' if email else ''

@app.get('/directory')
def directory_page(req:Request,prov:str=''):
    u=need(req)
    if not (isadmin(u) or isauthorised(u)):raise HTTPException(403)
    provs=provinces_all(active_only=True);lodges=_lodges_all();counts={}
    for l in lodges:counts[l.get('provincial') or '']=counts.get(l.get('provincial') or '',0)+1
    cards=''
    for p in provs:
        gm,gs=province_roles(p)
        def who(r):
            return (f'<div style="margin-top:8px"><small class="muted">{esc(r["label"] or r["abbr"])} ({esc(r["abbr"])})</small><br>'
                    f'<b>{esc(r["name"]) if r["name"] else "<span class=muted>— δεν έχει οριστεί —</span>"}</b><br>{_dir_mail(r["email"])} {_dir_letter(r["addressee"],r["email"])}</div>')
        hay=' '.join(str(x or '') for x in [p['short'],p.get('full_title'),p.get('email'),gm['name'],gm['email'],gs['name'],gs['email']])
        cards+=f"""<div class="card" data-hay="{esc(hay)}" style="margin:0"><div style="display:flex;justify-content:space-between;gap:8px;align-items:start">
<div><b style="font-size:1.08rem">{esc(p['short'])}</b><br><small class="muted">{esc(p.get('full_title') or '')}</small></div>
{f'<a class="btn" style="padding:3px 9px;min-height:0" href="/provinces/edit/{p["id"]}">Edit</a>' if isadmin(u) else ''}</div>
<div style="margin-top:8px"><small class="muted">Γραμματεία</small><br>{_dir_mail(p.get('email') or '')} {_dir_letter(p.get('addressee') or p['short'],p.get('email') or '')}</div>
{who(gm)}{who(gs)}
{'' if p.get('kind')=='Εθνική' else f'<div style="margin-top:8px"><a href="/directory?prov={quote(p["short"])}#stoes">{counts.get(p["short"],0)} Στοές ↓</a></div>'}</div>"""
    regional=[p for p in provs if p.get('kind')!='Εθνική']
    allsec=', '.join(p['email'] for p in regional if p.get('email'))
    allgm=', '.join(r['email'] for p in regional for r in province_roles(p)[:1] if r['email'])
    allgs=', '.join(r['email'] for p in regional for r in province_roles(p)[1:] if r['email'])
    bulk=''.join(f'<button type="button" class="btn" data-copy="{esc(v)}"{"" if v else " disabled"}>📋 {t}</button>' for t,v in
                 [('Όλα τα email Γραμματειών',allsec),('Όλοι οι ΕπΜΔ',allgm),('Όλοι οι ΕπΜΓρ.',allgs)])
    rows=''.join(f"""<tr data-hay="{esc(' '.join(str(l.get(k) or '') for k in LODGE_COLS))}" data-prov="{esc(l.get('provincial') or '')}">
<td><b>{esc(str(l['number']))}</b></td><td><b>{esc(l['name'])}</b>{'' if (l.get('status') or 'Ενεργή')=='Ενεργή' else '<br><small class=muted>'+esc(l['status'])+'</small>'}<br><small class="muted">{esc(lodge_title(l))}</small></td>
<td>{esc(l.get('provincial') or '—')}</td><td>{esc(l.get('ritual') or '')}</td><td>{esc(l.get('meeting_place') or l.get('orient') or '')}</td>
<td>{esc(l.get('master') or '')}</td><td>{esc(l.get('secretary') or '')}</td>
<td>{_dir_mail(lodge_email(l))}{('<br>'+_dir_mail(l['secretary_email'])) if l.get('secretary_email') and l.get('email') and l['secretary_email']!=l['email'] else ''}</td>
<td>{_dir_letter(lodge_title(l),lodge_email(l))}{f' <a class="btn" style="padding:3px 9px;min-height:0" href="/lodges/edit/{l["id"]}">Edit</a>' if isadmin(u) else ''}</td></tr>""" for l in lodges)
    popts=''.join(f'<option{" selected" if p["short"]==prov else ""}>{esc(p["short"])}</option>' for p in regional)
    act=[l for l in lodges if (l.get('status') or 'Ενεργή')!='Ανενεργή'];nomail=sum(1 for l in act if not lodge_email(l));noprov=sum(1 for l in act if not l.get('provincial'))
    missing=[f'{sum(1 for p in regional if not (p.get("master_name") or "").strip())} Επαρχίες χωρίς ΕπΜΔ',f'{sum(1 for p in regional if not (p.get("secretary_name") or "").strip())} χωρίς ΕπΜΓρ.',
             f'{nomail} ενεργές Στοές χωρίς email',f'{noprov} χωρίς Επαρχία']
    todo=(f'<p class="muted" style="margin:8px 0 0">Προς συμπλήρωση: {esc(" · ".join(missing))}.</p>') if (nomail or noprov or any(not (p.get('master_name') or '').strip() or not (p.get('secretary_name') or '').strip() for p in regional)) else ''
    return page(f"""<h1>📇 Κατάλογος</h1>
<div class="card"><p style="margin-top:0">Όλα τα στοιχεία επικοινωνίας σε ένα σημείο. Πατήστε 📋 για αντιγραφή ή «✉ Επιστολή» για νέα επιστολή με συμπληρωμένο παραλήπτη.
Τα ίδια στοιχεία εμφανίζονται ως επιλογές παραληπτών στις Επιστολές και στα email των Επισκέψεων.</p>
<style>.dirf{{display:grid;grid-template-columns:2fr 1fr;gap:8px}}@media(max-width:700px){{.dirf{{grid-template-columns:1fr}}}}</style><div class="dirf"><input id="dirQ" placeholder="🔎 Αναζήτηση: Επαρχία, Στοά, αριθμός, όνομα, email, Τυπικό, τόπος…" autofocus>
<select id="dirProv"><option value="">Όλες οι Επαρχίες</option>{popts}</select></div>
<div class="toolbar" style="margin-top:8px"><a class="btn" href="/provinces/export.xlsx">⬇ Excel Επαρχιών</a><a class="btn" href="/lodges/export.xlsx">⬇ Excel Στοών</a>{'<a class="btn" href="/provinces">Επεξεργασία Επαρχιών</a><a class="btn" href="/lodges">Επεξεργασία Στοών</a>' if isadmin(u) else ''}</div>{todo}</div>
<h2>Επαρχιακές Μεγάλες Στοές</h2><div class="toolbar">{bulk}</div>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px;margin:10px 0 18px">{cards}</div>
<h2 id="stoes">Συμβολικές Στοές <small class="muted">(<span id="dirCount">{len(lodges)}</span>)</small></h2>
<div class="toolbar"><button type="button" class="btn" data-copy="@visible">📋 Email των Στοών που εμφανίζονται</button></div>
<div class="card" style="overflow:auto"><table id="dirLodges"><thead><tr><th>Αρ.</th><th>Στοά</th><th>ΕπΜΣτ.</th><th>Τυπικό</th><th>Τόπος</th><th>Σεβάσμιος</th><th>Γραμματέας</th><th>Email</th><th>Ενέργειες</th></tr></thead><tbody>{rows}</tbody></table></div>
{DIRECTORY_JS}{"<script>document.getElementById('dirProv').dispatchEvent(new Event('change'))</script>" if prov else ''}""",u,'Κατάλογος')
