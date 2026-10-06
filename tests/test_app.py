# Πλήρεις έλεγχοι της εφαρμογής: κάθε ενότητα, αποθήκευση στο GitHub (προσομοίωση), ταυτόχρονες αλλαγές,
# μεταφορά δεδομένων από την παλιά εφαρμογή, σύνδεσμοι portal, κινητά.
import base64
import gzip
import io
import json
import re
from datetime import date, timedelta
from pathlib import Path

import pytest

from mock_github import MockGitHub

ROOT = Path(__file__).resolve().parents[1]
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkYPjPwMDAxMDAwMDAAAAOGQEDqv3yVwAAAABJRU5ErkJggg==')


def add_member(app, surname='Παπαδόπουλος', first='Γεώργιος', email='g@example.com', mobile='6944123456', lodges='ΠΑΡΘΕΝΩΝ | 3 | 1. ΤΑΚΤΙΚΟ'):
    app.go('/members/new').fill(surname=surname, first_name=first, email=email, mobile=mobile, lodges_text=lodges)
    app.click('💾 Αποθήκευση')
    app.wait_saved()


def test_every_page_opens(app):
    app.connect_local().go('/system')
    app.page.wait_for_selector('text=Έλεγχος σελίδων')
    assert 'Όλες οι' in app.text() and 'σελίδες ανοίγουν σωστά' in app.text(), app.text()


def test_letters_protocol_and_print(app):
    app.connect_local()
    app.go('/letters/new')
    app.pick('#rcptPick', 'Αθην')
    app.fill(subject='Δοκιμαστική επιστολή', body='Αγαπητοί Αδελφοί,\nwww.nglgreece.gr')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    t = app.text()
    assert '20.542_' in t and 'Επιστολή_Δοκιμαστική επιστολή' in t and 'ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Αθηνών' in t
    assert app.page.locator('.paper a[href="https://www.nglgreece.gr"]').count() == 1
    href = app.page.locator('a:has-text("Άνοιγμα στο Gmail"), a:has-text("Αποστολή με Email")').first.get_attribute('href')
    assert 'authuser=grand.secretary%40nglgreece.gr' in href and 'athens.secretary%40nglgreece.gr' in href
    # νέα «πάνω σε» → επόμενος αριθμός πρωτοκόλλου
    app.go('/letters/new?copy_from=1')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/2')
    assert '20.543_' in app.text()
    # PDF (εκτύπωση): μόνο το έντυπο, μία σελίδα Α4
    app.page.emulate_media(media='print')
    pdf = app.page.pdf(format='A4', print_background=True)
    assert pdf[:4] == b'%PDF' and pdf.count(b'/Type /Page\n') + pdf.count(b'/Type /Page ') + pdf.count(b'/Type/Page') <= 2
    assert app.page.locator('.send-panel').is_hidden()
    app.page.emulate_media(media='screen')
    # αρχείο & αναζήτηση
    app.go('/letters?q=δοκιμαστικη')
    assert '2 επιστολές' in app.text()


def test_decree_epeteirida_and_members(app):
    app.connect_local()
    add_member(app)
    assert 'Βρέθηκε 1 μέλος' in app.text()
    app.go('/letters/new').fill(subject='Πρώτη', body='x').click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    app.go('/decrees/new')
    assert '513/' in app.text()
    app.fill(matter='διορισμού Μεγάλων Αξιωματικών')
    app.page.select_option('#dOffice', 'Μέγας Γραμματεύς')
    app.pick('.registry-search', 'Παπαδ')
    app.click('Έκδοση Διατάγματος')
    app.page.wait_for_url('**/#/decrees/1')
    t = app.text()
    assert 'υπ’ αριθμ. 513/' in t and '20.543_' in t  # ενιαίο πρωτόκολλο με τις Επιστολές
    body = app.text('.decbody')
    for s in ['ΔΙΟΡΙΖΟΜΕΝ', 'ΜΕΓΑΝ ΓΡΑΜΜΑΤΕΑ', 'τον Λίαν Σεβάσμιον Αδελφόν', 'Γεώργιον Παπαδόπουλον', 'λαβόντες υπ’ όψιν τον Κανόνα 22']:
        assert s in body, s
    app.go('/epeteirida')
    assert 'Μέγας Γραμματεύς' in app.text() and '513/' in app.text()
    # ΕΥΑΡΕΣΤΟΥΜΕΘΑ: σταθερό κείμενο, χωρίς Επετηρίδα
    app.go('/decrees/new?action=service_award')
    app.pick('.registry-search', 'Παπαδ')
    app.click('Έκδοση Διατάγματος')
    app.page.wait_for_url('**/#/decrees/2')
    assert 'υπ’ αριθ. 514/' in app.text() and 'την Τάξιν του Μεγάλου Διδασκάλου' in app.text('.decbody')
    # αναζήτηση μέλους ανά κινητό και Στοά
    app.go('/members?field=mobile&q=6944 123')
    assert 'Βρέθηκε 1 μέλος' in app.text()
    app.go('/members?field=lodge&q=3')
    assert 'Βρέθηκε 1 μέλος' in app.text()


def test_lodges_provinces_directory(app):
    app.connect_local()
    app.go('/provinces/edit/1').fill(secretary_name='Κωνσταντίνος Καρμάλης', secretary_email='gs.ath@example.com', master_name='Γεώργιος Αθηναίος', master_email='gm.ath@example.com')
    app.click('💾 Αποθήκευση')
    app.wait_saved()
    app.go('/lodges/edit/3').fill(provincial='ΕπΜΣτ. Αθηνών', email='parthenon@example.com', ritual='Emulation', meeting_place='Ερεσού 38')
    app.click('💾 Αποθήκευση')
    app.wait_saved()
    app.go('/directory')
    t = app.text()
    for s in ['Κωνσταντίνος Καρμάλης', 'gs.ath@example.com', 'gm.ath@example.com', 'parthenon@example.com', 'Emulation']:
        assert s in t, s
    # «Επιστολή προς…» από τον Κατάλογο
    app.page.locator('a[href*="to_email=gm.ath%40example.com"]').first.click()
    app.page.wait_for_selector('#lf')
    assert app.page.input_value('[name=recipient_email]') == 'gm.ath@example.com'
    # Excel Στοών
    app.go('/lodges')
    with app.page.expect_download() as d:
        app.click('⬇ Excel')
    assert d.value.suggested_filename == 'EMSTE_SYMBOLIKES_STOES.xlsx'
    # διπλός αριθμός Στοάς απορρίπτεται
    app.go('/lodges/new').fill(number='3', name='ΔΟΚΙΜΗ')
    app.click('💾 Αποθήκευση')
    app.page.wait_for_selector('.toast.error')
    assert 'Υπάρχει ήδη Στοά με αριθμό 3' in app.text('#toasts')
    app.errors.clear()


def test_visits_reps_and_mails(app):
    app.connect_local()
    app.go('/lodges/edit/3').fill(provincial='ΕπΜΣτ. Αθηνών', meeting_place='Τεκτονικόν Μέγαρον Αθηνών')
    app.click('💾 Αποθήκευση')
    app.wait_saved()
    app.go('/reps/new').fill(name='Ιωάννης', surname='Εκπρόσωπος', office='Μέγας Καγκελάριος', email='rep@example.com')
    app.click('💾 Αποθήκευση')
    app.wait_saved()
    d = (date.today() + timedelta(days=10)).strftime('%d/%m/%Y')
    app.go('/visits/import').fill(text=f'Σάββατο {d} Σ.Σ. Παρθενών Υπ\' Αρ 3\nάκυρη γραμμή')
    app.click('Εισαγωγή')
    app.page.wait_for_selector('.toast.error')
    app.errors.clear()
    app.go('/visits')
    assert 'Τεκτονικόν Μέγαρον Αθηνών' in app.text() and 'Χωρίς εκπρόσωπο' in app.text()
    app.page.locator('.vlodge a').first.click()
    app.page.wait_for_selector('#vf')
    rid = app.page.locator('[name=rep_id] option', has_text='Εκπρόσωπος').first.get_attribute('value')
    app.page.select_option('[name=rep_id]', rid)
    app.click('💾 Αποθήκευση')
    app.wait_saved()
    app.go('/visits')
    app.click('✉ Ενημέρωση εκπροσώπου')
    app.page.wait_for_selector('#cf')
    assert app.page.input_value('[name=to]') == 'rep@example.com'
    assert 'Λίαν Σεβάσμιε Αδελφέ' in app.page.input_value('[name=body]')
    with app.page.expect_download() as dl:
        app.click('📅 Λήψη')
    assert dl.value.suggested_filename == 'egkatastasi-3.ics'
    app.click('✓ Σημείωση ως σταλμένο')
    app.page.wait_for_url('**/#/visits')
    assert 'Εκπρόσωπος ενημερώθηκε' in app.text()
    app.go('/visits/publish?prov=' + 'ΕπΜΣτ. Αθηνών')
    assert 'athens.secretary@nglgreece.gr' in app.text()
    app.click('Email προς Επαρχιακό Γραμματέα')
    app.page.wait_for_selector('#cf')
    assert 'Λίαν Σεβάσμιος Αδ. Ιωάννης Εκπρόσωπος' in app.page.input_value('[name=body]')
    app.go('/visits/report')
    assert 'Πρόγραμμα Επισκέψεων στις Στοές' in app.text()


def test_namedays_greetings(app):
    app.connect_local()
    add_member(app, surname='Εορτάζων', first='Νικόλαος', email='nik@example.com')
    app.go('/namedays/calendar?q=νικολαος')
    assert 'Νικόλαος' in app.text()
    y = date.today().year
    app.go(f'/namedays?frm={y}-01-01&to={y}-12-31')
    assert 'Εορτάζων' in app.text()
    app.page.locator('input[name=k]').first.check()
    app.click('✉ Ευχές στους επιλεγμένους')
    app.page.wait_for_selector('#gBody')
    sample = app.text('#sample')
    assert 'ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ' in sample and 'Αγαπητέ Αδελφέ' in sample and 'Νικόλαος Εορτάζων' in sample
    app.click('2. ✓ Στάλθηκε')
    app.wait_saved()
    app.go(f'/namedays?frm={y}-01-01&to={y}-12-31')
    assert '✓ Ευχές' in app.text()
    app.go('/namedays/report')
    assert 'Εορτάζων Νικόλαος' in app.text()


def test_projects_with_files(app, tmp_path):
    app.connect_local()
    app.go('/projects/new').fill(title='Ίδρυση Σ.Σ. «Δοκιμή»')
    app.click('Δημιουργία')
    app.page.wait_for_url('**/#/projects/1')
    img = tmp_path / 'foto.png'
    img.write_bytes(PNG)
    app.page.set_input_files('#filesIn', str(img))
    app.click('+ Φωτογραφίες / PDF')
    app.page.wait_for_selector('text=Ανέβηκαν 1 αρχεία')
    app.page.wait_for_function("() => [...document.querySelectorAll('img[data-file]')].some(i => i.src.startsWith('blob:') && i.naturalWidth === 2)")
    bad = tmp_path / 'kako.exe'
    bad.write_bytes(b'MZ....')
    app.page.set_input_files('#filesIn', str(bad))
    app.click('+ Φωτογραφίες / PDF')
    app.page.wait_for_selector('.toast.error')
    app.errors.clear()
    app.page.fill('#logf [name=text]', 'Συνάντηση ιδρυτικών μελών')
    app.page.locator('#logf button').click()
    app.page.wait_for_selector('text=Συνάντηση ιδρυτικών μελών')
    app.click('Διαγραφή')
    app.page.wait_for_url('**/#/projects')
    assert 'Δεν υπάρχουν ακόμη πρότζεκτ' in app.text()


def test_settings_and_database(app):
    app.connect_local()
    app.go('/settings').fill(mail_from_general='λάθος')
    app.click('💾 Αποθήκευση ρυθμίσεων')
    app.page.wait_for_selector('.toast.error')
    app.errors.clear()
    app.go('/settings').fill(closing='Με εγκάρδιους αδελφικούς χαιρετισμούς,', protocol_start='30000')
    app.click('💾 Αποθήκευση ρυθμίσεων')
    app.wait_saved()
    app.go('/letters/new').fill(subject='Θέμα', body='Κείμενο')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    assert '30.000_' in app.text() and 'Με εγκάρδιους αδελφικούς χαιρετισμούς,' in app.text()
    app.go('/database/protocol')
    assert '30.000_' in app.text()
    app.go('/database/lodges?q=paix')
    assert 'LA PAIX' in app.text()
    app.go('/database/lodges/3').fill(notes='σημείωση από τη Βάση')
    app.click('💾 Αποθήκευση')
    app.wait_saved()
    app.go('/lodges/edit/3')
    assert app.page.input_value('[name=notes]') == 'σημείωση από τη Βάση'


def old_backup():
    # Αντίγραφο της παλιάς εφαρμογής (Render): μορφή nglg-backup/1
    t = lambda cols, rows: {'columns': cols, 'rows': rows}
    data = {'format': 'nglg-backup/1', 'tables': {
        'settings': t(['key', 'value'], [['closing', 'Με αδελφικούς χαιρετισμούς,'], ['drive_refresh_token', 'SECRET'], ['greet_bcc_self', 'me@example.com']]),
        'users': t(['email', 'role'], [['x@example.com', 'admin']]),
        'member_registry': t(['id', 'registry_no', 'surname', 'first_name', 'email', 'mobile', 'active'], [[7, 1001, 'Παλαιός', 'Αθανάσιος', 'old@example.com', '6900000000', 1]]),
        'member_lodges': t(['id', 'member_id', 'seq', 'lodge_name', 'lodge_number', 'member_status'], [[1, 7, 1, 'ΑΚΡΟΠΟΛΙΣ', '2', '1. ΤΑΚΤΙΚΟ']]),
        'letters': t(['id', 'protocol_seq', 'protocol_year', 'protocol_no', 'letter_date', 'subject', 'body', 'recipient_name', 'recipient_email', 'status', 'signer'],
                     [[5, 20600, 2026, '20.600_26_Επιστολή_Παλιά', '2026-09-01', 'Παλιά', 'Κείμενο', '', '', 'ready', 'dimitrios']]),
        'projects': t(['id', 'title', 'ptype', 'status', 'cover_file'], [[1, 'Παλιό πρότζεκτ', 'lodge', 'active', None]]),
        'project_files': t(['id', 'project_id', 'kind', 'name', 'stored_name', 'content_type', 'size'], [[1, 1, 'image', 'foto.png', 'abc.png', 'image/png', len(PNG)]]),
        'project_blobs': t(['stored_name', 'data'], [['abc.png', {'$b64': base64.b64encode(PNG).decode()}]]),
    }}
    return gzip.compress(json.dumps(data, ensure_ascii=False).encode())


def test_import_old_backup_and_visits_payload(app, tmp_path):
    app.connect_local()
    f = tmp_path / 'nglg-backup-2026-10-06.json.gz'
    f.write_bytes(old_backup())
    app.go('/database/backup')
    app.page.set_input_files('[name=file]', str(f))
    app.page.locator('#imf button').click()
    app.page.wait_for_selector('text=Η μεταφορά ολοκληρώθηκε')
    assert '1 αρχεία πρότζεκτ' in app.text()
    app.go('/letters/new').fill(subject='Μετά τη μεταφορά', body='x')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_selector('.paper')
    assert '20.601_' in app.text()  # η αρίθμηση συνεχίζει από τα παλιά
    app.go('/members?field=all&q=Παλαιός')
    assert 'Βρέθηκε 1 μέλος' in app.text() and 'ΑΚΡΟΠΟΛΙΣ' in app.text()
    app.go('/projects/1')
    app.page.wait_for_function("() => [...document.querySelectorAll('img[data-file]')].some(i => i.naturalWidth === 2)")
    has_secret = app.page.evaluate("async () => { const m = await import('./core/store.js'); return JSON.stringify(m.db.settings).includes('SECRET'); }")
    assert not has_secret
    # «Επιστολές Γραμματείας» (nglg-lodge-visits/1)
    p = tmp_path / 'episkepseis.json'
    p.write_text(json.dumps({'format': 'nglg-lodge-visits/1', 'provinces': [{'short': 'ΕπΜΣτ. Αθηνών', 'secretaryName': 'Κωνσταντίνος Ι. Καρμάλης'}],
                             'reps': [{'ext_id': 'r1', 'name': 'Πέτρος', 'surname': 'Αντιπρόσωπος', 'email': 'p@example.com'}],
                             'visits': [{'ext_id': 'v1', 'date': (date.today() + timedelta(days=5)).isoformat(), 'lodge': 'ΑΚΡΟΠΟΛΙΣ', 'number': '2', 'repId': 'r1'}]}, ensure_ascii=False), encoding='utf-8')
    app.go('/database/backup')
    app.page.set_input_files('[name=file]', str(p))
    app.page.locator('#imf button').click()
    app.page.wait_for_selector('text=Επισκέψεις: 1 νέες')
    app.go('/visits')
    assert 'ΑΚΡΟΠΟΛΙΣ' in app.text() and 'Αντιπρόσωπος' in app.text()
    app.go('/directory')
    assert 'Κωνσταντίνος Ι. Καρμάλης' in app.text()


def connect_github(app, gh, token='good-token'):
    app.page.route('https://api.github.com/**', gh.handle)
    app.page.goto(app.base)
    app.page.fill('[name=repo]', 'NGLG-GSEC/nglg-grammateia-data')
    app.page.fill('[name=token]', token)
    app.page.locator('#ghForm button').click()


def test_github_storage_and_concurrent_edits(app):
    gh = MockGitHub()
    connect_github(app, gh)
    app.page.wait_for_selector('.dash')
    assert gh.files()['README.md'].startswith('# Δεδομένα'.encode())
    assert len(gh.read_json('data/lodges.json')) == 78 and 'data/settings.json' in gh.files()
    app.go('/letters/new').fill(subject='Από τον Δημήτρη', body='x')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    letters = gh.read_json('data/letters.json')
    assert letters[0]['protocol_no'].startswith('20.542_') and gh.commits[gh.ref]['message'].startswith('Νέα Επιστολή')
    # Ο Νικόλαος (άλλη συσκευή) καταχωρίζει επιστολή στο μεταξύ
    other = letters + [{**letters[0], 'id': 2, 'protocol_seq': 20543, 'protocol_no': '20.543_26_Επιστολή_Από τον Νικόλαο', 'subject': 'Από τον Νικόλαο'}]
    gh.external_commit('data/letters.json', '[\n' + ',\n'.join(json.dumps(r, ensure_ascii=False) for r in other) + '\n]\n')
    app.go('/letters/new').fill(subject='Δεύτερη του Δημήτρη', body='y')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/3')
    nos = [l['protocol_no'][:7] for l in gh.read_json('data/letters.json')]
    assert nos == ['20.542_', '20.543_', '20.544_'], nos  # χωρίς διπλό αριθμό, χωρίς απώλεια της αλλαγής του άλλου
    # ξαναφόρτωση: τα δεδομένα έρχονται από το GitHub
    app.page.reload()
    app.page.wait_for_selector('main h1')
    app.go('/letters')
    assert 'Από τον Νικόλαο' in app.text() and 'Δεύτερη του Δημήτρη' in app.text()
    # αρχείο πρότζεκτ → files/projects/… στο αποθετήριο
    app.go('/projects/new').fill(title='Π')
    app.click('Δημιουργία')
    app.page.wait_for_url('**/#/projects/1')
    app.page.set_input_files('#filesIn', files=[{'name': 'a.png', 'mimeType': 'image/png', 'buffer': PNG}])
    app.click('+ Φωτογραφίες / PDF')
    app.page.wait_for_selector('text=Ανέβηκαν 1 αρχεία')
    assert any(p.startswith('files/projects/') and v == PNG for p, v in gh.files().items())


def test_github_errors(app):
    connect_github(app, MockGitHub(), token='wrong')
    app.page.wait_for_selector('text=δεν είναι έγκυρος')
    app.errors.clear()
    connect_github(app, MockGitHub(private=False))
    app.page.wait_for_selector('text=είναι δημόσιο')
    app.errors.clear()


def test_portal_and_old_links(browser, base_url):
    ctx = browser.new_context()
    page = ctx.new_page()
    page.goto(base_url + '#/portal')  # η Πύλη ανοίγει και χωρίς σύνδεση
    page.wait_for_selector('text=Πύλη Μεγάλης Γραμματείας')
    for s in ['Ψηφιακό Έντυπο Διατάγματος', 'Τεκτονικές Ομιλίες', 'Φόρμες εγγραφής', 'Bear Bell Ritual', 'Μέγας Καγκελάριος']:
        assert page.get_by_text(s).count(), s
    assert (ROOT / 'diatagma' / 'index.html').exists() and page.locator('a[href="diatagma/"]').count()
    page.goto(base_url + 'app/#/letters')  # παλιοί σύνδεσμοι …/app/#/… → κεντρική διεύθυνση
    page.wait_for_url(base_url + '#/connect')
    assert page.url.startswith(base_url + '#/')
    ctx.close()


@pytest.mark.parametrize('path', ['/', '/letters/new', '/decrees/new', '/members', '/directory', '/visits', '/namedays', '/projects', '/database', '/settings'])
def test_mobile_no_horizontal_scroll(browser, base_url, path):
    ctx = browser.new_context(viewport={'width': 390, 'height': 800})
    page = ctx.new_page()
    page.goto(base_url)
    page.get_by_text('Δοκιμή σε αυτή τη συσκευή').click()
    page.wait_for_selector('.dash')
    page.goto(base_url + '#' + path)
    page.wait_for_selector('main h1')
    page.wait_for_timeout(200)
    assert page.evaluate('document.documentElement.scrollWidth') <= 390, path
    ctx.close()
