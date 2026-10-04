# Εορτολόγιο — εορτάζοντες, αποστολή ευχών (ανά πρόσωπο, με προσφώνηση), αναφορά στον ΜΔ, εορτολόγιο ονομάτων.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

ND_CSS='''<style>.ndf{display:grid;grid-template-columns:1fr 1fr auto auto auto;gap:8px;align-items:center}.ndf label{display:flex;gap:6px;align-items:center;font-weight:normal;margin:0}.ndf label input{width:auto}
@media(max-width:800px){.ndf{grid-template-columns:1fr}.ndf label input[type=date]{width:100%!important;min-width:0}}.ndday{margin:22px 0 8px;color:#0b2f63;border-bottom:1px solid #d8deea;padding-bottom:4px}
.ndok{display:inline-block;font-size:.8rem;padding:2px 9px;border-radius:999px;background:#d7f5e2;color:#187a3d}</style>'''

def _nd_admin(req):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    return u

def _nd_range(frm,to):
    t=date.today();frm=frm if _vdate(frm) else t.isoformat();to=to if _vdate(to) else (t+timedelta(days=30)).isoformat()
    return frm,max(frm,to)

@app.get('/namedays')
def namedays_page(req:Request,frm:str='',to:str='',mail:str='',hide:str='',msg:str=''):
    u=_nd_admin(req);frm,to=_nd_range(frm,to);sent=greetings_sent()
    gs=[]
    for g in celebrants(frm,to):
        ms=[m for m in g['members'] if (not mail or greet_email(m)) and not (hide and (m['id'],g['date']) in sent)]
        if ms:gs.append(dict(g,members=ms))
    people=sum(len(g['members']) for g in gs);withmail=sum(1 for g in gs for m in g['members'] if greet_email(m))
    body='';last=''
    for g in gs:
        if g['date']!=last:body+=f'<h2 class="ndday">{esc(day_str(g["date"]))}{" · Σήμερα" if g["date"]==date.today().isoformat() else ""}</h2>';last=g['date']
        rows=''.join(f"""<tr><td>{f'<input type="checkbox" name="k" value="{m["id"]}|{g["date"]}|{esc(g["label"])}" style="width:auto">' if greet_email(m) else ''}</td>
<td><b>{esc(m['surname'])}</b> {esc(m['first_name'])}{f' <span class="ndok">✓ Ευχές {esc(fmt_ddmmyyyy(sent[(m["id"],g["date"])]))}</span>' if (m['id'],g['date']) in sent else ''}</td>
<td class="muted">{esc(member_lodges_text(m))}</td><td style="white-space:nowrap">{esc(m.get('mobile') or '—')}</td><td>{esc(greet_email(m) or '—')}</td></tr>""" for m in g['members'])
        body+=f'''<div class="card" style="margin:8px 0"><h3 style="margin-top:0">{esc(g["label"])} <small class="muted">{len(g["members"])} {"μέλος" if len(g["members"])==1 else "μέλη"}{" · κινητή εορτή" if g["movable"] else ""}</small></h3>
<div style="overflow:auto"><table><tr><th style="width:28px"><input type="checkbox" style="width:auto" onclick="this.closest('table').querySelectorAll('input[name=k]').forEach(c=>c.checked=this.checked)"></th><th>Ονοματεπώνυμο</th><th>Στοές</th><th>Κινητό</th><th>Email</th></tr>{rows}</table></div></div>'''
    if not gs:body='<div class="card">Κανένα μέλος δεν εορτάζει σε αυτό το διάστημα.</div>'
    notice=f"<div class='card'><b>{esc(msg)}</b></div>" if msg else ''
    qs=f'frm={quote(frm)}&to={quote(to)}&mail={quote(mail)}'
    return page(ND_CSS+f"""<h1>🎉 Εορτολόγιο</h1>{notice}
<div class="toolbar"><a class="btn" href="/namedays/report">Αναφορά ευχών σήμερα (ΜΔ)</a><a class="btn" href="/namedays/export.xlsx?{qs}">⬇ Excel εορταζόντων</a><a class="btn" href="/namedays/calendar">Εορτολόγιο ονομάτων</a></div>
<form class="card ndf" method="get"><label>Από <input type="date" name="frm" value="{esc(frm)}" style="width:auto"></label><label>Έως <input type="date" name="to" value="{esc(to)}" style="width:auto"></label>
<label><input type="checkbox" name="mail" value="1"{" checked" if mail else ""}> Μόνο με email</label><label><input type="checkbox" name="hide" value="1"{" checked" if hide else ""}> Απόκρυψη όσων έλαβαν ευχές</label><button>Προβολή</button></form>
<p><b>{people}</b> εορτάζοντες · <b>{len({g['date'] for g in gs})}</b> ημέρες · <b>{withmail}</b> με email · <b>{len(gs)}</b> εορτές</p>
<form method="post" action="/namedays/compose"><div class="toolbar"><button class="primary">✉ Αποστολή ευχών στους επιλεγμένους</button>
<button type="button" onclick="document.querySelectorAll('input[name=k]').forEach(c=>c.checked=true)">Επιλογή όλων</button></div>{body}</form>""",u,'Εορτολόγιο')

def _nd_selected(keys):
    ms={m['id']:m for m in _nd_members()};out=[]
    for k in keys:
        try:mid,d,label=k.split('|',2);m=ms[int(mid)]
        except Exception:continue
        if _vdate(d):out.append({'k':k,'m':m,'date':d,'label':label,'email':greet_email(m)})
    return out

def _greet_page(u,items,subject,body,crest=True,bcc_prov=True,bcc_self=True,results=None):
    s=settings();rm=rep_rankmap();self_bcc=split_emails(s.get('greet_bcc_self') or '');sent=greetings_sent()
    rows=''
    for i,it in enumerate(items):
        rk=it.get('rk',member_rank_idx(it['m'],rm));bcc=greet_bcc_province(it['m'],it['email'])
        res=(results or {}).get(it['k'],'')
        rks=''.join(f'<option value="{x-1}"{" selected" if rk==x-1 else ""}>{GREET_RK[x]}</option>' for x in range(5))
        rows+=f"""<tr><td><input type="checkbox" name="k" value="{esc(it['k'])}" style="width:auto"{"" if res.startswith('✓') else " checked"}></td>
<td><b>{esc(it['m']['surname'])} {esc(it['m']['first_name'])}</b><br><small class="muted">{esc(it['label'])} · {esc(day_str(it['date']))}</small>
{f'<br><span class="vwarn">έλαβε ήδη ευχές {esc(fmt_ddmmyyyy(sent[(it["m"]["id"],it["date"])]))}</span>' if (it['m']['id'],it['date']) in sent and not res else ''}</td>
<td>{esc(it['email'])}<br><small class="muted">Κρυφή κοιν. Επαρχίας: {esc(', '.join(bcc) or '—')}</small></td>
<td><select name="rk:{esc(it['k'])}" style="width:auto">{rks}</select></td><td>{esc(res)}</td></tr>"""
    sample=''
    if items:
        it=items[0];rk=it.get('rk',member_rank_idx(it['m'],rm))
        sample=f'<p class="muted">Προς: {esc(it["email"])} · Θέμα: <b>{esc(greet_fill(subject,it["m"],rk,it["label"],it["date"]))}</b></p><div style="background:#fff;border:1px solid #d8deea;padding:14px">{greet_html(greet_fill(body,it["m"],rk,it["label"],it["date"]))}</div>'
    ck=lambda b:' checked' if b else ''
    return page(ND_CSS+f"""<h1>Ευχές ονομαστικής εορτής</h1>{sender_banner('general')}{'' if mail_ready() else '<div class="card" style="border-color:#e3b17a"><b>Η αποστολή από τον διακομιστή (SMTP) δεν είναι ρυθμισμένη.</b></div>'}
<form method="post" action="/namedays/send" class="card">
<p class="muted">Κάθε εορτάζων λαμβάνει δικό του email. Τα <b>{{Τίτλος}}</b>, <b>{{Προσφώνηση}}</b> (από το αξίωμα του καθενός — αλλάζει από τη στήλη «Προσφώνηση»), <b>{{Όνομα}}</b>, <b>{{Επώνυμο}}</b>, <b>{{Εορτή}}</b>, <b>{{Ημερομηνία}}</b> συμπληρώνονται αυτόματα.</p>
<label>Θέμα</label><input name="subject" value="{esc(subject)}" required>
<label style="margin-top:10px">Κείμενο</label><textarea name="body" style="min-height:260px">{esc(body)}</textarea>
<div style="margin:8px 0;display:flex;flex-wrap:wrap;gap:6px 18px">
<label style="display:flex;gap:6px;align-items:center;font-weight:normal;margin:0"><input type="checkbox" name="crest" value="1" style="width:auto"{ck(crest)}> Επισύναψη θυρεού</label>
<label style="display:flex;gap:6px;align-items:center;font-weight:normal;margin:0"><input type="checkbox" name="bcc_prov" value="1" style="width:auto"{ck(bcc_prov)}> Κρυφή κοινοποίηση στη Γραμματεία και στον ΕπΜΔ της Επαρχίας</label>
<label style="display:flex;gap:6px;align-items:center;font-weight:normal;margin:0"><input type="checkbox" name="bcc_self" value="1" style="width:auto"{ck(bcc_self and self_bcc)}{'' if self_bcc else ' disabled'}> Κρυφή κοινοποίηση και σε: {esc(', '.join(self_bcc) or '— (ορίζεται στις Ρυθμίσεις: greet_bcc_self)')}</label></div>
<h3>Παραλήπτες ({len(items)})</h3><div style="overflow:auto"><table><tr><th></th><th>Εορτάζων</th><th>Email</th><th>Προσφώνηση</th><th></th></tr>{rows}</table></div>
<div class="toolbar" style="margin-top:10px"><button class="primary" name="mode" value="send" onclick="return confirm('Αποστολή ευχών στους επιλεγμένους;')">✉ Αποστολή</button><button name="mode" value="preview">Προεπισκόπηση</button><button name="mode" value="save_tpl">Αποθήκευση κειμένου ως προτύπου</button><button name="mode" value="reset_tpl">Επαναφορά αρχικού κειμένου</button><a class="btn" href="/namedays">Επιστροφή</a></div>
<h3>Δείγμα όπως θα φτάσει</h3>{sample}</form>""",u,'Ευχές')

@app.post('/namedays/compose')
async def namedays_compose(req:Request):
    u=_nd_admin(req);f=await req.form();items=_nd_selected(f.getlist('k'))
    if not items:return RedirectResponse('/namedays?msg='+quote('Επιλέξτε τουλάχιστον έναν εορτάζοντα με email.'),303)
    s=settings()
    return _greet_page(u,items,s.get('greet_subject') or GREET_SUBJECT_DEFAULT,s.get('greet_body') or GREET_BODY_DEFAULT)

@app.post('/namedays/send')
async def namedays_send(req:Request):
    u=_nd_admin(req);f=await req.form();mode=str(f.get('mode','send'))
    subject=str(f.get('subject','')).strip();body=str(f.get('body','')).strip()
    crest,bcc_prov,bcc_self=bool(f.get('crest')),bool(f.get('bcc_prov')),bool(f.get('bcc_self'))
    rk_all={k[3:]:int(v) for k,v in f.items() if k.startswith('rk:') and str(v).lstrip('-').isdigit()}
    items=_nd_selected(list(rk_all.keys()) or f.getlist('k'));picked=set(f.getlist('k'))
    for it in items:it['rk']=max(-1,min(3,rk_all.get(it['k'],member_rank_idx(it['m']))))
    if mode in ('save_tpl','reset_tpl'):
        if mode=='reset_tpl':subject,body=GREET_SUBJECT_DEFAULT,GREET_BODY_DEFAULT
        with con() as c:c.execute('REPLACE INTO settings VALUES(?,?)',('greet_subject',subject));c.execute('REPLACE INTO settings VALUES(?,?)',('greet_body',body))
        return _greet_page(u,items,subject,body,crest,bcc_prov,bcc_self)
    if mode=='preview' or not subject or not body:return _greet_page(u,items,subject,body,crest,bcc_prov,bcc_self)
    self_bcc=split_emails(settings().get('greet_bcc_self') or '') if bcc_self else []
    att=[x for x in [greet_crest() if crest else None] if x];results={};n=0
    for it in items:
        if it['k'] not in picked:continue
        bcc=[e for e in dict.fromkeys((greet_bcc_province(it['m'],it['email']) if bcc_prov else [])+self_bcc) if e.lower()!=it['email'].lower()]
        subj=greet_fill(subject,it['m'],it['rk'],it['label'],it['date']);txt=greet_fill(body,it['m'],it['rk'],it['label'],it['date'])
        try:send_mail([it['email']],subj,'Εθνική Μεγάλη Στοά της Ελλάδος\n\n'+txt,bcc,att,html=greet_html(txt))
        except HTTPException as e:
            results[it['k']]='Δεν στάλθηκε: '+str(e.detail)
            if e.status_code in (502,503):break
            continue
        log_greeting(it['m'],it['date'],it['label'],it['email'],subj,bcc);results[it['k']]='✓ Στάλθηκε';n+=1
    if all(v.startswith('✓') for v in results.values()) and results:
        return RedirectResponse('/namedays?msg='+quote(f'Στάλθηκαν {n} email ευχών.'),303)
    return _greet_page(u,items,subject,body,crest,bcc_prov,bcc_self,results)

# ---------------------------------------------------------------- αναφορά στον ΜΔ
def _greet_today(d=None):
    d=d or date.today().isoformat()
    with con() as c:return [dict(r) for r in c.execute('SELECT * FROM greetings_log WHERE sent_on=? ORDER BY sent_at,name',(d,))]

def greet_report_pdf(d=None):
    d=d or date.today().isoformat();rows=_greet_today(d);regular,bold=_pdf_fonts();b=BytesIO()
    doc=SimpleDocTemplate(b,pagesize=A4,leftMargin=14*mm,rightMargin=14*mm,topMargin=14*mm,bottomMargin=16*mm,title='Αναφορά αποστολής ευχών')
    cen=ParagraphStyle('grc',fontName=regular,fontSize=12,leading=15,alignment=1)
    story=[Paragraph('ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ',ParagraphStyle('grs',parent=cen,fontSize=9,textColor=colors.HexColor('#9c7a22'))),Spacer(1,2*mm),
           Paragraph(f'Αναφορά αποστολής ευχών από ΜΔ σήμερα την {esc(day_str(d))}',ParagraphStyle('grt',parent=cen,fontName=bold,fontSize=16,leading=20)),Spacer(1,2*mm),
           Paragraph(f'Σήμερα {esc(day_str(d))} απεστάλησαν {len(rows)} email.',cen),
           HRFlowable(width='100%',thickness=.6,color=colors.HexColor('#9c7a22'),spaceBefore=4,spaceAfter=6)]
    cell=ParagraphStyle('grcell',fontName=regular,fontSize=11,leading=13);nm=ParagraphStyle('grnm',parent=cell,fontName=bold,fontSize=12.5)
    hc=ParagraphStyle('grh',fontName=bold,fontSize=11,textColor=colors.white)
    data=[[Paragraph(h,hc) for h in ['Α/Α','Ονοματεπώνυμο','Email','Θέμα email','Ώρα']]]
    for i,r in enumerate(rows,1):
        tm=(r.get('sent_at') or '')[11:16]
        data.append([Paragraph(str(i),cell),Paragraph(esc(r['name']),nm),Paragraph(esc(r['email']),cell),Paragraph(esc(r['subject']),cell),Paragraph(f'{fmt_ddmmyyyy(d)}<br/>{tm}',cell)])
    t=Table(data,colWidths=[12*mm,48*mm,46*mm,43*mm,33*mm],repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#15203a')),('GRID',(0,0),(-1,-1),.25,colors.HexColor('#d2d6e0')),('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
    story+=[t,Spacer(1,4*mm),Paragraph('Εκδόθηκε '+datetime.now().strftime('%d/%m/%Y %H:%M'),ParagraphStyle('grf',fontName=regular,fontSize=9,textColor=colors.HexColor('#5b6780')))]
    doc.build(story);return rows,b.getvalue(),f'anafora-eyxon-{d}.pdf'

def grand_master_email():
    p=next((x for x in provinces_all() if x.get('kind')=='Εθνική'),None)
    return province_roles(p)[0]['email'] if p else ''

@app.get('/namedays/report')
def namedays_report(req:Request,pdf:str=''):
    u=_nd_admin(req);rows,data,fn=greet_report_pdf()
    if pdf:return Response(data,media_type='application/pdf',headers={'Content-Disposition':f'attachment; filename="{fn}"'})
    t=date.today().isoformat()
    body=(f'Σεβασμιώτατε Μεγάλε Διδάσκαλε,\n\nσας υποβάλλω συνημμένα την αναφορά αποστολής ευχών ονομαστικής εορτής εκ μέρους σας για σήμερα, {day_str(t)}.\n\n'
          f'Σήμερα απεστάλησαν {len(rows)} email ευχών:\n'+'\n'.join(f'{i}. {r["name"]}' for i,r in enumerate(rows,1))+f'\n\n{visits_signature()}')
    trs=''.join(f"<tr><td>{i}</td><td><b>{esc(r['name'])}</b></td><td>{esc(r['email'])}</td><td>{esc(r['subject'])}</td><td>{esc((r.get('sent_at') or '')[11:16])}</td></tr>" for i,r in enumerate(rows,1))
    return page(f"""<h1>Αναφορά ευχών σήμερα</h1><div class="toolbar"><a class="btn primary" href="/namedays/report?pdf=1">⬇ PDF αναφοράς</a><a class="btn" href="/namedays">Εορτολόγιο</a></div>
<div class="card" style="overflow:auto"><p>Σήμερα {esc(day_str(t))} απεστάλησαν <b>{len(rows)}</b> email ευχών.</p><table><tr><th>Α/Α</th><th>Ονοματεπώνυμο</th><th>Email</th><th>Θέμα</th><th>Ώρα</th></tr>{trs or '<tr><td colspan=5>Σήμερα δεν έχουν σταλεί ακόμη ευχές.</td></tr>'}</table></div>
{'' if not rows else f'''<form method="post" action="/namedays/report/send" class="card"><h3 style="margin-top:0">Αποστολή αναφοράς στον Μεγάλο Διδάσκαλο</h3>{sender_banner('general')}
<label>Προς</label><input name="to" value="{esc(grand_master_email())}" required><small class="muted">Από τον ΜΔ της εγγραφής «ΕΜΣτΕ» στις Επαρχιακές Μεγάλες Στοές.</small>
<label style="margin-top:10px">Θέμα</label><input name="subject" value="{esc('Αναφορά αποστολής ευχών ονομαστικής εορτής — '+day_str(t))}">
<label style="margin-top:10px">Κείμενο</label><textarea name="body" style="min-height:240px">{esc(body)}</textarea><p class="muted">Συνημμένο: {esc(fn)}</p>
<button class="primary" onclick="return confirm('Αποστολή της αναφοράς;')">✉ Αποστολή</button></form>'''}""",u,'Αναφορά ευχών')

@app.post('/namedays/report/send')
def namedays_report_send(req:Request,to:str=Form(''),subject:str=Form(''),body:str=Form('')):
    _nd_admin(req);rows,data,fn=greet_report_pdf()
    send_mail(split_emails(to),subject,body,attachments=[(fn,data,'application/pdf')])
    return RedirectResponse('/namedays?msg='+quote('Η αναφορά στάλθηκε στον Μεγάλο Διδάσκαλο.'),303)

@app.get('/namedays/export.xlsx')
def namedays_export(req:Request,frm:str='',to:str='',mail:str=''):
    _nd_admin(req);frm,to=_nd_range(frm,to);sent=greetings_sent()
    wb=Workbook();ws=wb.active;ws.title='ΕΟΡΤΑΖΟΝΤΕΣ'
    ws.append(['Ημερομηνία','Ημέρα','Εορτή','Επώνυμο','Όνομα','Στοές','Email','Κινητό','Ευχές'])
    for g in celebrants(frm,to):
        for m in g['members']:
            if mail and not greet_email(m):continue
            d=_vdate(g['date']);ws.append([fmt_ddmmyyyy(g['date']),VISIT_DAYS[d.weekday()],g['label'],m['surname'],m['first_name'],member_lodges_text(m),
                                          greet_email(m),m.get('mobile') or '',fmt_ddmmyyyy(sent[(m['id'],g['date'])]) if (m['id'],g['date']) in sent else ''])
    ws.freeze_panes='A2'
    for cell in ws[1]:cell.font=Font(bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='1F4E78')
    b=BytesIO();wb.save(b)
    return Response(b.getvalue(),media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':f'attachment; filename="eortazontes-{frm}-{to}.xlsx"'})

# ---------------------------------------------------------------- εορτολόγιο ονομάτων
@app.get('/namedays/calendar')
def namedays_calendar(req:Request,q:str='',msg:str=''):
    u=_nd_admin(req);y=date.today().year;ql=nd_fold(q)
    xs=[x for x in namedays_all() if not ql or ql in nd_fold(' '.join([x['name'],x.get('official') or '',x.get('note') or '']))]
    rows=''.join(f"""<tr><td><b>{esc(x['name'])}</b></td><td>{esc(x.get('official') or '')}</td><td>{esc(day_str(nameday_in(x,y).isoformat())) if nameday_in(x,y) else '<span class=muted>χωρίς εορτή</span>'}</td>
<td>{'Πάσχα '+('+' if int(x['easter'])>=0 else '')+str(x['easter']) if x.get('easter') is not None else esc(x.get('md') or '')}{' · '+esc(NAMEDAY_RULES.get(x.get('rule') or '','')) if x.get('rule') else ''}</td>
<td class="muted">{esc(x.get('note') or '')}</td><td><a class="btn" href="/namedays/calendar/edit/{x['id']}">Edit</a></td></tr>""" for x in xs)
    notice=f"<div class='card'><b>{esc(msg)}</b></div>" if msg else ''
    return page(f"""<h1>Εορτολόγιο ονομάτων</h1>{notice}<div class="toolbar"><a class="btn primary" href="/namedays/calendar/new">+ Νέο όνομα</a><a class="btn" href="/namedays">Εορτάζοντες</a></div>
<div class="card"><p style="margin-top:0">Η αντιστοίχιση γίνεται με το <b>πρώτο όνομα</b> του μέλους (χωρίς τόνους). Οι κινητές εορτές ορίζονται ως ημέρες από το Πάσχα (π.χ. «0» = Πάσχα).</p>
<form class="filters" method="get" style="grid-template-columns:1fr auto"><input name="q" value="{esc(q)}" placeholder="Αναζήτηση ονόματος…"><button>Αναζήτηση</button></form><p><b>{len(xs)}</b> ονόματα</p></div>
<div class="card" style="overflow:auto"><table><tr><th>Όνομα (όπως στο Μητρώο)</th><th>Εορτή</th><th>Φέτος</th><th>Κανόνας</th><th>Σημείωση</th><th></th></tr>{rows}</table></div>""",u,'Εορτολόγιο ονομάτων')

def _nd_form(x=None):
    x=x or {};v=lambda k:esc(str(x.get(k) if x.get(k) is not None else ''))
    rules=''.join(f'<option value="{k}"{" selected" if (x.get("rule") or "")==k else ""}>{esc(t)}</option>' for k,t in NAMEDAY_RULES.items())
    return f"""<div class="grid card"><div><label>Όνομα (όπως γράφεται στο Μητρώο)</label><input name="name" value="{v('name')}" required></div>
<div><label>Επίσημη ονομασία εορτής</label><input name="official" value="{v('official')}" placeholder="π.χ. Γεώργιος"></div>
<div><label>Σταθερή ημερομηνία (ΜΜ-ΗΗ)</label><input name="md" value="{v('md')}" placeholder="π.χ. 04-23"></div>
<div><label>Ή κινητή: ημέρες από το Πάσχα</label><input name="easter" value="{v('easter')}" inputmode="numeric" placeholder="π.χ. 0 ή 50"></div>
<div><label>Κανόνας</label><select name="rule">{rules}</select></div><div class="full"><label>Σημείωση</label><input name="note" value="{v('note')}"></div></div>"""

def _nd_from_form(f):
    d={k:str(f.get(k,'') or '').strip() for k in ('name','official','md','easter','rule','note')}
    if not d['name']:raise HTTPException(400,'Συμπληρώστε το όνομα.')
    if d['md']:
        try:assert re.fullmatch(r'\d{2}-\d{2}',d['md']);date(2024,*map(int,d['md'].split('-')))
        except Exception:raise HTTPException(400,'Η ημερομηνία πρέπει να είναι έγκυρη, στη μορφή ΜΜ-ΗΗ (π.χ. 04-23).')
    d['easter']=int(d['easter']) if d['easter'].lstrip('-').isdigit() else None
    if d['rule'] not in NAMEDAY_RULES:d['rule']=''
    return d

@app.get('/namedays/calendar/new')
def namedays_cal_new(req:Request):
    u=_nd_admin(req)
    return page('<h1>Νέο όνομα</h1><form method="post">'+_nd_form()+'<button class="primary">Αποθήκευση</button> <a class="btn" href="/namedays/calendar">Άκυρο</a></form>',u,'Νέο όνομα')

@app.post('/namedays/calendar/new')
async def namedays_cal_new_save(req:Request):
    _nd_admin(req);d=_nd_from_form(await req.form());ts=now()
    with con() as c:c.execute('INSERT INTO namedays(name,name_key,official,md,easter,rule,note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)',(d['name'],nd_key(d['name']),d['official'],d['md'],d['easter'],d['rule'],d['note'],ts,ts))
    return RedirectResponse('/namedays/calendar?msg='+quote('Αποθηκεύτηκε.'),303)

@app.get('/namedays/calendar/edit/{nid}')
def namedays_cal_edit(req:Request,nid:int):
    u=_nd_admin(req)
    with con() as c:x=c.execute('SELECT * FROM namedays WHERE id=?',(nid,)).fetchone()
    if not x:raise HTTPException(404)
    return page(f'''<h1>{esc(x["name"])}</h1><form method="post">{_nd_form(dict(x))}<button class="primary">Αποθήκευση</button> <a class="btn" href="/namedays/calendar">Άκυρο</a></form>
<form method="post" action="/namedays/calendar/delete/{nid}" onsubmit="return confirm('Διαγραφή;')" style="margin-top:12px"><button>Διαγραφή</button></form>''',u,'Όνομα')

@app.post('/namedays/calendar/edit/{nid}')
async def namedays_cal_edit_save(req:Request,nid:int):
    _nd_admin(req);d=_nd_from_form(await req.form())
    with con() as c:c.execute('UPDATE namedays SET name=?,name_key=?,official=?,md=?,easter=?,rule=?,note=?,updated_at=? WHERE id=?',(d['name'],nd_key(d['name']),d['official'],d['md'],d['easter'],d['rule'],d['note'],now(),nid))
    return RedirectResponse('/namedays/calendar?msg='+quote('Αποθηκεύτηκε.'),303)

@app.post('/namedays/calendar/delete/{nid}')
def namedays_cal_delete(req:Request,nid:int):
    _nd_admin(req)
    with con() as c:c.execute('DELETE FROM namedays WHERE id=?',(nid,))
    return RedirectResponse('/namedays/calendar?msg='+quote('Διαγράφηκε.'),303)
