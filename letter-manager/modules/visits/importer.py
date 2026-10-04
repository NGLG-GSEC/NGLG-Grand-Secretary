# Επισκέψεις Στοών — εισαγωγή των δεδομένων της σελίδας «Επιστολές Γραμματείας» (claude.ai) από αρχείο JSON.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.
#
# Μορφή: {"format":"nglg-lodge-visits/1","provinces":[…],"lodges":[…],"reps":[…],"visits":[…]}
# Ασφαλής επανάληψη: ταύτιση με τα αναγνωριστικά της σελίδας (ext_id), τον αριθμό Στοάς και τη συντομογραφία
# Επαρχίας· συμπληρώνονται μόνο κενά πεδία — ό,τι έχει ήδη καταχωριστεί στην εφαρμογή δεν αλλάζει.

def _member_id_for_contact(c,email,mobile):
    if email:
        r=c.execute('SELECT id FROM member_registry WHERE lower(email)=?',(email.lower(),)).fetchone()
        if r:return r['id']
    d=_phone_digits(mobile or '')
    if len(d)>=10:
        for r in c.execute('SELECT id,mobile FROM member_registry WHERE mobile<>?',('',)):
            if _phone_digits(r['mobile'] or '').endswith(d[-10:]):return r['id']
    return None

def import_visits_payload(data):
    if not isinstance(data,dict) or data.get('format')!='nglg-lodge-visits/1':
        raise HTTPException(400,'Μη αναγνωρίσιμο αρχείο: αναμένεται εξαγωγή «nglg-lodge-visits/1».')
    n={k:0 for k in ('prov_new','prov_upd','lodge_new','lodge_upd','rep_new','rep_upd','visit_new','visit_skip')};ts=now()
    s=lambda x:str(x if x is not None else '').strip()
    with con() as c:
        for p in data.get('provinces') or []:
            short=s(p.get('short'))
            if not short:continue
            ex=c.execute('SELECT * FROM grand_lodges WHERE short=?',(short,)).fetchone()
            if ex:
                ch={k:v for k,v in {'full_title':s(p.get('full')),'email':s(p.get('email')),'master_name':s(p.get('gmName'))}.items() if v and not (ex[k] or '').strip()}
                if ch:c.execute('UPDATE grand_lodges SET '+','.join(k+'=?' for k in ch)+',updated_at=? WHERE id=?',tuple(ch.values())+(ts,ex['id']));n['prov_upd']+=1
            else:
                kind='Εθνική' if short.startswith('ΕΜΣτΕ') else 'Περιφερειακή' if short.startswith('ΠΜΣτ') else 'Επαρχιακή'
                title=s(p.get('title'));full=s(p.get('full'))
                c.execute('INSERT INTO grand_lodges(short,full_title,kind,email,addressee,master_name,sort_order,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
                          (short,full,kind,s(p.get('email')),(title+' '+full).strip(),s(p.get('gmName')),int(p.get('order') or 99)*10,1,ts,ts));n['prov_new']+=1
        for l in data.get('lodges') or []:
            no=_lodge_no_key(s(l.get('number')));name=_clean_lodge_name(s(l.get('name')))
            if not no or not name:continue
            ex=c.execute('SELECT * FROM lodges WHERE number=?',(no,)).fetchone()
            vals={'provincial':s(l.get('province')),'ritual':s(l.get('ritual')),'meeting_place':s(l.get('location'))}
            if ex:
                ch={k:v for k,v in vals.items() if v and not (ex[k] or '').strip()}
                if l.get('inactive') and ex['status']=='Ενεργή':ch['status']='Ανενεργή'
                if ch:c.execute('UPDATE lodges SET '+','.join(k+'=?' for k in ch)+',updated_at=? WHERE id=?',tuple(ch.values())+(ts,ex['id']));n['lodge_upd']+=1
            else:
                c.execute('INSERT INTO lodges(number,name,provincial,ritual,meeting_place,status,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
                          (no,name,vals['provincial'],vals['ritual'],vals['meeting_place'],'Ανενεργή' if l.get('inactive') else 'Ενεργή','Επιστολές Γραμματείας',ts,ts));n['lodge_new']+=1
        rep_ids={}
        for r in data.get('reps') or []:
            ext=s(r.get('ext_id'));name=s(r.get('name'));sur=s(r.get('surname'))
            if not name or not sur:continue
            email=s(r.get('email'));mobile=s(r.get('mobile'))
            if email and not EMAIL_RE.match(email):email=''
            ex=c.execute('SELECT * FROM reps WHERE ext_id=?',(ext,)).fetchone() if ext else None
            if not ex:
                ex=next((x for x in c.execute('SELECT * FROM reps WHERE COALESCE(ext_id,?)=?',('','')) if _snorm(x['surname'])==_snorm(sur) and _snorm(x['name'])==_snorm(name)),None)
            vals={'rep_rank':s(r.get('rank')) if s(r.get('rank')) in REP_RANKS else '','office':s(r.get('office')),'year':s(r.get('year')),'email':email,'mobile':mobile}
            if ex:
                ch={k:v for k,v in vals.items() if v and not (ex[k] or '').strip()}
                if ext and not ex['ext_id']:ch['ext_id']=ext
                if not ex['member_id']:
                    mid=_member_id_for_contact(c,email,mobile)
                    if mid:ch['member_id']=mid
                if ch:c.execute('UPDATE reps SET '+','.join(k+'=?' for k in ch)+',updated_at=? WHERE id=?',tuple(ch.values())+(ts,ex['id']));n['rep_upd']+=1
                rep_ids[ext]=ex['id']
            else:
                cur=c.execute('INSERT INTO reps(name,surname,rep_rank,office,year,email,mobile,member_id,notes,ext_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                              (name,sur,vals['rep_rank'],vals['office'],vals['year'],email,mobile,_member_id_for_contact(c,email,mobile),'',ext,ts,ts))
                rep_ids[ext]=cur.lastrowid;n['rep_new']+=1
        for v in data.get('visits') or []:
            ext=s(v.get('ext_id'));d=s(v.get('date'))
            if not _vdate(d) or not s(v.get('lodge')):continue
            if ext and c.execute('SELECT id FROM visits WHERE ext_id=?',(ext,)).fetchone():n['visit_skip']+=1;continue
            rid=rep_ids.get(s(v.get('repId')))
            if not rid and s(v.get('repId')):
                x=c.execute('SELECT id FROM reps WHERE ext_id=?',(s(v.get('repId')),)).fetchone();rid=x['id'] if x else None
            rn=v.get('repNotified') or {};pn=v.get('provNotified') or {}
            c.execute("""INSERT INTO visits(visit_date,lodge,lodge_number,location,province,rep_id,notes,rep_notified_at,rep_notified_date,rep_notified_rep,
                prov_notified_at,prov_notified_date,prov_notified_rep,ext_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (d,s(v.get('lodge')),s(v.get('number')),s(v.get('location')),s(v.get('province')),rid,s(v.get('notes')),
                 s(rn.get('at')),s(rn.get('date')),rid if rn.get('at') and s(rn.get('repId'))==s(v.get('repId')) else None,
                 s(pn.get('at')),s(pn.get('date')),rid if pn.get('at') and s(pn.get('repId'))==s(v.get('repId')) else None,ext,ts,ts))
            n['visit_new']+=1
    return n

@app.get('/visits/import-data')
def visits_import_data_page(req:Request):
    u=_visits_admin(req)
    return page('''<h1>Εισαγωγή από «Επιστολές Γραμματείας»</h1><div class="card">Ανεβάστε το αρχείο εξαγωγής (.json) της σελίδας «Επιστολές Γραμματείας» του claude.ai.
Εισάγονται: Επαρχίες (συμπλήρωση κενών), Συμβολικές Στοές (Επαρχία, Τυπικό, τόπος), Εκπρόσωποι (με email/κινητό) και Επισκέψεις.
Η εισαγωγή μπορεί να επαναληφθεί χωρίς διπλοεγγραφές και δεν αλλάζει ό,τι έχει ήδη συμπληρωθεί στην εφαρμογή.</div>
<form method="post" enctype="multipart/form-data" class="card"><input type="file" name="file" accept=".json,application/json" required><button class="primary" style="margin-top:10px">Εισαγωγή</button> <a class="btn" href="/visits">Άκυρο</a></form>''',u,'Εισαγωγή δεδομένων')

@app.post('/visits/import-data')
async def visits_import_data(req:Request,file:UploadFile=File(...)):
    _visits_admin(req)
    try:data=json.loads((await file.read()).decode('utf-8-sig'))
    except Exception:raise HTTPException(400,'Το αρχείο δεν είναι έγκυρο JSON.')
    n=import_visits_payload(data)
    msg=(f"Εισαγωγή ολοκληρώθηκε — Επισκέψεις: {n['visit_new']} νέες ({n['visit_skip']} υπήρχαν ήδη) · Εκπρόσωποι: {n['rep_new']} νέοι, {n['rep_upd']} συμπληρώθηκαν · "
         f"Στοές: {n['lodge_new']} νέες, {n['lodge_upd']} συμπληρώθηκαν · Επαρχίες: {n['prov_new']} νέες, {n['prov_upd']} συμπληρώθηκαν.")
    return RedirectResponse('/visits?past=1&msg='+quote(msg),303)
