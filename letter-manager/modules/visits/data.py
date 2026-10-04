# Επισκέψεις Στοών & Εκπρόσωποι — πίνακες, βαθμοί εκπροσώπων, βοηθητικά κειμένων και ημερολογίου.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

VISIT_MONTHS=['Ιανουάριος','Φεβρουάριος','Μάρτιος','Απρίλιος','Μάιος','Ιούνιος','Ιούλιος','Αύγουστος','Σεπτέμβριος','Οκτώβριος','Νοέμβριος','Δεκέμβριος']
VISIT_DAYS=['Δευτέρα','Τρίτη','Τετάρτη','Πέμπτη','Παρασκευή','Σάββατο','Κυριακή']  # date.weekday()
REP_RANKS=['Σεβάσμιος Αδ.','Λίαν Σεβάσμιος Αδ.','Πανσεβάσμιος Αδ.','Σεβασμιώτατος Αδ.']
REP_DEFAULT_RANKS={
 'Μέγας Διδάσκαλος':3,
 'Αναπληρωτής Μέγας Διδάσκαλος':2,'Βοηθός Μέγας Διδάσκαλος':2,'Επαρχιακός Μέγας Διδάσκαλος':2,'Περιφερειακός Μέγας Διδάσκαλος':2,
 'Πρώτος Μέγας Επόπτης':2,'Δεύτερος Μέγας Επόπτης':2,
 'Μέγας Καγκελάριος':1,'Αναπληρωτής Μέγας Καγκελάριος':1,'Μέγας Γραμματέας':1,'Αναπληρωτής Μέγας Γραμματέας':1,'Μέγας Ευχέτης':1,
 'Μέγας Τελετάρχης':1,'Μέγας Επόπτης Έργων':1,'Μέγας Ξιφοφόρος':1,'Μέγας Επιθεωρητής':1,
 'Πρόεδρος Συμβουλίου Μεγάλης Φιλανθρωπίας':1,'Πρόεδρος Μεγάλης Φιλανθρωπίας':1,
}
REP_COLS=['name','surname','rep_rank','office','year','email','mobile','member_id','notes']
VISIT_COLS=['visit_date','lodge','lodge_number','location','province','rep_id','notes']

def _visits_init():
    with con() as c:
        c.executescript("""CREATE TABLE IF NOT EXISTS reps(
        id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT DEFAULT '',surname TEXT DEFAULT '',rep_rank TEXT DEFAULT '',office TEXT DEFAULT '',
        year TEXT DEFAULT '',email TEXT DEFAULT '',mobile TEXT DEFAULT '',member_id BIGINT,notes TEXT DEFAULT '',ext_id TEXT DEFAULT '',
        created_at TEXT,updated_at TEXT);
        CREATE TABLE IF NOT EXISTS visits(
        id INTEGER PRIMARY KEY AUTOINCREMENT,visit_date TEXT NOT NULL,lodge TEXT DEFAULT '',lodge_number TEXT DEFAULT '',location TEXT DEFAULT '',
        province TEXT DEFAULT '',rep_id BIGINT,notes TEXT DEFAULT '',
        rep_notified_at TEXT DEFAULT '',rep_notified_date TEXT DEFAULT '',rep_notified_rep BIGINT,
        prov_notified_at TEXT DEFAULT '',prov_notified_date TEXT DEFAULT '',prov_notified_rep BIGINT,
        ext_id TEXT DEFAULT '',created_at TEXT,updated_at TEXT);
        CREATE INDEX IF NOT EXISTS ix_visits_date ON visits(visit_date);""")
        for k,v in (('visits_signer_name','Πσεβ. Αδ. Δημήτριος Σκιαδόπουλος'),('visits_signer_title','Μέγας Γραμματεύς'),('visits_rankmap','{}')):
            c.execute('INSERT OR IGNORE INTO settings VALUES(?,?)',(k,v))

def reps_all():
    with con() as c:xs=[dict(r) for r in c.execute('SELECT * FROM reps')]
    return sorted(xs,key=lambda r:(_snorm(r.get('surname') or ''),_snorm(r.get('name') or '')))

def rep_get(rid):
    if not rid:return None
    with con() as c:r=c.execute('SELECT * FROM reps WHERE id=?',(int(rid),)).fetchone()
    return dict(r) if r else None

def visits_all():
    with con() as c:xs=[dict(r) for r in c.execute('SELECT * FROM visits')]
    return sorted(xs,key=lambda v:(v['visit_date'],int(v['lodge_number']) if str(v.get('lodge_number') or '').isdigit() else 0))

def visit_get(vid):
    with con() as c:r=c.execute('SELECT * FROM visits WHERE id=?',(vid,)).fetchone()
    return dict(r) if r else None

def visits_signature():
    s=settings()
    return f"Με Τεκτονικούς χαιρετισμούς,\n\n{s.get('visits_signer_name','')}\n{s.get('visits_signer_title','')}".rstrip()

# ---------------------------------------------------------------- βαθμοί εκπροσώπων
def rep_rankmap():
    try:return {k:int(v) for k,v in json.loads(settings().get('visits_rankmap') or '{}').items()}
    except Exception:return {}

def rep_base_offices(r):
    out=[]
    for o in (r.get('office') or '').split(' · '):
        o=re.sub(r'\s*\(\d{4}\)\s*$','',o);o=re.sub(r'^Πρώην\s+','',o).strip()
        if o:out.append(o)
    return out

def rep_rank(r,rankmap=None):
    if not r:return ''
    if (r.get('rep_rank') or '') in REP_RANKS:return r['rep_rank']
    rm=rep_rankmap() if rankmap is None else rankmap
    os_=rep_base_offices(r)
    if not os_:return ''
    return REP_RANKS[max(rm.get(o,REP_DEFAULT_RANKS.get(o,0)) for o in os_)]

def rep_first_office(r):
    return re.sub(r'\s*\(\d{4}\)\s*$','',((r or {}).get('office') or '').split(' · ')[0])

def rep_is_past(r):return (r.get('office') or '').startswith('Πρώην')

def rep_label(r,rankmap=None):
    return ' '.join(x for x in [rep_rank(r,rankmap),r.get('surname',''),r.get('name','')] if x) if r else ''

def rep_full(r):
    o=rep_first_office(r)
    return f"{rep_rank(r) or 'Αδ.'} {r.get('name','')} {r.get('surname','')}{', '+o if o else ''}"

def rep_vocative(r):
    rk=rep_rank(r) or 'Αγαπητός Αδ.'
    return re.sub(r'ος Αδ\.$','ε Αδελφέ',rk)

def rep_contact(r):
    # email/κινητό του εκπροσώπου· αν λείπουν, από το Μητρώο Μελών (όταν είναι συνδεδεμένος με μέλος)
    email=(r.get('email') or '').strip();mobile=(r.get('mobile') or '').strip()
    if (not email or not mobile) and r.get('member_id'):
        m,_=_member_by_id(int(r['member_id']))
        if m:email=email or (m.get('email') or '').strip();mobile=mobile or (m.get('mobile') or '').strip()
    return email,mobile

# ---------------------------------------------------------------- ημερομηνίες / κείμενα
def _vdate(iso):
    try:return date.fromisoformat(iso)
    except Exception:return None

def fmt_ddmmyyyy(iso):
    d=_vdate(iso);return d.strftime('%d/%m/%Y') if d else (iso or '')

def day_str(iso):
    d=_vdate(iso);return f"{VISIT_DAYS[d.weekday()]} {d.strftime('%d/%m/%Y')}" if d else (iso or '')

def gr_upper(t):
    # κεφαλαία χωρίς τόνους (ΟΚΤΩΒΡΙΟΣ, όχι ΟΚΤΏΒΡΙΟΣ)
    return unicodedata.normalize('NFC',''.join(ch for ch in unicodedata.normalize('NFD',t) if unicodedata.category(ch)!='Mn').upper())

def month_title(key):
    y,m=key.split('-');return f'{VISIT_MONTHS[int(m)-1]} {y}'

def lodge_ref(v):
    return f"Σ.Σ. «{v.get('lodge','')}»"+(f" Αρ. {v['lodge_number']}" if v.get('lodge_number') else '')

def province_by_short(short):
    return next((p for p in provinces_all() if p['short']==short),None)

def province_title(p):
    # «ΕπΜΓρ.» από το «Προς» (π.χ. «ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Αθηνών»)
    w=((p or {}).get('addressee') or '').split(' ',1)[0]
    return w if w.endswith('.') else ''

def rep_notified(v):
    return bool(v.get('rep_notified_at')) and v.get('rep_notified_date')==v['visit_date'] and (v.get('rep_notified_rep') or None)==(v.get('rep_id') or None)

def prov_notified(v):
    return bool(v.get('prov_notified_at')) and v.get('prov_notified_date')==v['visit_date'] and (v.get('prov_notified_rep') or None)==(v.get('rep_id') or None)

def mark_visits(ids,kind,rep_id=None):
    ts=date.today().isoformat()
    with con() as c:
        for vid in ids:
            v=c.execute('SELECT visit_date,rep_id FROM visits WHERE id=?',(vid,)).fetchone()
            if not v:continue
            rid=rep_id if rep_id is not None else v['rep_id']
            c.execute(f'UPDATE visits SET {kind}_notified_at=?,{kind}_notified_date=?,{kind}_notified_rep=? WHERE id=?',(ts,v['visit_date'],rid,vid))

# ---------------------------------------------------------------- επικόλληση λιστών
def _visit_clean(s):
    s=re.sub(r'Σ\s*\.\s*Σ\s*\.?','',s)
    s=re.sub(r'Υπ\s*[\'’΄]?\s*Αρ(ιθ(μ(όν|ον))?)?\s*\.?','',s,flags=re.I)
    return re.sub(r'\s+',' ',s).strip()

def parse_visit_line(line,lodges_by_no):
    m=re.search(r'(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})',line)
    if not m:return None
    try:d=date(int(m.group(3)),int(m.group(2)),int(m.group(1)))
    except ValueError:return None
    rest=line[m.end():];rest=re.sub(r'\b(date|lodge|numbers?|location)\b\s*:?',' ',rest,flags=re.I).replace(',',' ').replace(';',' ')
    rest=_visit_clean(rest);lodge=number=location=''
    nm=re.search(r'\b(\d{1,4})\b',rest)
    if nm:lodge=rest[:nm.start()].strip();number=nm.group(1);location=rest[nm.end():].strip()
    else:
        i=re.search(r'Τεκτονικ',rest,re.I)
        if i and i.start()>0:lodge=rest[:i.start()].strip();location=rest[i.start():].strip()
        else:lodge=rest
    location=location.rstrip('.').strip()
    if not lodge:return None
    reg=lodges_by_no.get(_lodge_no_key(number)) if number else None
    return {'visit_date':d.isoformat(),'lodge':reg['name'] if reg else lodge,'lodge_number':number,
            'location':location or (reg or {}).get('meeting_place') or '','province':(reg or {}).get('provincial') or '','rep_id':None,'notes':''}

def parse_rep_line(line):
    parts=[p.strip() for p in re.split(r'\t|;|\|',line)]
    if len(parts)<2 or not parts[0] or not parts[1]:return None
    parts+=['']*5
    return {'name':parts[0],'surname':parts[1],'rep_rank':parts[2] if parts[2] in REP_RANKS else '','office':parts[3],'email':parts[4]}

# ---------------------------------------------------------------- πρόσκληση ημερολογίου (.ics)
def ics_for(vs):
    q=lambda s:re.sub(r'([\;,])',r'\\\1',str(s or '')).replace('\n','\\n')
    stamp=datetime.utcnow().strftime('%Y%m%dT%H%M%SZ');ev=[]
    for v in vs:
        d=_vdate(v['visit_date']);n=d+timedelta(days=1);p=province_by_short(v.get('province') or '')
        desc='Εκπροσώπηση του Μεγάλου Διδασκάλου.'+(f" {(p or {}).get('full_title') or v['province']}." if v.get('province') else '')+' Η ώρα έναρξης θα επιβεβαιωθεί από τη Στοά.'
        ev.append('\r\n'.join(x for x in ['BEGIN:VEVENT',f"UID:visit-{v.get('id') or d.strftime('%Y%m%d')+'-'+(v.get('lodge_number') or 'x')}@nglg-lodge-visits",f'DTSTAMP:{stamp}',
            f"DTSTART;VALUE=DATE:{d.strftime('%Y%m%d')}",f"DTEND;VALUE=DATE:{n.strftime('%Y%m%d')}",f"SUMMARY:{q('Εγκατάσταση Σεβασμίου — '+lodge_ref(v))}",
            f"LOCATION:{q(v['location'])}" if v.get('location') else '',f'DESCRIPTION:{q(desc)}','END:VEVENT'] if x))
    return '\r\n'.join(['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//NGLG//Lodge Visits//EL','CALSCALE:GREGORIAN','METHOD:PUBLISH',*ev,'END:VCALENDAR'])+'\r\n'
