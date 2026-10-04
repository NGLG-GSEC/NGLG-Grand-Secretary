# Google Drive — σελίδα ρύθμισης, σύνδεση/αποσύνδεση, δοκιμή, χειροκίνητο ανέβασμα.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

@app.post('/drive/upload/{kind}/{doc_id}')
def drive_upload_now(req:Request,kind:str,doc_id:int):
    u=need(req)
    if kind not in DOC_KINDS or not _doc_info(kind,doc_id):raise HTTPException(404)
    resp=RedirectResponse(f'/letter/{doc_id}' if kind=='letter' else f'/decrees/{doc_id}',303)
    resp.background=BackgroundTask(drive_upload_doc,kind,doc_id,req)
    return resp

def _public_base(req):
    b=os.getenv('PUBLIC_BASE_URL','').strip().rstrip('/')
    if b:return b
    proto=req.headers.get('x-forwarded-proto') or req.url.scheme
    host=req.headers.get('x-forwarded-host') or req.headers.get('host') or req.url.netloc
    return f'{proto}://{host}'

def _upload_tr(x):
    st={'ok':'✔ OK','error':'⚠ Σφάλμα','not_connected':'⚠ Χωρίς σύνδεση'}.get(x['status'],esc(x['status'] or ''))
    last=f'<a target="_blank" rel="noopener" href="{esc(x["web_link"])}">Drive</a>' if x.get('web_link') else esc(x.get('error') or '')
    return f"<tr><td>{esc(DOC_KINDS.get(x['doc_type'],''))}</td><td>{esc(x['file_name'])}</td><td>{st}</td><td>{esc((x['updated_at'] or '')[:16].replace('T',' '))}</td><td>{last}</td></tr>"

@app.get('/drive')
def drive_page(req:Request,msg:str=''):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    cid,sec=drive_client();acct=_secret('drive_account');fid=drive_folder_id();redirect=_public_base(req)+'/drive/callback'
    with con() as c:ups=[dict(r) for r in c.execute('SELECT * FROM drive_uploads ORDER BY updated_at DESC LIMIT 30')]
    rows=''.join(_upload_tr(x) for x in ups)
    if not(cid and sec):
        state=f"""<p>⚠ <b>Λείπουν τα στοιχεία OAuth της Google.</b> Ορίστε στο Render (Environment) τις μεταβλητές <code>GOOGLE_OAUTH_CLIENT_ID</code> και <code>GOOGLE_OAUTH_CLIENT_SECRET</code> από ένα OAuth Client τύπου «Web application» στο Google Cloud Console, με Authorized redirect URI:<br><code>{esc(redirect)}</code><br>και ενεργοποιημένο το «Google Drive API».</p>"""
    elif drive_connected():
        state=f"""<p>✔ <b>Συνδεδεμένο</b>{(' ως <b>'+esc(acct)+'</b>') if acct else ''}. Τα τελικά PDF ανεβαίνουν στον φάκελο <a target="_blank" rel="noopener" href="https://drive.google.com/drive/folders/{esc(fid)}">{esc(fid)}</a>.</p>
<div class="toolbar"><a class="btn" href="/drive/connect">Επανασύνδεση</a><form method="post" action="/drive/disconnect" style="display:inline" onsubmit="return confirm('Αποσύνδεση του Google Drive;')"><button>Αποσύνδεση</button></form><form method="post" action="/drive/test" style="display:inline"><button>Δοκιμή σύνδεσης</button></form></div>"""
    else:
        state=f"""<p>Το Google Drive <b>δεν έχει συνδεθεί</b>. Πατήστε το κουμπί και συνδεθείτε με τον λογαριασμό Google που έχει δικαίωμα επεξεργασίας στον φάκελο.</p><a class="btn primary" href="/drive/connect">Σύνδεση με Google Drive</a>"""
    notice=f"<div class='card'><b>{esc(msg)}</b></div>" if msg else ''
    return page(f"""<h1>Google Drive</h1>{notice}<div class="card">{state}<p class="muted">Φάκελος προορισμού (ρύθμιση <code>drive_folder_id</code> στις Ρυθμίσεις): <code>{esc(fid)}</code><br>Όνομα αρχείου: <code>Αρ. Πρωτοκόλλου.pdf</code>, π.χ. <code>20.542_26_Επιστολή_Εκπροσώπηση ΜΔ.pdf</code></p></div>
<div class="card" style="overflow:auto"><h3>Πρόσφατες μεταφορτώσεις</h3><table><tr><th>Είδος</th><th>Αρχείο</th><th>Κατάσταση</th><th>Ώρα</th><th>Σύνδεσμος / Σφάλμα</th></tr>{rows or '<tr><td colspan=5>Καμία ακόμη.</td></tr>'}</table></div>""",u,'Google Drive')

@app.get('/drive/connect')
def drive_connect(req:Request):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    cid,sec=drive_client()
    if not(cid and sec):return RedirectResponse('/drive',303)
    st=secrets.token_urlsafe(24);_set_secret('drive_oauth_state',st)
    q=urllib.parse.urlencode({'client_id':cid,'redirect_uri':_public_base(req)+'/drive/callback','response_type':'code','scope':DRIVE_SCOPE,
                              'access_type':'offline','prompt':'consent','include_granted_scopes':'true','state':st})
    return RedirectResponse(GOOGLE_AUTH_URL+'?'+q,303)

@app.get('/drive/callback')
def drive_callback(req:Request,code:str='',state:str='',error:str=''):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    if error:return RedirectResponse('/drive?msg='+quote('Η σύνδεση ακυρώθηκε: '+error),303)
    exp=_secret('drive_oauth_state')
    if not code or not exp or not hmac.compare_digest(state,exp):raise HTTPException(400,'Μη έγκυρη απάντηση της Google.')
    cid,sec=drive_client()
    try:
        d=_http_json('POST',GOOGLE_TOKEN_URL,urllib.parse.urlencode({'code':code,'client_id':cid,'client_secret':sec,'redirect_uri':_public_base(req)+'/drive/callback','grant_type':'authorization_code'}).encode(),{'Content-Type':'application/x-www-form-urlencoded'})
        if not d.get('refresh_token'):raise RuntimeError('Η Google δεν έδωσε refresh token· αφαιρέστε την πρόσβαση της εφαρμογής από τον λογαριασμό Google και ξαναδοκιμάστε.')
        _set_secret('drive_refresh_token',d['refresh_token']);_del_secret('drive_oauth_state')
        try:
            me=_http_json('GET',f'{DRIVE_API}/drive/v3/about?fields=user(emailAddress)',None,{'Authorization':'Bearer '+d.get('access_token','')})
            _set_secret('drive_account',(me.get('user') or {}).get('emailAddress',''))
        except Exception:pass
    except Exception as e:
        return RedirectResponse('/drive?msg='+quote('Αποτυχία σύνδεσης: '+str(e)[:250]),303)
    notify('Το Google Drive συνδέθηκε'+(f' ({_secret("drive_account")})' if _secret('drive_account') else '')+'. Τα τελικά PDF θα ανεβαίνουν αυτόματα.','ok','/drive','Google Drive')
    return RedirectResponse('/drive?msg='+quote('Το Google Drive συνδέθηκε.'),303)

@app.post('/drive/disconnect')
def drive_disconnect(req:Request):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    for k in ('drive_refresh_token','drive_account'):_del_secret(k)
    return RedirectResponse('/drive?msg='+quote('Το Google Drive αποσυνδέθηκε.'),303)

@app.post('/drive/test')
def drive_test(req:Request):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    try:
        t=_drive_token()
        f=_http_json('GET',f'{DRIVE_API}/drive/v3/files/{drive_folder_id()}?supportsAllDrives=true&fields=id,name,capabilities(canAddChildren)',None,{'Authorization':'Bearer '+t})
        ok=(f.get('capabilities') or {}).get('canAddChildren')
        msg=f"Σύνδεση OK. Φάκελος: «{f.get('name','')}»"+('' if ok else ' — ΠΡΟΣΟΧΗ: ο λογαριασμός δεν έχει δικαίωμα προσθήκης αρχείων στον φάκελο.')
    except Exception as e:msg='Αποτυχία: '+str(e)[:250]
    return RedirectResponse('/drive?msg='+quote(msg),303)

_drive_init()
