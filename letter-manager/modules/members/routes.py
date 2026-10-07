# Μητρώο Μελών — σελίδες (λίστα, νέο, επεξεργασία, διαγραφή, εισαγωγή, εξαγωγή) και API αναζήτησης.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

@app.get('/members')
def members_page(req:Request,q:str='',field:str='surname',page_no:int=1,msg:str=''):
    u=need(req)
    if not isadmin(u):raise HTTPException(403,'Το Μητρώο Μελών είναι διαθέσιμο μόνο στον administrator.')
    q=q.strip();page_no=max(1,int(page_no or 1));limit=100;offset=(page_no-1)*limit;params=[];where=''
    field=field if field in dict(MEMBER_SEARCH_FIELDS) else 'surname'
    where,params=_member_search_where(q,field)
    with con() as c:
        total=c.execute('SELECT COUNT(*) n FROM member_registry'+where,params).fetchone()['n']
        xs=[dict(r) for r in c.execute('SELECT * FROM member_registry'+where+' ORDER BY surname,first_name,id LIMIT ? OFFSET ?',params+[limit,offset])]
        lm={x['id']:[dict(r) for r in c.execute('SELECT lodge_name,lodge_number,member_status FROM member_lodges WHERE member_id=? ORDER BY seq,id',(x['id'],))] for x in xs}
    rows=[]
    for x in xs:
        lq=re.sub(r'^\s*(\d+|Φ)\s*·\s*','',q) if field=='lodge' else q
        lsorted=sorted(lm[x['id']],key=lambda l:0 if (q and field in ('lodge','all') and '<mark>' in _hl(l['lodge_name'],lq)) or (field=='lodge' and re.match(r'^\s*(\d+|Φ)',q) and _lodge_no_key(l['lodge_number'])==_lodge_no_key(re.match(r'^\s*(\d+|Φ)',q).group(1))) else 1)
        lod='<br>'.join(_hl((l['lodge_name']+' '+l['lodge_number']).strip(),lq,field in ('lodge','all')) for l in lsorted[:3])
        if len(lsorted)>3:lod+=f"<br><small>+{len(lm[x['id']])-3} ακόμη</small>"
        def H(v,f):return _hl(v,q,field in ('all',f))
        def extra(col,f):
            v=x.get(col) or ''
            if not(q and v and field in ('all',f)):return ''
            h=_hl(v,q);return f"<br><small class='muted'>{h}</small>" if '<mark>' in h else ''
        rows.append(f"""<tr><td><b>{x['id']}</b></td><td>{H(str(x.get('registry_no') or ''),'all')}</td><td>{H(x['surname'],'surname')}{extra('surname_variants','surname')}</td><td>{H(x['first_name'],'first_name')}{extra('first_name_variants','first_name')}</td><td>{H(x['email'],'email')}{extra('other_emails','email')}</td><td>{H(x['mobile'],'mobile')}{extra('other_mobiles','mobile')}</td><td>{esc(x['degree'])}</td><td>{lod}</td><td>{'ΝΑΙ' if x['active'] else 'ΟΧΙ'}</td><td><a href="/members/edit/{x['id']}">Edit</a> <form method="post" action="/members/delete/{x['id']}" style="display:inline" onsubmit="return confirm('Πριν από τη διαγραφή θα σταλεί αυτόματα πλήρες Excel ασφαλείας στον διαχειριστή. Συνέχεια;')"><button>Delete</button></form></td></tr>""")
    pages=max(1,(total+limit-1)//limit);nav=' '.join(f"<a class='btn' href='/members?q={quote(q)}&field={field}&page_no={p}'>{p}</a>" for p in range(max(1,page_no-2),min(pages,page_no+2)+1)) if pages>1 else '';notice=f"<div class='card'><b>{esc(msg)}</b></div>" if msg else ''
    flabel=dict(MEMBER_SEARCH_FIELDS)[field]
    HINTS={'surname':['Γράψτε το επώνυμο','π.χ. Παπαδόπουλος','search','text'],'first_name':['Γράψτε το όνομα','π.χ. Γεώργιος','search','text'],
           'mobile':['Γράψτε το κινητό','π.χ. 6944 123 456 ή +30 6944123456','tel','tel'],'email':['Γράψτε το email','π.χ. onoma@gmail.com','search','email'],
           'lodge':['Γράψτε ή διαλέξτε τη Στοά','π.χ. 3 ή ΠΑΡΘΕΝΩΝ','search','text'],
           'all':['Γράψτε οποιοδήποτε στοιχείο','Επώνυμο, όνομα, κινητό, email ή αρ. μητρώου','search','text']}
    qlabel,ph,itype,imode=HINTS[field]
    lodge_dl='<datalist id="lodgelist">'+''.join(f'<option value="{esc(str(l["number"]))} · {esc(l["name"])}">' for l in _lodges_all())+'</datalist>'
    hints=json.dumps(HINTS,ensure_ascii=False)
    fchips=''.join(f'<label class="chip"><input type="radio" name="field" value="{k}"{" checked" if k==field else ""}><span>{esc(v)}</span></label>' for k,v in MEMBER_SEARCH_FIELDS)
    clear='<a class="btn" href="/members">Καθαρισμός</a>' if q else ''
    summary=((f'Βρέθηκε <b>1</b> μέλος για' if total==1 else f'Βρέθηκαν <b>{total}</b> μέλη για')+f" «<b>{esc(q)}</b>» σε: <b>{esc(flabel)}</b>" if q else f'Σύνολο <b>{total}</b> μελών')+(f' · Σελίδα {page_no}/{pages}' if pages>1 else '')
    empty=f'Δεν βρέθηκε μέλος για «{esc(q)}» σε: {esc(flabel)}.'+(' Δοκιμάστε άλλη επιλογή (π.χ. «Όλα») ή λιγότερες λέξεις.' if field!='all' or len(q.split())>1 else '') if q else 'Δεν υπάρχουν εγγραφές.'
    return page(f"""<h1>Μητρώο Μελών</h1>{notice}<div class="toolbar"><a class="btn primary" href="/members/new">+ Προσθήκη Μέλους</a><a class="btn" href="/members/export.xlsx">Export Excel</a></div>
<div class="card member-search"><h3 style="margin-top:0">Αναζήτηση μέλους</h3><form class="msearch" method="get"><fieldset class="msfield"><legend>1. Τι θα δώσετε;</legend>{fchips}</fieldset><div><label for="msq" id="msqlabel">2. {esc(qlabel)}</label><input id="msq" name="q" value="{esc(q)}" autofocus autocomplete="off" type="{itype}" inputmode="{imode}" placeholder="{esc(ph)}"{' list="lodgelist"' if field=='lodge' else ''}>{lodge_dl}</div><div class="msbtns"><button class="primary">Αναζήτηση</button>{clear}</div></form><script>(function(){{var H={hints};var q=document.getElementById('msq'),l=document.getElementById('msqlabel');document.querySelectorAll('.msfield input').forEach(function(r){{r.addEventListener('change',function(){{var h=H[r.value];l.textContent='2. '+h[0];q.placeholder=h[1];q.type=h[2];q.inputMode=h[3];if(r.value==='lodge')q.setAttribute('list','lodgelist');else q.removeAttribute('list');q.focus();}});}});}})();</script><p class="msresult">{summary}</p>{nav}</div>
<div class="card" style="overflow:auto"><table><tr><th>ID</th><th>Αρ. Μητρώου</th><th>Επώνυμο</th><th>Όνομα</th><th>Email</th><th>Κινητό</th><th>Βαθμός</th><th>Στοές</th><th>Ενεργός</th><th>Ενέργειες</th></tr>{''.join(rows) or '<tr><td colspan=10>'+empty+'</td></tr>'}</table></div><div class="toolbar">{nav}</div>
<details class="card"><summary><b>Εισαγωγή μελών από Excel (Προσθήκη / Γενική Αντικατάσταση)</b></summary><div style="margin-top:10px"><form method="post" action="/members/import" enctype="multipart/form-data"><label>Αρχείο (.xlsx, .csv ή .tsv)</label><input type="file" name="file" accept=".xlsx,.csv,.tsv,.txt"><label>ή Επικόλληση από Excel (μαζί με τη γραμμή επικεφαλίδων Member_ID, Surname, First_Name…)</label><textarea name="pasted" style="min-height:140px" placeholder="Επιλέξτε στο Excel όλες τις στήλες μαζί με τις επικεφαλίδες, αντιγράψτε και επικολλήστε εδώ."></textarea><label>Λειτουργία</label><select name="mode"><option value="merge">Προσθήκη / Ενημέρωση (συνιστάται)</option><option value="replace">Γενική Αντικατάσταση</option></select><button class="primary">Εισαγωγή</button></form><small>Η Γενική Αντικατάσταση στέλνει πρώτα υποχρεωτικό Excel ασφαλείας στον διαχειριστή.</small></div></details>
<div class="card"><b>Πρόβλεψη επόμενου σταδίου:</b> υπάρχει ήδη συνδεδεμένος πίνακας «Βαθμοί & Αξιώματα» με σύνδεση σε μέλος και Διάταγμα, ώστε αργότερα οι απονομές και οι διορισμοί να ενημερώνουν το ιστορικό του Αδελφού χωρίς να αλλοιώνουν το βασικό μητρώο επαφών.</div>""",u,'Μητρώο Μελών')

@app.get('/members/export.xlsx')
def members_export(req:Request):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    fn='EMSTE_MEMBER_REGISTRY_'+datetime.now().strftime('%Y%m%d_%H%M')+'.xlsx'
    return Response(_xlsx_bytes(),media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':f'attachment; filename="{fn}"'})

@app.get('/members/new')
def members_new(req:Request):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    return page('<h1>Νέο Μέλος</h1><form method="post">'+_member_form()+'<button class="primary">Αποθήκευση</button></form>',u,'Νέο Μέλος')

@app.post('/members/new')
async def members_new_save(req:Request):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    f=await req.form()
    with con() as c:_save_member(c,f)
    return RedirectResponse('/members?msg='+quote('Η νέα εγγραφή αποθηκεύτηκε.'),303)

@app.get('/members/edit/{mid}')
def members_edit(req:Request,mid:int):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    m,ls=_member_by_id(mid)
    if not m:raise HTTPException(404)
    return page(f'<h1>Επεξεργασία Μέλους #{mid}</h1><form method="post">{_member_form(m,ls)}<button class="primary">Αποθήκευση</button></form>',u,'Επεξεργασία Μέλους')

@app.post('/members/edit/{mid}')
async def members_edit_save(req:Request,mid:int):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    f=await req.form()
    with con() as c:
        if not c.execute('SELECT id FROM member_registry WHERE id=?',(mid,)).fetchone():raise HTTPException(404)
        _save_member(c,f,mid)
    return RedirectResponse('/members?msg='+quote('Η εγγραφή ενημερώθηκε.'),303)

@app.post('/members/delete/{mid}')
def members_delete(req:Request,mid:int):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    m,_=_member_by_id(mid)
    if not m:raise HTTPException(404)
    backup=_xlsx_bytes();_send_member_backup(backup,'διαγραφή της εγγραφής #'+str(mid)+' '+m['first_name']+' '+m['surname'])
    with con() as c:
        c.execute('DELETE FROM member_lodges WHERE member_id=?',(mid,));c.execute('DELETE FROM member_degrees_offices WHERE member_id=?',(mid,));c.execute('DELETE FROM member_registry WHERE id=?',(mid,))
    return RedirectResponse('/members?msg='+quote('Η εγγραφή διαγράφηκε αφού στάλθηκε το υποχρεωτικό Excel ασφαλείας.'),303)

@app.post('/members/import')
async def members_import(req:Request,file:UploadFile|None=File(None),pasted:str=Form(''),mode:str=Form('merge')):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    if mode not in {'merge','replace'}:raise HTTPException(400,'Μη έγκυρη λειτουργία εισαγωγής.')
    raw=await file.read() if file is not None and file.filename else b''
    fname=(file.filename or '').lower() if file is not None else ''
    items=[]
    if raw and (fname.endswith('.xlsx') or raw[:2]==b'PK'):
        try:wb=load_workbook(BytesIO(raw),data_only=True,read_only=False)
        except Exception:raise HTTPException(400,'Το αρχείο πρέπει να είναι έγκυρο Excel .xlsx.')
        h=_headers(wb[wb.sheetnames[0]])
        items=_read_source_xlsx(wb) if _is_source_headers(h) else _read_export_xlsx(wb)
    else:
        txt=raw.decode('utf-8-sig',errors='replace') if raw else pasted
        if raw and '\ufffd' in txt:txt=raw.decode('cp1253',errors='replace')
        rows=_text_table(txt)
        if not rows:raise HTTPException(400,'Επιλέξτε αρχείο ή επικολλήστε τα δεδομένα από το Excel.')
        if not _is_source_headers(rows[0]):raise HTTPException(400,'Δεν αναγνωρίστηκαν οι στήλες. Η πρώτη γραμμή πρέπει να είναι οι επικεφαλίδες (Member_ID, Surname, First_Name, …, Lodge_1, Number_1, Status_1, …).')
        items=_source_items(rows[0],rows[1:])
    if not items:raise HTTPException(400,'Δεν βρέθηκαν εγγραφές μελών.')
    if mode=='replace':_send_member_backup(_xlsx_bytes(),'γενική αντικατάσταση του Μητρώου Μελών')
    added,updated=_apply_member_import(items,mode)
    lodges=sum(len(x['member'].get('lodges') or []) for x in items)
    msg=('Γενική αντικατάσταση' if mode=='replace' else 'Προσθήκη / ενημέρωση')+f' ολοκληρώθηκε: {len(items)} εγγραφές ({added} νέες, {updated} ενημερωμένες), {lodges} συμμετοχές σε Στοές.'
    return RedirectResponse('/members?msg='+quote(msg),303)

@app.get('/api/members/search')
def member_search_api(req:Request,q:str=''):
    need(req);q=q.strip()
    if len(q)<2:return {'items':[]}
    where,params=_member_search_where(q)
    with con() as c:xs=[dict(r) for r in c.execute('SELECT id,surname,first_name,email,mobile,degree,active FROM member_registry'+where+' ORDER BY active DESC,surname,first_name,id LIMIT 15',params)]
    return {'items':xs}
