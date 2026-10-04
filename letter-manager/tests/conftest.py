# Κοινή προετοιμασία των αυτόματων ελέγχων.
# Κάθε εκτέλεση ξεκινά την εφαρμογή σε προσωρινό φάκελο με κενή βάση SQLite,
# με εμφανή κωδικό OTP (DEV_SHOW_OTP=1) και χωρίς SMTP / Google.
import importlib.util
import os
import re
import sys
import tempfile
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
ADMIN = 'grand.secretary@nglgreece.gr'

_tmp = tempfile.mkdtemp(prefix='nglg-tests-')
os.environ.update({
    'DATA_DIR': _tmp,
    'DEV_SHOW_OTP': '1',
    'APP_SECRET': 'test-secret',
    'ADMIN_EMAILS': ADMIN,
    'COOKIE_SECURE': '0',
})
# TEST_DATABASE_URL=postgresql://... → οι ίδιοι έλεγχοι σε Postgres (όπως στο Render), σε κενή βάση.
if os.environ.get('TEST_DATABASE_URL'):
    os.environ['DATABASE_URL'] = os.environ['TEST_DATABASE_URL']
else:
    os.environ.pop('DATABASE_URL', None)
for k in ('SMTP_HOST', 'SMTP_PASSWORD', 'GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_OAUTH_CLIENT_SECRET'):
    os.environ.pop(k, None)


def _load_app():
    # APP_ENTRY επιτρέπει να τρέξουν οι ίδιοι έλεγχοι και σε άλλη έκδοση του φορτωτή.
    entry = Path(os.environ.get('APP_ENTRY') or ROOT / 'app.py').resolve()
    spec = importlib.util.spec_from_file_location('app', entry)
    mod = importlib.util.module_from_spec(spec)
    sys.modules['app'] = mod
    spec.loader.exec_module(mod)
    return mod


APP = _load_app()


@pytest.fixture(scope='session')
def app_module():
    return APP


@pytest.fixture(scope='session')
def anon():
    from fastapi.testclient import TestClient
    return TestClient(APP.app, follow_redirects=False)


def login(client, email=ADMIN, actor='dimitrios'):
    r = client.post('/otp', data={'email': email})
    code = re.search(r'DEV OTP: (\d{6})', r.text).group(1)
    client.post('/verify', data={'email': email, 'code': code})
    client.post('/identity', data={'actor': actor})
    return client


@pytest.fixture(scope='session')
def admin():
    from fastapi.testclient import TestClient
    return login(TestClient(APP.app, follow_redirects=False))


def location_id(r):
    assert r.status_code in (302, 303), (r.status_code, r.text[:300])
    return int(r.headers['location'].rstrip('/').rsplit('/', 1)[1])
