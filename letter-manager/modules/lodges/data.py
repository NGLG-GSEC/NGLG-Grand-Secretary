# Συμβολικές Στοές — η κεντρική βάση Στοών (πίνακας, αρχικά δεδομένα, τίτλοι, email).
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

# ============================================================================
# Συμβολικές Στοές της ΕΜΣτΕ — η κεντρική βάση Στοών.
# Όλες οι λίστες Στοών (παραλήπτες Επιστολών, αναζήτηση στο Μητρώο Μελών κ.λπ.)
# διαβάζουν από εδώ. Αρχική φόρτωση: Στοές (αριθμός + όνομα) όπως εμφανίζονται στο
# Μητρώο Μελών· τα υπόλοιπα στοιχεία (Ανατολή, ΕπΜΣτ., email, Σεβάσμιος, Γραμματέας)
# συμπληρώνονται από τη σελίδα /lodges ή με εισαγωγή Excel.
# ============================================================================

LODGE_STATUSES=['Ενεργή','Σε αργία','Ανενεργή']

LODGE_SEED=[
 ('1','ΠΑΛΑΙΩΝ ΠΑΤΡΩΝ ΓΕΡΜΑΝΟΣ'),('2','ΑΚΡΟΠΟΛΙΣ'),('3','ΠΑΡΘΕΝΩΝ'),('4','ΜΙΑΟΥΛΗΣ'),('5','ΠΙΣΤΙΣ'),
 ('8','ΗΛΙΟΤΡΟΠΙΟΝ'),('9','ΙΣΙΣ'),('10','ΗΡΑΚΛΕΙΤΟΣ'),('12','ΗΡΑΚΛΗΣ'),('13','GARIBALDI'),('15','ΕΜΠΕΔΟΚΛΗΣ'),
 ('16','ΕΝΩΣΙΣ ΛΕΥΚΑΔΟΣ'),('17','ΑΝΑΓΕΝΝΗΣΙΣ'),('18','ΕΓΚΑΤΕΣΤΗΜΕΝΩΝ ΣΕΒΑΣΜΙΩΝ'),('19','ΤΡΙΠΤΟΛΕΜΟΣ'),
 ('21','ΑΤΤΙΚΟΣ ΑΣΤΗΡ'),('23','ΠΥΘΑΓΟΡΑΣ'),('24','ΦΙΛΙΚΗ ΕΤΑΙΡΕΙΑ'),('26','ΜΕΓΑΣ ΑΛΕΞΑΝΔΡΟΣ'),('28','ΚΑΜΕΙΡΟΣ'),
 ('29','ΚΑΣΣΑΝΔΡΟΣ'),('30','ΘΕΣΣΑΛΟΝΙΚΗ'),('31','ΣΩΚΡΑΤΗΣ'),('32','ΔΙΩΝΗ'),('36','ΔΕΙΝΟΚΡΑΤΗΣ'),
 ('42','ΑΔΑΜΑΝΤΙΟΣ ΚΟΡΑΗΣ'),('44','ΒΥΖΑΣ'),('48','ΑΡΗΤΗ'),('50','ΔΑΙΔΑΛΟΣ'),('52','SAINT GEORGE'),
 ('53','BENEFICENZA'),('54','ΑΡΓΩ'),('55','ΕΝΩΣΙΣ (ΚΥΠΡΟΣ)'),('58','LA FRANCE'),('59','ΟΜΗΡΟΣ'),('60','ΔΗΜΗΤΡΑ'),
 ('61','ΑΝΤΩΝΙΟΣ ΜΠΕΝΑΚΗΣ'),('62','ΠΛΟΥΤΑΡΧΟΣ'),('64','ΦΙΛΕΛΛΗΝΩΝ'),('66','ΠΥΘΑΓΟΡΑΣ'),
 ('67','ΕΛΛΗΝΟΓΛΩΣΣΟΝ ΞΕΝΟΔΟΧΕΙΟΝ'),('69','ΑΝΤΙΠΛΟΙΑΡΧΟΣ ΒΛΑΧΑΚΟΣ'),('71','ΛΗΔΡΑ'),('73','ΑΧΙΛΛΕΥΣ Ο ΜΥΡΜΙΔΩΝ'),
 ('76','ΛΟΡΔΟΣ ΒΥΡΩΝ'),('78','ΑΘΗΝΑ ΣΤΑΘΜΙΑ'),('80','ΑΠΟΛΛΩΝΙΟΣ Ο ΡΟΔΙΟΣ'),('84','ΚΥΠΡΑΙΩΝ ΗΡΩΩΝ'),
 ('85','RUDYARD KIPLING'),('86','FRATELLI BANDIERA'),('88','ΑΓΙΟΥ ΙΩΑΝΝΟΥ'),('89','ΛΟΓΟΣ'),('90','ΑΘΑΝΑΣΙΟΣ ΛΕΥΚΑΔΙΤΗΣ'),
 ('91','ΕΛΛΗΝΩΝ ΗΡΩΩΝ'),('92','ΙΩΑΝΝΗΣ ΚΑΠΟΔΙΣΤΡΙΑΣ'),('93','ΦΙΛΟΓΕΝΕΙΑ'),('94','ΔΙΟΝΥΣΙΟΣ ΡΩΜΑΣ'),('95','LA PAIX'),
 ('96','ΘΕΜΙΣΤΟΚΛΗΣ'),('97','ΙΣΟΤΗΣ 1882'),('98','ΔΩΔΩΝΗ'),('99','ΚΑΘΗΚΟΝ'),('100','ΑΚΑΚΙΑ'),('101','ΑΛΕΞΑΝΔΡΟΣ ΡΩΜΑΣ'),
 ('102','ΦΕΡΔΙΝΑΝΔΟΣ ΦΟΝ ΜΠΡΑΟΥΝΣΒΑΪΚ'),('103','ΠΛΑΤΩΝ 1990'),('104','ΑΚΡΟΠΟΛΙΣ 2010'),('105','ΠΡΟΜΗΘΕΥΣ 2014'),
 ('106','ΜΑΚΕΔΩΝ'),('107','ΑΤΛΑΝΤΙΣ'),('108','ΕΥΡΩΠΗ'),('109','ΑΡΙΣΤΟΜΕΝΗΣ'),('111','ΣΠΥΡΙΔΩΝ ΝΑΓΟΣ'),('112','ΗΦΑΙΣΤΙΑ'),
 ('113','ΔΗΜΗΤΗΡ'),('114','ΓΕΩΡΓΙΟΣ ΣΟΥΡΗΣ'),('115','ΟΡΦΕΥΣ'),('Φ','ΦΟΙΝΙΞ ΚΕΡΚΥΡΑΣ'),
]

LODGE_COLS=['number','name','orient','provincial','email','master','secretary','secretary_email','status','ritual','meeting_place','notes']

LODGE_HEADERS=['Αριθμός','Όνομα','Ανατολή','Επαρχιακή Μεγάλη Στοά','Email Στοάς','Σεβάσμιος','Γραμματέας','Email Γραμματέα','Κατάσταση','Τυπικό','Τόπος συνεδριάσεων','Σημειώσεις']

def _lodge_no_key(n):
    n=re.sub(r'\s+','',str(n or '')).upper()
    return n.lstrip('0') or n

def _lodge_sort(x):
    n=str(x.get('number') or '')
    return (0,int(n),'') if n.isdigit() else (1,0,n)

def _clean_lodge_name(v):
    v=re.sub(r'\s+',' ',str(v or '')).strip()
    # Ελληνικά γράμματα «μπλεγμένα» μέσα σε λατινικές λέξεις (π.χ. «LA ΡAIX») -> λατινικά
    look=str.maketrans('ΑΒΕΖΗΙΚΜΝΟΡΤΥΧ','ABEZHIKMNOPTYX')
    return ' '.join(w.translate(look) if re.search('[A-Za-z]',w) else w for w in v.split(' '))

def _lodges_init():
    with con() as c:
        c.executescript("""CREATE TABLE IF NOT EXISTS lodges(
        id INTEGER PRIMARY KEY AUTOINCREMENT,number TEXT NOT NULL DEFAULT '',name TEXT NOT NULL DEFAULT '',orient TEXT DEFAULT '',
        provincial TEXT DEFAULT '',email TEXT DEFAULT '',master TEXT DEFAULT '',secretary TEXT DEFAULT '',secretary_email TEXT DEFAULT '',
        status TEXT DEFAULT 'Ενεργή',notes TEXT DEFAULT '',source TEXT DEFAULT '',created_at TEXT,updated_at TEXT);
        CREATE INDEX IF NOT EXISTS ix_lodges_number ON lodges(number);""")
        # Νεότερα πεδία (Φάση 2): Τυπικό, Τόπος συνεδριάσεων
        if USE_PG:
            for col in ('ritual','meeting_place'):c.execute(f"ALTER TABLE lodges ADD COLUMN IF NOT EXISTS {col} TEXT DEFAULT ''")
        else:
            have=[r['name'] for r in c.execute('PRAGMA table_info(lodges)')]
            for col in ('ritual','meeting_place'):
                if col not in have:c.execute(f"ALTER TABLE lodges ADD COLUMN {col} TEXT DEFAULT ''")
        if not c.execute('SELECT COUNT(*) n FROM lodges').fetchone()['n']:
            ts=now()
            for n,nm in LODGE_SEED:
                c.execute("INSERT INTO lodges(number,name,status,source,created_at,updated_at) VALUES(?,?,?,?,?,?)",(n,nm,'Ενεργή','Μητρώο Μελών',ts,ts))

def _lodges_all(active_only=False):
    with con() as c:xs=[dict(r) for r in c.execute('SELECT * FROM lodges')]
    if active_only:xs=[x for x in xs if (x.get('status') or 'Ενεργή')!='Ανενεργή']
    return sorted(xs,key=_lodge_sort)

def _lodges_sync_from_members():
    # Προσθέτει στη βάση όσες Στοές υπάρχουν στο Μητρώο Μελών αλλά λείπουν (ταύτιση με τον αριθμό).
    with con() as c:
        have={_lodge_no_key(r['number']) for r in c.execute('SELECT number FROM lodges')}
        found={}
        for r in c.execute("SELECT lodge_number,lodge_name,COUNT(*) n FROM member_lodges GROUP BY lodge_number,lodge_name"):
            k=_lodge_no_key(r['lodge_number']);nm=_clean_lodge_name(r['lodge_name'])
            if not k or not nm or not (k.isdigit() or k=='Φ') or k in have:continue
            if k not in found or r['n']>found[k][1]:found[k]=(nm,r['n'])
        ts=now()
        for k,(nm,_) in found.items():
            c.execute("INSERT INTO lodges(number,name,status,source,created_at,updated_at) VALUES(?,?,?,?,?,?)",(k,nm,'Ενεργή','Μητρώο Μελών (αυτόματα)',ts,ts))
    return len(found)

def _lodge_member_counts():
    with con() as c:
        rows=c.execute("""SELECT ml.lodge_number,COUNT(DISTINCT ml.member_id) n FROM member_lodges ml JOIN member_registry m ON m.id=ml.member_id
        WHERE m.active=1 AND COALESCE(ml.member_status,'') NOT LIKE ? AND COALESCE(ml.member_status,'') NOT LIKE ? GROUP BY ml.lodge_number""",('%ΔΙΑΓΡΑΦΕΝ%','%ΜΕΤΕΣΘΕΝ%')).fetchall()
    out={}
    for r in rows:
        k=_lodge_no_key(r['lodge_number'])
        if k:out[k]=out.get(k,0)+r['n']
    return out

def lodge_title(x):
    n=str(x.get('number') or '').strip();t=f"Σεβ. Στοά «{x.get('name','').strip()}»"
    if n.isdigit():t+=f" υπ’ αριθμ. {n}"
    if (x.get('orient') or '').strip():t+=f", Αν. {x['orient'].strip()}"
    return t

def _lodge_rituals():
    return sorted({(x.get('ritual') or '').strip() for x in _lodges_all()}-{''})

def lodge_email(x):return (x.get('email') or '').strip() or (x.get('secretary_email') or '').strip()

def _lodge_form(x=None):
    x=x or {'status':'Ενεργή'}
    provs=''.join(f'<option{" selected" if (x.get("provincial") or "")==p else ""}>{esc(p)}</option>' for p in _provincial_choices())
    sts=''.join(f'<option{" selected" if (x.get("status") or "Ενεργή")==s_ else ""}>{esc(s_)}</option>' for s_ in LODGE_STATUSES)
    v=lambda k:esc(str(x.get(k) or ''))
    return f"""<div class="grid card">
<div><label>Αριθμός Στοάς</label><input name="number" value="{v('number')}" required></div>
<div><label>Όνομα Στοάς</label><input name="name" value="{v('name')}" required></div>
<div><label>Ανατολή (πόλη)</label><input name="orient" value="{v('orient')}" placeholder="π.χ. Αθηνών"></div>
<div><label>Επαρχιακή / Περιφερειακή Μεγάλη Στοά</label><select name="provincial"><option value="">— Χωρίς ορισμό —</option>{provs}</select></div>
<div><label>Email Στοάς</label><input type="email" name="email" value="{v('email')}"></div>
<div><label>Κατάσταση</label><select name="status">{sts}</select></div>
<div><label>Σεβάσμιος</label><input name="master" value="{v('master')}"></div>
<div><label>Γραμματέας</label><input name="secretary" value="{v('secretary')}"></div>
<div><label>Email Γραμματέα</label><input type="email" name="secretary_email" value="{v('secretary_email')}"></div>
<div><label>Τυπικό</label><input name="ritual" value="{v('ritual')}" list="lodge_rituals" placeholder="π.χ. Emulation, Σκωτικό"><datalist id="lodge_rituals">{''.join(f'<option value="{esc(r)}">' for r in _lodge_rituals())}</datalist></div>
<div class="full"><label>Τόπος συνεδριάσεων</label><input name="meeting_place" value="{v('meeting_place')}" placeholder="π.χ. Τεκτονικόν Μέγαρον, Ερεσού 38, Αθήνα"></div>
<div class="full"><label>Σημειώσεις</label><textarea name="notes" style="min-height:90px">{v('notes')}</textarea></div>
</div>"""

def _lodge_from_form(f):
    d={k:str(f.get(k,'') or '').strip() for k in LODGE_COLS}
    d['name']=_clean_lodge_name(d['name']);d['number']=_lodge_no_key(d['number'])
    if not d['number'] or not d['name']:raise HTTPException(400,'Συμπληρώστε αριθμό και όνομα Στοάς.')
    if d['status'] not in LODGE_STATUSES:d['status']='Ενεργή'
    return d

def _lodge_save(c,d,lid=None):
    other=c.execute('SELECT id FROM lodges WHERE number=?'+(' AND id<>?' if lid else ''),(d['number'],lid) if lid else (d['number'],)).fetchone()
    if other:raise HTTPException(400,f"Υπάρχει ήδη Στοά με αριθμό {d['number']}.")
    ts=now()
    if lid:
        c.execute('UPDATE lodges SET '+','.join(k+'=?' for k in LODGE_COLS)+',updated_at=? WHERE id=?',tuple(d[k] for k in LODGE_COLS)+(ts,lid))
    else:
        c.execute('INSERT INTO lodges('+','.join(LODGE_COLS)+',source,created_at,updated_at) VALUES('+','.join('?'*(len(LODGE_COLS)+3))+')',tuple(d[k] for k in LODGE_COLS)+('Χειροκίνητα',ts,ts))
