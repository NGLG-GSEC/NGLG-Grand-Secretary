# Κοινά: είσοδος, σελίδες, μενού, προστασία πρόσβασης, υγεία.
import pytest

ADMIN_PAGES = ['/', '/new', '/archive', '/templates', '/users', '/settings', '/decrees/new',
               '/decrees/archive', '/members', '/members/new', '/lodges', '/lodges/new',
               '/epeteirida', '/drive', '/identity', '/visits', '/visits/new', '/visits/publish', '/visits/report',
               '/visits/import', '/visits/import-data', '/reps', '/reps/new', '/reps/import', '/reps/ranks', '/provinces']


def test_health(anon):
    r = anon.get('/health')
    assert r.status_code == 200


def test_robots(anon):
    r = anon.get('/robots.txt')
    assert r.status_code == 200 and 'Disallow' in r.text


def test_security_headers(anon):
    r = anon.get('/login')
    assert r.headers.get('X-Frame-Options') == 'DENY'
    assert r.headers.get('X-Content-Type-Options') == 'nosniff'


def test_login_page(anon):
    r = anon.get('/login')
    assert r.status_code == 200 and 'name="email"' in r.text


@pytest.mark.parametrize('path', ['/', '/new', '/archive', '/members', '/lodges', '/decrees/new', '/drive', '/settings'])
def test_anonymous_is_redirected(anon, path):
    r = anon.get(path)
    assert r.status_code == 401 or (r.status_code in (302, 303) and '/login' in r.headers['location'])
    assert 'Μητρώο' not in r.text


@pytest.mark.parametrize('path', ADMIN_PAGES)
def test_admin_pages_render(admin, path):
    r = admin.get(path)
    assert r.status_code == 200, (path, r.text[:300])
    assert 'Μεγάλη Γραμματεία' in r.text


def test_nav_has_all_sections(admin):
    t = admin.get('/').text
    for label in ['Επιστολές', 'Διατάγματα', 'Επισκέψεις', 'Εκπρόσωποι ΜΔ', 'Διαχείριση', 'Μητρώα', 'Μητρώο Μελών', 'Επαρχιακές Μεγάλες Στοές', 'Συμβολικές Στοές', 'Επετηρίδα',
                  'Πρόσβαση', 'Google Drive', 'Επιστολές Γραμματείας', 'Ρυθμίσεις', 'Έξοδος']:
        assert label in t, label
    assert 'class="navtoggle"' in t and 'max-width:1180px' in t


def test_wrong_otp_rejected(anon):
    anon.post('/otp', data={'email': 'grand.secretary@nglgreece.gr'})
    r = anon.post('/verify', data={'email': 'grand.secretary@nglgreece.gr', 'code': '000000'})
    assert 'nglg_session' not in r.cookies or r.status_code != 303


def test_static_assets(admin):
    for name in ['seal_original.png', 'header_emblem.png']:
        r = admin.get(f'/asset/{name}')
        assert r.status_code == 200 and r.headers['content-type'].startswith('image/'), name
        assert len(r.content) > 1000, name
