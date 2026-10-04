# Ενότητα Επαρχιακές Μεγάλες Στοές: πίνακας στη βάση, επεξεργασία, τροφοδοσία παραληπτών και Στοών.
import re


def _pid(admin, short):
    t = admin.get('/provinces').text
    for m in re.finditer(r'<tr><td><b>([^<]+)</b>(?:(?!</tr>).)*?/provinces/edit/(\d+)', t, re.S):
        if m.group(1) == short:
            return int(m.group(2))
    raise AssertionError(short)


def test_seeded_from_previous_fixed_list(admin, app_module):
    xs = app_module.provinces_all()
    assert [x['short'] for x in xs][:2] == ['ΕπΜΣτ. Αθηνών', 'ΕπΜΣτ. Πειραιώς & Νήσων Αρχ. Αιγαίου']
    assert len(xs) >= 7 and {x['kind'] for x in xs} == {'Επαρχιακή', 'Περιφερειακή', 'Εθνική'}
    assert 'ΕΜΣτΕ Α.Ε. & Α.Τ.' not in app_module._provincial_choices()  # η ΕΜΣτΕ δεν είναι «ΕπΜΣτ.» Στοάς


def test_page_and_menu(admin):
    t = admin.get('/provinces').text
    assert 'athens.secretary@nglgreece.gr' in t and 'ΠΜΣτ. Κύπρου' in t
    assert 'href="/provinces"' in admin.get('/').text


def test_edit_email_reaches_letter_recipients(admin):
    pid = _pid(admin, 'ΕπΜΣτ. Ιονίων Νήσων')
    form = admin.get(f'/provinces/edit/{pid}').text
    assert 'ionian.secretary@nglgreece.gr' in form
    r = admin.post(f'/provinces/edit/{pid}', data={
        'short': 'ΕπΜΣτ. Ιονίων Νήσων', 'full_title': 'Επαρχιακή Μεγάλη Στοά Ιονίων Νήσων', 'kind': 'Επαρχιακή',
        'email': 'ionian.new@example.com', 'addressee': 'ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Ιονίων Νήσων',
        'secretary_name': 'Γ. Γραμματέας', 'sort_order': '30', 'active': '1'})
    assert r.status_code == 303
    t = admin.get('/new').text
    assert 'ionian.new@example.com' in t and 'ionian.secretary@nglgreece.gr' not in t


def test_rename_moves_its_lodges(admin, app_module):
    admin.post('/lodges/new', data={'number': '997', 'name': 'ΜΕΤΟΝΟΜΑΣΙΑ', 'provincial': 'ΕπΜΣτ. Αθηνών', 'status': 'Ενεργή'})
    pid = _pid(admin, 'ΕπΜΣτ. Αθηνών')
    x = app_module.province_get(pid)
    data = {k: str(x.get(k) or '') for k in app_module.PROVINCE_COLS}
    data.update(short='ΕπΜΣτ. Αθηνών (νέα)', active='1')
    assert admin.post(f'/provinces/edit/{pid}', data=data).status_code == 303
    lodge = [l for l in app_module._lodges_all() if l['number'] == '997'][0]
    assert lodge['provincial'] == 'ΕπΜΣτ. Αθηνών (νέα)'
    data['short'] = 'ΕπΜΣτ. Αθηνών'
    admin.post(f'/provinces/edit/{pid}', data=data)


def test_inactive_hidden_from_lists(admin, app_module):
    r = admin.post('/provinces/new', data={'short': 'ΕπΜΣτ. Δοκιμής', 'kind': 'Επαρχιακή', 'email': 'dokimi@example.com',
                                           'addressee': 'ΕπΜΓρ. Δοκιμής', 'sort_order': '99', 'active': '0'})
    assert r.status_code == 303
    assert 'dokimi@example.com' not in admin.get('/new').text
    assert 'ΕπΜΣτ. Δοκιμής' not in app_module._provincial_choices()


def test_validation(admin):
    assert admin.post('/provinces/new', data={'short': '', 'kind': 'Επαρχιακή'}).status_code == 400
    assert admin.post('/provinces/new', data={'short': 'Χ', 'email': 'όχι-email'}).status_code == 400
    assert admin.post('/provinces/new', data={'short': 'ΠΜΣτ. Κύπρου'}).status_code == 400  # διπλή


def test_editor_has_no_access(admin):
    from fastapi.testclient import TestClient
    from conftest import APP, login
    admin.post('/users', data={'email': 'editor2@example.com', 'role': 'editor', 'active': '1'})
    c = login(TestClient(APP.app, follow_redirects=False), email='editor2@example.com')
    assert c.get('/provinces').status_code in (302, 303, 403)
