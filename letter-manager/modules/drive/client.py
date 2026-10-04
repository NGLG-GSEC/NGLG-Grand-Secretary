# Google Drive — σύνδεση OAuth, αποθήκευση κλειδιών, κλήσεις στο Drive API.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

# ============================================================================
# 1) Ενιαίο πρωτόκολλο Επιστολών & Διαταγμάτων: 20.542_26_Κατηγορία_Θέμα
# 2) Αντίγραφο κάθε τελικού PDF στον φάκελο Google Drive της Μεγάλης Γραμματείας
# 3) Ειδοποιήσεις μέσα στην εφαρμογή (π.χ. «το PDF μεταφορτώθηκε στο Drive»)
# ============================================================================
import urllib.request,urllib.error,urllib.parse,threading

from starlette.background import BackgroundTask

DRIVE_FOLDER_DEFAULT='1kKR7v86jjs5QJE9-K5uUebvS6nZd9J03'

DRIVE_SCOPE='https://www.googleapis.com/auth/drive'

GOOGLE_AUTH_URL=os.getenv('GOOGLE_AUTH_URL','https://accounts.google.com/o/oauth2/v2/auth')

GOOGLE_TOKEN_URL=os.getenv('GOOGLE_TOKEN_URL','https://oauth2.googleapis.com/token')

DRIVE_API=os.getenv('DRIVE_API_BASE','https://www.googleapis.com').rstrip('/')

DOC_KINDS={'letter':'Επιστολή','decree':'Διάταγμα'}

def _drive_init():
    with con() as c:
        c.executescript("""CREATE TABLE IF NOT EXISTS app_secrets(key TEXT PRIMARY KEY,value TEXT NOT NULL DEFAULT '');
        CREATE TABLE IF NOT EXISTS drive_uploads(id INTEGER PRIMARY KEY AUTOINCREMENT,doc_type TEXT NOT NULL,doc_id BIGINT NOT NULL,
        file_name TEXT DEFAULT '',drive_file_id TEXT DEFAULT '',web_link TEXT DEFAULT '',status TEXT DEFAULT '',error TEXT DEFAULT '',
        created_at TEXT,updated_at TEXT);
        CREATE INDEX IF NOT EXISTS ix_drive_uploads_doc ON drive_uploads(doc_type,doc_id);""")
        c.execute('INSERT OR IGNORE INTO settings VALUES(?,?)',('drive_folder_id',DRIVE_FOLDER_DEFAULT))

def _secret(k):
    with con() as c:r=c.execute('SELECT value FROM app_secrets WHERE key=?',(k,)).fetchone()
    return r['value'] if r else ''

def _set_secret(k,v):
    with con() as c:c.execute('INSERT INTO app_secrets(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',(k,v))

def _del_secret(k):
    with con() as c:c.execute('DELETE FROM app_secrets WHERE key=?',(k,))

def drive_folder_id():
    v=(settings().get('drive_folder_id') or DRIVE_FOLDER_DEFAULT).strip()
    m=re.search(r'/folders/([A-Za-z0-9_-]+)',v) or re.search(r'[?&]id=([A-Za-z0-9_-]+)',v)
    return m.group(1) if m else v

def drive_client():return os.getenv('GOOGLE_OAUTH_CLIENT_ID','').strip(),os.getenv('GOOGLE_OAUTH_CLIENT_SECRET','').strip()

def drive_connected():return bool(_secret('drive_refresh_token')) and all(drive_client())

# ---------------------------------------------------------------- Google Drive
def _http_json(method,url,data=None,headers=None,timeout=60):
    rq=urllib.request.Request(url,data=data,method=method,headers=headers or {})
    try:
        with urllib.request.urlopen(rq,timeout=timeout) as r:
            raw=r.read().decode('utf-8') or '{}'
            return json.loads(raw)
    except urllib.error.HTTPError as e:
        body=e.read().decode('utf-8',errors='replace')
        try:msg=json.loads(body).get('error');msg=msg.get('message') if isinstance(msg,dict) else (msg or body)
        except Exception:msg=body
        raise RuntimeError(f'Google {e.code}: {str(msg)[:300]}')
    except urllib.error.URLError as e:
        raise RuntimeError(f'Σφάλμα δικτύου προς Google: {e.reason}')

def _drive_token():
    cid,sec=drive_client();rt=_secret('drive_refresh_token')
    if not(cid and sec and rt):raise RuntimeError('Το Google Drive δεν έχει συνδεθεί.')
    d=_http_json('POST',GOOGLE_TOKEN_URL,urllib.parse.urlencode({'client_id':cid,'client_secret':sec,'refresh_token':rt,'grant_type':'refresh_token'}).encode(),
                 {'Content-Type':'application/x-www-form-urlencoded'})
    if not d.get('access_token'):raise RuntimeError('Η Google δεν έδωσε κλειδί πρόσβασης· συνδέστε ξανά το Drive.')
    return d['access_token']

def _drive_send(token,name,pdf,file_id=None):
    b='nglg'+secrets.token_hex(12)
    meta={'name':name,'mimeType':'application/pdf'}
    if not file_id:meta['parents']=[drive_folder_id()]
    body=(f'--{b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+json.dumps(meta,ensure_ascii=False)+f'\r\n--{b}\r\nContent-Type: application/pdf\r\n\r\n').encode('utf-8')+pdf+f'\r\n--{b}--\r\n'.encode()
    q='uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink'
    url=f'{DRIVE_API}/upload/drive/v3/files'+(f'/{file_id}' if file_id else '')+'?'+q
    return _http_json('PATCH' if file_id else 'POST',url,body,{'Authorization':'Bearer '+token,'Content-Type':f'multipart/related; boundary={b}'},timeout=120)
