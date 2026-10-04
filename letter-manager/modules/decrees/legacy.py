# Διατάγματα — κείμενο διατάγματος, φόρμες και η παλιά διαδρομή /decree (συμβατότητα).
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

def _dec_init():
    with con() as c:
        c.executescript("""CREATE TABLE IF NOT EXISTS decrees(id INTEGER PRIMARY KEY AUTOINCREMENT,letter_id INTEGER UNIQUE NOT NULL,decree_no INTEGER NOT NULL,decree_year INTEGER NOT NULL,matter TEXT,rules TEXT,appointments TEXT,created_at TEXT,updated_at TEXT);
CREATE TABLE IF NOT EXISTS members(id INTEGER PRIMARY KEY AUTOINCREMENT,registry_no TEXT UNIQUE,full_name TEXT NOT NULL,honorific TEXT DEFAULT '',former_office TEXT DEFAULT '',email TEXT DEFAULT '',mobile TEXT DEFAULT '',updated_at TEXT);
CREATE INDEX IF NOT EXISTS ix_decree_no ON decrees(decree_no);CREATE INDEX IF NOT EXISTS ix_member_reg ON members(registry_no);""")
        ts=now()
        c.execute("INSERT OR IGNORE INTO letter_templates(name,body,active,created_at,updated_at) VALUES(?,?,1,?,?)",('ΔΙΑΤΑΓΜΑΤΑ','Επίσημο Διάταγμα της Εθνικής Μεγάλης Στοάς της Ελλάδος',ts,ts))

_dec_init()

_tf0=templates_for

def templates_for(u):
    xs=_tf0(u)
    if not any(x.get('name')=='ΔΙΑΤΑΓΜΑΤΑ' for x in xs):
        with con() as c:r=c.execute("SELECT * FROM letter_templates WHERE active=1 AND name='ΔΙΑΤΑΓΜΑΤΑ'").fetchone()
        if r:xs.append(dict(r));xs.sort(key=lambda x:x['name'])
    return xs

def _isdec(lid):
    with con() as c:return bool(c.execute('SELECT 1 FROM decrees WHERE letter_id=?',(lid,)).fetchone())

def _dec(lid):
    with con() as c:
        x=c.execute('SELECT * FROM letters WHERE id=?',(lid,)).fetchone();d=c.execute('SELECT * FROM decrees WHERE letter_id=?',(lid,)).fetchone()
    return (dict(x) if x else None,dict(d) if d else None)

def _dno(c):
    n=int(c.execute('SELECT COALESCE(MAX(decree_no),0) n FROM decrees').fetchone()['n'])
    return max(n+1,513)

def _gdate(v=None):
    v=v or date.today()
    if isinstance(v,str):v=date.fromisoformat(v[:10])
    return f'{v.day}ην {MON[v.month]} {v.year}'

def _ptext(a):
    t=(a.get('honorific') or '').strip() or 'Αδ.'
    if not t.endswith(('Αδ.','Αδ')):t+=' Αδ.'
    q=[t+' '+a['full_name']]
    if a.get('former_office'):q.append(a['former_office'])
    if a.get('registry_no'):q.append('Αριθμ. Μητρώου: '+a['registry_no'])
    return ', '.join(q)

def _proper_name(v):
    return ' '.join(w[:1].upper()+w[1:].lower() for w in (v or '').strip().split())

def _split_full_name(v):
    p=(v or '').strip().split()
    if not p:return ('','')
    return (p[0],' '.join(p[1:]))

def _acc_name(name):
    words=[]
    for w in (name or '').strip().split():
        base=w
        if base.endswith('ος'):base=base[:-2]+'ον'
        elif base.endswith('ης'):base=base[:-2]+'ην'
        elif base.endswith('ας'):base=base[:-2]+'αν'
        elif base.endswith('ων'):base=base[:-2]+'ωνα'
        words.append(base)
    return _proper_name(' '.join(words))

def _display_name(a):
    dfn=(a.get('decree_first_name') or '').strip()
    dln=(a.get('decree_last_name') or '').strip()
    if dfn or dln:return _proper_name((dfn+' '+dln).strip())
    if (a.get('decree_name') or '').strip():return _proper_name(a.get('decree_name'))
    fn=(a.get('first_name') or '').strip();ln=(a.get('last_name') or '').strip()
    if not fn and not ln:fn,ln=_split_full_name(a.get('full_name',''))
    return _acc_name((fn+' '+ln).strip())

def _dmeta(d):
    try:r=json.loads((d or {}).get('rules') or '[]')
    except:r=[]
    if isinstance(r,dict):
        return {
            'rules':r.get('rules') or [],
            'action':r.get('action') or 'appoint',
            'award_office':r.get('award_office') or '',
            'decree_office':r.get('decree_office') or '',
            'period':r.get('period') or ''
        }
    return {
        'rules':r if isinstance(r,list) else [],
        'action':'appoint',
        'award_office':'',
        'decree_office':'',
        'period':f"{(d or {}).get('decree_year') or date.today().year} - {int((d or {}).get('decree_year') or date.today().year)+1}"
    }

def _body(matter,apps,dt=None,action='appoint',award_office='',period=''):
    if action in {'award','service_award'}:
        rules=['19']
    else:
        rules=[]
        for a in apps:
            if a.get('rule') and a['rule'] not in rules:rules.append(a['rule'])

    if action=='service_award':
        out=[
            'ΗΜΕΙΣ',
            'Ο Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος,',
            'Σεβασμιώτατος Αδελφός Ιωάννης Μπενετάτος',
            '',
            'λαβόντες υπ’ όψιν τον Κανόνα 19 του Βιβλίου Γενικών Νόμων και',
            'Κανονισμών,',
            '',
            'ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ',
            '',
            'την Τάξιν του Μεγάλου Διδασκάλου',
            '',
            'δι’ Υπηρεσίας προς την Τεκτονικήν, '+('στον κάτωθι Αδελφόν:' if len(apps)==1 else 'στους κάτωθι Αδελφούς:'),
            ''
        ]
        for a in apps:out.append('• '+_display_name(a))
        out += ['', 'Εγένετο εν τω Τεκτονικώ Μεγάρω της πόλεως των Αθηνών, την '+_gdate(dt)+'.']
        return '\n'.join(out).strip(),rules

    intro=('τον Κανόνα ' if len(rules)==1 else 'τους Κανόνας ')+' και '.join(rules)
    out=['ΗΜΕΙΣ','Ο Μέγας Διδάσκαλος της Εθνικής Μεγάλης Στοάς της Ελλάδος,','Σεβασμιώτατος Αδελφός Ιωάννης Μπενετάτος,',
         'λαβόντες υπ’ όψιν '+intro,'του Βιβλίου των Γενικών Νόμων και Κανονισμών,','',f'περί {matter},','']
    if action=='award':
        out += ['ΑΠΟΝΕΜΕΙ','']
        title=AWARD_MAP.get(award_office,award_office)
        out.append('τον Τίτλον του '+title)
        out.append('τον κάτωθι Αδελφόν:' if len(apps)==1 else 'τους κάτωθι Αδελφούς:')
        out.append('')
        for a in apps:out.append('• '+_display_name(a))
    else:
        out += ['ΔΙΟΡΙΖΟΜΕΝ','']
        for a in apps:
            m=DEC_MAP.get(a.get('office',''),{})
            hon=m.get('hon_acc') or HON_ACC_BY_SHORT.get(a.get('honorific',''),'')
            out += ['ως',m.get('acc',a.get('office','').upper())]
            if hon:out.append('τον '+hon+' Αδελφόν')
            else:out.append('τον Αδελφόν')
            out.append(_display_name(a))
            out.append('δια την Τεκτονικήν Περίοδον '+period+'.')
            out.append('')
    out.append('Εγένετο εν τω Τεκτονικώ Μεγάρω της πόλεως των Αθηνών, την '+_gdate(dt)+'.')
    return '\n'.join(out).strip(),rules

def _honorific_opts(sel=''):
    return ''.join(f"<option value='{esc(o)}' {'selected' if o==sel else ''}>{esc(o)}</option>" for o in HONORIFIC_OPTIONS)

def _opts(sel=''):
    # Όλα τα αξιώματα/διορισμοί πρέπει να είναι διαθέσιμα στο ΔΙΟΡΙΖΟΜΕΝ,
    # ακόμη και όσα δεν φέρουν αριθμό προβαδίσματος.
    return ''.join(
        f"<option value='{esc(o)}' {'selected' if o==sel else ''}>{esc(o)} — Καν. {r}{' — χωρίς αριθμό προβαδίσματος' if p is None else ''}</option>"
        for p,o,r in DEC_OFFICES
    )

def _award_opts(sel=''):
    return ''.join(f"<option value='{esc(o)}' {'selected' if o==sel else ''}>{esc('Πρώην '+o)}</option>" for o,g in AWARD_OFFICES)

def _row(a=None):
    a=a or {}
    fn=(a.get('first_name') or '').strip();ln=(a.get('last_name') or '').strip()
    if not fn and not ln:fn,ln=_split_full_name(a.get('full_name',''))
    dfn=(a.get('decree_first_name') or '').strip();dln=(a.get('decree_last_name') or '').strip()
    if not dfn and not dln and (a.get('decree_name') or '').strip():dfn,dln=_split_full_name(a.get('decree_name'))
    return f"""<div class="card dec-person"><div class="grid">
<div class="full"><label>Αναζήτηση στο Μητρώο Μελών</label><input type="text" class="registry-search" placeholder="Επώνυμο, όνομα, email ή κινητό"><div class="member-search-results"></div><small>Επιλέξτε Αδελφό από το κεντρικό Μητρώο ή συμπληρώστε χειροκίνητα τα στοιχεία.</small></div>
<div><label>ID Μητρώου</label><input name="registry_no" class="reg" value="{esc(a.get('member_id') or a.get('registry_no',''))}" placeholder="Αυτόματο / προαιρετικό"></div>
<div><label>Όνομα</label><input name="first_name" class="fn" value="{esc(fn)}" required></div>
<div><label>Επώνυμο</label><input name="last_name" class="ln" value="{esc(ln)}" required></div>
<div class="member-honorific"><label>Τίτλος</label><select name="honorific" class="hon" required><option value="">— Επιλογή —</option>{_honorific_opts(a.get('honorific',''))}</select></div>
<div class="member-former-office"><label>Πρώην αξίωμα</label><input name="former_office" class="former" value="{esc(a.get('former_office',''))}"></div>
<div><label>Email</label><input type="email" name="member_email" class="em" value="{esc(a.get('email',''))}" required></div>
<div><label>Κινητό</label><input name="mobile" class="mob" value="{esc(a.get('mobile',''))}" required></div>
<div><label>Όνομα στο Διάταγμα (αιτιατική — προαιρετικό)</label><input name="decree_first_name" class="dfn" value="{esc(dfn)}" placeholder="π.χ. Δημήτριον"></div>
<div><label>Επώνυμο στο Διάταγμα (αιτιατική — προαιρετικό)</label><input name="decree_last_name" class="dln" value="{esc(dln)}" placeholder="π.χ. Σκιαδόπουλον"></div>
</div><div style="text-align:right"><button type="button" onclick="this.closest('.dec-person').remove()">Αφαίρεση</button></div></div>"""

def _precedence_table():
    rows=sorted(DEC_OFFICES,key=lambda x:(x[0] is None,x[0] if x[0] is not None else 9999,x[1]))
    return ''.join(
        f"<tr><td><b>{'—' if p is None else p}</b></td><td>{esc(o)}</td><td><b>Καν. {r}</b></td></tr>"
        for p,o,r in rows
    )

def _grouping_table():
    groups={}
    for p,o,r in DEC_OFFICES:
        groups.setdefault(r,[]).append(o)
    rows=[]
    rows.append("<tr><td><b>Καν. 19</b></td><td><b>ΑΠΟΝΕΜΕΙ</b><br><small>"+esc(DEC_BASIS['19'])+"</small></td></tr>")
    def rk(k):
        try:return int(k)
        except:return 9999
    for r in sorted(groups,key=rk):
        offices='<br>'.join('• '+esc(o) for o in groups[r])
        rows.append(f"<tr><td><b>Καν. {r}</b></td><td><small>{esc(DEC_BASIS.get(r,''))}</small><div style='margin-top:5px'>{offices}</div></td></tr>")
    return ''.join(rows)

def _decree_info_tables():
    award_titles='<br>'.join('• '+esc('Πρώην '+o) for o,g in AWARD_OFFICES)
    return f"""<div class="decree-categories" style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:16px">
<div class="card" style="margin:0"><h3 style="margin-top:0">1. ΔΙΟΡΙΖΟΜΕΝ</h3><p>Διορισμοί ενεργών Μεγάλων Αξιωματικών και λοιπών προβλεπομένων διορισμών. Εμφανίζονται <b>όλα</b> τα αξιώματα των Κανόνων 16, 18, 21, 22, 23, 36, 217, 224 και 273, ακόμη και όσα δεν έχουν αριθμό προβαδίσματος.</p></div>
<div class="card" style="margin:0"><h3 style="margin-top:0">2. ΑΠΟΝΕΜΕΙ</h3><p>Απονομή τίτλου <b>Πρώην Μεγάλου Αξιωματικού</b> κατά τον Κανόνα 19. Η λίστα είναι ανεξάρτητη από τα ενεργά αξιώματα.</p><details><summary>Προβολή τίτλων</summary><div style="margin-top:8px">{award_titles}</div></details></div>
<div class="card" style="margin:0"><h3 style="margin-top:0">3. ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ</h3><p><b>Αποκλειστικά</b> για την <b>Τάξιν του Μεγάλου Διδασκάλου δι’ Υπηρεσίας προς την Τεκτονικήν</b>, κατά τον Κανόνα 19. Δεν εμφανίζεται επιλογή αξιώματος ή Τεκτονικής Περιόδου.</p></div>
</div>
<div id="decree-office-reference"><div class="dec-info-grid" style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(320px,.75fr);gap:16px;align-items:start">
<details class="fold" open data-mobile-closed><summary><h3 style="margin-top:0">Προβάδισμα — Αξίωμα — Κανόνας</h3></summary><div style="overflow:auto;margin-top:12px"><table><tr><th>Προβάδισμα</th><th>Αξίωμα / Διορισμός</th><th>Κανόνας</th></tr>{_precedence_table()}</table></div></details>
<details class="fold" open data-mobile-closed><summary><h3 style="margin-top:0">Ομαδοποιήσεις κατά Κανόνα</h3></summary><div style="overflow:auto;margin-top:12px"><table><tr><th>Κανόνας</th><th>Ομαδοποίηση</th></tr>{_grouping_table()}</table></div></details>
</div></div><style>@media(max-width:900px){{.dec-info-grid,.decree-categories{{grid-template-columns:1fr!important}}}}</style>"""

def _dec_js():
    active_opts=json.dumps("<option value=''>— Επιλογή ενεργού αξιώματος —</option>"+_opts(),ensure_ascii=False)
    former_opts=json.dumps("<option value=''>— Επιλογή πρώην Μεγάλου Αξιωματικού —</option>"+_award_opts(),ensure_ascii=False)
    oh=json.dumps({o:v[2] for o,v in OFFICE_FORMS.items() if v[2]},ensure_ascii=False)
    return """<script>
const activeOfficeOptions="""+active_opts+""";
const formerOfficeOptions="""+former_opts+""";
const officeHonor="""+oh+""";
function selectedActiveOffice(){
 const s=document.getElementById('decree_office');
 return s && s.dataset.mode==='appoint' ? s.value : '';
}
function syncSelectedOfficeTitle(){
 const office=selectedActiveOffice();
 const title=officeHonor[office]||'';
 if(!title)return;
 document.querySelectorAll('.dec-person .hon').forEach(h=>h.value=title);
}
function splitMemberName(v){const p=(v||'').trim().split(/\\s+/).filter(Boolean);return [p.shift()||'',p.join(' ')];}
function fillBrotherRow(r,d){
 const parts=splitMemberName(d.full_name||((d.first_name||'')+' '+(d.surname||'')));
 r.querySelector('.reg').value=d.member_id||d.id||d.registry_no||'';
 r.querySelector('.fn').value=d.first_name||parts[0]||'';
 r.querySelector('.ln').value=d.surname||parts[1]||'';
 if(d.honorific)r.querySelector('.hon').value=d.honorific;
 if(d.former_office)r.querySelector('.former').value=d.former_office;
 r.querySelector('.em').value=d.email||'';
 r.querySelector('.mob').value=d.mobile||'';
 if(document.getElementById('decree_action').value==='appoint')syncSelectedOfficeTitle();
}
function bind(r){
 const g=r.querySelector('.reg');
 const search=r.querySelector('.registry-search');
 const results=r.querySelector('.member-search-results');
 g.addEventListener('blur',async()=>{
   if(!g.value.trim())return;
   const x=await fetch('/api/member?registry_no='+encodeURIComponent(g.value.trim()));
   if(!x.ok)return;
   const d=await x.json();
   if(d.found)fillBrotherRow(r,d);
 });
 if(search){
   let timer=null;
   search.addEventListener('input',()=>{
     clearTimeout(timer);
     const q=search.value.trim();
     if(q.length<2){results.innerHTML='';return;}
     timer=setTimeout(async()=>{
       const x=await fetch('/api/members/search?q='+encodeURIComponent(q));
       if(!x.ok)return;
       const d=await x.json();results.innerHTML='';
       (d.items||[]).forEach(m=>{
         const b=document.createElement('button');b.type='button';b.className='btn';
         b.style.cssText='display:block;width:100%;text-align:left;margin:4px 0';
         b.textContent=(m.surname||'')+' '+(m.first_name||'')+(m.email?' — '+m.email:'')+(m.mobile?' — '+m.mobile:'');
         b.addEventListener('click',()=>{fillBrotherRow(r,m);search.value=(m.surname||'')+' '+(m.first_name||'');results.innerHTML='';});
         results.appendChild(b);
       });
       if(!(d.items||[]).length)results.innerHTML='<small>Δεν βρέθηκε μέλος. Μπορείτε να συμπληρώσετε τα στοιχεία χειροκίνητα.</small>';
     },220);
   });
 }
}
document.querySelectorAll('.dec-person').forEach(bind);
function toggleDecreeMode(){
 const action=document.getElementById('decree_action').value;
 const award=action==='award';
 const service=action==='service_award';
 const s=document.getElementById('decree_office');
 const card=document.getElementById('decree-office-card');
 const label=document.getElementById('decree_office_label');
 const matterWrap=document.getElementById('matter-wrap');
 const matter=document.getElementById('matter');
 const form=document.getElementById('decree-form');
 const periodInput=document.getElementById('masonic_period');
 if(form)form.classList.toggle('service-award-mode',service);
 document.querySelectorAll('#decree-form .service-hide').forEach(el=>{
   el.hidden=service;
   if(service)el.style.setProperty('display','none','important');
   else el.style.removeProperty('display');
 });
 if(card)card.style.display=service?'none':'';
 document.querySelectorAll('.member-honorific,.member-former-office').forEach(x=>x.style.display=service?'none':'');
 document.querySelectorAll('.dec-person .hon').forEach(x=>{x.required=!service;x.disabled=service;});
 document.querySelectorAll('.dec-person .former').forEach(x=>x.disabled=service);
 const ref=document.getElementById('decree-office-reference');if(ref)ref.style.display=service?'none':'';
 const fixed=document.getElementById('service-award-fixed-text');if(fixed)fixed.style.display=service?'':'none';
 if(s){
   s.required=!service;
   s.disabled=service;
   if(!service){
     const target=award?'award':'appoint';
     if(s.dataset.mode!==target){
       s.innerHTML=award?formerOfficeOptions:activeOfficeOptions;
       s.dataset.mode=target;
     }
   }
 }
 if(label)label.textContent=award?'Πρώην Μέγας Αξιωματικός':'Ενεργός Μέγας Αξιωματικός';
 const pc=document.getElementById('period-card');if(pc)pc.style.display=(award||service)?'none':'';
 if(periodInput)periodInput.disabled=(award||service);
 if(matterWrap)matterWrap.style.display=service?'none':'';
 if(matter){
   matter.required=!service;
   matter.disabled=service;
   if(service)matter.value='Απονομή της Τάξεως του Μεγάλου Διδασκάλου δι’ Υπηρεσίας προς την Τεκτονικήν';
 }
 const hd=document.getElementById('people-heading');
 if(hd)hd.textContent=service?'Στοιχεία Αδελφού που θα λάβει την Τάξη του Μεγάλου Διδασκάλου':(award?'Αδελφοί προς Απονομή':'Διοριζόμενοι Αδελφοί');
 if(action==='appoint')syncSelectedOfficeTitle();
}
function addPerson(){
 const z=document.createElement('div');
 z.innerHTML='<div class="card dec-person"><div class="grid"><div class="full"><label>Αναζήτηση στο Μητρώο Μελών</label><input type="text" class="registry-search" placeholder="Επώνυμο, όνομα, email ή κινητό"><div class="member-search-results"></div><small>Επιλέξτε Αδελφό από το κεντρικό Μητρώο ή συμπληρώστε χειροκίνητα τα στοιχεία.</small></div><div><label>ID Μητρώου</label><input name="registry_no" class="reg" placeholder="Αυτόματο / προαιρετικό"></div><div><label>Όνομα</label><input name="first_name" class="fn" required></div><div><label>Επώνυμο</label><input name="last_name" class="ln" required></div><div class="member-honorific"><label>Τίτλος</label><select name="honorific" class="hon" required><option value="">— Επιλογή —</option><option value="Σεβτ. Αδ.">Σεβτ. Αδ.</option><option value="Πσεβ. Αδ.">Πσεβ. Αδ.</option><option value="ΛΣεβ. Αδ.">ΛΣεβ. Αδ.</option><option value="Σεβ. Αδ.">Σεβ. Αδ.</option></select></div><div class="member-former-office"><label>Πρώην αξίωμα</label><input name="former_office" class="former"></div><div><label>Email</label><input type="email" name="member_email" class="em" required></div><div><label>Κινητό</label><input name="mobile" class="mob" required></div><div><label>Όνομα στο Διάταγμα (αιτιατική — προαιρετικό)</label><input name="decree_first_name" class="dfn" placeholder="π.χ. Δημήτριον"></div><div><label>Επώνυμο στο Διάταγμα (αιτιατική — προαιρετικό)</label><input name="decree_last_name" class="dln" placeholder="π.χ. Σκιαδόπουλον"></div></div><div style="text-align:right"><button type="button" onclick="this.closest(\'.dec-person\').remove()">Αφαίρεση</button></div></div>';
 const r=z.firstElementChild;
 document.getElementById('people').appendChild(r);
 bind(r);
 toggleDecreeMode();
 if(document.getElementById('decree_action').value==='appoint')syncSelectedOfficeTitle();
}
const officeSelect=document.getElementById('decree_office');
if(officeSelect)officeSelect.addEventListener('change',()=>{if(officeSelect.dataset.mode==='appoint')syncSelectedOfficeTitle();});
toggleDecreeMode();
</script>"""

@app.get('/api/member')
def member_api(req:Request,registry_no:str=''):
    need(req);key=registry_no.strip()
    if not key:return {'found':False}
    with con() as c:
        if key.isdigit():
            r=c.execute('SELECT * FROM member_registry WHERE id=?',(int(key),)).fetchone()
            if r:
                x=dict(r)
                return {'found':True,'member_id':x['id'],'id':x['id'],'registry_no':str(x['id']),'first_name':x['first_name'],'surname':x['surname'],'full_name':(x['first_name']+' '+x['surname']).strip(),'honorific':'','former_office':'','email':x['email'] or '','mobile':x['mobile'] or '','degree':x['degree'] or '','active':bool(x['active'])}
        r=c.execute('SELECT * FROM members WHERE registry_no=?',(key,)).fetchone()
    return {'found':bool(r),**(dict(r) if r else {})}

@app.get('/decree')
def decree_new(req:Request,copy_from:int=0):
    u=need(req);matter='';apps=[];action='appoint';award_office='';active_office='';period=f"{date.today().year} - {date.today().year+1}"
    if copy_from:
        x,d=_dec(copy_from)
        if d:
            matter=d.get('matter') or ''
            meta=_dmeta(d);action=meta['action'];award_office=meta['award_office'];active_office=meta.get('decree_office') or '';period=meta['period'] or period
            try:apps=json.loads(d.get('appointments') or '[]')
            except:apps=[]
            if action=='appoint' and not active_office and apps:active_office=apps[0].get('office','')
    with con() as c:n=_dno(c)
    rows=''.join(_row(a) for a in apps) if apps else _row()
    return page(f"""<h1>Νέο Διάταγμα</h1><div class="card"><b>Επόμενο Διάταγμα: <span class="official-number">{n}/{date.today().year}</span></b><div style="margin-top:14px">{_decree_info_tables()}</div></div>
<form method="post" action="/decree">
<div class="card"><div class="grid"><div><label>Πράξη Διατάγματος</label><select name="decree_action" id="decree_action" onchange="toggleDecreeMode()" required><option value="appoint" {'selected' if action=='appoint' else ''}>ΔΙΟΡΙΖΟΜΕΝ</option><option value="award" {'selected' if action=='award' else ''}>ΑΠΟΝΕΜΕΙ</option><option value="service_award" {'selected' if action=='service_award' else ''}>ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ</option></select></div><div id="matter-wrap"><label>Περί</label><input name="matter" id="matter" value="{esc(matter)}" required></div></div></div>
<div class="card" id="decree-office-card" style="{'display:none' if action=='service_award' else ''}"><label id="decree_office_label">{'Πρώην Μέγας Αξιωματικός' if action=='award' else 'Ενεργός Μέγας Αξιωματικός'}</label><select name="decree_office" id="decree_office" data-mode="{action}" required>{("<option value=''>— Επιλογή πρώην Μεγάλου Αξιωματικού —</option>"+_award_opts(award_office)) if action=='award' else ("<option value=''>— Επιλογή ενεργού αξιώματος —</option>"+_opts(active_office))}</select><small>{'Εμφανίζονται μόνο οι Πρώην Μεγάλοι Αξιωματικοί.' if action=='award' else 'Εμφανίζονται μόνο οι ενεργοί Μεγάλοι Αξιωματικοί και ο αντίστοιχος Κανόνας.'}</small></div>
<div class="card" id="period-card" style="{'display:none' if action!='appoint' else ''}"><label>Τεκτονική Περίοδος</label><input name="masonic_period" value="{esc(period)}" placeholder="2026 - 2027"></div>
<div class="card"><b>Στοιχεία Αδελφού:</b> Αναζητήστε πρώτα τον Αδελφό στο κεντρικό Μητρώο Μελών με επώνυμο, όνομα, email ή κινητό. Η επιλογή συμπληρώνει αυτόματα ID, όνομα, επώνυμο, email και κινητό. Αν δεν υπάρχει ακόμη στη βάση, τα στοιχεία μπορούν να συμπληρωθούν χειροκίνητα. Τα προαιρετικά πεδία «Όνομα στο Διάταγμα» και «Επώνυμο στο Διάταγμα» επιτρέπουν ακριβή αιτιατική.</div><h2 id="people-heading">{'Αδελφοί για το Διάταγμα' if action=='service_award' else ('Αδελφοί προς Απονομή' if action=='award' else 'Διοριζόμενοι Αδελφοί')}</h2><div id="people">{rows}</div><div class="toolbar"><button type="button" onclick="addPerson()">+ Προσθήκη Αδελφού</button><button class="primary">Αποθήκευση & Πρωτόκολλο</button></div></form>{_dec_js()}""",u,'Νέο Διάταγμα')

def _apps_from_form(f,c,action,active_office=''):
    regs=f.getlist('registry_no');firsts=f.getlist('first_name');lasts=f.getlist('last_name');hons=f.getlist('honorific');former=f.getlist('former_office');ems=f.getlist('member_email');mobs=f.getlist('mobile');dfirsts=f.getlist('decree_first_name');dlasts=f.getlist('decree_last_name')
    apps=[]
    count=max(len(firsts),len(lasts))
    for i in range(count):
        reg=(regs[i] if i<len(regs) else '').strip()
        fn=(firsts[i] if i<len(firsts) else '').strip();ln=(lasts[i] if i<len(lasts) else '').strip()
        hon=(hons[i] if i<len(hons) else '').strip();fr=(former[i] if i<len(former) else '').strip();em=(ems[i] if i<len(ems) else '').strip();mo=(mobs[i] if i<len(mobs) else '').strip()
        off=active_office.strip() if action=='appoint' else ''
        dfn=(dfirsts[i] if i<len(dfirsts) else '').strip();dln=(dlasts[i] if i<len(dlasts) else '').strip()
        member_id=None
        if reg:
            old=None
            if reg.isdigit():
                rr=c.execute('SELECT * FROM member_registry WHERE id=?',(int(reg),)).fetchone()
                if rr:
                    rr=dict(rr);member_id=rr['id'];fn=fn or rr['first_name'];ln=ln or rr['surname'];em=em or rr['email'];mo=mo or rr['mobile']
            if member_id is None:
                old=c.execute('SELECT * FROM members WHERE registry_no=?',(reg,)).fetchone()
                if old:
                    old=dict(old)
                    ofn,oln=_split_full_name(old.get('full_name') or '')
                    fn=fn or ofn;ln=ln or oln;hon=hon or old['honorific'];fr=fr or old['former_office'];em=em or old['email'];mo=mo or old['mobile']
        fn=_proper_name(fn);ln=_proper_name(ln);nm=(fn+' '+ln).strip()
        dfn=_proper_name(dfn);dln=_proper_name(dln)
        if not fn or not ln or not em or not mo:raise HTTPException(400,'Ελέγξτε όνομα, επώνυμο, email και κινητό.')
        if action!='service_award' and not hon:raise HTTPException(400,'Επιλέξτε τίτλο Αδελφού.')
        if action=='appoint' and off not in DEC_MAP:raise HTTPException(400,'Επιλέξτε αξίωμα διορισμού.')
        if action=='appoint' and DEC_MAP[off].get('hon_short'):hon=DEC_MAP[off]['hon_short']
        rule=DEC_MAP[off]['rule'] if action=='appoint' else '19'
        doc_hon='' if action=='service_award' else hon
        doc_fr='' if action=='service_award' else fr
        a={'registry_no':reg,'member_id':member_id,'first_name':fn,'last_name':ln,'full_name':nm,'decree_first_name':dfn,'decree_last_name':dln,'honorific':doc_hon,'former_office':doc_fr,'email':em,'mobile':mo,'office':off if action=='appoint' else '','rule':rule};apps.append(a)
        if reg and member_id is None:c.execute("""INSERT INTO members(registry_no,full_name,honorific,former_office,email,mobile,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(registry_no) DO UPDATE SET full_name=excluded.full_name,honorific=excluded.honorific,former_office=excluded.former_office,email=excluded.email,mobile=excluded.mobile,updated_at=excluded.updated_at""",(reg,nm,hon,fr,em,mo,now()))
    return apps

@app.post('/decree')
async def decree_create(req:Request):
    u=need(req);f=await req.form();matter=str(f.get('matter','')).strip();action=str(f.get('decree_action','appoint')).strip();decree_office=str(f.get('decree_office','')).strip();active_office=decree_office if action=='appoint' else '';award_office=decree_office if action=='award' else '';period=str(f.get('masonic_period','')).strip()
    if action not in {'appoint','award','service_award'}:raise HTTPException(400,'Μη έγκυρη πράξη Διατάγματος.')
    if action=='service_award':matter='Απονομή της Τάξεως του Μεγάλου Διδασκάλου δι’ Υπηρεσίας προς την Τεκτονικήν'
    if not f.getlist('first_name'):raise HTTPException(400,'Συμπληρώστε τουλάχιστον έναν Αδελφό.')
    if action!='service_award' and not matter:raise HTTPException(400,'Συμπληρώστε το «Περί».')
    if action=='award' and award_office not in AWARD_MAP:raise HTTPException(400,'Επιλέξτε Πρώην Αξίωμα.')
    if action=='appoint' and active_office not in DEC_MAP:raise HTTPException(400,'Επιλέξτε ενεργό Αξίωμα.')
    if action=='appoint' and not period:raise HTTPException(400,'Συμπληρώστε την Τεκτονική Περίοδο.')
    with con() as c:
        apps=_apps_from_form(f,c,action,active_office)
        seq,yr,prot=nextprot(c,'Διάταγμα',matter);dn=_dno(c);dy=date.today().year;body,rules=_body(matter,apps,None,action,award_office,period);sub=f"ΔΙΑΤΑΓΜΑ υπ’ αριθμ. {dn}/{dy} – {matter}";tos=[]
        for a in apps:
            if a['email'] and a['email'].lower() not in [x.lower() for x in tos]:tos.append(a['email'])
        tr=c.execute("SELECT id FROM letter_templates WHERE name='ΔΙΑΤΑΓΜΑΤΑ'").fetchone();tid=tr['id'] if tr else None;ts=now();edit_session=current_edit_session(req,u) if isauthorised(u) else None
        cur=c.execute('INSERT INTO letters(protocol_seq,protocol_year,protocol_no,letter_date,subject,body,template_id,recipient_name,recipient_email,status,created_by,signer,edit_session,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(seq,yr,prot,date.today().isoformat(),sub,body,tid,', '.join(a['full_name'] for a in apps),', '.join(tos),'draft',u['email'],'dimitrios',edit_session,ts,ts));lid=cur.lastrowid
        meta={'rules':rules,'action':action,'award_office':award_office if action=='award' else '','decree_office':active_office if action=='appoint' else '','period':period if action=='appoint' else ''}
        c.execute('INSERT INTO decrees(letter_id,decree_no,decree_year,matter,rules,appointments,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',(lid,dn,dy,matter,json.dumps(meta,ensure_ascii=False),json.dumps(apps,ensure_ascii=False),ts,ts));c.commit()
    return RedirectResponse(f'/letter/{lid}',303)

@app.get('/decree-asset/gm')
def decree_gm_asset():return asset('signature_grand_master.png')

@app.get('/decree/edit/{lid}')
def decree_edit(req:Request,lid:int):
    u=need(req);x,d=_dec(lid)
    if not x or not d:raise HTTPException(404)
    if not can_edit_letter(req,u,x):raise HTTPException(403,'Το αρχειοθετημένο έγγραφο είναι μόνο για προβολή.')
    meta=_dmeta(d);action=meta['action'];award_office=meta['award_office'];active_office=meta.get('decree_office') or '';period=meta['period'] or f"{d['decree_year']} - {int(d['decree_year'])+1}"
    try:apps=json.loads(d.get('appointments') or '[]')
    except:apps=[]
    if action=='appoint' and not active_office and apps:active_office=apps[0].get('office','')
    rows=''.join(_row(a) for a in apps) if apps else _row()
    return page(f"""<h1>Επεξεργασία Διατάγματος <span class="official-number">{d['decree_no']}/{d['decree_year']}</span></h1><div class="card"><b>Αρ. Πρωτ.: <span class="official-number">{esc(x['protocol_no'])}</span></b><div style="margin-top:14px">{_decree_info_tables()}</div></div>
<form method="post" action="/decree/edit/{lid}">
<div class="card"><div class="grid"><div><label>Πράξη Διατάγματος</label><select name="decree_action" id="decree_action" onchange="toggleDecreeMode()" required><option value="appoint" {'selected' if action=='appoint' else ''}>ΔΙΟΡΙΖΟΜΕΝ</option><option value="award" {'selected' if action=='award' else ''}>ΑΠΟΝΕΜΕΙ</option><option value="service_award" {'selected' if action=='service_award' else ''}>ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ</option></select></div><div id="matter-wrap"><label>Περί</label><input name="matter" id="matter" value="{esc(d.get('matter') or '')}" required></div></div></div>
<div class="card" id="decree-office-card"><label id="decree_office_label">{'Πρώην Μέγας Αξιωματικός' if action=='award' else 'Ενεργός Μέγας Αξιωματικός'}</label><select name="decree_office" id="decree_office" data-mode="{action}" required>{("<option value=''>— Επιλογή πρώην Μεγάλου Αξιωματικού —</option>"+_award_opts(award_office)) if action=='award' else ("<option value=''>— Επιλογή ενεργού αξιώματος —</option>"+_opts(active_office))}</select></div>
<div class="card" id="period-card"><label>Τεκτονική Περίοδος</label><input name="masonic_period" value="{esc(period)}"></div>
<div class="card"><b>Στοιχεία Αδελφού:</b> Αν υπάρχει Αριθμός Μητρώου, συμπληρώστε τον πρώτα. Τα πεδία «Όνομα στο Διάταγμα» και «Επώνυμο στο Διάταγμα» είναι προαιρετικά και χρησιμοποιούνται για ακριβή αιτιατική.</div><h2 id="people-heading">Αδελφοί</h2><div id="people">{rows}</div><div class="toolbar"><button type="button" onclick="addPerson()">+ Προσθήκη Αδελφού</button><button class="primary">Αποθήκευση αλλαγών</button><a class="btn" href="/letter/{lid}">Ακύρωση</a></div></form>{_dec_js()}""",u,'Επεξεργασία Διατάγματος')

@app.post('/decree/edit/{lid}')
async def decree_edit_save(req:Request,lid:int):
    u=need(req);x,d=_dec(lid)
    if not x or not d:raise HTTPException(404)
    if not can_edit_letter(req,u,x):raise HTTPException(403,'Το αρχειοθετημένο έγγραφο είναι μόνο για προβολή.')
    f=await req.form();matter=str(f.get('matter','')).strip();action=str(f.get('decree_action','appoint')).strip();decree_office=str(f.get('decree_office','')).strip();active_office=decree_office if action=='appoint' else '';award_office=decree_office if action=='award' else '';period=str(f.get('masonic_period','')).strip()
    if action not in {'appoint','award','service_award'}:raise HTTPException(400,'Μη έγκυρη πράξη Διατάγματος.')
    if action=='service_award':matter='Απονομή της Τάξεως του Μεγάλου Διδασκάλου δι’ Υπηρεσίας προς την Τεκτονικήν'
    if not f.getlist('full_name'):raise HTTPException(400,'Συμπληρώστε τουλάχιστον έναν Αδελφό.')
    if action!='service_award' and not matter:raise HTTPException(400,'Συμπληρώστε το «Περί».')
    if action=='award' and award_office not in AWARD_MAP:raise HTTPException(400,'Επιλέξτε Πρώην Αξίωμα.')
    if action=='appoint' and active_office not in DEC_MAP:raise HTTPException(400,'Επιλέξτε ενεργό Αξίωμα.')
    if action=='appoint' and not period:raise HTTPException(400,'Συμπληρώστε την Τεκτονική Περίοδο.')
    with con() as c:
        apps=_apps_from_form(f,c,action,active_office)
        body,rules=_body(matter,apps,x['letter_date'],action,award_office,period);sub=f"ΔΙΑΤΑΓΜΑ υπ’ αριθμ. {d['decree_no']}/{d['decree_year']} – {matter}";tos=[]
        for a in apps:
            if a['email'] and a['email'].lower() not in [z.lower() for z in tos]:tos.append(a['email'])
        ts=now();meta={'rules':rules,'action':action,'award_office':award_office if action=='award' else '','decree_office':active_office if action=='appoint' else '','period':period if action=='appoint' else ''}
        c.execute('UPDATE letters SET subject=?,body=?,recipient_name=?,recipient_email=?,updated_at=? WHERE id=?',(sub,body,', '.join(a['full_name'] for a in apps),', '.join(tos),ts,lid))
        c.execute('UPDATE decrees SET matter=?,rules=?,appointments=?,updated_at=? WHERE letter_id=?',(matter,json.dumps(meta,ensure_ascii=False),json.dumps(apps,ensure_ascii=False),ts,lid));c.commit()
    return RedirectResponse(f'/letter/{lid}',303)

def _decree_view(req,lid,u):
    s=settings();x,d=_dec(lid)
    try:apps=json.loads(d['appointments'] or '[]')
    except:apps=[]
    to=','.join(a.get('email','') for a in apps if a.get('email'));cc=','.join(DEGREE_CC)
    gmail='https://mail.google.com/mail/u/?authuser='+quote(s['sender_email'])+'&view=cm&fs=1&to='+quote(to)+'&cc='+quote(cc)+'&su='+quote(x['subject'])+'&body='+quote(x['body'])
    wa='https://wa.me/?text='+quote(f"{s['organization_name']}\nΑρ. Πρωτ.: {x['protocol_no']}\n{x['subject']}")
    editable=can_edit_letter(req,u,x)
    ready='' if (x['status']=='ready' or not editable) else f'<form method="post" action="/ready/{lid}"><button>Σήμανση ως έτοιμο</button></form>'
    edit_link=f'<a class="btn" href="/decree/edit/{lid}">Επεξεργασία</a>' if editable else ''
    tools=f"""<section class="card send-panel noprint"><h3>Αποστολή & Αποθήκευση</h3><div class="toolbar"><a class="btn primary" href="/pdf/{lid}">⬇ Λήψη PDF στα Downloads</a><a class="btn" target="_blank" href="{gmail}">✉ Αποστολή με Email</a><a class="btn" target="_blank" href="{wa}">WhatsApp μήνυμα</a>{ready}</div><p class="send-help">Το Email ανοίγει με παραλήπτες όλους τους Αδελφούς του Διατάγματος και με τις προβλεπόμενες κοινοποιήσεις. Για συνημμένο PDF, κατεβάστε πρώτα το PDF και επισυνάψτε το από τον φάκελο Downloads.</p></section><div class="toolbar noprint">{edit_link}<a class="btn" href="/decree?copy_from={lid}">Νέα πάνω σε αυτή</a><button onclick="print()">Εκτύπωση</button></div>"""
    css="""<style>.dec-title{text-align:center;font:900 20px Georgia,'Times New Roman',serif;letter-spacing:1.5px;margin:9mm 0 1mm}.dec-no{text-align:center;font-weight:bold;font-size:13pt;margin-bottom:6mm}.decbody{white-space:pre-wrap;line-height:1.5;color:#111;text-align:center}.decsig{display:grid;grid-template-columns:1fr 48mm 1fr;gap:7mm;text-align:center;align-items:start;margin-top:10mm}.decsig .t{font-weight:900;margin-bottom:2mm}.decsig .signature-img{height:18mm}.decsig .seal-img{margin:auto}@media(max-width:800px){.decsig{grid-template-columns:1fr}}</style>"""
    sig="""<div class="decsig"><div><div class="t">Ο ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ</div><img class="signature-img" src="/clean/signature_original.png"><div class="signature-line"></div><b>Δημήτριος Σκιαδόπουλος</b></div><div><img class="seal-img" src="/clean/seal_original.png"></div><div><div class="t">Ο ΜΕΓΑΣ ΔΙΔΑΣΚΑΛΟΣ</div><img class="signature-img" src="/decree-asset/gm"><div class="signature-line"></div><b>Ιωάννης Μπενετάτος</b></div></div>"""
    paper=f"""<article class="paper"><div class="head"><img src="/asset/header_emblem.png"><h1>{esc(s['organization_name'])}</h1><div class="gold">Έτος Ιδρύσεως {esc(s['founded_year'])}</div><div>{esc(s['grand_master_title'])}</div><div>{esc(s['grand_master_name'])}</div><div class="rule"></div></div><div class="meta"><div>Αρ. Πρωτ.: <b class="official-number">{esc(x['protocol_no'])}</b></div><div>Ημερομηνία: <b class="official-number">{datetime.fromisoformat(x['letter_date']).strftime('%d/%m/%Y')}</b></div></div><div class="dec-title">ΔΙΑΤΑΓΜΑ</div><div class="dec-no official-number">{'υπ’ αριθ. ' if _dmeta(d).get('action')=='service_award' else 'υπ’ αριθμ. '}{d['decree_no']}/{d['decree_year']}</div><div class="decbody">{esc(x['body'])}</div>{sig}</article>"""
    return page(css+tools+paper,u,x['subject'])

def _decree_pdf(lid):
    s=settings();x,d=_dec(lid);regular,bold=_pdf_fonts();b=BytesIO();doc=SimpleDocTemplate(b,pagesize=A4,leftMargin=15*mm,rightMargin=15*mm,topMargin=10*mm,bottomMargin=14*mm,title=x['subject'])
    cen=ParagraphStyle('dcen',fontName=regular,fontSize=10.5,leading=13,alignment=1);org=ParagraphStyle('dorg',parent=cen,fontName=bold,fontSize=18,leading=21);sty=ParagraphStyle('db',fontName=regular,fontSize=10.5,leading=14);story=[]
    try:story.append(RLImage(BytesIO(_raw_asset('header_emblem.png')),width=34*mm,height=23*mm))
    except:pass
    story += [Paragraph(html.escape(s['organization_name']),org),Paragraph('Έτος Ιδρύσεως '+html.escape(s['founded_year']),cen),HRFlowable(width='100%',thickness=.8,color=colors.HexColor('#B18A43'),spaceBefore=5,spaceAfter=7),Paragraph('Αρ. Πρωτ.: <b>'+html.escape(x['protocol_no'])+'</b> — '+datetime.fromisoformat(x['letter_date']).strftime('%d/%m/%Y'),sty),Paragraph('ΔΙΑΤΑΓΜΑ',ParagraphStyle('dt',parent=cen,fontName=bold,fontSize=15,spaceBefore=12)),Paragraph(('υπ’ αριθ. ' if _dmeta(d).get('action')=='service_award' else 'υπ’ αριθμ. ')+str(d['decree_no'])+'/'+str(d['decree_year']),ParagraphStyle('dn',parent=cen,fontName=bold,fontSize=11.5,spaceAfter=10))]
    for line in x['body'].splitlines():story.append(Spacer(1,2*mm) if not line.strip() else Paragraph(html.escape(line),ParagraphStyle('dl'+str(len(story)),parent=sty,alignment=1,fontName=bold) if line.strip() in {'ΗΜΕΙΣ','ΔΙΟΡΙΖΟΜΕΝ','ΑΠΟΝΕΜΕΙ','ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ'} else sty))
    story.append(Spacer(1,7*mm))
    def col(title,name,img,clean=False):
        q=[Paragraph(title,ParagraphStyle('st'+name,parent=cen,fontName=bold,fontSize=9))]
        try:q.append(RLImage(BytesIO(_clean_asset(img,'white') if clean else _raw_asset(img)),width=46*mm,height=16*mm))
        except:q.append(Spacer(1,16*mm))
        q += [HRFlowable(width=48*mm,thickness=.6,color=colors.HexColor('#123B7A')),Paragraph(name,ParagraphStyle('sn'+name,parent=cen,fontName=bold,fontSize=9))];return q
    try:seal=[RLImage(BytesIO(_clean_asset('seal_original.png','black')),width=40*mm,height=40*mm)]
    except:seal=[Spacer(1,40*mm)]
    t=Table([[col('Ο ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ','Δημήτριος Σκιαδόπουλος','signature_original.png',True),seal,col('Ο ΜΕΓΑΣ ΔΙΔΑΣΚΑΛΟΣ','Ιωάννης Μπενετάτος','signature_grand_master.png')]],colWidths=[62*mm,46*mm,62*mm]);t.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'TOP'),('ALIGN',(0,0),(-1,-1),'CENTER')]));story.append(t);doc.build(story);return b.getvalue(),x,d

@app.middleware('http')
async def decree_dispatch(request,call_next):
    path=request.url.path
    if request.method=='GET' and path=='/new':
        tid=request.query_params.get('template_id','')
        if tid.isdigit():
            with con() as c:r=c.execute('SELECT name FROM letter_templates WHERE id=?',(int(tid),)).fetchone()
            if r and r['name']=='ΔΙΑΤΑΓΜΑΤΑ':return RedirectResponse('/decree',303)
    if request.method=='GET':
        m=re.fullmatch(r'/letter/(\d+)',path)
        if m and _isdec(int(m.group(1))):
            u=user(request)
            if u:
                a=actor_key(request,u)
                if u['email'].lower()==SHARED_SECRETARIAT_EMAIL and not a:return RedirectResponse('/identity',303)
                u['_actor']=a or 'dimitrios';return _decree_view(request,int(m.group(1)),u)
        m=re.fullmatch(r'/pdf/(\d+)',path)
        if m and _isdec(int(m.group(1))):
            if not user(request):return await call_next(request)
            data,x,d=_decree_pdf(int(m.group(1)));fn=f"ΔΙΑΤΑΓΜΑ-{d['decree_no']}-{d['decree_year']}.pdf"
            return Response(data,media_type='application/pdf',headers={'Content-Disposition':"attachment; filename*=UTF-8''"+quote(fn)})
    return await call_next(request)
