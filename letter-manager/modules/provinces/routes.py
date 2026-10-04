# Επαρχιακές Μεγάλες Στοές — σελίδες: λίστα, νέα, επεξεργασία.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

def _province_form(x=None):
    x=x or {'kind':'Επαρχιακή','active':1,'sort_order':100}
    v=lambda k:esc(str(x.get(k) if x.get(k) is not None else ''))
    kinds=''.join(f'<option{" selected" if x.get("kind")==k else ""}>{k}</option>' for k in PROVINCE_KINDS)
    return f"""<div class="grid card">
<div><label>Συντομογραφία</label><input name="short" value="{v('short')}" required placeholder="π.χ. ΕπΜΣτ. Αθηνών"></div>
<div><label>Είδος</label><select name="kind">{kinds}</select></div>
<div class="full"><label>Πλήρης τίτλος</label><input name="full_title" value="{v('full_title')}"></div>
<div class="full"><label>«Προς» — όπως τυπώνεται στην Επιστολή</label><input name="addressee" value="{v('addressee')}" placeholder="π.χ. ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Αθηνών"></div>
<div><label>Email Γραμματείας</label><input type="email" name="email" value="{v('email')}"></div>
<div><label>Γραμματέας (ονοματεπώνυμο)</label><input name="secretary_name" value="{v('secretary_name')}"></div>
<div><label>Επαρχιακός Μέγας Διδάσκαλος</label><input name="master_name" value="{v('master_name')}"></div>
<div><label>Email ΕπΜΔ</label><input type="email" name="master_email" value="{v('master_email')}"></div>
<div><label>Σειρά εμφάνισης</label><input name="sort_order" inputmode="numeric" value="{v('sort_order')}"></div>
<div><label>Κατάσταση</label><select name="active"><option value="1"{" selected" if x.get("active") else ""}>Ενεργή</option><option value="0"{"" if x.get("active") else " selected"}>Ανενεργή (κρυφή από τις λίστες)</option></select></div>
<div class="full"><label>Σημειώσεις</label><textarea name="notes" style="min-height:80px">{v('notes')}</textarea></div>
</div>"""

def _province_admin(req):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    return u

@app.get('/provinces')
def provinces_page(req:Request,msg:str=''):
    u=_province_admin(req)
    counts={}
    for x in _lodges_all():counts[x.get('provincial') or '']=counts.get(x.get('provincial') or '',0)+1
    rows=''.join(f"""<tr><td><b>{esc(p['short'])}</b><br><small class="muted">{esc(p.get('full_title') or '')}</small></td><td>{esc(p.get('kind') or '')}</td><td>{esc(p.get('email') or '—')}</td><td>{esc(p.get('addressee') or '')}</td><td>{esc(p.get('secretary_name') or '')}</td><td>{'' if p.get('kind')=='Εθνική' else f'<a href="/lodges?prov={quote(p["short"])}">{counts.get(p["short"],0)}</a>'}</td><td>{'Ενεργή' if p.get('active') else '<span class="muted">Ανενεργή</span>'}</td><td><a class="btn" href="/provinces/edit/{p['id']}">Edit</a></td></tr>""" for p in provinces_all())
    notice=f"<div class='card'><b>{esc(msg)}</b></div>" if msg else ''
    return page(f"""<h1>Επαρχιακές Μεγάλες Στοές</h1>{notice}<div class="toolbar"><a class="btn primary" href="/provinces/new">+ Νέα εγγραφή</a><a class="btn" href="/lodges">Συμβολικές Στοές</a></div>
<div class="card"><p style="margin-top:0">Επαρχιακές / Περιφερειακή Μεγάλη Στοά και ΕΜΣτΕ. Από εδώ τροφοδοτούνται οι παραλήπτες των Επιστολών («Προς» και email)
και η επιλογή «ΕπΜΣτ.» των Συμβολικών Στοών. Μια διόρθωση εδώ ισχύει αμέσως παντού· αν αλλάξει η συντομογραφία, ακολουθούν και οι Στοές της.</p></div>
<div class="card" style="overflow:auto"><table><tr><th>Μεγάλη Στοά</th><th>Είδος</th><th>Email</th><th>«Προς»</th><th>Γραμματέας</th><th>Στοές</th><th>Κατάσταση</th><th>Ενέργειες</th></tr>{rows}</table></div>""",u,'Επαρχιακές Μεγάλες Στοές')

@app.get('/provinces/new')
def provinces_new(req:Request):
    u=_province_admin(req)
    return page('<h1>Νέα Μεγάλη Στοά</h1><form method="post">'+_province_form()+'<button class="primary">Αποθήκευση</button></form>',u,'Νέα Μεγάλη Στοά')

@app.post('/provinces/new')
async def provinces_new_save(req:Request):
    _province_admin(req)
    d=_province_from_form(await req.form())
    with con() as c:_province_save(c,d)
    return RedirectResponse('/provinces?msg='+quote('Η εγγραφή αποθηκεύτηκε.'),303)

@app.get('/provinces/edit/{pid}')
def provinces_edit(req:Request,pid:int):
    u=_province_admin(req)
    x=province_get(pid)
    if not x:raise HTTPException(404)
    return page(f'<h1>{esc(x["short"])}</h1><form method="post">'+_province_form(x)+'<button class="primary">Αποθήκευση</button></form>',u,'Επεξεργασία Μεγάλης Στοάς')

@app.post('/provinces/edit/{pid}')
async def provinces_edit_save(req:Request,pid:int):
    _province_admin(req)
    if not province_get(pid):raise HTTPException(404)
    d=_province_from_form(await req.form())
    with con() as c:_province_save(c,d,pid)
    return RedirectResponse('/provinces?msg='+quote('Η εγγραφή ενημερώθηκε.'),303)
