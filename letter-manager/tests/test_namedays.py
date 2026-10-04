# Εορτολόγιο: κινητές/σταθερές εορτές, εορτάζοντες, ευχές (HTML, θυρεός, κρυφή κοινοποίηση, προσφώνηση), αναφορά ΜΔ.
import io
import json
import re
from datetime import date

from conftest import outbox

Y = date.today().year


def test_orthodox_easter_and_rules(app_module):
    assert app_module.orthodox_easter(2025) == date(2025, 4, 20)
    assert app_module.orthodox_easter(2026) == date(2026, 4, 12)
    assert app_module.orthodox_easter(2027) == date(2027, 5, 2)
    george = {'md': '04-23', 'rule': 'george'}
    assert app_module.nameday_in(george, 2025) == date(2025, 4, 23)
    assert app_module.nameday_in(george, 2027) == date(2027, 5, 3)  # πριν από το Πάσχα → Δευτέρα του Πάσχα
    assert app_module.nameday_in({'easter': 0}, 2026) == date(2026, 4, 12)
    assert app_module.nd_key('Δημήτριος-Παύλος') == app_module.nd_key('ΔΗΜΗΤΡΙΟΣ') == 'δημητριοσ'


def _member(admin, surname, first, email, lodges='LA PAIX | 95 | ΕΝΕΡΓΟΣ', registry_no=''):
    r = admin.post('/members/new', data={'surname': surname, 'first_name': first, 'email': email, 'lodges_text': lodges,
                                         'active': '1', 'registry_no': registry_no})
    assert r.status_code in (302, 303), r.text[:200]


def test_celebrants_page_and_greeting(admin, app_module):
    with app_module.con() as c:
        c.execute('UPDATE lodges SET provincial=? WHERE number=?', ('ΕπΜΣτ. Αθηνών', '95'))
    _member(admin, 'Εορτάζων', 'Δημήτριος', 'dimitris@example.com', registry_no='99001')
    t = admin.get('/namedays', params={'frm': f'{Y}-10-20', 'to': f'{Y}-10-31'}).text
    assert 'Εορτάζων' in t and 'Δημήτριος' in t and f'{Y}-10-26' in t
    m = [x for x in app_module._nd_members() if x['surname'] == 'Εορτάζων'][0]
    k = f"{m['id']}|{Y}-10-26|Δημήτριος"
    t = admin.post('/namedays/compose', data={'k': k}).text
    assert 'Ευχές ονομαστικής εορτής' in t and 'Αποστολή από: info@nglgreece.gr' in t and 'Αγαπητέ Αδελφέ' in t
    n = len(outbox())
    r = admin.post('/namedays/send', data={'k': k, f'rk:{k}': '1', 'subject': 'Χρόνια πολλά {Όνομα}', 'body': app_module.GREET_BODY_DEFAULT,
                                           'crest': '1', 'bcc_prov': '1', 'mode': 'send'})
    assert r.status_code == 303
    msg = outbox()[-1]
    assert len(outbox()) == n + 1 and msg['To'] == 'dimitris@example.com'
    assert 'athens.secretary@nglgreece.gr' in msg['Bcc']  # Γραμματεία της Επαρχίας της Στοάς του
    html = [p for p in msg.walk() if p.get_content_type() == 'text/html'][0].get_payload(decode=True).decode()
    assert 'ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ' in html and 'Λίαν Σεβάσμιε Αδελφέ' in html and 'Λίαν Σεβ. Αδ. Δημήτριος Εορτάζων' in html
    assert any(p.get_filename() == 'thyreos-emste.png' for p in msg.walk())
    assert '✓ Ευχές' in admin.get('/namedays', params={'frm': f'{Y}-10-20', 'to': f'{Y}-10-31'}).text
    assert 'Εορτάζων' not in admin.get('/namedays', params={'frm': f'{Y}-10-20', 'to': f'{Y}-10-31', 'hide': '1'}).text


def test_salutation_from_representative(admin, app_module):
    _member(admin, 'Αξιωματικός', 'Κωνσταντίνος', 'kostas.ax@example.com')
    m = [x for x in app_module._nd_members() if x['surname'] == 'Αξιωματικός'][0]
    assert app_module.member_rank_idx(m) == -1
    admin.post('/reps/new', data={'name': 'Κωνσταντίνος', 'surname': 'Αξιωματικός', 'office': 'Επαρχιακός Μέγας Διδάσκαλος', 'member_id': str(m['id'])})
    assert app_module.member_rank_idx(m) == 2
    assert app_module.greet_fill('{Τίτλος} {Επώνυμο} — {Προσφώνηση}', m, 2, 'x', f'{Y}-05-21') == 'Πσεβ. Αδ. Αξιωματικός — Πανσεβάσμιε Αδελφέ'


def test_template_save_and_reset(admin, app_module):
    m = [x for x in app_module._nd_members() if x['surname'] == 'Αξιωματικός'][0]
    k = f"{m['id']}|{Y}-05-21|Κωνσταντίνος"
    admin.post('/namedays/send', data={'k': k, 'subject': 'Νέο θέμα', 'body': 'Νέο κείμενο {Όνομα}', 'mode': 'save_tpl'})
    assert app_module.settings()['greet_subject'] == 'Νέο θέμα'
    admin.post('/namedays/send', data={'k': k, 'subject': 'x', 'body': 'y', 'mode': 'reset_tpl'})
    assert app_module.settings()['greet_body'] == app_module.GREET_BODY_DEFAULT


def test_report_to_grand_master(admin):
    t = admin.get('/namedays/report').text
    assert 'Εορτάζων Δημήτριος' in t and 'Αποστολή αναφοράς στον Μεγάλο Διδάσκαλο' in t
    r = admin.get('/namedays/report', params={'pdf': '1'})
    assert r.status_code == 200 and r.content[:4] == b'%PDF'
    r = admin.post('/namedays/report/send', data={'to': 'gm@example.com', 'subject': 'Αναφορά', 'body': 'Κείμενο'})
    assert r.status_code == 303
    m = outbox()[-1]
    assert m['To'] == 'gm@example.com' and any((p.get_filename() or '').endswith('.pdf') for p in m.walk())


def test_export_and_calendar_crud(admin, app_module):
    r = admin.get('/namedays/export.xlsx', params={'frm': f'{Y}-10-20', 'to': f'{Y}-10-31'})
    assert r.status_code == 200 and r.content[:2] == b'PK'
    assert 'Γεώργιος' in admin.get('/namedays/calendar', params={'q': 'γεωργ'}).text
    r = admin.post('/namedays/calendar/new', data={'name': 'Πλασματικός', 'official': 'Πλασματικός', 'md': '13-40'})
    assert r.status_code == 400
    assert admin.post('/namedays/calendar/new', data={'name': 'Πλασματικός', 'official': 'Πλασματικός', 'md': '02-29'}).status_code == 303
    x = [n for n in app_module.namedays_all() if n['name'] == 'Πλασματικός'][0]
    assert admin.post(f"/namedays/calendar/edit/{x['id']}", data={'name': 'Πλασματικός', 'easter': '50'}).status_code == 303
    assert app_module.nameday_in([n for n in app_module.namedays_all() if n['name'] == 'Πλασματικός'][0], 2026) == date(2026, 6, 1)
    assert admin.post(f"/namedays/calendar/delete/{x['id']}").status_code == 303


def test_home_banner(app_module):
    assert app_module.namedays_banner_html({'role': 'editor', 'email': 'x@example.com'}) == ''


def test_import_greetings_history_and_masters(admin, app_module):
    _member(admin, 'Ιστορικός', 'Νικόλαος', 'nikos@example.com', registry_no='99002')
    payload = {'format': 'nglg-lodge-visits/1',
               'greetings': [{'registryNo': 99002, 'date': f'{Y}-12-06', 'feast': 'Νικόλαος', 'name': 'Ιστορικός Νικόλαος', 'email': 'nikos@example.com',
                              'subject': 'Χρόνια πολλά', 'sentOn': f'{Y}-12-05'}, {'registryNo': 123456789, 'date': f'{Y}-12-06'}],
               'lodgeMasters': [{'number': '95', 'name': 'Πέτρος', 'surname': 'Σεβάσμιος'}],
               'settings': {'greet_bcc_self': 'copy@example.com'}}
    for _ in range(2):
        r = admin.post('/visits/import-data', files={'file': ('g.json', io.BytesIO(json.dumps(payload).encode()), 'application/json')})
        assert r.status_code == 303
    with app_module.con() as c:
        assert c.execute('SELECT COUNT(*) n FROM greetings_log WHERE registry_no=?', (99002,)).fetchone()['n'] == 1
    master = [l for l in app_module._lodges_all() if l['number'] == '95'][0]['master']
    assert master  # συμπληρώθηκε (ή υπήρχε ήδη) — δεν αντικαθίσταται υπάρχον Σεβάσμιος
    assert app_module.settings()['greet_bcc_self'] == 'copy@example.com'
