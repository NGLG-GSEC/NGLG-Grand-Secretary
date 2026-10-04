# Διαχείριση — πρόσβαση χρηστών και ρυθμίσεις.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

@app.get('/users')
def users(req:Request):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    with con() as c:xs=[dict(r) for r in c.execute('SELECT * FROM users ORDER BY email')];ts=[dict(r) for r in c.execute('SELECT id,name FROM letter_templates WHERE active=1 ORDER BY name')]
    rows=''.join(f"<tr><td>{esc(x['email'])}</td><td>{esc(x['role'])}</td><td>{'Ναι' if x['active'] else 'Όχι'}</td></tr>" for x in xs)
    checks=''.join(f"<label><input style='width:auto' type='checkbox' name='allowed_templates' value='{t['id']}'> {esc(t['name'])}</label>" for t in ts)
    return page(f'''<h1>Πρόσβαση</h1><div class="card"><table><tr><th>Email</th><th>Ρόλος</th><th>Ενεργό</th></tr>{rows}</table></div><form class="card" method="post"><h3>Προσθήκη / αλλαγή χρήστη</h3><label>Email</label><input type="email" name="email" required><label>Ρόλος</label><select name="role"><option value="editor">Editor</option><option value="authorised">Authorised</option><option value="admin">Admin</option></select><label>Ενεργό</label><select name="active"><option value="1">Ναι</option><option value="0">Όχι</option></select><fieldset>{checks}</fieldset><button>Αποθήκευση</button></form>''',u)

@app.post('/users')
def saveuser(req:Request,email:str=Form(...),role:str=Form('editor'),active:str=Form('1'),allowed_templates:list[str]=Form(default=[])):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    e=email.strip().lower();ids=[int(x) for x in allowed_templates if x.isdigit()];ts=now()
    with con() as c:c.execute("INSERT INTO users(email,active,role,allowed_templates,created_at,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET active=excluded.active,role=excluded.role,allowed_templates=excluded.allowed_templates,updated_at=excluded.updated_at",(e,1 if active=='1' else 0,role,json.dumps(ids),ts,ts))
    return RedirectResponse('/users',303)

@app.get('/settings')
def setpage(req:Request,msg:str=''):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    s=settings();mail_keys={v['key'] for v in MAIL_SENDERS.values()}
    senders=''.join(f"""<div class="full"><label for="{v['key']}">{esc(v['label'])}</label><input type="email" id="{v['key']}" name="{v['key']}" value="{esc(sender_for(k))}" required>
<small class="muted">{esc(v['uses'])}</small></div>""" for k,v in MAIL_SENDERS.items())
    smtp_user=(os.getenv('SMTP_USERNAME') or '').strip()
    smtp_note=(f'<p class="muted">Ο διακομιστής συνδέεται για αποστολή ως <b>{esc(smtp_user)}</b>.'
               +(f' Για να εμφανίζονται τα «Γενικά εξερχόμενα» ως <b>{esc(sender_for("general"))}</b>, ο λογαριασμός αυτός πρέπει να έχει οριστεί ως «Αποστολή ως» στο {esc(smtp_user)} (Gmail → Ρυθμίσεις → Λογαριασμοί), διαφορετικά το Gmail εμφανίζει ως αποστολέα το {esc(smtp_user)}.' if smtp_login_differs() else '')+'</p>'
               if smtp_user else '<p class="muted">Η αποστολή από τον διακομιστή (SMTP) δεν έχει ρυθμιστεί.</p>')
    fields=''.join(f'<div><label>{esc(k)}</label><input name="{esc(k)}" value="{esc(v)}"></div>' for k,v in s.items() if k not in mail_keys and not k.startswith('_'))
    notice=f"<div class='card'><b>{esc(msg)}</b></div>" if msg else ''
    return page(f'''<h1>Ρυθμίσεις</h1>{notice}<form method="post"><section class="card"><h2 style="margin-top:0">✉ Λογαριασμοί αποστολής</h2>
<p>Από ποιο email φεύγει κάθε κατηγορία. Ο αποστολέας εμφανίζεται και σε κάθε οθόνη πριν την αποστολή.</p><div class="grid">{senders}</div>{smtp_note}</section>
<section class="card"><h2 style="margin-top:0">Λοιπές ρυθμίσεις</h2><div class="grid">{fields}</div></section><button class="primary">Αποθήκευση</button></form>''',u)

@app.post('/settings')
async def setsave(req:Request):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    form=await req.form();allowed=set(settings())
    for v in MAIL_SENDERS.values():
        x=str(form.get(v['key'],'')).strip()
        if v['key'] in form and not EMAIL_RE.match(x):raise HTTPException(400,f"Μη έγκυρο email για «{v['label']}»: {x}")
    with con() as c:
        for k,v in form.items():
            if k in allowed:c.execute('REPLACE INTO settings VALUES(?,?)',(k,str(v).strip() if k.startswith('mail_from_') else str(v)))
    return RedirectResponse('/settings?msg='+quote('Οι ρυθμίσεις αποθηκεύτηκαν.'),303)
