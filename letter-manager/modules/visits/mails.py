# Επισκέψεις Στοών — κείμενα email: ενημέρωση εκπροσώπου (με πρόσκληση ημερολογίου) και ενημέρωση Επαρχίας.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

VISITS_PUB_SUBJECT='Ενημέρωση Εκπροσώπησης ΜΔ στις Εγκαταστάσεις Σεβασμίων Σ. Στοών της Επαρχίας σας'

def rep_mail_content(r,vs):
    vs=sorted(vs,key=lambda v:v['visit_date']);one=len(vs)==1;v=vs[0]
    def item(v):
        p=province_by_short(v.get('province') or '')
        s=f"{lodge_ref(v)}\n   Ημερομηνία: {day_str(v['visit_date'])}"
        if v.get('location'):s+=f"\n   Τόπος: {v['location']}"
        if v.get('province'):s+=f"\n   Επαρχία: {(p or {}).get('full_title') or v['province']}"+(f" (Γραμματεία: {p['email']})" if p and p.get('email') else '')
        return s
    items=item(v) if one else '\n\n'.join(f'{i}. {item(x)}' for i,x in enumerate(vs,1))
    where=('στην Εγκατάσταση του Σεβασμίου Διδασκάλου της κάτωθι Σεβαστής Στοάς' if one
           else 'στις Εγκαταστάσεις των Σεβασμίων Διδασκάλων των κάτωθι Σεβαστών Στοών')
    body=f"""{rep_vocative(r)},

Σας ενημερώνουμε ότι έχετε οριστεί να εκπροσωπήσετε τον Μεγάλο Διδάσκαλο {where}:

{items}

Η αρμόδια Επαρχιακή Μεγάλη Στοά ενημερώνεται σχετικά. Παρακαλούμε όπως έλθετε σε επικοινωνία με τη Γραμματεία της Επαρχίας ή με τον Σεβάσμιο της Στοάς για την ώρα έναρξης και τις λεπτομέρειες της τελετής, και όπως μας ενημερώσετε έγκαιρα σε περίπτωση κωλύματος.

Σας ευχαριστούμε θερμά για την εκπροσώπηση.

{visits_signature()}"""
    subject=(f"Ενημέρωση Εκπροσώπησης ΜΔ — Εγκατάσταση Σεβασμίου {lodge_ref(v)} — {day_str(v['visit_date'])}" if one
             else 'Ενημέρωση Εκπροσώπησης ΜΔ στις Εγκαταστάσεις Σεβασμίων Σ. Στοών')
    fn=f"egkatastasi-{v.get('lodge_number') or 'stoa'}.ics" if one else 'egkatastaseis.ics'
    return {'visits':vs,'subject':subject,'body':body,'ics':ics_for(vs),'ics_name':fn}

def province_missing_lodges(prov):
    today=date.today().isoformat()
    has={_lodge_no_key(v['lodge_number']) for v in visits_all() if v['visit_date']>=today and v.get('lodge_number')}
    return [l for l in _lodges_all(active_only=True) if (l.get('provincial') or '')==prov and _lodge_no_key(l['number']) not in has]

def province_mail_body(p,rows,missing):
    reps={r['id']:r for r in reps_all()}
    lines='\n\n'.join(f"{i}. {day_str(v['visit_date'])} — {lodge_ref(v)}{' — '+v['location'] if v.get('location') else ''}\n   Εκπρόσωπος ΜΔ: "
                      +(rep_full(reps[v['rep_id']]) if v.get('rep_id') in reps else 'θα οριστεί και θα σας γνωστοποιηθεί') for i,v in enumerate(rows,1))
    unas=any(v.get('rep_id') not in reps for v in rows)
    t=province_title(p);full=(p or {}).get('full_title') or ''
    out=f"Αγαπητέ Αδελφέ{' '+t if t else ''},\n\nΣας γνωρίζουμε ότι στις Εγκαταστάσεις των Σεβασμίων Διδασκάλων των Σεβαστών Στοών της Επαρχίας σας{f' ({full})' if full else ''} τον Μεγάλο Διδάσκαλο θα εκπροσωπήσουν οι κάτωθι Αδελφοί:\n\n{lines}\n"
    if unas:out+='\nΓια τις Εγκαταστάσεις όπου δεν έχει ακόμη οριστεί εκπρόσωπος θα ακολουθήσει νεότερη ενημέρωση.\n'
    if missing:out+='\nΔεν μας έχει ακόμη γνωστοποιηθεί η ημερομηνία Εγκατάστασης για τις Σεβαστές Στοές: '+', '.join(f"«{l['name']}» Αρ. {l['number']}" for l in missing)+'. Παρακαλούμε όπως μας τη γνωστοποιήσετε.\n'
    return out+f'\nΠαρακαλούμε όπως ενημερώσετε σχετικά τις Σεβαστές Στοές.\n\n{visits_signature()}'
