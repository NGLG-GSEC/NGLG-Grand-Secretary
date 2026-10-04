# Ενότητες Google Drive και Ειδοποιήσεις (χωρίς πραγματική σύνδεση Google).
from helpers import new_letter


def test_drive_page_without_oauth(admin):
    t = admin.get('/drive').text
    assert 'GOOGLE_OAUTH_CLIENT_ID' in t or 'OAuth' in t


def test_ready_without_drive_creates_notification(admin):
    lid = new_letter(admin, 'Ειδοποίηση δοκιμή')
    admin.post(f'/ready/{lid}')
    r = admin.get('/api/notifications', params={'after': 0})
    assert r.status_code == 200 and 'html' in r.json()


def test_mark_seen(admin):
    r = admin.post('/notifications/seen', data={'upto': '999999'}, headers={'referer': '/'})
    assert r.status_code in (302, 303)
