# Πλήρες αντίγραφο ασφαλείας όλης της βάσης (λήψη) και επαναφορά του (ανέβασμα). Λειτουργεί ανάμεσα σε SQLite και
# Postgres, οπότε χρησιμοποιείται και για τη μεταφορά των δεδομένων σε νέο διακομιστή/βάση.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.
import gzip

BACKUP_FORMAT='nglg-backup/1'
BACKUP_SKIP={'otps','login_guard','sqlite_sequence'}
BACKUP_FIRST=['member_registry']  # πίνακες-γονείς (ξένα κλειδιά) πριν από τους υπόλοιπους

def db_tables():
    with con() as c:
        if USE_PG:rows=c.execute("SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'").fetchall()
        else:rows=c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    names=sorted(r['name'] for r in rows if r['name'] not in BACKUP_SKIP)
    return [t for t in BACKUP_FIRST if t in names]+[t for t in names if t not in BACKUP_FIRST]

def _bk_out(v):
    if isinstance(v,(bytes,bytearray,memoryview)):return {'$b64':base64.b64encode(bytes(v)).decode()}
    return v

def backup_bytes():
    out={'format':BACKUP_FORMAT,'created':now(),'database':'postgres' if USE_PG else 'sqlite','tables':{}}
    with con() as c:
        for t in db_tables():
            cols=[n for n,_ in db_columns(t)]
            rows=c.execute(f'SELECT * FROM {t}').fetchall()
            out['tables'][t]={'columns':cols,'rows':[[_bk_out(r[n]) for n in cols] for r in rows]}
    return gzip.compress(json.dumps(out,ensure_ascii=False).encode())

def _bk_in(v,typ):
    if isinstance(v,dict) and '$b64' in v:return base64.b64decode(v['$b64'])
    if db_is_int(typ):
        if v is None or isinstance(v,int):return v
        try:return int(str(v).strip())
        except ValueError:
            try:return int(float(str(v).strip()))
            except ValueError:return None
    if v is not None and typ in ('text','character varying') and not isinstance(v,str):return str(v)
    return v

def restore_backup(raw):
    try:d=json.loads(gzip.decompress(raw) if raw[:2]==b'\x1f\x8b' else raw)
    except Exception:raise HTTPException(400,'Το αρχείο δεν είναι αντίγραφο ασφαλείας της εφαρμογής.')
    if not isinstance(d,dict) or d.get('format')!=BACKUP_FORMAT:raise HTTPException(400,'Το αρχείο δεν είναι αντίγραφο ασφαλείας της εφαρμογής.')
    src=d.get('tables') or {};here=db_tables();done={}
    order=[t for t in here if t in src]
    with con() as c:
        for t in reversed(order):c.execute(f'DELETE FROM {t}')
        for t in order:
            types=dict(db_columns(t));cols=[n for n in src[t]['columns'] if n in types]
            idx=[src[t]['columns'].index(n) for n in cols]
            rows=[tuple(_bk_in(r[i],types[n]) for i,n in zip(idx,cols)) for r in src[t]['rows']]
            if rows and cols:c.executemany(f"INSERT INTO {t}({','.join(cols)}) VALUES({','.join('?'*len(cols))})",rows)
            if USE_PG and 'id' in cols:
                c.execute(f"SELECT setval(pg_get_serial_sequence('{t}','id'),GREATEST(COALESCE(MAX(id),0),1),COALESCE(MAX(id),0)>0) FROM {t}")
            done[t]=len(rows)
    return done

@app.get('/database/backup.json.gz')
def database_backup(req:Request):
    _db_admin(req)
    fn=f"nglg-backup-{date.today().isoformat()}.json.gz"
    return Response(backup_bytes(),media_type='application/gzip',headers={'Content-Disposition':f'attachment; filename="{fn}"'})

@app.get('/database/restore')
def database_restore_page(req:Request,msg:str=''):
    u=_db_admin(req)
    note=f"<div class='card'><b>{esc(msg)}</b></div>" if msg else ''
    return page(f"""<h1>💾 Αντίγραφο ασφαλείας &amp; επαναφορά</h1><p><a href="/database">← Βάση Δεδομένων</a></p>{note}
<div class="card"><h2 style="margin-top:0">1. Λήψη αντιγράφου</h2>
<p>Όλα τα δεδομένα (μέλη, Στοές, Επαρχίες, Επιστολές, Διατάγματα, Επισκέψεις, Εορτολόγιο, Πρότζεκτ με τα αρχεία τους, χρήστες και ρυθμίσεις) σε ένα αρχείο.
Φυλάξτε το σε ασφαλές σημείο: περιέχει προσωπικά δεδομένα και τη σύνδεση Google Drive.</p>
<a class="btn primary" href="/database/backup.json.gz">⬇ Λήψη πλήρους αντιγράφου</a></div>
<form class="card" method="post" enctype="multipart/form-data"><h2 style="margin-top:0">2. Επαναφορά από αντίγραφο</h2>
<p><b>Προσοχή:</b> αντικαθιστά <b>όλα</b> τα δεδομένα αυτής της εφαρμογής με τα δεδομένα του αρχείου. Χρησιμοποιείται για μεταφορά σε νέο διακομιστή
ή για επαναφορά μετά από λάθος. Κατεβάστε πρώτα αντίγραφο της τρέχουσας κατάστασης.</p>
<label>Αρχείο αντιγράφου (.json.gz)<input type="file" name="file" accept=".gz,.json,application/gzip,application/json" required></label>
<label>Πληκτρολογήστε <b>ΕΠΑΝΑΦΟΡΑ</b> για επιβεβαίωση<input name="confirm" autocomplete="off" required></label>
<div class="toolbar" style="margin-top:10px"><button class="btn primary">Επαναφορά δεδομένων</button></div></form>""",u,'Αντίγραφο ασφαλείας')

@app.post('/database/restore')
async def database_restore(req:Request):
    _db_admin(req);f=await req.form()
    if (f.get('confirm') or '').strip().upper()!='ΕΠΑΝΑΦΟΡΑ':raise HTTPException(400,'Πληκτρολογήστε ΕΠΑΝΑΦΟΡΑ για επιβεβαίωση.')
    up=f.get('file')
    if not getattr(up,'filename',''):raise HTTPException(400,'Επιλέξτε αρχείο.')
    done=restore_backup(await up.read())
    return RedirectResponse('/database/restore?msg='+quote(f'Η επαναφορά ολοκληρώθηκε: {len(done)} πίνακες, {sum(done.values())} εγγραφές.'),303)
