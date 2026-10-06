# Εσωτερικός έλεγχος: κάθε σύνδεσμος του μενού, των πλακιδίων της Αρχικής και του portal ανοίγει (HTTP 200).
import re
from pathlib import Path

PORTAL = Path(__file__).resolve().parents[2] / 'index.html'
APP_URL_RE = r'https://nglg-letter-manager[^"/]*'  # Render ή Google Cloud Run


def _internal_links(html):
    return {h.replace('&amp;', '&') for h in re.findall(r'href="(/[^"#]*)"', html)
            if not h.startswith(('/logout', '/asset/'))}


def test_every_menu_and_dashboard_link_opens(admin):
    links = _internal_links(admin.get('/').text)
    assert {'/visits', '/namedays', '/members', '/epeteirida', '/new', '/decrees/new', '/database'} <= links
    bad = {h: r.status_code for h in sorted(links) if (r := admin.get(h)).status_code != 200}
    assert not bad, bad


def test_every_portal_app_link_opens(admin):
    links = {re.sub(APP_URL_RE, '', h) or '/' for h in re.findall(r'href="(' + APP_URL_RE + r'[^"]*)"', PORTAL.read_text(encoding='utf-8'))}
    assert len(links) >= 10
    bad = {h: r.status_code for h in sorted(links) if (r := admin.get(h)).status_code != 200}
    assert not bad, bad


def test_portal_links_ask_for_login_then_return(anon):
    r = anon.get('/visits')
    assert r.status_code in (302, 303, 307) and r.headers['location'].startswith('/login')


def test_health_reports_version(anon, monkeypatch):
    monkeypatch.setenv('RENDER_GIT_COMMIT', 'abcdef1234567890')
    monkeypatch.setenv('RENDER_GIT_REPO_SLUG', 'NGLG-GSEC/NGLG-Grand-Secretary')
    j = anon.get('/health').json()
    assert j['status'] == 'ok' and j['commit'] == 'abcdef123456' and j['repo'] == 'NGLG-GSEC/NGLG-Grand-Secretary'


def test_gzip_compression(admin):
    r = admin.get('/directory', headers={'Accept-Encoding': 'gzip'})
    assert r.status_code == 200 and r.headers.get('content-encoding') == 'gzip'


def test_health_on_cloud_run(anon, monkeypatch):
    monkeypatch.setenv('APP_GIT_COMMIT', '1234567890abcdef')
    monkeypatch.setenv('APP_GIT_REPO_SLUG', 'NGLG-GSEC/NGLG-Grand-Secretary')
    monkeypatch.setenv('K_SERVICE', 'nglg-letter-manager')
    j = anon.get('/health').json()
    assert j['commit'] == '1234567890ab' and j['host'] == 'cloud-run'
