# Επιστολές — πρότυπα επιστολών.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

@app.get('/templates')
def tpls(req:Request):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    with con() as c:xs=[dict(r) for r in c.execute("SELECT * FROM letter_templates WHERE name<>'ΔΙΑΤΑΓΜΑΤΑ' ORDER BY name")]
    cards=''.join(f'''<form class="card" method="post"><input type="hidden" name="template_id" value="{x['id']}"><label>Όνομα</label><input name="name" value="{esc(x['name'])}"><label>Κορμός</label><textarea name="body">{esc(x['body'])}</textarea><label>Ενεργό</label><select name="active"><option value="1" {'selected' if x['active'] else ''}>Ναι</option><option value="0" {'selected' if not x['active'] else ''}>Όχι</option></select><br><br><button>Αποθήκευση</button></form>''' for x in xs)
    cards += '''<form class="card" method="post"><h3>Νέο πρότυπο</h3><label>Όνομα</label><input name="name" required><label>Κορμός</label><textarea name="body"></textarea><input type="hidden" name="active" value="1"><button>Προσθήκη</button></form>'''
    return page('<h1>Πρότυπα</h1>'+cards,u)

@app.post('/templates')
def savetpl(req:Request,template_id:str=Form(''),name:str=Form(...),body:str=Form(''),active:str=Form('1')):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    with con() as c:
        if template_id:c.execute('UPDATE letter_templates SET name=?,body=?,active=?,updated_at=? WHERE id=?',(name.strip(),body,1 if active=='1' else 0,now(),int(template_id)))
        else:c.execute('INSERT INTO letter_templates(name,body,active,created_at,updated_at) VALUES(?,?,?,?,?)',(name.strip(),body,1,now(),now()))
    return RedirectResponse('/templates',303)
