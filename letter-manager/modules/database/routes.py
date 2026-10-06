# Βάση Δεδομένων — μία σελίδα για όλα τα δεδομένα της εφαρμογής: προβολή, αναζήτηση, επεξεργασία, Excel,
# και το Βιβλίο Πρωτοκόλλου (Επιστολές + Διατάγματα). Μόνο για διαχειριστές.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

def _db_admin(req):
    u=need(req)
    if not isadmin(u):raise HTTPException(403)
    return u

def _db_cell(v,col=''):
    s='' if v is None else str(v)
    if col=='active' or col=='is_current':return '✓' if s in ('1','True','true') else '—'
    return esc(s if len(s)<=90 else s[:88]+'…')

def _db_xlsx(title,headers,rows,fname):
    wb=Workbook();ws=wb.active;ws.title=title[:31];ws.append(headers)
    for r in rows:ws.append(['' if v is None else (v if isinstance(v,(int,float)) else str(v)) for v in r])
    ws.freeze_panes='A2'
    for cell in ws[1]:cell.font=Font(bold=True,color='FFFFFF');cell.fill=PatternFill('solid',fgColor='1F4E78')
    b=BytesIO();wb.save(b)
    return Response(b.getvalue(),media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',headers={'Content-Disposition':f'attachment; filename="{fname}"'})

@app.get('/database')
def database_home(req:Request):
    u=_db_admin(req)
    groups={}
    for k,s in DB_TABLES.items():groups.setdefault(s['group'],[]).append((k,s))
    n_proto=(db_count('letters') or 0)+(db_count('decree_documents') or 0)
    html_groups=''
    for g,items in groups.items():
        cards=''.join(f"""<a class="card dbcard" href="/database/{k}"><b>{esc(s['label'])}</b><span class="dbn">{db_count(s['table']) if db_count(s['table']) is not None else '—'}</span>
<small class="muted">{'✎ επεξεργάσιμο' if s['edit'] else '👁 μόνο προβολή'}</small></a>""" for k,s in items)
        html_groups+=f'<h2>{esc(g)}</h2><div class="dbgrid">{cards}</div>'
    return page(f"""<h1>🗄 Βάση Δεδομένων</h1>
<style>.dbgrid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin:8px 0 16px}}
.dbcard{{margin:0;display:flex;flex-direction:column;gap:4px;text-decoration:none;color:inherit}}.dbcard:hover{{outline:2px solid #1f4e78}}.dbn{{font-size:1.6rem;font-weight:700;color:#1f4e78}}</style>
<div class="card"><p style="margin-top:0">Όλα τα δεδομένα της εφαρμογής σε μία κοινή βάση. Επιλέξτε πίνακα για αναζήτηση, επεξεργασία ή εξαγωγή σε Excel.
Οι αριθμοί πρωτοκόλλου δεν αλλάζουν από εδώ.</p>
<div class="toolbar"><a class="btn primary" href="/database/protocol">📖 Βιβλίο Πρωτοκόλλου ({n_proto})</a><a class="btn" href="/directory">📇 Κατάλογος</a><a class="btn" href="/system/check">🩺 Έλεγχος συστήματος</a><a class="btn" href="/database/restore">💾 Αντίγραφο ασφαλείας</a></div></div>
{html_groups}""",u,'Βάση Δεδομένων')

@app.get('/database/protocol')
def database_protocol(req:Request,q:str='',year:str='',cat:str='',export:str=''):
    u=_db_admin(req)
    rows=protocol_book(q,year,cat)
    if export:
        return _db_xlsx('ΒΙΒΛΙΟ ΠΡΩΤΟΚΟΛΛΟΥ',['Αρ. Πρωτοκόλλου','Είδος','Ημερομηνία','Θέμα','Παραλήπτης','Κατάσταση'],
                        [[r['protocol_no'],r['cat'],r['d'],r['subject'],r['who'],r['status']] for r in rows],'EMSTE_PROTOKOLLO.xlsx')
    with con() as c:
        ys=sorted({str(r['d'])[:4] for t,dc in (('letters','letter_date'),('decree_documents','decree_date')) for r in c.execute(f'SELECT {dc} AS d FROM {t} WHERE {dc} IS NOT NULL') if r['d']},reverse=True)
    yopts=''.join(f'<option{" selected" if y==year else ""}>{esc(y)}</option>' for y in ys)
    copts=''.join(f'<option{" selected" if c==cat else ""}>{c}</option>' for c in ('Επιστολή','Διάταγμα'))
    body=''.join(f"""<tr><td><b>{esc(r['protocol_no'])}</b></td><td>{r['cat']}</td><td>{esc(r['d'])}</td><td><a href="{r['href']}">{esc(r['subject'] or '(χωρίς θέμα)')}</a></td><td>{esc(r['who'])}</td><td>{esc(r['status'])}</td></tr>""" for r in rows[:500])
    qs=urlencode({'q':q,'year':year,'cat':cat,'export':1})
    return page(f"""<h1>📖 Βιβλίο Πρωτοκόλλου</h1><p><a href="/database">← Βάση Δεδομένων</a></p>
<form class="card toolbar" method="get"><input name="q" value="{esc(q)}" placeholder="🔎 Αριθμός, θέμα, παραλήπτης" style="flex:2;min-width:180px">
<select name="year"><option value="">Όλα τα έτη</option>{yopts}</select><select name="cat"><option value="">Όλα</option>{copts}</select>
<button class="btn primary">Αναζήτηση</button><a class="btn" href="/database/protocol?{qs}">⬇ Excel</a></form>
<p class="muted">{len(rows)} εγγραφές{' (εμφανίζονται οι 500 πιο πρόσφατες)' if len(rows)>500 else ''}</p>
<div class="card" style="overflow:auto"><table><thead><tr><th>Αρ. Πρωτ.</th><th>Είδος</th><th>Ημ/νία</th><th>Θέμα</th><th>Παραλήπτης</th><th>Κατάσταση</th></tr></thead><tbody>{body or '<tr><td colspan=6 class=muted>Δεν βρέθηκαν εγγραφές.</td></tr>'}</tbody></table></div>""",u,'Βιβλίο Πρωτοκόλλου')

@app.get('/database/{key}/export.xlsx')
def database_export(req:Request,key:str,q:str=''):
    _db_admin(req)
    s,cols=db_spec(key);names=[c for c,_ in cols]
    w,p=db_where(s,cols,q)
    with con() as c:rows=c.execute(f"SELECT * FROM {s['table']}{w} ORDER BY {s['order']}",p).fetchall()
    return _db_xlsx(s['label'],[db_label(n) for n in names],[[r[n] for n in names] for r in rows],f'EMSTE_{key.upper()}.xlsx')

@app.get('/database/{key}')
def database_table(req:Request,key:str,q:str='',p:int=1,msg:str=''):
    u=_db_admin(req)
    s,cols=db_spec(key);names={c for c,_ in cols};show=[c for c in s['cols'] if c in names]
    w,params=db_where(s,cols,q);p=max(1,p)
    with con() as c:
        total=c.execute(f"SELECT COUNT(*) n FROM {s['table']}{w}",params).fetchone()['n']
        rows=c.execute(f"SELECT * FROM {s['table']}{w} ORDER BY {s['order']} LIMIT {DB_PAGE_SIZE} OFFSET {(p-1)*DB_PAGE_SIZE}",params).fetchall()
    pages=max(1,(total+DB_PAGE_SIZE-1)//DB_PAGE_SIZE)
    def acts(r):
        a=f'<a class="btn" style="padding:3px 9px;min-height:0" href="{s["page"].format(id=r["id"])}">Άνοιγμα</a>' if s.get('page') else ''
        if s['edit']:a+=f' <a class="btn" style="padding:3px 9px;min-height:0" href="/database/{key}/{r["id"]}">✎ Πεδία</a>'
        return a
    body=''.join('<tr>'+''.join(f'<td>{_db_cell(r[c],c)}</td>' for c in show)+f'<td style="white-space:nowrap">{acts(r)}</td></tr>' for r in rows)
    nav=lambda n,t:f'<a class="btn" href="/database/{key}?{urlencode({"q":q,"p":n})}">{t}</a>'
    pager=(nav(p-1,'← Προηγούμενη') if p>1 else '')+f' <span class="muted">Σελίδα {p} από {pages}</span> '+(nav(p+1,'Επόμενη →') if p<pages else '')
    note=f"<div class='card'><b>{esc(msg)}</b></div>" if msg else ''
    return page(f"""<h1>{esc(s['label'])}</h1><p><a href="/database">← Βάση Δεδομένων</a> · πίνακας <code>{esc(s['table'])}</code></p>{note}
<form class="card toolbar" method="get"><input name="q" value="{esc(q)}" placeholder="🔎 Αναζήτηση" style="flex:2;min-width:180px" autofocus>
<button class="btn primary">Αναζήτηση</button><a class="btn" href="/database/{key}/export.xlsx?{urlencode({'q':q})}">⬇ Excel</a></form>
<p class="muted">{total} εγγραφές</p>
<div class="card" style="overflow:auto"><table><thead><tr>{''.join(f'<th>{esc(db_label(c))}</th>' for c in show)}<th></th></tr></thead><tbody>{body or f'<tr><td colspan={len(show)+1} class=muted>Δεν βρέθηκαν εγγραφές.</td></tr>'}</tbody></table></div>
<div class="toolbar">{pager}</div>""",u,s['label'])

def _db_row(s,rid):
    with con() as c:r=c.execute(f"SELECT * FROM {s['table']} WHERE id=?",(rid,)).fetchone()
    if not r:raise HTTPException(404)
    return r

@app.get('/database/{key}/{rid}')
def database_edit(req:Request,key:str,rid:int):
    u=_db_admin(req)
    s,cols=db_spec(key)
    if not s['edit']:raise HTTPException(404)
    r=_db_row(s,rid);fields=''
    for c,t in cols:
        v='' if r[c] is None else str(r[c])
        if c in DB_READONLY_COLS:fields+=f'<label>{esc(db_label(c))}<input value="{esc(v)}" disabled></label>'
        elif c in DB_LONG_COLS or len(v)>120:fields+=f'<label>{esc(db_label(c))}<textarea name="{esc(c)}" rows="4">{esc(v)}</textarea></label>'
        else:fields+=f'<label>{esc(db_label(c))}<input name="{esc(c)}" value="{esc(v)}"{" inputmode=numeric" if db_is_int(t) else ""}></label>'
    other=f' · <a href="{s["page"].format(id=rid)}">Άνοιγμα στη σελίδα της ενότητας</a>' if s.get('page') else ''
    return page(f"""<h1>{esc(s['label'])} · #{rid}</h1><p><a href="/database/{key}">← {esc(s['label'])}</a>{other}</p>
<form class="card" method="post"><p class="muted" style="margin-top:0">Επεξεργασία όλων των πεδίων της εγγραφής. Τα γκρι πεδία δεν αλλάζουν.</p>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px 14px">{fields}</div>
<div class="toolbar" style="margin-top:12px"><button class="btn primary">💾 Αποθήκευση</button><a class="btn" href="/database/{key}">Ακύρωση</a></div></form>""",u,s['label'])

@app.post('/database/{key}/{rid}')
async def database_edit_save(req:Request,key:str,rid:int):
    _db_admin(req)
    s,cols=db_spec(key)
    if not s['edit']:raise HTTPException(404)
    _db_row(s,rid);f=await req.form();sets=[];vals=[]
    for c,t in cols:
        if c in DB_READONLY_COLS or c not in f:continue
        v=str(f.get(c)).strip()
        if db_is_int(t):
            if v=='':v=None
            else:
                try:v=int(v)
                except ValueError:raise HTTPException(400,f'Το πεδίο «{c}» δέχεται μόνο αριθμό.')
        sets.append(f'{c}=?');vals.append(v)
    if sets:
        with con() as c:c.execute(f"UPDATE {s['table']} SET {','.join(sets)} WHERE id=?",vals+[rid])
    return RedirectResponse(f'/database/{key}?msg='+quote(f'Η εγγραφή #{rid} αποθηκεύτηκε.'),303)

SYSCHECK_JS='''<script>
(async function(){
 const seen=new Set(),out=document.getElementById('chk'),sum=document.getElementById('chkSum');let ok=0,bad=0;
 const links=[...document.querySelectorAll('#mainnav a[href^="/"]')].map(a=>a.getAttribute('href')).concat(EXTRA)
  .filter(h=>h!=='/logout'&&!seen.has(h)&&seen.add(h));
 for(const h of links){const tr=document.createElement('tr');tr.innerHTML='<td><a href="'+h+'">'+h+'</a></td><td>…</td>';out.appendChild(tr);
  try{const r=await fetch(h,{credentials:'same-origin',redirect:'manual'});const good=r.ok;good?ok++:bad++;
   tr.lastChild.textContent=(good?'✓ ':'✗ ')+(r.status||'ανακατεύθυνση');tr.lastChild.style.color=good?'#1b7a3a':'#b00020';}
  catch(e){bad++;tr.lastChild.textContent='✗ σφάλμα';tr.lastChild.style.color='#b00020';}
  sum.textContent=ok+' σελίδες ανοίγουν'+(bad?' · '+bad+' με πρόβλημα':' — όλα εντάξει ✓');}
})();
</script>'''

@app.get('/system/check')
def system_check(req:Request):
    u=_db_admin(req);v=app_version()
    def row(k,val,good=True):return f'<tr><th style="text-align:left">{esc(k)}</th><td style="color:{"#1b7a3a" if good else "#b00020"}">{esc(val)}</td></tr>'
    drive=globals().get('drive_connected')
    info=(row('Αποθετήριο κώδικα',v['repo'] or '— (τοπική εκτέλεση)',v['repo'] in ('','NGLG-GSEC/NGLG-Grand-Secretary'))
          +row('Commit',(v['branch']+' @ ' if v['branch'] else '')+(v['commit'] or '—'))
          +row('Βάση δεδομένων','PostgreSQL' if USE_PG else 'SQLite (τοπικό αρχείο)')
          +row('Αποστολή email (SMTP)','ρυθμισμένη' if smtp_ready() else 'δεν έχει ρυθμιστεί',smtp_ready())
          +''.join(row(f'Αποστολέας: {m["label"]}',sender_for(k)) for k,m in MAIL_SENDERS.items())
          +row('Google Drive','συνδεδεμένο' if drive and drive() else 'δεν έχει συνδεθεί',bool(drive and drive())))
    counts=''.join(f'<tr><td><a href="/database/{k}">{esc(s["label"])}</a></td><td>{db_count(s["table"])}</td></tr>' for k,s in DB_TABLES.items())
    extra=json.dumps(['/database','/database/protocol','/directory']+[f'/database/{k}' for k in DB_TABLES])
    return page(f"""<h1>🩺 Έλεγχος συστήματος</h1><p><a href="/database">← Βάση Δεδομένων</a></p>
<div class="card"><table>{info}</table></div>
<h2>Έλεγχος σελίδων</h2><div class="card"><p style="margin-top:0"><b id="chkSum">Έλεγχος σε εξέλιξη…</b></p>
<p class="muted">Ανοίγει αυτόματα κάθε σελίδα του μενού και δείχνει αν φορτώνει σωστά.</p><table><tbody id="chk"></tbody></table></div>
<h2>Εγγραφές ανά πίνακα</h2><div class="card"><table>{counts}</table></div>
<script>const EXTRA={extra};</script>{SYSCHECK_JS}""",u,'Έλεγχος συστήματος')
