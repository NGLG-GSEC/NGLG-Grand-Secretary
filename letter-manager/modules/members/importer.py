# Μητρώο Μελών — εισαγωγή από Excel/CSV/TSV/επικόλληση και εφάπαξ φορτώσεις.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

def _headers(ws):return {str(c.value or '').strip():i+1 for i,c in enumerate(ws[1])}

def _cellstr(v):
    if v is None:return ''
    if isinstance(v,float) and v.is_integer():v=int(v)
    return str(v).strip()

def _val(row,h,*names):
    for n in names:
        if n in h:return _cellstr(row[h[n]-1].value)
    return ''

def _yes(v):return str(v or '').strip().upper() in {'ΝΑΙ','YES','TRUE','1','Y'}

def _read_export_xlsx(wb):
    ws=wb['ΜΗΤΡΩΟ ΜΕΛΩΝ'] if 'ΜΗΤΡΩΟ ΜΕΛΩΝ' in wb.sheetnames else wb[wb.sheetnames[0]];h=_headers(ws);items=[]
    for row in ws.iter_rows(min_row=2):
        sn=_val(row,h,'Επώνυμο');fn=_val(row,h,'Όνομα')
        if not sn and not fn:continue
        mid=_val(row,h,'ID');src=_val(row,h,'Γραμμή Πηγής')
        items.append({'id':int(float(mid)) if mid else None,'member':{'surname':sn,'first_name':fn,'email':_val(row,h,'Κύριο Email'),'other_emails':_val(row,h,'Άλλα Email'),'mobile':_val(row,h,'Κύριο Κινητό'),'other_mobiles':_val(row,h,'Άλλα Κινητά'),'degree':_val(row,h,'Τεκτονικός Βαθμός'),'active':_yes(_val(row,h,'Ενεργός')),'deregistered_note':_val(row,h,'Σημείωση Διαγραφής'),'declared_lodge_count':_val(row,h,'Δηλωμένος Αρ. Στοών'),'additional_lodges':_val(row,h,'Πρόσθετες Στοές'),'source_row':int(float(src)) if src else None,'registry_no':int(float(_val(row,h,'Αρ. Μητρώου'))) if _val(row,h,'Αρ. Μητρώου') else None,'surname_variants':_val(row,h,'Παραλλαγές Επωνύμου'),'first_name_variants':_val(row,h,'Παραλλαγές Ονόματος'),'lodges':[]}})
    byid={x['id']:x for x in items if x['id']}
    if 'ΣΤΟΕΣ ΜΕΛΩΝ' in wb.sheetnames:
        sh=wb['ΣΤΟΕΣ ΜΕΛΩΝ'];lh=_headers(sh)
        for row in sh.iter_rows(min_row=2):
            mid=_val(row,lh,'ID Μέλους')
            if not mid:continue
            mid=int(float(mid))
            if mid in byid:byid[mid]['member']['lodges'].append({'seq':int(float(_val(row,lh,'Α/Α Στοάς') or 1)),'name':_val(row,lh,'Στοά'),'number':_val(row,lh,'Αριθμός Στοάς'),'status':_val(row,lh,'Κατάσταση')})
    return items

# Πηγαίο αρχείο Μητρώου (Member_ID, Surname, First_Name, ..., Lodge_1..6, Additional_Lodges).
# Διαβάζεται ίδια από .xlsx, .csv/.tsv ή από επικόλληση κελιών του Excel.
def _hkey(x):return re.sub(r'[^0-9a-z\u0370-\u03ff]','',str(x or '').lower())

def _is_source_headers(hs):
    ks={_hkey(x) for x in hs}
    return 'allsurnamevariants' in ks or {'surname','firstname','lodge1'}<=ks

def _split_multi(v):return [x for x in (p.strip().strip(',').strip() for p in re.split(r'[;\n]+',v or '')) if x]

def _plain_upper(v):return ''.join(ch for ch in unicodedata.normalize('NFD',v or '') if unicodedata.category(ch)!='Mn').upper().strip()

_EXTRA_LODGE_RE=re.compile(r'^(.*?)\s+(\S+)\s*\((.*)\)\s*$')

def _parse_extra_lodges(v,start):
    out=[];bad=[]
    for part in (p.strip() for p in (v or '').split(';')):
        if not part:continue
        mm=_EXTRA_LODGE_RE.match(part)
        if mm:out.append({'seq':start+len(out),'name':mm.group(1).strip(),'number':mm.group(2).strip(),'status':mm.group(3).strip()})
        else:bad.append(part)
    return out,'; '.join(bad)

def _variants(v,name):
    vs=_split_multi(v)
    return '; '.join(vs) if any(_plain_upper(x)!=_plain_upper(name) for x in vs) else ''

def _source_member(d,rn):
    def g(*ks):
        for k in ks:
            v=d.get(_hkey(k),'')
            if v:return v
        return ''
    sv=g('All_Surname_Variants');fv=g('All_FirstName_Variants')
    sn=g('Surname') or (_split_multi(sv) or [''])[0];fn=g('First_Name') or (_split_multi(fv) or [''])[0]
    if not sn and not fn:return None
    emails=_split_multi(g('Email'));mobiles=_split_multi(g('Mobile'))
    lodges=[]
    for j in range(1,7):
        n=g(f'Lodge_{j}');num=g(f'Number_{j}');st=g(f'Status_{j}')
        if n or num or st:lodges.append({'seq':len(lodges)+1,'name':n,'number':num,'status':st})
    extra,unparsed=_parse_extra_lodges(g('Additional_Lodges (beyond 6)','Additional_Lodges'),len(lodges)+1)
    lodges+=extra
    dereg=_yes(g('All_Deregistered (ΔΙΑΓΡΑΦΕΝ)','All_Deregistered'))
    sts=[l['status'].upper() for l in lodges if l['status']]
    deceased=bool(sts) and all('ΜΕΤΕΣΘΕΝ' in x for x in sts)
    rid=g('Member_ID').replace('.0','')
    return {'source_row':rn,'registry_no':int(rid) if rid.isdigit() else None,'surname':sn,'first_name':fn,
            'surname_variants':_variants(sv,sn),'first_name_variants':_variants(fv,fn),
            'email':emails[0] if emails else '','other_emails':'; '.join(emails[1:]),
            'mobile':mobiles[0] if mobiles else '','other_mobiles':'; '.join(mobiles[1:]),
            'degree':g('Degree'),'declared_lodge_count':g('Number_of_Lodges') or str(len(lodges)),
            'deregistered_note':'ΔΙΑΓΡΑΦΕΝ από όλες τις Στοές' if dereg else ('ΜΕΤΕΣΘΕΝ ΕΙΣ ΑΙ. ΑΝ.' if deceased else ''),
            'additional_lodges':unparsed,'active':not dereg and not deceased,'lodges':lodges}

def _source_items(header,rows,first_row=2):
    keys=[_hkey(x) for x in header];items=[]
    for i,r in enumerate(rows):
        d={k:_cellstr(v) for k,v in zip(keys,r) if k}
        m=_source_member(d,first_row+i)
        if m:items.append({'id':None,'member':m})
    return items

def _read_source_xlsx(wb):
    rows=list(wb[wb.sheetnames[0]].iter_rows(values_only=True))
    return _source_items(rows[0],rows[1:]) if rows else []

def _text_table(txt):
    txt=(txt or '').lstrip('\ufeff').strip('\r\n')
    if not txt.strip():return []
    first=txt.splitlines()[0]
    delim='\t' if '\t' in first else (';' if first.count(';')>first.count(',') else ',')
    return [r for r in csv.reader(StringIO(txt),delimiter=delim) if any(x.strip() for x in r)]

def _find_member_for_source(c,m):
    # Ο αριθμός μητρώου είναι το κλειδί: δύο διαφορετικά Member_ID δεν συγχωνεύονται ποτέ,
    # ακόμη κι αν έχουν ίδιο ονοματεπώνυμο. Email/κινητό/όνομα ταιριάζουν μόνο εγγραφές
    # χωρίς αριθμό μητρώου (π.χ. όσες δημιούργησαν αυτόματα Διατάγματα/Επετηρίδα).
    rn=m.get('registry_no')
    if rn is not None:
        r=c.execute('SELECT id FROM member_registry WHERE registry_no=?',(rn,)).fetchone()
        if r:return r['id']
    free=' AND registry_no IS NULL ORDER BY id LIMIT 1'
    email=(m.get('email') or '').strip().lower();mobile=(m.get('mobile') or '').strip()
    if email:
        r=c.execute('SELECT id FROM member_registry WHERE lower(email)=?'+free,(email,)).fetchone()
        if r:return r['id']
    if mobile:
        r=c.execute('SELECT id FROM member_registry WHERE mobile=?'+free,(mobile,)).fetchone()
        if r:return r['id']
    sn=(m.get('surname') or '').strip().lower();fn=(m.get('first_name') or '').strip().lower()
    if sn and fn:
        r=c.execute('SELECT id FROM member_registry WHERE lower(surname)=? AND lower(first_name)=?'+free,(sn,fn)).fetchone()
        if r:return r['id']
    return None

def _find_member_for_merge(c,m):
    email=(m.get('email') or '').strip().lower();mobile=(m.get('mobile') or '').strip()
    if email:
        r=c.execute('SELECT id FROM member_registry WHERE lower(email)=? ORDER BY id LIMIT 1',(email,)).fetchone()
        if r:return r['id']
    if mobile:
        r=c.execute('SELECT id FROM member_registry WHERE mobile=? ORDER BY id LIMIT 1',(mobile,)).fetchone()
        if r:return r['id']
    sn=(m.get('surname') or '').strip().lower();fn=(m.get('first_name') or '').strip().lower()
    if sn and fn:
        r=c.execute('SELECT id FROM member_registry WHERE lower(surname)=? AND lower(first_name)=? ORDER BY id LIMIT 1',(sn,fn)).fetchone()
        if r:return r['id']
    return None

def _update_imported_member(c,mid,m):
    ts=now();rn=m.get('registry_no');rn=int(rn) if rn not in (None,'') else None
    if rn is None:
        r=c.execute('SELECT registry_no FROM member_registry WHERE id=?',(mid,)).fetchone()
        if r:rn=r['registry_no']
    c.execute("""UPDATE member_registry SET source_row=?,registry_no=?,surname=?,first_name=?,email=?,other_emails=?,mobile=?,other_mobiles=?,degree=?,declared_lodge_count=?,deregistered_note=?,additional_lodges=?,active=?,surname_variants=?,first_name_variants=?,updated_at=? WHERE id=?""",
    (m.get('source_row'),rn,m.get('surname',''),m.get('first_name',''),m.get('email',''),m.get('other_emails',''),m.get('mobile',''),m.get('other_mobiles',''),m.get('degree',''),str(m.get('declared_lodge_count','')),m.get('deregistered_note',''),m.get('additional_lodges',''),1 if m.get('active',True) else 0,m.get('surname_variants') or '',m.get('first_name_variants') or '',ts,mid))
    c.execute('DELETE FROM member_lodges WHERE member_id=?',(mid,))
    for l in m.get('lodges') or []:
        c.execute("""INSERT INTO member_lodges(member_id,seq,lodge_name,lodge_number,member_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)""",(mid,l.get('seq',1),l.get('name',''),l.get('number',''),l.get('status',''),ts,ts))

def _apply_member_import(items,mode):
    added=updated=0
    with con() as c:
        if mode=='replace':
            c.execute('DELETE FROM member_lodges');c.execute('DELETE FROM member_degrees_offices');c.execute('DELETE FROM member_registry')
        for x in items:
            mid=x.get('id');m=x['member']
            if mode=='merge':
                if not mid or not c.execute('SELECT id FROM member_registry WHERE id=?',(mid,)).fetchone():mid=_find_member_for_source(c,m)
                if mid:
                    _update_imported_member(c,mid,m);updated+=1;continue
            _insert_member(c,m,mid if mode=='replace' and mid else None);added+=1
        if USE_PG:
            try:c.execute("SELECT setval(pg_get_serial_sequence('member_registry','id'), GREATEST(COALESCE((SELECT MAX(id) FROM member_registry),1),1), true)")
            except Exception:pass
    return added,updated

@app.post('/internal/member-bootstrap')
async def member_bootstrap(req:Request,token:str=Form(...),payload:UploadFile=File(...)):
    expected=os.getenv('MEMBER_BOOTSTRAP_TOKEN','')
    if not expected or not hmac.compare_digest(token,expected):raise HTTPException(403)
    with con() as c:
        if c.execute('SELECT COUNT(*) n FROM member_registry').fetchone()['n']:
            raise HTTPException(409,'Το Μητρώο Μελών δεν είναι κενό.')
    try:
        raw=await payload.read()
        data=json.loads(gzip.decompress(base64.b64decode(raw)).decode('utf-8'))
        members=data.get('members') or []
    except Exception:
        raise HTTPException(400,'Μη έγκυρο bootstrap payload.')
    if not members:raise HTTPException(400,'Δεν βρέθηκαν εγγραφές.')
    with con() as c:
        for m in members:_insert_member(c,m)
        c.execute("REPLACE INTO settings VALUES(?,?)",('member_registry_seed_version',MEMBER_SEED_VERSION))
    return {'ok':True,'members':len(members)}

# Εφάπαξ φόρτωση (bootstrap) του πλήρους Μητρώου Μελών (~1671 μοναδικές εγγραφές),
# με αριθμό μητρώου (registry_no) ανά μέλος και "Προσθήκη/Ενημέρωση" (merge) πάνω
# στις ήδη υπάρχουσες ελάχιστες εγγραφές (που δημιουργήθηκαν αυτόματα από τη
# συγχρονισμένη Επετηρίδα / τα Διατάγματα). Ίδιο μοτίβο ασφαλείας με τα υπόλοιπα
# /internal/*-bootstrap: μυστικό token (μεταβλητή περιβάλλοντος
# MEMBER_FULL_LOAD_TOKEN στο Render, όχι στο git) και άρνηση επανεκτέλεσης αν
# υπάρχουν ήδη εγγραφές με registry_no.

@app.post('/internal/member-full-load-bootstrap')
async def member_full_load_bootstrap(req:Request,token:str=Form(...),payload:UploadFile=File(...)):
    expected=os.getenv('MEMBER_FULL_LOAD_TOKEN','')
    if not expected or not hmac.compare_digest(token,expected):raise HTTPException(403)
    with con() as c:
        if c.execute('SELECT COUNT(*) n FROM member_registry WHERE registry_no IS NOT NULL').fetchone()['n']:
            raise HTTPException(409,'Το πλήρες Μητρώο Μελών (με αριθμούς μητρώου) έχει ήδη φορτωθεί.')
    try:
        raw=await payload.read()
        data=json.loads(gzip.decompress(base64.b64decode(raw)).decode('utf-8'))
        members=data if isinstance(data,list) else data.get('members') or []
    except Exception:
        raise HTTPException(400,'Μη έγκυρο bootstrap payload.')
    if not members:raise HTTPException(400,'Δεν βρέθηκαν εγγραφές.')
    created=0;updated=0
    with con() as c:
        for m in members:
            if not (m.get('surname') or m.get('first_name')):continue
            cand={'surname':m.get('surname') or '','first_name':m.get('first_name') or '','email':m.get('email') or '','mobile':m.get('mobile') or ''}
            mid=_find_member_for_merge(c,cand)
            if mid:
                _update_imported_member(c,mid,m);updated+=1
            else:
                _insert_member(c,m);created+=1
        if USE_PG:
            try:c.execute("SELECT setval(pg_get_serial_sequence('member_registry','id'), GREATEST(COALESCE((SELECT MAX(id) FROM member_registry),1),1), true)")
            except Exception:pass
    return {'ok':True,'created':created,'updated':updated,'total':len(members)}
