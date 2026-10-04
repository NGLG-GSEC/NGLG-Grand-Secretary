# Μία είσοδος: σύνδεσμοι από το portal προς σελίδες της εφαρμογής (επιστροφή μετά την είσοδο) και πίνακας ελέγχου στην αρχική.
import re

from fastapi.testclient import TestClient

from conftest import ADMIN, APP


def _login_flow(client, email=ADMIN):
    r = client.post('/otp', data={'email': email})
    code = re.search(r'DEV OTP: (\d{6})', r.text).group(1)
    return client.post('/verify', data={'email': email, 'code': code})


def test_deep_link_returns_after_login():
    c = TestClient(APP.app, follow_redirects=False)
    r = c.get('/namedays?frm=2026-10-01&to=2026-10-31')
    assert r.status_code == 303 and r.headers['location'] == '/login'
    r = _login_flow(c)
    assert r.status_code == 303 and r.headers['location'] == '/identity'  # κοινός λογαριασμός: πρώτα «Ποιος έχει εισέλθει;»
    r = c.post('/identity', data={'actor': 'dimitrios'})
    assert r.status_code == 303 and r.headers['location'] == '/namedays?frm=2026-10-01&to=2026-10-31'
    _login_flow(c)
    assert c.post('/identity', data={'actor': 'dimitrios'}).headers['location'] == '/'  # η επόμενη είσοδος πάει στην αρχική


def test_unsafe_next_is_ignored(app_module):
    for bad in ['//evil.example.com', 'https://evil.example.com', '/login', '\\\\evil']:
        assert app_module._safe_next(bad) == ''
    assert app_module._safe_next('/visits?prov=x') == '/visits?prov=x'


def test_api_still_401():
    c = TestClient(APP.app, follow_redirects=False)
    assert c.get('/api/notifications').status_code == 401


def test_dashboard_tiles(admin):
    t = admin.get('/').text
    for s in ['Επιστολές', 'Διατάγματα', 'Επισκέψεις Στοών', 'Εορτολόγιο', 'Πρότζεκτ ΜΔ', 'Κατάλογος', 'Μητρώο Μελών', 'Google Drive',
              'href="/visits/publish"', 'href="/namedays/report"']:
        assert s in t, s


def test_editor_dashboard_is_limited(admin):
    from conftest import login
    admin.post('/users', data={'email': 'dash.editor@example.com', 'role': 'editor', 'active': '1'})
    c = login(TestClient(APP.app, follow_redirects=False), email='dash.editor@example.com')
    t = c.get('/').text
    assert 'Νέα Επιστολή' in t and 'Επισκέψεις Στοών' not in t
