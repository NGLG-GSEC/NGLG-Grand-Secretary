# Αποστολή email από τον λογαριασμό της Γραμματείας (ίδιες ρυθμίσεις SMTP με τον κωδικό OTP).
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.
#
# MAIL_OUTBOX_DIR (μόνο για δοκιμές/τοπικά): αντί να σταλεί, το μήνυμα γράφεται ως .eml στον φάκελο.

EMAIL_RE=re.compile(r'^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$')

def split_emails(s):
    return [x for x in re.split(r'[\s,;]+',str(s or '')) if x]

def mail_ready():
    return bool(os.getenv('MAIL_OUTBOX_DIR')) or smtp_ready()

def send_mail(to,subject,body,bcc=(),attachments=()):
    # attachments: [(όνομα αρχείου, bytes ή str, 'type/subtype'), ...]
    to=[x for x in to if x];bcc=[x for x in bcc if x]
    bad=[x for x in to+bcc if not EMAIL_RE.match(x)]
    if not to:raise HTTPException(400,'Δεν ορίστηκε παραλήπτης.')
    if bad:raise HTTPException(400,'Μη έγκυρο email: '+', '.join(bad))
    usr=os.getenv('SMTP_USERNAME','');m=EmailMessage()
    m['Subject']=subject;m['From']=os.getenv('OTP_FROM_EMAIL',usr) or 'grand.secretary@nglgreece.gr';m['To']=', '.join(to)
    if bcc:m['Bcc']=', '.join(bcc)
    m.set_content(body)
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
