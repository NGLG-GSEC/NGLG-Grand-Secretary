# Επιστολές — ποιος μπορεί να επεξεργαστεί ποια επιστολή και ποια πρότυπα βλέπει.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

def current_edit_session(req,u=None):
    u=u or user(req)
    if not isauthorised(u):return None
    tok=req.cookies.get('nglg_edit_session') or ''
    saved=(u.get('edit_session') or '')
    return tok if tok and saved and hmac.compare_digest(tok,saved) else None

def can_edit_letter(req,u,x):
    if isadmin(u) or (u and u.get('role')=='editor'):return True
    if not isauthorised(u):return False
    tok=current_edit_session(req,u)
    return bool(tok and (x.get('created_by') or '').lower()==u['email'].lower() and (x.get('edit_session') or '')==tok)

def templates_for(u):
    with con() as c:
        if isadmin(u) or isauthorised(u):return [dict(r) for r in c.execute('SELECT * FROM letter_templates WHERE active=1 ORDER BY name')]
        ids=json.loads(u.get('allowed_templates') or '[]')
        if not ids:return []
        q=','.join('?'*len(ids));return [dict(r) for r in c.execute(f'SELECT * FROM letter_templates WHERE active=1 AND id IN ({q}) ORDER BY name',ids)]

def can_tpl(u,i):return isadmin(u) if not i else any(int(t['id'])==int(i) for t in templates_for(u))
