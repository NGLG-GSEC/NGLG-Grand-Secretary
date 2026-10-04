# Αποστολή email και λογαριασμοί αποστολής ανά κατηγορία (Ρυθμίσεις → «Λογαριασμοί αποστολής»).
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.
#
#   official → Επιστολές & Διατάγματα       (προεπιλογή grand.secretary@nglgreece.gr — ανοίγει το Gmail)
#   general  → όλα τα υπόλοιπα εξερχόμενα    (προεπιλογή info@nglgreece.gr — αποστολή από τον διακομιστή, SMTP)
#
# MAIL_OUTBOX_DIR (μόνο για δοκιμές/τοπικά): αντί να σταλεί, το μήνυμα γράφεται ως .eml στον φάκελο.

EMAIL_RE=re.compile(r'^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$')

MAIL_SENDERS={
 'official':{'key':'mail_from_official','default':'grand.secretary@nglgreece.gr','label':'Επιστολές & Διατάγματα',
             'uses':'Αποστολή Επιστολών και Διαταγμάτων — ανοίγει το Gmail με αυτόν τον λογαριασμό.'},
 'general':{'key':'mail_from_general','default':'info@nglgreece.gr','label':'Γενικά εξερχόμενα',
            'uses':'Επισκέψεις Στοών (εκπρόσωποι, Επαρχίες), κωδικοί εισόδου, αντίγραφα ασφαλείας του Μητρώου — αποστολή από τον διακομιστή.'},
}

def _mail_init():
    with con() as c:
        for v in MAIL_SENDERS.values():c.execute('INSERT OR IGNORE INTO settings VALUES(?,?)',(v['key'],v['default']))
        c.execute('DELETE FROM settings WHERE key=?',('sender_email',))  # παλιά ενιαία ρύθμιση· αντικαταστάθηκε από τις δύο παραπάνω
        # Εφάπαξ διόρθωση: η πρώτη έκδοση είχε κατά λάθος προεπιλογή grand.chancellor@ για τις Επιστολές & τα Διατάγματα.
        if not c.execute('SELECT 1 FROM settings WHERE key=?',('_mail_senders_fix1',)).fetchone():
            c.execute('UPDATE settings SET value=? WHERE key=? AND value=?',('grand.secretary@nglgreece.gr','mail_from_official','grand.chancellor@nglgreece.gr'))
            c.execute('INSERT OR IGNORE INTO settings VALUES(?,?)',('_mail_senders_fix1','1'))

def sender_for(kind):
    v=MAIL_SENDERS[kind];x=(settings().get(v['key']) or '').strip()
    return x if EMAIL_RE.match(x) else v['default']

def smtp_login_differs(kind='general'):
    # Ο διακομιστής συνδέεται στο SMTP με SMTP_USERNAME· αν διαφέρει από τον αποστολέα, το Gmail
    # δείχνει τον αποστολέα μόνο όταν αυτός έχει οριστεί ως «Αποστολή ως» (alias) στον λογαριασμό SMTP.
    usr=(os.getenv('SMTP_USERNAME') or '').strip().lower()
    return bool(usr) and usr!=sender_for(kind).lower()

def sender_banner(kind):
    v=MAIL_SENDERS[kind];addr=sender_for(kind)
    how=('Θα ανοίξει το Gmail με αυτόν τον λογαριασμό — βεβαιωθείτε ότι είστε συνδεδεμένοι σε αυτόν.' if kind=='official'
         else 'Αποστολή από τον διακομιστή της εφαρμογής.')
    return (f'<div class="card sender-box" style="border-left:5px solid #b18a43;margin:10px 0"><b>✉ Αποστολή από: {esc(addr)}</b>'
            f' <span class="muted">({esc(v["label"])})</span><br><small class="muted">{esc(how)} Αλλαγή: Διαχείριση → Ρυθμίσεις → «Λογαριασμοί αποστολής».</small></div>')

def gmail_compose_url(to,subject,body,cc=''):
    return ('https://mail.google.com/mail/u/?authuser='+quote(sender_for('official'))+'&view=cm&fs=1&to='+quote(to or '')
            +('&cc='+quote(cc) if cc else '')+'&su='+quote(subject or '')+'&body='+quote(body or ''))

def split_emails(s):
    return [x for x in re.split(r'[\s,;]+',str(s or '')) if x]

def mail_ready():
    return bool(os.getenv('MAIL_OUTBOX_DIR')) or smtp_ready()

def send_mail(to,subject,body,bcc=(),attachments=(),kind='general',html=None):
    # attachments: [(όνομα αρχείου, bytes ή str, 'type/subtype'), ...]
    to=[x for x in to if x];bcc=[x for x in bcc if x]
    bad=[x for x in to+bcc if not EMAIL_RE.match(x)]
    if not to:raise HTTPException(400,'Δεν ορίστηκε παραλήπτης.')
    if bad:raise HTTPException(400,'Μη έγκυρο email: '+', '.join(bad))
    usr=os.getenv('SMTP_USERNAME','');m=EmailMessage()
    sender=sender_for(kind);m['Subject']=subject;m['From']=sender;m['Reply-To']=sender;m['To']=', '.join(to)
    if bcc:m['Bcc']=', '.join(bcc)
    m.set_content(body)
    if html:m.add_alternative(html,subtype='html')
    for fn,data,mime in attachments:
        mt,st=mime.split('/',1)
        if isinstance(data,str):data=data.encode('utf-8')
        m.add_attachment(data,maintype=mt,subtype=st,filename=fn)
    out=os.getenv('MAIL_OUTBOX_DIR')
    if out:
        Path(out).mkdir(parents=True,exist_ok=True)
        (Path(out)/f"{datetime.now().strftime('%Y%m%d%H%M%S%f')}.eml").write_bytes(bytes(m))
        return True
    if not smtp_ready():raise HTTPException(503,'Δεν έχει ρυθμιστεί η αποστολή email (SMTP) στον διακομιστή.')
    host=os.getenv('SMTP_HOST');pwd=(os.getenv('SMTP_PASSWORD') or '').replace(' ','');port=int(os.getenv('SMTP_PORT','587'))
    ctx=ssl.create_default_context()
    try:
        if port==465:
            with smtplib.SMTP_SSL(host,port,timeout=30,context=ctx) as s:s.login(usr,pwd);s.send_message(m)
        else:
            with smtplib.SMTP(host,port,timeout=30) as s:s.ehlo();s.starttls(context=ctx);s.ehlo();s.login(usr,pwd);s.send_message(m)
    except Exception as e:
        raise HTTPException(502,f'Η αποστολή email απέτυχε ({type(e).__name__}).')
    return True

_mail_init()
