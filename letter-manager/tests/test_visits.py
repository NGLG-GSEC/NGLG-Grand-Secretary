# Ενότητα Επισκέψεις Στοών & Εκπρόσωποι (με πλασματικά δεδομένα).
import io
import json
import re
from datetime import date, timedelta
from email.header import decode_header, make_header

from conftest import outbox

D1 = (date.today() + timedelta(days=20)).isoformat()
D2 = (date.today() + timedelta(days=40)).isoformat()
PAYLOAD = {
    'format': 'nglg-lodge-visits/1',
    'provinces': [{'short': 'ΕπΜΣτ. Αθηνών', 'full': 'Επαρχιακή Μεγάλη Στοά Αθηνών', 'email': 'x@example.com', 'gmName': 'Πλασματικός ΕπΜΔ', 'order': 1}],
    'lodges': [{'number': '95', 'name': 'LA PAIX', 'province': 'ΕπΜΣτ. Αθηνών', 'ritual': 'Emulation', 'location': 'Τεκτονικόν Μέγαρον Δοκιμής'},
               {'number': '990', 'name': 'ΠΛΑΣΜΑΤΙΚΗ', 'province': 'ΕπΜΣτ. Αθηνών', 'ritual': 'Σκωτικό', 'inactive': True}],
    'reps': [{'ext_id': 'r-t1', 'name': 'Πέτρος', 'surname': 'Δοκιμαστής', 'rank': '', 'office': 'Μέγας Καγκελάριος', 'year': '2026',
              'email': 'petros@example.com', 'mobile': '6900000001'},
             {'ext_id': 'r-t2', 'name': 'Παύλος', 'surname': 'Χωρίςemail', 'rank': '', 'office': 'Πρώην Μέγας Ευχέτης', 'year': '2020'}],
    'visits': [{'ext_id': 'v-t1', 'date': D1, 'lodge': 'La Paix', 'number': '95', 'location': 'Τεκτονικόν Μέγαρον Δοκιμής',
                'province': 'ΕπΜΣτ. Αθηνών', 'repId': 'r-t1', 'notes': 'Σημείωση δοκιμής'},
               {'ext_id': 'v-t2', 'date': D2, 'lodge': 'Πλασματική', 'number': '990', 'location': '', 'province': 'ΕπΜΣτ. Αθηνών', 'repId': ''}],
}


def _import(admin):
    return admin.post('/visits/import-data', files={'file': ('e.json', io.BytesIO(json.dumps(PAYLOAD).encode()), 'application/json')})


def _vid(admin, lodge):
    t = admin.get('/visits', params={'q': lodge}).text
    return int(re.search(r'/visits/edit/(\d+)', t).group(1))


def test_import_is_idempotent_and_fills_only_blanks(admin, app_module):
    from urllib.parse import unquote
    r = _import(admin)
    assert r.status_code == 303 and 'Επισκέψεις: 2 νέες (0 υπήρχαν ήδη)' in unquote(r.headers['location'])
    assert 'Εκπρόσωποι: 2 νέοι' in unquote(r.headers['location'])
    r2 = _import(admin)
    assert r2.status_code == 303 and 'Επισκέψεις: 0 νέες (2 υπήρχαν ήδη)' in unquote(r2.headers['location'])
    with app_module.con() as c:
        assert c.execute('SELECT COUNT(*) n FROM visits WHERE ext_id LIKE ?', ('v-t%',)).fetchone()['n'] == 2
        assert c.execute('SELECT COUNT(*) n FROM reps WHERE ext_id LIKE ?', ('r-t%',)).fetchone()['n'] == 2
    lodge = [l for l in app_module._lodges_all() if l['number'] == '95'][0]
    assert lodge['meeting_place'] == 'Τεκτονικόν Μέγαρον Δοκιμής'  # κενό → συμπληρώθηκε
    new = [l for l in app_module._lodges_all() if l['number'] == '990'][0]
    assert new['status'] == 'Ανενεργή' and new['ritual'] == 'Σκωτικό'
    athens = app_module.province_by_short('ΕπΜΣτ. Αθηνών')
    assert athens['email'] != 'x@example.com'  # δεν αντικαθίσταται υπάρχον email
    assert athens['master_name'] == 'Πλασματικός ΕπΜΔ'


def test_calendar_and_filters(admin):
    t = admin.get('/visits').text
    assert 'LA PAIX' in t.upper() and 'Χωρίς εκπρόσωπο' in t
    t = admin.get('/visits', params={'rep': '__none'}).text
    assert 'Πλασματική' in t and 'Σημείωση δοκιμής' not in t  # μόνο όσες δεν έχουν εκπρόσωπο
    t = admin.get('/visits', params={'q': 'πλασματικη'}).text
    assert 'Πλασματική' in t and 'Σημείωση δοκιμής' not in t


def test_rank_from_office(app_module):
    r = {'office': 'Πρώην Μέγας Καγκελάριος (2020) · Μέγας Ευχέτης', 'rep_rank': ''}
    assert app_module.rep_rank(r, {}) == 'Λίαν Σεβάσμιος Αδ.'
    assert app_module.rep_vocative(dict(r, rep_rank='')) == 'Λίαν Σεβάσμιε Αδελφέ'
    assert app_module.rep_rank({'office': 'Επαρχιακός Μέγας Διδάσκαλος'}, {}) == 'Πανσεβάσμιος Αδ.'
    assert app_module.rep_rank({'office': 'Μέγας Ευχέτης'}, {'Μέγας Ευχέτης': 3}) == 'Σεβασμιώτατος Αδ.'


def test_brief_representative_sends_email_with_ics(admin):
    vid = _vid(admin, 'La Paix')
    t = admin.get(f'/visits/brief?ids={vid}').text
    assert 'petros@example.com' in t and 'Λίαν Σεβάσμιε Αδελφέ' in t
    n = len(outbox())
    body = re.search(r'name="body"[^>]*>(.*?)</textarea>', t, re.S).group(1)
    rid = re.search(r'name="rep_id" value="(\d+)"', t).group(1)
    r = admin.post('/visits/brief', data={'ids': str(vid), 'rep_id': rid, 'to': 'petros@example.com', 'subject': 'Θέμα δοκιμής',
                                          'body': body, 'mode': 'send'})
    assert r.status_code == 303
    msgs = outbox()
    assert len(msgs) == n + 1
    m = msgs[-1]
    assert m['To'] == 'petros@example.com' and str(make_header(decode_header(m['Subject']))) == 'Θέμα δοκιμής'
    att = [p for p in m.walk() if p.get_filename()]
    assert att and att[0].get_content_type() == 'text/calendar'
    ics = att[0].get_payload(decode=True).decode()
    assert 'DTSTART;VALUE=DATE:' + D1.replace('-', '') in ics and 'LA PAIX' in ics.upper()
    assert '✓ Εκπρόσωπος ενημερώθηκε' in admin.get('/visits').text


def test_notification_resets_when_date_changes(admin, app_module):
    vid = _vid(admin, 'La Paix')
    v = app_module.visit_get(vid)
    assert app_module.rep_notified(v)
    assert not app_module.rep_notified(dict(v, visit_date=D2))


def test_publish_province(admin):
    t = admin.get('/visits/publish', params={'prov': 'ΕπΜΣτ. Αθηνών', 'frm': date.today().isoformat()}).text
    assert 'Email προς Επαρχιακό Γραμματέα' in t and 'Πλασματική' in t
    t = admin.get('/visits/publish/compose', params={'prov': 'ΕπΜΣτ. Αθηνών', 'frm': date.today().isoformat(), 'missing': '1'}).text
    body = re.search(r'name="body"[^>]*>(.*?)</textarea>', t, re.S).group(1)
    assert 'Αγαπητέ Αδελφέ ΕπΜΓρ.' in body and 'θα οριστεί και θα σας γνωστοποιηθεί' in body
    assert 'Δεν μας έχει ακόμη γνωστοποιηθεί η ημερομηνία' in body
    ids = re.search(r'name="ids" value="([^"]*)"', t).group(1)
    r = admin.post('/visits/publish/send', data={'ids': ids, 'prov': 'ΕπΜΣτ. Αθηνών', 'to': 'athens@example.com', 'subject': 'Σ', 'body': 'Β', 'mode': 'send'})
    assert r.status_code == 303 and outbox()[-1]['To'] == 'athens@example.com'
    assert '✓ Επαρχία ενημερώθηκε' in admin.get('/visits').text


def test_mark_without_sending(admin):
    vid = _vid(admin, 'Πλασματική')
    n = len(outbox())
    r = admin.post('/visits/publish/send', data={'ids': str(vid), 'prov': 'ΕπΜΣτ. Αθηνών', 'to': '', 'mode': 'mark'})
    assert r.status_code == 303 and len(outbox()) == n


def test_bad_email_rejected(admin):
    vid = _vid(admin, 'La Paix')
    t = admin.get(f'/visits/brief?ids={vid}').text
    rid = re.search(r'name="rep_id" value="(\d+)"', t).group(1)
    r = admin.post('/visits/brief', data={'ids': str(vid), 'rep_id': rid, 'to': 'όχι-email', 'subject': 'Σ', 'body': 'Β', 'mode': 'send'})
    assert r.status_code == 400


def test_new_edit_delete_visit(admin, app_module):
    r = admin.post('/visits/new', data={'visit_date': D1, 'lodge': '95 · LA PAIX', 'lodge_number': '', 'location': '', 'province': '', 'rep_id': '', 'notes': ''})
    assert r.status_code == 303
    v = [x for x in app_module.visits_all() if x['lodge'] == 'LA PAIX' and not x['ext_id']][0]
    assert v['lodge_number'] == '95' and v['province'] == 'ΕπΜΣτ. Αθηνών' and v['location']  # από τις Συμβολικές Στοές
    assert admin.get(f"/visits/edit/{v['id']}").status_code == 200
    assert admin.post(f"/visits/delete/{v['id']}").status_code == 303
    assert app_module.visit_get(v['id']) is None
    assert admin.post('/visits/new', data={'visit_date': 'όχι', 'lodge': 'Χ'}).status_code == 400


def test_paste_visits(admin, app_module):
    d = date.today() + timedelta(days=60)
    line = f"Σάββατο {d.day}/{d.month}/{d.year} Σ.Σ. Διώνη Υπ' Αρ 990 Τεκτονικόν Μέγαρον Ιωαννίνων"
    r = admin.post('/visits/import', data={'text': line + '\nάκυρη γραμμή'})
    assert r.status_code == 200 and 'Προστέθηκαν 1' in r.text and 'άκυρη γραμμή' in r.text
    v = [x for x in app_module.visits_all() if x['visit_date'] == d.isoformat()][0]
    assert v['lodge'] == 'ΠΛΑΣΜΑΤΙΚΗ' and v['location'] == 'Τεκτονικόν Μέγαρον Ιωαννίνων' and v['province'] == 'ΕπΜΣτ. Αθηνών'


def test_report_pdf(admin):
    assert admin.get('/visits/report').status_code == 200
    r = admin.get('/visits/report.pdf', params={'frm': date.today().isoformat()})
    assert r.status_code == 200 and r.content[:4] == b'%PDF'


def test_reps_pages_and_paste(admin, app_module):
    t = admin.get('/reps', params={'q': 'δοκιμαστης'}).text
    assert 'Δοκιμαστής' in t and 'petros@example.com' in t
    assert 'Χωρίςemail' in admin.get('/reps', params={'f': 'past'}).text
    r = admin.post('/reps/import', data={'text': 'Ανδρέας;Επικολλητός;;Μέγας Ξιφοφόρος;andreas@example.com'})
    assert r.status_code == 303
    rep = [x for x in app_module.reps_all() if x['surname'] == 'Επικολλητός'][0]
    assert app_module.rep_rank(rep) == 'Λίαν Σεβάσμιος Αδ.'
    assert admin.get(f"/reps/edit/{rep['id']}").status_code == 200
    assert admin.post(f"/reps/delete/{rep['id']}").status_code == 303


def test_rank_map_override(admin, app_module):
    assert admin.get('/reps/ranks').status_code == 200
    r = admin.post('/reps/ranks', data={'r::Μέγας Ξιφοφόρος': '2'})
    assert r.status_code == 303 and app_module.rep_rankmap() == {'Μέγας Ξιφοφόρος': 2}
    admin.post('/reps/ranks', data={'r::Μέγας Ξιφοφόρος': '1'})
    assert app_module.rep_rankmap() == {}


def test_reps_from_epeteirida(admin, app_module):
    from helpers import new_decree
    new_decree(admin, matter='Διορισμός για εκπρόσωπο', first_name='Κωνσταντίνος', last_name='Επετηριδικός',
               member_email='kostas@example.com', mobile='6900000077')
    r = admin.post('/reps/from-epeteirida')
    assert r.status_code == 303
    rep = [x for x in app_module.reps_all() if x['surname'] == 'Επετηριδικός'][0]
    assert rep['office'] == 'Μέγας Γραμματεύς' and rep['member_id']
    assert app_module.rep_contact(rep)[0] == 'kostas@example.com'  # email από το Μητρώο Μελών
    admin.post('/reps/from-epeteirida')
    assert len([x for x in app_module.reps_all() if x['surname'] == 'Επετηριδικός']) == 1


def test_wrong_import_file(admin):
    r = admin.post('/visits/import-data', files={'file': ('e.json', io.BytesIO(b'{"format":"other"}'), 'application/json')})
    assert r.status_code == 400
