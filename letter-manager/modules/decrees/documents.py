# Διατάγματα — αυτοτελή έγγραφα: νέο, αρχείο, επεξεργασία, «Έτοιμο», PDF, διαγραφή.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

# Standalone Decree Documents — separate from letter workflow

def _decree_docs_init():
    with con() as c:
        c.executescript("""CREATE TABLE IF NOT EXISTS decree_documents(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        decree_no INTEGER NOT NULL,
        decree_year INTEGER NOT NULL,
        decree_date TEXT NOT NULL,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        matter TEXT DEFAULT '',
        rules TEXT DEFAULT '{}',
        appointments TEXT DEFAULT '[]',
        recipient_name TEXT DEFAULT '',
        recipient_email TEXT DEFAULT '',
        status TEXT DEFAULT 'draft',
        created_by TEXT,
        edit_session TEXT,
        created_at TEXT,
        updated_at TEXT
        );
        CREATE UNIQUE INDEX IF NOT EXISTS ux_decree_documents_no ON decree_documents(decree_year,decree_no);
        CREATE INDEX IF NOT EXISTS ix_decree_documents_date ON decree_documents(decree_date);
        CREATE INDEX IF NOT EXISTS ix_decree_documents_subject ON decree_documents(subject);""")
        # Decree is not a letter template anymore.
        c.execute("UPDATE letter_templates SET active=0 WHERE name='ΔΙΑΤΑΓΜΑΤΑ'")
        # One-time migration of legacy decree records that were incorrectly stored as letters.
        legacy=c.execute("""SELECT d.id AS decree_id,d.decree_no,d.decree_year,d.matter,d.rules,d.appointments,
        d.created_at AS d_created,d.updated_at AS d_updated,
        l.letter_date,l.subject,l.body,l.recipient_name,l.recipient_email,l.status,l.created_by,l.edit_session
        FROM decrees d LEFT JOIN letters l ON l.id=d.letter_id ORDER BY d.id""").fetchall()
        for rr in legacy:
            r=dict(rr)
            dd=r.get('letter_date') or f"{r['decree_year']}-01-01"
            subject=r.get('subject') or f"ΔΙΑΤΑΓΜΑ υπ’ αριθμ. {r['decree_no']}/{r['decree_year']} – {r.get('matter') or ''}"
            body=r.get('body') or ''
            c.execute("""INSERT INTO decree_documents(
                id,decree_no,decree_year,decree_date,subject,body,matter,rules,appointments,
                recipient_name,recipient_email,status,created_by,edit_session,created_at,updated_at
            ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING""",
            (r['decree_id'],r['decree_no'],r['decree_year'],dd,subject,body,r.get('matter') or '',
             r.get('rules') or '{}',r.get('appointments') or '[]',r.get('recipient_name') or '',
             r.get('recipient_email') or '',r.get('status') or 'draft',r.get('created_by') or '',
             r.get('edit_session') or '',r.get('d_created') or now(),r.get('d_updated') or now()))
        c.commit()

_decree_docs_init()

# Always keep decrees out of the normal letter template picker.
_templates_with_legacy_decree=templates_for

def templates_for(u):
    return [x for x in _templates_with_legacy_decree(u) if x.get('name')!='ΔΙΑΤΑΓΜΑΤΑ']

def _d2_get(did):
    with con() as c:r=c.execute('SELECT * FROM decree_documents WHERE id=?',(did,)).fetchone()
    return dict(r) if r else None

def _d2_next(c):
    n=int(c.execute('SELECT COALESCE(MAX(decree_no),0) n FROM decree_documents').fetchone()['n'])
    return max(n+1,513)

def _d2_meta(d):
    return _dmeta(d)

def _d2_subject(no,yr,matter):
    return f"ΔΙΑΤΑΓΜΑ υπ’ αριθμ. {no}/{yr} – {matter}"

def _d2_email_list(apps):
    out=[]
    for a in apps:
        em=(a.get('email') or '').strip()
        if em and em.lower() not in [x.lower() for x in out]:out.append(em)
    return out

def _d2_sig_html():
    return """<div class="decsig">
    <div><div class="t">ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ</div><img class="signature-img" src="/clean/signature_original.png"><div class="signature-line"></div><b>Δημήτριος Σκιαδόπουλος</b></div>
    <div><img class="seal-img" src="/clean/seal_original.png"></div>
    <div><div class="t">Ο ΜΕΓΑΣ ΔΙΔΑΣΚΑΛΟΣ</div><img class="signature-img" src="/decree-asset/gm"><div class="signature-line"></div><b>Ιωάννης Μπενετάτος</b></div>
    </div>"""

def _d2_css():
    return """<style>
    #decree-form.service-award-mode .service-hide{display:none!important}
    .decree-banner{background:#fff8e9;border:1px solid #d7bc83;padding:12px 14px;border-radius:10px;margin-bottom:16px}
    .decree-banner b{color:#6e4e13}.dec-title{text-align:center;font:900 21px Georgia,'Times New Roman',serif;letter-spacing:1.6px;margin:9mm 0 1mm}
    .dec-no{text-align:center;font-weight:bold;font-size:13pt;margin-bottom:2mm}.dec-date{text-align:center;font-size:10.5pt;margin-bottom:6mm}
    .decbody{white-space:pre-wrap;line-height:1.5;color:#111;text-align:center}
    .decsig{display:grid;grid-template-columns:1fr 48mm 1fr;gap:7mm;text-align:center;align-items:start;margin-top:10mm}
    .decsig .t{font-weight:900;margin-bottom:2mm}.decsig .signature-img{height:18mm}.decsig .seal-img{margin:auto}
    @media(max-width:800px){.decsig{grid-template-columns:1fr}}
    </style>"""

@app.get('/decrees/new')
def decree2_new(req:Request,copy_from:int=0,action:str='appoint'):
    u=need(req);matter='';apps=[];action=action if action in {'appoint','award','service_award'} else 'appoint';award_office='';active_office='';period=f"{date.today().year} - {date.today().year+1}"
    if copy_from:
        d=_d2_get(copy_from)
        if d:
            matter=d.get('matter') or ''
            meta=_d2_meta(d);action=meta['action'];award_office=meta['award_office'];active_office=meta.get('decree_office') or '';period=meta['period'] or period
            try:apps=json.loads(d.get('appointments') or '[]')
            except:apps=[]
            if action=='appoint' and not active_office and apps:active_office=apps[0].get('office','')
    with con() as c:n=_d2_next(c)
    rows=''.join(_row(a) for a in apps) if apps else _row()
    return page(_d2_css()+f"""<h1>Νέο Διάταγμα</h1>
    <div class="decree-banner"><b>Ξεχωριστό αρχείο Διαταγμάτων.</b> Το Διάταγμα δεν δημιουργεί επιστολή και δεν καταχωρίζεται στο Αρχείο Επιστολών.</div>
    <div class="card"><b>Επόμενος αριθμός Διατάγματος: <span class="official-number">{n}/{date.today().year}</span></b><div style="margin-top:14px">{_decree_info_tables()}</div></div>
    <form id="decree-form" class="{'service-award-mode' if action=='service_award' else ''}" method="post" action="/decrees/new">
    <div class="card"><div class="grid"><div><label>Πράξη Διατάγματος</label><select name="decree_action" id="decree_action" onchange="toggleDecreeMode()" required><option value="appoint" {'selected' if action=='appoint' else ''}>ΔΙΟΡΙΖΟΜΕΝ</option><option value="award" {'selected' if action=='award' else ''}>ΑΠΟΝΕΜΕΙ</option><option value="service_award" {'selected' if action=='service_award' else ''}>ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ</option></select></div><div id="matter-wrap" class="service-hide"><label>Περί</label><input name="matter" id="matter" value="{esc(matter)}" required></div></div></div>
    <div class="card service-hide" id="decree-office-card" style="{'display:none' if action=='service_award' else ''}"><label id="decree_office_label">{'Πρώην Μέγας Αξιωματικός' if action=='award' else 'Ενεργός Μέγας Αξιωματικός'}</label><select name="decree_office" id="decree_office" data-mode="{action}" required>{("<option value=''>— Επιλογή πρώην Μεγάλου Αξιωματικού —</option>"+_award_opts(award_office)) if action=='award' else ("<option value=''>— Επιλογή ενεργού αξιώματος —</option>"+_opts(active_office))}</select></div>
    <div class="card service-hide" id="period-card" style="{'display:none' if action!='appoint' else ''}"><label>Τεκτονική Περίοδος</label><input id="masonic_period" name="masonic_period" value="{esc(period)}" placeholder="2026 - 2027"></div>
    <div class="card" id="service-award-fixed-text" style="{'display:block' if action=='service_award' else 'display:none'}">
      <h3 style="margin-top:0">Σταθερό κείμενο — Τάξις του Μεγάλου Διδασκάλου</h3>
      <div style="white-space:pre-line;line-height:1.55;text-align:center"><b>ΗΜΕΙΣ</b>
Ο Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος,
Σεβασμιώτατος Αδελφός Ιωάννης Μπενετάτος

λαβόντες υπ’ όψιν τον Κανόνα 19 του Βιβλίου Γενικών Νόμων και Κανονισμών,

<b>ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ</b>

<b>την Τάξιν του Μεγάλου Διδασκάλου</b>

δι’ Υπηρεσίας προς την Τεκτονικήν</div>
      <p style="margin-bottom:0"><b>Δεν απαιτείται αξίωμα, τίτλος Μεγάλου Αξιωματικού ή Τεκτονική Περίοδος.</b> Στο τελικό Διάταγμα εισάγονται αυτομάτως μόνον τα στοιχεία του Αδελφού που επιλέγεται κατωτέρω.</p>
    </div>
    <div class="card"><b>Στοιχεία Αδελφού:</b> Η αναζήτηση γίνεται από το Μητρώο Μελών. Τα πεδία «Όνομα στο Διάταγμα» και «Επώνυμο στο Διάταγμα» χρησιμοποιούνται αποκλειστικά για τη σωστή μορφή του Διατάγματος.</div>
    <h2 id="people-heading">{'Στοιχεία Αδελφού που θα λάβει την Τάξη του Μεγάλου Διδασκάλου' if action=='service_award' else ('Αδελφοί προς Απονομή' if action=='award' else 'Διοριζόμενοι Αδελφοί')}</h2>
    <div id="people">{rows}</div>
    <div class="toolbar"><button type="button" onclick="addPerson()">+ Προσθήκη Αδελφού</button><button class="primary">Έκδοση Διατάγματος</button><a class="btn" href="/decrees/archive">Αρχείο Διαταγμάτων</a></div>
    </form>{_dec_js()}""",u,'Νέο Διάταγμα')

@app.post('/decrees/new')
async def decree2_create(req:Request):
    u=need(req);f=await req.form();matter=str(f.get('matter','')).strip();action=str(f.get('decree_action','appoint')).strip();decree_office=str(f.get('decree_office','')).strip();active_office=decree_office if action=='appoint' else '';award_office=decree_office if action=='award' else '';period=str(f.get('masonic_period','')).strip()
    if action not in {'appoint','award','service_award'}:raise HTTPException(400,'Μη έγκυρη πράξη Διατάγματος.')
    if action=='service_award':matter='Απονομή της Τάξεως του Μεγάλου Διδασκάλου δι’ Υπηρεσίας προς την Τεκτονικήν'
    if not f.getlist('first_name'):raise HTTPException(400,'Συμπληρώστε τουλάχιστον έναν Αδελφό.')
    if action!='service_award' and not matter:raise HTTPException(400,'Συμπληρώστε το «Περί».')
    if action=='award' and award_office not in AWARD_MAP:raise HTTPException(400,'Επιλέξτε Πρώην Αξίωμα.')
    if action=='appoint' and active_office not in DEC_MAP:raise HTTPException(400,'Επιλέξτε ενεργό Αξίωμα.')
    if action=='appoint' and not period:raise HTTPException(400,'Συμπληρώστε την Τεκτονική Περίοδο.')
    with con() as c:
        pseq,_py,pno=nextprot(c,'Διάταγμα',matter)
        apps=_apps_from_form(f,c,action,active_office)
        dn=_d2_next(c);dy=date.today().year;dd=date.today().isoformat();body,rules=_body(matter,apps,None,action,award_office,period)
        sub=_d2_subject(dn,dy,matter);tos=_d2_email_list(apps);ts=now();edit_session=current_edit_session(req,u) if isauthorised(u) else None
        meta={'rules':rules,'action':action,'award_office':award_office if action=='award' else '','decree_office':active_office if action=='appoint' else '','period':period if action=='appoint' else ''}
        cur=c.execute("""INSERT INTO decree_documents(decree_no,decree_year,decree_date,subject,body,matter,rules,appointments,recipient_name,recipient_email,status,created_by,edit_session,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        (dn,dy,dd,sub,body,matter,json.dumps(meta,ensure_ascii=False),json.dumps(apps,ensure_ascii=False),', '.join(a['full_name'] for a in apps),', '.join(tos),'draft',u['email'],edit_session,ts,ts))
        did=cur.lastrowid
        c.execute('UPDATE decree_documents SET protocol_seq=?,protocol_no=? WHERE id=?',(pseq,pno,did))
        if action!='service_award':_sync_decree_offices(c,did,dn,dy,meta,apps)
        c.commit()
    return RedirectResponse(f'/decrees/{did}',303)

@app.get('/decrees/archive')
def decree2_archive(req:Request,q:str='',date_from:str='',date_to:str=''):
    u=need(req);w=[];p=[]
    if q:
        if q.isdigit():
            w.append('(decree_no=? OR subject LIKE ? OR matter LIKE ? OR recipient_name LIKE ?)')
            v=f'%{q}%';p += [int(q),v,v,v]
        else:
            w.append('(subject LIKE ? OR matter LIKE ? OR recipient_name LIKE ? OR recipient_email LIKE ?)')
            v=f'%{q}%';p += [v,v,v,v]
    if date_from:w.append('decree_date>=?');p.append(date_from)
    if date_to:w.append('decree_date<=?');p.append(date_to)
    sql='SELECT * FROM decree_documents'+((' WHERE '+' AND '.join(w)) if w else '')+' ORDER BY decree_year DESC,decree_no DESC LIMIT 500'
    with con() as c:xs=[dict(r) for r in c.execute(sql,p)]
    rows=[]
    for d in xs:
        did=int(d['id']);editable=can_edit_letter(req,u,d)
        edit=(f" · <a href='/decrees/{did}/edit'>Edit</a>" if editable else '')
        delete=(f"""<form method="post" action="/decrees/{did}/delete" style="display:inline" onsubmit="return confirm('Οριστική διαγραφή του Διατάγματος;');"><button class="btn" style="margin-left:6px">Delete</button></form>""" if isadmin(u) else '')
        actions=f"<a href='/decrees/{did}'>Άνοιγμα</a>{edit} · <a href='/decrees/new?copy_from={did}'>Νέο πάνω σε αυτό</a>{delete}"
        rows.append(f"<tr><td class='official-number'>{d['decree_no']}/{d['decree_year']}</td><td class='official-number'>{esc(d['decree_date'])}</td><td>{esc(d['matter'])}</td><td>{esc(d['recipient_name'])}</td><td>{actions}</td></tr>")
    table=''.join(rows) or '<tr><td colspan=5>Δεν βρέθηκαν Διατάγματα.</td></tr>'
    return page(f"""<div class="hero"><div><h1>Αρχείο Διαταγμάτων</h1><p>Ανεξάρτητο από το Αρχείο Επιστολών.</p></div><a class="btn primary" href="/decrees/new">+ Νέο Διάταγμα</a></div>
    <form class="filters"><input name="q" value="{esc(q)}" placeholder="Αριθμός, περί, όνομα"><input type="date" name="date_from" value="{esc(date_from)}"><input type="date" name="date_to" value="{esc(date_to)}"><button>Αναζήτηση</button></form>
    <div class="card"><table><tr><th>Αρ. Διατάγματος</th><th>Ημερομηνία</th><th>Περί</th><th>Αδελφοί</th><th>Ενέργειες</th></tr>{table}</table></div>""",u,'Αρχείο Διαταγμάτων')

@app.get('/decrees/{did}/edit')
def decree2_edit(req:Request,did:int):
    u=need(req);d=_d2_get(did)
    if not d:raise HTTPException(404)
    if not can_edit_letter(req,u,d):raise HTTPException(403,'Το αρχειοθετημένο Διάταγμα είναι μόνο για προβολή.')
    meta=_d2_meta(d);action=meta['action'];award_office=meta['award_office'];active_office=meta.get('decree_office') or '';period=meta['period'] or f"{d['decree_year']} - {int(d['decree_year'])+1}"
    try:apps=json.loads(d.get('appointments') or '[]')
    except:apps=[]
    if action=='appoint' and not active_office and apps:active_office=apps[0].get('office','')
    rows=''.join(_row(a) for a in apps) if apps else _row()
    return page(_d2_css()+f"""<h1>Επεξεργασία Διατάγματος <span class="official-number">{d['decree_no']}/{d['decree_year']}</span></h1>
    <div class="decree-banner"><b>Ανεξάρτητο Διάταγμα.</b> Δεν επηρεάζει καμία επιστολή.</div>
    <form id="decree-form" class="{'service-award-mode' if action=='service_award' else ''}" method="post" action="/decrees/{did}/edit">
    <div class="card"><div class="grid"><div><label>Πράξη Διατάγματος</label><select name="decree_action" id="decree_action" onchange="toggleDecreeMode()" required><option value="appoint" {'selected' if action=='appoint' else ''}>ΔΙΟΡΙΖΟΜΕΝ</option><option value="award" {'selected' if action=='award' else ''}>ΑΠΟΝΕΜΕΙ</option><option value="service_award" {'selected' if action=='service_award' else ''}>ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ</option></select></div><div id="matter-wrap" class="service-hide"><label>Περί</label><input name="matter" id="matter" value="{esc(d.get('matter') or '')}" required></div></div></div>
    <div class="card service-hide" id="decree-office-card" style="{'display:none' if action=='service_award' else ''}"><label id="decree_office_label">{'Πρώην Μέγας Αξιωματικός' if action=='award' else 'Ενεργός Μέγας Αξιωματικός'}</label><select name="decree_office" id="decree_office" data-mode="{action}" required>{("<option value=''>— Επιλογή πρώην Μεγάλου Αξιωματικού —</option>"+_award_opts(award_office)) if action=='award' else ("<option value=''>— Επιλογή ενεργού αξιώματος —</option>"+_opts(active_office))}</select></div>
    <div class="card service-hide" id="period-card" style="{'display:none' if action!='appoint' else ''}"><label>Τεκτονική Περίοδος</label><input id="masonic_period" name="masonic_period" value="{esc(period)}"></div>
    <div class="card" id="service-award-fixed-text" style="{'display:block' if action=='service_award' else 'display:none'}">
      <h3 style="margin-top:0">Σταθερό κείμενο — Τάξις του Μεγάλου Διδασκάλου</h3>
      <div style="white-space:pre-line;line-height:1.55;text-align:center"><b>ΗΜΕΙΣ</b>
Ο Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος,
Σεβασμιώτατος Αδελφός Ιωάννης Μπενετάτος

λαβόντες υπ’ όψιν τον Κανόνα 19 του Βιβλίου Γενικών Νόμων και Κανονισμών,

<b>ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ</b>

<b>την Τάξιν του Μεγάλου Διδασκάλου</b>

δι’ Υπηρεσίας προς την Τεκτονικήν</div>
      <p style="margin-bottom:0"><b>Δεν απαιτείται αξίωμα, τίτλος Μεγάλου Αξιωματικού ή Τεκτονική Περίοδος.</b> Στο τελικό Διάταγμα εισάγονται αυτομάτως μόνον τα στοιχεία του Αδελφού που επιλέγεται κατωτέρω.</p>
    </div>
    <h2 id="people-heading">{'Στοιχεία Αδελφού που θα λάβει την Τάξη του Μεγάλου Διδασκάλου' if action=='service_award' else ('Αδελφοί προς Απονομή' if action=='award' else 'Διοριζόμενοι Αδελφοί')}</h2>
    <div id="people">{rows}</div>
    <div class="toolbar"><button type="button" onclick="addPerson()">+ Προσθήκη Αδελφού</button><button class="primary">Αποθήκευση Διατάγματος</button><a class="btn" href="/decrees/{did}">Ακύρωση</a></div>
    </form>{_dec_js()}""",u,'Επεξεργασία Διατάγματος')

@app.post('/decrees/{did}/edit')
async def decree2_edit_save(req:Request,did:int):
    u=need(req);d=_d2_get(did)
    if not d:raise HTTPException(404)
    if not can_edit_letter(req,u,d):raise HTTPException(403,'Το αρχειοθετημένο Διάταγμα είναι μόνο για προβολή.')
    f=await req.form();matter=str(f.get('matter','')).strip();action=str(f.get('decree_action','appoint')).strip();decree_office=str(f.get('decree_office','')).strip();active_office=decree_office if action=='appoint' else '';award_office=decree_office if action=='award' else '';period=str(f.get('masonic_period','')).strip()
    if action not in {'appoint','award','service_award'}:raise HTTPException(400,'Μη έγκυρη πράξη Διατάγματος.')
    if action=='service_award':matter='Απονομή της Τάξεως του Μεγάλου Διδασκάλου δι’ Υπηρεσίας προς την Τεκτονικήν'
    if not f.getlist('first_name'):raise HTTPException(400,'Συμπληρώστε τουλάχιστον έναν Αδελφό.')
    if action!='service_award' and not matter:raise HTTPException(400,'Συμπληρώστε το «Περί».')
    if action=='award' and award_office not in AWARD_MAP:raise HTTPException(400,'Επιλέξτε Πρώην Αξίωμα.')
    if action=='appoint' and active_office not in DEC_MAP:raise HTTPException(400,'Επιλέξτε ενεργό Αξίωμα.')
    if action=='appoint' and not period:raise HTTPException(400,'Συμπληρώστε την Τεκτονική Περίοδο.')
    with con() as c:
        apps=_apps_from_form(f,c,action,active_office)
        body,rules=_body(matter,apps,d['decree_date'],action,award_office,period);sub=_d2_subject(d['decree_no'],d['decree_year'],matter);tos=_d2_email_list(apps);ts=now()
        meta={'rules':rules,'action':action,'award_office':award_office if action=='award' else '','decree_office':active_office if action=='appoint' else '','period':period if action=='appoint' else ''}
        c.execute("""UPDATE decree_documents SET subject=?,body=?,matter=?,rules=?,appointments=?,recipient_name=?,recipient_email=?,updated_at=? WHERE id=?""",
        (sub,body,matter,json.dumps(meta,ensure_ascii=False),json.dumps(apps,ensure_ascii=False),', '.join(a['full_name'] for a in apps),', '.join(tos),ts,did))
        if action=='service_award':c.execute('DELETE FROM member_degrees_offices WHERE decree_id=?',(did,))
        else:_sync_decree_offices(c,did,d['decree_no'],d['decree_year'],meta,apps)
        c.commit()
    return RedirectResponse(f'/decrees/{did}',303)

@app.post('/decrees/{did}/ready')
def decree2_ready(req:Request,did:int):
    u=need(req);d=_d2_get(did)
    if not d:raise HTTPException(404)
    if not can_edit_letter(req,u,d):raise HTTPException(403)
    with con() as c:c.execute("UPDATE decree_documents SET status='ready',updated_at=? WHERE id=?",(now(),did))
    return drive_on_ready(RedirectResponse(f'/decrees/{did}',303),'decree',did,req,'ready')

@app.post('/decrees/{did}/delete')
def decree2_delete(req:Request,did:int):
    u=need(req)
    if not isadmin(u):raise HTTPException(403,'Μόνον ο administrator μπορεί να διαγράψει Διάταγμα.')
    d=_d2_get(did)
    if not d:raise HTTPException(404)
    with con() as c:
        c.execute('DELETE FROM member_degrees_offices WHERE decree_id=?',(did,))
        c.execute('DELETE FROM decree_documents WHERE id=?',(did,));c.commit()
    return RedirectResponse('/decrees/archive',303)

@app.get('/decrees/{did}/pdf')
def decree2_pdf(req:Request,did:int):
    need(req);d=_d2_get(did)
    if not d:raise HTTPException(404)
    s=settings();regular,bold=_pdf_fonts();b=BytesIO();doc=SimpleDocTemplate(b,pagesize=A4,leftMargin=15*mm,rightMargin=15*mm,topMargin=10*mm,bottomMargin=14*mm,title=d['subject'])
    cen=ParagraphStyle('d2cen',fontName=regular,fontSize=10.5,leading=13,alignment=1);org=ParagraphStyle('d2org',parent=cen,fontName=bold,fontSize=18,leading=21);sty=ParagraphStyle('d2body',fontName=regular,fontSize=10.5,leading=14);story=[]
    try:story.append(RLImage(BytesIO(_raw_asset('header_emblem.png')),width=34*mm,height=23*mm))
    except:pass
    story += [Paragraph(html.escape(s['organization_name']),org),Paragraph('Έτος Ιδρύσεως '+html.escape(s['founded_year']),cen),HRFlowable(width='100%',thickness=.8,color=colors.HexColor('#B18A43'),spaceBefore=5,spaceAfter=7),
              Paragraph('ΔΙΑΤΑΓΜΑ',ParagraphStyle('d2title',parent=cen,fontName=bold,fontSize=15,spaceBefore=10)),
              Paragraph(('υπ’ αριθ. ' if _d2_meta(d).get('action')=='service_award' else 'υπ’ αριθμ. ')+str(d['decree_no'])+'/'+str(d['decree_year']),ParagraphStyle('d2no',parent=cen,fontName=bold,fontSize=11.5,spaceAfter=3)),
              Paragraph(datetime.fromisoformat(d['decree_date']).strftime('%d/%m/%Y'),cen),Spacer(1,4*mm)]
    for line in d['body'].splitlines():
        story.append(Spacer(1,2*mm) if not line.strip() else Paragraph(html.escape(line),ParagraphStyle('d2l'+str(len(story)),parent=sty,alignment=1,fontName=bold) if line.strip() in {'ΗΜΕΙΣ','ΔΙΟΡΙΖΟΜΕΝ','ΑΠΟΝΕΜΕΙ','ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ'} else sty))
    story.append(Spacer(1,7*mm))
    def col(title,name,img,clean=False):
        q=[Paragraph(title,ParagraphStyle('d2st'+name,parent=cen,fontName=bold,fontSize=9))]
        try:q.append(RLImage(BytesIO(_clean_asset(img,'white') if clean else _raw_asset(img)),width=46*mm,height=16*mm))
        except:q.append(Spacer(1,16*mm))
        q += [HRFlowable(width=48*mm,thickness=.6,color=colors.HexColor('#123B7A')),Paragraph(name,ParagraphStyle('d2sn'+name,parent=cen,fontName=bold,fontSize=9))]
        return q
    try:seal=[RLImage(BytesIO(_clean_asset('seal_original.png','black')),width=40*mm,height=40*mm)]
    except:seal=[Spacer(1,40*mm)]
    t=Table([[col('ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ','Δημήτριος Σκιαδόπουλος','signature_original.png',True),seal,col('Ο ΜΕΓΑΣ ΔΙΔΑΣΚΑΛΟΣ','Ιωάννης Μπενετάτος','signature_grand_master.png')]],colWidths=[62*mm,46*mm,62*mm])
    t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('ALIGN',(0,0),(-1,-1),'CENTER')]));story.append(t);doc.build(story)
    safe=re.sub(r'[\\/:*?"<>|\r\n\t]+',' ',str(d.get('matter') or '')).strip();safe=re.sub(r'\s+',' ',safe)
    fn=f"ΔΙΑΤΑΓΜΑ-{d['decree_no']}-{d['decree_year']}{('-'+safe) if safe else ''}.pdf"
    return Response(b.getvalue(),media_type='application/pdf',headers={'Content-Disposition':"attachment; filename*=UTF-8''"+quote(fn)})

@app.get('/decrees/{did}')
def decree2_view(req:Request,did:int):
    u=need(req);d=_d2_get(did)
    if not d:raise HTTPException(404)
    s=settings()
    try:apps=json.loads(d['appointments'] or '[]')
    except:apps=[]
    to=','.join(a.get('email','') for a in apps if a.get('email'));cc=','.join(DEGREE_CC)
    gmail='https://mail.google.com/mail/u/?authuser='+quote(s['sender_email'])+'&view=cm&fs=1&to='+quote(to)+'&cc='+quote(cc)+'&su='+quote(d['subject'])+'&body='+quote(d['body'])
    wa='https://wa.me/?text='+quote(f"Παρακαλώ να ελέγξετε το email σας και στα spam.\n\nΔΙΑΤΑΓΜΑ υπ’ αριθμ. {d['decree_no']}/{d['decree_year']}\n{d['matter']}")
    editable=can_edit_letter(req,u,d)
    ready='' if (d['status']=='ready' or not editable) else f'<form method="post" action="/decrees/{did}/ready"><button>Σήμανση ως έτοιμο</button></form>'
    edit_link=f'<a class="btn" href="/decrees/{did}/edit">Επεξεργασία Διατάγματος</a>' if editable else ''
    tools=f"""<section class="card send-panel noprint"><h3>Διάταγμα — Αποστολή & Αποθήκευση</h3><div class="toolbar"><a class="btn primary" href="/decrees/{did}/pdf">⬇ Λήψη PDF Διατάγματος</a><a class="btn" target="_blank" href="{gmail}">✉ Αποστολή με Email</a><a class="btn" target="_blank" href="{wa}">WhatsApp μήνυμα</a>{ready}</div><p class="send-help">Αυτό είναι ξεχωριστό PDF Διατάγματος και δεν αποτελεί PDF επιστολής.</p>{drive_status_html('decree',did,u)}</section><div class="toolbar noprint">{edit_link}<a class="btn" href="/decrees/new?copy_from={did}">Νέο Διάταγμα πάνω σε αυτό</a><a class="btn" href="/decrees/archive">Αρχείο Διαταγμάτων</a><button onclick="print()">Εκτύπωση</button></div>"""
    paper=f"""<article class="paper"><div class="head"><img src="/asset/header_emblem.png"><h1>{esc(s['organization_name'])}</h1><div class="gold">Έτος Ιδρύσεως {esc(s['founded_year'])}</div><div>{esc(s['grand_master_title'])}</div><div>{esc(s['grand_master_name'])}</div><div class="rule"></div></div>
    <div class="dec-title">ΔΙΑΤΑΓΜΑ</div><div class="dec-no official-number">{'υπ’ αριθ. ' if _d2_meta(d).get('action')=='service_award' else 'υπ’ αριθμ. '}{d['decree_no']}/{d['decree_year']}</div>
    <div class="dec-date official-number">{datetime.fromisoformat(d['decree_date']).strftime('%d/%m/%Y')}</div>
    <div class="decbody">{esc(d['body'])}</div>{_d2_sig_html()}</article>"""
    return page(_d2_css()+tools+paper,u,d['subject'])

# Compatibility redirects for old decree links. New decrees never use letter IDs.
@app.middleware('http')
async def standalone_decree_redirects(request,call_next):
    path=request.url.path
    if path=='/decree':
        return RedirectResponse('/decrees/new',307 if request.method=='POST' else 303)
    if request.method=='POST':
        m=re.fullmatch(r'/decree/edit/(\d+)',path)
        if m:
            with con() as c:r=c.execute('SELECT id FROM decrees WHERE letter_id=?',(int(m.group(1)),)).fetchone()
            if r:return RedirectResponse(f"/decrees/{r['id']}/edit",307)
    if request.method=='GET':
        m=re.fullmatch(r'/letter/(\d+)',path)
        if m:
            with con() as c:r=c.execute('SELECT id FROM decrees WHERE letter_id=?',(int(m.group(1)),)).fetchone()
            if r:return RedirectResponse(f"/decrees/{r['id']}",303)
        m=re.fullmatch(r'/pdf/(\d+)',path)
        if m:
            with con() as c:r=c.execute('SELECT id FROM decrees WHERE letter_id=?',(int(m.group(1)),)).fetchone()
            if r:return RedirectResponse(f"/decrees/{r['id']}/pdf",303)
        m=re.fullmatch(r'/decree/edit/(\d+)',path)
        if m:
            with con() as c:r=c.execute('SELECT id FROM decrees WHERE letter_id=?',(int(m.group(1)),)).fetchone()
            if r:return RedirectResponse(f"/decrees/{r['id']}/edit",303)
    return await call_next(request)
