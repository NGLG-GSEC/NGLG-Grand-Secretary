# Επαρχιακές / Περιφερειακή Μεγάλη Στοά και ΕΜΣτΕ — πίνακας της βάσης (όχι σταθερή λίστα στον κώδικα).
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.
#
# Από εδώ διαβάζουν: οι παραλήπτες των Επιστολών, η επιλογή «ΕπΜΣτ.» των Συμβολικών Στοών,
# η ομαδοποίηση Στοών ανά Επαρχία. Επεξεργασία από τη σελίδα /provinces.

PROVINCE_KINDS=['Επαρχιακή','Περιφερειακή','Εθνική']

# Αρχικά δεδομένα (φορτώνονται μόνο όταν ο πίνακας είναι κενός):
# (συντομογραφία, πλήρης τίτλος, email Γραμματείας, «Προς» όπως τυπώνεται στην επιστολή, είδος)
PROVINCE_SEED=[
 ('ΕπΜΣτ. Αθηνών','Επαρχιακή Μεγάλη Στοά Αθηνών','athens.secretary@nglgreece.gr','ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Αθηνών','Επαρχιακή'),
 ('ΕπΜΣτ. Πειραιώς & Νήσων Αρχ. Αιγαίου','Επαρχιακή Μεγάλη Στοά Πειραιώς και Νήσων Αρχιπελάγους Αιγαίου','piraeus.secretary@nglgreece.gr','ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Πειραιώς και Νήσων Αρχιπελάγους Αιγαίου','Επαρχιακή'),
 ('ΕπΜΣτ. Ιονίων Νήσων','Επαρχιακή Μεγάλη Στοά Ιονίων Νήσων','ionian.secretary@nglgreece.gr','ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Ιονίων Νήσων','Επαρχιακή'),
 ('ΕπΜΣτ. Κεντρικής & Βορείου Ελλάδος','Επαρχιακή Μεγάλη Στοά Κεντρικής και Βορείου Ελλάδος','nglgr.prov.cent.north@gmail.com','ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Κεντρικής και Βορείου Ελλάδος','Επαρχιακή'),
 ('ΕπΜΣτ. Πελοποννήσου & Δυτικής Ελλάδας','Επαρχιακή Μεγάλη Στοά Πελοποννήσου και Δυτικής Ελλάδας','secretary.pr.pwg.nglgreece@gmail.com','ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Πελοποννήσου και Δυτικής Ελλάδας','Επαρχιακή'),
 ('ΠΜΣτ. Κύπρου','Περιφερειακή Μεγάλη Στοά Κύπρου','dglcyprus@nglgreece.gr','ΠερΜΓρ. Περιφερειακής Μεγάλης Στοάς Κύπρου','Περιφερειακή'),
 ('ΕΜΣτΕ Α.Ε. & Α.Τ.','Εθνική Μεγάλη Στοά της Ελλάδος των Αρχαίων, Ελευθέρων και Αποδεκτών Τεκτόνων','grand.secretary@nglgreece.gr','ΜΓρ. Εθνικής Μεγάλης Στοάς της Ελλάδος των Αρχαίων, Ελευθέρων και Αποδεκτών Τεκτόνων','Εθνική'),
]

PROVINCE_COLS=['short','full_title','kind','email','addressee','secretary_name','master_name','master_email','sort_order','active','notes']

def _provinces_init():
    with con() as c:
        c.executescript("""CREATE TABLE IF NOT EXISTS grand_lodges(
        id INTEGER PRIMARY KEY AUTOINCREMENT,short TEXT NOT NULL DEFAULT '',full_title TEXT DEFAULT '',kind TEXT DEFAULT 'Επαρχιακή',
        email TEXT DEFAULT '',addressee TEXT DEFAULT '',secretary_name TEXT DEFAULT '',master_name TEXT DEFAULT '',master_email TEXT DEFAULT '',
        sort_order INTEGER DEFAULT 0,active INTEGER DEFAULT 1,notes TEXT DEFAULT '',created_at TEXT,updated_at TEXT);""")
        if not c.execute('SELECT COUNT(*) n FROM grand_lodges').fetchone()['n']:
            ts=now()
            for i,(short,full,email,addressee,kind) in enumerate(PROVINCE_SEED,1):
                c.execute('INSERT INTO grand_lodges(short,full_title,kind,email,addressee,sort_order,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
                          (short,full,kind,email,addressee,i*10,1,ts,ts))

def provinces_all(active_only=False):
    with con() as c:xs=[dict(r) for r in c.execute('SELECT * FROM grand_lodges ORDER BY sort_order,id')]
    return [x for x in xs if x.get('active')] if active_only else xs

def province_get(pid):
    with con() as c:r=c.execute('SELECT * FROM grand_lodges WHERE id=?',(pid,)).fetchone()
    return dict(r) if r else None

def _provincial_choices():
    # Οι επιλογές «ΕπΜΣτ.» για τις Συμβολικές Στοές: Επαρχιακές και Περιφερειακές (όχι η ΕΜΣτΕ).
    return [p['short'] for p in provinces_all(active_only=True) if p.get('kind')!='Εθνική']

def _province_from_form(f):
    d={k:str(f.get(k,'') or '').strip() for k in PROVINCE_COLS}
    if not d['short']:raise HTTPException(400,'Συμπληρώστε τη συντομογραφία (π.χ. «ΕπΜΣτ. Αθηνών»).')
    if d['kind'] not in PROVINCE_KINDS:d['kind']='Επαρχιακή'
    d['sort_order']=int(d['sort_order']) if d['sort_order'].lstrip('-').isdigit() else 0
    d['active']=0 if d['active']=='0' else 1
    for k in ('email','master_email'):
        if d[k] and not re.fullmatch(r'[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+',d[k]):raise HTTPException(400,f'Μη έγκυρο email: {d[k]}')
    return d

def _province_save(c,d,pid=None):
    other=c.execute('SELECT id FROM grand_lodges WHERE short=?'+(' AND id<>?' if pid else ''),(d['short'],pid) if pid else (d['short'],)).fetchone()
    if other:raise HTTPException(400,f"Υπάρχει ήδη εγγραφή «{d['short']}».")
    ts=now()
    if pid:
        old=c.execute('SELECT short FROM grand_lodges WHERE id=?',(pid,)).fetchone()['short']
        c.execute('UPDATE grand_lodges SET '+','.join(k+'=?' for k in PROVINCE_COLS)+',updated_at=? WHERE id=?',tuple(d[k] for k in PROVINCE_COLS)+(ts,pid))
        if old!=d['short']:  # μετονομασία: ακολουθούν και οι Στοές της
            c.execute('UPDATE lodges SET provincial=?,updated_at=? WHERE provincial=?',(d['short'],ts,old))
    else:
        c.execute('INSERT INTO grand_lodges('+','.join(PROVINCE_COLS)+',created_at,updated_at) VALUES('+','.join('?'*(len(PROVINCE_COLS)+2))+')',tuple(d[k] for k in PROVINCE_COLS)+(ts,ts))
