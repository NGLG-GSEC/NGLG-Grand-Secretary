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
    assert 'Αρ. Πρωτ.: 20545' in t and '20.545' not in t and 'ΕπΜΓρ. Επαρχιακής Μεγάλης Στοάς Αθηνών' in t
    assert app.page.evaluate("() => getComputedStyle(document.querySelector('.paper .body')).textAlign") == 'justify'
    assert app.page.locator('.paper a[href="https://www.nglgreece.gr"]').count() == 1
    href = app.page.locator('a:has-text("Άνοιγμα στο Gmail"), a:has-text("Αποστολή με Email")').first.get_attribute('href')
    assert 'authuser=grand.secretary%40nglgreece.gr' in href and 'athens.secretary%40nglgreece.gr' in href
    # νέα «πάνω σε» → επόμενος αριθμός πρωτοκόλλου
    app.go('/letters/new?copy_from=1')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/2')
    assert '20546' in app.text()
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
    assert 'θα δοθεί όταν οριστεί «Έτοιμο»' in app.text()  # πρόχειρο: χωρίς αριθμό πρωτοκόλλου
    app.click('✅ Έτοιμο: απόδοση αρ. πρωτοκόλλου')
    app.page.wait_for_selector('text=πήρε αριθμό πρωτοκόλλου')
    t = app.text()
    assert 'υπ’ αριθμ. 513/' in t and 'Αρ. Πρωτ.: 20546' in t  # ενιαίο πρωτόκολλο με τις Επιστολές
    body = app.text('.decbody')
    for s in ['ΔΙΟΡΙΖΟΜΕΝ', 'ΜΕΓΑΝ ΓΡΑΜΜΑΤΕΑ', 'τον Λίαν Σεβάσμιον Αδελφόν', 'Γεώργιον Παπαδόπουλον', 'λαβόντες υπ’ όψιν τον Κανόνα 22']:
        assert s in body, s
    app.go('/epeteirida')
    assert 'Μέγας Γραμματεύς' in app.text() and '513/' in app.text()
    assert app.page.locator('tbody tr').first.locator('td').nth(2).inner_text() == '23'  # τάξη προβαδίσματος
    pr = app.page.evaluate("async () => { const m = await import('./modules/decree-catalog.js'); return [m.PRECEDENCE.length, m.PRECEDENCE[22], m.precedenceOf('Μέγας Γραμματεύς'), m.precedenceOf('Πρώην Μέγας Γραμματεύς'), m.precedenceOf('Μέγας Θησαυροφύλαξ'), m.precedenceOf('Μέγας Στεγαστής'), m.precedenceOf('Πρώην Μέγας Στεγαστής')]; }")
    assert pr == [67, 'Μέγας Γραμματεύς', 23, 24, 29, 66, 67]
    # ΕΥΑΡΕΣΤΟΥΜΕΘΑ: σταθερό κείμενο, χωρίς Επετηρίδα
    app.go('/decrees/new?action=service_award')
    assert 'Τάξις και προβάδισμα των μελών' in app.text()
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
    # χωρίς τον Πίνακα Εγκαταστάσεων 2026–2027, ώστε να ελεγχθεί μία μόνο επίσκεψη
    app.page.evaluate("async () => { const m = await import('./core/store.js'); await m.db.save('x', (tx) => tx.replace('visits', [])); }")
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
    app.click('✉ Μόνο εκπρόσωπος')
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
    assert 'Αρ. Πρωτ.: 30000' in app.text() and 'Με εγκάρδιους αδελφικούς χαιρετισμούς,' in app.text()
    app.go('/database/protocol')
    assert '30000\tΕπιστολή' in app.text()
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
    assert 'Αρ. Πρωτ.: 20601' in app.text()  # η αρίθμηση συνεχίζει από τα παλιά
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
    assert len(gh.read_json('data/lodges.json')) == 86 and 'data/settings.json' in gh.files()
    app.go('/letters/new').fill(subject='Από τον Δημήτρη', body='x')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    letters = gh.read_json('data/letters.json')
    assert letters[0]['protocol_no'] == '20545' and gh.commits[gh.ref]['message'].startswith('Νέα Επιστολή')
    # Ο Νικόλαος (άλλη συσκευή) καταχωρίζει επιστολή στο μεταξύ
    other = letters + [{**letters[0], 'id': 2, 'protocol_seq': 20546, 'protocol_no': '20546', 'subject': 'Από τον Νικόλαο'}]
    gh.external_commit('data/letters.json', '[\n' + ',\n'.join(json.dumps(r, ensure_ascii=False) for r in other) + '\n]\n')
    app.go('/letters/new').fill(subject='Δεύτερη του Δημήτρη', body='y')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/3')
    nos = [l['protocol_no'][:7] for l in gh.read_json('data/letters.json')]
    assert nos == ['20545', '20546', '20547'], nos  # χωρίς διπλό αριθμό, χωρίς απώλεια της αλλαγής του άλλου
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


@pytest.mark.parametrize('fmt', ['env', 'env_quoted', 'json_object', 'json_list'])
def test_import_member_registry_from_render_env(app, tmp_path, fmt):
    # Render → Environment → Export (.env): το Μητρώο στις μεταβλητές MEMBER_REGISTRY_SEED_000…, μαζί με άσχετους κωδικούς
    members = {'members': [
        {'registry_no': 1201, 'surname': 'Σπόρος', 'first_name': 'Αλέξανδρος', 'email': 'a@example.com', 'mobile': '6900000001', 'active': True,
         'lodges': [{'seq': 1, 'name': 'ΠΑΡΘΕΝΩΝ', 'number': '3', 'status': '1. ΤΑΚΤΙΚΟ'}]},
        {'registry_no': 1202, 'surname': 'Δεύτερος', 'first_name': 'Βασίλειος', 'email': '', 'mobile': '', 'active': True, 'lodges': []}]}
    b64 = base64.b64encode(gzip.compress(json.dumps(members, ensure_ascii=False).encode())).decode()
    parts = [b64[i:i + 40] for i in range(0, len(b64), 40)]
    secrets = {'APP_SECRET': 'topsecret', 'SMTP_PASSWORD': 'also secret'}
    seeds = {f'MEMBER_REGISTRY_SEED_{i:03d}': p for i, p in enumerate(parts)}
    if fmt == 'env':
        body = ''.join(f'{k}={v}\n' for k, v in {**secrets, **seeds}.items())
    elif fmt == 'env_quoted':
        body = ''.join(f'{k}="{v}"\n' for k, v in {**secrets, **seeds}.items())
    elif fmt == 'json_object':
        body = json.dumps({**secrets, **seeds}).replace('/', '\\/')  # μορφή με «\/» όπως σε κάποιες εξαγωγές
    else:
        body = json.dumps([{'key': k, 'value': v} for k, v in {**secrets, **seeds}.items()], indent=2)
    f = tmp_path / ('nglg-letter-manager.' + ('json' if fmt.startswith('json') else 'env'))
    f.write_text(body)
    app.connect_local().go('/database/backup')
    app.page.set_input_files('[name=file]', str(f))
    app.page.locator('#imf button').click()
    app.page.wait_for_selector('text=Μητρώο Μελών από την παλιά εφαρμογή')
    assert '2 εγγραφές (2 νέες' in app.text()
    app.go('/members?field=lodge&q=3')
    assert 'Σπόρος' in app.text()
    stored = app.page.evaluate("async () => { const m = await import('./core/store.js'); return JSON.stringify([m.db.tables, m.db.settings]); }")
    assert 'topsecret' not in stored and 'also secret' not in stored


def test_render_env_with_lost_character_is_repaired(app, tmp_path):
    # Το Render «έχασε» έναν χαρακτήρα (+) σε ένα τμήμα: η εφαρμογή τον βρίσκει και τον επισκευάζει (έλεγχος CRC του gzip)
    import random
    random.seed(7)
    people = [{'registry_no': 2000 + i, 'surname': f'Μέλος{i}', 'first_name': 'Γεώργιος', 'email': f'm{i}@example.com', 'mobile': f'69{random.randint(10**7, 10**8 - 1)}',
               'active': True, 'lodges': [{'seq': 1, 'name': 'ΠΑΡΘΕΝΩΝ', 'number': '3', 'status': '1. ΤΑΚΤΙΚΟ'}]} for i in range(60)]
    b64 = base64.b64encode(gzip.compress(json.dumps({'members': people}, ensure_ascii=False).encode())).decode()
    size = 300
    parts = [b64[i:i + size] for i in range(0, len(b64), size)]
    k = next(i for i, p in enumerate(parts[:-1]) if '+' in p)
    pos = parts[k].index('+')
    parts[k] = parts[k][:pos] + parts[k][pos + 1:]
    f = tmp_path / 'render.env'
    f.write_text('SMTP_PASSWORD=topsecret\n' + ''.join(f'MEMBER_REGISTRY_SEED_{i:03d}={p}\n' for i, p in enumerate(parts)))
    app.connect_local().go('/database/backup')
    app.page.set_input_files('[name=file]', str(f))
    app.page.locator('#imf button').click()
    app.page.wait_for_selector('text=Επισκευάστηκε αυτόματα', timeout=120000)
    assert '60 εγγραφές (60 νέες' in app.text()


def test_official_lodges_applied_to_existing_database(app):
    # Υπάρχουσα βάση με τον παλιό κατάλογο Στοών: η αναβάθμιση ενημερώνει τα επίσημα στοιχεία και προσθέτει όσες λείπουν,
    # χωρίς να αγγίζει email/Σεβάσμιο που είχαν ήδη συμπληρωθεί.
    gh = MockGitHub()
    gh.ref = gh.put_commit(gh.put_tree({}), [], 'init')
    old = [{'id': 3, 'number': '31', 'name': 'x', 'ritual': 'Schroder', 'status': 'Ενεργή'}, {'id': 1, 'number': '2', 'name': 'ΑΚΡΟΠΟΛΙΣ', 'provincial': '', 'orient': '', 'email': 'akropolis@example.com', 'master': 'Σεβάσμιος Α', 'status': 'Ενεργή'},
           {'id': 2, 'number': '73', 'name': 'ΑΧΙΛΛΕΥΣ Ο ΜΥΡΜΙΔΩΝ', 'provincial': '', 'status': 'Ενεργή'}]
    gh.external_commit('data/lodges.json', json.dumps(old, ensure_ascii=False))
    gh.external_commit('data/settings.json', json.dumps({'closing': 'x'}))
    connect_github(app, gh)
    app.page.wait_for_selector('.dash')
    lodges = {l['number']: l for l in gh.read_json('data/lodges.json')}
    assert len(lodges) == 87  # 86 επίσημες + η 73 που υπήρχε ήδη
    assert lodges['31']['ritual'] == 'Emulation'
    a = lodges['2']
    assert a['provincial'] == 'ΕπΜΣτ. Αθηνών' and a['orient'] == 'Αθηνών' and a['kind'] == 'Κανονική' and a['ritual'] == 'Emulation'
    assert a['email'] == 'akropolis@example.com' and a['master'] == 'Σεβάσμιος Α'
    assert a['full_title'] == 'ΣΣτ. 2 Ακρόπολις υπό την Σκ. της ΕπΜΣτ. Αθηνών'
    assert lodges['52']['status'] == 'Ανενεργή' and lodges['117']['kind'] == 'Ειδική' and lodges['Φ']['orient'] == 'Κερκύρας'
    assert 'lodges-official-2026-10' in gh.read_json('data/settings.json')['_migrations']
    n = len(gh.commits)
    app.page.reload()
    app.page.wait_for_selector('.dash')
    assert len(gh.commits) == n  # δεν ξανατρέχει


def test_paste_member_registry_and_deregistered_no_contact(app):
    # Επικόλληση από το Excel-πηγή: All_Deregistered = ΝΑΙ ή Status_1 = «5. ΔΙΑΓΡΑΦΕΝ» → διαγραμμένος, απαγορεύεται κάθε επικοινωνία
    head = ['Member_ID', 'Surname', 'First_Name', 'Name_Has_Variants', 'All_Surname_Variants', 'All_FirstName_Variants', 'Email', 'Multiple_Emails', 'Mobile',
            'Multiple_Mobiles', 'Degree', 'Number_of_Lodges', 'All_Deregistered (ΔΙΑΓΡΑΦΕΝ)']
    for j in range(1, 7):
        head += [f'Lodge_{j}', f'Number_{j}', f'Status_{j}']
    head.append('Additional_Lodges (beyond 6)')

    def row(rid, sn, fn, email, dereg, lodges):
        r = [rid, sn, fn, 'ΟΧΙ', sn, fn, email, 'ΟΧΙ', '6900000' + rid, 'ΟΧΙ', 'Διδάσκαλος', str(len(lodges)), dereg]
        for j in range(6):
            r += list(lodges[j]) if j < len(lodges) else ['', '', '']
        return r + ['']
    rows = [head,
            row('901', 'Ενεργόπουλος', 'Γεώργιος', 'act@example.com', 'ΟΧΙ', [('ΠΑΡΘΕΝΩΝ', '3', '1. ΤΑΚΤΙΚΟ'), ('ΠΛΑΤΩΝ 1990', '', '1. ΤΑΚΤΙΚΟ')]),
            row('902', 'Διαγραμμένος', 'Γεώργιος', 'gone@example.com', 'ΝΑΙ', [('ΠΑΡΘΕΝΩΝ', '3', '5. ΔΙΑΓΡΑΦΕΝ')]),
            row('903', 'Πρώτοδιαγραφείς', 'Γεώργιος', 'first@example.com', 'ΟΧΙ', [('LA ΡAIX', '', '5. ΔΙΑΓΡΑΦΕΝ'), ('ΑΚΡΟΠΟΛΙΣ  2010', '', '1. ΤΑΚΤΙΚΟ')])]
    app.connect_local().go('/members')
    app.page.locator('details.fold summary').click()
    app.page.fill('[name=paste]', '\n'.join('\t'.join(r) for r in rows))
    app.fill(mode='replace')
    with app.page.expect_download():
        app.page.locator('#imp button').click()
    app.page.wait_for_selector('text=Γενική αντικατάσταση ολοκληρώθηκε')
    assert '3 εγγραφές' in app.text('body') and '2 διαγραμμένα μέλη' in app.text('body')
    ms = app.page.evaluate("async () => { const m = await import('./core/store.js'); return [m.db.all('member_registry'), m.db.all('member_lodges')]; }")
    by = {m['surname']: m for m in ms[0]}
    assert by['Ενεργόπουλος']['no_contact'] == 0 and by['Ενεργόπουλος']['active'] == 1
    assert by['Διαγραμμένος']['no_contact'] == 1 and by['Διαγραμμένος']['active'] == 0
    assert by['Πρώτοδιαγραφείς']['no_contact'] == 1
    nums = sorted(l['lodge_number'] for l in ms[1])
    assert nums == ['103', '104', '3', '3', '95']
    assert app.page.locator('.pill.bad').count() == 2
    # δεν εμφανίζονται ως παραλήπτες επιστολών, ούτε στα μέλη για διατάγματα / εκπροσώπους
    found = app.page.evaluate("async () => { const p = await import('./core/pickers.js'); return [p.contactItems('Γεώργιος').map((x) => x.label), p.memberItems('Γεώργιος').map((x) => x.label)]; }")
    assert found == [['Ενεργόπουλος Γεώργιος'], ['Ενεργόπουλος Γεώργιος']]
    # η καρτέλα του μέλους δείχνει την απαγόρευση και δεν έχει κουμπί επιστολής
    app.go(f"/members/{by['Διαγραμμένος']['id']}")
    assert 'απαγορεύεται κάθε επικοινωνία' in app.text() and app.page.locator('a:has-text("✉ Επιστολή")').count() == 0
    # ευχές: δεν εμφανίζεται στους εορτάζοντες
    cel = app.page.evaluate("async () => { const n = await import('./modules/namedays.js'); return JSON.stringify(n.celebrants('2026-01-01', '2026-12-31')); }")
    assert 'Διαγραμμένος' not in cel and 'Πρώτοδιαγραφείς' not in cel


def test_existing_deregistered_members_marked_once(app):
    gh = MockGitHub()
    gh.ref = gh.put_commit(gh.put_tree({}), [], 'init')
    gh.external_commit('data/member_registry.json', json.dumps([
        {'id': 1, 'surname': 'Α', 'first_name': 'Β', 'email': 'a@example.com', 'active': 1, 'deregistered_note': ''},
        {'id': 2, 'surname': 'Γ', 'first_name': 'Δ', 'email': 'g@example.com', 'active': 0, 'deregistered_note': 'ΔΙΑΓΡΑΦΕΝ από όλες τις Στοές'},
        {'id': 3, 'surname': 'Ε', 'first_name': 'Ζ', 'email': 'e@example.com', 'active': 1, 'deregistered_note': ''}], ensure_ascii=False))
    gh.external_commit('data/member_lodges.json', json.dumps([
        {'id': 1, 'member_id': 3, 'seq': 1, 'lodge_name': 'ΠΑΡΘΕΝΩΝ', 'lodge_number': '3', 'member_status': '5. ΔΙΑΓΡΑΦΕΝ'},
        {'id': 2, 'member_id': 3, 'seq': 2, 'lodge_name': 'ΠΛΑΤΩΝ', 'lodge_number': '70', 'member_status': '1. ΤΑΚΤΙΚΟ'},
        {'id': 3, 'member_id': 1, 'seq': 1, 'lodge_name': 'ΠΑΡΘΕΝΩΝ', 'lodge_number': '3', 'member_status': '1. ΤΑΚΤΙΚΟ'},
        {'id': 4, 'member_id': 1, 'seq': 2, 'lodge_name': 'ΠΛΑΤΩΝ', 'lodge_number': '70', 'member_status': '5. ΔΙΑΓΡΑΦΕΝ'}], ensure_ascii=False))
    gh.external_commit('data/settings.json', json.dumps({'closing': 'x'}))
    connect_github(app, gh)
    app.page.wait_for_selector('.dash')
    ms = {m['id']: m for m in gh.read_json('data/member_registry.json')}
    assert not ms[1].get('no_contact') and ms[1]['active'] == 1
    assert ms[2]['no_contact'] == 1 and ms[3]['no_contact'] == 1 and ms[3]['active'] == 0


def test_official_provinces_applied_and_lodges_counted(app):
    gh = MockGitHub()
    gh.ref = gh.put_commit(gh.put_tree({}), [], 'init')
    gh.external_commit('data/grand_lodges.json', json.dumps([
        {'id': 1, 'short': 'ΕπΜΣτ. Αθηνών', 'full_title': 'παλιό', 'email': 'old@example.com', 'addressee': 'x', 'kind': 'Επαρχιακή', 'master_name': 'Α. Διδάσκαλος', 'sort_order': 10, 'active': 1},
        {'id': 2, 'short': 'ΠΜΣτ.  Κύπρου', 'full_title': '', 'email': '', 'kind': 'Επαρχιακή', 'sort_order': 60, 'active': 1}], ensure_ascii=False))
    gh.external_commit('data/settings.json', json.dumps({'closing': 'x'}))
    connect_github(app, gh)
    app.page.wait_for_selector('.dash')
    ps = {p['short']: p for p in gh.read_json('data/grand_lodges.json')}
    assert len(ps) == 7
    a = ps['ΕπΜΣτ. Αθηνών']
    assert a['email'] == 'athens.secretary@nglgreece.gr' and a['full_title'] == 'Επαρχιακή Μεγάλη Στοά Αθηνών' and a['master_name'] == 'Α. Διδάσκαλος'
    c = ps['ΠΜΣτ. Κύπρου']
    assert c['kind'] == 'Περιφερειακή' and c['email'] == 'dglcyprus@nglgreece.gr' and c['addressee'].startswith('ΠερΜΓρ.')
    assert ps['ΕΜΣτΕ Α.Ε. & Α.Τ.']['email'] == 'grand.secretary@nglgreece.gr'
    app.go('/provinces')
    rows = app.page.locator('tr', has_text='ΕπΜΣτ. Αθηνών').first.inner_text()
    assert '36' in rows


def test_lodge_rituals_and_masters_pasted(app):
    # Σκωτικό τυπικό σε 19 Στοές (Φ: Σκωτικό 1700), Emulation στις υπόλοιπες· Σεβάσμιος + κινητό με επικόλληση
    app.connect_local().go('/lodges')
    rit = app.page.evaluate("async () => { const m = await import('./core/store.js'); return Object.fromEntries(m.db.all('lodges').map((l) => [l.number, l.ritual])); }")
    scot = '28 58 89 95 96 97 98 99 101 102 103 104 105 106 108 111 113 115 Φ'.split()
    assert sorted(n for n, r in rit.items() if r.startswith('ΣΚΩΤΙΚΟ')) == sorted(scot)
    assert rit['Φ'] == 'ΣΚΩΤΙΚΟ 1700' and rit['58'] == 'ΣΚΩΤΙΚΟ Frenche 1785'
    assert all(r == 'Emulation' for n, r in rit.items() if n not in scot)
    paste = 'ΝΟ\tΣΤΟΑ\tΕΔΡΑ\tΕΙΔΟΣ\tΤΥΠΙΚΟ\tΟνομα\tΕπώνυμο\tΚιν\n' \
            '95\tLA ΡAIX\tΚέρκυρα\tΓΑΛΛΟΦΩΝΗ\tΣΚΩΤΙΚΟ Frenche 1785\tΔΟΚΙΜΟΣ\tΣΕΒΑΣΜΙΟΣ\t6900000095\n' \
            '28\tΚΑΜΕΙΡΟΣ\tΡόδος\tKANONIKH\tΣΚΩΤΙΚΟ\tΆλλος\tΔοκιμαστικός\t6900000028\n'
    app.page.locator('details.fold summary').click()
    app.page.fill('#imp [name=paste]', paste)
    app.page.locator('#imp button').click()
    app.page.wait_for_selector('text=Εισαγωγή ολοκληρώθηκε')
    ls = app.page.evaluate("async () => { const m = await import('./core/store.js'); return Object.fromEntries(m.db.all('lodges').map((l) => [l.number, l])); }")
    assert ls['95']['master'] == 'ΔΟΚΙΜΟΣ ΣΕΒΑΣΜΙΟΣ' and ls['95']['master_mobile'] == '6900000095' and ls['95']['name'] == 'LA PAIX'
    assert ls['95']['orient'] == 'Κερκύρας' and ls['95']['kind'] == 'Γαλλόφωνη'
    assert ls['28']['master'] == 'Άλλος Δοκιμαστικός' and ls['28']['kind'] == 'Κανονική' and ls['28']['email'] == ''
    assert 'ΔΟΚΙΜΟΣ ΣΕΒΑΣΜΙΟΣ' in app.text() and '6900000095' in app.text()


def test_epeteirida_import_of_grand_officers(app):
    app.connect_local()
    add_member(app, surname='Δοκιμόπουλος', first='Κωνσταντίνος', email='k@example.com', mobile='6900000001')
    add_member(app, surname='Πρότυπος', first='Νικόλαος', email='n@example.com', mobile='6900000002')
    paste = ('Ονοματεπώνυμο\tΒαθμός Μεγ. Αξιωματικού\tΔιάταγμα διορισμού\tΈτος\tΕν Ενεργεία Αξίωματικοί\n'
             "Δοκιμόπουλος Κω/νος\tΠρΒ'Μεπ\t475\t2025\tΑν.Μεγ.Τελετάρχης 502/2026\n"
             'Πρότυπος Νικόλαος \tΕπΜΔ Πειραιώς\t419\t2024\t\n'
             'Άγνωστος Τεστ\tΠρΑΜΔιακ\t?\t2018\tΜετέστη στην Αιώνια Ανατολή 24/06/2026\n'
             'Test Person\tΑΓΝΩΣΤΟ\t\t\t\n')
    app.go('/epeteirida')
    app.page.locator('details.fold summary', has_text='Εισαγωγή καταλόγου').click()
    app.page.fill('#epimp [name=paste]', paste)
    app.page.locator('#epimp button').click()
    app.page.wait_for_selector('text=Επετηρίδα: 4 Μεγάλοι Αξιωματικοί')
    body = app.text('body')
    assert '5 εγγραφές' in body and '2 συνδέθηκαν' in body and 'Test Person: ΑΓΝΩΣΤΟ' in body
    recs = app.page.evaluate("async () => { const m = await import('./core/store.js'); return m.db.all('member_degrees_offices'); }")
    by = {(r['full_name'], r['office']): r for r in recs}
    a = by[('Δοκιμόπουλος Κω/νος', 'Πρώην Δεύτερος Μέγας Επόπτης')]
    assert a['member_id'] and a['decree_no'] == 475 and a['decree_year'] == 2025
    c = by[('Δοκιμόπουλος Κω/νος', 'Αναπληρωτής Μέγας Τελετάρχης')]
    assert c['is_current'] == 1 and c['decree_no'] == 502 and c['decree_year'] == 2026
    p = by[('Πρότυπος Νικόλαος', 'Επαρχιακός Μέγας Διδάσκαλος')]
    assert p['member_id'] and 'Πειραιώς' in p['notes']
    u = by[('Άγνωστος Τεστ', 'Πρώην Πρώτος Μέγας Διάκονος')]
    assert u['member_id'] is None and u['decree_no'] is None and 'Μετέστη' in u['notes']
    app.go('/epeteirida?cur=1')
    assert 'Αναπληρωτής Μέγας Τελετάρχης' in app.text('.tablecard') and 'Πρώην Δεύτερος' not in app.text('.tablecard')
    app.go('/epeteirida?sort=prec')
    assert app.page.locator('tbody tr').first.locator('td').nth(3).inner_text() == 'Επαρχιακός Μέγας Διδάσκαλος'
    # νέα εισαγωγή αντικαθιστά την προηγούμενη
    app.go('/epeteirida')
    app.page.locator('details.fold summary', has_text='Εισαγωγή καταλόγου').click()
    app.page.fill('#epimp [name=paste]', "Πρότυπος Νικόλαος\tΠρΜΞιφ\t414\t2024\t\n")
    app.page.locator('#epimp button').click()
    app.page.wait_for_selector('text=Επετηρίδα: 1 Μεγάλοι Αξιωματικοί')
    recs = app.page.evaluate("async () => { const m = await import('./core/store.js'); return m.db.all('member_degrees_offices'); }")
    assert [r['office'] for r in recs] == ['Πρώην Μέγας Ξιφοφόρος']


def test_installations_pasted_as_table(app):
    app.connect_local().go('/visits/import')
    y = date.today().year + 1
    paste = (f'ΝΟ\tΣΤΟΑ\tΕΔΡΑ\tΗμερ.Εγκ\tΝέος ΣΔ\n3\tΠΑΡΘΕΝΩΝ\tΑθήνα\t17/10/{y}\tΔοκιμαστής Α.\n'
             f'95\tLA ΡAIX\tΚέρκυρα\t24.10.{y}\t\n28\tΚΑΜΕΙΡΟΣ\tΡόδος\t\t\n')
    app.page.fill('[name=text]', paste)
    app.page.locator('#imf button').click()
    app.page.wait_for_selector('text=Προστέθηκαν 2 Εγκαταστάσεις')
    assert '1 Στοές χωρίς ημερομηνία' in app.text('body')
    vs = app.page.evaluate("async () => { const m = await import('./core/store.js'); return m.db.all('visits'); }")
    by = {v['lodge_number']: v for v in vs}
    assert by['3']['visit_date'] == f'{y}-10-17' and 'Δοκιμαστής Α.' in by['3']['notes'] and by['3']['province'] == 'ΕπΜΣτ. Πειραιώς & Νήσων Αρχ. Αιγαίου'
    assert by['95']['lodge'] == 'LA PAIX' and by['95']['visit_date'] == f'{y}-10-24'
    # ξανά η ίδια επικόλληση: δεν διπλασιάζεται
    app.go('/visits/import')
    app.page.fill('[name=text]', paste)
    app.page.locator('#imf button').click()
    app.page.wait_for_selector('text=Προστέθηκαν 0 Εγκαταστάσεις, 2 υπήρχαν ήδη')


def test_installations_table_2026_2027_loaded(app, tmp_path):
    app.connect_local()
    vs = app.page.evaluate("async () => { const m = await import('./core/store.js'); return m.db.all('visits'); }")
    assert len(vs) == 74
    by = {(v['lodge_number'], v['visit_date']): v for v in vs}
    assert by[('32', '2026-10-17')]['location'] == 'Τεκτονικό Μέγαρο Ιωαννίνων' and by[('32', '2026-10-17')]['province'] == 'ΕπΜΣτ. Πελοποννήσου & Δυτικής Ελλάδας'
    assert by[('Φ', '2027-06-26')]['lodge'] == 'ΦΟΙΝΙΞ ΚΕΡΚΥΡΑΣ' and '04/10/2027' in by[('Φ', '2027-06-26')]['notes']
    assert by[('3', '2026-10-07')]['lodge'] == 'ΠΑΡΘΕΝΩΝ'
    # το ίδιο αρχείο Excel από τη σελίδα «Επικόλληση λίστας»: δεν διπλασιάζεται
    import openpyxl
    from datetime import datetime
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(['Εγκαταστάσεις Σεβασμίων Διδασκάλων']); ws.append([])
    ws.append(['Επαρχία', 'Στοά', 'Αριθμός', 'Ημερομηνία εγκατάστασης', 'Σημειώσεις'])
    ws.append(['Αθηνών', 'Λόγος', 89, datetime(2026, 10, 13, 12), None])
    ws.append(['Αθηνών', 'Ηλιοτρόπιο', 8, datetime(2027, 10, 6, 12), 'Τεκτονικό Μέγαρο Αθηνών.'])
    ws.append(['Αθηνών', 'Ευρώπη', 108, None, 'Δεν έχει δοθεί ημερομηνία.'])
    f = tmp_path / 'egk.xlsx'; wb.save(f)
    app.go('/visits/import')
    app.page.set_input_files('[name=file]', str(f))
    app.page.locator('#imf button').click()
    app.page.wait_for_selector('text=Προστέθηκαν 1 Εγκαταστάσεις, 1 υπήρχαν ήδη')
    vs = app.page.evaluate("async () => { const m = await import('./core/store.js'); return m.db.all('visits'); }")
    new = [v for v in vs if v['visit_date'] == '2027-10-06'][0]
    assert new['lodge_number'] == '8' and new['location'] == 'Τεκτονικό Μέγαρο Αθηνών'


def test_namedays_calendar_completed(app):
    app.connect_local()
    for sn, fn in [('Πρώτος', 'Σέργιος'), ('Δεύτερος', 'Κώστας'), ('Τρίτος', 'Τάσος'), ('Τέταρτος', 'Ξενόφερτος')]:
        add_member(app, surname=sn, first=fn, email=f'{sn}@example.com', mobile='')
    y = date.today().year
    app.go(f'/namedays?frm={y}-10-07&to={y}-10-14')
    t = app.text()
    assert 'Πρώτος' in t and 'Μητρώο: 4 ενεργά μέλη · 3 με γνωστή ονομαστική εορτή' in t and 'Ξενόφερτος 1' in t
    cel = app.page.evaluate(f"async () => {{ const n = await import('./modules/namedays.js'); return JSON.stringify(n.celebrants('{y}-01-01', '{y}-12-31')); }}")
    assert 'Δεύτερος' in cel and 'Τρίτος' in cel  # Κωνσταντίνου (21/5) και Πάσχα


def test_letter_word_and_digital_form(app, tmp_path):
    import zipfile
    app.connect_local()
    app.go('/letters/new').fill(recipient_name='ΕπΜΓρ. Δοκιμής', recipient_email='test@example.com', subject='Δοκιμή Word', body='Αγαπητοί Αδελφοί,\n\nΠρώτη παράγραφος.\n\nΔεύτερη & <τελευταία>.')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    with app.page.expect_download() as dl:
        app.click('⬇ Word (επεξεργασία)')
    f = tmp_path / 'l.docx'
    dl.value.save_as(f)
    assert dl.value.suggested_filename.endswith('Δοκιμή Word.docx')
    z = zipfile.ZipFile(f)
    doc = z.read('word/document.xml').decode()
    assert 'Πρώτη παράγραφος.' in doc and 'Δεύτερη &amp; &lt;τελευταία&gt;.' in doc and 'Θέμα: Δοκιμή Word' in doc and 'Προς: ΕπΜΓρ. Δοκιμής' in doc
    assert 'word/media/image1.png' in z.namelist() and 'word/media/image2.png' in z.namelist()  # θυρεός, υπογραφή
    import xml.dom.minidom
    for n in z.namelist():
        if n.endswith('.xml') or n.endswith('.rels'):
            xml.dom.minidom.parseString(z.read(n))
    # Ψηφιακό Έντυπο με τα στοιχεία της επιστολής
    app.click('🖋 Ψηφιακό Έντυπο')
    app.page.wait_for_url('**/diatagma/')
    app.page.wait_for_function("() => document.getElementById('subject').value === 'Δοκιμή Word'")
    assert app.page.input_value('#doctype') == 'ΕΠΙΣΤΟΛΗ' and app.page.input_value('#mailto') == 'test@example.com'
    assert 'Πρώτη παράγραφος.' in app.page.input_value('#p1') and app.page.input_value('#num') == '20545'
    with app.page.expect_download() as dl2:
        app.page.click('#bWord')
    assert dl2.value.suggested_filename == 'ΕΠΙΣΤΟΛΗ - Δοκιμή Word.docx'
    app.page.evaluate("() => { window.open = (u) => { window.__opened = u; return null; }; }")
    app.page.click('#bMail')
    u = app.page.evaluate('() => window.__opened')
    assert 'authuser=grand.secretary%40nglgreece.gr' in u and 'test%40example.com' in u and 'su=%CE%95%CE%A0' in u
    app.page.click('#bToApp')
    app.page.wait_for_url('**/#/letters/new*')
    app.page.wait_for_selector('#lf')
    assert app.page.input_value('[name=subject]') == 'Δοκιμή Word' and app.page.input_value('[name=recipient_email]') == 'test@example.com'
    app.errors.clear()


def test_grand_officers_as_representatives_assigned_per_installation(app):
    app.connect_local()
    paste = ('Ονοματεπώνυμο\tΒαθμός Μεγ. Αξιωματικού\tΔιάταγμα διορισμού\tΈτος\tΕν ενεργεία αξίωμα 2026\n'
             'Δοκιμάκος Κωνσταντίνος\tMΣημ\t474\t2025\tΜέγας Σημαιοφόρος 502/2026\n'
             "Τεστάκης Άγγελος\tΠρΒ'ΜΕπ\t475\t2025\tΑν.Μεγ.Τελετάρχης 502/2026\n"
             'Πρότυπος Δημήτριος\tΜεγ Α\'Επ\t502\t2026\tΑ\' Μέγας Επόπτης 502/2026\n'
             'Υπόδειγμα Στυλιανός\tΠρΜΔ\t\t2014\tΠρΣΓΥ 502/2026\n')
    app.go('/reps/import')
    app.page.fill('[name=text]', paste)
    app.page.locator('#rif button').click()
    app.page.wait_for_selector('text=Εκπρόσωποι: 4 νέοι')
    reps = app.page.evaluate("async () => { const m = await import('./core/store.js'); return m.db.all('reps'); }")
    by = {r['surname']: r for r in reps}
    assert by['Μπενετάτος']['office'] == 'Μέγας Διδάσκαλος'  # ο ΜΔ προστίθεται αυτόματα
    assert by['Τεστάκης']['office'] == 'Αναπληρωτής Μέγας Τελετάρχης · Πρώην Δεύτερος Μέγας Επόπτης' and by['Τεστάκης']['year'] == '2026'
    assert by['Υπόδειγμα']['office'].startswith('Πρόεδρος του Συμβουλίου Γενικών Υποθέσεων')
    # ξανά: ενημέρωση, όχι διπλοεγγραφές
    app.go('/reps/import')
    app.page.fill('[name=text]', paste)
    app.page.locator('#rif button').click()
    app.page.wait_for_selector('text=Εκπρόσωποι: 0 νέοι, 4 ενημερώθηκαν')
    # σε κάθε Εγκατάσταση: ΜΔ πρώτος, μετά κατά προβάδισμα
    app.go('/visits')
    sel = app.page.locator('.vrepsel').first
    labels = sel.locator('option').all_inner_texts()
    assert labels[1].startswith('ΟΥΔΕΙΣ')  # ο ΜΔ δεν έστειλε κανέναν: πάνω από τον ΜΔ
    assert labels[2].startswith('Μπενετάτος Ιωάννης — Μέγας Διδάσκαλος · Σεβτ.')
    assert labels[3].startswith('Υπόδειγμα Στυλιανός — Πρόεδρος του Συμβουλίου Γενικών Υποθέσεων · Πρώην Μέγας Διδάσκαλος · Σεβτ.')  # Πρώην ΜΔ: 3ος στην τάξη προβαδίσματος
    assert labels[4].startswith('Πρότυπος Δημήτριος — Πρώτος Μέγας Επόπτης · Πσεβ.') and labels[5].startswith('Τεστάκης Άγγελος — Αναπληρωτής Μέγας Τελετάρχης · Πρώην Δεύτερος Μέγας Επόπτης · Πσεβ.')
    vid = sel.get_attribute('data-id')
    sel.select_option(label=labels[2])
    app.page.wait_for_selector('text=Ορίστηκε: Σεβασμιώτατος Αδ. Μπενετάτος')
    v = app.page.evaluate(f"async () => {{ const m = await import('./core/store.js'); return m.db.get('visits', {vid}); }}")
    assert v['rep_id'] == by['Μπενετάτος']['id']


def test_visit_letter_and_email_to_province_and_grand_master(app):
    app.connect_local()
    app.page.evaluate("async () => { const m = await import('./core/store.js'); await m.db.save('x', (tx) => tx.setting('gm_email', 'gm@example.com')); }")
    app.page.evaluate("async () => { const m = await import('./core/store.js'); await m.db.save('x', (tx) => tx.replace('visits', [])); }")
    app.go('/reps/new').fill(name='Ιωάννης', surname='Εκπρόσωπος', office='Μέγας Καγκελάριος', email='rep@example.com')
    app.click('💾 Αποθήκευση')
    app.wait_saved()
    d = (date.today() + timedelta(days=20)).isoformat()
    app.go('/visits/new')
    app.page.fill('[name=visit_date]', d)
    app.page.fill('#vLodge', '32 · ΔΙΩΝΗ')
    app.page.dispatch_event('#vLodge', 'input')
    # γκρι πρόταση τόπου → πραγματικό κείμενο με Tab
    app.page.focus('#vLoc')
    app.page.keyboard.press('Tab')
    assert app.page.input_value('#vLoc') == 'Τεκτονικόν Μέγαρον Ιωαννίνων'
    app.page.focus('[name=notes]')
    app.page.keyboard.press('Tab')
    assert app.page.input_value('[name=notes]') == ''  # χωρίς πρόταση, μένει κενό
    rid = app.page.locator('[name=rep_id] option', has_text='Εκπρόσωπος').first.get_attribute('value')
    app.page.select_option('[name=rep_id]', rid)
    app.click('✉ Email προς Στοά')
    app.page.wait_for_selector('#cf')
    # Εκπροσώπηση: προς τον Γραμματέα της Στοάς· κοιν. ΕπΜΓρ., εκπρόσωπος, ΜΔ — από το πρότυπο «Εκπροσώπηση του Μεγάλου Διδασκάλου»
    # Εκπροσώπηση: Προς τον ΕπΜΓρ.· κοιν. Εκπρόσωπος και ΜΔ
    assert app.page.input_value('[name=to]') == 'secretary.pr.pwg.nglgreece@gmail.com'
    assert app.page.input_value('[name=cc]') == 'rep@example.com, gm@example.com'
    body = app.page.input_value('[name=body]')
    assert body.startswith('Αγαπητέ Αδ. Γραμματεύ,') and 'Στοάς ΔΙΩΝΗ υπ’ αρ. 32,' in body and 'ο εκπρόσωπος του Μεγάλου Διδασκάλου της Εθνικής Μεγάλης Στοάς της Ελλάδος, Λίαν Σεβάσμιος Αδ. Ιωάννης Εκπρόσωπος, Μέγας Καγκελάριος.' in body, body
    assert 'Κανόνα 123' in body and 'Κανόνα 144' in body and '{' not in body and 'την την' not in body
    assert 'Αγαπητέ Αδελφέ ΕπΜΓρ' not in body and 'Κοινοποιείται στον' not in body
    assert app.page.input_value('[name=subject]').startswith('Εκπροσώπηση ΜΔ εις την Στοάν «ΔΙΩΝΗ» υπ’ αριθμ. 32 ')
    vs = app.page.evaluate("async () => { const m = await import('./core/store.js'); return m.db.all('visits'); }")
    assert len(vs) == 1 and vs[0]['rep_id'] == int(rid) and vs[0]['location'] == 'Τεκτονικόν Μέγαρον Ιωαννίνων'
    app.go(f"/visits/edit/{vs[0]['id']}")
    app.click('📄 Επιστολή (αρ. πρωτοκόλλου)')
    app.page.wait_for_selector('#lf')
    em = app.page.input_value('[name=recipient_email]')
    assert 'gm@example.com' in em and 'rep@example.com' in em
    assert app.page.input_value('[name=recipient_name]').startswith('ΕπΜΓρ.')
    assert app.page.input_value('[name=cc_name]') == 'Λίαν Σεβάσμιος Αδ. Ιωάννης Εκπρόσωπος, Μέγας Καγκελάριος\nrep@example.com'
    app.click('👁 Προεπισκόπηση')
    assert 'Κοιν.: Λίαν Σεβάσμιος Αδ. Ιωάννης Εκπρόσωπος, Μέγας Καγκελάριος\nrep@example.com' in app.text('#pv .paper')
    assert 'Εκπροσώπηση του Μεγάλου Διδασκάλου' in app.page.locator('#tplSel option:checked').inner_text()
    assert 'Λίαν Σεβάσμιος Αδ. Ιωάννης Εκπρόσωπος' in app.page.input_value('[name=body]')
    assert app.page.input_value('[name=closing]') == 'Με εκτίμηση και αδελφική αγάπη,'


def test_province_summary_and_lodges_without_installation_date(app):
    app.connect_local()
    app.go('/visits')
    t = app.text()
    # Πίνακας 2026–2027: 74 Εγκαταστάσεις, 2 πριν από τον Σεπτέμβριο 2026 → 72 Στοές με ημερομηνία στο τεκτονικό έτος
    opts = app.page.locator('[name=prov] option').all_inner_texts()
    assert any(o.startswith('ΕπΜΣτ. Αθηνών — ') and 'δήλωσαν' in o for o in opts)
    assert 'Σύνοψη Επαρχιών' in t and 'Στοές χωρίς ημερομηνία (' in t
    s = app.page.evaluate("async () => { const m = await import('./modules/visits.js'); return m.provinceSummary(m.masonicYear('2026-10-07')); }")
    tot = sum(o['total'] for o in s); dec = sum(o['declared'] for o in s)
    assert tot == 82 and dec == 73  # 86 Στοές − 4 ανενεργές
    ath = [o for o in s if o['prov'] == 'ΕπΜΣτ. Αθηνών'][0]
    assert {l['number'] for l in ath['missing']} >= {'17', '108', '105'}
    app.click('⚠ Στοές χωρίς ημερομηνία')
    app.page.wait_for_url('**/#/visits/missing*')
    assert 'ΑΝΑΓΕΝΝΗΣΙΣ' in app.text() and 'Τεκτονικό έτος 2026–2027' in app.text()
    app.page.select_option('#mProv', 'ΕπΜΣτ. Αθηνών')
    app.page.wait_for_url('**prov=*')
    assert all('Αθηνών' in h for h in app.page.locator('main h2').all_inner_texts())
    app.page.locator('a:has-text("+ Ημερομηνία")').first.click()
    app.page.wait_for_selector('#vf')
    assert app.page.input_value('#vNo')


def test_installation_69_moved_to_2027_in_existing_database(app):
    gh = MockGitHub()
    gh.ref = gh.put_commit(gh.put_tree({}), [], 'init')
    gh.external_commit('data/visits.json', json.dumps([{'id': 1, 'visit_date': '2026-01-04', 'lodge': 'ΑΝΤΙΠΛΟΙΑΡΧΟΣ ΒΛΑΧΑΚΟΣ', 'lodge_number': '69', 'location': '', 'province': '', 'rep_id': None, 'notes': 'Η ημερομηνία δόθηκε ως 04/01/26.'}], ensure_ascii=False))
    gh.external_commit('data/settings.json', json.dumps({'closing': 'x'}))
    connect_github(app, gh)
    app.page.wait_for_selector('.dash')
    vs = [v for v in gh.read_json('data/visits.json') if v['lodge_number'] == '69']
    assert [(v['visit_date'], v['notes']) for v in vs] == [('2027-01-04', '')]


def test_namedays_empty_range_explains(app):
    app.connect_local()
    add_member(app, surname='Εορτάζων', first='Δημήτριος', email='d@example.com', mobile='')
    y = date.today().year
    app.go(f'/namedays?frm={y}-10-07&to={y}-10-21')
    t = app.text()
    assert 'Κανένα ενεργό μέλος' in t and 'Λουκάς (18/10)' in t and 'Σέργιος (07/10)' in t
    assert 'Επόμενοι εορτάζοντες: 26/10 Δημήτριος (1)' in t


def test_decree_live_preview(app):
    app.connect_local()
    add_member(app)
    app.go('/decrees/new')
    pv = lambda: app.page.locator('#dprev').inner_text()
    app.page.wait_for_function("() => document.querySelector('#dprev .paper')")
    assert 'ΔΙΑΤΑΓΜΑ' in pv() and '513/' in pv() and 'περί ……' in pv()
    app.page.fill('[name=matter]', 'διορισμού Μεγάλων Αξιωματικών')
    app.page.wait_for_function("() => document.querySelector('#dprev').innerText.includes('περί διορισμού Μεγάλων Αξιωματικών')")
    app.page.select_option('#dOffice', 'Μέγας Γραμματεύς')
    app.page.wait_for_function("() => document.querySelector('#dprev').innerText.includes('ΜΕΓΑΝ ΓΡΑΜΜΑΤΕΑ')")
    app.pick('.registry-search', 'Παπαδ')
    app.page.wait_for_function("() => document.querySelector('#dprev').innerText.includes('Παπαδόπουλον')")
    assert 'Κανόνα 22' in pv()
    app.page.select_option('#dAction', 'service_award')
    app.page.wait_for_function("() => document.querySelector('#dprev').innerText.includes('ΕΥΑΡΕΣΤΟΥΜΕΘΑ')")
    assert 'υπ’ αριθ. 513/' in pv()


def test_visit_candidates_from_epeteirida(app):
    app.connect_local()
    paste = ('Ονοματεπώνυμο\tΒαθμός Μεγ. Αξιωματικού\tΔιάταγμα διορισμού\tΈτος\tΕν Ενεργεία Αξίωματικοί\n'
             'Υποψήφιος Νικόλαος\tΠρΜΞιφ\t414\t2024\tΜέγας Ευχέτης 502/2026\n'
             "Παλαιός Γεώργιος\tΠρΑ'ΜΕπ\t362\t2021\t\n")
    app.go('/epeteirida')
    app.page.locator('details.fold summary', has_text='Εισαγωγή καταλόγου').click()
    app.page.fill('#epimp [name=paste]', paste)
    app.page.locator('#epimp button').click()
    app.page.wait_for_selector('text=Επετηρίδα: 2 Μεγάλοι Αξιωματικοί')
    app.go('/visits')
    sel = app.page.locator('.vrepsel').first
    groups = sel.locator('optgroup').evaluate_all('gs => gs.map(g => [g.label, [...g.children].map(o => o.textContent)])')
    labels = dict((g, o) for g, o in groups)
    assert labels['Μέγας Διδάσκαλος'][0].startswith('Μπενετάτος Ιωάννης — Μέγας Διδάσκαλος')
    assert labels['Εν ενεργεία Μεγάλοι Αξιωματικοί'][0].startswith('Υποψήφιος Νικόλαος — Μέγας Ευχέτης · Πρώην Μέγας Ξιφοφόρος · ΛΣεβ. · 2026')
    assert labels['Πρώην Μεγάλοι Αξιωματικοί'][0].startswith('Παλαιός Γεώργιος — Πρώην Πρώτος Μέγας Επόπτης · Πσεβ. · 2021')
    vid = sel.get_attribute('data-id')
    sel.select_option(label=labels['Εν ενεργεία Μεγάλοι Αξιωματικοί'][0])
    app.page.wait_for_selector('text=Ορίστηκε: Λίαν Σεβάσμιος Αδ. Υποψήφιος')
    st = app.page.evaluate(f"async () => {{ const m = await import('./core/store.js'); return [m.db.get('visits', {vid}), m.db.all('reps')]; }}")
    v, reps = st
    r = [x for x in reps if x['surname'] == 'Υποψήφιος'][0]
    assert v['rep_id'] == r['id'] and r['office'].startswith('Μέγας Ευχέτης') and 'Πρώην Μέγας Ξιφοφόρος' in r['office']
    # μετά την καταχώριση εμφανίζεται μία φορά (ως εκπρόσωπος, όχι ξανά από την Επετηρίδα)
    app.go('/visits')
    texts = app.page.locator('.vrepsel').first.locator('option').all_inner_texts()
    assert sum('Υποψήφιος' in t for t in texts) == 1


def test_epeteirida_excel_file_and_active_officers_list(app, tmp_path):
    import openpyxl
    app.connect_local()
    add_member(app, surname='Δοκιμαστής', first='Ανδρέας', email='a@example.com', mobile='6900000011')
    # αρχείο Excel όπως το «Επετηρίδα 2026»: πρώτο φύλλο συγκεντρωτικό, φύλλο «Πηγή» με τα στοιχεία
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Τάξις και προβάδισμα'; ws.append(['ΕΠΕΤΗΡΙΔΑ'])
    src = wb.create_sheet('Πηγή')
    src.append(['Ονοματεπώνυμο', 'Βαθμός Μεγ. Αξιωματικού', 'Διάταγμα διορισμού', 'Έτος', 'Εν ενεργεία αξίωμα', 'Μεταβολή'])
    src.append(['Δοκιμαστής Ανδρέας', 'ΠρΜΞιφ', '414', '2024', 'Μέγας Γραμματεύ 502/2026', None])
    src.append(['Παλαιός Ηλίας', "ΠρΑ'ΜΕπ", '362', '2021', None, None])
    f = tmp_path / 'ep.xlsx'; wb.save(f)
    app.go('/epeteirida')
    app.page.locator('details.fold summary', has_text='Εισαγωγή καταλόγου').click()
    app.page.set_input_files('#epimp [name=file]', str(f))
    app.page.locator('#epimp button').click()
    app.page.wait_for_selector('text=Επετηρίδα: 2 Μεγάλοι Αξιωματικοί')
    # κατάλογος εν ενεργεία (νεότερος): ο Δοκιμαστής είναι πλέον Επαρχιακός ΜΔ Πειραιώς, Πσεβ.
    active = ('Τάξις\tΑξίωμα\tΒαθμός / Τίτλος\tΟνοματεπώνυμο\tΔιάταγμα\n1\tΜέγας Διδάσκαλος\tΣεβτ\tΜπενετάτος Ιωάννης\t2024\n'
              '9\tΕπαρχιακός Μ.Δ. Πειραιώς\tΠσεβ\tΔοκιμαστής Ανδρέας\t511/2026\n51\tΔεύτερος Μέγας Διάκονος\tΣεβ\tΝέος Πέτρος\t502/2026\n')
    app.go('/epeteirida')
    app.page.locator('details.fold summary', has_text='Εισαγωγή καταλόγου').click()
    app.page.fill('#epimp [name=paste]', active)
    app.page.locator('#epimp button').click()
    app.page.wait_for_selector('text=Εν ενεργεία Μεγάλοι Αξιωματικοί: 3')
    t = app.text('.tablecard')
    assert 'Επαρχιακός Μέγας Διδάσκαλος' in t and 'Δεύτερος Μέγας Διάκονος' in t and 'Μέγας Γραμματεύς' not in t  # μόνο ο νέος κατάλογος
    reps = {r['surname']: r for r in app.page.evaluate("async () => (await import('./core/store.js')).db.all('reps')")}
    assert reps['Δοκιμαστής']['office'] == 'Επαρχιακός Μέγας Διδάσκαλος' and reps['Δοκιμαστής']['rep_rank'] == 'Πανσεβάσμιος Αδ.' and reps['Δοκιμαστής']['member_id']
    assert reps['Νέος']['office'] == 'Δεύτερος Μέγας Διάκονος' and reps['Νέος']['rep_rank'] == 'Σεβάσμιος Αδ.'
    assert len([r for r in reps.values() if r['surname'] == 'Μπενετάτος']) == 1
    # στις Εγκαταστάσεις: ο Παλαιός (μόνο Επετηρίδα) εμφανίζεται στους Πρώην
    app.go('/visits')
    groups = dict(app.page.locator('.vrepsel').first.locator('optgroup').evaluate_all('gs => gs.map(g => [g.label, [...g.children].map(o => o.textContent)])'))
    assert any('Δοκιμαστής' in o for o in groups['Εν ενεργεία Μεγάλοι Αξιωματικοί'])
    assert any('Παλαιός Ηλίας' in o for o in groups['Πρώην Μεγάλοι Αξιωματικοί'])
    # νέος κατάλογος χωρίς τον Νέο → γίνεται «Πρώην»
    app.go('/epeteirida')
    app.page.locator('details.fold summary', has_text='Εισαγωγή καταλόγου').click()
    app.page.fill('#epimp [name=paste]', '\n'.join(active.split('\n')[:3]))
    app.page.locator('#epimp button').click()
    app.page.wait_for_selector('text=Εν ενεργεία Μεγάλοι Αξιωματικοί: 2')
    reps = {r['surname']: r for r in app.page.evaluate("async () => (await import('./core/store.js')).db.all('reps')")}
    assert reps['Νέος']['office'] == 'Πρώην Δεύτερος Μέγας Διάκονος'


def test_visit_card_email_and_letter_buttons(app):
    app.connect_local()
    app.page.evaluate("async () => { const m = await import('./core/store.js'); await m.db.save('x', (tx) => { tx.replace('visits', []); tx.setting('gm_email', 'gm@example.com'); }); }")
    app.go('/reps/new').fill(name='Πέτρος', surname='Αντιπρόσωπος', office='Μέγας Ευχέτης', email='rep2@example.com')
    app.click('💾 Αποθήκευση')
    app.wait_saved()
    rid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('reps').find((r) => r.surname === 'Αντιπρόσωπος').id")
    d = (date.today() + timedelta(days=15)).isoformat()
    app.page.evaluate(f"async () => {{ const m = await import('./core/store.js'); await m.db.save('x', (tx) => tx.insert('visits', {{ visit_date: '{d}', lodge: 'ΔΙΩΝΗ', lodge_number: '32', location: '', province: 'ΕπΜΣτ. Πελοποννήσου & Δυτικής Ελλάδας', rep_id: {rid}, notes: '' }})); }}")
    app.go('/visits')
    app.page.locator('.vcard a:has-text("📄 Επιστολή")').first.click()
    app.page.wait_for_selector('#lf')
    assert 'secretary.pr.pwg.nglgreece@gmail.com' in app.page.input_value('[name=recipient_email]') and 'rep2@example.com' in app.page.input_value('[name=recipient_email]')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    assert 'Αντιπρόσωπος' in app.text() and '20545' in app.text()
    app.go('/visits')
    app.page.locator('.vcard a:has-text("✉ Email προς Στοά (Εκπροσώπηση)")').first.click()
    app.page.wait_for_selector('#cf')
    app.click('✓ Σημείωση ως σταλμένο')
    app.page.wait_for_url('**/#/visits')
    assert 'Εκπρόσωπος ενημερώθηκε' in app.text() and 'ΕπΜΓρ. ενημερώθηκε' in app.text()


def test_single_member_pool_identify_merge_and_relink(app):
    # Μία δεξαμενή: οι λίστες δείχνουν στο μέλος· διπλές εγγραφές ενοποιούνται· τα στοιχεία διαβάζονται από το Μητρώο
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('seed', (tx) => {
        const a = tx.insert('member_registry', { registry_no: 80, surname: 'Διπλός', first_name: 'Αναστάσιος', email: 'a1@example.com', mobile: '', active: 1 });
        const b = tx.insert('member_registry', { registry_no: 81, surname: 'Διπλος', first_name: 'Αναστάσιος', email: 'a2@example.com', mobile: '6900000080', active: 1 });
        tx.insert('member_registry', { registry_no: 82, surname: 'ΔΙΠΛΟΣ', first_name: 'ΑΝΑΣΤΑΣΙΟΣ', email: '', mobile: '', active: 1 });
        tx.insert('member_registry', { registry_no: 90, surname: 'Συνώνυμος', first_name: 'Γεώργιος', email: 's1@example.com', mobile: '6911111111', active: 1 });
        tx.insert('member_registry', { registry_no: 91, surname: 'Συνώνυμος', first_name: 'Γεώργιος', email: 's2@example.com', mobile: '6922222222', active: 1 });
        tx.insert('member_lodges', { member_id: a.id, seq: 1, lodge_name: 'ΠΑΡΘΕΝΩΝ', lodge_number: '3', member_status: '1. ΤΑΚΤΙΚΟ' });
        tx.insert('member_lodges', { member_id: b.id, seq: 1, lodge_name: 'ΠΛΑΤΩΝ', lodge_number: '70', member_status: '1. ΤΑΚΤΙΚΟ' });
        tx.insert('reps', { name: 'Αναστάσιος', surname: 'Διπλός', office: 'Μέγας Ευχέτης', year: '2026', email: 'a2@example.com', mobile: '6900000080', rep_rank: '', member_id: null, notes: 'Άλλα email: a1@example.com', ext_id: '' });
        tx.insert('reps', { name: 'Γεώργιος', surname: 'Συνώνυμος', office: 'Μέγας Σημαιοφόρος', year: '2026', email: '', mobile: '', rep_rank: '', member_id: null, notes: '', ext_id: '' });
      }); }""")
    r = app.page.evaluate("""async () => { const P = await import('./core/people.js'), M = await import('./modules/members.js'), {db} = await import('./core/store.js');
      const main = P.identify({ full_name: 'Διπλός Αναστάσιος' }), syn = P.identify({ full_name: 'Συνώνυμος Γεώργιος' }), syn2 = P.identify({ full_name: 'Συνώνυμος Γεώργιος', mobile: '6922 222222' });
      const p = P.person(main);
      let n; await db.save('relink', (tx) => { n = M.relinkToPool(tx); });
      return { main, syn, syn2, regOfMain: db.get('member_registry', main).registry_no, emails: p.emails, lodges: p.lodges.map((l) => l.lodge_number).sort(), n, reps: db.all('reps') }; }""")
    assert r['regOfMain'] == 81  # η πληρέστερη εγγραφή (email + κινητό)
    assert sorted(r['emails']) == ['a1@example.com', 'a2@example.com'] and r['lodges'] == ['3', '70']
    assert r['syn'] is None and r['syn2'] is not None  # συνώνυμοι: μόνο με κινητό/email
    rep = [x for x in r['reps'] if x['surname'] == 'Διπλός'][0]
    assert rep['member_id'] == r['main'] and rep['email'] == '' and rep['mobile'] == '' and 'Άλλα email' not in rep['notes']
    # η επικοινωνία του εκπροσώπου έρχεται από το Μητρώο
    app.go('/reps')
    assert 'a2@example.com' in app.text() and '6900000080' in app.text()
    # σελίδα διπλών: 1 σίγουρη ομάδα (3 εγγραφές), 1 προς έλεγχο (συνώνυμοι)
    app.go('/members/duplicates')
    t = app.text()
    assert 'Σχεδόν σίγουρα το ίδιο πρόσωπο (1)' in t and 'διαφορετικό κινητό — ελέγξτε (1)' in t
    with app.page.expect_download():
        app.page.locator('[data-act=mergeAll]').click()
    app.page.wait_for_selector('text=Συγχωνεύθηκαν 2 διπλές εγγραφές σε 1 πρόσωπα')
    st = app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); return { ms: db.all('member_registry').filter((m) => /διπλ/i.test(m.surname.normalize('NFD').replace(/[\\u0300-\\u036f]/g, ''))), ls: db.all('member_lodges'), reps: db.all('reps') }; }""")
    assert len(st['ms']) == 1
    m = st['ms'][0]
    assert m['registry_no'] == 81 and 'a1@example.com' in m['other_emails'] and 'Αρ. Μητρώου 80' in m['merged_from'] and m['surname_variants'] == ''  # ίδιο όνομα με άλλους τόνους δεν είναι παραλλαγή
    assert sorted(l['lodge_number'] for l in st['ls'] if l['member_id'] == m['id']) == ['3', '70']
    assert [x for x in st['reps'] if x['surname'] == 'Διπλός'][0]['member_id'] == m['id']
    app.go(f"/members/{m['id']}")
    assert 'Εκπρόσωπος ΜΔ: Μέγας Ευχέτης' in app.text() and 'Συγχωνεύθηκαν: Αρ. Μητρώου 80' in app.text()


def test_grand_master_official_visit_letter_and_email(app):
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => { tx.replace('visits', []); tx.setting('gm_email', 'gm@example.com');
        const l = tx.find('lodges', (x) => x.number === '32'); tx.update('lodges', l.id, { secretary_email: 'dioni.secretary@example.com', secretary: 'Αδ. Γραμματέας Δοκιμής' });
        const gm = tx.find('reps', (r) => r.office === 'Μέγας Διδάσκαλος');
        tx.insert('visits', { visit_date: '2027-10-16', lodge: 'ΔΙΩΝΗ', lodge_number: '32', location: '', province: 'ΕπΜΣτ. Πελοποννήσου & Δυτικής Ελλάδας', rep_id: gm.id, notes: 'Ώρα 19:30' }); }); }""")
    app.go('/visits')
    assert 'Επίσημη επίσκεψη ΜΔ' in app.text()
    app.page.locator('.vcard a:has-text("✉ Email προς Στοά (Επίσημη Επίσκεψη)")').first.click()
    app.page.wait_for_selector('#cf')
    assert app.page.input_value('[name=to]') == 'dioni.secretary@example.com'
    assert app.page.input_value('[name=cc]') == 'secretary.pr.pwg.nglgreece@gmail.com, gm@example.com'
    assert app.page.input_value('[name=subject]') == 'Επίσημη Επίσκεψη ΜΔ εις την Στοάν «ΔΙΩΝΗ» υπ’ αριθμ. 32 το Σάββατο, 16 Οκτωβρίου 2027'
    body = app.page.input_value('[name=body]')
    for s in ['Αγαπητέ Αδ. Γραμματεύ,', 'εργασίες της Στοάς «ΔΙΩΝΗ» υπ’ αρ. 32, το Σάββατο, 16 Οκτωβρίου 2027, και ώρα συμφώνως με την πρόσκλησή σας, θα παραστεί επισήμως ο Μέγας Διδάσκαλος',
              'Σεβασμιώτατος Αδ. Ιωάννης Μπενετάτος.', 'Κανόνα 122', 'Κανόνα 144', 'Παρακαλούμε για την επιβεβαίωση λήψεως της παρούσης.', 'Κατ’ εντολήν του Μεγάλου Διδασκάλου,\nΜε εκτίμηση και αδελφική αγάπη,', 'Ο Μέγας Γραμματέας']:
        assert s in body, s
    assert 'εκπροσωπ' not in body.lower() and '{' not in body
    app.go('/visits')
    app.page.locator('.vcard a:has-text("📄 Επιστολή")').first.click()
    app.page.wait_for_selector('#lf')
    assert app.page.input_value('[name=recipient_name]') == 'τον Γραμματέα της Στοάς «ΔΙΩΝΗ» υπ’ αριθ. 32, Αδ. Γραμματέας Δοκιμής'
    assert 'Κατ’ εντολήν του Μεγάλου Διδασκάλου,' in app.page.input_value('[name=body]') and 'Ο Μέγας Γραμματέας' not in app.page.input_value('[name=body]')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    paper = app.text('.paper')
    assert 'Με εκτίμηση και αδελφική αγάπη,' in paper and 'Με αδελφικούς χαιρετισμούς' not in paper


def test_smart_template_gm_visit_filled_from_database(app):
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => { tx.replace('visits', []); tx.setting('gm_email', 'gm@example.com');
        const l = tx.find('lodges', (x) => x.number === '32'); tx.update('lodges', l.id, { secretary_email: 'dioni.secretary@example.com', secretary: '' });
        tx.insert('visits', { visit_date: '2099-03-17', lodge: 'ΔΙΩΝΗ', lodge_number: '32', location: '', province: 'ΕπΜΣτ. Πελοποννήσου & Δυτικής Ελλάδας', rep_id: null, notes: '' }); }); }""")
    tpl = app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); return db.all('letter_templates').filter((t) => t.key === 'gm-visit'); }""")
    assert len(tpl) == 1 and '{Στοά}' in tpl[0]['body'] and '{ημερομηνία}' in tpl[0]['body'] and tpl[0]['name'] == 'Επίσημη επίσκεψη του Μεγάλου Διδασκάλου'
    app.go('/templates')
    assert '⚙ από τη βάση' in app.text()
    app.go('/letters/new')
    assert app.page.locator('#fillBox').is_hidden()
    app.page.select_option('#tplSel', str(tpl[0]['id']))
    assert app.page.locator('#fillBox').is_visible()
    assert '{Στοά}' in app.page.input_value('[name=body]')  # ακόμη χωρίς στοιχεία
    # από Επίσκεψη
    app.page.select_option('#fillVisit', label='17/03/2099 — «ΔΙΩΝΗ» αρ. 32')
    body = app.page.input_value('[name=body]')
    assert 'της Στοάς «ΔΙΩΝΗ» υπ’ αρ. 32, την Τρίτη, 17 Μαρτίου 2099, και ώρα' in body and '{' not in body, body
    assert app.page.input_value('[name=subject]') == 'Επίσημη Επίσκεψη ΜΔ εις την Στοάν «ΔΙΩΝΗ» υπ’ αριθμ. 32 την Τρίτη, 17 Μαρτίου 2099'
    assert app.page.input_value('[name=recipient_email]') == 'dioni.secretary@example.com, secretary.pr.pwg.nglgreece@gmail.com, gm@example.com'
    assert app.page.input_value('[name=recipient_name]') == 'τον Γραμματέα της Στοάς «ΔΙΩΝΗ» υπ’ αριθ. 32'
    assert app.page.input_value('[name=closing]') == 'Με εκτίμηση και αδελφική αγάπη,' and app.page.input_value('[name=category]') == 'ΕΠΙΣΚΕΨΗ'
    # από Στοά + ημερομηνία (Σάββατο → «το Σάββατο»)
    app.page.fill('#fillLodge', '1 · ΠΑΛΑΙΩΝ ΠΑΤΡΩΝ ΓΕΡΜΑΝΟΣ')
    app.page.dispatch_event('#fillLodge', 'change')
    app.page.fill('#fillDate', '2099-03-21')
    app.page.dispatch_event('#fillDate', 'change')
    body = app.page.input_value('[name=body]')
    assert '«ΠΑΛΑΙΩΝ ΠΑΤΡΩΝ ΓΕΡΜΑΝΟΣ» υπ’ αρ. 1, το Σάββατο, 21 Μαρτίου 2099,' in body, body
    assert app.page.input_value('#fillVisit') == ''
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/*')
    assert 'ΕΠΙΣΚΕΨΗ' in app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); return db.all('letters').at(-1).category; }""")


def test_invite_link_login_with_email_and_password(app, browser, base_url):
    gh = MockGitHub()
    connect_github(app, gh)
    app.page.wait_for_selector('.dash')
    app.go('/settings')
    app.page.fill('#invForm [name=email]', 'User@Example.com')
    app.page.fill('#invForm [name=password]', 'Dokimi-2026x')
    app.page.fill('#invForm [name=password2]', 'Dokimi-2026x')
    app.page.locator('#invForm button').click()
    app.page.wait_for_selector('#invLink', timeout=20000)
    link = app.page.input_value('#invLink')
    assert '#/login?invite=' in link and 'good-token' not in link
    # ο χρήστης σε δική του συσκευή
    ctx = browser.new_context()
    p = ctx.new_page()
    errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.route('https://api.github.com/**', gh.handle)
    p.goto(link.replace(link.split('#')[0], base_url))
    p.wait_for_selector('#lgForm')
    assert p.input_value('[name=email]') == 'user@example.com'
    p.fill('[name=password]', 'λάθος-κωδικός1')
    p.locator('#lgForm button').click()
    p.wait_for_selector('text=Λάθος email ή κωδικός', timeout=20000)
    p.fill('[name=password]', 'Dokimi-2026x')
    p.locator('#lgForm button').click()
    p.wait_for_selector('.dash', timeout=20000)
    stored = p.evaluate('() => JSON.stringify(localStorage)')
    assert 'good-token' not in stored  # το κλειδί μένει μόνο κλειδωμένο στη συσκευή
    p.reload()
    p.wait_for_selector('.dash', timeout=20000)  # ίδια συνεδρία
    # νέα καρτέλα/άνοιγμα browser: ζητά ξανά email + κωδικό
    p2 = ctx.new_page()
    p2.route('https://api.github.com/**', gh.handle)
    p2.goto(base_url + '#/members')
    p2.wait_for_selector('#lgForm')
    assert not errs, errs
    ctx.close()


GSI_FAKE = """window.google = { accounts: { oauth2: { initTokenClient: (o) => ({ requestAccessToken: () => setTimeout(() => o.callback({ access_token: 'g-token', expires_in: 3600 }), 10) }) } } };"""


def test_letter_and_decree_saved_to_drive_word_and_pdf(app):
    uploads = []

    def gapi(route, request):
        if request.method == 'GET':
            return route.fulfill(json={'files': []})
        body = request.post_data_buffer or b''
        name = re.search(rb'"name":"([^"]+)"', body).group(1).decode()
        uploads.append({'name': name, 'auth': request.headers.get('authorization'), 'pdf': b'%PDF' in body, 'docx': b'PK' in body, 'parents': b'1kKR7v86jjs5QJE9-K5uUebvS6nZd9J03' in body})
        return route.fulfill(json={'id': f'f{len(uploads)}', 'webViewLink': f'https://drive.google.com/file/d/f{len(uploads)}/view'})
    app.page.route('https://accounts.google.com/gsi/client', lambda r: r.fulfill(body=GSI_FAKE, content_type='text/javascript'))
    app.page.route('https://www.googleapis.com/**', gapi)
    app.connect_local()
    app.page.evaluate("async () => { const {db} = await import('./core/store.js'); await db.save('x', (tx) => tx.setting('google_client_id', 'test.apps.googleusercontent.com')); }")
    add_member(app)
    app.go('/letters/new').fill(recipient_name='ΕπΜΓρ. Δοκιμής', recipient_email='t@example.com', subject='Πρόσκληση σε σύσκεψη', body='Κείμενο.')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    assert '20545' in app.text() and '«20545 - ΕΠΙΣΤΟΛΗ Πρόσκληση σε σύσκεψη»' in app.text()
    app.page.locator('[data-act=drive]').click()
    app.page.wait_for_selector('text=✓ Στο Drive', timeout=30000)
    assert [u['name'] for u in uploads] == ['20545 - ΕΠΙΣΤΟΛΗ Πρόσκληση σε σύσκεψη.docx', '20545 - ΕΠΙΣΤΟΛΗ Πρόσκληση σε σύσκεψη.pdf']
    assert all(u['auth'] == 'Bearer g-token' and u['parents'] for u in uploads) and uploads[0]['docx'] and uploads[1]['pdf']
    # Διάταγμα: ίδιο πρωτόκολλο, κατηγορία ΔΙΑΤΑΓΜΑ
    app.go('/decrees/new')
    app.fill(matter='διορισμού Μεγάλων Αξιωματικών')
    app.page.select_option('#dOffice', 'Μέγας Γραμματεύς')
    app.pick('.registry-search', 'Παπαδ')
    app.click('Έκδοση Διατάγματος')
    app.page.wait_for_url('**/#/decrees/1')
    app.click('✅ Έτοιμο: απόδοση αρ. πρωτοκόλλου')
    app.page.wait_for_selector('text=πήρε αριθμό πρωτοκόλλου')
    app.page.locator('[data-act=drive]').click()
    app.page.wait_for_selector('text=✓ Στο Drive', timeout=30000)
    y = date.today().year
    assert uploads[2]['name'] == f'20546 - ΔΙΑΤΑΓΜΑ 513-{y} διορισμού Μεγάλων Αξιωματικών.docx' or uploads[2]['name'].startswith('20546 - ΔΙΑΤΑΓΜΑ 513')
    assert uploads[3]['name'].endswith('.pdf') and uploads[3]['pdf']
    # Επιστολή από Επίσκεψη → κατηγορία ΕΠΙΣΚΕΨΗ
    app.go('/visits')
    rid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('reps')[0].id")
    vid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('visits').find((v) => v.visit_date >= '2026-10-08').id")
    app.page.evaluate(f"async () => {{ const {{db}} = await import('./core/store.js'); await db.save('x', (tx) => tx.update('visits', {vid}, {{ rep_id: {rid} }})); }}")
    app.go('/visits')
    app.page.locator('.vcard a:has-text("📄 Επιστολή")').first.click()
    app.page.wait_for_selector('#lf')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/2')
    assert '20547' in app.text() and '«20547 - ΕΠΙΣΚΕΨΗ ' in app.text()


def test_letter_recipient_gets_member_title(app):
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => {
        const a = tx.insert('member_registry', { surname: 'Τιτλοδοκιμάκης', first_name: 'Αριστείδης', email: 'aris@example.com', active: 1 });
        tx.insert('member_degrees_offices', { member_id: a.id, full_name: 'Τιτλοδοκιμάκης Αριστείδης', office: 'Πρώην Μέγας Ξιφήρης', honorific: 'Πσεβ. Αδ.', decree_year: 2019 });
        tx.insert('member_registry', { surname: 'Απλοδοκιμάκης', first_name: 'Βασίλειος', email: 'vas@example.com', active: 1 }); }); }""")
    app.go('/letters/new')
    app.pick('#rcptPick', 'Τιτλοδοκιμ')
    assert app.page.input_value('[name=recipient_name]') == 'Πσεβ. Αδ. Αριστείδης Τιτλοδοκιμάκης'
    assert app.page.input_value('[name=recipient_email]') == 'aris@example.com'
    app.pick('#rcptPick', 'Απλοδοκιμ')
    assert app.page.input_value('[name=recipient_name]') == 'Αδ. Βασίλειος Απλοδοκιμάκης'


def test_long_letter_prints_on_one_page(app):
    app.connect_local()
    long_body = '\n\n'.join(f'Παράγραφος {i}. ' + 'Κείμενο δοκιμής για μεγάλη επιστολή που ξεπερνά τη σελίδα. ' * 6 for i in range(1, 16))
    app.page.evaluate("""async (b) => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => tx.insert('letters', { protocol_seq: 20999, protocol_no: '20999', letter_date: '2026-10-08', subject: 'Μεγάλη', body: b, status: 'draft', signer: 'dimitrios' })); }""", long_body)
    lid = app.page.evaluate("async () => { const {db} = await import('./core/store.js'); return db.all('letters').at(-1).id; }")
    app.go(f'/letters/{lid}')
    app.page.wait_for_function("() => document.querySelector('.print-area .paper')?.dataset.fit")
    fit = float(app.page.evaluate("() => document.querySelector('.print-area .paper').dataset.fit"))
    assert 0.3 < fit < 1, fit
    app.page.emulate_media(media='print')
    app.page.evaluate("() => dispatchEvent(new Event('beforeprint'))")  # όπως ο browser πριν την εκτύπωση
    pdf = app.page.pdf(format='A4', print_background=True)
    assert pdf.count(b'/Type /Page\n') + pdf.count(b'/Type /Page ') + pdf.count(b'/Type/Page') + pdf.count(b'/Type /Page/') == 1, pdf.count(b'/Page')
    # από κινητό: ίδια μία σελίδα
    app.page.emulate_media(media='screen')
    app.page.set_viewport_size({'width': 390, 'height': 800})
    app.page.reload()
    app.page.wait_for_selector('.print-area .paper')
    app.page.wait_for_timeout(300)
    app.page.emulate_media(media='print')
    app.page.evaluate("() => dispatchEvent(new Event('beforeprint'))")
    pdf = app.page.pdf(format='A4', print_background=True)
    assert pdf.count(b'/Type /Page\n') + pdf.count(b'/Type /Page ') + pdf.count(b'/Type/Page') == 1
    app.page.emulate_media(media='screen')
    app.page.set_viewport_size({'width': 1280, 'height': 900})
    # PDF για το Drive: μία σελίδα
    n = app.page.evaluate("""async () => { const {paperPdf} = await import('./core/pdf.js');
      const b = await paperPdf(document.querySelector('.print-area .paper')); const t = new TextDecoder('latin1').decode(await b.arrayBuffer());
      return (t.match(/\\/Type \\/Page[^s]/g) || []).length; }""")
    assert n == 1, n


def test_protocol_only_when_letter_is_ready(app):
    app.connect_local()
    app.go('/letters/new')
    app.fill(subject='Πρόχειρη Α', body='Κείμενο')
    app.click('💾 Αποθήκευση')
    app.page.wait_for_url('**/#/letters/1')
    assert 'θα δοθεί όταν οριστεί «Έτοιμη»' in app.text()
    app.go('/letters/new')
    app.fill(subject='Δεύτερη', body='Κείμενο')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/2')
    assert 'Αρ. Πρωτ.: 20545' in app.text()  # η πρόχειρη δεν δέσμευσε αριθμό
    app.go('/letters/1')
    app.click('✅ Έτοιμη: απόδοση αρ. πρωτοκόλλου')
    app.page.wait_for_selector('text=πήρε αριθμό πρωτοκόλλου')
    assert 'Αρ. Πρωτ.: 20546' in app.text()
    seqs = app.page.evaluate("async () => { const {db} = await import('./core/store.js'); return db.all('letters').map((l) => l.protocol_seq); }")
    assert seqs == [20546, 20545], seqs


def test_template_representative_field_and_day_article(app):
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => { tx.replace('visits', []);
        const l = tx.find('lodges', (x) => x.number === '32'); tx.update('lodges', l.id, { secretary_email: 'dioni.secretary@example.com' });
        const r = tx.insert('reps', { surname: 'Νικολαΐδης', name: 'Αθανάσιος', office: 'Βοηθός Μέγας Διδάσκαλος', rep_rank: 'Πανσεβάσμιος Αδ.', email: 'rep@example.com' });
        tx.insert('visits', { visit_date: '2099-10-09', lodge: 'ΔΙΩΝΗ', lodge_number: '32', location: '', province: 'ΕπΜΣτ. Πελοποννήσου & Δυτικής Ελλάδας', rep_id: r.id, notes: '' });
        tx.insert('letter_templates', { name: 'Εκπροσώπηση', active: 1, body: 'Κατ’ εντολήν του Μεγάλου Διδασκάλου, κατά τις εργασίες της Στοάς {Στοά} υπ’ αρ. {Αρ. Στοάς}, την  {ημέρα}, {ημερομηνία}, θα παραστεί επισήμως ο εκπρόσωπος του Μεγάλου Διδασκάλου, {Εκπρόσωπος}.' }); }); }""")
    app.go('/templates/new')
    assert '{Εκπρόσωπος} = ο Εκπρόσωπος της Επίσκεψης' in app.text()
    app.go('/templates')
    assert app.page.locator('table th').first.inner_text().strip() == 'Αρ.'
    app.go('/letters/new')
    app.page.select_option('#tplSel', label=app.page.locator('#tplSel option', has_text='. Εκπροσώπηση').last.inner_text())
    # Στοά + ημερομηνία → βρίσκει την Επίσκεψη και τον Εκπρόσωπό της
    app.page.fill('#fillLodge', '32 · ΔΙΩΝΗ'); app.page.dispatch_event('#fillLodge', 'change')
    app.page.fill('#fillDate', '2099-10-09'); app.page.dispatch_event('#fillDate', 'change')
    body = app.page.input_value('[name=body]')
    assert 'υπ’ αρ. 32, την Παρασκευή, 9 Οκτωβρίου 2099, θα παραστεί' in body, body
    assert 'Μεγάλου Διδασκάλου, Πανσεβάσμιος Αδ. Αθανάσιος Νικολαΐδης, Βοηθός Μέγας Διδάσκαλος.' in body, body
    assert 'rep@example.com' in app.page.input_value('[name=recipient_email]')


def test_old_visit_letter_link_uses_representation_template(app):
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => { tx.replace('visits', []);
        const r = tx.insert('reps', { surname: 'Νικολαΐδης', name: 'Αθανάσιος', office: 'Βοηθός Μέγας Διδάσκαλος', rep_rank: 'Πανσεβάσμιος Αδ.', email: 'rep@example.com' });
        tx.insert('visits', { visit_date: '2099-10-09', lodge: 'ΔΙΩΝΗ', lodge_number: '32', location: '', province: 'ΕπΜΣτ. Πελοποννήσου & Δυτικής Ελλάδας', rep_id: r.id, notes: '' }); }); }""")
    from urllib.parse import urlencode
    q = urlencode({'to_name': 'ΕπΜΓρ. · Χ', 'subject': 'Εκπροσώπηση ΜΔ — Εγκατάσταση Σεβασμίου Σ.Σ. «ΔΙΩΝΗ» Αρ. 32 — Παρασκευή 09/10/2099',
                   'body': 'Αγαπητέ Αδελφέ ΕπΜΓρ.,\n\nΣας γνωρίζουμε ότι … θα εκπροσωπήσουν οι κάτωθι Αδελφοί:\n\nΚοινοποιείται στον …', 'category': 'ΕΠΙΣΚΕΨΗ'})
    app.go('/letters/new?' + q)
    body = app.page.input_value('[name=body]')
    assert body.startswith('Αγαπητέ Αδ. Γραμματεύ,') and 'ΕπΜΓρ' not in body and 'Πανσεβάσμιος Αδ. Αθανάσιος Νικολαΐδης, Βοηθός Μέγας Διδάσκαλος.' in body, body
    assert 'Εκπροσώπηση του Μεγάλου Διδασκάλου' in app.page.locator('#tplSel option:checked').inner_text()


def test_visit_email_gmail_draft_with_pdf_and_bcc(app):
    drafts = []

    def gmail(route, request):
        drafts.append({'auth': request.headers.get('authorization'), 'json': json.loads(request.post_data or '{}')})
        return route.fulfill(json={'id': 'r-1', 'message': {'id': 'abc123'}})
    app.page.route('https://accounts.google.com/gsi/client', lambda r: r.fulfill(body=GSI_FAKE, content_type='text/javascript'))
    app.page.route('https://gmail.googleapis.com/**', gmail)
    app.page.context.route('https://mail.google.com/**', lambda r: r.fulfill(body='gmail', content_type='text/html'))
    app.page.on('dialog', lambda d: d.accept())
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => { tx.replace('visits', []); tx.setting('gm_email', 'gm@example.com'); tx.setting('google_client_id', 'test.apps.googleusercontent.com');
        tx.setting('visit_bcc', 'Α Β <b1@example.com>, rep@example.com, b2@example.com');
        const r = tx.insert('reps', { surname: 'Νικολαΐδης', name: 'Αθανάσιος', office: 'Βοηθός Μέγας Διδάσκαλος', rep_rank: 'Πανσεβάσμιος Αδ.', email: 'rep@example.com' });
        tx.insert('visits', { visit_date: '2099-10-09', lodge: 'ΔΙΩΝΗ', lodge_number: '32', location: '', province: 'ΕπΜΣτ. Πελοποννήσου & Δυτικής Ελλάδας', rep_id: r.id, notes: '' }); }); }""")
    app.go('/visits')
    app.page.locator('.vcard a:has-text("✉ Email προς Στοά (Εκπροσώπηση)")').first.click()
    app.page.wait_for_selector('.mailsheet .ms-head')
    assert app.page.input_value('[name=bcc]') == 'b1@example.com, b2@example.com'  # χωρίς τον εκπρόσωπο (ήδη σε Κοιν.)
    assert 'info@nglgreece.gr' in app.text('.mailsheet')
    with app.page.expect_popup() as pop:
        app.page.locator('[data-ms=go]').click()
    app.page.wait_for_selector('text=Πρόχειρα', timeout=30000)
    assert len(drafts) == 1 and drafts[0]['auth'] == 'Bearer g-token'
    raw = drafts[0]['json']['message']['raw']
    mime = base64.urlsafe_b64decode(raw + '=' * (-len(raw) % 4)).decode()
    assert 'From: info@nglgreece.gr' in mime and 'To: secretary.pr.pwg.nglgreece@gmail.com' in mime
    assert 'Cc: rep@example.com, gm@example.com' in mime and 'Bcc: b1@example.com, b2@example.com' in mime
    assert 'Content-Type: application/pdf' in mime and "filename*=UTF-8''20545%20-%20%CE%95%CE%A0%CE%99%CE%A3%CE%9A%CE%95%CE%A8%CE%97" in mime
    pdf_b64 = mime.split("filename*=UTF-8''")[1].split('\r\n\r\n', 1)[1].split('\r\n--')[0].replace('\r\n', '')
    assert base64.b64decode(pdf_b64)[:4] == b'%PDF'
    pop.value.wait_for_url('**/mail.google.com/**')
    assert pop.value.url.startswith('https://mail.google.com/mail/u/info%40nglgreece.gr/#drafts?compose=abc123'), pop.value.url
    # η επιστολή της Επίσκεψης καταχωρίστηκε Έτοιμη με αρ. πρωτοκόλλου
    ls = app.page.evaluate("async () => (await import('./core/store.js')).db.all('letters')")
    assert len(ls) == 1 and ls[0]['status'] == 'ready' and ls[0]['protocol_seq'] == 20545 and ls[0]['visit_id']
    # στην προβολή της επιστολής: ίδια καρτέλα Gmail
    app.go(f"/letters/{ls[0]['id']}")
    app.page.wait_for_selector('.mailsheet .ms-head')
    assert 'b1@example.com' in app.text('.mailsheet')


EP_TSV = '\n'.join([
    'Α/Α\tΕΝΕΡΓΟΣ\tΤίτλος αξιώματος κατά το Σύνταγμα\tΠροσφώνηση\tΟνοματεπώνυμο\tΑνώτατο αξίωμα / βαθμός\tΕΠΑΡΧΙΑ / ΣΤΟΑ Μ ΕΠΙΜ\tΑρ. διατάγματος ανώτατου αξιώματος\tΈτος ανώτατου βαθμού\tΤΜΔ\tΔΙΑΤΑΓΜΑ ΤΜΔ -ΕΤΟΣ\tΕν ενεργεία αξίωμα / διάταγμα',
    '1\tΝΑΙ\tΜέγας Ευχέτης\tΛίαν Σεβάσμιος\tΕπετηριδάκης Αλέξιος\tΜέγας Ευχέτης\t\t502\t2026\t\t\tΜέγας Ευχέτης 502/2026',
    '2\tΟΧΙ\tΠρώην Πρώτος Μέγας Επόπτης\tΠανσεβάσμιος\tΔοκιμαστής Βασίλειος\tΠρώην Πρώτος Μέγας Επόπτης\tΑΘΗΝΩΝ\t414\t2024\tΤΜΔ\t\t',
    '3\tΟΧΙ\tΠρώην Μέγας Ξιφοφόρος\tΛίαν Σεβάσμιος\tΆγνωστος Ξένος\tΠρώην Μέγας Ξιφοφόρος\t\t362\t2021\t\t\t',
])


def test_epeteirida_table_import_filters_edit_and_member(app):
    app.connect_local()
    mid = app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      return db.save('x', (tx) => { tx.insert('member_registry', { surname: 'Επετηριδάκης', first_name: 'Αλέξιος', active: 1 });
        return tx.insert('member_registry', { surname: 'Δοκιμαστής', first_name: 'Βασίλειος', email: 'dok@example.com', active: 1 }).id; }); }""")
    app.go('/epeteirida/pinakas')
    app.page.locator('summary:has-text("Εισαγωγή / αντικατάσταση")').click()
    app.page.fill('#epimp2 [name=paste]', EP_TSV)
    app.page.locator('#epimp2 button').click()
    app.page.wait_for_selector('text=3 εγγραφές · 2 συνδέθηκαν')
    assert 'Εμφανίζονται 3 από 3 · 2 συνδεδεμένοι' in app.text('#epcount')
    # δυναμικά φίλτρα: Ενεργός = ΝΑΙ, μετά αναζήτηση
    app.page.select_option('[data-s=active]', '1')
    assert 'Εμφανίζονται 1 από 3' in app.text('#epcount') and 'Επετηριδάκης' in app.text('#epg')
    app.page.click('[data-act=reset]')
    app.page.fill('[data-f=q]', '414')
    assert 'Εμφανίζονται 1 από 3' in app.text('#epcount') and 'Δοκιμαστής' in app.text('#epg')
    app.page.click('[data-act=reset]')
    app.page.select_option('[data-s=linked]', '0')
    assert 'Άγνωστος' in app.text('#epg') and 'Εμφανίζονται 1 από 3' in app.text('#epcount')
    app.page.click('[data-act=reset]')
    # επεξεργασία κελιού και αποθήκευση
    cell = app.page.locator('tr:has-text("Δοκιμαστής") [data-e=current]')
    cell.click(); cell.type('Μέγας Γραμματεύς 513/2026'); cell.press('Enter')
    assert app.page.locator('[data-act=save]').inner_text().strip() == '💾 Αποθήκευση αλλαγών (1)'
    app.page.click('[data-act=save]')
    app.page.wait_for_selector('text=Αποθηκεύτηκαν 1 αλλαγές')
    rows = app.page.evaluate("async () => (await import('./core/store.js')).db.all('epeteirida')")
    r = [x for x in rows if x['full_name'] == 'Δοκιμαστής Βασίλειος'][0]
    assert r['current'] == 'Μέγας Γραμματεύς 513/2026' and r['member_id'] == mid and r['tmd'] == 1 and r['decree_no'] == 414
    # στο μέλος: ανώτατο αξίωμα και διάταγμα· στη λίστα του Μητρώου· τίτλος «Πσεβ. Αδ.»
    app.go(f'/members/{mid}')
    t = app.text('.ep-member')
    assert 'Πρώην Πρώτος Μέγας Επόπτης' in t and '414/2024' in t and 'Πανσεβάσμιος' in t
    app.go('/members?q=Δοκιμαστής&field=surname')
    assert 'Πρώην Πρώτος Μέγας Επόπτης — Διάταγμα 414/2024' in app.text()
    app.go('/letters/new')
    app.pick('#rcptPick', 'Δοκιμαστ')
    assert app.page.input_value('[name=recipient_name]') == 'Πσεβ. Αδ. Βασίλειος Δοκιμαστής'


def test_rep_title_from_epeteirida_and_rep_label(app):
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => { tx.replace('visits', []);
        const m = tx.insert('member_registry', { surname: 'Χατζηδοκιμίου', first_name: 'Νικόλαος', email: 'nik@example.com', active: 1 });
        tx.insert('epeteirida', { aa: 1, active: 1, title: 'Αναπληρωτής Μέγας Γραμματεύς', honorific: 'Λίαν Σεβάσμιος', full_name: 'Χατζηδοκιμίου Νικόλαος', rank: 'Πρώην Μέγας Γραμματεύς', decree_no: 475, decree_year: 2025, member_id: m.id });
        const r = tx.insert('reps', { surname: 'Χατζηδοκιμίου', name: 'Νικόλαος', office: 'Αναπληρωτής Μέγας Γραμματεύς', rep_rank: 'Σεβάσμιος Αδ.', member_id: m.id });
        tx.insert('visits', { visit_date: '2099-10-09', lodge: 'ΔΙΩΝΗ', lodge_number: '32', location: '', province: 'ΕπΜΣτ. Πελοποννήσου & Δυτικής Ελλάδας', rep_id: r.id, notes: '' }); }); }""")
    app.go('/visits')
    assert app.page.locator('.vcard label.vreplabel').first.inner_text().strip() == 'ΕΚΠΡΟΣΩΠΟΣ'
    app.page.locator('.vcard a:has-text("📄 Επιστολή")').first.click()
    app.page.wait_for_selector('#lf')
    assert 'Λίαν Σεβάσμιος Αδ. Νικόλαος Χατζηδοκιμίου, Αναπληρωτής Μέγας Γραμματεύς' in app.page.input_value('[name=body]')
    assert app.page.input_value('[name=cc_name]').startswith('Λίαν Σεβάσμιος Αδ. Νικόλαος Χατζηδοκιμίου')
    assert 'Σεβάσμιος Αδ. Νικόλαος' not in app.page.input_value('[name=body]').replace('Λίαν Σεβάσμιος Αδ. Νικόλαος', '')
