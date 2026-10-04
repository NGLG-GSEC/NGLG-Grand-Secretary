# Google Drive — ανέβασμα PDF εγγράφων και κατάσταση ανεβάσματος.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

def _doc_info(kind,doc_id):
    with con() as c:
        if kind=='letter':r=c.execute('SELECT id,protocol_no,subject,status FROM letters WHERE id=?',(doc_id,)).fetchone()
        else:r=c.execute('SELECT id,protocol_no,decree_no,decree_year,matter,subject,status FROM decree_documents WHERE id=?',(doc_id,)).fetchone()
    return dict(r) if r else None

def _drive_file_name(kind,d):
    p=(d.get('protocol_no') or '').strip()
    topic=d.get('subject') if kind=='letter' else (d.get('matter') or d.get('subject'))
    if not p or '_' not in p:
        base=p or (f"{d.get('decree_no')}-{d.get('decree_year')}" if kind=='decree' else str(d['id']))
        p=f"{base}_{DOC_KINDS[kind]}_{protocol_topic(topic)}"
    return re.sub(r'[\\/:*?"<>|]+',' ',p).strip()+'.pdf'

def _upload_row(kind,doc_id):
    with con() as c:r=c.execute('SELECT * FROM drive_uploads WHERE doc_type=? AND doc_id=? ORDER BY id DESC LIMIT 1',(kind,doc_id)).fetchone()
    return dict(r) if r else None

def _save_upload(kind,doc_id,**kv):
    row=_upload_row(kind,doc_id);ts=now()
    with con() as c:
        if row:
            c.execute('UPDATE drive_uploads SET '+','.join(k+'=?' for k in kv)+',updated_at=? WHERE id=?',tuple(kv.values())+(ts,row['id']))
        else:
            c.execute('INSERT INTO drive_uploads(doc_type,doc_id,'+','.join(kv)+',created_at,updated_at) VALUES(?,?,'+','.join('?'*len(kv))+',?,?)',(kind,doc_id)+tuple(kv.values())+(ts,ts))

_drive_lock=threading.Lock()

def drive_upload_doc(kind,doc_id,req):
    d=_doc_info(kind,doc_id)
    if not d:return
    name=_drive_file_name(kind,d);page_link=f'/letter/{doc_id}' if kind=='letter' else f'/decrees/{doc_id}'
    if not drive_connected():
        _save_upload(kind,doc_id,file_name=name,status='not_connected',error='Το Google Drive δεν έχει συνδεθεί.')
        notify(f'Το PDF «{name}» ΔΕΝ ανέβηκε στο Google Drive: η σύνδεση με το Drive δεν έχει γίνει ακόμη.','error','/drive','Σύνδεση Google Drive')
        return
    with _drive_lock:
        try:
            resp=download_pdf(req,doc_id) if kind=='letter' else decree2_pdf(req,doc_id)
            pdf=bytes(resp.body)
            token=_drive_token();prev=_upload_row(kind,doc_id)
            fid=(prev or {}).get('drive_file_id') or None
            try:res=_drive_send(token,name,pdf,fid)
            except RuntimeError as e:
                if fid and 'Google 404' in str(e):res=_drive_send(token,name,pdf,None)
                else:raise
            _save_upload(kind,doc_id,file_name=name,drive_file_id=res.get('id',''),web_link=res.get('webViewLink',''),status='ok',error='')
            notify(f'Το PDF «{name}» μεταφορτώθηκε στο Google Drive.'+(' (ενημερώθηκε το υπάρχον αρχείο)' if fid else ''),'ok',res.get('webViewLink') or page_link,'Άνοιγμα στο Drive' if res.get('webViewLink') else 'Άνοιγμα')
        except Exception as e:
            _save_upload(kind,doc_id,file_name=name,status='error',error=str(e)[:500])
            notify(f'Αποτυχία μεταφόρτωσης του «{name}» στο Google Drive: {str(e)[:200]}','error',page_link,'Δοκιμάστε ξανά')

def drive_on_ready(resp,kind,doc_id,req,status):
    # Όταν ένα έγγραφο γίνεται (ή αποθηκεύεται ως) «Έτοιμο», το τελικό PDF ανεβαίνει στο Drive
    # στο παρασκήνιο· η ειδοποίηση εμφανίζεται στην εφαρμογή μόλις ολοκληρωθεί.
    if str(status)=='ready':resp.background=BackgroundTask(drive_upload_doc,kind,doc_id,req)
    return resp

def drive_status_html(kind,doc_id,u=None):
    d=_doc_info(kind,doc_id) or {}
    row=_upload_row(kind,doc_id)
    prot=f'<p style="margin:10px 0 4px"><b>Αρ. Πρωτ.:</b> <span class="official-number">{esc(d.get("protocol_no") or "—")}</span></p>' if kind=='decree' else ''
    if row and row['status']=='ok':
        st=f'✔ Αντίγραφο στο Google Drive ({esc((row["updated_at"] or "")[:16].replace("T"," "))})'+(f' · <a target="_blank" rel="noopener" href="{esc(row["web_link"])}">Άνοιγμα στο Drive</a>' if row.get('web_link') else '')
    elif row and row['status']=='error':st=f'⚠ Η τελευταία μεταφόρτωση απέτυχε: {esc(row["error"] or "")}'
    elif row and row['status']=='not_connected':st='⚠ Δεν ανέβηκε: το Google Drive δεν έχει συνδεθεί.'
    else:st='Το PDF ανεβαίνει αυτόματα στο Google Drive όταν το έγγραφο σημανθεί «Έτοιμο».'
    btn=f'<form method="post" action="/drive/upload/{kind}/{doc_id}" style="display:inline"><button>⬆ {"Ξανά " if row and row["status"]=="ok" else ""}Ανέβασμα στο Google Drive</button></form>' if drive_connected() else (' <a class="btn" href="/drive">Σύνδεση Google Drive</a>' if isadmin(u) else '')
    return f'{prot}<div class="drive-status"><b>Google Drive:</b> {st} {btn}</div>'
