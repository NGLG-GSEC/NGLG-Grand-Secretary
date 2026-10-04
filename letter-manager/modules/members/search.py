# Μητρώο Μελών — αναζήτηση ανά πεδίο (Επώνυμο/Όνομα/Κινητό/Email/Στοά) και επισήμανση.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

# Αναζήτηση μελών: κάθε λέξη του ερωτήματος πρέπει να βρίσκεται σε οποιοδήποτε στοιχείο
# (επώνυμο, όνομα, παραλλαγές, email, κινητά, βαθμό, αρ. μητρώου, Στοές), χωρίς τόνους και
# χωρίς διάκριση πεζών/κεφαλαίων. Ένα τηλέφωνο ψάχνεται μόνο με τα ψηφία του (+30, κενά κ.λπ. αγνοούνται).
# Κανονικοποίηση αναζήτησης: χωρίς τόνους, ς=σ, και τα ελληνικά γράμματα που μοιάζουν με λατινικά
# ταυτίζονται με αυτά (ώστε π.χ. «LA ΡAIX» γραμμένο με ελληνικό Ρ να βρίσκεται ως «LA PAIX»).
_ACC_FROM='άέήίόύώϊϋΐΰςαβεζηικμνορτυχ';_ACC_TO='aehioyωiyiyσabezhikmnoptyx'

def _snorm(v):return (v or '').lower().translate(str.maketrans(_ACC_FROM,_ACC_TO))

def _sql_norm(col):return f"translate(lower(COALESCE({col},'')),'{_ACC_FROM}','{_ACC_TO}')"

_MEMBER_TEXT_COLS=['surname','first_name','surname_variants','first_name_variants','email','other_emails','degree']

MEMBER_SEARCH_FIELDS=[('surname','Επώνυμο'),('first_name','Όνομα'),('mobile','Κινητό'),('email','Email'),('lodge','Στοά'),('all','Όλα')]

def _member_search_where(q,field='all'):
    q=(q or '').strip()
    if not q:return '',[]
    if field in ('surname','first_name','email'):
        cols={'surname':['surname','surname_variants'],'first_name':['first_name','first_name_variants'],'email':['email','other_emails']}[field]
        conds=[];params=[]
        for w in q.split():
            conds.append('('+' OR '.join(_sql_norm(c)+' LIKE ?' for c in cols)+')');params+=['%'+_snorm(w)+'%']*len(cols)
        return ' WHERE '+' AND '.join(conds),params
    if field=='lodge':
        m=re.match(r'^\s*(\d+|Φ)\s*(·|$)',q)
        if m:
            no=_lodge_no_key(m.group(1))
            return " WHERE EXISTS(SELECT 1 FROM member_lodges ml WHERE ml.member_id=member_registry.id AND upper(replace(COALESCE(ml.lodge_number,''),' ',''))=?)",[no]
        conds=[];params=[]
        for w in q.split():
            conds.append("EXISTS(SELECT 1 FROM member_lodges ml WHERE ml.member_id=member_registry.id AND "+_sql_norm('ml.lodge_name')+" LIKE ?)");params.append('%'+_snorm(w)+'%')
        return ' WHERE '+' AND '.join(conds),params
    if field=='mobile':
        d=_phone_digits(q)
        if not d:return ' WHERE 1=0',[]
        return f" WHERE ({_sql_digits('mobile')} LIKE ? OR {_sql_digits('other_mobiles')} LIKE ?)",['%'+d+'%']*2
    digits=re.sub(r'\D','',q)
    phone_like=bool(re.fullmatch(r'[\d\s+\-().]+',q)) and len(digits)>=4
    if phone_like:
        digits=_phone_digits(q)
        v='%'+digits+'%'
        rn=q.strip() if q.strip().isdigit() else None
        cond=f"({_sql_digits('mobile')} LIKE ? OR {_sql_digits('other_mobiles')} LIKE ?"+(" OR CAST(registry_no AS TEXT)=?" if rn else '')+')'
        return ' WHERE '+cond,[v,v]+([rn] if rn else [])
    conds=[];params=[]
    for w in q.split():
        v='%'+_snorm(w)+'%'
        ors=[_sql_norm(c)+' LIKE ?' for c in _MEMBER_TEXT_COLS]+[f"{_sql_digits('mobile')} LIKE ?",f"{_sql_digits('other_mobiles')} LIKE ?","CAST(registry_no AS TEXT)=?",
             "EXISTS(SELECT 1 FROM member_lodges ml WHERE ml.member_id=member_registry.id AND ("+_sql_norm('ml.lodge_name')+" LIKE ? OR lower(COALESCE(ml.lodge_number,''))=?))"]
        d=re.sub(r'\D','',w) if re.fullmatch(r'[\d+\-().]+',w) and len(re.sub(r'\D','',w))>=3 else ''
        nod='~';params+=[v]*len(_MEMBER_TEXT_COLS)+[('%'+d+'%') if d else nod,('%'+d+'%') if d else nod,w,v,_snorm(w)]  # '~' δεν ταιριάζει ποτέ σε ψηφία
        conds.append('('+' OR '.join(ors)+')')
    return ' WHERE '+' AND '.join(conds),params

def _phone_digits(q):
    d=re.sub(r'\D','',q or '')
    if d.startswith('0030'):d=d[4:]
    elif d.startswith('30') and len(d)>10:d=d[2:]
    return d

def _hl(text,q,field_ok=True):
    # Επισήμανση (χωρίς τόνους/πεζά-κεφαλαία) των λέξεων της αναζήτησης μέσα στο κείμενο.
    t=text or ''
    if not q or not field_ok or not t:return esc(t)
    n=_snorm(t)
    if len(n)!=len(t):return esc(t)
    spans=[]
    words=[_snorm(w) for w in q.split()]
    d=_phone_digits(q)
    if d and re.fullmatch(r'[\d\s+\-().]+',q.strip()):words=[d]
    for w in words:
        if not w:continue
        i=n.find(w)
        while i!=-1:spans.append((i,i+len(w)));i=n.find(w,i+1)
    if not spans:return esc(t)
    spans.sort();merged=[]
    for a,b in spans:
        if merged and a<=merged[-1][1]:merged[-1]=(merged[-1][0],max(b,merged[-1][1]))
        else:merged.append((a,b))
    out=[];pos=0
    for a,b in merged:out+=[esc(t[pos:a]),'<mark>',esc(t[a:b]),'</mark>'];pos=b
    return ''.join(out)+esc(t[pos:])

def _sql_digits(col):
    e=f"COALESCE({col},'')"
    for ch in (' ','+','-','.','(',')','/'):e=f"replace({e},'{ch}','')"
    return e
