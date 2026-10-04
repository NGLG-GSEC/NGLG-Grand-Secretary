# Εορτολόγιο — ονομαστικές εορτές (σταθερές και κινητές από το Πάσχα), εορτάζοντες μέλη, ιστορικό ευχών.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

NAMEDAYS_SEED_FILE=BASE/'modules'/'namedays'/'namedays_seed.json'
NAMEDAY_RULES={'':'—','george':'Αγ. Γεωργίου (μετά το Πάσχα αν πέφτει πριν)','mark':'Αγ. Μάρκου (μετά το Πάσχα αν πέφτει πριν)'}
GREET_RK=['Αδ.','Σεβ.','Λίαν Σεβ.','Πσεβ.','Σεβτ.']
GREET_TITLE=['Αδ.','Σεβ. Αδ.','Λίαν Σεβ. Αδ.','Πσεβ. Αδ.','Σεβτ. Αδ.']
GREET_VOC=['Αδελφέ','Σεβάσμιε Αδελφέ','Λίαν Σεβάσμιε Αδελφέ','Πανσεβάσμιε Αδελφέ','Σεβασμιώτατε Αδελφέ']
GREET_SUBJECT_DEFAULT='Χρόνια πολλά για την ονομαστική σας εορτή'
GREET_BODY_DEFAULT='''Προς: {Τίτλος} {Όνομα} {Επώνυμο}

Αγαπητέ {Προσφώνηση},

Σας μεταφέρω, με ιδιαίτερη χαρά, τις θερμότερες ευχές του Σεβτ. Αδ. Ιωάννη Μπενετάτου, Μεγάλου Διδασκάλου της Εθνικής Μεγάλης Στοάς της Ελλάδος, για την ονομαστική σας εορτή.

Εύχεται από καρδιάς υγεία, χαρά, οικογενειακή ευτυχία και κάθε καλό στη ζωή και στο έργο σας.

Ο Μέγας Γραμματεύς
Πσεβ. Αδ. Δημήτριος Σκιαδόπουλος'''

def nd_fold(s):
    s=unicodedata.normalize('NFD',str(s or ''))
    return ''.join(ch for ch in s if unicodedata.category(ch)!='Mn').lower().replace('ς','σ').strip()

def nd_key(first_name):
    return nd_fold(str(first_name or '').split(' ')[0].split('-')[0]) if first_name else ''

def _namedays_init():
    with con() as c:
        c.executescript("""CREATE TABLE IF NOT EXISTS namedays(
        id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL DEFAULT '',name_key TEXT NOT NULL DEFAULT '',official TEXT DEFAULT '',
        md TEXT DEFAULT '',easter INTEGER,rule TEXT DEFAULT '',note TEXT DEFAULT '',created_at TEXT,updated_at TEXT);
        CREATE INDEX IF NOT EXISTS ix_namedays_key ON namedays(name_key);
        CREATE TABLE IF NOT EXISTS greetings_log(
        id INTEGER PRIMARY KEY AUTOINCREMENT,member_id BIGINT,registry_no INTEGER,feast_date TEXT NOT NULL,feast TEXT DEFAULT '',
        name TEXT DEFAULT '',email TEXT DEFAULT '',subject TEXT DEFAULT '',bcc TEXT DEFAULT '',sent_on TEXT,sent_at TEXT,source TEXT DEFAULT '');
        CREATE INDEX IF NOT EXISTS ix_greetings_member ON greetings_log(member_id,feast_date);""")
        if not c.execute('SELECT COUNT(*) n FROM namedays').fetchone()['n'] and NAMEDAYS_SEED_FILE.exists():
            ts=now()
            for x in json.loads(NAMEDAYS_SEED_FILE.read_text(encoding='utf-8')):
                c.execute('INSERT INTO namedays(name,name_key,official,md,easter,rule,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',
                          (x['name'],nd_key(x['name']),x.get('official',''),x.get('md',''),x.get('easter'),x.get('rule',''),x.get('note',''),ts,ts))
        for k,v in (('greet_subject',GREET_SUBJECT_DEFAULT),('greet_body',GREET_BODY_DEFAULT),('greet_bcc_self','')):
            c.execute('INSERT OR IGNORE INTO settings VALUES(?,?)',(k,v))

def namedays_all():
    with con() as c:return [dict(r) for r in c.execute('SELECT * FROM namedays ORDER BY name_key')]

def orthodox_easter(y):
    a,b,c=y%4,y%7,y%19;d=(19*c+15)%30;e=(2*a+4*b-d+34)%7;mo=(d+e+114)//31;da=(d+e+114)%31+1
    return date(y,mo,da)+timedelta(days=13)

def nameday_in(it,y):
    if it.get('easter') is not None and str(it.get('easter')).lstrip('-').isdigit():
        return orthodox_easter(y)+timedelta(days=int(it['easter']))
    md=it.get('md') or ''
    if not re.fullmatch(r'\d{2}-\d{2}',md):return None
    m,dd=map(int,md.split('-'))
    try:d=date(y,m,dd)
    except ValueError:return None
    E=orthodox_easter(y)
    if it.get('rule')=='george' and d<E:d=E+timedelta(days=1)
    if it.get('rule')=='mark' and d<E:d=E+timedelta(days=2)
    return d

def nameday_label(it):return it.get('official') or it.get('name') or ''

def _nd_members():
    with con() as c:
        ms=[dict(r) for r in c.execute('SELECT id,registry_no,surname,first_name,email,other_emails,mobile,degree FROM member_registry WHERE active=1')]
        ls={}
        for r in c.execute('SELECT member_id,lodge_name,lodge_number,member_status FROM member_lodges ORDER BY member_id,seq'):ls.setdefault(r['member_id'],[]).append(dict(r))
    for m in ms:m['lodges']=ls.get(m['id'],[])
    return ms

def member_lodges_text(m):
    return ', '.join(f"{l['lodge_name']} {l['lodge_number']}".strip()+(f" ({l['member_status']})" if l.get('member_status') and 'ΕΝΕΡΓ' not in l['member_status'].upper() else '')
                     for l in m.get('lodges',[]) if l.get('lodge_name') or l.get('lodge_number'))

def greet_email(m):
    for e in [m.get('email') or '']+split_emails(m.get('other_emails') or ''):
        if EMAIL_RE.match(e.strip()):return e.strip()
    return ''

def greet_key(mid,d):return f'{mid}|{d}'

def greetings_sent():
    # {(member_id, ημερομηνία εορτής): ημερομηνία αποστολής}
    with con() as c:return {(r['member_id'],r['feast_date']):r['sent_on'] for r in c.execute('SELECT member_id,feast_date,sent_on FROM greetings_log WHERE member_id IS NOT NULL')}

def celebrants(frm,to):
    # [{date, label, movable, members:[…]}] για τα ενεργά μέλη που εορτάζουν στο διάστημα [frm, to]
    idx={}
    for it in namedays_all():idx.setdefault(it['name_key'],it)
    d0,d1=date.fromisoformat(frm),date.fromisoformat(to);groups={}
    for m in _nd_members():
        it=idx.get(nd_key(m['first_name']))
        if not it:continue
        for y in range(d0.year,d1.year+1):
            d=nameday_in(it,y)
            if not d or d<d0 or d>d1:continue
            k=(d.isoformat(),nameday_label(it))
            g=groups.setdefault(k,{'date':k[0],'label':k[1],'movable':it.get('easter') is not None or bool(it.get('rule')),'members':[]})
            g['members'].append(m)
    out=sorted(groups.values(),key=lambda g:(g['date'],nd_fold(g['label'])))
    for g in out:g['members'].sort(key=lambda m:(nd_fold(m['surname']),nd_fold(m['first_name'])))
    return out

# ---------------------------------------------------------------- προσφώνηση από το υψηλότερο αξίωμα
def member_rank_idx(m,rankmap=None):
    rm=rep_rankmap() if rankmap is None else rankmap;k=-1
    with con() as c:
        reps_=[dict(r) for r in c.execute('SELECT * FROM reps WHERE member_id=?',(m['id'],))]
        offs=[r['office'] for r in c.execute('SELECT office FROM member_degrees_offices WHERE member_id=?',(m['id'],))]
        is_master=any(nd_fold(x['master'] or '') in (nd_fold(f"{m['first_name']} {m['surname']}"),nd_fold(f"{m['surname']} {m['first_name']}"))
                      for x in c.execute("SELECT master FROM lodges WHERE COALESCE(master,'')<>''"))
    for r in reps_:
        rk=rep_rank(r,rm)
        if rk in REP_RANKS:k=max(k,REP_RANKS.index(rk))
    for o in offs:
        k=max(k,0)
        for b in rep_base_offices({'office':o or ''}):k=max(k,rm.get(b,REP_DEFAULT_RANKS.get(b,0)))
    if is_master:k=max(k,0)
    return k

def greet_bcc_province(m,own=''):
    # Κρυφή κοινοποίηση: Γραμματεία και ΕπΜΔ κάθε Επαρχίας στην οποία ανήκουν οι (μη διαγραμμένες) Στοές του μέλους
    by_no={_lodge_no_key(l['number']):l for l in _lodges_all()};out=[]
    for l in m.get('lodges',[]):
        if 'ΔΙΑΓΡΑΦ' in (l.get('member_status') or '').upper():continue
        p=province_by_short((by_no.get(_lodge_no_key(l.get('lodge_number') or '')) or {}).get('provincial') or '')
        if not p:continue
        for e in [p.get('email') or '',province_roles(p)[0]['email']]:
            if e and EMAIL_RE.match(e) and e.lower()!=own.lower() and e not in out:out.append(e)
    return out

def greet_fill(t,m,rk,label,d):
    return (t.replace('{Προσφώνηση}',GREET_VOC[rk+1]).replace('{Τίτλος}',GREET_TITLE[rk+1]).replace('{Όνομα}',m.get('first_name') or '')
             .replace('{Επώνυμο}',m.get('surname') or '').replace('{Εορτή}',label or '').replace('{Ημερομηνία}',day_str(d)))

GREET_PLAQUE=('<table width="100%" cellpadding="0" cellspacing="0" style="border:6px ridge #c9a54e;border-collapse:separate;margin:0 0 26px"><tr><td bgcolor="#14234a" align="center" style="background-color:#14234a;padding:6px">'
  '<table width="100%" cellpadding="0" cellspacing="0" bgcolor="#14234a" style="border:1px solid #c9a54e;border-collapse:separate;background-color:#14234a"><tr><td align="center" bgcolor="#14234a" style="padding:12px 10px 12px;text-align:center;background-color:#14234a">'
  '<div style="color:#c9a54e;font-size:12px;letter-spacing:8px">✦ ✦ ✦</div>'
  '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:27px;font-weight:bold;letter-spacing:5px;line-height:1.3;color:#f0d78c;margin-top:4px">ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ</div>'
  '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:20px;font-weight:bold;letter-spacing:8px;line-height:1.4;color:#f0d78c">ΤΗΣ ΕΛΛΑΔΟΣ</div>'
  '<div style="color:#c9a54e;font-size:12px;letter-spacing:8px;margin-top:4px">✦ ✦ ✦</div></td></tr></table></td></tr></table>')

def greet_html(text):
    # Επικεφαλίδα «Εθνική Μεγάλη Στοά της Ελλάδος», «Προς», στοιχισμένες παράγραφοι, υπογραφή δεξιά· το όνομα του ΜΔ με έντονα
    ps=[p for p in re.split(r'\n{2,}',html.escape(text.strip()))];last=len(ps)-1;out=[]
    for i,p in enumerate(ps):
        p=p.replace('Σεβτ. Αδ. Ιωάννη Μπενετάτου','<b style="color:#1f3f8f">Σεβτ. Αδ. Ιωάννη Μπενετάτου</b>')
        br=p.replace('\n','<br>')
        if re.match(r'^Προς(\s|:)',p):
            who=re.sub(r'^Προς\s*:?\s*','',br)
            out.append(f'<p style="margin:0 0 20px;font-size:18px"><span style="font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#7a6a3a">Προς</span><br><b style="color:#1d2f5e">{who}</b></p>')
        elif i==last and last>1:
            t,*rest=p.split('\n')
            out.append(f'<p style="margin:30px 0 0;text-align:right;line-height:1.5">'+(f'<span style="font-style:italic;color:#4a5068">{t}</span><br><b>{"<br>".join(rest)}</b>' if rest else t)+'</p>')
        else:
            out.append(f'<p style="margin:0 0 14px;{"" if p.startswith("Αγαπητ") else "text-align:justify"}">{br}</p>')
    return f'<div style="max-width:620px;margin:0 auto;font-family:Georgia,\'Times New Roman\',serif;color:#1b1f2a;font-size:16px;line-height:1.6">{GREET_PLAQUE}{"".join(out)}</div>'

def greet_crest():
    # Θυρεός ως PNG για επισύναψη
    try:
        im=PILImage.open(BytesIO(_raw_asset('header_emblem.png'))).convert('RGBA');b=BytesIO();im.save(b,'PNG')
        return ('thyreos-emste.png',b.getvalue(),'image/png')
    except Exception:return None

def log_greeting(m,feast_date,feast,email,subject,bcc,source='app'):
    with con() as c:
        c.execute('INSERT INTO greetings_log(member_id,registry_no,feast_date,feast,name,email,subject,bcc,sent_on,sent_at,source) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                  (m['id'],m.get('registry_no'),feast_date,feast,f"{m['surname']} {m['first_name']}",email,subject,', '.join(bcc),date.today().isoformat(),datetime.now().isoformat(timespec='seconds'),source))

def namedays_banner_html(u):
    # Στην αρχική: εορτάζοντες σήμερα και τις επόμενες 7 ημέρες
    if not isadmin(u):return ''
    try:
        t=date.today();gs=celebrants(t.isoformat(),(t+timedelta(days=7)).isoformat())
    except Exception:return ''
    if not gs:return ''
    by={}
    for g in gs:x=by.setdefault(g['date'],[0,[]]);x[0]+=len(g['members']);x[1].append(g['label'])
    def nm(d):
        k=(date.fromisoformat(d)-t).days
        return 'Σήμερα' if k==0 else 'Αύριο' if k==1 else 'Μεθαύριο' if k==2 else day_str(d)[:-5]
    parts=' · '.join(f'<b>{esc(nm(d))}</b> {n} {"μέλος" if n==1 else "μέλη"} <span class="muted">({esc(", ".join(ls))})</span>' for d,(n,ls) in sorted(by.items()))
    return f'<div class="card noprint" style="border-left:5px solid #b18a43">🎉 <b>Εορτάζοντες:</b> {parts} <a class="btn" href="/namedays" style="margin-left:8px">Εορτολόγιο &amp; ευχές</a></div>'
