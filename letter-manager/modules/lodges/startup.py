# Συμβολικές Στοές — εκκίνηση (πίνακας, αρχικά δεδομένα).
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

_lodges_init()

try:
    print('[lodges] base:',len(_lodges_all()),'Στοές')
except Exception as e:
    print('[lodges] count unavailable',type(e).__name__)
