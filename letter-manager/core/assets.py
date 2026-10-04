# Εικόνες της εφαρμογής (θυρεός, σφραγίδα, υπογραφές) από τον φάκελο static/.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

def asset_available(name):
    return bool(list((BASE/'static').glob(name+'.b64.*')))

def asset(name):
    files=sorted((BASE/'static').glob(name+'.b64.*'))
    if not files:raise HTTPException(404)
    payload=''.join(p.read_text(encoding='ascii') for p in files)
    return Response(base64.b64decode(payload),media_type='image/webp')

@app.get('/asset/{name}')
def getasset(name:str):
    if name not in {'header_emblem.png','signature_original.png','signature_nikolaos.png','seal_original.png'}:raise HTTPException(404)
    return asset(name)
