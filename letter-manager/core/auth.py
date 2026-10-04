# Είσοδος με κωδικό μίας χρήσης (OTP), χρήστες/ρόλοι, Υπογράφων, προστασία από επαναλαμβανόμενες αποτυχίες.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

def user(req):
    t=req.cookies.get('nglg_session');
    if not t:return None
    try:e=ser.loads(t,max_age=43200)
    except (BadSignature,SignatureExpired):return None
    with con() as c:
        r=c.execute('SELECT * FROM users WHERE email=? AND active=1',(e.lower(),)).fetchone();return dict(r) if r else None

def actor_key(req,u=None):
    u=u or user(req)
    if not u:return None
    e=u['email'].lower()
    selectable=e in {SHARED_SECRETARIAT_EMAIL,PRIMARY_ADMIN_EMAIL}
    if not selectable:return 'dimitrios'
    t=req.cookies.get('nglg_actor')
    if not t:return None if e==SHARED_SECRETARIAT_EMAIL else 'dimitrios'
    try:a=actor_ser.loads(t,max_age=43200)
    except (BadSignature,SignatureExpired):return None if e==SHARED_SECRETARIAT_EMAIL else 'dimitrios'
    return a if a in ACTOR_LABELS else ('dimitrios' if e==PRIMARY_ADMIN_EMAIL else None)

def signer_profile(key,s=None):
    s=s or settings()
    if key=='nikolaos':
        return {'key':'nikolaos','name':'Λίαν Σεβάσμιος Αδ. Νικόλαος Χατζηδημητρίου','title':'Αν. Μέγας Γραμματέας','asset':'signature_nikolaos.png'}
    return {'key':'dimitrios','name':s['grand_secretary_name'],'title':s['grand_secretary_title'],'asset':'signature_original.png'}

def need(req):
    u=user(req)
    if not u:raise HTTPException(401)
    a=actor_key(req,u)
    if u['email'].lower()==SHARED_SECRETARIAT_EMAIL and not a:
        raise HTTPException(status_code=303,headers={'Location':'/identity'})
    u['_actor']=a or 'dimitrios'
    return u

def isadmin(u):return u and u['role']=='admin'

def isauthorised(u):return u and u.get('role')=='authorised'

def hcode(e,code):return hashlib.sha256(f'{SECRET}|{e}|{code}'.encode()).hexdigest()

OTP_MAX_ATTEMPTS=5          # wrong OTP codes allowed before the code is cancelled

PWD_MAX_FAILS=5             # wrong passwords allowed before a temporary lock

PWD_LOCK_MINUTES=15

def smtp_ready():
    return bool(os.getenv('SMTP_HOST') and os.getenv('SMTP_USERNAME') and os.getenv('SMTP_PASSWORD'))

def sendotp(e,code):
    host=os.getenv('SMTP_HOST');usr=os.getenv('SMTP_USERNAME');pwd=(os.getenv('SMTP_PASSWORD') or '').replace(' ','');port=int(os.getenv('SMTP_PORT','587'))
    if not(host and usr and pwd):
        print('[otp] SMTP not configured (SMTP_HOST / SMTP_USERNAME / SMTP_PASSWORD) - OTP not sent')
        return False
    m=EmailMessage();m['Subject']='Κωδικός πρόσβασης – Μεγάλη Γραμματεία';m['From']=os.getenv('OTP_FROM_EMAIL',usr);m['To']=e
    m.set_content(f'Ο κωδικός OTP είναι: {code}\nΙσχύει για 10 λεπτά.\n\nΑν δεν ζητήσατε κωδικό, αγνοήστε αυτό το μήνυμα.')
    ctx=ssl.create_default_context()
    if port==465:
        with smtplib.SMTP_SSL(host,port,timeout=20,context=ctx) as s:s.login(usr,pwd);s.send_message(m)
    else:
        with smtplib.SMTP(host,port,timeout=20) as s:s.ehlo();s.starttls(context=ctx);s.ehlo();s.login(usr,pwd);s.send_message(m)
    return True

print('[otp] SMTP configured:', 'yes' if smtp_ready() else 'NO - set SMTP_PASSWORD on the server')

def guard_state(e):
    with con() as c:r=c.execute('SELECT * FROM login_guard WHERE email=?',(e,)).fetchone()
    if not r:return 0,None
    lu=datetime.fromisoformat(r['locked_until']) if r['locked_until'] else None
    return int(r['fails'] or 0),lu

def guard_fail(e):
    fails,_=guard_state(e);fails+=1
    lock=(datetime.now()+timedelta(minutes=PWD_LOCK_MINUTES)).isoformat(timespec='seconds') if fails>=PWD_MAX_FAILS else None
    with con() as c:
        if c.execute('SELECT 1 FROM login_guard WHERE email=?',(e,)).fetchone():
            c.execute('UPDATE login_guard SET fails=?,locked_until=? WHERE email=?',(0 if lock else fails,lock,e))
        else:
            c.execute('INSERT INTO login_guard(email,fails,locked_until) VALUES(?,?,?)',(e,0 if lock else fails,lock))
    return lock

def guard_ok(e):
    with con() as c:c.execute('DELETE FROM login_guard WHERE email=?',(e,))

@app.get('/login')
def login():
    return page('''<div class="card auth"><img class="logo" src="/asset/header_emblem.png"><h1>Ψηφιακή Μεγάλη Γραμματεία</h1><p>Εισαγάγετε το εγκεκριμένο email σας. Όπου έχει οριστεί προσωπικός κωδικός πρόσβασης, χρησιμοποιήστε τον στο δεύτερο πεδίο.</p><form method="post" action="/otp"><input type="email" name="email" placeholder="Email" required autofocus><br><br><input type="password" name="admin_password" placeholder="Κωδικός πρόσβασης" autocomplete="current-password"><br><br><button class="primary">Συνέχεια</button></form></div>''')

@app.post('/otp')
def otp(email:str=Form(...),admin_password:str=Form('')):
    e=email.strip().lower()
    with con() as c:r=c.execute('SELECT 1 FROM users WHERE email=? AND active=1',(e,)).fetchone()
    pw_hash={AUTHORIZED_USER_EMAIL:AUTHORIZED_USER_PASSWORD_HASH,PRIMARY_ADMIN_EMAIL:PRIMARY_ADMIN_PASSWORD_HASH}.get(e,'') if e else ''
    # --- personal password login (primary admin / authorised user) ---
    if r and pw_hash and (admin_password or e==AUTHORIZED_USER_EMAIL):
        _,locked=guard_state(e)
        if locked and locked>datetime.now():
            mins=max(1,int((locked-datetime.now()).total_seconds()//60)+1)
            return page(f'''<div class="card auth"><h2>Προσωρινό κλείδωμα</h2><p>Πολλές λανθασμένες προσπάθειες. Δοκιμάστε ξανά σε {mins} λεπτά ή συνδεθείτε με OTP αφήνοντας τον κωδικό κενό.</p><a class="btn" href="/login">Επιστροφή</a></div>''')
        entered=hashlib.sha256(admin_password.encode()).hexdigest()
        if hmac.compare_digest(entered,pw_hash):
            guard_ok(e)
            resp=RedirectResponse('/',303)
            resp.set_cookie('nglg_session',ser.dumps(e),httponly=True,secure=COOKIE_SECURE,samesite='lax',max_age=43200)
            if e==AUTHORIZED_USER_EMAIL:
                tok=secrets.token_urlsafe(32)
                with con() as c:c.execute('UPDATE users SET edit_session=?,updated_at=? WHERE email=?',(tok,now(),e))
                resp.set_cookie('nglg_edit_session',tok,httponly=True,secure=COOKIE_SECURE,samesite='lax',max_age=43200)
            return resp
        lock=guard_fail(e)
        msg=f'Λανθασμένος κωδικός. Ο λογαριασμός κλειδώθηκε για {PWD_LOCK_MINUTES} λεπτά.' if lock else 'Λανθασμένος κωδικός πρόσβασης.'
        return page(f'''<div class="card auth"><h2>Είσοδος</h2><p>{msg}</p><a class="btn" href="/login">Επιστροφή</a></div>''')
    # --- one-time code by email ---
    code=f'{secrets.randbelow(1000000):06d}'
    sent=False;err=''
    if r:
        with con() as c:c.execute('REPLACE INTO otps VALUES(?,?,?,?,?)',(e,hcode(e,code),(datetime.now()+timedelta(minutes=10)).isoformat(timespec='seconds'),0,now()))
        try:sent=sendotp(e,code)
        except Exception as ex:
            print('[otp] send failed:',type(ex).__name__,str(ex)[:300]);err=type(ex).__name__
        if not sent and not DEV:
            why='Η αποστολή email δεν έχει ρυθμιστεί στον διακομιστή (SMTP_PASSWORD).' if not smtp_ready() else 'Ο διακομιστής email απέρριψε την αποστολή (έλεγχος SMTP_PASSWORD / App Password).'
            return page(f'''<div class="card auth"><h2>Δεν στάλθηκε OTP</h2><p>{why}</p><p class="muted">Ενημερώστε τον διαχειριστή. Ο κύριος διαχειριστής μπορεί να εισέλθει με τον προσωπικό κωδικό του.</p><a class="btn" href="/login">Επιστροφή</a></div>''')
    extra=f'<p><b>DEV OTP: {code}</b></p>' if r and DEV and not sent else ''
    return page(f'''<div class="card auth"><h2>Επαλήθευση</h2><p>Αν το email έχει άδεια, στάλθηκε OTP (ελέγξτε και τα Ανεπιθύμητα). Ισχύει 10 λεπτά.</p>{extra}<form method="post" action="/verify"><input type="hidden" name="email" value="{esc(e)}"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required><br><br><button class="primary">Είσοδος</button></form></div>''')

@app.post('/verify')
def verify(email:str=Form(...),code:str=Form(...)):
    e=email.strip().lower();code=re.sub(r'\D','',code)
    fail=None
    with con() as c:
        r=c.execute('SELECT * FROM otps WHERE email=?',(e,)).fetchone()
        if not r or datetime.fromisoformat(r['expires_at'])<datetime.now():
            fail='Ο OTP έληξε ή δεν υπάρχει. Ζητήστε νέο κωδικό.'
        elif not hmac.compare_digest(r['code_hash'],hcode(e,code)):
            att=int(r['attempts'] or 0)+1
            if att>=OTP_MAX_ATTEMPTS:
                c.execute('DELETE FROM otps WHERE email=?',(e,))
                fail='Πολλές λανθασμένες προσπάθειες. Ζητήστε νέο κωδικό OTP.'
            else:
                c.execute('UPDATE otps SET attempts=? WHERE email=?',(att,e))
                fail=f'Λανθασμένος OTP ({OTP_MAX_ATTEMPTS-att} προσπάθειες απομένουν).'
        else:
            c.execute('DELETE FROM otps WHERE email=?',(e,))
    if fail:
        return page(f'''<div class="card auth"><h2>Επαλήθευση</h2><p>{esc(fail)}</p><form method="post" action="/verify"><input type="hidden" name="email" value="{esc(e)}"><input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required><br><br><button class="primary">Είσοδος</button></form><p><a href="/login">Νέος κωδικός</a></p></div>''')
    guard_ok(e)
    target='/identity' if e==SHARED_SECRETARIAT_EMAIL else '/'
    resp=RedirectResponse(target,303);resp.set_cookie('nglg_session',ser.dumps(e),httponly=True,secure=COOKIE_SECURE,samesite='lax',max_age=43200)
    resp.delete_cookie('nglg_actor')
    resp.delete_cookie('nglg_edit_session')
    return resp

@app.get('/identity')
def identity(req:Request):
    u=user(req)
    if not u:return RedirectResponse('/login',303)
    if u['email'].lower() not in {SHARED_SECRETARIAT_EMAIL,PRIMARY_ADMIN_EMAIL}:return RedirectResponse('/',303)
    current=actor_key(req,u)
    note=f'<p>Τρέχουσα επιλογή: <b>{esc(ACTOR_LABELS[current])}</b></p>' if current in ACTOR_LABELS else ''
    heading='Ποιος έχει εισέλθει;' if u['email'].lower()==SHARED_SECRETARIAT_EMAIL else 'Επιλογή Υπογράφοντος'
    helptext='Επιλέξτε ποιος χρησιμοποιεί αυτή τη στιγμή τον κοινό λογαριασμό της Μεγάλης Γραμματείας.' if u['email'].lower()==SHARED_SECRETARIAT_EMAIL else 'Ως βασικός administrator μπορείτε να επιλέξετε ποιος θα υπογράψει τις νέες επιστολές.'
    return page(f'''<div class="card auth" style="max-width:820px"><img class="logo" src="/asset/header_emblem.png"><h1>{heading}</h1><p>{helptext}</p>{note}<div class="identity-grid"><form class="card identity-card" method="post" action="/identity"><input type="hidden" name="actor" value="dimitrios"><h2>Δημήτρης Σκιαδόπουλος</h2><p>Μέγας Γραμματέας</p><button class="primary">Επιλογή Δημήτρη</button></form><form class="card identity-card" method="post" action="/identity"><input type="hidden" name="actor" value="nikolaos"><h2>Νικόλαος Χατζηδημητρίου</h2><p>Αν. Μέγας Γραμματέας</p><button class="primary">Επιλογή Νικόλαου</button></form></div></div>''')

@app.post('/identity')
def set_identity(req:Request,actor:str=Form(...)):
    u=user(req)
    if not u:return RedirectResponse('/login',303)
    if u['email'].lower() not in {SHARED_SECRETARIAT_EMAIL,PRIMARY_ADMIN_EMAIL}:return RedirectResponse('/',303)
    if actor not in ACTOR_LABELS:raise HTTPException(400,'Μη έγκυρη επιλογή')
    resp=RedirectResponse('/',303)
    resp.set_cookie('nglg_actor',actor_ser.dumps(actor),httponly=True,secure=COOKIE_SECURE,samesite='lax',max_age=43200)
    return resp

@app.get('/logout')
def logout(req:Request):
    u=user(req)
    if isauthorised(u):
        tok=current_edit_session(req,u)
        if tok:
            with con() as c:c.execute('UPDATE users SET edit_session=NULL,updated_at=? WHERE email=?',(now(),u['email'].lower()))
    r=RedirectResponse('/login',303)
    r.delete_cookie('nglg_session')
    r.delete_cookie('nglg_actor')
    r.delete_cookie('nglg_edit_session')
    return r
