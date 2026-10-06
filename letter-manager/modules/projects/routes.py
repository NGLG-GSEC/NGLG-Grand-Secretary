# Πρότζεκτ ΜΔ — λίστα, νέο πρότζεκτ, σελίδα πρότζεκτ (στοιχεία, Στοές/ομάδες, μέλη, επαφές, αρχεία, ημερολόγιο), αναφορά PDF.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

PJ_CSS='''<style>.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}
.pcard{display:flex;flex-direction:column;background:#fff;border:1px solid #d8deea;border-radius:12px;overflow:hidden;color:inherit}.pcard:hover{border-color:#b18a43}
.pcover{aspect-ratio:16/7;background:#f6efdc;display:flex;align-items:center;justify-content:center;overflow:hidden}.pcover.big{aspect-ratio:4/3;border-radius:10px;max-width:280px}
.pcover img{width:100%;height:100%;object-fit:cover}.pcover span{font-size:2.2rem;color:#9c7a22;font-weight:bold}
.pbody{padding:12px 14px}.pchip{display:inline-block;font-size:.8rem;padding:2px 9px;border-radius:999px;background:#eef3fa;color:#123b7a;margin-right:6px}
.plate{color:#9a4a12;font-weight:bold}.files{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px}
.fitem{border:1px solid #d8deea;border-radius:8px;overflow:hidden;background:#fff}.fthumb{aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;background:#f6efdc;color:#9c7a22;font-weight:bold;font-size:1.3rem;overflow:hidden}
.fthumb img{width:100%;height:100%;object-fit:cover}.fmeta{padding:6px 8px;font-size:.85rem;overflow-wrap:anywhere}
.prow{display:grid;grid-template-columns:repeat(5,minmax(0,1fr)) auto;gap:8px;align-items:end;border-bottom:1px solid #eef2f7;padding:6px 0}
.pmain{display:grid;grid-template-columns:minmax(0,280px) minmax(0,1fr);gap:18px}.pf{display:grid;gap:8px;align-items:center}.pf3{grid-template-columns:1fr 2fr auto}.pfl{grid-template-columns:170px 1fr auto}.pfs{grid-template-columns:2fr 1fr auto}
input[type=file]{max-width:100%;min-width:0}
@media(max-width:800px){.prow,.pmain,.pf3,.pfl,.pfs{grid-template-columns:1fr}}</style>'''

PJ_MEMBER_PICK_JS='''<script>
(function(){
 document.querySelectorAll('.mpick').forEach(q=>{
  const box=q.nextElementSibling,hid=document.getElementById(q.dataset.target);let t=null;
  q.addEventListener('input',()=>{clearTimeout(t);if(hid&&!q.value.trim())hid.value='';const v=q.value.trim();if(v.length<2){box.innerHTML='';return;}
   t=setTimeout(async()=>{const r=await fetch('/api/members/search?q='+encodeURIComponent(v));if(!r.ok)return;const d=await r.json();box.innerHTML='';
    (d.items||[]).forEach(m=>{const b=document.createElement('button');b.type='button';b.className='btn';b.style.cssText='display:block;width:100%;text-align:left;margin:3px 0';
     b.textContent=(m.surname||'')+' '+(m.first_name||'')+(m.email?' — '+m.email:'');
     b.onclick=()=>{if(hid)hid.value=m.id;q.value=(m.surname||'')+' '+(m.first_name||'');box.innerHTML='';if(q.dataset.autosubmit)q.form.submit();};box.appendChild(b);});
    if(!(d.items||[]).length)box.innerHTML='<small>Δεν βρέθηκε μέλος.</small>';},220);});
 });
})();
</script>'''

def _pj_admin(req):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    return u

def _pj(pid):
    p=project_get(pid)
    if not p:raise HTTPException(404)
    return p

def _pj_touch(c,pid):c.execute('UPDATE projects SET updated_at=? WHERE id=?',(now(),pid))

def _pj_back(pid,msg='',anchor=''):
    return RedirectResponse(f'/projects/{pid}'+('?msg='+quote(msg) if msg else '')+(f'#{anchor}' if anchor else ''),303)

def _pj_cover(p,big=False):
    cls='pcover big' if big else 'pcover'
    return f'<div class="{cls}">'+(f'<img src="/projects/file/{p["cover_file"]}" alt="">' if p.get('cover_file') else f'<span>{esc(project_initials(p["title"]))}</span>')+'</div>'

@app.get('/projects')
def projects_page(req:Request,q:str='',st:str=''):
    u=_pj_admin(req);allp=projects_all();ql=nd_fold(q)
    xs=[p for p in allp if (not st or p['status']==st) and (not ql or ql in nd_fold(p['title']+' '+PROJECT_TYPES.get(p['ptype'],'')))]
    cards=''.join(f"""<a class="pcard" href="/projects/{p['id']}">{_pj_cover(p)}<div class="pbody"><small class="muted">{esc(PROJECT_TYPES.get(p['ptype'],''))}</small>
<div style="font-weight:bold;font-size:1.05rem">{esc(p['title'] or 'Χωρίς τίτλο')}</div>
<div class="muted">Έναρξη {esc(fmt_ddmmyyyy(p['start_date']) or '—')} · Στόχος {esc(fmt_ddmmyyyy(p['target_date']) or '—')}</div>
<div><span class="pchip">{esc(PROJECT_STATUSES.get(p['status'],''))}</span><span class="{'plate' if project_late(p) else 'muted'}">{esc(project_due(p))}</span></div>
<div class="muted">{p['n_units']} {project_unit_label(p).lower()} · {p['n_members']} μέλη · {p['n_contacts']} επαφές · {p['n_files']} αρχεία</div></div></a>""" for p in xs)
    sts=''.join(f'<option value="{k}"{" selected" if k==st else ""}>{v}</option>' for k,v in PROJECT_STATUSES.items())
    stats=f"<p><b>{len(allp)}</b> πρότζεκτ · <b>{sum(1 for p in allp if p['status']=='active')}</b> σε εξέλιξη · <b>{sum(1 for p in allp if project_late(p))}</b> εκπρόθεσμα</p>" if allp else ''
    empty='<div class="card">Δεν υπάρχουν ακόμη πρότζεκτ. Πατήστε «Νέο πρότζεκτ» — π.χ. ίδρυση νέας Στοάς ή νέου Σώματος.</div>' if not allp else '<div class="card">Κανένα πρότζεκτ δεν ταιριάζει με την αναζήτηση.</div>'
    return page(PJ_CSS+f"""<h1>Πρότζεκτ ΜΔ</h1><div class="toolbar"><a class="btn primary" href="/projects/new">+ Νέο πρότζεκτ</a></div>
<form class="card pf pfs" method="get"><input name="q" value="{esc(q)}" placeholder="Αναζήτηση πρότζεκτ…"><select name="st"><option value="">Όλες οι καταστάσεις</option>{sts}</select><button>Αναζήτηση</button></form>
{stats}{f'<div class="pgrid">{cards}</div>' if xs else empty}""",u,'Πρότζεκτ ΜΔ')

@app.get('/projects/new')
def projects_new(req:Request):
    u=_pj_admin(req)
    types=''.join(f'<option value="{k}">{v}</option>' for k,v in PROJECT_TYPES.items())
    return page(f"""<h1>Νέο πρότζεκτ</h1><form method="post" class="grid card">
<div class="full"><label>Τίτλος</label><input name="title" required placeholder="π.χ. Ίδρυση Σ.Σ. «…»"></div>
<div><label>Είδος</label><select name="ptype" onchange="document.getElementById('nunits').hidden=this.value!=='body'">{types}</select></div>
<div id="nunits" hidden><label>Πόσες Στοές θα έχει το Σώμα</label><input name="units" type="number" min="0" max="50" value="4"><small class="muted">Δημιουργούνται ως «Στοά 1», «Στοά 2»… και μετονομάζονται αργότερα.</small></div>
<div><label>Ημερομηνία έναρξης</label><input type="date" name="start_date" value="{date.today().isoformat()}"></div>
<div><label>Ημερομηνία στόχου</label><input type="date" name="target_date"></div>
<div class="full"><button class="primary">Δημιουργία</button> <a class="btn" href="/projects">Άκυρο</a></div></form>""",u,'Νέο πρότζεκτ')

@app.post('/projects/new')
def projects_new_save(req:Request,title:str=Form(''),ptype:str=Form('lodge'),units:str=Form('0'),start_date:str=Form(''),target_date:str=Form('')):
    _pj_admin(req);title=title.strip()
    if not title:raise HTTPException(400,'Συμπληρώστε τίτλο.')
    ptype=ptype if ptype in PROJECT_TYPES else 'other';ts=now()
    with con() as c:
        pid=c.execute('INSERT INTO projects(title,ptype,status,start_date,target_date,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',
                      (title,ptype,'plan',start_date if _vdate(start_date) else '',target_date if _vdate(target_date) else '',ts,ts)).lastrowid
        names=[title] if ptype=='lodge' else [f'Στοά {i}' for i in range(1,max(0,min(50,int(units) if units.isdigit() else 0))+1)] if ptype=='body' else []
        for i,n in enumerate(names):c.execute('INSERT INTO project_units(project_id,name,sort) VALUES(?,?,?)',(pid,n,i))
    return RedirectResponse(f'/projects/{pid}',303)

@app.get('/projects/{pid}')
def project_page(req:Request,pid:int,msg:str=''):
    u=_pj_admin(req);p=_pj(pid);mi={m['id']:m for m in project_members_info([x['leader_member_id'] for x in p['units'] if x.get('leader_member_id')])}
    types=''.join(f'<option value="{k}"{" selected" if p["ptype"]==k else ""}>{v}</option>' for k,v in PROJECT_TYPES.items())
    sts=''.join(f'<option value="{k}"{" selected" if p["status"]==k else ""}>{v}</option>' for k,v in PROJECT_STATUSES.items())
    unit_word='Ομάδα' if p['ptype']=='other' else 'Στοά'
    units=''.join(f"""<div class="prow"><input type="hidden" name="uid" value="{x['id']}">
<div><label>{'Όνομα Στοάς' if p['ptype']=='lodge' else f'{unit_word} {i}'}</label><input name="uname" value="{esc(x['name'])}"></div>
<div style="grid-column:span 2"><label>Υπεύθυνος</label><input type="hidden" id="ul{x['id']}" name="uleader" value="{x.get('leader_member_id') or ''}"><input class="mpick" data-target="ul{x['id']}" value="{esc((mi[x['leader_member_id']]['surname']+' '+mi[x['leader_member_id']]['first_name']) if x.get('leader_member_id') in mi else '')}" placeholder="🔎 Από το Μητρώο Μελών…" autocomplete="off"><div></div>
{f'<small class="muted">{esc(" · ".join(v for v in [mi[x["leader_member_id"]].get("mobile"),mi[x["leader_member_id"]].get("email")] if v))}</small>' if x.get('leader_member_id') in mi else ''}</div>
<div style="grid-column:span 2"><label>Σημειώσεις</label><input name="unotes" value="{esc(x.get('notes') or '')}"></div>
<div>{'' if p['ptype']=='lodge' else f'<button formaction="/projects/{pid}/units/delete/{x["id"]}" onclick="return confirm(&quot;Αφαίρεση;&quot;)">✕</button>'}</div></div>""" for i,x in enumerate(p['units'],1))
    members=project_members_info(p['member_ids'])
    mrows=''.join(f"""<tr><td><b>{esc(m['surname'])}</b> {esc(m['first_name'])}<div class="muted">{esc(m.get('degree') or '')}</div></td><td class="muted">{esc(member_lodges_text(m))}</td>
<td style="white-space:nowrap">{esc(m.get('mobile') or '—')}</td><td>{esc(m.get('email') or '—')}</td>
<td><form method="post" action="/projects/{pid}/members/delete/{m['id']}"><button>✕</button></form></td></tr>""" for m in members)
    crows=''.join(f"""<div class="prow"><input type="hidden" name="cid" value="{x['id']}">"""+''.join(f'<div><label>{lab}</label><input name="c_{k}" value="{esc(x.get(k) or "")}"{" type=email" if k=="email" else " type=tel" if k=="phone" else ""}></div>' for k,lab in [('name','Ονοματεπώνυμο'),('role','Ιδιότητα / φορέας'),('phone','Τηλέφωνο'),('email','Email'),('notes','Σημειώσεις')])+
                  f"""<div><button formaction="/projects/{pid}/contacts/delete/{x['id']}">✕</button></div></div>""" for x in p['contacts'])
    files=''.join(f"""<div class="fitem"><a class="fthumb" href="{esc(f['url'] if f['kind']=='link' else '/projects/file/'+str(f['id']))}" target="_blank" rel="noopener">{f'<img src="/projects/file/{f["id"]}" alt="">' if f['kind']=='image' else 'PDF' if f['kind']=='pdf' else '🔗'}</a>
<div class="fmeta"><b>{esc(f['name'])}</b><br><span class="muted">{esc(f['url'].replace('https://','').replace('http://','')[:40]) if f['kind']=='link' else ('PDF' if f['kind']=='pdf' else 'Φωτογραφία')+' · '+esc(fmt_ddmmyyyy(f.get('added_on') or ''))}</span>
<form method="post" action="/projects/{pid}/files/delete/{f['id']}" onsubmit="return confirm('Αφαίρεση;')"><button style="margin-top:4px">✕ Αφαίρεση</button></form></div></div>""" for f in p['files'])
    logs=''.join(f"""<tr><td style="white-space:nowrap"><b>{esc(fmt_ddmmyyyy(x['log_date']) or '—')}</b></td><td style="white-space:pre-wrap">{esc(x['text'])}</td><td><form method="post" action="/projects/{pid}/log/delete/{x['id']}"><button>✕</button></form></td></tr>""" for x in p['log'])
    notice=f"<div class='card'><b>{esc(msg)}</b></div>" if msg else ''
    sec=lambda t,extra='':f'<h2 style="margin:26px 0 8px">{t} {extra}</h2>'
    return page(PJ_CSS+f"""<div class="toolbar"><a class="btn" href="/projects">← Όλα τα πρότζεκτ</a><a class="btn" href="/projects/{pid}/report.pdf">⬇ Αναφορά PDF</a>
<form method="post" action="/projects/{pid}/delete" style="display:inline" onsubmit="return confirm('Διαγραφή του πρότζεκτ μαζί με τα αρχεία του;')"><button>Διαγραφή</button></form></div>{notice}
<h1>{esc(p['title'])}</h1><p class="{'plate' if project_late(p) else 'muted'}">{esc(project_due(p))}</p>
<div class="card pmain" id="main">
<div>{_pj_cover(p,True)}<form method="post" action="/projects/{pid}/cover" enctype="multipart/form-data" style="margin-top:8px"><input type="file" name="file" accept="image/png,image/jpeg,image/webp,image/gif" required><button style="margin-top:6px">{'Αλλαγή εικόνας' if p.get('cover_file') else 'Εικόνα προφίλ'}</button></form>
{f'<form method="post" action="/projects/{pid}/cover/delete"><button style="margin-top:6px">Αφαίρεση εικόνας</button></form>' if p.get('cover_file') else ''}</div>
<form method="post" action="/projects/{pid}/save" class="grid"><div class="full"><label>Τίτλος</label><input name="title" value="{esc(p['title'])}" required></div>
<div><label>Είδος</label><select name="ptype">{types}</select></div><div><label>Κατάσταση</label><select name="status">{sts}</select></div>
<div><label>Ημερομηνία έναρξης</label><input type="date" name="start_date" value="{esc(p['start_date'] or '')}"></div><div><label>Ημερομηνία στόχου</label><input type="date" name="target_date" value="{esc(p['target_date'] or '')}"></div>
<div class="full"><label>Περιγραφή</label><textarea name="description" style="min-height:90px">{esc(p['description'] or '')}</textarea></div>
<div class="full"><label>Σημειώσεις</label><textarea name="notes" style="min-height:90px">{esc(p['notes'] or '')}</textarea></div><div class="full"><button class="primary">Αποθήκευση στοιχείων</button></div></form></div>
{sec(project_unit_label(p),f'<small class="muted">{len(p["units"])}</small>')}<form method="post" action="/projects/{pid}/units" class="card" id="units">{units or '<p class="muted">Δεν υπάρχουν ακόμη.</p>'}
<div class="toolbar" style="margin-top:8px">{'<button class="primary">Αποθήκευση</button>' if p['units'] else ''}{'' if p['ptype']=='lodge' else f'<button formaction="/projects/{pid}/units/add">+ {unit_word}</button>'}</div></form>
{sec('Μέλη',f'<small class="muted">{len(members)}</small>')}<div class="card" id="members"><form method="post" action="/projects/{pid}/members/add"><input type="hidden" id="newmember" name="member_id"><input class="mpick" data-target="newmember" data-autosubmit="1" placeholder="🔎 Προσθήκη μέλους — πληκτρολογήστε όνομα ή επώνυμο…" autocomplete="off"><div></div></form>
{f'<div style="overflow:auto;margin-top:8px"><table><tr><th>Ονοματεπώνυμο</th><th>Στοές</th><th>Κινητό</th><th>Email</th><th></th></tr>{mrows}</table></div>' if members else '<p class="muted">Δεν έχουν προστεθεί ακόμη μέλη.</p>'}</div>
{sec('Επαφές &amp; συνεργάτες','<small class="muted">εκτός μελών</small>')}<form method="post" action="/projects/{pid}/contacts" class="card" id="contacts">{crows or '<p class="muted">Δεν υπάρχουν ακόμη εξωτερικές επαφές.</p>'}
<div class="toolbar" style="margin-top:8px">{'<button class="primary">Αποθήκευση</button>' if p['contacts'] else ''}<button formaction="/projects/{pid}/contacts/add">+ Επαφή</button></div></form>
{sec('Αρχεία &amp; σύνδεσμοι',f'<small class="muted">{len(p["files"])}</small>')}<div class="card" id="files">
<form method="post" action="/projects/{pid}/files" enctype="multipart/form-data" class="toolbar"><input type="file" name="files" multiple accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" required style="max-width:100%"><button>+ Φωτογραφίες / PDF</button></form>
<form method="post" action="/projects/{pid}/links" class="pf pf3" style="margin:8px 0"><input name="name" placeholder="Τίτλος συνδέσμου"><input name="url" placeholder="https://…" required><button>+ Σύνδεσμος</button></form>
<div class="files">{files or '<p class="muted">Δεν υπάρχουν ακόμη αρχεία ή σύνδεσμοι.</p>'}</div><small class="muted">Εικόνες (JPG, PNG, WEBP, GIF) και PDF έως 20 MB.</small></div>
{sec('Πληροφορίες &amp; ημερολόγιο εργασιών')}<div class="card" id="log"><form method="post" action="/projects/{pid}/log" class="pf pfl">
<input type="date" name="log_date" value="{date.today().isoformat()}"><input name="text" placeholder="π.χ. Συνάντηση με τα ιδρυτικά μέλη" required><button class="primary">Προσθήκη</button></form>
{f'<table style="margin-top:8px">{logs}</table>' if logs else '<p class="muted">Δεν υπάρχουν ακόμη καταχωρίσεις.</p>'}</div>{PJ_MEMBER_PICK_JS}""",u,p['title'])

@app.post('/projects/{pid}/save')
def project_save(req:Request,pid:int,title:str=Form(''),ptype:str=Form('lodge'),status:str=Form('plan'),start_date:str=Form(''),target_date:str=Form(''),description:str=Form(''),notes:str=Form('')):
    _pj_admin(req);p=_pj(pid)
    if not title.strip():raise HTTPException(400,'Συμπληρώστε τίτλο.')
    ptype=ptype if ptype in PROJECT_TYPES else p['ptype'];status=status if status in PROJECT_STATUSES else p['status']
    with con() as c:
        c.execute('UPDATE projects SET title=?,ptype=?,status=?,start_date=?,target_date=?,description=?,notes=?,updated_at=? WHERE id=?',
                  (title.strip(),ptype,status,start_date if _vdate(start_date) else '',target_date if _vdate(target_date) else '',description,notes,now(),pid))
        if ptype=='lodge' and not p['units']:c.execute('INSERT INTO project_units(project_id,name,sort) VALUES(?,?,?)',(pid,title.strip(),0))
    return _pj_back(pid,'Αποθηκεύτηκε.')

@app.post('/projects/{pid}/units')
async def project_units_save(req:Request,pid:int):
    _pj_admin(req);_pj(pid);f=await req.form()
    with con() as c:
        for uid,name,leader,notes in zip(f.getlist('uid'),f.getlist('uname'),f.getlist('uleader'),f.getlist('unotes')):
            c.execute('UPDATE project_units SET name=?,leader_member_id=?,notes=? WHERE id=? AND project_id=?',(str(name).strip(),int(leader) if str(leader).isdigit() else None,str(notes),int(uid),pid))
        _pj_touch(c,pid)
    return _pj_back(pid,'Αποθηκεύτηκε.','units')

@app.post('/projects/{pid}/units/add')
def project_unit_add(req:Request,pid:int):
    _pj_admin(req);p=_pj(pid)
    with con() as c:c.execute('INSERT INTO project_units(project_id,name,sort) VALUES(?,?,?)',(pid,f"{'Ομάδα' if p['ptype']=='other' else 'Στοά'} {len(p['units'])+1}",len(p['units'])));_pj_touch(c,pid)
    return _pj_back(pid,'','units')

@app.post('/projects/{pid}/units/delete/{uid}')
def project_unit_delete(req:Request,pid:int,uid:int):
    _pj_admin(req)
    with con() as c:c.execute('DELETE FROM project_units WHERE id=? AND project_id=?',(uid,pid));_pj_touch(c,pid)
    return _pj_back(pid,'','units')

@app.post('/projects/{pid}/members/add')
def project_member_add(req:Request,pid:int,member_id:str=Form('')):
    _pj_admin(req);p=_pj(pid)
    if not member_id.isdigit():return _pj_back(pid,'Επιλέξτε μέλος από τη λίστα αναζήτησης.','members')
    mid=int(member_id)
    with con() as c:
        if not c.execute('SELECT id FROM member_registry WHERE id=?',(mid,)).fetchone():raise HTTPException(404)
        if mid not in p['member_ids']:c.execute('INSERT INTO project_members(project_id,member_id) VALUES(?,?)',(pid,mid));_pj_touch(c,pid)
    return _pj_back(pid,'','members')

@app.post('/projects/{pid}/members/delete/{mid}')
def project_member_delete(req:Request,pid:int,mid:int):
    _pj_admin(req)
    with con() as c:c.execute('DELETE FROM project_members WHERE project_id=? AND member_id=?',(pid,mid));_pj_touch(c,pid)
    return _pj_back(pid,'','members')

@app.post('/projects/{pid}/contacts')
async def project_contacts_save(req:Request,pid:int):
    _pj_admin(req);_pj(pid);f=await req.form();cols=['name','role','phone','email','notes']
    with con() as c:
        for i,cid in enumerate(f.getlist('cid')):
            vals=[str((f.getlist('c_'+k)+['']*(i+1))[i]).strip() for k in cols]
            c.execute('UPDATE project_contacts SET name=?,role=?,phone=?,email=?,notes=? WHERE id=? AND project_id=?',(*vals,int(cid),pid))
        _pj_touch(c,pid)
    return _pj_back(pid,'Αποθηκεύτηκε.','contacts')

@app.post('/projects/{pid}/contacts/add')
async def project_contact_add(req:Request,pid:int):
    await project_contacts_save(req,pid)
    with con() as c:c.execute('INSERT INTO project_contacts(project_id) VALUES(?)',(pid,))
    return _pj_back(pid,'','contacts')

@app.post('/projects/{pid}/contacts/delete/{cid}')
def project_contact_delete(req:Request,pid:int,cid:int):
    _pj_admin(req)
    with con() as c:c.execute('DELETE FROM project_contacts WHERE id=? AND project_id=?',(cid,pid));_pj_touch(c,pid)
    return _pj_back(pid,'','contacts')

def _pj_sniff(data):
    if data[:3]==b'\xff\xd8\xff':return 'image/jpeg'
    if data[:8]==b'\x89PNG\r\n\x1a\n':return 'image/png'
    if data[:4]==b'GIF8':return 'image/gif'
    if data[:4]==b'RIFF' and data[8:12]==b'WEBP':return 'image/webp'
    if data[:5]==b'%PDF-':return 'application/pdf'
    return ''

async def _pj_read_upload(up):
    data=await up.read()
    if len(data)>PROJECT_FILE_MAX:raise HTTPException(400,f'«{up.filename}»: ξεπερνά το όριο των 20 MB.')
    ct=_pj_sniff(data)
    if not ct:raise HTTPException(400,f'«{up.filename}»: επιτρέπονται εικόνες (JPG, PNG, WEBP, GIF) και PDF.')
    return data,ct

@app.post('/projects/{pid}/files')
async def project_files_add(req:Request,pid:int):
    _pj_admin(req);_pj(pid);f=await req.form();n=0
    for up in f.getlist('files'):
        if not getattr(up,'filename',''):continue
        data,ct=await _pj_read_upload(up);stored=project_store_file(pid,data,ct)
        with con() as c:c.execute('INSERT INTO project_files(project_id,kind,name,stored_name,content_type,size,added_on) VALUES(?,?,?,?,?,?,?)',
                                  (pid,'pdf' if ct=='application/pdf' else 'image',up.filename,stored,ct,len(data),date.today().isoformat()));_pj_touch(c,pid)
        n+=1
    return _pj_back(pid,f'Ανέβηκαν {n} αρχεία.','files')

@app.post('/projects/{pid}/links')
def project_link_add(req:Request,pid:int,name:str=Form(''),url:str=Form('')):
    _pj_admin(req);_pj(pid);url=url.strip()
    if not url:raise HTTPException(400,'Συμπληρώστε τη διεύθυνση.')
    if not re.match(r'^https?://',url,re.I):url='https://'+url
    with con() as c:c.execute('INSERT INTO project_files(project_id,kind,name,url,added_on) VALUES(?,?,?,?,?)',(pid,'link',name.strip() or re.sub(r'^https?://','',url),url,date.today().isoformat()));_pj_touch(c,pid)
    return _pj_back(pid,'','files')

@app.post('/projects/{pid}/files/delete/{fid}')
def project_file_delete(req:Request,pid:int,fid:int):
    _pj_admin(req)
    with con() as c:
        f=c.execute('SELECT * FROM project_files WHERE id=? AND project_id=?',(fid,pid)).fetchone()
        if f:
            c.execute('DELETE FROM project_files WHERE id=?',(fid,));c.execute('UPDATE projects SET cover_file=NULL WHERE cover_file=?',(fid,));_pj_touch(c,pid)
    if f:project_file_drop(dict(f))
    return _pj_back(pid,'','files')

@app.post('/projects/{pid}/cover')
async def project_cover(req:Request,pid:int,file:UploadFile=File(...)):
    _pj_admin(req);p=_pj(pid);data,ct=await _pj_read_upload(file)
    if ct=='application/pdf':raise HTTPException(400,'Η εικόνα προφίλ πρέπει να είναι φωτογραφία.')
    try:  # σμίκρυνση έως 1600px
        im=PILImage.open(BytesIO(data));im.thumbnail((1600,1600));b=BytesIO();im.convert('RGB').save(b,'JPEG',quality=86);data,ct=b.getvalue(),'image/jpeg'
    except Exception:pass
    stored=project_store_file(pid,data,ct)
    with con() as c:
        fid=c.execute('INSERT INTO project_files(project_id,kind,name,stored_name,content_type,size,added_on) VALUES(?,?,?,?,?,?,?)',(pid,'cover','Εικόνα προφίλ',stored,ct,len(data),date.today().isoformat())).lastrowid
        c.execute('UPDATE projects SET cover_file=?,updated_at=? WHERE id=?',(fid,now(),pid))
    if p.get('cover_file'):_pj_drop_cover(p['cover_file'])
    return _pj_back(pid,'Η εικόνα αποθηκεύτηκε.')

def _pj_drop_cover(fid):
    with con() as c:
        f=c.execute("SELECT * FROM project_files WHERE id=? AND kind='cover'",(fid,)).fetchone()
        if f:c.execute('DELETE FROM project_files WHERE id=?',(fid,))
    if f:project_file_drop(dict(f))

@app.post('/projects/{pid}/cover/delete')
def project_cover_delete(req:Request,pid:int):
    _pj_admin(req);p=_pj(pid)
    with con() as c:c.execute('UPDATE projects SET cover_file=NULL,updated_at=? WHERE id=?',(now(),pid))
    if p.get('cover_file'):_pj_drop_cover(p['cover_file'])
    return _pj_back(pid)

@app.get('/projects/file/{fid}')
def project_file(req:Request,fid:int):
    _pj_admin(req)
    with con() as c:f=c.execute('SELECT * FROM project_files WHERE id=?',(fid,)).fetchone()
    if not f or not f['stored_name']:raise HTTPException(404)
    data=project_file_bytes(dict(f))
    if data is None:raise HTTPException(404)
    fn=quote(f['name'] or f['stored_name'])
    return Response(data,media_type=f['content_type'],headers={'Content-Disposition':f"inline; filename*=UTF-8''{fn}",'Cache-Control':'private, max-age=3600'})

@app.post('/projects/{pid}/log')
def project_log_add(req:Request,pid:int,log_date:str=Form(''),text:str=Form('')):
    _pj_admin(req);_pj(pid)
    if not text.strip():return _pj_back(pid,'','log')
    with con() as c:c.execute('INSERT INTO project_log(project_id,log_date,text,created_at) VALUES(?,?,?,?)',(pid,log_date if _vdate(log_date) else date.today().isoformat(),text.strip(),now()));_pj_touch(c,pid)
    return _pj_back(pid,'','log')

@app.post('/projects/{pid}/log/delete/{lid}')
def project_log_delete(req:Request,pid:int,lid:int):
    _pj_admin(req)
    with con() as c:c.execute('DELETE FROM project_log WHERE id=? AND project_id=?',(lid,pid));_pj_touch(c,pid)
    return _pj_back(pid,'','log')

@app.post('/projects/{pid}/delete')
def project_delete(req:Request,pid:int):
    _pj_admin(req);_pj(pid);project_delete_files(pid)
    with con() as c:
        for t in ('project_units','project_members','project_contacts','project_files','project_log'):c.execute(f'DELETE FROM {t} WHERE project_id=?',(pid,))
        c.execute('DELETE FROM projects WHERE id=?',(pid,))
    return RedirectResponse('/projects',303)

@app.get('/projects/{pid}/report.pdf')
def project_report(req:Request,pid:int):
    _pj_admin(req);p=_pj(pid);regular,bold=_pdf_fonts();b=BytesIO()
    doc=SimpleDocTemplate(b,pagesize=A4,leftMargin=15*mm,rightMargin=15*mm,topMargin=14*mm,bottomMargin=16*mm,title=p['title'])
    st=lambda n,**k:ParagraphStyle(n,fontName=k.pop('font',regular),**k)
    h=st('pjh',font=bold,fontSize=12.5,leading=16,spaceBefore=10,spaceAfter=4,textColor=colors.HexColor('#15203a'))
    cell=st('pjc',fontSize=9.2,leading=11.5);hc=st('pjhc',font=bold,fontSize=9.2,textColor=colors.white)
    def table(head,rows,widths):
        t=Table([[Paragraph(x,hc) for x in head]]+[[Paragraph(esc(str(v or '')).replace('\n','<br/>'),cell) for v in r] for r in rows],colWidths=widths,repeatRows=1)
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#15203a')),('GRID',(0,0),(-1,-1),.25,colors.HexColor('#dde2ec')),('VALIGN',(0,0),(-1,-1),'TOP')]));return t
    story=[Paragraph('ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ · ΠΡΟΤΖΕΚΤ ΜΕΓΑΛΟΥ ΔΙΔΑΣΚΑΛΟΥ',st('pjs',fontSize=8,textColor=colors.HexColor('#9c7a22'))),Spacer(1,2*mm),
           Paragraph(esc(p['title']),st('pjt',font=bold,fontSize=17,leading=21)),
           Paragraph(esc(f"{PROJECT_TYPES.get(p['ptype'],'')} · {PROJECT_STATUSES.get(p['status'],'')} · Έναρξη {fmt_ddmmyyyy(p['start_date']) or '—'} · Στόχος {fmt_ddmmyyyy(p['target_date']) or '—'} · {project_due(p)}"),st('pjm',fontSize=9,textColor=colors.HexColor('#5b6780')))]
    cover=next((f for f in p['files'] if f['id']==p.get('cover_file')),None)
    if cover:
        try:
            raw=project_file_bytes(cover);im=PILImage.open(BytesIO(raw));w,hh=im.size;s=min(70*mm/w,50*mm/hh)
            story+=[Spacer(1,3*mm),RLImage(BytesIO(raw),width=w*s,height=hh*s)]
        except Exception:pass
    if p['description']:story+=[Paragraph('Περιγραφή',h),Paragraph(esc(p['description']).replace('\n','<br/>'),cell)]
    mi={m['id']:m for m in project_members_info([x['leader_member_id'] for x in p['units'] if x.get('leader_member_id')])}
    if p['units']:story+=[Paragraph(project_unit_label(p),h),table(['Όνομα','Υπεύθυνος','Επικοινωνία','Σημειώσεις'],[[x['name'],(mi[x['leader_member_id']]['surname']+' '+mi[x['leader_member_id']]['first_name']) if x.get('leader_member_id') in mi else '—',' · '.join(v for v in [(mi.get(x.get('leader_member_id')) or {}).get('mobile'),(mi.get(x.get('leader_member_id')) or {}).get('email')] if v),x.get('notes')] for x in p['units']],[45*mm,40*mm,50*mm,45*mm])]
    ms=project_members_info(p['member_ids'])
    if ms:story+=[Paragraph(f'Μέλη ({len(ms)})',h),table(['Ονοματεπώνυμο','Στοές','Κινητό','Email'],[[m['surname']+' '+m['first_name'],member_lodges_text(m),m.get('mobile'),m.get('email')] for m in ms],[45*mm,55*mm,30*mm,50*mm])]
    if p['contacts']:story+=[Paragraph('Επαφές & συνεργάτες',h),table(['Ονοματεπώνυμο','Ιδιότητα','Τηλέφωνο','Email','Σημειώσεις'],[[x['name'],x['role'],x['phone'],x['email'],x['notes']] for x in p['contacts']],[38*mm,36*mm,28*mm,42*mm,36*mm])]
    fl=[f for f in p['files'] if f['kind']!='cover']
    if fl:story+=[Paragraph('Αρχεία & σύνδεσμοι',h),table(['Τίτλος','Είδος','Ημερομηνία'],[[f['name']+(('\n'+f['url']) if f['kind']=='link' else ''),{'link':'Σύνδεσμος','pdf':'PDF','image':'Φωτογραφία'}.get(f['kind'],''),fmt_ddmmyyyy(f.get('added_on') or '')] for f in fl],[110*mm,30*mm,40*mm])]
    if p['log']:story+=[Paragraph('Ημερολόγιο εργασιών',h),table(['Ημερομηνία','Εργασία / πληροφορία'],[[fmt_ddmmyyyy(x['log_date']),x['text']] for x in p['log']],[28*mm,152*mm])]
    if p['notes']:story+=[Paragraph('Σημειώσεις',h),Paragraph(esc(p['notes']).replace('\n','<br/>'),cell)]
    story+=[Spacer(1,5*mm),Paragraph('Εκδόθηκε '+datetime.now().strftime('%d/%m/%Y %H:%M'),st('pjf',fontSize=8,textColor=colors.HexColor('#5b6780')))]
    doc.build(story)
    return Response(b.getvalue(),media_type='application/pdf',headers={'Content-Disposition':f'attachment; filename="protzekt-{pid}.pdf"'})
