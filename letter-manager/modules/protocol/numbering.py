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
