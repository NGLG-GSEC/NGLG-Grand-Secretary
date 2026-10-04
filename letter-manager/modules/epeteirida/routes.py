# Επετηρίδα — σελίδα και PDF.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

# ΕΠΕΤΗΡΙΔΑ ΜΕΓΑΛΩΝ ΑΞΙΩΜΑΤΙΚΩΝ — αναφορά/μητρώο ιστορικού διορισμών και απονομών.
# Διαβάζει από το member_degrees_offices (ήδη προβλεπόταν στο σχήμα αλλά δεν
# γραφόταν πουθενά πριν): εκεί γράφονται τόσο τα ιστορικά δεδομένα (bootstrap,
# χωρίς decree_id) όσο και κάθε νέο Διάταγμα ΔΙΟΡΙΖΟΜΕΝ/ΑΠΟΝΕΜΕΙ (με decree_id),
# ώστε το μητρώο να "τροφοδοτείται" συνεχώς από ένα ενιαίο σημείο αλήθειας.

EP_ACTION_LABELS={'appoint':'ΔΙΟΡΙΖΟΜΕΝ','award':'ΑΠΟΝΕΜΕΙ','service_award':'ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ','historical':'Ιστορική εγγραφή'}

def _ep_office_label(meta,a):
    action=meta.get('action','appoint')
    if action=='appoint':return a.get('office') or meta.get('decree_office') or ''
    if action=='award':return ('Πρώην '+meta['award_office']) if meta.get('award_office') else ''
    return 'Τάξις του Μεγάλου Διδασκάλου δι’ Υπηρεσίας'

def _ep_rows():
    with con() as c:
        rows=[dict(r) for r in c.execute("""
            SELECT o.id AS row_id,o.member_id,o.record_type,o.office,o.decree_id,o.decree_no,o.decree_year,
                   m.surname AS m_surname,m.first_name AS m_first_name,d.decree_date
            FROM member_degrees_offices o
            LEFT JOIN member_registry m ON m.id=o.member_id
            LEFT JOIN decree_documents d ON d.id=o.decree_id
            ORDER BY o.decree_year DESC,COALESCE(o.decree_no,0) DESC,o.id DESC
        """)]
    out=[]
    for r in rows:
        action=r['record_type'] or 'appoint'
        office=r['office'] or ''
        surname=r['m_surname'] or ''
        first_name=r['m_first_name'] or ''
        full_name=(first_name+' '+surname).strip()
        out.append({'decree_id':r['decree_id'],'decree_no':r['decree_no'],'decree_year':r['decree_year'],'decree_date':r.get('decree_date') or '',
                    'action':action,'office':office,'surname':surname,'first_name':first_name,'full_name':full_name,'member_id':r['member_id']})
    return out

def _ep_filtered(q='',year='',office='',action=''):
    rows=_ep_rows()
    ql=q.strip().lower()
    if ql:
        rows=[r for r in rows if ql in r['full_name'].lower() or ql in r['surname'].lower() or ql in r['first_name'].lower() or ql in r['office'].lower()]
    if year:rows=[r for r in rows if str(r['decree_year'])==str(year)]
    if office:rows=[r for r in rows if r['office']==office]
    if action:rows=[r for r in rows if r['action']==action]
    def prec_of(r):
        p=DEC_MAP.get(r['office'],{}).get('precedence') if r['action']=='appoint' else None
        return p if p is not None else 9999
    rows.sort(key=lambda r:(-int(r['decree_year'] or 0),-int(r['decree_no'] or 0),prec_of(r),r['surname'],r['first_name']))
    return rows

@app.get('/epeteirida')
def epeteirida(req:Request,q:str='',year:str='',office:str='',action:str=''):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    all_rows=_ep_rows()
    years=sorted({str(r['decree_year']) for r in all_rows if r['decree_year']},reverse=True)
    offices=sorted({r['office'] for r in all_rows if r['office']})
    rows=_ep_filtered(q,year,office,action)
    limit=300;shown=rows[:limit]
    row_html=[]
    for r in shown:
        mlink=f" · <a href='/members/edit/{r['member_id']}'>Μητρώο</a>" if r['member_id'] else ''
        ddate=esc(r['decree_date'][:10]) if r['decree_date'] else ''
        dec_cell=f"<a href='/decrees/{r['decree_id']}'>{r['decree_no']}/{r['decree_year']}</a>" if r['decree_id'] else esc(str(r['decree_year'] or ''))
        row_html.append(f"<tr><td>{esc(r['surname'])}</td><td>{esc(r['first_name'])}</td><td>{esc(r['office'])}</td>"
                         f"<td class='official-number'>{dec_cell}</td>"
                         f"<td class='official-number'>{ddate}</td>"
                         f"<td>{esc(EP_ACTION_LABELS.get(r['action'],r['action']))}{mlink}</td></tr>")
    rows_html=''.join(row_html) or "<tr><td colspan=6>Δεν βρέθηκαν εγγραφές.</td></tr>"
    year_opts="<option value=''>Όλα τα έτη</option>"+''.join(f"<option value='{y}' {'selected' if y==year else ''}>{y}</option>" for y in years)
    office_opts="<option value=''>Όλα τα αξιώματα</option>"+''.join(f"<option value='{esc(o)}' {'selected' if o==office else ''}>{esc(o)}</option>" for o in offices)
    action_opts="<option value=''>Όλες οι πράξεις</option>"+''.join(f"<option value='{k}' {'selected' if k==action else ''}>{esc(v)}</option>" for k,v in EP_ACTION_LABELS.items())
    qs='&'.join(f'{k}={quote(v)}' for k,v in [('q',q),('year',year),('office',office),('action',action)] if v)
    pdf_href='/epeteirida/pdf'+(('?'+qs) if qs else '')
    count_note=f" (εμφανίζονται οι πρώτες {limit})" if len(rows)>limit else ''
    return page(f"""<h1>Επετηρίδα Μεγάλων Αξιωματικών</h1>
    <p>Ιστορικό μητρώο διορισμών και απονομών αξιωμάτων, υπολογισμένο αυτόματα από τα εκδοθέντα Διατάγματα.</p>
    <form class="filters"><input name="q" value="{esc(q)}" placeholder="Επώνυμο, όνομα ή αξίωμα"><select name="year">{year_opts}</select><select name="office">{office_opts}</select><select name="action">{action_opts}</select><button>Αναζήτηση</button></form>
    <div class="toolbar" style="margin:10px 0"><a class="btn primary" href="{pdf_href}">⬇ Εκτύπωση Τεύχους (PDF)</a><span style="margin-left:10px;color:#667">{len(rows)} εγγραφές{count_note}</span></div>
    <div class="card"><table><tr><th>Επώνυμο</th><th>Όνομα</th><th>Αξίωμα</th><th>Διάταγμα</th><th>Ημερομηνία</th><th>Πράξη</th></tr>{rows_html}</table></div>
    """,u,'Επετηρίδα Μεγάλων Αξιωματικών')

@app.get('/epeteirida/pdf')
def epeteirida_pdf(req:Request,q:str='',year:str='',office:str='',action:str=''):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    rows=_ep_filtered(q,year,office,action)
    s=settings();regular,bold=_pdf_fonts();b=BytesIO()
    doc=SimpleDocTemplate(b,pagesize=A4,leftMargin=15*mm,rightMargin=15*mm,topMargin=12*mm,bottomMargin=16*mm,title='Επετηρίδα Μεγάλων Αξιωματικών')
    cen=ParagraphStyle('epcen',fontName=regular,fontSize=10.5,leading=13,alignment=1)
    org=ParagraphStyle('eporg',parent=cen,fontName=bold,fontSize=17,leading=20)
    hcell=ParagraphStyle('ephc',fontName=bold,fontSize=8.5,textColor=colors.white)
    cell=ParagraphStyle('epc',fontName=regular,fontSize=8.5,leading=10.5)
    story=[]
    try:story.append(RLImage(BytesIO(_raw_asset('header_emblem.png')),width=30*mm,height=20*mm))
    except Exception:pass
    story += [Paragraph(html.escape(s['organization_name']),org),
              Paragraph('Έτος Ιδρύσεως '+html.escape(s['founded_year']),cen),
              HRFlowable(width='100%',thickness=.8,color=colors.HexColor('#B18A43'),spaceBefore=5,spaceAfter=7),
              Paragraph('ΕΠΕΤΗΡΙΔΑ ΜΕΓΑΛΩΝ ΑΞΙΩΜΑΤΙΚΩΝ',ParagraphStyle('eptitle',parent=cen,fontName=bold,fontSize=14,spaceBefore=6,spaceAfter=2)),
              Paragraph(date.today().strftime('%d/%m/%Y'),cen),Spacer(1,6*mm)]
    header=[Paragraph(h,hcell) for h in ['Επώνυμο','Όνομα','Αξίωμα','Διάταγμα','Έτος']]
    data=[header]
    for r in rows:
        dec_txt=f"{r['decree_no']}/{r['decree_year']}" if r['decree_no'] else '—'
        data.append([Paragraph(esc(r['surname']),cell),Paragraph(esc(r['first_name']),cell),Paragraph(esc(r['office']),cell),
                     Paragraph(dec_txt,cell),Paragraph(str(r['decree_year'] or ''),cell)])
    t=Table(data,colWidths=[32*mm,30*mm,68*mm,28*mm,17*mm],repeatRows=1)
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#123B7A')),('GRID',(0,0),(-1,-1),.4,colors.HexColor('#cccccc')),
                            ('VALIGN',(0,0),(-1,-1),'TOP'),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F7F6F2')])]))
    story.append(t);story.append(Spacer(1,10*mm))
    def col(title,name,img,clean=False):
        qz=[Paragraph(title,ParagraphStyle('epst'+name,parent=cen,fontName=bold,fontSize=9))]
        try:qz.append(RLImage(BytesIO(_clean_asset(img,'white') if clean else _raw_asset(img)),width=46*mm,height=16*mm))
        except Exception:qz.append(Spacer(1,16*mm))
        qz += [HRFlowable(width=48*mm,thickness=.6,color=colors.HexColor('#123B7A')),Paragraph(name,ParagraphStyle('epsn'+name,parent=cen,fontName=bold,fontSize=9))]
        return qz
    try:seal=[RLImage(BytesIO(_clean_asset('seal_original.png','black')),width=40*mm,height=40*mm)]
    except Exception:seal=[Spacer(1,40*mm)]
    sig=Table([[col('ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ','Δημήτριος Σκιαδόπουλος','signature_original.png',True),seal,col('Ο ΜΕΓΑΣ ΔΙΔΑΣΚΑΛΟΣ','Ιωάννης Μπενετάτος','signature_grand_master.png')]],colWidths=[62*mm,46*mm,62*mm])
    sig.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('ALIGN',(0,0),(-1,-1),'CENTER')]))
    story.append(sig)
    def _ep_footer(canvas,doc_):
        canvas.saveState();canvas.setFont(regular,7.5)
        canvas.drawRightString(A4[0]-15*mm,10*mm,f"Σελίδα {doc_.page}")
        canvas.restoreState()
    doc.build(story,onFirstPage=_ep_footer,onLaterPages=_ep_footer)
    fn='EPETIRIDA_MEGALON_AXIOMATIKON_'+datetime.now().strftime('%Y%m%d_%H%M')+'.pdf'
    return Response(b.getvalue(),media_type='application/pdf',headers={'Content-Disposition':"attachment; filename*=UTF-8''"+quote(fn)})
