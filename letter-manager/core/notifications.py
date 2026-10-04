# Ειδοποιήσεις μέσα στην εφαρμογή.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

# ---------------------------------------------------------------- notifications
def notify(message,kind='info',link='',link_label=''):
    with con() as c:c.execute('INSERT INTO notifications(kind,message,link,link_label,created_at) VALUES(?,?,?,?,?)',(kind,message,link,link_label,now()))

def _unseen(email,after=0,limit=8):
    since=(datetime.now()-timedelta(days=14)).isoformat(timespec='seconds')
    with con() as c:
        return [dict(r) for r in c.execute("""SELECT * FROM notifications n WHERE n.id>? AND n.created_at>=? AND NOT EXISTS(
        SELECT 1 FROM notification_seen s WHERE s.email=? AND s.nid=n.id) ORDER BY n.id DESC LIMIT ?""",(after,since,email.lower(),limit))]

def _notif_item(n):
    icon={'ok':'✔','error':'⚠'}.get(n['kind'],'ℹ')
    link=f' <a href="{esc(n["link"])}" target="{"_blank" if n["link"].startswith("http") else "_self"}" rel="noopener">{esc(n["link_label"] or "Άνοιγμα")}</a>' if n.get('link') else ''
    return f'<li class="notif-{esc(n["kind"])}"><span>{icon}</span> {esc(n["message"])}{link} <small class="muted">{esc((n["created_at"] or "")[11:16])}</small></li>'

def notifications_banner(u):
    if not u:return ''
    xs=_unseen(u['email'])
    mx=max([x['id'] for x in xs],default=0)
    with con() as c:last=c.execute('SELECT COALESCE(MAX(id),0) n FROM notifications').fetchone()['n']
    box=(f'<div class="card notif-box noprint" id="notifBox"><b>Ειδοποιήσεις</b><ul>{"".join(_notif_item(x) for x in xs)}</ul>'
         f'<form method="post" action="/notifications/seen"><input type="hidden" name="upto" value="{mx}"><button>OK, τις είδα</button></form></div>') if xs else ''
    return box+f"""<div id="notifToast" class="notif-toast noprint" hidden></div><script>(function(){{var last={last},t=document.getElementById('notifToast');
function poll(){{fetch('/api/notifications?after='+last).then(function(r){{return r.ok?r.json():null}}).then(function(d){{if(!d||!d.items||!d.items.length)return;
d.items.forEach(function(n){{last=Math.max(last,n.id)}});t.innerHTML=d.html+'<button type="button" aria-label="Κλείσιμο">✕</button>';t.hidden=false;
t.querySelector('button').onclick=function(){{t.hidden=true}};}}).catch(function(){{}});}}
setTimeout(poll,4000);setInterval(poll,15000);}})();</script>"""

@app.post('/notifications/seen')
async def notifications_seen(req:Request):
    u=need(req);f=await req.form()
    try:upto=int(f.get('upto') or 0)
    except Exception:upto=0
    with con() as c:
        for n in [r['id'] for r in c.execute('SELECT id FROM notifications WHERE id<=?',(upto,))]:
            c.execute('INSERT INTO notification_seen(email,nid) VALUES(?,?) ON CONFLICT DO NOTHING',(u['email'].lower(),n))
    back=req.headers.get('referer') or '/'
    return RedirectResponse(back if back.startswith(('/','http')) else '/',303)

@app.get('/api/notifications')
def notifications_api(req:Request,after:int=0):
    u=need(req);xs=list(reversed(_unseen(u['email'],after,5)))
    return {'items':[{'id':x['id'],'kind':x['kind']} for x in xs],'html':'<ul>'+''.join(_notif_item(x) for x in xs)+'</ul>' if xs else ''}
