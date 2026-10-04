# Επισκέψεις Στοών — αναφορά (προεπισκόπηση και PDF A4) ανά διάστημα και Επαρχία.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

def _report_rows(frm,to,prov):
    return [v for v in visits_all() if (not frm or v['visit_date']>=frm) and (not to or v['visit_date']<=to) and (not prov or v.get('province')==prov)]

@app.get('/visits/report')
def visits_report(req:Request,frm:str='',to:str='',prov:str=''):
    u=_visits_admin(req);frm=frm or date.today().isoformat();rows=_report_rows(frm,to,prov);reps={r['id']:r for r in reps_all()}
    groups={}
    for v in rows:groups.setdefault(v['visit_date'][:7],[]).append(v)
    trs=''.join(f'<tr><td colspan=4 style="background:#eef3fa;color:#123b7a;font-weight:bold">{month_title(k)} · {len(items)}</td></tr>'+''.join(
        f"<tr><td>{esc(day_str(v['visit_date']))}</td><td><b>{esc(v['lodge'])}</b>{' Αρ. '+esc(v['lodge_number']) if v.get('lodge_number') else ''}{'<br><small class=muted>'+esc(v['notes'])+'</small>' if v.get('notes') else ''}</td><td>{esc(v.get('location') or '—')}<br><small class=muted>{esc(v.get('province') or '')}</small></td><td>{esc(rep_label(reps[v['rep_id']])) if v.get('rep_id') in reps else '<span class=vwarn>Δεν έχει οριστεί</span>'}</td></tr>" for v in items) for k,items in groups.items())
    popts=''.join(f'<option{" selected" if p==prov else ""}>{esc(p)}</option>' for p in _provincial_choices())
    qs=f'frm={quote(frm)}&to={quote(to)}&prov={quote(prov)}'
    return page(VISITS_CSS+f"""<h1>Αναφορά επισκέψεων</h1><form class="card filters vfilters f3" method="get"><input type="date" name="frm" value="{esc(frm)}"><input type="date" name="to" value="{esc(to)}"><select name="prov"><option value="">Όλες οι Επαρχίες</option>{popts}</select><button>Προβολή</button></form>
<div class="toolbar"><a class="btn primary" href="/visits/report.pdf?{qs}">Λήψη PDF (A4)</a><a class="btn" href="/visits">Επισκέψεις</a></div>
<div class="card" style="overflow:auto"><p>{len(rows)} επισκέψεις σε {len(groups)} μήνες</p><table><tr><th>Ημερομηνία</th><th>Στοά</th><th>Τόπος · Επαρχία</th><th>Εκπρόσωπος</th></tr>{trs or '<tr><td colspan=4>Καμία επίσκεψη στο διάστημα αυτό.</td></tr>'}</table></div>""",u,'Αναφορά επισκέψεων')

@app.get('/visits/report.pdf')
def visits_report_pdf(req:Request,frm:str='',to:str='',prov:str=''):
    _visits_admin(req);rows=_report_rows(frm,to,prov);reps={r['id']:r for r in reps_all()}
    regular,bold=_pdf_fonts();b=BytesIO();s=settings()
    doc=SimpleDocTemplate(b,pagesize=A4,leftMargin=12*mm,rightMargin=12*mm,topMargin=12*mm,bottomMargin=14*mm,title='Πρόγραμμα Επισκέψεων στις Στοές')
    small=ParagraphStyle('vrs',fontName=regular,fontSize=7.5,textColor=colors.HexColor('#9c7a22'))
    title=ParagraphStyle('vrt',fontName=bold,fontSize=15,leading=19,textColor=colors.HexColor('#15203a'))
    sub=ParagraphStyle('vrsub',fontName=regular,fontSize=8.5,textColor=colors.HexColor('#5b6780'))
    cell=ParagraphStyle('vrc',fontName=regular,fontSize=8.4,leading=10.4);cellb=ParagraphStyle('vrcb',parent=cell,fontName=bold)
    hcell=ParagraphStyle('vrh',fontName=bold,fontSize=8.4,textColor=colors.white)
    rng=('Από '+fmt_ddmmyyyy(frm) if frm else 'Όλες οι ημερομηνίες')+(' έως '+fmt_ddmmyyyy(to) if to else '')
    story=[Paragraph(esc(gr_upper(s.get('organization_name','')))+'  ·  ΜΕΓΑΛΗ ΓΡΑΜΜΑΤΕΙΑ',small),Spacer(1,2*mm),Paragraph('Πρόγραμμα Επισκέψεων στις Στοές',title),
           Paragraph(esc(rng+'  ·  '+(prov or 'Όλες οι Επαρχίες')+'  ·  '+f'{len(rows)} επισκέψεις'),sub),Spacer(1,5*mm)]
    data=[[Paragraph(h,hcell) for h in ['Ημερομηνία','Στοά','Τόπος · Επαρχία','Εκπρόσωπος']]];style=[]
    groups={}
    for v in rows:groups.setdefault(v['visit_date'][:7],[]).append(v)
    for k,items in groups.items():
        style.append(('SPAN',(0,len(data)),(-1,len(data))));style.append(('BACKGROUND',(0,len(data)),(-1,len(data)),colors.HexColor('#e7ecf8')))
        data.append([Paragraph(esc(gr_upper(month_title(k)))+f'  ·  {len(items)}',ParagraphStyle('vrm',parent=cellb,textColor=colors.HexColor('#1f3f8f'))),'','',''])
        for v in items:
            r=reps.get(v.get('rep_id'))
            data.append([Paragraph(esc(day_str(v['visit_date'])).replace(' ','<br/>',1),cell),
                         Paragraph(esc(v['lodge'])+(' Αρ. '+esc(v['lodge_number']) if v.get('lodge_number') else '')+('<br/><font size=7 color="#9c7a22">'+esc(v['notes'])+'</font>' if v.get('notes') else ''),cellb),
                         Paragraph(esc(v.get('location') or '—')+('<br/>'+esc(v['province']) if v.get('province') else ''),cell),
                         Paragraph(esc(rep_label(r))+('<br/>'+esc(rep_first_office(r)) if rep_first_office(r) else '') if r else '<font color="#9a4a12">Δεν έχει οριστεί</font>',cell)])
    t=Table(data,colWidths=[27*mm,50*mm,52*mm,57*mm],repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#15203a')),('GRID',(0,0),(-1,-1),.25,colors.HexColor('#dde2ec')),('VALIGN',(0,0),(-1,-1),'TOP')]+style))
    story.append(t);story.append(Spacer(1,4*mm));story.append(Paragraph('Δημιουργήθηκε '+datetime.now().strftime('%d/%m/%Y %H:%M'),sub))
    doc.build(story)
    fn='programma-episkepseon'+(f'-{frm}' if frm else '')+(f'_{to}' if to else '')+'.pdf'
    return Response(b.getvalue(),media_type='application/pdf',headers={'Content-Disposition':f'attachment; filename="{fn}"'})
