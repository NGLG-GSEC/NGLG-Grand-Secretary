# Πρότζεκτ ΜΔ — πίνακες (πρότζεκτ, Στοές/ομάδες, μέλη, επαφές, αρχεία, ημερολόγιο) και αποθήκευση αρχείων.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

PROJECT_TYPES={'lodge':'Ίδρυση νέας Στοάς','body':'Ίδρυση νέου Σώματος','other':'Άλλο έργο'}
PROJECT_STATUSES={'plan':'Σχεδιασμός','active':'Σε εξέλιξη','hold':'Σε αναμονή','done':'Ολοκληρώθηκε'}
PROJECT_FILE_TYPES={'image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp','image/gif':'.gif','application/pdf':'.pdf'}
PROJECT_FILE_MAX=20*1024*1024
PROJECT_FILES_DIR=DATA/'project_files'

def _projects_init():
    with con() as c:
        c.executescript("""CREATE TABLE IF NOT EXISTS projects(
        id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL DEFAULT '',ptype TEXT DEFAULT 'lodge',status TEXT DEFAULT 'plan',
        start_date TEXT DEFAULT '',target_date TEXT DEFAULT '',description TEXT DEFAULT '',notes TEXT DEFAULT '',cover_file BIGINT,
        created_at TEXT,updated_at TEXT);
        CREATE TABLE IF NOT EXISTS project_units(id INTEGER PRIMARY KEY AUTOINCREMENT,project_id BIGINT NOT NULL,name TEXT DEFAULT '',
        leader_member_id BIGINT,notes TEXT DEFAULT '',sort INTEGER DEFAULT 0);
        CREATE TABLE IF NOT EXISTS project_members(id INTEGER PRIMARY KEY AUTOINCREMENT,project_id BIGINT NOT NULL,member_id BIGINT NOT NULL);
        CREATE TABLE IF NOT EXISTS project_contacts(id INTEGER PRIMARY KEY AUTOINCREMENT,project_id BIGINT NOT NULL,name TEXT DEFAULT '',
        role TEXT DEFAULT '',phone TEXT DEFAULT '',email TEXT DEFAULT '',notes TEXT DEFAULT '');
        CREATE TABLE IF NOT EXISTS project_files(id INTEGER PRIMARY KEY AUTOINCREMENT,project_id BIGINT NOT NULL,kind TEXT DEFAULT '',
        name TEXT DEFAULT '',url TEXT DEFAULT '',stored_name TEXT DEFAULT '',content_type TEXT DEFAULT '',size BIGINT DEFAULT 0,added_on TEXT);
        CREATE TABLE IF NOT EXISTS project_blobs(stored_name TEXT PRIMARY KEY,data BLOB NOT NULL);
        CREATE TABLE IF NOT EXISTS project_log(id INTEGER PRIMARY KEY AUTOINCREMENT,project_id BIGINT NOT NULL,log_date TEXT DEFAULT '',
        text TEXT DEFAULT '',created_at TEXT);""")

def project_get(pid):
    with con() as c:
        p=c.execute('SELECT * FROM projects WHERE id=?',(pid,)).fetchone()
        if not p:return None
        p=dict(p)
        p['units']=[dict(r) for r in c.execute('SELECT * FROM project_units WHERE project_id=? ORDER BY sort,id',(pid,))]
        p['member_ids']=[r['member_id'] for r in c.execute('SELECT member_id FROM project_members WHERE project_id=? ORDER BY id',(pid,))]
        p['contacts']=[dict(r) for r in c.execute('SELECT * FROM project_contacts WHERE project_id=? ORDER BY id',(pid,))]
        p['files']=[dict(r) for r in c.execute('SELECT * FROM project_files WHERE project_id=? ORDER BY id',(pid,))]
        p['log']=[dict(r) for r in c.execute('SELECT * FROM project_log WHERE project_id=? ORDER BY log_date DESC,id DESC',(pid,))]
    return p

def projects_all():
    with con() as c:
        xs=[dict(r) for r in c.execute('SELECT * FROM projects')]
        cnt=lambda t:{r['project_id']:r['n'] for r in c.execute(f'SELECT project_id,COUNT(*) n FROM {t} GROUP BY project_id')}
        u,m,ct,f=cnt('project_units'),cnt('project_members'),cnt('project_contacts'),cnt('project_files')
    for x in xs:x.update(n_units=u.get(x['id'],0),n_members=m.get(x['id'],0),n_contacts=ct.get(x['id'],0),n_files=f.get(x['id'],0))
    return sorted(xs,key=lambda p:(p['status']=='done',p.get('target_date') or '9999'))

def project_days_to(p):
    d=_vdate(p.get('target_date') or '')
    return (d-date.today()).days if d else None

def project_due(p):
    if p.get('status')=='done':return 'Ολοκληρώθηκε'
    d=project_days_to(p)
    if d is None:return 'Χωρίς ημερομηνία στόχου'
    if d<0:return f'Εκπρόθεσμο κατά {-d} {"ημέρα" if d==-1 else "ημέρες"}'
    return 'Ο στόχος είναι σήμερα' if d==0 else f'{d} {"ημέρα" if d==1 else "ημέρες"} έως τον στόχο'

def project_late(p):
    d=project_days_to(p);return p.get('status')!='done' and d is not None and d<0

def project_unit_label(p):return 'Ομάδες εργασίας' if p.get('ptype')=='other' else 'Στοές'

def project_initials(t):
    return ''.join(w[0].upper() for w in str(t or '').split() if w[:1].isalpha())[:3] or '?'

def project_members_info(ids):
    if not ids:return []
    with con() as c:
        rows={r['id']:dict(r) for r in c.execute('SELECT id,surname,first_name,email,mobile,degree FROM member_registry WHERE id IN ('+','.join('?'*len(ids))+')',tuple(ids))}
        ls={}
        for r in c.execute('SELECT member_id,lodge_name,lodge_number,member_status FROM member_lodges WHERE member_id IN ('+','.join('?'*len(ids))+') ORDER BY seq',tuple(ids)):ls.setdefault(r['member_id'],[]).append(dict(r))
    out=[]
    for i in ids:
        m=rows.get(i) or {'id':i,'surname':'(άγνωστο μέλος)','first_name':'','email':'','mobile':'','degree':''}
        m['lodges']=ls.get(i,[]);out.append(m)
    return sorted(out,key=lambda m:(nd_fold(m['surname']),nd_fold(m['first_name'])))

# Τα αρχεία (εικόνες, PDF) αποθηκεύονται μέσα στη βάση (project_blobs), ώστε η εφαρμογή να μη χρειάζεται μόνιμο δίσκο.
# Αρχεία παλαιότερων εκδόσεων στον δίσκο (PROJECT_FILES_DIR) μεταφέρονται στη βάση στην εκκίνηση.
def project_store_file(pid,data,content_type):
    name=secrets.token_hex(12)+PROJECT_FILE_TYPES[content_type]
    with con() as c:c.execute('INSERT INTO project_blobs(stored_name,data) VALUES(?,?)',(name,data))
    return name

def project_file_path(f):
    return PROJECT_FILES_DIR/str(f['project_id'])/f['stored_name']

def project_file_bytes(f):
    with con() as c:r=c.execute('SELECT data FROM project_blobs WHERE stored_name=?',(f['stored_name'],)).fetchone()
    if r:return bytes(r['data'])
    path=project_file_path(f)
    return path.read_bytes() if path.exists() else None

def project_file_drop(f):
    if not f or not f['stored_name']:return
    with con() as c:c.execute('DELETE FROM project_blobs WHERE stored_name=?',(f['stored_name'],))
    try:project_file_path(f).unlink()
    except Exception:pass

def project_delete_files(pid):
    with con() as c:
        for f in c.execute("SELECT project_id,stored_name FROM project_files WHERE project_id=? AND stored_name<>''",(pid,)).fetchall():project_file_drop(dict(f))
    d=PROJECT_FILES_DIR/str(pid)
    if d.exists():
        for x in d.iterdir():
            try:x.unlink()
            except Exception:pass
        try:d.rmdir()
        except Exception:pass

def project_files_to_db():
    # μία φορά: αρχεία από τον δίσκο → βάση
    if not PROJECT_FILES_DIR.exists():return 0
    n=0
    with con() as c:
        have={r['stored_name'] for r in c.execute('SELECT stored_name FROM project_blobs')}
        for f in c.execute("SELECT project_id,stored_name FROM project_files WHERE stored_name<>''").fetchall():
            path=project_file_path(f)
            if f['stored_name'] not in have and path.exists():
                c.execute('INSERT INTO project_blobs(stored_name,data) VALUES(?,?)',(f['stored_name'],path.read_bytes()));n+=1
    if n:print(f'[projects] {n} αρχεία μεταφέρθηκαν από τον δίσκο στη βάση')
    return n
