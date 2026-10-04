# Βάση δεδομένων: SQLite τοπικά / Postgres στο Render, σύνδεση con(), βασικοί πίνακες και ρυθμίσεις.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

class _PGCursor:
    def __init__(self, cur, lastrowid=None):
        self.cur=cur
        self.lastrowid=lastrowid
    def fetchone(self):
        return self.cur.fetchone()
    def fetchall(self):
        return self.cur.fetchall()
    def __iter__(self):
        return iter(self.cur)

class _PGConn:
    def __init__(self):
        self.raw=psycopg.connect(DATABASE_URL,row_factory=dict_row)
    def __enter__(self):
        return self
    def __exit__(self,exc_type,exc,tb):
        try:
            self.raw.rollback() if exc_type else self.raw.commit()
        finally:
            self.raw.close()
    def commit(self):
        self.raw.commit()
    def rollback(self):
        self.raw.rollback()
    def _adapt(self,sql):
        s=sql.strip()
        if s.upper()=='BEGIN IMMEDIATE':
            return 'SELECT pg_advisory_xact_lock(EXTRACT(YEAR FROM CURRENT_DATE)::bigint)'
        s=s.replace('INTEGER PRIMARY KEY AUTOINCREMENT','BIGSERIAL PRIMARY KEY')
        if s.startswith('INSERT OR IGNORE INTO settings VALUES'):
            return 'INSERT INTO settings(key,value) VALUES(%s,%s) ON CONFLICT(key) DO NOTHING'
        if s.startswith('INSERT OR IGNORE INTO letter_templates'):
            s=s.replace('INSERT OR IGNORE INTO','INSERT INTO',1).replace('?','%s')
            return s + ' ON CONFLICT(name) DO NOTHING'
        if s.startswith('INSERT OR IGNORE INTO users'):
            s=s.replace('INSERT OR IGNORE INTO','INSERT INTO',1).replace('?','%s')
            return s + ' ON CONFLICT(email) DO NOTHING'
        if s.startswith('REPLACE INTO otps VALUES'):
            return "INSERT INTO otps(email,code_hash,expires_at,attempts,created_at) VALUES(%s,%s,%s,%s,%s) ON CONFLICT(email) DO UPDATE SET code_hash=EXCLUDED.code_hash,expires_at=EXCLUDED.expires_at,attempts=EXCLUDED.attempts,created_at=EXCLUDED.created_at"
        if s.startswith('REPLACE INTO settings VALUES'):
            return "INSERT INTO settings(key,value) VALUES(%s,%s) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value"
        return s.replace('?','%s')
    def execute(self,sql,params=()):
        q=self._adapt(sql)
        cur=self.raw.cursor()
        if (q.lstrip().upper().startswith('INSERT INTO LETTERS(') or q.lstrip().upper().startswith('INSERT INTO MEMBER_REGISTRY(') or q.lstrip().upper().startswith('INSERT INTO DECREE_DOCUMENTS(')) and 'RETURNING' not in q.upper():
            cur.execute(q+' RETURNING id',params)
            row=cur.fetchone()
            return _PGCursor(cur,row['id'] if row else None)
        cur.execute(q,params)
        return _PGCursor(cur)
    def executescript(self,script):
        cur=self.raw.cursor()
        for stmt in script.split(';'):
            if stmt.strip():
                cur.execute(self._adapt(stmt))
        return _PGCursor(cur)

def con():
    if USE_PG:
        return _PGConn()
    c=sqlite3.connect(DB,timeout=30); c.row_factory=sqlite3.Row; c.execute('PRAGMA foreign_keys=ON'); c.create_function('lower',1,lambda x:x.lower() if isinstance(x,str) else x,deterministic=True); c.create_function('translate',3,lambda x,a,b:x.translate(str.maketrans(a,b)) if isinstance(x,str) else x,deterministic=True); return c

def now(): return datetime.now().isoformat(timespec='seconds')

def  init():
    with con() as c:
        c.executescript('''CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);CREATE TABLE IF NOT EXISTS users(email TEXT PRIMARY KEY,active INTEGER NOT NULL DEFAULT 1,role TEXT NOT NULL DEFAULT 'editor',allowed_templates TEXT NOT NULL DEFAULT '[]',created_at TEXT,updated_at TEXT);CREATE TABLE IF NOT EXISTS otps(email TEXT PRIMARY KEY,code_hash TEXT,expires_at TEXT,attempts INTEGER DEFAULT 0,created_at TEXT);CREATE TABLE IF NOT EXISTS login_guard(email TEXT PRIMARY KEY,fails INTEGER DEFAULT 0,locked_until TEXT);CREATE TABLE IF NOT EXISTS letter_templates(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT UNIQUE,body TEXT DEFAULT '',active INTEGER DEFAULT 1,created_at TEXT,updated_at TEXT);CREATE TABLE IF NOT EXISTS letters(id INTEGER PRIMARY KEY AUTOINCREMENT,protocol_seq INTEGER,protocol_year INTEGER,protocol_no TEXT UNIQUE,letter_date TEXT,subject TEXT,body TEXT,template_id INTEGER,recipient_name TEXT DEFAULT '',recipient_email TEXT DEFAULT '',status TEXT DEFAULT 'draft',created_by TEXT,signer TEXT DEFAULT 'dimitrios',source_letter_id INTEGER,created_at TEXT,updated_at TEXT);CREATE INDEX IF NOT EXISTS ixp ON letters(protocol_no);CREATE INDEX IF NOT EXISTS ixs ON letters(subject);''')
        if USE_PG:
            c.execute("ALTER TABLE letters ADD COLUMN IF NOT EXISTS signer TEXT DEFAULT 'dimitrios'")
            c.execute("ALTER TABLE letters ADD COLUMN IF NOT EXISTS edit_session TEXT")
            c.execute("ALTER TABLE letters ADD COLUMN IF NOT EXISTS recipient_member_id BIGINT")
            c.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS edit_session TEXT")
        else:
            cols=[r['name'] for r in c.execute("PRAGMA table_info(letters)")]
            if 'signer' not in cols:c.execute("ALTER TABLE letters ADD COLUMN signer TEXT DEFAULT 'dimitrios'")
            if 'edit_session' not in cols:c.execute("ALTER TABLE letters ADD COLUMN edit_session TEXT")
            if 'recipient_member_id' not in cols:c.execute("ALTER TABLE letters ADD COLUMN recipient_member_id INTEGER")
            ucols=[r['name'] for r in c.execute("PRAGMA table_info(users)")]
            if 'edit_session' not in ucols:c.execute("ALTER TABLE users ADD COLUMN edit_session TEXT")
        c.execute("UPDATE letters SET signer='dimitrios' WHERE signer IS NULL OR signer=''")
        d={'organization_name':'Εθνική Μεγάλη Στοά της Ελλάδος','founded_year':'1986','grand_master_title':'Μέγας Διδάσκαλος','grand_master_name':'Σεβτ. Αδ. Ιωάννης Μπενετάτος','grand_secretary_name':'Πανσεβ. Αδ. Δημήτριος Σκιαδόπουλος','grand_secretary_title':'Μέγας Γραμματέας','protocol_format':'{seq:03d}{month:02d}{yy:02d}','closing':'Με αδελφικούς χαιρετισμούς,'}
        for k,v in d.items(): c.execute('INSERT OR IGNORE INTO settings VALUES(?,?)',(k,v))
        c.execute("UPDATE settings SET value='Μέγας Γραμματέας' WHERE key='grand_secretary_title' AND value IN ('Μεγάλος Γραμματέας','Μέγας Γραμματέας','Ο Μεγάλος Γραμματέας','Ο Μέγας Γραμματέας')")
        c.execute("UPDATE settings SET value='{seq:03d}{month:02d}{yy:02d}' WHERE key='protocol_format'")
        ts=now(); seeds=[('Ελεύθερη επιστολή',''),('Επίσκεψη ΜΔ','Αγαπητοί Αδελφοί,\n\n[Κορμός επιστολής επίσκεψης Μεγάλου Διδασκάλου]'),('Επίσκεψη ΜΔ με εκπρόσωπο','Αγαπητοί Αδελφοί,\n\n[Κορμός επιστολής επίσκεψης με εκπρόσωπο]'),('Συλλυπητήρια','Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο συλλυπητηρίων]'),('Συγχαρητήρια','Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο συγχαρητηρίων]'),('Ευχαριστήρια','Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο ευχαριστηρίων]'),('Πρόσκληση','Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο πρόσκλησης]'),('Ανακοίνωση','Αγαπητοί Αδελφοί,\n\n[Εγκεκριμένο πρότυπο ανακοίνωσης]')]
        for n,b in seeds:c.execute('INSERT OR IGNORE INTO letter_templates(name,body,active,created_at,updated_at) VALUES(?,?,1,?,?)',(n,b,ts,ts))
        for e in ADMINS:
            c.execute("INSERT OR IGNORE INTO users(email,active,role,allowed_templates,created_at,updated_at) VALUES(?,1,'admin','[]',?,?)",(e,ts,ts))
            c.execute("UPDATE users SET active=1,role='admin',allowed_templates='[]',updated_at=? WHERE email=?",(ts,e))
        if PRIMARY_ADMIN_EMAIL:
            c.execute("INSERT OR IGNORE INTO users(email,active,role,allowed_templates,created_at,updated_at) VALUES(?,1,'admin','[]',?,?)",(PRIMARY_ADMIN_EMAIL,ts,ts))
            c.execute("UPDATE users SET active=1,role='admin',allowed_templates='[]',updated_at=? WHERE email=?",(ts,PRIMARY_ADMIN_EMAIL))
        if AUTHORIZED_USER_EMAIL:
            c.execute("INSERT OR IGNORE INTO users(email,active,role,allowed_templates,created_at,updated_at) VALUES(?,1,'authorised','[]',?,?)",(AUTHORIZED_USER_EMAIL,ts,ts))
            c.execute("UPDATE users SET active=1,role='authorised',allowed_templates='[]',updated_at=? WHERE email=?",(ts,AUTHORIZED_USER_EMAIL))

init()

def settings():
    with con() as c:return {r['key']:r['value'] for r in c.execute('SELECT * FROM settings')}
