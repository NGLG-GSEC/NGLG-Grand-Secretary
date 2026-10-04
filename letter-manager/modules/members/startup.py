# Μητρώο Μελών — εκκίνηση (δημιουργία πινάκων, αρχική φόρτωση).
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

_member_init()

try:
    with con() as c:
        print('[member-registry] loaded',c.execute('SELECT COUNT(*) n FROM member_registry').fetchone()['n'],'members')
except Exception as e:
    print('[member-registry] count unavailable',type(e).__name__)
