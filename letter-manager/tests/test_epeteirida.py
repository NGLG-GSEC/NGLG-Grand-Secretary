# Ενότητα Επετηρίδα.
def test_page_and_pdf(admin):
    assert admin.get('/epeteirida').status_code == 200
    r = admin.get('/epeteirida/pdf')
    assert r.status_code == 200 and r.content[:4] == b'%PDF'
