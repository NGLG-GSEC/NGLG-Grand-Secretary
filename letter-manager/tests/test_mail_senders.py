# Λογαριασμοί αποστολής: Επιστολές & Διατάγματα από grand.secretary@, όλα τα υπόλοιπα από info@.
import re
from datetime import date, timedelta
from urllib.parse import parse_qs, urlparse

from conftest import outbox
from helpers import new_decree, new_letter


def test_defaults(app_module):
    assert app_module.sender_for('official') == 'grand.secretary@nglgreece.gr'
    assert app_module.sender_for('general') == 'info@nglgreece.gr'
    assert 'sender_email' not in app_module.settings()


def _gmail_link(html):
    href = re.search(r'href="(https://mail\.google\.com/[^"]+)"', html).group(1).replace('&amp;', '&')
    return parse_qs(urlparse(href).query)


def test_letter_opens_gmail_as_secretary_and_shows_sender(admin):
    t = admin.get(f'/letter/{new_letter(admin, "Αποστολέας")}').text
    assert 'Αποστολή από: grand.secretary@nglgreece.gr' in t
    assert _gmail_link(t)['authuser'] == ['grand.secretary@nglgreece.gr']


def test_decree_opens_gmail_as_secretary_and_shows_sender(admin):
    t = admin.get(f'/decrees/{new_decree(admin, matter="Αποστολέας")}').text
    assert 'Αποστολή από: grand.secretary@nglgreece.gr' in t
    q = _gmail_link(t)
    assert q['authuser'] == ['grand.secretary@nglgreece.gr'] and q['to'] == ['g@example.com']


def test_general_mail_from_info_with_banner(admin):
    admin.post('/reps/new', data={'name': 'Ιάκωβος', 'surname': 'Αποστολέως', 'office': 'Μέγας Ευχέτης', 'email': 'iakovos@example.com'})
    rid = re.search(r'/reps/edit/(\d+)', admin.get('/reps', params={'q': 'Αποστολέως'}).text).group(1)
    d = (date.today() + timedelta(days=5)).isoformat()
    admin.post('/visits/new', data={'visit_date': d, 'lodge': 'ΑΠΟΣΤΟΛΗΣ', 'lodge_number': '', 'location': '', 'province': '', 'rep_id': rid, 'notes': ''})
    vid = re.search(r'/visits/edit/(\d+)', admin.get('/visits', params={'q': 'ΑΠΟΣΤΟΛΗΣ'}).text).group(1)
    t = admin.get(f'/visits/brief?ids={vid}').text
    assert 'Αποστολή από: info@nglgreece.gr' in t
    admin.post('/visits/brief', data={'ids': vid, 'rep_id': rid, 'to': 'iakovos@example.com', 'subject': 'Σ', 'body': 'Β', 'mode': 'send'})
    m = outbox()[-1]
    assert m['From'] == 'info@nglgreece.gr' and m['Reply-To'] == 'info@nglgreece.gr'


def test_settings_change_and_validation(admin, app_module):
    t = admin.get('/settings').text
    assert 'Λογαριασμοί αποστολής' in t and 'grand.secretary@nglgreece.gr' in t and 'info@nglgreece.gr' in t
    form = {k: v for k, v in app_module.settings().items()}
    form['mail_from_general'] = 'όχι-email'
    assert admin.post('/settings', data=form).status_code == 400
    form['mail_from_general'] = 'secretariat@example.com'
    assert admin.post('/settings', data=form).status_code == 303
    assert app_module.sender_for('general') == 'secretariat@example.com'
    form['mail_from_general'] = 'info@nglgreece.gr'
    admin.post('/settings', data=form)
    assert app_module.sender_for('general') == 'info@nglgreece.gr'


def test_otp_mail_from_info(app_module, monkeypatch):
    sent = []
    import smtplib

    class FakeSMTP:
        def __init__(self, *a, **k): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def ehlo(self): pass
        def starttls(self, **k): pass
        def login(self, *a): pass
        def send_message(self, m): sent.append(m)
    monkeypatch.setenv('SMTP_HOST', 'smtp.example.com')
    monkeypatch.setenv('SMTP_USERNAME', 'grand.secretary@nglgreece.gr')
    monkeypatch.setenv('SMTP_PASSWORD', 'x')
    monkeypatch.setattr(smtplib, 'SMTP', FakeSMTP)
    assert app_module.sendotp('someone@example.com', '123456')
    assert sent[0]['From'] == 'info@nglgreece.gr'
    assert app_module.smtp_login_differs()


def test_one_time_fix_of_wrong_default(app_module):
    # Βάση που πήρε την πρώτη (λανθασμένη) προεπιλογή διορθώνεται μία φορά· μετά σέβεται την επιλογή του χρήστη.
    with app_module.con() as c:
        c.execute('DELETE FROM settings WHERE key=?', ('_mail_senders_fix1',))
        c.execute('REPLACE INTO settings VALUES(?,?)', ('mail_from_official', 'grand.chancellor@nglgreece.gr'))
    app_module._mail_init()
    assert app_module.sender_for('official') == 'grand.secretary@nglgreece.gr'
    with app_module.con() as c:
        c.execute('REPLACE INTO settings VALUES(?,?)', ('mail_from_official', 'grand.chancellor@nglgreece.gr'))
    app_module._mail_init()
    assert app_module.sender_for('official') == 'grand.chancellor@nglgreece.gr'  # σκόπιμη επιλογή: δεν αλλάζει ξανά
    with app_module.con() as c:
        c.execute('REPLACE INTO settings VALUES(?,?)', ('mail_from_official', 'grand.secretary@nglgreece.gr'))
