# Παραλήπτες — λίστες για Επιστολές: Επαρχιακές Μεγάλες Στοές, Συμβολικές Στοές, μέλη.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

# Παραλήπτες Επιστολών: Επαρχιακές / Περιφερειακή Μεγάλη Στοά και ΕΜΣτΕ.
# (τίτλος, πλήρης τίτλος, email, «Προς» όπως τυπώνεται στην επιστολή)
GRAND_LODGE_RECIPIENTS=[
 ('ΕπΜΣτ. Αθηνών','Επαρχιακή Μεγάλη Στοά Αθηνών','athens.secretary@nglgreece.gr','ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Αθηνών'),
 ('ΕπΜΣτ. Πειραιώς & Νήσων Αρχ. Αιγαίου','Επαρχιακή Μεγάλη Στοά Πειραιώς και Νήσων Αρχιπελάγους Αιγαίου','piraeus.secretary@nglgreece.gr','ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Πειραιώς και Νήσων Αρχιπελάγους Αιγαίου'),
 ('ΕπΜΣτ. Ιονίων Νήσων','Επαρχιακή Μεγάλη Στοά Ιονίων Νήσων','ionian.secretary@nglgreece.gr','ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Ιονίων Νήσων'),
 ('ΕπΜΣτ. Κεντρικής & Βορείου Ελλάδος','Επαρχιακή Μεγάλη Στοά Κεντρικής και Βορείου Ελλάδος','nglgr.prov.cent.north@gmail.com','ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Κεντρικής και Βορείου Ελλάδος'),
 ('ΕπΜΣτ. Πελοποννήσου & Δυτικής Ελλάδας','Επαρχιακή Μεγάλη Στοά Πελοποννήσου και Δυτικής Ελλάδας','secretary.pr.pwg.nglgreece@gmail.com','ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Πελοποννήσου και Δυτικής Ελλάδας'),
 ('ΠΜΣτ. Κύπρου','Περιφερειακή Μεγάλη Στοά Κύπρου','dglcyprus@nglgreece.gr','ΠερΜΓρ. Περιφερειακής Μεγάλης Στοάς Κύπρου'),
 ('ΕΜΣτΕ Α.Ε. & Α.Τ.','Εθνική Μεγάλη Στοά της Ελλάδος των Αρχαίων, Ελευθέρων και Αποδεκτών Τεκτόνων','grand.secretary@nglgreece.gr','ΜΓρ. Εθνικής Μεγάλης Στοάς της Ελλάδος των Αρχαίων, Ελευθέρων και Αποδεκτών Τεκτόνων'),
]

def grand_lodge_recipient_widget(name_id='recipient_name',email_id='recipient_email',member_id_id='recipient_member_id'):
    regional=[r for r in GRAND_LODGE_RECIPIENTS if not r[0].startswith('ΕΜΣτΕ')]
    opts=''.join(f'<option value="{i}" data-name="{esc(r[3])}" data-email="{esc(r[2])}">{esc(r[0])} — {esc(r[1])} ({esc(r[2])})</option>' for i,r in enumerate(GRAND_LODGE_RECIPIENTS))
    allname='ΕπΜΓρ. των Επαρχιακών Μεγάλων Στοών και ΠερΜΓρ. της Περιφερειακής Μεγάλης Στοάς Κύπρου'
    opts+=f'<option value="all" data-name="{esc(allname)}" data-email="{esc(", ".join(r[2] for r in regional))}">Όλες οι Επαρχιακές Μεγάλες Στοές και η ΠΜΣτ. Κύπρου ({len(regional)})</option>'
    return f"""<div class="full"><label for="gl_recipient">Παραλήπτης: Επαρχιακή / Περιφερειακή Μεγάλη Στοά</label><select id="gl_recipient"><option value="">— Επιλογή Μεγάλης Στοάς —</option>{opts}</select><small>Η επιλογή συμπληρώνει αυτόματα τον Παραλήπτη («Προς») και το Email· μπορείτε να τα διορθώσετε πριν την αποθήκευση.</small></div>
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
