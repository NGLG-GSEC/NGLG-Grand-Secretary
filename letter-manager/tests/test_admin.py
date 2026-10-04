# Ενότητα Διαχείριση: χρήστες, ρυθμίσεις, πρότυπα.
def test_add_user(admin):
    r = admin.post('/users', data={'email': 'user@example.com', 'role': 'editor', 'active': '1'})
    assert r.status_code in (302, 303)
    assert 'user@example.com' in admin.get('/users').text


def test_settings_save(admin):
    t = admin.get('/settings').text
    assert 'protocol_start' in t and 'drive_folder_id' in t


def test_save_template(admin):
    r = admin.post('/templates', data={'name': 'Πρότυπο δοκιμής', 'body': 'Σώμα', 'active': '1'})
    assert r.status_code in (302, 303)
    assert 'Πρότυπο δοκιμής' in admin.get('/templates').text


def test_editor_cannot_open_admin_pages(admin):
    from fastapi.testclient import TestClient
    from conftest import APP, login
    c = login(TestClient(APP.app, follow_redirects=False), email='user@example.com')
    for path in ['/users', '/settings', '/members', '/lodges', '/drive']:
        assert c.get(path).status_code in (302, 303, 403), path
