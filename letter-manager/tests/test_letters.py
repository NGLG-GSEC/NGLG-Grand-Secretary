# Ενότητα Επιστολές: δημιουργία, προβολή, επεξεργασία, «Έτοιμη», PDF, αρχείο, διαγραφή.
from helpers import YY, letter_protocol, new_letter


def test_create_view_edit_ready_pdf(admin):
    lid = new_letter(admin, 'Εκπροσώπηση ΜΔ')
    prot = letter_protocol(admin, lid)
    assert prot.endswith(f'_{YY}_Επιστολή_Εκπροσώπηση ΜΔ')
    r = admin.get(f'/edit/{lid}')
    assert r.status_code == 200 and 'Εκπροσώπηση ΜΔ' in r.text
    r = admin.post(f'/edit/{lid}', data={'subject': 'Εκπροσώπηση ΜΔ (διορθ.)', 'body': 'Νέο κείμενο',
                                         'recipient_email': 'a@example.com', 'status': 'draft'})
    assert r.status_code == 303
    assert 'Νέο κείμενο' in admin.get(f'/letter/{lid}').text
    assert letter_protocol(admin, lid) == prot  # ο αριθμός δεν αλλάζει με την επεξεργασία
    r = admin.post(f'/ready/{lid}')
    assert r.status_code == 303
    r = admin.get(f'/pdf/{lid}')
    assert r.status_code == 200 and r.content[:4] == b'%PDF'


def test_archive_lists_letter(admin):
    lid = new_letter(admin, 'Αρχειοθέτηση δοκιμή')
    t = admin.get('/archive').text
    assert 'Αρχειοθέτηση δοκιμή' in t and f'/letter/{lid}' in t


def test_delete_letter(admin):
    lid = new_letter(admin, 'Προς διαγραφή')
    r = admin.post(f'/delete/{lid}')
    assert r.status_code in (302, 303)
    assert admin.get(f'/letter/{lid}').status_code == 404


def test_recipient_lists_in_new_letter(admin):
    t = admin.get('/new').text
    for s in ['athens.secretary@nglgreece.gr', 'dglcyprus@nglgreece.gr', 'LA PAIX']:
        assert s in t, s


def test_templates_exclude_decrees(admin):
    t = admin.get('/templates').text
    assert admin.get('/templates').status_code == 200
    assert 'name="template_id"' not in t or 'ΔΙΑΤΑΓΜΑΤΑ</option>' not in admin.get('/new').text
