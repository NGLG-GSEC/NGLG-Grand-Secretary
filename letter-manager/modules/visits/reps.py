# Εκπρόσωποι ΜΔ — λίστα, νέος/επεξεργασία, επικόλληση πίνακα, βαθμοί ανά αξίωμα, συμπλήρωση από την Επετηρίδα.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

def _rep_form(r=None):
    r=r or {};v=lambda k:esc(str(r.get(k) or ''))
    ranks=''.join(f'<option{" selected" if r.get("rep_rank")==x else ""}>{x}</option>' for x in REP_RANKS)
    return f"""<div class="grid card">
<div><label>Όνομα</label><input name="name" value="{v('name')}" required></div>
<div><label>Επώνυμο</label><input name="surname" value="{v('surname')}" required></div>
<div class="full"><label>Αξίωμα</label><input name="office" value="{v('office')}" placeholder="π.χ. Μέγας Καγκελάριος ή Πρώην Μέγας Ευχέτης· πολλά με « · »"></div>
<div><label>Έτος</label><input name="year" value="{v('year')}" inputmode="numeric"></div>
<div><label>Βαθμός</label><select name="rep_rank"><option value="">Αυτόματα από το αξίωμα{(' ('+esc(rep_rank(dict(r,rep_rank='')))+')') if r.get('office') else ''}</option>{ranks}</select></div>
<div><label>Email</label><input type="email" name="email" value="{v('email')}"></div>
<div><label>Κινητό</label><input type="tel" name="mobile" value="{v('mobile')}"></div>
<div><label>Αρ. μέλους στο Μητρώο (προαιρετικό)</label><input name="member_id" value="{v('member_id')}" inputmode="numeric"><small>Αν λείπει email/κινητό, χρησιμοποιούνται του μέλους.</small></div>
<div class="full"><label>Σημειώσεις</label><input name="notes" value="{v('notes')}"></div></div>"""

def _rep_from_form(f):
    d={k:str(f.get(k,'') or '').strip() for k in REP_COLS}
    if not d['name'] or not d['surname']:raise HTTPException(400,'Συμπληρώστε όνομα και επώνυμο.')
    if d['rep_rank'] not in REP_RANKS:d['rep_rank']=''
    if d['email'] and not EMAIL_RE.match(d['email']):raise HTTPException(400,'Μη έγκυρο email.')
    d['member_id']=int(d['member_id']) if d['member_id'].isdigit() else None
    return d

def _rep_save(d,rid=None,ext_id=''):
    ts=now()
    with con() as c:
        if rid:c.execute('UPDATE reps SET '+','.join(k+'=?' for k in REP_COLS)+',updated_at=? WHERE id=?',tuple(d.get(k) for k in REP_COLS)+(ts,rid))
        else:c.execute('INSERT INTO reps('+','.join(REP_COLS)+',ext_id,created_at,updated_at) VALUES('+','.join('?'*(len(REP_COLS)+3))+')',tuple(d.get(k) for k in REP_COLS)+(ext_id,ts,ts))

@app.get('/reps')
def reps_page(req:Request,q:str='',f:str='',rk:str='',msg:str=''):
    u=_visits_admin(req);rm=rep_rankmap();allr=reps_all();today=date.today().isoformat()
    cnt={}
    for v in visits_all():
        if v['visit_date']>=today and v.get('rep_id'):cnt[v['rep_id']]=cnt.get(v['rep_id'],0)+1
    ql=_snorm(q)
    xs=[r for r in allr if (not f or (f=='past')==rep_is_past(r)) and (not rk or rep_rank(r,rm)==rk)
        and (not ql or all(w in _snorm(' '.join(str(r.get(k) or '') for k in ('surname','name','office','year','email','mobile'))+' '+rep_rank(r,rm)) for w in ql.split()))]
    rows=''.join(f"""<tr><td><b>{esc(r['surname'])}</b><div class="muted">{esc(rep_rank(r,rm))}</div></td><td>{esc(r['name'])}<div class="muted">{esc(' · '.join(x for x in rep_contact(r) if x))}</div></td><td>{esc(r.get('office') or '')}</td><td>{esc(r.get('year') or '')}</td><td>{cnt.get(r['id'],0)}</td><td><a class="btn" href="/reps/edit/{r['id']}">Επεξεργασία</a></td></tr>""" for r in xs)
    rks=''.join(f'<option{" selected" if x==rk else ""}>{x}</option>' for x in reversed(REP_RANKS))
    notice=f"<div class='card'><b>{esc(msg)}</b></div>" if msg else ''
    return page(f"""<h1>Εκπρόσωποι ΜΔ</h1>{notice}<div class="toolbar"><a class="btn primary" href="/reps/new">+ Νέος εκπρόσωπος</a><a class="btn" href="/reps/import">Επικόλληση πίνακα</a><a class="btn" href="/reps/ranks">Βαθμοί ανά αξίωμα</a>
<form method="post" action="/reps/from-epeteirida" style="display:inline" onsubmit="return confirm('Προσθήκη όσων Μεγάλων Αξιωματικών της Επετηρίδας λείπουν;')"><button>Συμπλήρωση από Επετηρίδα</button></form><a class="btn" href="/visits">Επισκέψεις</a></div>
<form class="card filters" method="get"><input name="q" value="{esc(q)}" placeholder="Όνομα, αξίωμα, email…"><select name="f"><option value="">Όλοι</option><option value="cur"{' selected' if f=='cur' else ''}>Εν ενεργεία</option><option value="past"{' selected' if f=='past' else ''}>Πρώην</option></select><select name="rk"><option value="">Όλοι οι βαθμοί</option>{rks}</select><button>Αναζήτηση</button></form>
<p><b>{len(xs)}</b> από {len(allr)} εκπρόσωποι · <b>{sum(1 for r in allr if not rep_is_past(r))}</b> εν ενεργεία</p>
<div class="card" style="overflow:auto"><table><tr><th>Επώνυμο</th><th>Όνομα</th><th>Αξίωμα</th><th>Έτος</th><th>Προσεχείς</th><th>Ενέργειες</th></tr>{rows or '<tr><td colspan=6>Κανένας εκπρόσωπος.</td></tr>'}</table></div>""",u,'Εκπρόσωποι')

@app.get('/reps/new')
def reps_new(req:Request):
    u=_visits_admin(req)
    return page('<h1>Νέος εκπρόσωπος</h1><form method="post">'+_rep_form()+'<button class="primary">Αποθήκευση</button> <a class="btn" href="/reps">Άκυρο</a></form>',u,'Νέος εκπρόσωπος')

@app.post('/reps/new')
async def reps_new_save(req:Request):
    _visits_admin(req);_rep_save(_rep_from_form(await req.form()))
    return RedirectResponse('/reps?msg='+quote('Ο εκπρόσωπος αποθηκεύτηκε.'),303)

@app.get('/reps/edit/{rid}')
def reps_edit(req:Request,rid:int):
    u=_visits_admin(req);r=rep_get(rid)
    if not r:raise HTTPException(404)
    return page(f'''<h1>{esc(r["surname"])} {esc(r["name"])}</h1><form method="post">{_rep_form(r)}<button class="primary">Αποθήκευση</button> <a class="btn" href="/reps">Άκυρο</a></form>
<form method="post" action="/reps/delete/{rid}" onsubmit="return confirm('Διαγραφή του εκπροσώπου; Οι επισκέψεις του θα μείνουν χωρίς εκπρόσωπο.')" style="margin-top:12px"><button>Διαγραφή</button></form>''',u,'Εκπρόσωπος')

@app.post('/reps/edit/{rid}')
async def reps_edit_save(req:Request,rid:int):
    _visits_admin(req)
    if not rep_get(rid):raise HTTPException(404)
    _rep_save(_rep_from_form(await req.form()),rid)
    return RedirectResponse('/reps?msg='+quote('Ο εκπρόσωπος ενημερώθηκε.'),303)

@app.post('/reps/delete/{rid}')
def reps_delete(req:Request,rid:int):
    _visits_admin(req)
    with con() as c:c.execute('UPDATE visits SET rep_id=NULL WHERE rep_id=?',(rid,));c.execute('DELETE FROM reps WHERE id=?',(rid,))
    return RedirectResponse('/reps?msg='+quote('Ο εκπρόσωπος διαγράφηκε.'),303)

@app.get('/reps/import')
def reps_import_page(req:Request):
    u=_visits_admin(req)
    return page('''<h1>Επικόλληση πίνακα εκπροσώπων</h1><form method="post" class="card"><p>Μία γραμμή ανά πρόσωπο, στήλες: Όνομα · Επώνυμο · Βαθμός · Αξίωμα · Email (προαιρετικό).
Αντιγράψτε απευθείας από Excel/Word ή χωρίστε με « ; ».</p><textarea name="text" required></textarea><button class="primary">Εισαγωγή</button> <a class="btn" href="/reps">Άκυρο</a></form>''',u,'Επικόλληση εκπροσώπων')

@app.post('/reps/import')
def reps_import(req:Request,text:str=Form('')):
    u=_visits_admin(req);ok=[];bad=[]
    for line in [x.strip() for x in text.splitlines() if x.strip()]:
        d=parse_rep_line(line)
        if d and d['email'] and not EMAIL_RE.match(d['email']):d=None
        (ok if d else bad).append(d or line)
    for d in ok:_rep_save(d)
    if bad:return page(f'<h1>Επικόλληση πίνακα εκπροσώπων</h1><div class="card"><b>Προστέθηκαν {len(ok)}.</b> Δεν αναγνωρίστηκαν:</div><form method="post" class="card"><textarea name="text">{esc(chr(10).join(bad))}</textarea><button class="primary">Εισαγωγή</button> <a class="btn" href="/reps">Επιστροφή</a></form>',u,'Επικόλληση εκπροσώπων')
    return RedirectResponse('/reps?msg='+quote(f'Προστέθηκαν {len(ok)} εκπρόσωποι.'),303)

@app.get('/reps/ranks')
def reps_ranks(req:Request):
    u=_visits_admin(req);rm=rep_rankmap()
    offices=sorted({o for r in reps_all() for o in rep_base_offices(r)}|set(REP_DEFAULT_RANKS),key=_snorm)
    rows=''.join(f'<tr><td>{esc(o)}</td><td><select name="r::{esc(o)}">'+''.join(f'<option value="{i}"{" selected" if rm.get(o,REP_DEFAULT_RANKS.get(o,0))==i else ""}>{x}</option>' for i,x in enumerate(REP_RANKS))+'</select></td></tr>' for o in offices)
    return page(f'''<h1>Βαθμοί ανά αξίωμα</h1><div class="card">Ο βαθμός κάθε εκπροσώπου προκύπτει από το αξίωμά του (εν ενεργεία ή πρώην)· με περισσότερα αξιώματα ισχύει ο υψηλότερος.
Βαθμός που ορίζεται χειροκίνητα στον εκπρόσωπο υπερισχύει.</div><form method="post" class="card"><table><tr><th>Αξίωμα</th><th>Βαθμός</th></tr>{rows}</table><button class="primary">Αποθήκευση</button> <a class="btn" href="/reps">Άκυρο</a></form>''',u,'Βαθμοί ανά αξίωμα')

@app.post('/reps/ranks')
async def reps_ranks_save(req:Request):
    _visits_admin(req);f=await req.form()
    rm={k[3:]:int(v) for k,v in f.items() if k.startswith('r::') and str(v).isdigit() and int(v)<len(REP_RANKS)}
    rm={k:v for k,v in rm.items() if REP_DEFAULT_RANKS.get(k,0)!=v}
    with con() as c:c.execute('REPLACE INTO settings VALUES(?,?)',('visits_rankmap',json.dumps(rm,ensure_ascii=False)))
    return RedirectResponse('/reps?msg='+quote('Οι βαθμοί αποθηκεύτηκαν.'),303)

@app.post('/reps/from-epeteirida')
def reps_from_epeteirida(req:Request):
    # Κάθε Μεγάλος Αξιωματικός της Επετηρίδας που δεν υπάρχει ήδη ως εκπρόσωπος (ίδιο μέλος ή ίδιο ονοματεπώνυμο).
    _visits_admin(req);have_m={r['member_id'] for r in reps_all() if r.get('member_id')}
    have_n={(_snorm(r['surname']),_snorm(r['name'])) for r in reps_all()}
    with con() as c:
        rows=[dict(r) for r in c.execute("""SELECT o.member_id,o.office,o.decree_year,o.is_current,m.surname,m.first_name
            FROM member_degrees_offices o JOIN member_registry m ON m.id=o.member_id
            WHERE COALESCE(o.office,'')<>'' AND COALESCE(o.record_type,'appoint') IN ('appoint','historical')""")]
    latest={}
    for e in rows:  # το πιο πρόσφατο αξίωμα κάθε μέλους· τα εν ενεργεία προηγούνται
        k=(int(bool(e['is_current'])),int(e['decree_year'] or 0));cur=latest.get(e['member_id'])
        if not cur or k>cur[0]:latest[e['member_id']]=(k,e)
    added=0
    for mid,(k,e) in latest.items():
        if mid in have_m or (_snorm(e['surname'] or ''),_snorm(e['first_name'] or '')) in have_n or not e['surname']:continue
        _rep_save({'name':e['first_name'] or '','surname':e['surname'],'rep_rank':'','office':('' if e['is_current'] else 'Πρώην ')+e['office'],
                   'year':str(e['decree_year'] or ''),'email':'','mobile':'','member_id':mid,'notes':'Από την Επετηρίδα'});added+=1
    return RedirectResponse('/reps?msg='+quote(f'Προστέθηκαν {added} εκπρόσωποι από την Επετηρίδα.'),303)
