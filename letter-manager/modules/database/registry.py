# Βάση Δεδομένων — κατάλογος των πινάκων που εμφανίζονται/επεξεργάζονται στη σελίδα «Βάση Δεδομένων».
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.
#
# Μόνο οι πίνακες και οι στήλες αυτού του καταλόγου είναι προσβάσιμοι· τα ονόματα στηλών επιβεβαιώνονται
# και από το πραγματικό σχήμα της βάσης. Οι αριθμοί πρωτοκόλλου δεν αλλάζουν ποτέ από εδώ.

from urllib.parse import urlencode

DB_TABLES={
 'members':{'table':'member_registry','label':'Μητρώο Μελών','group':'Μέλη','cols':['registry_no','surname','first_name','email','mobile','degree','active'],
            'search':['registry_no','surname','first_name','email','mobile','other_emails','other_mobiles'],'order':'surname,first_name','edit':True,'page':'/members/edit/{id}'},
 'member_lodges':{'table':'member_lodges','label':'Στοές των μελών','group':'Μέλη','cols':['member_id','lodge_name','lodge_number','member_status'],
            'search':['lodge_name','lodge_number','member_status'],'order':'member_id,seq','edit':True},
 'offices':{'table':'member_degrees_offices','label':'Επετηρίδα (αξιώματα)','group':'Μέλη','cols':['member_id','record_type','office','decree_no','decree_year','is_current'],
            'search':['office','record_type','decree_year'],'order':'decree_year DESC,id DESC','edit':True},
 'lodges':{'table':'lodges','label':'Συμβολικές Στοές','group':'Στοές & Επαρχίες','cols':['number','name','orient','provincial','email','master','ritual','status'],
            'search':['number','name','orient','provincial','email','master','secretary','ritual','meeting_place'],'order':'id','edit':True,'page':'/lodges/edit/{id}'},
 'provinces':{'table':'grand_lodges','label':'Επαρχιακές Μεγάλες Στοές','group':'Στοές & Επαρχίες','cols':['short','kind','email','master_name','secretary_name','active'],
            'search':['short','full_title','email','master_name','secretary_name'],'order':'sort_order,id','edit':True,'page':'/provinces/edit/{id}'},
 'letters':{'table':'letters','label':'Επιστολές','group':'Πρωτόκολλο','cols':['protocol_no','letter_date','subject','recipient_name','recipient_email','status'],
            'search':['protocol_no','subject','recipient_name','recipient_email'],'order':'id DESC','edit':False,'page':'/letter/{id}'},
 'decrees':{'table':'decree_documents','label':'Διατάγματα','group':'Πρωτόκολλο','cols':['protocol_no','decree_no','decree_year','decree_date','subject','status'],
            'search':['protocol_no','subject','decree_year'],'order':'id DESC','edit':False,'page':'/decrees/{id}'},
 'reps':{'table':'reps','label':'Εκπρόσωποι ΜΔ','group':'Εργασίες ΜΔ','cols':['surname','name','rep_rank','office','year','email','mobile','member_id'],
            'search':['surname','name','office','email','mobile'],'order':'surname,name','edit':True,'page':'/reps/edit/{id}'},
 'visits':{'table':'visits','label':'Επισκέψεις Στοών','group':'Εργασίες ΜΔ','cols':['visit_date','lodge','lodge_number','province','rep_id','rep_notified_at','prov_notified_at'],
            'search':['visit_date','lodge','lodge_number','location','province'],'order':'visit_date DESC','edit':True,'page':'/visits/edit/{id}'},
 'namedays':{'table':'namedays','label':'Εορτολόγιο ονομάτων','group':'Εργασίες ΜΔ','cols':['name','official','md','easter','rule'],
            'search':['name','official','md'],'order':'name_key','edit':True,'page':'/namedays/calendar/edit/{id}'},
 'greetings':{'table':'greetings_log','label':'Ιστορικό ευχών','group':'Εργασίες ΜΔ','cols':['feast_date','feast','name','email','sent_on'],
            'search':['name','email','feast','feast_date'],'order':'id DESC','edit':False},
 'projects':{'table':'projects','label':'Πρότζεκτ ΜΔ','group':'Εργασίες ΜΔ','cols':['title','ptype','status','start_date','target_date'],
            'search':['title','description'],'order':'id DESC','edit':False,'page':'/projects/{id}'},
 'templates':{'table':'letter_templates','label':'Πρότυπα επιστολών','group':'Ρυθμίσεις','cols':['name','active'],
            'search':['name','body'],'order':'name','edit':True},
 'notifications':{'table':'notifications','label':'Ειδοποιήσεις','group':'Ρυθμίσεις','cols':['created_at','kind','message'],
            'search':['message','kind'],'order':'id DESC','edit':False},
}
DB_READONLY_COLS={'id','created_at','updated_at','protocol_seq','protocol_no','protocol_year','ext_id','source','edit_session','name_key'}
DB_LONG_COLS={'body','notes','description','text','message','appointments','meta','full_title','addressee','note','additional_lodges','other_emails','other_mobiles'}
DB_PAGE_SIZE=50
DB_COL_LABELS={'registry_no':'Αρ. Μητρώου','surname':'Επώνυμο','first_name':'Όνομα','name':'Όνομα','email':'Email','mobile':'Κινητό','degree':'Βαθμός',
 'active':'Ενεργό','member_id':'Μέλος (#)','lodge_name':'Στοά','lodge_number':'Αρ. Στοάς','member_status':'Ιδιότητα','record_type':'Είδος','office':'Αξίωμα',
 'decree_no':'Αρ. Διατάγματος','decree_year':'Έτος','is_current':'Τρέχον','number':'Αριθμός','orient':'Ανατολή','provincial':'Επαρχία','master':'Σεβάσμιος',
 'secretary':'Γραμματέας','ritual':'Τυπικό','status':'Κατάσταση','meeting_place':'Τόπος συνεδριάσεων','short':'Επαρχία','full_title':'Πλήρης τίτλος','kind':'Είδος',
 'master_name':'ΕπΜΔ','master_email':'Email ΕπΜΔ','secretary_name':'ΕπΜΓρ.','secretary_email':'Email ΕπΜΓρ.','addressee':'«Προς»','sort_order':'Σειρά',
 'protocol_no':'Αρ. Πρωτ.','letter_date':'Ημερομηνία','subject':'Θέμα','recipient_name':'Παραλήπτης','recipient_email':'Email παραλήπτη','decree_date':'Ημερομηνία',
 'rep_rank':'Βαθμός','year':'Έτος','visit_date':'Ημερομηνία','lodge':'Στοά','province':'Επαρχία','location':'Τόπος','rep_id':'Εκπρόσωπος (#)',
 'rep_notified_at':'Ενημ. εκπροσώπου','prov_notified_at':'Ενημ. Επαρχίας','official':'Επίσημη εορτή','md':'Ημέρα (ΜΜ-ΗΗ)','easter':'Σχέση με Πάσχα','rule':'Κανόνας',
 'feast_date':'Ημ. εορτής','feast':'Εορτή','sent_on':'Αποστολή','title':'Τίτλος','ptype':'Είδος','start_date':'Έναρξη','target_date':'Προθεσμία',
 'body':'Κείμενο','created_at':'Δημιουργία','message':'Μήνυμα','notes':'Σημειώσεις','description':'Περιγραφή'}
def db_label(c):return DB_COL_LABELS.get(c,c)

def db_columns(table):
    # [(όνομα, τύπος)] από το πραγματικό σχήμα (SQLite ή Postgres)
    with con() as c:
        if USE_PG:
            rows=c.execute("SELECT column_name AS name,data_type AS type FROM information_schema.columns WHERE table_name=? ORDER BY ordinal_position",(table,)).fetchall()
        else:
            rows=c.execute(f'PRAGMA table_info({table})').fetchall()
    return [(r['name'],(r['type'] or '').lower()) for r in rows]

def db_spec(key):
    s=DB_TABLES.get(key)
    if not s:raise HTTPException(404)
    cols=db_columns(s['table'])
    if not cols:raise HTTPException(404)
    return s,cols

def _db_text(col):return _sql_norm(f'CAST({col} AS TEXT)')

def db_where(s,cols,q):
    names={c for c,_ in cols};conds=[];params=[]
    for w in (q or '').split():
        ors=[_db_text(c)+' LIKE ?' for c in s['search'] if c in names]
        if ors:conds.append('('+' OR '.join(ors)+')');params+=['%'+_snorm(w)+'%']*len(ors)
    return (' WHERE '+' AND '.join(conds) if conds else ''),params

def db_count(table):
    try:
        with con() as c:return c.execute(f'SELECT COUNT(*) n FROM {table}').fetchone()['n']
    except Exception:return None

def db_is_int(t):return any(x in t for x in ('int','serial'))

def protocol_book(q='',year='',cat=''):
    # Βιβλίο Πρωτοκόλλου: Επιστολές και Διατάγματα με τη σειρά του αριθμού πρωτοκόλλου
    with con() as c:
        rows=[dict(r,cat='Επιστολή',href=f"/letter/{r['id']}") for r in c.execute("SELECT id,protocol_seq,protocol_no,letter_date AS d,subject,recipient_name AS who,status FROM letters WHERE protocol_seq IS NOT NULL")]
        rows+=[dict(r,cat='Διάταγμα',href=f"/decrees/{r['id']}") for r in c.execute("SELECT id,protocol_seq,protocol_no,decree_date AS d,subject,'' AS who,status FROM decree_documents WHERE protocol_seq IS NOT NULL")]
    ql=_snorm(q)
    rows=[r for r in rows if (not cat or r['cat']==cat) and (not year or str(r['d'] or '')[:4]==year)
          and (not ql or all(w in _snorm(' '.join(str(r.get(k) or '') for k in ('protocol_no','subject','who'))) for w in ql.split()))]
    return sorted(rows,key=lambda r:-(r['protocol_seq'] or 0))
