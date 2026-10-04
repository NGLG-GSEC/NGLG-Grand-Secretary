# Επιστολές — αρχική σελίδα, νέα επιστολή, προβολή, «Έτοιμη», επεξεργασία, διαγραφή, αρχείο.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

@app.get('/')
def home(req:Request):
    u=user(req)
    if not u:return RedirectResponse('/login',303)
    a=actor_key(req,u)
    if u['email'].lower()==SHARED_SECRETARIAT_EMAIL and not a:return RedirectResponse('/identity',303)
    u['_actor']=a or 'dimitrios'
    with con() as c:
        recent=[dict(x) for x in c.execute('SELECT * FROM letters WHERE id NOT IN (SELECT letter_id FROM decrees WHERE letter_id IS NOT NULL) ORDER BY id DESC LIMIT 12')]
        decree_ids={int(r['letter_id']) for r in c.execute('SELECT letter_id FROM decrees')} if recent else set()
    row_parts=[]
    for x in recent:
        lid=int(x['id'])
        edit_href=f"/decree/edit/{lid}" if lid in decree_ids else f"/edit/{lid}"
        edit_link=(f" · <a href='{edit_href}'>Edit</a>" if can_edit_letter(req,u,x) else '')
        delete_btn=(f"<form method='post' action='/delete/{lid}' style='display:inline' onsubmit=\"return confirm('Οριστική διαγραφή του εγγράφου; Η ενέργεια δεν αναιρείται.');\"><button type='submit' class='btn' style='margin-left:6px'>Delete</button></form>" if isadmin(u) else '')
        actions=f"<a href='/letter/{lid}'>Άνοιγμα</a>{edit_link}{delete_btn}"
        row_parts.append(f"<tr><td class='official-number'>{esc(x['protocol_no'])}</td><td class='official-number'>{esc(x['letter_date'])}</td><td>{esc(x['subject'])}</td><td>{esc(x['status'])}</td><td>{actions}</td></tr>")
    rows=''.join(row_parts) or '<tr><td colspan=5>Δεν υπάρχουν επιστολές.</td></tr>'
    return page(f'''<div class="hero"><div><h1>Μεγάλη Γραμματεία</h1><p>Όλη η δουλειά της Γραμματείας σε ένα σημείο — τι εκκρεμεί σε κάθε ενότητα και οι συχνές ενέργειες.</p></div><div class="toolbar"><a class="btn primary" href="/new">+ Νέα Επιστολή</a><a class="btn" href="/decrees/new">+ Νέο Διάταγμα</a></div></div>{globals().get('namedays_banner_html',lambda u:'')(u)}{globals().get('dashboard_html',lambda u:'')(u)}<div class="card"><table><tr><th>Αρ. Πρωτ.</th><th>Ημερομηνία</th><th>Θέμα</th><th>Κατάσταση</th><th>Ενέργειες</th></tr>{rows}</table></div>''',u)

@app.get('/new')
def new(req:Request,copy_from:int=0,template_id:int=0,to_name:str='',to_email:str=''):
    u=need(req);s=settings();profile=signer_profile(u.get('_actor','dimitrios'),s);tpls=templates_for(u);sub=body=rn=re='';rmid='';selected=0
    preview_sig=(f'<img class="signature-img" src="/asset/{profile["asset"]}">' if profile['key']=='nikolaos' else f'<img class="signature-img" src="/clean/{profile["asset"]}">') if asset_available(profile['asset']) else '<div style="height:22mm"></div>'
    preview_seal='<img class="seal-img" src="/clean/seal_original.png">'
    if copy_from:
        with con() as c:r=c.execute('SELECT * FROM letters WHERE id=?',(copy_from,)).fetchone()
        if r:selected=r['template_id'] or 0;sub=r['subject'];body=r['body'];rn=r['recipient_name'] or '';re=r['recipient_email'] or '';rmid=str(r['recipient_member_id'] or '')
    elif template_id and can_tpl(u,template_id):
        with con() as c:r=c.execute('SELECT * FROM letter_templates WHERE id=?',(template_id,)).fetchone()
        if r:selected=r['id'];body=r['body']
    if not copy_from and (to_name or to_email):rn=to_name.strip();re=to_email.strip()  # από τον Κατάλογο: «Επιστολή προς…»
    opts='<option value="">— Επιλογή —</option>'+''.join(f"<option value='{t['id']}' {'selected' if selected==t['id'] else ''}>{esc(t['name'])}</option>" for t in tpls)
    signer_switch=''
    if u['email'].lower() in {SHARED_SECRETARIAT_EMAIL,PRIMARY_ADMIN_EMAIL}:
        signer_switch=f'''<div class="card noprint signer-card"><b>Υπογράφων νέας επιστολής:</b> {esc(profile['name'])} — {esc(profile['title'])} <a class="btn" style="margin-left:10px" href="/identity">Αλλαγή Υπογράφοντος</a></div>'''
    return page(f'''<h1>Νέα Επιστολή</h1>{signer_switch}<form class="grid card" method="post" action="/new"><div><label>Πρότυπο / Περίπτωση</label><select name="template_id" onchange="location='/new?template_id='+this.value">{opts}</select></div><div><label>Ημερομηνία</label><input value="{date.today().strftime('%d/%m/%Y')}" disabled></div>{member_lookup_widget()}<input type="hidden" id="recipient_member_id" name="recipient_member_id" value="{esc(rmid)}"><div><label>Παραλήπτης</label><input id="recipient_name" name="recipient_name" value="{esc(rn)}"></div><div><label>Email παραλήπτη</label><input id="recipient_email" type="email" multiple name="recipient_email" value="{esc(re)}"></div><div class="full"><label>Θέμα</label><input id="subject" name="subject" value="{esc(sub)}" required></div><div class="full"><label>Κείμενο</label><textarea id="letter_body" name="body" required>{esc(body)}</textarea><small>Τα links που γράφετε ως https://... ή www.... διατηρούνται ενεργά στην προεπισκόπηση και στο PDF.</small></div><div><label>Κατάσταση</label><select name="status"><option value="draft">Πρόχειρη</option><option value="ready">Έτοιμη για αποστολή</option></select></div><div class="preview-actions" style="align-self:end"><button type="button" onclick="showPreview()">Προεπισκόπηση</button><button class="primary">Αποθήκευση & Πρωτόκολλο</button></div></form>
    <section id="previewBox" class="preview-card">
      <div class="noprint preview-actions"><button type="button" onclick="document.getElementById('previewBox').classList.remove('open')">Κλείσιμο προεπισκόπησης</button></div>
      <article class="paper">
        <div class="head"><img src="/asset/header_emblem.png"><h1>{esc(s['organization_name'])}</h1><div class="gold">Έτος Ιδρύσεως {esc(s['founded_year'])}</div><div>{esc(s['grand_master_title'])}</div><div>{esc(s['grand_master_name'])}</div><div class="rule"></div></div>
        <div class="meta"><div>Αρ. Πρωτ.: <b>θα δοθεί με την αποθήκευση</b></div><div>Ημερομηνία: <b class="official-number">{date.today().strftime('%d/%m/%Y')}</b></div></div>
        <p id="previewRecipientWrap"><b>Προς:</b> <span id="previewRecipient"></span></p>
        <p><b>Θέμα:</b> <span id="previewSubject"></span></p>
        <div class="body" id="previewBody"></div>
        <p style="margin-top:10mm">{esc(s['closing'])}</p>
        <div class="sigrow"><div class="sign">{preview_sig}<div class="signature-line"></div><b>{esc(profile['name'])}</b><br><div class="gs-title">{esc(profile['title'])}</div>{esc(s['organization_name'])}</div><div class="seal">{preview_seal}</div></div>
      </article>
    </section>
    {preview_script()}''',u)

@app.post('/new')
def makenew(req:Request,subject:str=Form(...),body:str=Form(...),template_id:str=Form(''),recipient_name:str=Form(''),recipient_email:str=Form(''),recipient_member_id:str=Form(''),status:str=Form('draft')):
    u=need(req);tid=int(template_id) if template_id.strip() else None
    if tid and not can_tpl(u,tid):raise HTTPException(403)
    with con() as c:
        n,y,p=nextprot(c,'Επιστολή',subject);ts=now();edit_session=current_edit_session(req,u) if isauthorised(u) else None;member_id=int(recipient_member_id) if recipient_member_id.strip().isdigit() else None;cur=c.execute('INSERT INTO letters(protocol_seq,protocol_year,protocol_no,letter_date,subject,body,template_id,recipient_name,recipient_email,recipient_member_id,status,created_by,signer,edit_session,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(n,y,p,date.today().isoformat(),subject.strip(),body.strip(),tid,recipient_name.strip(),recipient_email.strip(),member_id,status,u['email'],u.get('_actor','dimitrios'),edit_session,ts,ts));lid=cur.lastrowid;c.commit()
    return drive_on_ready(RedirectResponse(f'/letter/{lid}',303),'letter',lid,req,status)

@app.get('/letter/{lid}')
def view(req:Request,lid:int):
    u=need(req);s=settings()
    with con() as c:r=c.execute('SELECT * FROM letters WHERE id=?',(lid,)).fetchone()
    if not r:raise HTTPException(404)
    x=dict(r);profile=signer_profile(x.get('signer') or 'dimitrios',s)
    sig_visual=(f'<img class="signature-img" src="/asset/{profile["asset"]}">' if profile['key']=='nikolaos' else f'<img class="signature-img" src="/clean/{profile["asset"]}">') if asset_available(profile['asset']) else '<div style="height:22mm"></div>'
    gmail=gmail_compose_url(x['recipient_email'],x['subject'],x['body'])
    wa_text=f"Παρακαλώ να ελέγξετε το email σας και στα spam.\n\n{s['organization_name']}\nΑρ. Πρωτ.: {x['protocol_no']}\nΘέμα: {x['subject']}"
    whatsapp='https://wa.me/?text='+quote(wa_text)
    editable=can_edit_letter(req,u,x)
    readiness='' if (x['status']=='ready' or not editable) else '<form method="post" action="/ready/'+str(lid)+'"><button>Σήμανση ως έτοιμη</button></form>'
    edit_link=f'<a class="btn" href="/edit/{lid}">Επεξεργασία</a>' if editable else ''
    tools=f'''<section class="card send-panel noprint"><h3>Αποστολή & Αποθήκευση</h3>{sender_banner('official')}<div class="toolbar"><a class="btn primary" href="/pdf/{lid}">⬇ Λήψη PDF στα Downloads</a><a class="btn" target="_blank" rel="noopener" href="{gmail}">✉ Αποστολή με Email</a><a class="btn" target="_blank" rel="noopener" href="{whatsapp}">WhatsApp μήνυμα</a>{readiness}</div><p class="send-help">Για email ή WhatsApp με συνημμένο PDF: πρώτα πάτησε «Λήψη PDF στα Downloads» και μετά επισύναψέ το από τον φάκελο Downloads.</p>{drive_status_html('letter',lid,u)}</section><div class="toolbar noprint">{edit_link}<a class="btn" href="/new?copy_from={lid}">Νέα πάνω σε αυτή</a><button onclick="print()">Εκτύπωση</button></div>'''
    js=''
    body=f'''{tools}<article class="paper"><div class="head"><img src="/asset/header_emblem.png"><h1>{esc(s['organization_name'])}</h1><div class="gold">Έτος Ιδρύσεως {esc(s['founded_year'])}</div><div>{esc(s['grand_master_title'])}</div><div>{esc(s['grand_master_name'])}</div><div class="rule"></div></div><div class="meta"><div>Αρ. Πρωτ.: <b class="official-number">{esc(x['protocol_no'])}</b></div><div>Ημερομηνία: <b class="official-number">{datetime.fromisoformat(x['letter_date']).strftime('%d/%m/%Y')}</b></div></div>{'<p><b>Προς:</b> '+esc(x['recipient_name'])+'</p>' if x['recipient_name'] else ''}<p><b>Θέμα:</b> {esc(x['subject'])}</p><div class="body">{linkify(x['body'])}</div><p style="margin-top:10mm">{esc(s['closing'])}</p><div class="sigrow"><div class="sign">{sig_visual}<div class="signature-line"></div><div><b>{esc(profile['name'])}</b><br><div class="gs-title">{esc(profile['title'])}</div>{esc(s['organization_name'])}</div></div><div class="seal"><img class="seal-img" src="/clean/seal_original.png"></div></div></article>{js}'''
    return page(body,u,x['subject'])

@app.post('/ready/{lid}')
def ready(req:Request,lid:int):
    u=need(req)
    with con() as c:
        r=c.execute('SELECT * FROM letters WHERE id=?',(lid,)).fetchone()
        if not r:raise HTTPException(404)
        x=dict(r)
        if not can_edit_letter(req,u,x):raise HTTPException(403,'Το αρχειοθετημένο έγγραφο είναι μόνο για προβολή.')
        c.execute("UPDATE letters SET status='ready',updated_at=? WHERE id=?",(now(),lid))
    return drive_on_ready(RedirectResponse(f'/letter/{lid}',303),'letter',lid,req,'ready')

@app.get('/edit/{lid}')
def edit(req:Request,lid:int):
    u=need(req);s=settings()
    with con() as c:r=c.execute('SELECT * FROM letters WHERE id=?',(lid,)).fetchone()
    if not r:raise HTTPException(404)
    x=dict(r)
    if not can_edit_letter(req,u,x):raise HTTPException(403,'Το αρχειοθετημένο έγγραφο είναι μόνο για προβολή.')
    profile=signer_profile(x.get('signer') or 'dimitrios',s);tpls=templates_for(u);opts='<option value="">—</option>'+''.join(f"<option value='{t['id']}' {'selected' if x['template_id']==t['id'] else ''}>{esc(t['name'])}</option>" for t in tpls)
    sig_preview=(f'<img class="signature-img" src="/asset/{profile["asset"]}">' if profile['key']=='nikolaos' else f'<img class="signature-img" src="/clean/{profile["asset"]}">') if asset_available(profile['asset']) else '<div style="height:22mm"></div>'
    signer_control=''
    if u['email'].lower()==PRIMARY_ADMIN_EMAIL:
        signer_opts=''.join(f"<option value='{k}' {'selected' if (x.get('signer') or 'dimitrios')==k else ''}>{esc(v)}</option>" for k,v in ACTOR_LABELS.items())
        signer_control=f'''<div><label>Υπογράφων</label><select name="signer">{signer_opts}</select></div>'''
    return page(f'''<h1>Επεξεργασία {esc(x['protocol_no'])}</h1><form class="grid card" method="post"><div><label>Πρότυπο</label><select name="template_id">{opts}</select></div>{signer_control}<div><label>Κατάσταση</label><select name="status"><option value="draft" {'selected' if x['status']=='draft' else ''}>Πρόχειρη</option><option value="ready" {'selected' if x['status']=='ready' else ''}>Έτοιμη</option></select></div>{member_lookup_widget()}<input type="hidden" id="recipient_member_id" name="recipient_member_id" value="{esc(x.get('recipient_member_id') or '')}"><div><label>Παραλήπτης</label><input id="recipient_name" name="recipient_name" value="{esc(x['recipient_name'])}"></div><div><label>Email</label><input id="recipient_email" type="email" multiple name="recipient_email" value="{esc(x['recipient_email'])}"></div><div class="full"><label>Θέμα</label><input id="subject" name="subject" value="{esc(x['subject'])}" required></div><div class="full"><label>Κείμενο</label><textarea id="letter_body" name="body" required>{esc(x['body'])}</textarea><small>Τα links παραμένουν ενεργά στην τελική επιστολή και στο PDF.</small></div><div class="preview-actions"><button type="button" onclick="showPreview()">Προεπισκόπηση</button><button class="primary">Αποθήκευση</button></div></form>
    <section id="previewBox" class="preview-card">
      <div class="noprint preview-actions"><button type="button" onclick="document.getElementById('previewBox').classList.remove('open')">Κλείσιμο προεπισκόπησης</button></div>
      <article class="paper">
        <div class="head"><img src="/asset/header_emblem.png"><h1>{esc(s['organization_name'])}</h1><div class="gold">Έτος Ιδρύσεως {esc(s['founded_year'])}</div><div>{esc(s['grand_master_title'])}</div><div>{esc(s['grand_master_name'])}</div><div class="rule"></div></div>
        <div class="meta"><div>Αρ. Πρωτ.: <b class="official-number">{esc(x['protocol_no'])}</b></div><div>Ημερομηνία: <b class="official-number">{datetime.fromisoformat(x['letter_date']).strftime('%d/%m/%Y')}</b></div></div>
        <p id="previewRecipientWrap"><b>Προς:</b> <span id="previewRecipient"></span></p>
        <p><b>Θέμα:</b> <span id="previewSubject"></span></p>
        <div class="body" id="previewBody"></div>
        <p style="margin-top:10mm">{esc(s['closing'])}</p>
        <div class="sigrow"><div class="sign">{sig_preview}<div class="signature-line"></div><b>{esc(profile['name'])}</b><br><div class="gs-title">{esc(profile['title'])}</div>{esc(s['organization_name'])}</div><div class="seal"><img class="seal-img" src="/clean/seal_original.png"></div></div>
      </article>
    </section>
    {preview_script()}''',u)

@app.post('/edit/{lid}')
def saveedit(req:Request,lid:int,subject:str=Form(...),body:str=Form(...),template_id:str=Form(''),recipient_name:str=Form(''),recipient_email:str=Form(''),recipient_member_id:str=Form(''),status:str=Form('draft'),signer:str=Form('')):
    u=need(req);tid=int(template_id) if template_id else None
    if tid and not can_tpl(u,tid):raise HTTPException(403)
    with con() as c:
        r=c.execute('SELECT * FROM letters WHERE id=?',(lid,)).fetchone()
        if not r:raise HTTPException(404)
        if not can_edit_letter(req,u,dict(r)):raise HTTPException(403,'Το αρχειοθετημένο έγγραφο είναι μόνο για προβολή.')
        if u['email'].lower()==PRIMARY_ADMIN_EMAIL and signer in ACTOR_LABELS:
            member_id=int(recipient_member_id) if recipient_member_id.strip().isdigit() else None;c.execute('UPDATE letters SET subject=?,body=?,template_id=?,recipient_name=?,recipient_email=?,recipient_member_id=?,status=?,signer=?,updated_at=? WHERE id=?',(subject.strip(),body.strip(),tid,recipient_name.strip(),recipient_email.strip(),member_id,status,signer,now(),lid))
        else:
            member_id=int(recipient_member_id) if recipient_member_id.strip().isdigit() else None;c.execute('UPDATE letters SET subject=?,body=?,template_id=?,recipient_name=?,recipient_email=?,recipient_member_id=?,status=?,updated_at=? WHERE id=?',(subject.strip(),body.strip(),tid,recipient_name.strip(),recipient_email.strip(),member_id,status,now(),lid))
    return drive_on_ready(RedirectResponse(f'/letter/{lid}',303),'letter',lid,req,status)

@app.post('/delete/{lid}')
def delete_letter(req:Request,lid:int):
    u=need(req)
    if not isadmin(u):raise HTTPException(403,'Μόνον ο administrator μπορεί να διαγράψει έγγραφο.')
    with con() as c:
        r=c.execute('SELECT id FROM letters WHERE id=?',(lid,)).fetchone()
        if not r:raise HTTPException(404)
        c.execute('UPDATE letters SET source_letter_id=NULL WHERE source_letter_id=?',(lid,))
        c.execute('DELETE FROM decrees WHERE letter_id=?',(lid,))
        c.execute('DELETE FROM letters WHERE id=?',(lid,))
        c.commit()
    return RedirectResponse('/',303)

@app.get('/archive')
def archive(req:Request,q:str='',date_from:str='',date_to:str=''):
    u=need(req);w=['id NOT IN (SELECT letter_id FROM decrees WHERE letter_id IS NOT NULL)'];p=[]
    if q:w.append('(protocol_no LIKE ? OR subject LIKE ? OR recipient_name LIKE ? OR recipient_email LIKE ?)');v=f'%{q}%';p += [v,v,v,v]
    if date_from:w.append('letter_date>=?');p.append(date_from)
    if date_to:w.append('letter_date<=?');p.append(date_to)
    sql='SELECT * FROM letters'+((' WHERE '+' AND '.join(w)) if w else '')+' ORDER BY protocol_year DESC,protocol_seq DESC LIMIT 500'
    with con() as c:
        xs=[dict(r) for r in c.execute(sql,p)]
        decree_ids={int(r['letter_id']) for r in c.execute('SELECT letter_id FROM decrees')} if xs else set()
    row_parts=[]
    for x in xs:
        lid=int(x['id'])
        edit_href=f"/decree/edit/{lid}" if lid in decree_ids else f"/edit/{lid}"
        edit_link=(f" · <a href='{edit_href}'>Edit</a>" if can_edit_letter(req,u,x) else '')
        delete_btn=(f"<form method='post' action='/delete/{lid}' style='display:inline' onsubmit=\"return confirm('Οριστική διαγραφή του εγγράφου; Η ενέργεια δεν αναιρείται.');\"><button type='submit' class='btn' style='margin-left:6px'>Delete</button></form>" if isadmin(u) else '')
        actions=f"<a href='/letter/{lid}'>Άνοιγμα</a>{edit_link} · <a href='/new?copy_from={lid}'>Νέα πάνω σε αυτή</a>{delete_btn}"
        row_parts.append(f"<tr><td class='official-number'>{esc(x['protocol_no'])}</td><td class='official-number'>{esc(x['letter_date'])}</td><td>{esc(x['subject'])}</td><td>{esc(x['recipient_name'])}</td><td>{actions}</td></tr>")
    rows=''.join(row_parts) or '<tr><td colspan=5>Δεν βρέθηκαν.</td></tr>'
    return page(f'''<h1>Αρχείο Επιστολών</h1><form class="filters"><input name="q" value="{esc(q)}" placeholder="Αρ. πρωτ., θέμα, παραλήπτης"><input type="date" name="date_from" value="{esc(date_from)}"><input type="date" name="date_to" value="{esc(date_to)}"><button>Αναζήτηση</button></form><div class="card"><table><tr><th>Αρ. Πρωτ.</th><th>Ημερομηνία</th><th>Θέμα</th><th>Παραλήπτης</th><th>Ενέργειες</th></tr>{rows}</table></div>''',u)

def preview_script():
    return r'''<script>
    function escHtml(v){return (v||'').replace(/[&<>"']/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]})}
    function linkifyClient(v){
      let safe=escHtml(v);
      return safe.replace(/(https?:\/\/[^\s<]+|www\.[^\s<]+)/g,function(raw){
        let trail='';
        while(raw && '.,;:!?)]}'.includes(raw.slice(-1))){trail=raw.slice(-1)+trail;raw=raw.slice(0,-1)}
        let href=raw.startsWith('http')?raw:'https://'+raw;
        return '<a href="'+href+'" target="_blank" rel="noopener noreferrer">'+raw+'</a>'+trail;
      });
    }
    function showPreview(){
      const recipient=document.getElementById('recipient_name').value.trim();
      document.getElementById('previewRecipient').textContent=recipient;
      document.getElementById('previewRecipientWrap').style.display=recipient?'block':'none';
      document.getElementById('previewSubject').textContent=document.getElementById('subject').value;
      document.getElementById('previewBody').innerHTML=linkifyClient(document.getElementById('letter_body').value);
      const box=document.getElementById('previewBox');
      box.classList.add('open');
      box.scrollIntoView({behavior:'smooth',block:'start'});
    }
    </script>'''
