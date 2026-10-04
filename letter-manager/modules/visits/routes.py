# Επισκέψεις Στοών — ημερολόγιο, νέα/επεξεργασία, επικόλληση λίστας, ενημέρωση εκπροσώπου και Επαρχίας.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

VISITS_CSS='''<style>
.vmonth h2{display:flex;gap:10px;align-items:baseline;border-bottom:1px solid #d8deea;padding-bottom:6px;margin:26px 0 10px;color:#0b2f63}
.vmonth h2 small{font-size:.8rem;color:#6b7a90;font-weight:normal}
.vcard{display:grid;grid-template-columns:62px minmax(0,1fr) minmax(0,240px);gap:14px;align-items:start;background:#fff;border:1px solid #d8deea;border-left:5px solid #b18a43;border-radius:10px;padding:12px 14px;margin:0 0 8px;color:inherit}
.vcard:hover{border-color:#123b7a}.vcard.past{opacity:.6}
.vdate{text-align:center;border-right:1px solid #e2e8f0;padding-right:10px}.vdate b{display:block;font-size:1.9rem;line-height:1;color:#0b2f63}.vdate small{color:#6b7a90;text-transform:uppercase}
.vlodge{font-weight:bold;font-size:1.05rem;overflow-wrap:anywhere}.vlodge .no{color:#b18a43;margin-left:6px}
.vmeta{color:#6b7a90;font-size:.92rem;overflow-wrap:anywhere}.vnote{color:#8a6a1f;font-style:italic;font-size:.9rem}
.vchip{display:inline-block;font-size:.8rem;padding:2px 9px;border-radius:999px;background:#eef3fa;color:#123b7a;margin-top:5px}
.vok{display:inline-block;font-size:.8rem;padding:2px 9px;border-radius:999px;background:#d7f5e2;color:#187a3d;margin:3px 4px 0 0}
.vwarn{display:inline-block;font-size:.8rem;padding:2px 9px;border-radius:999px;background:#fbeadc;color:#9a4a12}
.vstats{display:flex;flex-wrap:wrap;gap:6px 22px;margin:6px 0 2px;color:#6b7a90}.vstats b{color:#0b2f63}.vstats .warn b{color:#9a4a12}
.vrep b{overflow-wrap:anywhere}
.vfilters{grid-template-columns:2fr 1fr 1fr 1fr auto auto}.vfilters.f4{grid-template-columns:2fr 1fr 1fr auto auto}.vfilters.f3{grid-template-columns:1fr 1fr 2fr auto}
.vfilters label{display:flex;align-items:center;gap:6px;font-weight:normal;margin:0}.vfilters label input{width:auto}
@media(max-width:800px){.vfilters,.vfilters.f4,.vfilters.f3{grid-template-columns:1fr}}
@media(max-width:700px){.vcard{grid-template-columns:52px minmax(0,1fr)}.vcard .vrep{grid-column:2}}
</style>'''

def _visits_admin(req):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    return u

def _visit_card(v,reps,today,qs=''):
    d=_vdate(v['visit_date']);r=reps.get(v.get('rep_id'))
    oks=('<span class="vok">✓ Εκπρόσωπος ενημερώθηκε '+esc(fmt_ddmmyyyy(v['rep_notified_at']))+'</span>' if rep_notified(v) else '')+\
        ('<span class="vok">✓ Επαρχία ενημερώθηκε '+esc(fmt_ddmmyyyy(v['prov_notified_at']))+'</span>' if prov_notified(v) else '')
    brief=f'<a class="btn{" primary" if not rep_notified(v) else ""}" href="/visits/brief?ids={v["id"]}">{"↻ Ξανά στον εκπρόσωπο" if rep_notified(v) else "✉ Ενημέρωση εκπροσώπου"}</a>' if r else ''
    p=province_by_short(v.get('province') or '')
    return f"""<div class="vcard{' past' if v['visit_date']<today else ''}">
<div class="vdate"><b>{d.day if d else ''}</b><small>{VISIT_DAYS[d.weekday()][:3] if d else ''}</small></div>
<div><div class="vlodge"><a href="/visits/edit/{v['id']}{qs}">{esc(v.get('lodge') or '')}</a>{f'<span class="no">Αρ. {esc(v["lodge_number"])}</span>' if v.get('lodge_number') else ''}</div>
<div class="vmeta">{esc(day_str(v['visit_date']))} · {esc(v.get('location') or 'Τόπος —')}</div>
{f'<div class="vnote">{esc(v["notes"])}</div>' if v.get('notes') else ''}
{f'<span class="vchip">{esc(v["province"])}</span>' if v.get('province') else ''}{f' <span class="vmeta">{esc(p["email"])}</span>' if p and p.get('email') else ''}
{f'<div>{brief} {oks}</div>' if brief or oks else ''}</div>
<div class="vrep">{f'<b>{esc(rep_label(r))}</b><div class="vmeta">{esc(r.get("office") or "")}</div>' if r else '<span class="vwarn">Χωρίς εκπρόσωπο</span>'}</div></div>"""

@app.get('/visits')
def visits_page(req:Request,q:str='',prov:str='',rep:str='',notif:str='',past:str='',msg:str=''):
    u=_visits_admin(req);today=date.today().isoformat()
    vs=visits_all();reps={r['id']:r for r in reps_all()};rm=rep_rankmap()
    up=[v for v in vs if v['visit_date']>=today]
    unas=[v for v in up if v.get('rep_id') not in reps];tobrief=[v for v in up if v.get('rep_id') in reps and not rep_notified(v)]
    ql=_snorm(q.strip())
    def keep(v):
        if not past and v['visit_date']<today:return False
        if prov and v.get('province')!=prov:return False
        if rep=='__none' and v.get('rep_id') in reps:return False
        if rep and rep!='__none' and str(v.get('rep_id') or '')!=rep:return False
        if notif=='rep' and not (v.get('rep_id') in reps and not rep_notified(v)):return False
        if notif=='prov' and prov_notified(v):return False
        if ql and ql not in _snorm(' '.join([v.get('lodge') or '',v.get('lodge_number') or '',v.get('location') or '',v.get('province') or '',rep_label(reps.get(v.get('rep_id')),rm)])):return False
        return True
    lst=[v for v in vs if keep(v)];groups={}
    for v in lst:groups.setdefault(v['visit_date'][:7],[]).append(v)
    body=''.join(f'<section class="vmonth"><h2>{month_title(k)} <small>{len(items)} {"επίσκεψη" if len(items)==1 else "επισκέψεις"}</small></h2>'+''.join(_visit_card(v,reps,today) for v in items)+'</section>' for k,items in groups.items())
    if not vs:body='<div class="card">Δεν υπάρχουν ακόμη επισκέψεις. Πατήστε «Νέα επίσκεψη», «Επικόλληση λίστας» ή κάντε εισαγωγή από τη σελίδα «Επιστολές Γραμματείας».</div>'
    elif not lst:body='<div class="card">Καμία επίσκεψη δεν ταιριάζει με τα φίλτρα.</div>'
    popts=''.join(f'<option{" selected" if p==prov else ""}>{esc(p)}</option>' for p in _provincial_choices())
    ropts=''.join(f'<option value="{r["id"]}"{" selected" if str(r["id"])==rep else ""}>{esc(rep_label(r,rm))}</option>' for r in reps.values())
    notice=f"<div class='card'><b>{esc(msg)}</b></div>" if msg else ''
    return page(f"""{VISITS_CSS}<h1>Επισκέψεις Στοών</h1>{notice}
<div class="toolbar"><a class="btn primary" href="/visits/new">+ Νέα επίσκεψη</a><a class="btn" href="/visits/import">Επικόλληση λίστας</a><a class="btn" href="/visits/publish{'?prov='+quote(prov) if prov else ''}">Ενημέρωση Επαρχίας</a><a class="btn" href="/visits/report">Αναφορά PDF</a><a class="btn" href="/reps">Εκπρόσωποι</a></div>
<div class="vstats"><span><b>{len(up)}</b> προσεχείς επισκέψεις</span><span class="{'warn' if unas else ''}"><b>{len(unas)}</b> χωρίς εκπρόσωπο</span><span class="{'warn' if tobrief else ''}"><b>{len(tobrief)}</b> εκπρόσωποι προς ενημέρωση</span><span><b>{len(reps)}</b> εκπρόσωποι</span></div>
<form class="card filters vfilters" method="get"><input name="q" value="{esc(q)}" placeholder="Αναζήτηση Στοάς, αριθμού, τόπου, εκπροσώπου…">
<select name="prov"><option value="">Όλες οι Επαρχίες</option>{popts}</select>
<select name="rep"><option value="">Όλοι οι εκπρόσωποι</option><option value="__none"{" selected" if rep=="__none" else ""}>Χωρίς εκπρόσωπο</option>{ropts}</select>
<select name="notif"><option value="">Όλες οι ενημερώσεις</option><option value="rep"{" selected" if notif=="rep" else ""}>Εκπρόσωπος δεν ενημερώθηκε</option><option value="prov"{" selected" if notif=="prov" else ""}>Επαρχία δεν ενημερώθηκε</option></select>
<label><input type="checkbox" name="past" value="1"{" checked" if past else ""}> Παλαιότερες</label><button>Φίλτρο</button></form>
{body}""",u,'Επισκέψεις Στοών')

def _visit_form(v=None,qs=''):
    v=v or {};rm=rep_rankmap();lods=_lodges_all(active_only=True)
    val=lambda k:esc(str(v.get(k) or ''))
    lopts=''.join(f'<option value="{esc(str(l["number"]))} · {esc(l["name"])}" data-no="{esc(str(l["number"]))}" data-name="{esc(l["name"])}" data-prov="{esc(l.get("provincial") or "")}" data-loc="{esc(l.get("meeting_place") or "")}"></option>' for l in lods)
    popts=''.join(f'<option{" selected" if p==v.get("province") else ""}>{esc(p)}</option>' for p in _provincial_choices())
    if v.get('province') and v['province'] not in _provincial_choices():popts+=f'<option selected>{esc(v["province"])}</option>'
    ropts=''.join(f'<option value="{r["id"]}"{" selected" if r["id"]==v.get("rep_id") else ""}>{esc(rep_label(r,rm))} — {esc(r.get("office") or "")}{" ("+esc(r["year"])+")" if r.get("year") else ""}</option>' for r in reps_all())
    return f"""<div class="grid card">
<div><label for="v_date">Ημερομηνία</label><input id="v_date" type="date" name="visit_date" value="{val('visit_date')}" required></div>
<div><label for="v_no">Αριθμός Στοάς</label><input id="v_no" name="lodge_number" value="{val('lodge_number')}" placeholder="π.χ. 32"></div>
<div class="full"><label for="v_lodge">Στοά</label><input id="v_lodge" name="lodge" list="v_lodges" value="{val('lodge')}" required placeholder="Αριθμός ή όνομα — επιλέξτε από τις Συμβολικές Στοές"><datalist id="v_lodges">{lopts}</datalist>
<small>Με την επιλογή από τη λίστα συμπληρώνονται αριθμός, Επαρχία και τόπος.</small></div>
<div class="full"><label for="v_loc">Τόπος</label><input id="v_loc" name="location" value="{val('location')}" placeholder="Τεκτονικόν Μέγαρον …"></div>
<div><label for="v_prov">Επαρχιακή Μεγάλη Στοά</label><select id="v_prov" name="province"><option value="">—</option>{popts}</select></div>
<div><label for="v_rep">Εκπρόσωπος</label><input id="v_repq" placeholder="Αναζήτηση ονόματος…" style="margin-bottom:6px"><select id="v_rep" name="rep_id"><option value="">— Χωρίς εκπρόσωπο —</option>{ropts}</select></div>
<div class="full"><label for="v_notes">Σημειώσεις</label><input id="v_notes" name="notes" value="{val('notes')}"></div>
</div><script>
(function(){{
 const L=document.getElementById('v_lodge'),dl=document.getElementById('v_lodges');
 function fill(){{const o=[...dl.options].find(o=>o.value===L.value);if(!o)return;L.value=o.dataset.name;
  const n=document.getElementById('v_no'),p=document.getElementById('v_prov'),loc=document.getElementById('v_loc');
  n.value=o.dataset.no;if(o.dataset.prov)p.value=o.dataset.prov;if(o.dataset.loc&&!loc.value)loc.value=o.dataset.loc;}}
 L.addEventListener('change',fill);L.addEventListener('input',fill);
 const q=document.getElementById('v_repq'),s=document.getElementById('v_rep');
 const fold=t=>t.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
 q.addEventListener('input',()=>{{const w=fold(q.value).split(/\\s+/).filter(Boolean);let first=null;
  [...s.options].forEach(o=>{{if(!o.value)return;const ok=w.every(x=>fold(o.text).includes(x));o.hidden=!ok;if(ok&&!first)first=o;}});
  if(first&&w.length)s.value=first.value;}});
}})();
</script>"""

def _visit_from_form(f):
    d={k:str(f.get(k,'') or '').strip() for k in VISIT_COLS}
    if not _vdate(d['visit_date']):raise HTTPException(400,'Συμπληρώστε έγκυρη ημερομηνία.')
    m=re.match(r'^\s*(\d{1,4}|Φ)\s*·\s*(.+)$',d['lodge'])
    if m:d['lodge_number']=d['lodge_number'] or m.group(1);d['lodge']=m.group(2)
    d['lodge']=_visit_clean(d['lodge'])
    if not d['lodge']:raise HTTPException(400,'Συμπληρώστε τη Στοά.')
    if d['lodge_number']:
        l=next((x for x in _lodges_all() if _lodge_no_key(x['number'])==_lodge_no_key(d['lodge_number'])),None)
        if l:
            d['province']=d['province'] or (l.get('provincial') or '');d['location']=d['location'] or (l.get('meeting_place') or '')
    d['rep_id']=int(d['rep_id']) if d['rep_id'].isdigit() and rep_get(d['rep_id']) else None
    return d

def _visit_save(d,vid=None):
    ts=now()
    with con() as c:
        if vid:c.execute('UPDATE visits SET '+','.join(k+'=?' for k in VISIT_COLS)+',updated_at=? WHERE id=?',tuple(d[k] for k in VISIT_COLS)+(ts,vid))
        else:c.execute('INSERT INTO visits('+','.join(VISIT_COLS)+',created_at,updated_at) VALUES('+','.join('?'*(len(VISIT_COLS)+2))+')',tuple(d[k] for k in VISIT_COLS)+(ts,ts))

@app.get('/visits/new')
def visits_new(req:Request):
    u=_visits_admin(req)
    return page(VISITS_CSS+'<h1>Νέα επίσκεψη</h1><form method="post">'+_visit_form()+'<button class="primary">Αποθήκευση</button> <a class="btn" href="/visits">Άκυρο</a></form>',u,'Νέα επίσκεψη')

@app.post('/visits/new')
async def visits_new_save(req:Request):
    _visits_admin(req);_visit_save(_visit_from_form(await req.form()))
    return RedirectResponse('/visits?msg='+quote('Η επίσκεψη αποθηκεύτηκε.'),303)

@app.get('/visits/edit/{vid}')
def visits_edit(req:Request,vid:int):
    u=_visits_admin(req);v=visit_get(vid)
    if not v:raise HTTPException(404)
    st=('<p>'+('<span class="vok">✓ Εκπρόσωπος ενημερώθηκε '+esc(fmt_ddmmyyyy(v['rep_notified_at']))+'</span>' if rep_notified(v) else '')+
        ('<span class="vok">✓ Επαρχία ενημερώθηκε '+esc(fmt_ddmmyyyy(v['prov_notified_at']))+'</span>' if prov_notified(v) else '')+'</p>')
    return page(VISITS_CSS+f'''<h1>Επίσκεψη · {esc(v["lodge"])}</h1>{st}<form method="post">{_visit_form(v)}<button class="primary">Αποθήκευση</button>
{f'<a class="btn" href="/visits/brief?ids={vid}">✉ Ενημέρωση εκπροσώπου</a>' if v.get("rep_id") else ''} <a class="btn" href="/visits">Άκυρο</a></form>
<form method="post" action="/visits/delete/{vid}" onsubmit="return confirm('Διαγραφή της επίσκεψης;')" style="margin-top:12px"><button>Διαγραφή</button></form>''',u,'Επίσκεψη')

@app.post('/visits/edit/{vid}')
async def visits_edit_save(req:Request,vid:int):
    _visits_admin(req)
    if not visit_get(vid):raise HTTPException(404)
    _visit_save(_visit_from_form(await req.form()),vid)
    return RedirectResponse('/visits?msg='+quote('Η επίσκεψη ενημερώθηκε.'),303)

@app.post('/visits/delete/{vid}')
def visits_delete(req:Request,vid:int):
    _visits_admin(req)
    with con() as c:c.execute('DELETE FROM visits WHERE id=?',(vid,))
    return RedirectResponse('/visits?msg='+quote('Η επίσκεψη διαγράφηκε.'),303)

@app.get('/visits/import')
def visits_import_page(req:Request):
    u=_visits_admin(req)
    return page('''<h1>Επικόλληση λίστας επισκέψεων</h1><form method="post" class="card"><p>Μία επίσκεψη ανά γραμμή, π.χ. «Σάββατο 17/10/2026 Σ.Σ. Διώνη Υπ' Αρ 32 Τεκτονικόν Μέγαρον Ιωαννίνων».
Τα «Σ.Σ.» και «Υπ' Αρ» αφαιρούνται αυτόματα· με τον αριθμό συμπληρώνονται από τις Συμβολικές Στοές το όνομα, η Επαρχία και ο τόπος.</p>
<textarea name="text" required></textarea><button class="primary">Εισαγωγή</button> <a class="btn" href="/visits">Άκυρο</a></form>''',u,'Επικόλληση επισκέψεων')

@app.post('/visits/import')
def visits_import(req:Request,text:str=Form('')):
    u=_visits_admin(req);by_no={_lodge_no_key(l['number']):l for l in _lodges_all()}
    ok=[];bad=[]
    for line in [x.strip() for x in text.splitlines() if x.strip()]:
        d=parse_visit_line(line,by_no);(ok if d else bad).append(d or line)
    for d in ok:_visit_save(d)
    if bad:
        return page(f'''<h1>Επικόλληση λίστας επισκέψεων</h1><div class="card"><b>Προστέθηκαν {len(ok)}.</b> Δεν αναγνωρίστηκαν οι παρακάτω γραμμές — διορθώστε και ξαναπατήστε «Εισαγωγή».</div>
<form method="post" class="card"><textarea name="text">{esc(chr(10).join(bad))}</textarea><button class="primary">Εισαγωγή</button> <a class="btn" href="/visits">Επιστροφή</a></form>''',u,'Επικόλληση επισκέψεων')
    return RedirectResponse('/visits?msg='+quote(f'Προστέθηκαν {len(ok)} επισκέψεις.'),303)

# ---------------------------------------------------------------- σύνθεση και αποστολή email
def _compose(u,title,action,to,subject,body,hidden,hint='',attach='',bcc=''):
    hid=''.join(f'<input type="hidden" name="{esc(k)}" value="{esc(str(v))}">' for k,v in hidden.items())
    mailto='mailto:'+quote(to)+'?'+('bcc='+quote(bcc)+'&' if bcc else '')+'subject='+quote(subject)+'&body='+quote(body)
    ready='' if mail_ready() else '<div class="card" style="border-color:#e3b17a"><b>Η αποστολή από τον διακομιστή δεν είναι ρυθμισμένη (SMTP).</b> Χρησιμοποιήστε «Άνοιγμα στο πρόγραμμα email» και μετά «Σημείωση ως σταλμένο».</div>'
    return page(f"""<h1>{esc(title)}</h1>{sender_banner('general')}{ready}{f'<div class="card">{esc(hint)}</div>' if hint else ''}
<form method="post" action="{action}" class="card">{hid}
{contact_picker_widget()}
<label>Προς</label><input name="to" value="{esc(to)}" required>
<label style="margin-top:10px">Κρυφή κοινοποίηση (Bcc)</label><input name="bcc" value="{esc(bcc)}" placeholder="προαιρετικό">
<label style="margin-top:10px">Θέμα</label><input name="subject" value="{esc(subject)}" required>
<label style="margin-top:10px">Κείμενο</label><textarea name="body" style="min-height:340px">{esc(body)}</textarea>
{f'<p class="muted">Συνημμένο: {esc(attach)}</p>' if attach else ''}
<div class="toolbar" style="margin-top:10px"><button class="primary" name="mode" value="send">Αποστολή</button><a class="btn" href="{esc(mailto)}">Άνοιγμα στο πρόγραμμα email</a><button name="mode" value="mark">Σημείωση ως σταλμένο</button><a class="btn" href="/visits">Άκυρο</a></div>
<small>Πολλοί παραλήπτες: χωρίστε τα email με κόμμα. Μπορείτε να διορθώσετε το κείμενο πριν την αποστολή.</small></form>""",u,title)

def _ids(s):return [int(x) for x in re.split(r'[,\s]+',str(s or '')) if x.isdigit()]

@app.get('/visits/brief')
def visits_brief(req:Request,ids:str):
    u=_visits_admin(req);vs=[v for v in (visit_get(i) for i in _ids(ids)) if v]
    if not vs:raise HTTPException(404)
    r=rep_get(vs[0].get('rep_id'))
    if not r:raise HTTPException(400,'Η επίσκεψη δεν έχει εκπρόσωπο.')
    vs=[v for v in vs if v.get('rep_id')==r['id']];c=rep_mail_content(r,vs);email,_=rep_contact(r)
    return _compose(u,'Ενημέρωση Εκπροσώπου','/visits/brief',email,c['subject'],c['body'],{'ids':','.join(str(v['id']) for v in c['visits']),'rep_id':r['id']},
                    '' if email else f"Ο {r['surname']} {r['name']} δεν έχει email· συμπληρώστε το εδώ ή στην καρτέλα «Εκπρόσωποι».",f"{c['ics_name']} (πρόσκληση ημερολογίου)")

@app.post('/visits/brief')
def visits_brief_send(req:Request,ids:str=Form(...),rep_id:int=Form(...),to:str=Form(''),bcc:str=Form(''),subject:str=Form(''),body:str=Form(''),mode:str=Form('send')):
    _visits_admin(req);r=rep_get(rep_id)
    vs=[v for v in (visit_get(i) for i in _ids(ids)) if v and v.get('rep_id')==rep_id]
    if not r or not vs:raise HTTPException(404)
    if mode!='mark':
        c=rep_mail_content(r,vs)
        send_mail(split_emails(to),subject,body,split_emails(bcc),[(c['ics_name'],c['ics'],'text/calendar')])
    mark_visits([v['id'] for v in vs],'rep',rep_id)
    return RedirectResponse('/visits?msg='+quote(('Στάλθηκε η ενημέρωση στον ' if mode!='mark' else 'Σημειώθηκε η ενημέρωση του ')+f"{r['surname']} {r['name']}."),303)

def _pub_rows(prov,frm,to):
    return [v for v in visits_all() if v.get('province')==prov and (not frm or v['visit_date']>=frm) and (not to or v['visit_date']<=to)]

@app.get('/visits/publish')
def visits_publish(req:Request,prov:str='',frm:str='',to:str='',missing:str='',msg:str=''):
    u=_visits_admin(req);provs=_provincial_choices();prov=prov if prov in provs else (provs[0] if provs else '')
    frm=frm or date.today().isoformat();rows=_pub_rows(prov,frm,to);miss=province_missing_lodges(prov)
    p=province_by_short(prov);reps={r['id']:r for r in reps_all()}
    trs=''.join(f"<tr><td>{esc(day_str(v['visit_date']))}</td><td>{esc(v['lodge'])} {('Αρ. '+esc(v['lodge_number'])) if v.get('lodge_number') else ''}</td><td>{esc(v.get('location') or '—')}</td><td>{esc(rep_full(reps[v['rep_id']])) if v.get('rep_id') in reps else '<span class=vwarn>Δεν έχει οριστεί</span>'}{' <span class=vok>✓ ενημ.</span>' if rep_notified(v) else ''}{' <span class=vok>✓ Επαρχία</span>' if prov_notified(v) else ''}</td></tr>" for v in rows)
    by={}
    for v in rows:
        if v.get('rep_id') in reps:by.setdefault(v['rep_id'],[]).append(v)
    pending=[rid for rid,vs in by.items() if any(not rep_notified(v) for v in vs)]
    reprows=''.join(f"""<tr><td><label style="display:flex;gap:8px;align-items:center;margin:0;font-weight:normal"><input type="checkbox" name="rep_ids" value="{rid}" style="width:auto"{' checked' if rid in pending and rep_contact(reps[rid])[0] else ''}{'' if rep_contact(reps[rid])[0] else ' disabled'}> <b>{esc(reps[rid]['surname'])} {esc(reps[rid]['name'])}</b></label></td><td>{len(vs)}</td><td>{esc(rep_contact(reps[rid])[0] or 'χωρίς email')}</td><td>{'<span class=vok>✓ ενημερώθηκε</span>' if all(rep_notified(v) for v in vs) else ''} <a class="btn" href="/visits/brief?ids={','.join(str(v['id']) for v in vs)}">Email εκπροσώπου</a></td></tr>""" for rid,vs in by.items())
    popts=''.join(f'<option{" selected" if x==prov else ""}>{esc(x)}</option>' for x in provs)
    confirm_js="return confirm('Αποστολή στους επιλεγμένους εκπροσώπους;')"
    bulk=(f'<div style="overflow:auto"><table><tr><th>Εκπρόσωπος</th><th>Εγκαταστάσεις</th><th>Email</th><th></th></tr>{reprows}</table></div>'
          '<p class="muted">Κάθε επιλεγμένος εκπρόσωπος λαμβάνει ένα email με όλες τις Εγκαταστάσεις του στο διάστημα, με συνημμένη πρόσκληση ημερολογίου.</p>'
          f'<button class="primary" onclick="{confirm_js}">Μαζική ενημέρωση επιλεγμένων</button>') if by else '<p>Δεν έχουν οριστεί εκπρόσωποι σε αυτό το διάστημα.</p>'
    unas=sum(1 for v in rows if v.get('rep_id') not in reps)
    return page(VISITS_CSS+f"""<h1>Ενημέρωση Επαρχίας</h1>{f"<div class=card><b>{esc(msg)}</b></div>" if msg else ""}
<form class="card filters vfilters f4" method="get"><select name="prov">{popts}</select><input type="date" name="frm" value="{esc(frm)}"><input type="date" name="to" value="{esc(to)}">
<label><input type="checkbox" name="missing" value="1"{' checked' if missing else ''}> Και Στοές χωρίς ημερομηνία</label><button>Προβολή</button></form>
<div class="card"><p style="margin-top:0">{'Προς: '+esc(province_title(p) or 'Γραμματεία')+' — <b>'+esc(p['email'])+'</b>' if p and p.get('email') else 'Η Επαρχία δεν έχει email Γραμματείας (Μητρώα → Επαρχιακές Μεγάλες Στοές).'}</p>
<p>{len(rows)} {'Εγκατάσταση' if len(rows)==1 else 'Εγκαταστάσεις'}{f' · {unas} χωρίς εκπρόσωπο' if unas else ''} · {len(miss)} Στοές χωρίς ημερομηνία</p>
<div style="overflow:auto"><table><tr><th>Ημερομηνία</th><th>Στοά</th><th>Τόπος</th><th>Εκπρόσωπος ΜΔ</th></tr>{trs or '<tr><td colspan=4>Δεν υπάρχουν Εγκαταστάσεις σε αυτό το διάστημα.</td></tr>'}</table></div>
<div class="toolbar" style="margin-top:10px"><a class="btn primary" href="/visits/publish/compose?prov={quote(prov)}&frm={quote(frm)}&to={quote(to)}&missing={'1' if missing else ''}">Email προς Επαρχιακό Γραμματέα</a></div></div>
<form class="card" method="post" action="/visits/publish/bulk"><h3 style="margin-top:0">Ενημέρωση εκπροσώπων</h3>{sender_banner('general')}
<input type="hidden" name="prov" value="{esc(prov)}"><input type="hidden" name="frm" value="{esc(frm)}"><input type="hidden" name="to" value="{esc(to)}">
{bulk}</form>""",u,'Ενημέρωση Επαρχίας')

@app.get('/visits/publish/compose')
def visits_publish_compose(req:Request,prov:str,frm:str='',to:str='',missing:str=''):
    u=_visits_admin(req);rows=_pub_rows(prov,frm,to);miss=province_missing_lodges(prov) if missing else []
    if not rows and not miss:raise HTTPException(400,'Δεν υπάρχουν Εγκαταστάσεις για αποστολή σε αυτό το διάστημα.')
    p=province_by_short(prov)
    return _compose(u,'Ενημέρωση Επαρχίας','/visits/publish/send',(p or {}).get('email') or '',VISITS_PUB_SUBJECT,province_mail_body(p,rows,miss),
                    {'ids':','.join(str(v['id']) for v in rows),'prov':prov},'' if p and p.get('email') else 'Η Επαρχία δεν έχει email Γραμματείας — συμπληρώστε το εδώ.')

@app.post('/visits/publish/send')
def visits_publish_send(req:Request,ids:str=Form(''),prov:str=Form(''),to:str=Form(''),bcc:str=Form(''),subject:str=Form(''),body:str=Form(''),mode:str=Form('send')):
    _visits_admin(req)
    if mode!='mark':send_mail(split_emails(to),subject,body,split_emails(bcc))
    mark_visits(_ids(ids),'prov')
    return RedirectResponse('/visits?prov='+quote(prov)+'&msg='+quote('Η Επαρχία ενημερώθηκε.' if mode!='mark' else 'Σημειώθηκε η ενημέρωση της Επαρχίας.'),303)

@app.post('/visits/publish/bulk')
async def visits_publish_bulk(req:Request):
    _visits_admin(req);f=await req.form();prov=str(f.get('prov',''));rows=_pub_rows(prov,str(f.get('frm','')),str(f.get('to','')))
    sent=[];failed=[]
    for rid in [int(x) for x in f.getlist('rep_ids') if str(x).isdigit()]:
        r=rep_get(rid);vs=[v for v in rows if v.get('rep_id')==rid and not rep_notified(v)] or [v for v in rows if v.get('rep_id')==rid]
        email,_=rep_contact(r) if r else ('','')
        if not r or not vs or not email:continue
        c=rep_mail_content(r,vs)
        try:send_mail([email],c['subject'],c['body'],attachments=[(c['ics_name'],c['ics'],'text/calendar')])
        except HTTPException as e:failed.append(f"{r['surname']} ({e.detail})");break
        mark_visits([v['id'] for v in vs],'rep',rid);sent.append(r['surname'])
    msg=f'Στάλθηκαν {len(sent)} email σε εκπροσώπους.'+(' Διακόπηκε: '+'; '.join(failed) if failed else '')
    return RedirectResponse('/visits/publish?prov='+quote(prov)+'&frm='+quote(str(f.get('frm','')))+'&to='+quote(str(f.get('to','')))+'&msg='+quote(msg),303)
