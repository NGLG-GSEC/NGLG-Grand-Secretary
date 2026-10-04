# Ενότητα Μητρώο Μελών: καταχώριση, αναζήτηση ανά πεδίο, εισαγωγή, εξαγωγή, διαγραφή.
import re


def found(admin, q, field):
    t = admin.get('/members', params={'q': q, 'field': field}).text
    m = re.search(r'Βρέθηκε <b>(\d+)', t)
    return int(m.group(1)) if m else 0

TSV_HEADER = ('Member_ID\tSurname\tFirst_Name\tName_Has_Variants\tAll_Surname_Variants\tAll_FirstName_Variants\t'
              'Email\tMultiple_Emails\tMobile\tMultiple_Mobiles\tDegree\tNumber_of_Lodges\tAll_Deregistered (ΔΙΑΓΡΑΦΕΝ)\t'
              'Lodge_1\tNumber_1\tStatus_1\tLodge_2\tNumber_2\tStatus_2\tLodge_3\tNumber_3\tStatus_3\t'
              'Lodge_4\tNumber_4\tStatus_4\tLodge_5\tNumber_5\tStatus_5\tLodge_6\tNumber_6\tStatus_6\tAdditional_Lodges (beyond 6)')


def _create(admin, **kw):
    data = {'surname': 'Δοκιμόπουλος', 'first_name': 'Αλέξανδρος', 'email': 'alex@example.com',
            'mobile': '6944123456', 'lodges_text': '95 LA PAIX', 'active': '1'}
    data.update(kw)
    r = admin.post('/members/new', data=data)
    assert r.status_code in (302, 303), r.text[:300]
    return r


def test_create_and_search_by_field(admin):
    _create(admin)
    for field, q in [('surname', 'δοκιμοπουλ'), ('first_name', 'ΑΛΕΞΑΝΔΡ'), ('mobile', '944123'),
                     ('mobile', '69 44 12'), ('email', 'alex@exa'), ('all', 'Δοκιμόπουλος'), ('lodge', 'LA PAIX')]:
        assert found(admin, q, field) >= 1, (field, q)


def test_search_wrong_field_finds_nothing(admin):
    assert found(admin, 'Δοκιμόπουλος', 'email') == 0
    assert found(admin, '944123', 'surname') == 0


def test_search_api(admin):
    r = admin.get('/api/members/search', params={'q': 'Δοκιμ'})
    assert r.status_code == 200


def test_edit_and_delete(admin):
    _create(admin, surname='Επεξεργάσιμος', email='edit@example.com')
    t = admin.get('/members', params={'q': 'Επεξεργάσιμος', 'field': 'surname'}).text
    mid = int(re.search(r'/members/edit/(\d+)', t).group(1))
    assert admin.get(f'/members/edit/{mid}').status_code == 200
    r = admin.post(f'/members/edit/{mid}', data={'surname': 'Επεξεργάσιμος', 'first_name': 'Νίκος',
                                                 'email': 'edit2@example.com', 'active': '1'})
    assert r.status_code in (302, 303)
    assert found(admin, 'edit2@example.com', 'email') == 1
    # Χωρίς SMTP η διαγραφή αρνείται: πρώτα πρέπει να σταλεί το υποχρεωτικό Excel ασφαλείας.
    assert admin.post(f'/members/delete/{mid}').status_code == 503
    assert found(admin, 'edit2@example.com', 'email') == 1


def test_import_pasted_tsv_merge(admin):
    row = ['90001', 'ΕΙΣΑΓΩΓΙΔΗΣ', 'ΠΑΥΛΟΣ', 'No', '', '', 'pavlos@example.com', '', '6977000001', '', 'Μ',
           '1', '', 'LA PAIX', '95', 'ΕΝΕΡΓΟΣ'] + [''] * 15 + ['']
    r = admin.post('/members/import', data={'pasted': TSV_HEADER + '\n' + '\t'.join(row), 'mode': 'merge'})
    assert r.status_code in (200, 302, 303)
    assert found(admin, 'εισαγωγιδης', 'surname') == 1
    assert found(admin, '6977000001', 'mobile') == 1


def test_export_xlsx(admin):
    r = admin.get('/members/export.xlsx')
    assert r.status_code == 200 and r.content[:2] == b'PK'
