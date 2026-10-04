# Συμβολικές Στοές — σελίδες, εισαγωγή/εξαγωγή Excel.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

@app.get('/lodges')
def lodges_page(req:Request,q:str='',prov:str='',msg:str=''):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    _lodges_sync_from_members()
    xs=_lodges_all();cnt=_lodge_member_counts();q=q.strip()
    if prov=='-':xs=[x for x in xs if not (x.get('provincial') or '')]
    elif prov:xs=[x for x in xs if (x.get('provincial') or '')==prov]
    if q:
        w=[_snorm(t) for t in q.split()]
        xs=[x for x in xs if all(any(t in _snorm(str(x.get(k) or '')) for k in LODGE_COLS) for t in w)]
    rows=''.join(f"""<tr><td><b>{esc(str(x['number']))}</b></td><td>{_hl(x['name'],q)}</td><td>{_hl(x.get('orient') or '',q)}</td><td>{esc(x.get('provincial') or '—')}</td><td>{_hl(lodge_email(x),q) or '<span class="muted">—</span>'}</td><td>{_hl(x.get('master') or '',q)}</td><td>{esc(x.get('status') or '')}</td><td><a href="/members?field=lodge&q={quote(str(x['number']))}">{cnt.get(_lodge_no_key(x['number']),0)}</a></td><td><a class="btn" href="/lodges/edit/{x['id']}">Edit</a></td></tr>""" for x in xs)
    popts=''.join(f'<option value="{esc(p)}"{" selected" if p==prov else ""}>{esc(p)}</option>' for p in _provincial_choices())
    notice=f"<div class='card'><b>{esc(msg)}</b></div>" if msg else ''
    missing=sum(1 for x in _lodges_all() if not lodge_email(x));noprov=sum(1 for x in _lodges_all() if not x.get('provincial'))
    return page(f"""<h1>Συμβολικές Στοές</h1>{notice}<div class="toolbar"><a class="btn primary" href="/lodges/new">+ Νέα Στοά</a><a class="btn" href="/lodges/export.xlsx">Export Excel</a></div>
<div class="card"><p style="margin-top:0">Η κεντρική βάση Στοών της ΕΜΣτΕ (οι Επαρχίες ορίζονται στις <a href="/provinces">Επαρχιακές Μεγάλες Στοές</a>) — από εδώ τροφοδοτούνται οι παραλήπτες των Επιστολών και η αναζήτηση «Στοά» στο Μητρώο Μελών.
{f'<br><b>Προς συμπλήρωση:</b> {missing} Στοές χωρίς email, {noprov} χωρίς ορισμένη ΕπΜΣτ.' if missing or noprov else ''}</p>
<form class="filters" method="get"><input name="q" value="{esc(q)}" placeholder="Αριθμός, όνομα, Ανατολή, email, Σεβάσμιος…"><select name="prov"><option value="">Όλες οι ΕπΜΣτ.</option>{popts}<option value="-"{" selected" if prov=="-" else ""}>Χωρίς ορισμό</option></select><button>Αναζήτηση</button></form><p><b>{len(xs)}</b> Στοές</p></div>
<div class="card" style="overflow:auto"><table><tr><th>Αρ.</th><th>Όνομα</th><th>Ανατολή</th><th>ΕπΜΣτ.</th><th>Email</th><th>Σεβάσμιος</th><th>Κατάσταση</th><th>Ενεργά μέλη</th><th>Ενέργειες</th></tr>{rows or '<tr><td colspan=9>Δεν βρέθηκαν Στοές.</td></tr>'}</table></div>
<details class="card"><summary><b>Εισαγωγή / ενημέρωση Στοών από Excel</b></summary><div style="margin-top:10px"><form method="post" action="/lodges/import" enctype="multipart/form-data"><p>Στήλες (η πρώτη γραμμή): <b>{esc(', '.join(LODGE_HEADERS))}</b>. Η ταύτιση γίνεται με τον <b>Αριθμό</b>· κενά κελιά δεν σβήνουν υπάρχοντα στοιχεία. Κατεβάστε πρώτα το «Export Excel», συμπληρώστε το και ανεβάστε το εδώ.</p><label>Αρχείο (.xlsx, .csv ή .tsv)</label><input type="file" name="file" accept=".xlsx,.csv,.tsv,.txt"><label>ή Επικόλληση από Excel (μαζί με τις επικεφαλίδες)</label><textarea name="pasted" style="min-height:120px"></textarea><button class="primary">Εισαγωγή</button></form></div></details>""",u,'Συμβολικές Στοές')

@app.get('/lodges/new')
def lodges_new(req:Request):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    return page('<h1>Νέα Στοά</h1><form method="post">'+_lodge_form()+'<button class="primary">Αποθήκευση</button></form>',u,'Νέα Στοά')

@app.post('/lodges/new')
async def lodges_new_save(req:Request):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    d=_lodge_from_form(await req.form())
    with con() as c:_lodge_save(c,d)
    return RedirectResponse('/lodges?msg='+quote('Η Στοά αποθηκεύτηκε.'),303)

@app.get('/lodges/edit/{lid}')
def lodges_edit(req:Request,lid:int):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    with con() as c:x=c.execute('SELECT * FROM lodges WHERE id=?',(lid,)).fetchone()
    if not x:raise HTTPException(404)
    x=dict(x)
    return page(f'<h1>Στοά {esc(str(x["number"]))} · {esc(x["name"])}</h1><form method="post">'+_lodge_form(x)+'<button class="primary">Αποθήκευση</button></form>',u,'Επεξεργασία Στοάς')

@app.post('/lodges/edit/{lid}')
async def lodges_edit_save(req:Request,lid:int):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    d=_lodge_from_form(await req.form())
    with con() as c:
        if not c.execute('SELECT id FROM lodges WHERE id=?',(lid,)).fetchone():raise HTTPException(404)
        _lodge_save(c,d,lid)
    return RedirectResponse('/lodges?msg='+quote('Η Στοά ενημερώθηκε.'),303)

@app.get('/lodges/export.xlsx')
def lodges_export(req:Request):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    wb=Workbook();ws=wb.active;ws.title='ΣΥΜΒΟΛΙΚΕΣ ΣΤΟΕΣ';ws.append(LODGE_HEADERS)
    for x in _lodges_all():ws.append([int(x['number']) if str(x['number']).isdigit() else x['number']]+[x.get(k) or '' for k in LODGE_COLS[1:]])
    ws.freeze_panes='A2'
    for cell in ws[1]:cell.font=Font(bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='1F4E78')
    for col,wd in zip('ABCDEFGHIJKL',[9,32,16,34,32,26,26,32,12,18,40,30]):ws.column_dimensions[col].width=wd
    b=BytesIO();wb.save(b)
    return Response(b.getvalue(),media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':'attachment; filename="EMSTE_SYMBOLIKES_STOES.xlsx"'})

@app.post('/lodges/import')
async def lodges_import(req:Request,file:UploadFile|None=File(None),pasted:str=Form('')):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    raw=await file.read() if file is not None and file.filename else b''
    if raw and raw[:2]==b'PK':
        try:rows=[list(r) for r in load_workbook(BytesIO(raw),data_only=True).worksheets[0].iter_rows(values_only=True)]
        except Exception:raise HTTPException(400,'Το αρχείο πρέπει να είναι έγκυρο Excel .xlsx.')
    else:
        txt=raw.decode('utf-8-sig',errors='replace') if raw else pasted
        rows=_text_table(txt)
    if not rows:raise HTTPException(400,'Επιλέξτε αρχείο ή επικολλήστε τα δεδομένα.')
    alias={'number':['Αριθμός','Αρ.','Αρ','Number','No'],'name':['Όνομα','Στοά','Name','Lodge'],'orient':['Ανατολή','Πόλη','Orient','City'],
           'provincial':['Επαρχιακή Μεγάλη Στοά','ΕπΜΣτ.','ΕπΜΣτ','Provincial'],'email':['Email Στοάς','Email'],'master':['Σεβάσμιος','Master'],
           'secretary':['Γραμματέας','Secretary'],'secretary_email':['Email Γραμματέα','Secretary Email'],'status':['Κατάσταση','Status'],'ritual':['Τυπικό','Ritual'],
           'meeting_place':['Τόπος συνεδριάσεων','Τόπος','Meeting place','Venue'],'notes':['Σημειώσεις','Notes']}
    hk=[_hkey(h) for h in rows[0]];idx={}
    for k,names in alias.items():
        for n in names:
            if _hkey(n) in hk:idx[k]=hk.index(_hkey(n));break
    if 'number' not in idx or 'name' not in idx:raise HTTPException(400,'Χρειάζονται τουλάχιστον οι στήλες «Αριθμός» και «Όνομα».')
    provs={_snorm(p):p for p in _provincial_choices()}
    added=updated=0;ts=now()
    with con() as c:
        for r in rows[1:]:
            d={k:_cellstr(r[i]) if i<len(r) else '' for k,i in idx.items()}
            no=_lodge_no_key(d.get('number'))
            if not no:continue
            if 'name' in d:d['name']=_clean_lodge_name(d['name'])
            if d.get('provincial'):d['provincial']=provs.get(_snorm(d['provincial']),d['provincial'])
            if d.get('status') and d['status'] not in LODGE_STATUSES:d['status']='Ενεργή'
            d['number']=no
            ex=c.execute('SELECT * FROM lodges WHERE number=?',(no,)).fetchone()
            if ex:
                ch={k:v for k,v in d.items() if v and k!='number'}
                if ch:c.execute('UPDATE lodges SET '+','.join(k+'=?' for k in ch)+',updated_at=? WHERE id=?',tuple(ch.values())+(ts,ex['id']))
                updated+=1
            elif d.get('name'):
                vals=[d.get(k,'') for k in LODGE_COLS];vals[LODGE_COLS.index('status')]=d.get('status') or 'Ενεργή'
                c.execute('INSERT INTO lodges('+','.join(LODGE_COLS)+',source,created_at,updated_at) VALUES('+','.join('?'*(len(LODGE_COLS)+3))+')',tuple(vals)+('Εισαγωγή Excel',ts,ts))
                added+=1
    return RedirectResponse('/lodges?msg='+quote(f'Εισαγωγή Στοών ολοκληρώθηκε: {added} νέες, {updated} ενημερωμένες.'),303)
