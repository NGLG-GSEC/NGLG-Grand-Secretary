# Πρότζεκτ ΜΔ: δημιουργία, στοιχεία, Στοές/ομάδες, μέλη, επαφές, αρχεία/σύνδεσμοι, ημερολόγιο, αναφορά, διαγραφή.
import io
import re

def _png():
    from PIL import Image
    b = io.BytesIO()
    Image.new('RGB', (40, 30), (20, 60, 120)).save(b, 'PNG')
    return b.getvalue()


PNG = _png()


def _new(admin, **kw):
    data = {'title': 'Ίδρυση Σ.Σ. «Δοκιμή»', 'ptype': 'lodge', 'start_date': '2026-10-01', 'target_date': '2020-01-01'}
    data.update(kw)
    r = admin.post('/projects/new', data=data)
    assert r.status_code == 303
    return int(r.headers['location'].rsplit('/', 1)[1])


def test_full_project_flow(admin, app_module):
    pid = _new(admin)
    p = app_module.project_get(pid)
    assert len(p['units']) == 1 and p['units'][0]['name'] == 'Ίδρυση Σ.Σ. «Δοκιμή»'
    t = admin.get(f'/projects/{pid}').text
    assert 'Εκπρόθεσμο' in t
    admin.post(f'/projects/{pid}/save', data={'title': 'Ίδρυση Σ.Σ. «Δοκιμή»', 'ptype': 'lodge', 'status': 'active', 'start_date': '2026-10-01',
                                              'target_date': '2099-01-01', 'description': 'Περιγραφή', 'notes': 'Σημ.'})
    assert app_module.project_get(pid)['status'] == 'active'
    admin.post('/members/new', data={'surname': 'Ιδρυτής', 'first_name': 'Άγγελος', 'email': 'ag@example.com', 'active': '1'})
    mid = re.search(r'/members/edit/(\d+)', admin.get('/members', params={'q': 'Ιδρυτής', 'field': 'surname'}).text).group(1)
    admin.post(f'/projects/{pid}/members/add', data={'member_id': mid})
    admin.post(f'/projects/{pid}/members/add', data={'member_id': mid})  # όχι διπλή
    assert app_module.project_get(pid)['member_ids'] == [int(mid)]
    uid = app_module.project_get(pid)['units'][0]['id']
    admin.post(f'/projects/{pid}/units', data={'uid': str(uid), 'uname': 'Δοκιμή', 'uleader': mid, 'unotes': 'Υπεύθυνος'})
    assert app_module.project_get(pid)['units'][0]['leader_member_id'] == int(mid)
    admin.post(f'/projects/{pid}/contacts/add', data={})
    cid = app_module.project_get(pid)['contacts'][0]['id']
    admin.post(f'/projects/{pid}/contacts', data={'cid': str(cid), 'c_name': 'Αρχιτέκτων', 'c_role': 'Μελέτη', 'c_phone': '210', 'c_email': 'a@example.com', 'c_notes': ''})
    assert app_module.project_get(pid)['contacts'][0]['name'] == 'Αρχιτέκτων'
    r = admin.post(f'/projects/{pid}/files', files=[('files', ('foto.png', io.BytesIO(PNG), 'image/png'))])
    assert r.status_code == 303
    r = admin.post(f'/projects/{pid}/files', files=[('files', ('kako.exe', io.BytesIO(b'MZ...'), 'application/octet-stream'))])
    assert r.status_code == 400
    admin.post(f'/projects/{pid}/links', data={'name': 'Φάκελος', 'url': 'drive.google.com/x'})
    fs = app_module.project_get(pid)['files']
    assert {f['kind'] for f in fs} == {'image', 'link'} and fs[1]['url'] == 'https://drive.google.com/x'
    img = [f for f in fs if f['kind'] == 'image'][0]
    r = admin.get(f"/projects/file/{img['id']}")
    assert r.status_code == 200 and r.content == PNG
    r = admin.post(f'/projects/{pid}/cover', files={'file': ('c.png', io.BytesIO(PNG), 'image/png')})
    assert r.status_code == 303 and app_module.project_get(pid)['cover_file']
    admin.post(f'/projects/{pid}/log', data={'log_date': '2026-10-02', 'text': 'Συνάντηση ιδρυτικών μελών'})
    assert app_module.project_get(pid)['log'][0]['text'] == 'Συνάντηση ιδρυτικών μελών'
    r = admin.get(f'/projects/{pid}/report.pdf')
    assert r.status_code == 200 and r.content[:4] == b'%PDF'
    t = admin.get('/projects').text
    assert 'Ίδρυση Σ.Σ. «Δοκιμή»' in t and '1 μέλη' in t
    path = app_module.project_file_path(img)
    assert path.exists()
    assert admin.post(f'/projects/{pid}/delete').status_code == 303
    assert app_module.project_get(pid) is None and not path.exists()


def test_body_with_units(admin, app_module):
    pid = _new(admin, title='Νέο Σώμα', ptype='body', units='3')
    p = app_module.project_get(pid)
    assert [u['name'] for u in p['units']] == ['Στοά 1', 'Στοά 2', 'Στοά 3']
    admin.post(f'/projects/{pid}/units/add')
    assert len(app_module.project_get(pid)['units']) == 4
    admin.post(f"/projects/{pid}/units/delete/{p['units'][0]['id']}")
    assert len(app_module.project_get(pid)['units']) == 3
