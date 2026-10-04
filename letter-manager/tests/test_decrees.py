# Ενότητα Διατάγματα: δημιουργία, προβολή, PDF, «Έτοιμο», αρχείο, παλιοί σύνδεσμοι.
import re

from helpers import YY, decree_protocol, new_decree


def test_create_view_pdf_ready(admin):
    did = new_decree(admin)
    prot = decree_protocol(admin, did)
    assert prot.endswith(f'_{YY}_Διάταγμα_Διορισμός Μεγάλου Αξιωματικού')
    t = re.sub(r'\s+', ' ', re.sub('<[^>]+>', ' ', admin.get(f'/decrees/{did}').text))
    assert 'ΔΙΟΡΙΖΟΜΕΝ ως ΜΕΓΑΝ ΓΡΑΜΜΑΤΕΑ' in t and 'Γεώργιον Παπαδόπουλον' in t  # αιτιατική
    r = admin.get(f'/decrees/{did}/pdf')
    assert r.status_code == 200 and r.content[:4] == b'%PDF'
    assert admin.post(f'/decrees/{did}/ready').status_code == 303
    assert admin.get(f'/decrees/{did}/edit').status_code == 200


def test_archive(admin):
    did = new_decree(admin, matter='Απονομή δοκιμής')
    t = admin.get('/decrees/archive').text
    assert f'/decrees/{did}' in t


def test_decree_feeds_epeteirida(admin):
    new_decree(admin, matter='Διορισμός Επετηρίδας', first_name='Ιωάννης', last_name='Επετηρίδης',
               member_email='epet@example.com', mobile='6900000099')
    t = admin.get('/epeteirida').text
    assert 'Επετηρίδης' in t and 'Ιωάννης' in t


def test_legacy_decree_links_redirect(admin):
    r = admin.get('/decree')
    assert r.status_code == 303 and r.headers['location'] == '/decrees/new'


def test_delete(admin):
    did = new_decree(admin, matter='Προς διαγραφή')
    assert admin.post(f'/decrees/{did}/delete').status_code in (302, 303)
    assert admin.get(f'/decrees/{did}').status_code == 404
