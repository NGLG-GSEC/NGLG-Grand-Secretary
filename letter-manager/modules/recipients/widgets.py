# Παραλήπτες — λίστες για Επιστολές: Επαρχιακές Μεγάλες Στοές, Συμβολικές Στοές, μέλη.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

def grand_lodge_recipient_widget(name_id='recipient_name',email_id='recipient_email',member_id_id='recipient_member_id'):
    # Από τον πίνακα grand_lodges (σελίδα «Επαρχιακές Μεγάλες Στοές»): Γραμματεία, ΕπΜΔ και ΕπΜΓρ. κάθε Επαρχίας.
    provs=provinces_all(active_only=True);regional=[p for p in provs if p.get('kind')!='Εθνική' and (p.get('email') or '').strip()]
    opt=lambda v,name,email,text:f'<option value="{esc(v)}" data-name="{esc(name)}" data-email="{esc(email)}">{esc(text)}</option>'
    opts=''
    for p in provs:
        o=''
        if (p.get('email') or '').strip():o+=opt(p['id'],p.get('addressee') or p.get('full_title') or p['short'],p['email'],f"Γραμματεία — {p['email']}")
        for r in province_roles(p):
            if r['email']:o+=opt(f"{p['id']}{r['role']}",r['addressee'],r['email'],f"{r['abbr']} {r['name'] or ''} — {r['email']}")
        if o:opts+=f'<optgroup label="{esc(p["short"])}">{o}</optgroup>'
    has_reg=any(p.get('kind')=='Περιφερειακή' for p in regional)
    allname='ΕπΜΓρ. των Επαρχιακών Μεγάλων Στοών'+(' και ΠερΜΓρ. της Περιφερειακής Μεγάλης Στοάς Κύπρου' if has_reg else '')
    gms=[r for p in provs if p.get('kind')!='Εθνική' for r in province_roles(p)[:1] if r['email']]
    allo=''
    if regional:allo+=opt('all',allname,', '.join(p['email'] for p in regional),f"Όλες οι Γραμματείες Επαρχιών{' και ΠΜΣτ. Κύπρου' if has_reg else ''} ({len(regional)})")
    if gms:allo+=opt('allgm','Επαρχιακούς Μεγάλους Διδασκάλους',', '.join(r['email'] for r in gms),f'Όλοι οι Επαρχιακοί Μεγάλοι Διδάσκαλοι ({len(gms)})')
    if allo:opts=f'<optgroup label="▸ Όλες μαζί">{allo}</optgroup>'+opts
    return f"""<div class="full"><label for="gl_recipient">Παραλήπτης: Επαρχία — Γραμματεία, ΕπΜΔ ή ΕπΜΓρ.</label><select id="gl_recipient"><option value="">— Επιλογή Μεγάλης Στοάς —</option>{opts}</select><small>Από τον <a href="/directory">📇 Κατάλογο</a> (Γραμματεία, ΕπΜΔ, ΕπΜΓρ.)· η επιλογή συμπληρώνει αυτόματα τον Παραλήπτη («Προς») και το Email· μπορείτε να τα διορθώσετε πριν την αποθήκευση.</small></div>
<script>
(function(){{
 const s=document.getElementById('gl_recipient');if(!s)return;
 s.addEventListener('change',()=>{{const o=s.options[s.selectedIndex];if(!o||!o.value)return;
  const n=document.getElementById('{name_id}'),e=document.getElementById('{email_id}'),mid=document.getElementById('{member_id_id}');
  if(n)n.value=o.dataset.name||'';if(e){{e.multiple=true;e.value=o.dataset.email||'';}}if(mid)mid.value='';
  if(n)n.dispatchEvent(new Event('input',{{bubbles:true}}));}});
}})();
</script>"""

def member_lookup_widget(name_id='recipient_name',email_id='recipient_email',member_id_id='recipient_member_id'):
    return grand_lodge_recipient_widget(name_id,email_id,member_id_id)+lodge_recipient_widget(name_id,email_id,member_id_id)+f"""<div class="full"><label>Αναζήτηση Αδελφού στο Μητρώο Μελών</label><input type="text" id="doc_member_lookup" placeholder="Επώνυμο, όνομα, email ή κινητό"><div id="doc_member_results"></div><small>Η επιλογή συμπληρώνει αυτόματα τον παραλήπτη και το email από το κεντρικό Μητρώο Μελών.</small></div>
<script>
(function(){{
 const q=document.getElementById('doc_member_lookup'),box=document.getElementById('doc_member_results');
 if(!q||!box)return;let timer=null;
 q.addEventListener('input',()=>{{clearTimeout(timer);const v=q.value.trim();if(v.length<2){{box.innerHTML='';return;}}
 timer=setTimeout(async()=>{{const r=await fetch('/api/members/search?q='+encodeURIComponent(v));if(!r.ok)return;const d=await r.json();box.innerHTML='';
 (d.items||[]).forEach(m=>{{const b=document.createElement('button');b.type='button';b.className='btn';b.style.cssText='display:block;width:100%;text-align:left;margin:4px 0';b.textContent=(m.surname||'')+' '+(m.first_name||'')+(m.email?' — '+m.email:'')+(m.mobile?' — '+m.mobile:'');
 b.addEventListener('click',()=>{{const n=document.getElementById('{name_id}'),e=document.getElementById('{email_id}'),mid=document.getElementById('{member_id_id}');if(n)n.value=((m.first_name||'')+' '+(m.surname||'')).trim();if(e)e.value=m.email||'';if(mid)mid.value=m.id||'';q.value=(m.surname||'')+' '+(m.first_name||'');box.innerHTML='';}});box.appendChild(b);}});
 if(!(d.items||[]).length)box.innerHTML='<small>Δεν βρέθηκε μέλος. Μπορείτε να συνεχίσετε με χειροκίνητη συμπλήρωση.</small>';
 }},220);}});
}})();
</script>"""

def lodge_recipient_widget(name_id='recipient_name',email_id='recipient_email',member_id_id='recipient_member_id'):
    xs=_lodges_all(active_only=True)
    if not xs:return ''
    groups={}
    for x in xs:groups.setdefault((x.get('provincial') or '').strip(),[]).append(x)
    order=[p for p in _provincial_choices() if p in groups]+[p for p in groups if p not in _provincial_choices() and p]+([''] if '' in groups else [])
    opts=''
    for prov in order:
        ls=groups[prov];label=prov or 'Χωρίς ορισμένη ΕπΜΣτ.'
        o=''.join(f'<option value="l{x["id"]}" data-name="{esc(lodge_title(x))}" data-email="{esc(lodge_email(x))}">{esc(str(x["number"]))} · {esc(x["name"])}{" — "+esc(x["orient"]) if x.get("orient") else ""}{"" if lodge_email(x) else " (χωρίς email)"}</option>' for x in ls)
        mails=[lodge_email(x) for x in ls if lodge_email(x)]
        if prov and mails:
            o=f'<option value="g{esc(prov)}" data-name="{esc("Σεβ. Στοές της "+prov)}" data-email="{esc(", ".join(mails))}">▸ Όλες οι Στοές της {esc(prov)} ({len(mails)} με email)</option>'+o
        opts+=f'<optgroup label="{esc(label)}">{o}</optgroup>'
    allm=[lodge_email(x) for x in xs if lodge_email(x)]
    if allm:opts=f'<option value="all" data-name="Σεβ. Στοές της ΕΜΣτΕ" data-email="{esc(", ".join(allm))}">▸ Όλες οι Συμβολικές Στοές ({len(allm)} με email)</option>'+opts
    return f"""<div class="full"><label for="lodge_recipient">Παραλήπτης: Συμβολική Στοά</label><select id="lodge_recipient"><option value="">— Επιλογή Στοάς ({len(xs)}) —</option>{opts}</select><small>Από τη βάση <a href="/lodges">Συμβολικές Στοές</a>· συμπληρώνει Παραλήπτη («Προς») και Email.</small></div>
<script>
(function(){{
 const s=document.getElementById('lodge_recipient');if(!s)return;
 s.addEventListener('change',()=>{{const o=s.options[s.selectedIndex];if(!o||!o.value)return;
  const n=document.getElementById('{name_id}'),e=document.getElementById('{email_id}'),mid=document.getElementById('{member_id_id}'),g=document.getElementById('gl_recipient');
  if(n)n.value=o.dataset.name||'';if(e){{e.multiple=true;e.value=o.dataset.email||'';}}if(mid)mid.value='';if(g)g.value='';
  if(n)n.dispatchEvent(new Event('input',{{bubbles:true}}));}});
 const g=document.getElementById('gl_recipient');if(g)g.addEventListener('change',()=>{{s.value='';}});
}})();
</script>"""


def contact_picker_widget(fields=('to','bcc')):
    # Προσθήκη παραληπτών από τον Κατάλογο σε πεδία email μιας φόρμας (π.χ. «Προς» / «Κρυφή κοινοποίηση»).
    provs=provinces_all(active_only=True);regional=[p for p in provs if p.get('kind')!='Εθνική']
    o=lambda email,text:f'<option value="{esc(email)}">{esc(text)}</option>' if email else ''
    groups=[]
    allsec=', '.join(p['email'] for p in regional if p.get('email'))
    gm=[r for p in regional for r in province_roles(p)[:1] if r['email']];gs=[r for p in regional for r in province_roles(p)[1:] if r['email']]
    groups.append(('▸ Όλες μαζί',o(allsec,'Όλες οι Γραμματείες Επαρχιών')+o(', '.join(r['email'] for r in gm),f'Όλοι οι ΕπΜΔ ({len(gm)})')+o(', '.join(r['email'] for r in gs),f'Όλοι οι ΕπΜΓρ. ({len(gs)})')))
    for p in provs:
        x=o(p.get('email') or '',f"Γραμματεία — {p.get('email')}")+''.join(o(r['email'],f"{r['abbr']} {r['name']} — {r['email']}") for r in province_roles(p))
        groups.append((p['short'],x))
    by={}
    for l in _lodges_all(active_only=True):
        if lodge_email(l):by.setdefault(l.get('provincial') or 'Χωρίς Επαρχία',[]).append(l)
    for prov,ls in by.items():
        groups.append(('Στοές — '+prov,o(', '.join(lodge_email(l) for l in ls),f'Όλες οι Στοές ({len(ls)})')+''.join(o(lodge_email(l),f"{l['number']} · {l['name']} — {lodge_email(l)}") for l in ls)))
    opts=''.join(f'<optgroup label="{esc(g)}">{x}</optgroup>' for g,x in groups if x)
    radios=''.join(f'<label style="display:inline-flex;gap:6px;align-items:center;margin:0 14px 0 0;font-weight:normal"><input type="radio" name="_pick_target" value="{f}" style="width:auto"{" checked" if i==0 else ""}> {lab}</label>'
                   for i,(f,lab) in enumerate(zip(fields,['στο «Προς»','στην «Κρυφή κοινοποίηση»'])))
    return f"""<div class="card" style="background:#f9fbff;margin:8px 0"><label for="cpick">📇 Προσθήκη παραλήπτη από τον Κατάλογο</label>
<select id="cpick"><option value="">— Επιλογή Επαρχίας, ΕπΜΔ, ΕπΜΓρ. ή Στοάς —</option>{opts}</select><div style="margin-top:6px">{radios}</div></div>
<script>(function(){{const s=document.getElementById('cpick');s.addEventListener('change',()=>{{if(!s.value)return;
 const f=s.form.querySelector('[name='+s.form.querySelector('[name=_pick_target]:checked').value+']');
 const have=f.value.split(/[\\s,;]+/).filter(Boolean),add=s.value.split(/[\\s,;]+/).filter(Boolean);
 f.value=[...new Set(have.concat(add))].join(', ');s.value='';f.dispatchEvent(new Event('input',{{bubbles:true}}));}});}})();</script>"""
