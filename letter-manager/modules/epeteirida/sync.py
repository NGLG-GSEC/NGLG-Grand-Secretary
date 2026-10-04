# Επετηρίδα — τροφοδότηση από τα Διατάγματα και εφάπαξ φόρτωση ιστορικού.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

# Συγχρονισμός member_degrees_offices με κάθε Διάταγμα ΔΙΟΡΙΖΟΜΕΝ/ΑΠΟΝΕΜΕΙ/
# ΕΥΑΡΕΣΤΟΥΜΕΘΑ, ώστε η Επετηρίδα (/epeteirida) να τροφοδοτείται αυτόματα.
# Αν ο διοριζόμενος/τιμώμενος δεν υπάρχει ακόμη στο Μητρώο Μελών, δημιουργείται
# αυτόματα ελάχιστη εγγραφή — έτσι το member_id FK παραμένει έγκυρο, και το
# μέλλον merge-import του Μητρώου (βλ. /members/import, λειτουργία "Προσθήκη/
# Ενημέρωση") θα το ταιριάξει και θα το συμπληρώσει βάσει ονόματος/email/κινητού.

def _mdo_find_or_create_member(c,a):
    mid=a.get('member_id')
    if mid:return mid
    cand={'surname':a.get('last_name') or '','first_name':a.get('first_name') or '','email':a.get('email') or '','mobile':a.get('mobile') or ''}
    mid=_find_member_for_merge(c,cand)
    if mid:return mid
    return _insert_member(c,cand)

def _sync_decree_offices(c,did,dn,dy,meta,apps):
    c.execute('DELETE FROM member_degrees_offices WHERE decree_id=?',(did,))
    action=meta.get('action','appoint');ts=now()
    for a in apps:
        mid=_mdo_find_or_create_member(c,a)
        office=_ep_office_label(meta,a)
        c.execute("""INSERT INTO member_degrees_offices(member_id,record_type,office,decree_id,decree_no,decree_year,is_current,notes,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?)""",(mid,action,office,did,dn,dy,1,'',ts,ts))

# Εφάπαξ φόρτωση (bootstrap) της υπάρχουσας ιστορικής Επετηρίδας — ίδιο μοτίβο
# ασφαλείας με το /internal/member-bootstrap: προστατεύεται από μυστικό token
# (μεταβλητή περιβάλλοντος EPETIRIDA_BOOTSTRAP_TOKEN στο Render, όχι στο git) και
# αρνείται να ξανατρέξει αν υπάρχουν ήδη ιστορικές εγγραφές.
@app.post('/internal/epeteirida-bootstrap')
async def epeteirida_bootstrap(req:Request,token:str=Form(...),payload:UploadFile=File(...)):
    expected=os.getenv('EPETIRIDA_BOOTSTRAP_TOKEN','')
    if not expected or not hmac.compare_digest(token,expected):raise HTTPException(403)
    with con() as c:
        if c.execute("SELECT COUNT(*) n FROM member_degrees_offices WHERE record_type='historical'").fetchone()['n']:
            raise HTTPException(409,'Η ιστορική Επετηρίδα έχει ήδη φορτωθεί.')
    try:
        raw=await payload.read()
        data=json.loads(gzip.decompress(base64.b64decode(raw)).decode('utf-8'))
        items=data if isinstance(data,list) else data.get('items') or []
    except Exception:
        raise HTTPException(400,'Μη έγκυρο bootstrap payload.')
    if not items:raise HTTPException(400,'Δεν βρέθηκαν εγγραφές.')
    created_members=0;inserted=0
    with con() as c:
        ts=now()
        for it in items:
            full_name=(it.get('full_name') or '').strip()
            office_raw=(it.get('office') or '').strip()
            year=it.get('year')
            if not full_name or not office_raw or not year:continue
            sn,fn=_split_full_name(full_name);sn=_proper_name(sn);fn=_proper_name(fn)
            is_award=office_raw.startswith('Πρώην ')
            office=office_raw
            action='award' if is_award else 'appoint'
            cand={'surname':sn,'first_name':fn,'email':'','mobile':''}
            mid=_find_member_for_merge(c,cand)
            if not mid:
                mid=_insert_member(c,cand);created_members+=1
            c.execute("""INSERT INTO member_degrees_offices(member_id,record_type,office,decree_id,decree_no,decree_year,is_current,notes,created_at,updated_at)
            VALUES(?,?,?,?,?,?,?,?,?,?)""",(mid,'historical',office,None,None,int(year),0,'Ιστορική εισαγωγή από αρχείο',ts,ts))
            inserted+=1
        if USE_PG:
            try:c.execute("SELECT setval(pg_get_serial_sequence('member_registry','id'), GREATEST(COALESCE((SELECT MAX(id) FROM member_registry),1),1), true)")
            except Exception:pass
    return {'ok':True,'inserted':inserted,'created_members':created_members}
