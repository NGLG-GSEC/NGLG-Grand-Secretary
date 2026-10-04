# Αρχική σελίδα — πίνακας ελέγχου: μία κάρτα ανά ενότητα με ό,τι εκκρεμεί και τις συχνές ενέργειες.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

DASH_CSS='''<style>.dash{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin:14px 0 18px}
.dtile{background:#fff;border:1px solid #d8deea;border-top:4px solid #123b7a;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.dtile h3{margin:0;font-size:1.05rem}.dtile h3 a{color:#0b2f63}.dtile .big{font-size:1.6rem;font-weight:bold;color:#0b2f63;line-height:1.1}
.dtile .warn{color:#9a4a12;font-weight:bold}.dtile .acts{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}.dtile .acts a{padding:4px 10px;min-height:0;font-size:.92rem}
.dtile.gold{border-top-color:#b18a43}.dtile.green{border-top-color:#187a3d}</style>'''

def _dash_count(sql,params=()):
    try:
        with con() as c:return c.execute(sql,params).fetchone()['n']
    except Exception:return 0

def _dash_tile(title,href,big,lines,acts,cls=''):
    ls=''.join(f'<div class="{"warn" if w else "muted"}">{esc(t)}</div>' for t,w in lines if t)
    a=''.join(f'<a class="btn{" primary" if i==0 else ""}" href="{h}">{esc(t)}</a>' for i,(t,h) in enumerate(acts))
    return f'<div class="dtile {cls}"><h3><a href="{href}">{title}</a></h3><div class="big">{esc(big)}</div>{ls}<div class="acts">{a}</div></div>'

def dashboard_html(u):
    t=date.today().isoformat();tiles=[]
    drafts=_dash_count("SELECT COUNT(*) n FROM letters WHERE status<>'ready'")
    tiles.append(_dash_tile('Επιστολές','/archive',f"{_dash_count('SELECT COUNT(*) n FROM letters')} επιστολές",
                            [(f'{drafts} σε προσχέδιο',False)],[('+ Νέα Επιστολή','/new'),('Αρχείο','/archive')],'green'))
    tiles.append(_dash_tile('Διατάγματα','/decrees/archive',f"{_dash_count('SELECT COUNT(*) n FROM decree_documents')} διατάγματα",[],
                            [('+ Νέο Διάταγμα','/decrees/new'),('Αρχείο','/decrees/archive')]))
    if not isadmin(u):return DASH_CSS+'<div class="dash">'+''.join(tiles)+'</div>'
    try:
        vs=[v for v in visits_all() if v['visit_date']>=t];reps={r['id'] for r in reps_all()}
        unas=sum(1 for v in vs if v.get('rep_id') not in reps);tobrief=sum(1 for v in vs if v.get('rep_id') in reps and not rep_notified(v))
        noprov=sum(1 for v in vs if not prov_notified(v))
        nxt=f'Επόμενη: {day_str(vs[0]["visit_date"])} — {vs[0]["lodge"]}' if vs else ''
        tiles.append(_dash_tile('Επισκέψεις Στοών','/visits',f'{len(vs)} προσεχείς',[(nxt,False),(f'{unas} χωρίς εκπρόσωπο' if unas else '',True),
                     (f'{tobrief} εκπρόσωποι προς ενημέρωση' if tobrief else '',True),(f'{noprov} χωρίς ενημέρωση Επαρχίας' if noprov else '',False)],
                     [('Ημερολόγιο','/visits'),('+ Νέα','/visits/new'),('Ενημέρωση Επαρχίας','/visits/publish')],'gold'))
    except Exception:pass
    try:
        d7=(date.today()+timedelta(days=7)).isoformat();gs=celebrants(t,d7);sent=greetings_sent()
        today=[m for g in gs if g['date']==t for m in g['members']];pending=sum(1 for m in today if greet_email(m) and (m['id'],t) not in sent)
        tiles.append(_dash_tile('🎉 Εορτολόγιο','/namedays',f'{len(today)} εορτάζουν σήμερα',[(f'{sum(len(g["members"]) for g in gs)} τις επόμενες 7 ημέρες',False),
                     (f'{pending} χωρίς ευχές σήμερα' if pending else '',True)],[('Εορτάζοντες & ευχές',f'/namedays?frm={t}&to={d7}'),('Αναφορά ΜΔ','/namedays/report')],'gold'))
    except Exception:pass
    try:
        ps=projects_all();late=sum(1 for p in ps if project_late(p))
        tiles.append(_dash_tile('Πρότζεκτ ΜΔ','/projects',f"{sum(1 for p in ps if p['status']=='active')} σε εξέλιξη",[(f'{len(ps)} συνολικά',False),(f'{late} εκπρόθεσμα' if late else '',True)],
                     [('Πρότζεκτ','/projects'),('+ Νέο','/projects/new')]))
    except Exception:pass
    try:
        ls=_lodges_all(active_only=True);nomail=sum(1 for l in ls if not lodge_email(l))
        provs=[p for p in provinces_all(active_only=True) if p.get('kind')!='Εθνική']
        nogs=sum(1 for p in provs if not (p.get('secretary_name') or '').strip())
        tiles.append(_dash_tile('📇 Κατάλογος','/directory',f'{len(ls)} Στοές · {len(provs)} Επαρχίες',[(f'{nomail} Στοές χωρίς email' if nomail else '',True),
                     (f'{nogs} Επαρχίες χωρίς ΕπΜΓρ.' if nogs else '',True)],[('Κατάλογος','/directory'),('Στοές','/lodges'),('Επαρχίες','/provinces')]))
    except Exception:pass
    tiles.append(_dash_tile('Μητρώο Μελών','/members',f"{_dash_count('SELECT COUNT(*) n FROM member_registry WHERE active=1')} ενεργά μέλη",[],
                            [('Αναζήτηση','/members'),('Επετηρίδα','/epeteirida')]))
    try:
        tiles.append(_dash_tile('Google Drive','/drive','Συνδεδεμένο' if drive_connected() else 'Μη συνδεδεμένο',
                                [('' if drive_connected() else 'Τα PDF δεν ανεβαίνουν ακόμη αυτόματα',not drive_connected())],[('Ρύθμιση','/drive')]))
    except Exception:pass
    return DASH_CSS+'<div class="dash">'+''.join(tiles)+'</div>'
