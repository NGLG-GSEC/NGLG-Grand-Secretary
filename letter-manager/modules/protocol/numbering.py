# Αριθμός Πρωτοκόλλου — ενιαία συνεχής αρίθμηση Επιστολών & Διαταγμάτων (20.542_26_Κατηγορία_Θέμα).
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

PROTOCOL_START_DEFAULT=20542

def protocol_topic(t):
    t=re.sub(r'[\\/:*?"<>|\r\n\t]+',' ',str(t or ''))
    t=re.sub(r'\s+',' ',t).strip(' ._-')
    return t[:60].rstrip() or 'Χωρίς θέμα'

def nextprot(c,category='Επιστολή',topic=''):
    # Συνεχής αρίθμηση (δεν μηδενίζει ανά έτος), κοινή για Επιστολές και Διατάγματα,
    # από τη ρύθμιση «protocol_start» και μετά. Π.χ. 20.542_26_Επιστολή_Εκπροσώπηση ΜΔ
    today=date.today();y=today.year
    c.execute('BEGIN IMMEDIATE')
    r=c.execute("SELECT value FROM settings WHERE key='protocol_start'").fetchone()
    try:start=int(re.sub(r'\D','',str(r['value']))) if r else PROTOCOL_START_DEFAULT
    except Exception:start=PROTOCOL_START_DEFAULT
    n=max(start-1,int(c.execute('SELECT COALESCE(MAX(protocol_seq),0) n FROM letters').fetchone()['n'] or 0),
          int(c.execute('SELECT COALESCE(MAX(protocol_seq),0) n FROM decree_documents').fetchone()['n'] or 0))+1
    return n,y,f"{n:,}".replace(',','.')+f"_{y%100:02d}_{category}_{protocol_topic(topic)}"

def _protocol_init():
    # Στήλες πρωτοκόλλου των Διαταγμάτων και η αρχή αρίθμησης (ρύθμιση «protocol_start»).
    with con() as c:
        if USE_PG:
            c.execute("ALTER TABLE decree_documents ADD COLUMN IF NOT EXISTS protocol_seq INTEGER")
            c.execute("ALTER TABLE decree_documents ADD COLUMN IF NOT EXISTS protocol_no TEXT DEFAULT ''")
        else:
            cols=[r['name'] for r in c.execute("PRAGMA table_info(decree_documents)")]
            if 'protocol_seq' not in cols:c.execute("ALTER TABLE decree_documents ADD COLUMN protocol_seq INTEGER")
            if 'protocol_no' not in cols:c.execute("ALTER TABLE decree_documents ADD COLUMN protocol_no TEXT DEFAULT ''")
        c.execute('INSERT OR IGNORE INTO settings VALUES(?,?)',('protocol_start',str(PROTOCOL_START_DEFAULT)))

_protocol_init()
