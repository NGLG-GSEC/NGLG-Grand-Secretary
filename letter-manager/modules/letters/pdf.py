# Επιστολές — παραγωγή PDF.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

@app.get('/pdf/{lid}')
def download_pdf(req:Request,lid:int):
    u=need(req);s=settings()
    with con() as c:r=c.execute('SELECT * FROM letters WHERE id=?',(lid,)).fetchone()
    if not r:raise HTTPException(404)
    x=dict(r);profile=signer_profile(x.get('signer') or 'dimitrios',s);regular,bold=_pdf_fonts()
    buff=BytesIO()
    doc=SimpleDocTemplate(buff,pagesize=A4,leftMargin=16*mm,rightMargin=16*mm,topMargin=12*mm,bottomMargin=16*mm,title=x['subject'])
    dark=colors.HexColor('#0B2F63');blue=colors.HexColor('#123B7A');gold=colors.HexColor('#B18A43')
    center=ParagraphStyle('center',fontName=regular,fontSize=10.5,leading=13,alignment=1,textColor=dark)
    org=ParagraphStyle('org',parent=center,fontName=bold,fontSize=18,leading=21)
    body_style=ParagraphStyle('body',fontName=regular,fontSize=11.2,leading=16,textColor=colors.HexColor('#1F355D'),spaceAfter=5)
    meta_style=ParagraphStyle('meta',fontName=regular,fontSize=10.5,leading=13,textColor=dark)
    name_style=ParagraphStyle('name',fontName=bold,fontSize=10.7,leading=13,alignment=1,textColor=colors.HexColor('#1F355D'))
    title_style=ParagraphStyle('gstitle',fontName=bold,fontSize=12.5,leading=15,alignment=1,textColor=dark)
    story=[]
    try:
        story.append(RLImage(BytesIO(_raw_asset('header_emblem.png')),width=34*mm,height=23*mm))
    except Exception:
        pass
    story += [
      Paragraph(html.escape(s['organization_name']),org),
      Paragraph('Έτος Ιδρύσεως '+html.escape(s['founded_year']),ParagraphStyle('gold',parent=center,textColor=gold)),
      Paragraph(html.escape(s['grand_master_title']),center),
      Paragraph(html.escape(s['grand_master_name']),center),
      HRFlowable(width='100%',thickness=.8,color=gold,spaceBefore=5,spaceAfter=8)
    ]
    dtext=datetime.fromisoformat(x['letter_date']).strftime('%d/%m/%Y')
    meta=Table([[Paragraph('Αρ. Πρωτ.: <b>'+html.escape(x['protocol_no'])+'</b>',meta_style),Paragraph('Ημερομηνία: <b>'+dtext+'</b>',meta_style)]],colWidths=[88*mm,88*mm])
    meta.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('ALIGN',(1,0),(1,0),'RIGHT'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    story += [meta,Spacer(1,5*mm)]
    if x['recipient_name']:story.append(Paragraph('<b>Προς:</b> '+html.escape(x['recipient_name']),body_style))
    story.append(Paragraph('<b>Θέμα:</b> '+html.escape(x['subject']),body_style))
    story.append(Spacer(1,2*mm))
    story.append(Paragraph(_pdf_linkify(x['body']),body_style))
    story.append(Spacer(1,7*mm))
    story.append(Paragraph(html.escape(s['closing']),body_style))
    sig_flow=[]
    try:
        sig_bytes=_raw_asset(profile['asset']) if profile['key']=='nikolaos' else _clean_asset(profile['asset'],'white')
        sig_flow.append(RLImage(BytesIO(sig_bytes),width=55*mm,height=22*mm))
    except Exception:
        sig_flow.append(Spacer(1,22*mm))
    # 22 mm signature + 2 mm spacer = line at 24 mm from the top.
    # The 48 mm seal has its centre at 24 mm, so the seal centre and signature line align.
    sig_flow.append(Spacer(1,2*mm))
    sig_flow.append(HRFlowable(width=58*mm,thickness=.7,color=blue,spaceBefore=0,spaceAfter=3))
    sig_flow.append(Paragraph(html.escape(profile['name']),name_style))
    sig_flow.append(Paragraph(html.escape(profile['title']),title_style))
    sig_flow.append(Paragraph(html.escape(s['organization_name']),center))
    try:
        seal_flow=[RLImage(BytesIO(_clean_asset('seal_original.png','black')),width=48*mm,height=48*mm)]
    except Exception:
        seal_flow=[Spacer(1,48*mm)]
    sigtab=Table([[sig_flow,seal_flow]],colWidths=[92*mm,60*mm],hAlign='CENTER')
    sigtab.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('ALIGN',(0,0),(-1,-1),'CENTER'),('LEFTPADDING',(0,0),(-1,-1),0),('RIGHTPADDING',(0,0),(-1,-1),0),('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)]))
    story += [Spacer(1,4*mm),sigtab]
    doc.build(story)
    safe_subject=re.sub(r'[\\/:*?"<>|\r\n\t]+',' ',str(x['subject'] or '')).strip()
    safe_subject=re.sub(r'\s+',' ',safe_subject)
    filename=f"{x['protocol_no']}{safe_subject}.pdf" if safe_subject else f"{x['protocol_no']}.pdf"
    headers={'Content-Disposition':"attachment; filename*=UTF-8''"+quote(filename)}
    return Response(buff.getvalue(),media_type='application/pdf',headers=headers)
