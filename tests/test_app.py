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


def set_lodges(app, lodges):
    # πίνακας «Στοές του μέλους»: μία γραμμή ανά «ΟΝΟΜΑ | ΑΡΙΘΜΟΣ | ΚΑΤΑΣΤΑΣΗ [| ΙΔΙΟΤΗΤΑ | ΣΥΝΔΡΟΜΗ]»
    for i, line in enumerate(x for x in lodges.split('\n') if x.strip()):
        p = [x.strip() for x in line.split('|')] + [''] * 5
        rows = app.page.locator('#mlrows .ml-lodge')
        if rows.count() <= i:
            app.page.click('[data-act=addlodge]')
        r = rows.nth(i)
        r.locator('[data-k=number]').fill(p[1])
        r.locator('[data-k=name]').fill(p[0])
        r.locator('[data-k=status]').fill(p[2])
        if p[3]:
            r.locator('[data-k=capacity]').select_option(p[3])
        if p[4]:
            r.locator('[data-k=fee_rank]').select_option(p[4])


def add_member(app, surname='Παπαδόπουλος', first='Γεώργιος', email='g@example.com', mobile='6944123456', lodges='ΠΑΡΘΕΝΩΝ | 3 | 1. ΤΑΚΤΙΚΟ'):
    app.go('/members/new').fill(surname=surname, first_name=first, email=email, mobile=mobile)
    set_lodges(app, lodges)
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
    assert app.page.locator('.decbody [aria-label="ΔΙΟΡΙΖΟΜΕΝ"]').count() >= 1  # «ΔΙΟΡΙΖΟΜΕΝ» ως καλλιγραφική εικόνα
    for s in ['ΜΕΓΑΝ ΓΡΑΜΜΑΤΕΑ', 'τον Λίαν Σεβάσμιον Αδελφόν', 'Γεώργιον Παπαδόπουλον', 'λαβόντες υπ’ όψιν τον Κανόνα 22']:
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
    app.page.evaluate("async () => { const {db} = await import('./core/store.js'); await db.save('x', (tx) => { tx.setting('gm_email', 'gm@example.com'); tx.setting('greet_cc_rules', 'piraeus.secretary@nglgreece.gr => extra@example.com\\npiraeus.secretary@nglgreece.gr => cc: vis@example.com\\nnone@example.com => never@example.com'); }); }")
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
    MG = ['Ιανουαρίου', 'Φεβρουαρίου', 'Μαρτίου', 'Απριλίου', 'Μαΐου', 'Ιουνίου', 'Ιουλίου', 'Αυγούστου', 'Σεπτεμβρίου', 'Οκτωβρίου', 'Νοεμβρίου', 'Δεκεμβρίου']
    t = date.today()
    assert f'Αθήνα, {t.day} {MG[t.month - 1]} {t.year}' in sample and 'για την ονομαστική σας εορτή της ' in sample and '{' not in sample and '[b]' not in sample
    assert app.page.locator('#sample b', has_text='Σεβτ. Αδ. Ιωάννη Μπενετάτου').count() == 1 and app.page.locator('.richbar').count() == 1
    # Επετηρίδα: υπερισχύει στον τίτλο/προσφώνηση και στη γραφή του ονόματος
    app.page.evaluate("async () => { const {db} = await import('./core/store.js'); const m = db.all('member_registry').find((x) => x.surname === 'Εορτάζων');"
                      " await db.save('x', (tx) => tx.insert('epeteirida', { member_id: m.id, honorific: 'Πανσεβάσμιος', full_name: 'ΕΟΡΤΑΖΩΝ Νικόλαος' })); }")
    app.go('/namedays')
    app.go('/namedays/greet')
    app.page.wait_for_selector('#gBody')
    sample = app.text('#sample')
    assert 'Πσεβ. Αδ. Νικόλαος ΕΟΡΤΑΖΩΝ' in sample and 'Αγαπητέ Πανσεβάσμιε Αδελφέ' in sample, sample[:300]
    acc = app.page.evaluate("async () => { const m = await import('./modules/namedays.js'); return [m.accentName('Λουκας'), m.accentName('ΛΟΥΚΑΣ'), m.accentName('Ιωαννης-Γεωργιος'), m.accentName('Δομεστιχος'), m.accentName('Αγαπητος')]; }")
    assert acc == ['Λουκάς', 'ΛΟΥΚΑΣ', 'Ιωάννης-Γεώργιος', 'Δομεστιχος', 'Αγαπητός'], acc
    nd = app.page.evaluate("async () => (await import('./core/store.js')).db.all('namedays').find((x) => x.name_key === 'αγαπητοσ').name")
    assert nd == 'Αγαπητός', nd  # το εορτολόγιο με τόνους
    # προεπισκόπηση + άμεση αποστολή από info@ (Gmail API) με την πλακέτα
    assert 'Από: info@nglgreece.gr' in sample and 'Προς: nik@example.com' in sample and 'Κοιν.: gm@example.com, vis@example.com' in sample and 'Bcc: piraeus.secretary@nglgreece.gr, extra@example.com' in sample and 'never@example.com' not in sample
    subj = app.page.locator('#sample').inner_text()
    assert 'Θέμα: Πσεβ. Αδ. Νικόλαος ΕΟΡΤΑΖΩΝ - Ευχές για την ονομαστική σας εορτή από τον Μέγα Διδάσκαλο' in subj, subj[:300]
    app.page.click('[data-act=preview]')
    app.page.wait_for_selector('.gprev-box')
    assert 'όπως θα φτάσει στον Νικόλαος' in app.page.inner_text('.gprev-bar') and 'Μπενετάτου' in app.page.inner_text('.gprev-box')
    app.page.click('.gprev [data-x]')
    assert app.page.locator('.gprev').count() == 0
    sent = []

    def gmail(route, request):
        if request.url.endswith('/profile'):
            return route.fulfill(json={'emailAddress': 'info@nglgreece.gr'})
        sent.append(json.loads(request.post_data or '{}'))
        return route.fulfill(json={'id': 'm-1'})
    app.page.route('https://accounts.google.com/gsi/client', lambda r: r.fulfill(body=GSI_FAKE, content_type='text/javascript'))
    app.page.route('https://gmail.googleapis.com/**', gmail)
    app.page.on('dialog', lambda d: d.accept())
    app.page.evaluate("async () => { const {db} = await import('./core/store.js'); await db.save('x', (tx) => tx.setting('google_client_id', 'test.apps.googleusercontent.com')); }")
    app.page.click('[data-act=send]')
    app.page.wait_for_selector('.send-preview')  # προεπισκόπηση πριν την αποστολή
    assert 'info@nglgreece.gr' in app.page.inner_text('.send-preview') and 'nik@example.com' in app.page.inner_text('.send-preview')
    app.page.click('.send-preview [data-yes]')
    app.page.wait_for_selector('text=Στάλθηκε και καταχωρίστηκε', timeout=30000)
    raw = sent[0]['raw']
    mime = base64.urlsafe_b64decode(raw + '=' * (-len(raw) % 4)).decode()
    html = base64.b64decode(mime.split('Content-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace('\r\n', '')).decode()
    assert 'From: info@nglgreece.gr' in mime and 'To: nik@example.com' in mime and 'Cc: gm@example.com, vis@example.com' in mime and 'Bcc: piraeus.secretary@nglgreece.gr, extra@example.com' in mime and 'ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ' in html and 'Μπενετάτου</b>' in html and 'cid:' not in html
    app.wait_saved()
    app.go(f'/namedays?frm={y}-01-01&to={y}-12-31')
    assert '✓ Ευχές' in app.text()
    app.go('/namedays/report')
    assert 'ΕΟΡΤΑΖΩΝ Νικόλαος' in app.text()  # όπως στην Επετηρίδα


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
    assert letters[0]['protocol_no'] == '20545' and any(c['message'].startswith('Νέα Επιστολή') for c in gh.commits.values())  # (μπορεί να ακολουθούν αυτόματες ενημερώσεις)
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
    # αποθετήριο που δεν φαίνεται: διάγνωση λογαριασμού και οδηγίες εισόδου από αυτή τη συσκευή
    connect_github(app, MockGitHub(visible=False, login='dskiad-gh'))
    app.page.wait_for_selector('text=Πώς να μπείτε από αυτή τη συσκευή')
    t = app.text()
    assert 'λογαριασμό GitHub «dskiad-gh»' in t and 'Πρόσκληση χρήστη' in t and 'Να μένω συνδεδεμένος' in t, t
    assert app.page.locator('a[href*="personal-access-tokens/new"][href*="target_name=NGLG-GSEC"]').count() == 1
    app.errors.clear()
    connect_github(app, MockGitHub(visible=False, login='NGLG-GSEC', token='github_pat_x'), token='github_pat_x')
    app.page.wait_for_selector('text=δεν του δόθηκε πρόσβαση')
    app.errors.clear()
    connect_github(app, MockGitHub(visible=False, scopes='read:user'))
    app.page.wait_for_selector('text=δεν έχει το δικαίωμα «repo»')
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


@pytest.mark.parametrize('path', ['/', '/letters/new', '/decrees/new', '/members', '/directory', '/visits', '/namedays', '/projects', '/database', '/settings', '/members/new', '/members/diplomas', '/visits/decisions', '/declarations', '/epeteirida/pinakas', '/templates'])
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
    # Επικόλληση από το Excel-πηγή: διαγραμμένος (απαγορεύεται η επικοινωνία) μόνο με ΔΙΑΓΡΑΦΕΝ σε ΟΛΕΣ τις Στοές του· διαγραφή από μία Στοά δεν αρκεί
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
    app.page.check('#imp [name=mode][value=replace]')
    with app.page.expect_download():
        app.page.locator('#imp button').click()
    app.page.wait_for_selector('text=Γενική αντικατάσταση ολοκληρώθηκε')
    assert '3 εγγραφές' in app.text('body') and '1 διαγραμμένα μέλη' in app.text('body')
    ms = app.page.evaluate("async () => { const m = await import('./core/store.js'); return [m.db.all('member_registry'), m.db.all('member_lodges')]; }")
    by = {m['surname']: m for m in ms[0]}
    assert by['Ενεργόπουλος']['no_contact'] == 0 and by['Ενεργόπουλος']['active'] == 1
    assert by['Διαγραμμένος']['no_contact'] == 1 and by['Διαγραμμένος']['active'] == 0
    assert by['Πρώτοδιαγραφείς']['no_contact'] == 0 and by['Πρώτοδιαγραφείς']['active'] == 1  # ενεργός στην ΑΚΡΟΠΟΛΙΣ
    nums = sorted(l['lodge_number'] for l in ms[1])
    assert nums == ['103', '104', '3', '3', '95']
    assert app.page.locator('.pill.bad').count() == 1
    # δεν εμφανίζονται ως παραλήπτες επιστολών, ούτε στα μέλη για διατάγματα / εκπροσώπους
    found = app.page.evaluate("async () => { const p = await import('./core/pickers.js'); return [p.contactItems('Γεώργιος').map((x) => x.label), p.memberItems('Γεώργιος').map((x) => x.label)]; }")
    assert sorted(found[1]) == ['Ενεργόπουλος Γεώργιος', 'Πρώτοδιαγραφείς Γεώργιος'] and 'Διαγραμμένος Γεώργιος' not in found[0]
    # η καρτέλα του μέλους δείχνει την απαγόρευση και δεν έχει κουμπί επιστολής
    app.go(f"/members/{by['Διαγραμμένος']['id']}")
    assert 'απαγορεύεται κάθε επικοινωνία' in app.text() and app.page.locator('a:has-text("✉ Επιστολή")').count() == 0
    # ευχές: δεν εμφανίζεται στους εορτάζοντες
    cel = app.page.evaluate("async () => { const n = await import('./modules/namedays.js'); return JSON.stringify(n.celebrants('2026-01-01', '2026-12-31')); }")
    assert 'Διαγραμμένος' not in cel


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
    assert ms[2]['no_contact'] == 1  # ΔΙΑΓΡΑΦΕΝ από όλες τις Στοές
    assert ms[3]['no_contact'] == 0 and ms[3]['active'] == 1  # διαγραφή μόνο από την 1η Στοά — μέλος ακόμη στην άλλη


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
    app.page.wait_for_timeout(1500)  # ο ΜΔ (Εκπρόσωπος) μπαίνει στο Μητρώο· εδώ μετράμε μόνο τα μέλη της δοκιμής
    app.page.evaluate("async () => { const {db} = await import('./core/store.js'); await db.save('x', (tx) => { tx.replace('reps', []); tx.replace('member_registry', []); tx.replace('member_lodges', []); }); }")
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
    assert app.page.input_value('[name=closing]') == 'Με αφοσίωση και εκτίμηση,'


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
    assert 'ΔΙΑΤΑΓΜΑ' in pv() and '513/' in pv() and 'περί Διορισμού Μεγάλων Αξιωματικών,' in pv()  # ΔΙΟΡΙΖΟΜΕΝ: προεπιλεγμένο «Περί»
    app.page.fill('[name=matter]', 'διορισμού Μεγάλων Αξιωματικών')
    app.page.wait_for_function("() => document.querySelector('#dprev').innerText.includes('περί διορισμού Μεγάλων Αξιωματικών')")
    app.page.select_option('#dOffice', 'Μέγας Γραμματεύς')
    app.page.wait_for_function("() => document.querySelector('#dprev').innerText.includes('ΜΕΓΑΝ ΓΡΑΜΜΑΤΕΑ')")
    app.pick('.registry-search', 'Παπαδ')
    app.page.wait_for_function("() => document.querySelector('#dprev').innerText.includes('Παπαδόπουλον')")
    assert 'Κανόνα 22' in pv()
    app.page.select_option('#dAction', 'service_award')
    app.page.wait_for_function("() => !!document.querySelector('#dprev .evarest img')")  # καλλιγραφική εικόνα
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
    rep = [x for x in r['reps'] if x['surname'] in ('Διπλός', 'Διπλος')][0]
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
    assert m['registry_no'] == 81 and 'a1@example.com' in m['other_emails'] and 'Αρ. Μητρώου M80' in m['merged_from'] and m['surname_variants'] == ''  # ίδιο όνομα με άλλους τόνους δεν είναι παραλλαγή
    assert sorted(l['lodge_number'] for l in st['ls'] if l['member_id'] == m['id']) == ['3', '70']
    assert [x for x in st['reps'] if x['surname'] in ('Διπλός', 'Διπλος')][0]['member_id'] == m['id']
    app.go(f"/members/{m['id']}")
    assert 'Εκπρόσωπος ΜΔ: Μέγας Ευχέτης' in app.text() and 'Συγχωνεύθηκαν: Αρ. Μητρώου M80' in app.text()


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
              'Σεβασμιώτατος Αδ. Ιωάννης Μπενετάτος.', 'Κανόνα 122', 'Κανόνα 144', 'Παρακαλούμε για την επιβεβαίωση λήψεως της παρούσης.', 'Κατ’ εντολήν του Μεγάλου Διδασκάλου,\nΜε αφοσίωση και εκτίμηση,', 'Πσεβ. Αδ. Δημήτριος Σκιαδόπουλος\nΜέγας Γραμματεύς']:
        assert s in body, s
    assert 'εκπροσωπ' not in body.lower() and '{' not in body
    app.go('/visits')
    app.page.locator('.vcard a:has-text("📄 Επιστολή")').first.click()
    app.page.wait_for_selector('#lf')
    assert app.page.input_value('[name=recipient_name]') == 'τον Γραμματέα της Στοάς «ΔΙΩΝΗ» υπ’ αριθ. 32, Αδ. Γραμματέας Δοκιμής'
    assert 'Κατ’ εντολήν του Μεγάλου Διδασκάλου,' in app.page.input_value('[name=body]') and 'Μέγας Γραμματεύς' not in app.page.input_value('[name=body]')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    paper = app.text('.paper')
    assert 'Με αφοσίωση και εκτίμηση,' in paper and 'Με αδελφικούς χαιρετισμούς' not in paper and 'Πσεβ. Αδ. Δημήτριος Σκιαδόπουλος' in paper and 'Μέγας Γραμματεύς' in paper


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
    assert app.page.input_value('[name=closing]') == 'Με αφοσίωση και εκτίμηση,' and app.page.input_value('[name=category]') == 'ΕΠΙΣΚΕΨΗ'
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
    app.page.wait_for_selector('#invQr svg')  # QR για το κινητό
    assert app.page.locator('#invOut a.wa-btn[href^="https://wa.me/?text="]').count() == 1
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
    # «Να μένω συνδεδεμένος» (π.χ. προσωπικό προφίλ Chrome): πλήρης πρόσβαση χωρίς κωδικό στα επόμενα ανοίγματα
    ctx2 = browser.new_context()
    q = ctx2.new_page()
    q.route('https://api.github.com/**', gh.handle)
    q.goto(link.replace(link.split('#')[0], base_url))
    q.wait_for_selector('#lgForm')
    q.fill('[name=password]', 'Dokimi-2026x')
    q.check('[name=remember]')
    q.locator('#lgForm button').click()
    q.wait_for_selector('.dash', timeout=20000)
    q2 = ctx2.new_page()
    q2.route('https://api.github.com/**', gh.handle)
    q2.goto(base_url + '#/members')
    q2.wait_for_selector('h1:has-text("Μητρώο")', timeout=20000)
    assert q2.locator('#lgForm').count() == 0
    ctx2.close()


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
    assert [u['name'] for u in uploads] == ['20545 - ΕΠΙΣΤΟΛΗ Πρόσκληση σε σύσκεψη.pdf']  # μόνο PDF, όχι Word
    assert all(u['auth'] == 'Bearer g-token' and u['parents'] for u in uploads) and uploads[0]['pdf']
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
    assert len(uploads) == 2 and uploads[1]['name'].startswith('20546 - ΔΙΑΤΑΓΜΑ 513') and uploads[1]['name'].endswith('.pdf') and uploads[1]['pdf']
    # Επιστολή από Επίσκεψη → κατηγορία ΕΠΙΣΚΕΨΗ
    app.go('/visits')
    rid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('reps')[0].id")
    vid = app.page.evaluate("async (t) => (await import('./core/store.js')).db.all('visits').find((v) => v.visit_date >= t).id", date.today().isoformat())
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



def test_protocol_number_inside_letter_text(app):
    """Το {Αρ. Πρωτ.} και η {Ημερομηνία επιστολής} μέσα στο κείμενο συμπληρώνονται μόλις η επιστολή γίνει «Έτοιμη»."""
    app.connect_local()
    app.go('/letters/new')
    app.fill(subject='Υπενθύμιση', body='Ο αριθμός Πρωτοκόλλου {Αρ. Πρωτ.: } και η ημερομηνία {Ημερομηνία επιστολής} θα αναγραφούν.')
    app.click('💾 Αποθήκευση')
    app.page.wait_for_url('**/#/letters/1')
    body = app.page.inner_text('.paper .body')
    assert '{Αρ. Πρωτ.: }' in body and '{Ημερομηνία επιστολής}' in body, body
    app.click('✅ Έτοιμη: απόδοση αρ. πρωτοκόλλου')
    app.page.wait_for_selector('text=πήρε αριθμό πρωτοκόλλου')
    body = app.page.inner_text('.paper .body')
    today = app.page.evaluate("(() => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); })()")
    assert 'Πρωτοκόλλου 20545 και η ημερομηνία ' + today + ' θα' in body, body


def test_ionian_letter_cc_rule(app):
    """Επιστολή προς ionian.secretary@nglgreece.gr: στην κοινοποίηση (Cc) μπαίνει πάντα και το spiros@rokashotels.gr."""
    app.connect_local()
    app.go('/letters/new').fill(recipient_name='ΕπΜΓρ. Ιονίων Νήσων', recipient_email='ionian.secretary@nglgreece.gr', subject='Ιόνια', body='Κείμενο.')
    app.click('💾 Αποθήκευση')
    app.page.wait_for_url('**/#/letters/1')
    href = app.page.get_attribute('a.btn[href*="mail.google.com"]', 'href')
    assert 'cc=spiros%40rokashotels.gr' in href and 'to=ionian.secretary%40nglgreece.gr' in href, href
    # άλλη Επαρχία: χωρίς την κοινοποίηση
    app.go('/letters/new').fill(recipient_name='Αθηνών', recipient_email='athens.secretary@nglgreece.gr', subject='Αθήνα', body='Κείμενο.')
    app.click('💾 Αποθήκευση')
    app.page.wait_for_url('**/#/letters/2')
    assert 'rokashotels' not in app.page.get_attribute('a.btn[href*="mail.google.com"]', 'href')
    # ο κανόνας αλλάζει από τις Ρυθμίσεις
    assert 'ionian.secretary@nglgreece.gr => cc: spiros@rokashotels.gr' in app.page.evaluate("async () => { const {db} = await import('./core/store.js'); return db.setting('letter_cc_rules'); }")


def test_letter_sender_choice_and_preview_before_send(app):
    """Επιστολή: επιλογή λογαριασμού αποστολής (grand.secretary@ ή info@)· πριν την αποστολή προεπισκόπηση και επιβεβαίωση."""
    app.connect_local()
    sent, profile = [], {'emailAddress': 'grand.secretary@nglgreece.gr'}

    def gmail(route, request):
        if request.url.endswith('/profile'):
            return route.fulfill(json=profile)
        sent.append(json.loads(request.post_data or '{}'))
        return route.fulfill(json={'id': 'm-1'})
    app.page.route('https://accounts.google.com/gsi/client', lambda r: r.fulfill(body=GSI_FAKE, content_type='text/javascript'))
    app.page.route('https://gmail.googleapis.com/**', gmail)
    tid = app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      return db.save('x', (tx) => { tx.setting('google_client_id', 'test.apps.googleusercontent.com');
        return tx.insert('letter_templates', { name: 'Έγκριση Κανονισμού', active: 1, subject: 'Έγκριση Κανονισμού', body: 'Εγκρίνεται ο Κανονισμός.', mail_kind: 'general' }).id; }); }""")
    app.go(f'/templates/edit/{tid}')
    assert app.page.input_value('[name=mail_kind]') == 'general'
    app.go('/letters/new')
    app.page.select_option('#tplSel', str(tid))
    app.fill(recipient_name='Στοά', recipient_email='lodge@example.com')
    app.click('✅ Έτοιμη: Αποθήκευση & απόδοση αρ. πρωτοκόλλου')
    app.page.wait_for_url('**/#/letters/1')
    app.page.wait_for_selector('[data-ms=send]')
    # το πρότυπο ορίζει info@· αλλαγή σε grand.secretary@ για αυτή την επιστολή
    assert app.page.input_value('[data-ms=from]') == 'general' and 'info@nglgreece.gr' in app.page.inner_text('[data-ms=send]')
    app.page.select_option('[data-ms=from]', 'official')
    app.page.wait_for_function("document.querySelector('[data-ms=send]') && document.querySelector('[data-ms=send]').textContent.includes('grand.secretary@')")
    app.page.wait_for_function("import('./core/store.js').then((m) => m.db.get('letters', 1).mail_kind === 'official')")
    app.page.wait_for_selector('[data-ms=send]')
    assert 'grand.secretary@' in app.page.inner_text('[data-ms=send]')
    app.page.click('[data-ms=send]')
    app.page.wait_for_selector('.send-preview')
    pv = app.page.inner_text('.send-preview')
    assert 'grand.secretary@nglgreece.gr' in pv and 'lodge@example.com' in pv and 'Έγκριση Κανονισμού' in pv and '.pdf' in pv
    body = app.page.frame_locator('.send-preview-body').locator('body').inner_text()
    assert 'Εγκρίνεται ο Κανονισμός.' in body and 'Με αφοσίωση και εκτίμηση' in body, body  # με τον χαιρετισμό και την υπογραφή
    app.page.click('.send-preview [data-no]')  # Άκυρο → δεν στέλνεται τίποτα
    assert app.page.locator('.send-preview').count() == 0 and not sent
    # χειρόγραφο email στην Κοιν. και επαφή στο Bcc
    app.page.evaluate("async () => { const {db} = await import('./core/store.js'); await db.save('x', (tx) => tx.insert('contacts', { name: 'Σπυρίδων Ρόκας', emails: ['spiros@rokashotels.gr'], labels: [] })); }")
    app.page.fill('.ms-input[data-f=cc]', 'manual@example.com')
    app.pick('.ms-pick[data-pick=bcc]', 'Ρόκας')
    assert app.page.input_value('.ms-input[data-f=bcc]') == 'spiros@rokashotels.gr'
    app.page.click('[data-ms=send]')
    assert 'manual@example.com' in app.page.inner_text('.send-preview') and 'spiros@rokashotels.gr' in app.page.inner_text('.send-preview')
    app.page.click('.send-preview [data-yes]')
    app.page.wait_for_selector('.ms-ok', timeout=30000)
    mime = base64.urlsafe_b64decode(sent[0]['raw'] + '=' * (-len(sent[0]['raw']) % 4)).decode()
    assert 'From: grand.secretary@nglgreece.gr' in mime and 'To: lodge@example.com' in mime and 'Cc: manual@example.com' in mime and 'Bcc: spiros@rokashotels.gr' in mime, mime[:600]


def test_protocol_field_in_subject_and_official_font(app):
    """{Αριθμός Πρωτοκόλλου} και στο θέμα· τα έντυπα με Noto Serif (αριθμοί στην ίδια γραμμή)."""
    app.connect_local()
    app.go('/letters/new').fill(subject='Έγκριση Κανονισμού με Αρ. Πρωτ. {Αριθμός Πρωτοκόλλου} για την Στοά', body='Κείμενο.')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    assert 'Θέμα: Έγκριση Κανονισμού με Αρ. Πρωτ. 20545 για την Στοά' in app.page.inner_text('.print-area .paper')
    assert 'Αρ. Πρωτ. 20545 για' in app.page.inner_text('.mailsheet')  # και στο θέμα του email
    app.page.evaluate("document.fonts.ready")
    ff = app.page.evaluate("getComputedStyle(document.querySelector('.print-area .paper')).fontFamily")
    assert ff.startswith('"Noto Serif"'), ff
    assert app.page.evaluate("document.fonts.check(\"16px 'Noto Serif'\", '20545 Αρ.')")
    app.go('/letters')
    assert 'Αρ. Πρωτ. 20545 για' in app.text()


def test_regulation_approval_stamp_and_pdf(app, tmp_path):
    """Έγκριση Εσωτερικού Κανονισμού: «ΕΙΔΙΚΟ ΣΗΜΑ» → ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ· δεύτερο PDF (Κανονισμός) στο email και στο Αρχείο."""
    app.connect_local()
    reg = tmp_path / 'Κανονισμός ΟΜΗΡΟΣ.pdf'
    reg.write_bytes(b'%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n')
    sent = []

    def gmail(route, request):
        if request.url.endswith('/profile'):
            return route.fulfill(json={'emailAddress': 'grand.secretary@nglgreece.gr'})
        sent.append(json.loads(request.post_data or '{}'))
        return route.fulfill(json={'id': 'm-1'})
    app.page.route('https://accounts.google.com/gsi/client', lambda r: r.fulfill(body=GSI_FAKE, content_type='text/javascript'))
    app.page.route('https://gmail.googleapis.com/**', gmail)
    tid = app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      return db.save('x', (tx) => { tx.setting('google_client_id', 'test.apps.googleusercontent.com');
        return tx.insert('letter_templates', { name: 'Έγκριση Εσωτερικού Κανονισμού', active: 1, subject: 'Έγκριση Εσωτερικού Κανονισμού με Αρ. Πρωτ. {Αριθμός Πρωτοκόλλου}', body: 'Εγκρίνεται ο Κανονισμός με Αρ. Πρωτ. {Αρ. Πρωτ.}.' }).id; }); }""")
    app.go('/letters/new')
    assert app.page.locator('#protoBox').is_hidden()
    app.page.select_option('#tplSel', str(tid))
    assert app.page.locator('[data-act=approvalStamp]').is_visible() and 'ΕΙΔΙΚΟ ΣΗΜΑ ΕΓΚΡΙΣΗΣ ΕΣΩΤ. ΚΑΝΟΝΙΣΜΟΥ' in app.page.inner_text('#protoBox')
    app.fill(recipient_name='Γραμματέα της Στοάς «ΟΜΗΡΟΣ» υπ’ αριθ. 59', recipient_email='omiros59@example.com')
    app.page.click('[data-act=approvalStamp]')
    app.page.wait_for_selector('.approval-app canvas')
    assert app.page.input_value('.approval-app [data-k=protocol]') == '20545' and app.page.input_value('.approval-app [data-k=lodge]') == '59'
    assert 'ΟΜΗΡΟΣ' in app.page.inner_text('.approval-detail')
    app.page.fill('.approval-app [data-k=search]', 'ΚΑΠΟΔΙΣΤΡ')
    assert app.page.locator('.approval-app [data-k=lodge] option').count() == 3  # κενή + η επιλεγμένη 59 + 92
    with app.page.expect_download() as dl:
        app.page.click('.approval-app [data-jpeg]')
    assert dl.value.suggested_filename.startswith('ΑρΠρωτοκόλλου_20545_') and Path(dl.value.path()).read_bytes()[:3] == b'\xff\xd8\xff'
    app.page.click('.approval-app [data-use]')
    app.page.wait_for_selector('#protoBox .proto-preview img.proto-img')
    assert app.page.input_value('[name=protocol_image]').startswith('data:image/png;base64,')
    app.page.set_input_files('#regFile', str(reg))
    assert 'Κανονισμός ΟΜΗΡΟΣ.pdf' in app.page.inner_text('#protoBox .reg-name')
    app.click('✅ Έτοιμη: Αποθήκευση & απόδοση αρ. πρωτοκόλλου')
    app.page.wait_for_url('**/#/letters/1')
    l = app.page.evaluate("async () => (await import('./core/store.js')).db.get('letters', 1)")
    assert l['reg_name'] == 'Κανονισμός ΟΜΗΡΟΣ.pdf' and l['reg_file'].startswith('letters/kanonismos-1-') and l['protocol_image']
    assert app.page.locator('.print-area .proto-img').count() == 1
    with app.page.expect_download() as dl:
        app.page.click('[data-act=regpdf]')
    assert dl.value.suggested_filename == 'Κανονισμός ΟΜΗΡΟΣ.pdf' and Path(dl.value.path()).read_bytes()[:4] == b'%PDF'
    # email: το PDF της επιστολής και (επιλεγμένος) ο Κανονισμός
    app.page.wait_for_selector('[data-extra="0"]')
    assert app.page.is_checked('[data-extra="0"]')
    app.page.click('[data-ms=send]')
    assert 'Κανονισμός ΟΜΗΡΟΣ.pdf' in app.page.inner_text('.send-preview')
    app.page.click('.send-preview [data-yes]')
    app.page.wait_for_selector('.ms-ok', timeout=30000)
    mime = base64.urlsafe_b64decode(sent[0]['raw'] + '=' * (-len(sent[0]['raw']) % 4)).decode()
    assert mime.count('Content-Type: application/pdf') == 2 and 'Subject: =?UTF-8?B?' in mime
    # χωρίς τον Κανονισμό όταν δεν τον θέλω
    app.go('/letters/1'); app.page.wait_for_selector('[data-extra="0"]')
    app.page.uncheck('[data-extra="0"]')
    app.page.click('[data-ms=send]'); app.page.click('.send-preview [data-yes]')
    app.page.wait_for_selector('.ms-ok', timeout=30000)
    mime = base64.urlsafe_b64decode(sent[1]['raw'] + '=' * (-len(sent[1]['raw']) % 4)).decode()
    assert mime.count('Content-Type: application/pdf') == 1
    # Αρχείο Επιστολών: ο Κανονισμός μαζί με την επιστολή
    app.go('/letters')
    with app.page.expect_download() as dl:
        app.page.locator('tr', has_text='ΟΜΗΡΟΣ').locator('[data-act=regpdf]').click()
    assert dl.value.suggested_filename == 'Κανονισμός ΟΜΗΡΟΣ.pdf'


def test_protocol_suggested_or_manual(app):
    """Το «Έτοιμο» προτείνει τον επόμενο αριθμό πρωτοκόλλου· μπορεί να γραφτεί άλλος, και να αλλάξει αργότερα."""
    app.connect_local()
    add_member(app)
    app.go('/decrees/new')
    app.fill(matter='διορισμού Μεγάλων Αξιωματικών')
    app.page.select_option('#dOffice', 'Μέγας Γραμματεύς')
    app.pick('.registry-search', 'Παπαδ')
    app.click('Έκδοση Διατάγματος')
    app.page.wait_for_url('**/#/decrees/1')
    app.page.evaluate("window.prompt = (m, d) => { sessionStorage.setItem('asked', JSON.stringify([m, d])); return '21000'; }")
    app.click('✅ Έτοιμο: απόδοση αρ. πρωτοκόλλου')
    app.page.wait_for_selector('text=πήρε αριθμό πρωτοκόλλου')
    assert 'Αρ. Πρωτ.: 21000' in app.text()
    asked = app.page.evaluate("JSON.parse(sessionStorage.getItem('asked'))")
    assert 'Προτείνω αριθμό πρωτοκόλλου 20545' in asked[0] and asked[1] == '20545'
    # η αρίθμηση συνεχίζει μετά τον χειροκίνητο αριθμό (ο προτεινόμενος γίνεται δεκτός με OK)
    app.page.evaluate("window.prompt = (m, d) => d")
    app.go('/letters/new').fill(subject='Επόμενη', body='x').click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    assert 'Αρ. Πρωτ.: 21001' in app.text()
    # αλλαγή αριθμού σε ήδη αριθμημένο Διάταγμα
    app.go('/decrees/1')
    app.page.evaluate("window.prompt = () => '20999'")
    app.click('✏ Αλλαγή αρ. πρωτοκόλλου')
    app.page.wait_for_selector('text=άλλαξε σε 20999')
    assert 'Αρ. Πρωτ.: 20999' in app.text()
    # ακύρωση: τίποτα δεν αλλάζει
    app.go('/letters/new').fill(subject='Ακυρωμένη', body='x')
    app.page.evaluate("window.prompt = () => null")
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_timeout(300)
    assert app.page.url.endswith('#/letters/new')
    # «Αποθήκευση» με Κατάσταση «Έτοιμη» ρωτά επίσης
    app.page.evaluate("window.prompt = () => '21500'")
    app.fill(status='ready').click('💾 Αποθήκευση')
    app.page.wait_for_url('**/#/letters/2')
    assert 'Αρ. Πρωτ.: 21500' in app.text()
    # επιστολή Επίσκεψης (PDF από τη σελίδα Επισκέψεων)
    vseq = app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); window.prompt = () => '22000';
      const id = await db.save('v', (tx) => tx.insert('visits', { lodge: 'ΑΛΦΑ', lodge_number: '1', visit_date: '2026-11-01' }).id);
      return (await (await import('./modules/letters.js')).ensureVisitLetter(db.get('visits', id))).protocol_seq; }""")
    assert vseq == 22000
    seqs = app.page.evaluate("async () => { const {db} = await import('./core/store.js'); return [db.all('letters').map((l) => l.protocol_seq), db.all('decree_documents').map((d) => d.protocol_seq)]; }")
    assert seqs == [[21001, 21500, 22000], [20999]], seqs

def test_recipient_lodge_fills_template_subject(app):
    """Η Στοά που επιλέγεται στον «Παραλήπτη από τον Κατάλογο» συμπληρώνει τα {Στοά} / {Αρ. Στοάς} του θέματος."""
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => { const l = tx.find('lodges', (x) => x.number === '32'); tx.update('lodges', l.id, { secretary_email: 'dioni.secretary@example.com' });
        tx.insert('letter_templates', { name: 'Θέμα Στοάς', active: 1, subject: 'Ενημέρωση — Στοά «{Στοά}» αρ. {Αρ. Στοάς}', body: 'Κείμενο προς τη Στοά {Στοά}.' }); }); }""")
    app.go('/letters/new')
    app.page.select_option('#tplSel', label=app.page.locator('#tplSel option', has_text='. Θέμα Στοάς').last.inner_text())
    app.pick('#rcptPick', 'ΔΙΩΝΗ')
    assert app.page.input_value('[name=subject]') == 'Ενημέρωση — Στοά «ΔΙΩΝΗ» αρ. 32'
    assert app.page.input_value('[name=body]') == 'Κείμενο προς τη Στοά ΔΙΩΝΗ.'
    assert app.page.input_value('[name=recipient_email]') == 'dioni.secretary@example.com'


def test_letter_protocol_image_below_seal_centered(app, tmp_path):
    """Πρότυπο με {Αρ. Πρωτ.}: η νέα επιστολή ζητά «ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ», που μπαίνει κάτω από τη σφραγίδα, στο κέντρο, ~400×200."""
    import base64
    png = tmp_path / 'stamp.png'
    png.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='))
    app.connect_local()
    ids = app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      return db.save('x', (tx) => [tx.insert('letter_templates', { name: 'Έγκριση εντύπου', active: 1, subject: 'Έγκριση', body: 'Ο αριθμός Πρωτοκόλλου {Αρ. Πρωτ.: } θα αναγραφεί.' }).id,
        tx.insert('letter_templates', { name: 'Απλό', active: 1, subject: 'Απλό', body: 'Κείμενο.' }).id]); }""")
    app.go(f'/templates/edit/{ids[0]}')
    assert 'ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ: ζητείται στη νέα επιστολή' in app.text()
    app.go('/letters/new')
    assert app.page.locator('#protoBox').is_hidden()
    app.page.select_option('#tplSel', str(ids[1]))
    assert app.page.locator('#protoBox').is_hidden()
    app.page.once('dialog', lambda d: d.accept())
    app.page.select_option('#tplSel', str(ids[0]))
    assert app.page.locator('#protoBox').is_visible() and 'ΕΙΚΟΝΑ ΠΡΩΤΟΚΟΛΛΟΥ' in app.page.inner_text('#protoBox')
    app.page.set_input_files('#protoImgFile', str(png))
    app.page.wait_for_selector('#protoBox .proto-preview img.proto-img')
    app.fill(recipient_name='Παραλήπτης')
    app.click('💾 Αποθήκευση')
    app.page.wait_for_url('**/#/letters/1')
    assert app.page.evaluate("async () => (await import('./core/store.js')).db.get('letters', 1).protocol_image").startswith('data:image/png;base64,')
    box = lambda sel: app.page.locator('.print-area .paper ' + sel).bounding_box()
    seal, proto, sign, paper = box('.seal-img'), box('.proto-img'), box('.sign'), box('')
    assert proto['y'] >= seal['y'] + seal['height'] and proto['y'] >= sign['y'] + sign['height']  # κάτω από σφραγίδα/υπογραφή, χωρίς επικάλυψη
    assert abs((proto['x'] + proto['width'] / 2) - (paper['x'] + paper['width'] / 2)) < 3  # στο κέντρο
    assert 380 <= proto['width'] <= 420 and 190 <= proto['height'] <= 210, proto
    # «Νέα πάνω σε αυτή» δεν παίρνει την εικόνα (κάθε έγκριση έχει τη δική της)· επιστολή χωρίς εικόνα: τίποτα δίπλα στη σφραγίδα
    app.go('/letters/new').fill(subject='Χωρίς', body='x').click('💾 Αποθήκευση')
    app.page.wait_for_url('**/#/letters/2')
    assert app.page.locator('.print-area .proto-img').count() == 0


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
    # η επιστολή από τη «Συμπλήρωση από τη βάση» συνδέεται με την Επίσκεψη
    vid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('visits').find((v) => v.lodge_number === '32').id")
    assert app.page.input_value('[name=visit_id]') == str(vid)
    app.page.fill('[name=subject]', 'Δοκιμή εκπροσώπησης')
    app.click('💾 Αποθήκευση')
    app.page.wait_for_url('**/#/letters/*')
    assert app.page.evaluate("async () => (await import('./core/store.js')).db.all('letters').at(-1).visit_id") == vid


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
    subj = mime.split('Subject: ')[1].split('\r\n')[0]
    assert subj.startswith('=?UTF-8?B?') and base64.b64decode(subj[10:-2]).decode().startswith('20545 - Εκπροσώπηση'), subj  # Αρ. Πρωτ. μπροστά στο θέμα
    assert 'Cc: rep@example.com, gm@example.com' in mime and 'Bcc: b1@example.com, b2@example.com' in mime
    txt = base64.b64decode(mime.split('Content-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace('\r\n', '')).decode()
    assert txt.startswith('ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ\nΜΕΓΑΛΗ ΓΡΑΜΜΑΤΕΙΑ\n\n') and txt.count('ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ') == 1, txt[:80]
    html = base64.b64decode(mime.split('Content-Type: text/html; charset="UTF-8"\r\nContent-Transfer-Encoding: base64\r\n\r\n')[1].split('\r\n--')[0].replace('\r\n', '')).decode()
    assert 'src="cid:nglg-emblem"' in html and 'height:80px' in html and 'font-weight:bold;font-size:16px' in html and '>ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ ΤΗΣ ΕΛΛΑΔΟΣ<' in html and '>Μεγάλη Γραμματεία<' in html
    assert html.count('ΕΘΝΙΚΗ ΜΕΓΑΛΗ ΣΤΟΑ') == 1 and 'Content-ID: <nglg-emblem>' in mime
    logo = mime.split('Content-ID: <nglg-emblem>')[1].split('\r\n\r\n', 1)[1].split('\r\n--')[0].replace('\r\n', '')
    assert base64.b64decode(logo)[:4] == b'\x89PNG'
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
    assert 'b1@example.com' in app.page.input_value('.mailsheet .ms-input[data-f=bcc]')
    # άμεση αποστολή από info@: έλεγχος λογαριασμού, αποστολή, σημείωση «ενημερώθηκε»
    sent, profile = [], {'emailAddress': 'other@example.com'}

    def gmail2(route, request):
        if request.url.endswith('/profile'):
            return route.fulfill(json=profile)
        sent.append(json.loads(request.post_data or '{}'))
        return route.fulfill(json={'id': 'm-1'})
    app.page.unroute('https://gmail.googleapis.com/**')
    app.page.route('https://gmail.googleapis.com/**', gmail2)
    vid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('visits')[0].id")
    app.go(f'/visits/notify?ids={vid}&back=list')
    app.page.wait_for_selector('[data-ms=send]')
    assert 'Αποστολή τώρα από info@nglgreece.gr' in app.page.inner_text('[data-ms=send]')
    assert app.page.input_value('[name=subject]').startswith('20545 - Εκπροσώπηση ΜΔ εις την Στοάν «ΔΙΩΝΗ»')
    app.page.click('[data-ms=send]')
    app.page.click('.send-preview [data-yes]')
    app.page.wait_for_selector('.ms-state .warn', timeout=30000)
    assert 'other@example.com' in app.text('.ms-state') and not sent  # λάθος λογαριασμός → δεν στάλθηκε
    profile['emailAddress'] = 'info@nglgreece.gr'
    app.page.click('[data-ms=send]')
    app.page.click('.send-preview [data-yes]')
    app.page.wait_for_url('**/#/visits', timeout=30000)
    assert len(sent) == 1
    mime = base64.urlsafe_b64decode(sent[0]['raw'] + '=' * (-len(sent[0]['raw']) % 4)).decode()
    assert 'From: info@nglgreece.gr' in mime and 'Bcc: b1@example.com, b2@example.com' in mime and 'Content-Type: application/pdf' in mime
    v = app.page.evaluate("async () => (await import('./core/store.js')).db.all('visits')[0]")
    assert v.get('prov_notified_at') and v.get('rep_notified_at'), v


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
        return tx.insert('member_registry', { registry_no: 1777, surname: 'Δοκιμαστής', first_name: 'Βασίλειος', email: 'dok@example.com', active: 1 }).id; }); }""")
    app.go('/epeteirida/pinakas')
    app.page.locator('summary:has-text("Εισαγωγή / αντικατάσταση")').click()
    app.page.fill('#epimp2 [name=paste]', EP_TSV)
    app.page.locator('#epimp2 button').click()
    app.page.wait_for_selector('text=3 εγγραφές · 2 συνδέθηκαν')
    assert 'Εμφανίζονται 3 από 3 · 2 συνδεδεμένοι' in app.text('#epcount')
    # Αρ. Μητρώου από τον πίνακα μελών (στήλη, αναζήτηση)
    assert app.page.locator('tr:has-text("Δοκιμαστής") .c-regno').inner_text().strip() == 'M1777'
    app.page.fill('[data-f=q]', '1777')
    assert 'Εμφανίζονται 1 από 3' in app.text('#epcount')
    app.page.click('[data-act=reset]')
    assert 'Αρ. Μητρώου' in app.text('#epg thead')
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
    assert app.page.locator('.vcard label.vreplabel:not(.vkindlabel)').first.inner_text().strip() == 'ΕΚΠΡΟΣΩΠΟΣ'
    app.page.locator('.vcard a:has-text("📄 Επιστολή")').first.click()
    app.page.wait_for_selector('#lf')
    assert 'Λίαν Σεβάσμιος Αδ. Νικόλαος Χατζηδοκιμίου, Αναπληρωτής Μέγας Γραμματεύς' in app.page.input_value('[name=body]')
    assert app.page.input_value('[name=cc_name]').startswith('Λίαν Σεβάσμιος Αδ. Νικόλαος Χατζηδοκιμίου')
    assert 'Σεβάσμιος Αδ. Νικόλαος' not in app.page.input_value('[name=body]').replace('Λίαν Σεβάσμιος Αδ. Νικόλαος', '')


def test_decree_templates_general_decree_and_page_design(app):
    app.connect_local()
    # τα δύο πρότυπα Διατάγματος στα Πρότυπα, όχι στη Νέα Επιστολή
    app.go('/templates')
    t = app.text()
    assert all(n in t for n in ['ΓΕΝΙΚΟ ΔΙΑΤΑΓΜΑ', 'ΔΙΑΤΑΓΜΑ ΕΝ ΕΝΕΡΓΕΙΑ — ΔΙΟΡΙΣΜΟΣ ΜΕΓΑΛΩΝ ΑΞΙΩΜΑΤΙΚΩΝ', 'ΔΙΑΤΑΓΜΑ ΠΡΩΗΝ — ΚΑΙ ΕΠΑΡΧΙΑΚΟΙ / ΠΕΡΙΦΕΡΕΙΑΚΟΙ Μ.Δ.', 'ΔΙΑΤΑΓΜΑ ΤΑΞΗΣ ΜΕΓΑΛΟΥ ΔΙΔΑΣΚΑΛΟΥ', '🎨 Σχεδίαση σελίδας']), t
    app.go('/letters/new')
    assert 'ΓΕΝΙΚΟ ΔΙΑΤΑΓΜΑ' not in app.page.inner_text('#tplSel')
    # Γενικό Διάταγμα
    app.go('/decrees/new?kind=decree-general')
    assert app.page.locator('#appointPart').is_hidden() and app.page.locator('#generalPart').is_visible()
    app.page.fill('[name=g_matter]', 'ιδρύσεως της Στοάς «Δοκιμή»')
    body = app.page.input_value('[name=g_body]').replace('……\n\nΕγένετο', 'Ιδρύεται η Στοά «Δοκιμή» υπ’ αριθμ. 999.\n\nΕγένετο')
    app.page.fill('[name=g_body]', body)
    app.page.fill('[name=g_to_email]', 'stoa@example.com')
    app.page.wait_for_timeout(300)
    assert 'περί ιδρύσεως της Στοάς «Δοκιμή»' in app.text('#dprev')
    app.click('Έκδοση Διατάγματος')
    app.page.wait_for_url('**/#/decrees/*')
    t = app.text()
    assert 'ΓΕΝΙΚΟ ΔΙΑΤΑΓΜΑ — Αποστολή' in t and 'Ιδρύεται η Στοά «Δοκιμή»' in t and 'Σεβασμιώτατος Αδελφός Ιωάννης Μπενετάτος' in t and '{' not in app.text('.print-area')
    d = app.page.evaluate("async () => (await import('./core/store.js')).db.all('decree_documents').at(-1)")
    assert d['template_key'] == 'decree-general' and d['recipient_email'] == 'stoa@example.com' and '{Περί}' in d['body_src']
    assert app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_degrees_offices').filter((o) => o.decree_id === %d).length" % d['id']) == 0
    # Σχεδίαση σελίδας: κεφαλίδα-εικόνα και φόντο
    tid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('letter_templates').find((t) => t.key === 'decree-general').id")
    app.go(f'/templates/{tid}/design')
    app.page.set_input_files('[data-up=header]', 'img/header_emblem.png')
    app.page.wait_for_selector('.dz-box.dz-header')
    app.page.fill('[data-k=header][data-f=y]', '12')
    app.page.dispatch_event('[data-k=header][data-f=y]', 'input')
    app.page.set_input_files('[data-up=bg]', 'img/seal.png')
    app.page.wait_for_selector('.dz-box.dz-bg')
    # σύρσιμο της κεφαλίδας προς τα δεξιά
    b = app.page.locator('.dz-box.dz-header').bounding_box()
    app.page.mouse.move(b['x'] + 20, b['y'] + 20); app.page.mouse.down(); app.page.mouse.move(b['x'] + 60, b['y'] + 20, steps=4); app.page.mouse.up()
    x_after = float(app.page.input_value('[data-k=header][data-f=x]'))
    assert x_after > 15, x_after
    app.page.click('[data-act=saveLayout]')
    app.page.wait_for_selector('text=Η σχεδίαση σελίδας αποθηκεύτηκε')
    L = app.page.evaluate("async () => (await import('./core/store.js')).db.all('letter_templates').find((t) => t.key === 'decree-general').layout")
    assert L['header']['file'].startswith('templates/decree-general-header-') and L['header']['y'] == 12 and L['bg']['w'] == 210 and L['bg']['file']
    assert app.page.evaluate("async (p) => !!(await (await import('./core/store.js')).db.file(p))", L['header']['file'])
    # το Διάταγμα με τη νέα σελίδα: εικόνες στη θέση τους, χωρίς την κανονική κεφαλίδα
    app.go(f"/decrees/{d['id']}")
    app.page.wait_for_function("() => document.querySelector('.print-area .layer-header')?.src?.startsWith('blob:')")
    assert app.page.locator('.print-area .paper .head').count() == 0 and app.page.locator('.print-area .layer-bg').count() == 1
    # Word: οι εικόνες της σχεδίασης σε σταθερή θέση (φόντο πίσω από το κείμενο, με διαφάνεια), χωρίς την κανονική κεφαλίδα
    with app.page.expect_download() as dl:
        app.page.click('[data-act=word]')
    import zipfile
    z = zipfile.ZipFile(dl.value.path())
    doc = z.read('word/document.xml').decode()
    assert doc.count('<wp:anchor ') == 2 and 'behindDoc="1"' in doc and '<a:alphaModFix amt="25000"/>' in doc
    assert '<wp:positionV relativeFrom="page"><wp:posOffset>432000</wp:posOffset>' in doc  # κεφαλίδα στα 12 mm
    assert 'Εθνική Μεγάλη Στοά της Ελλάδος</w:t>' not in doc.split('ΔΙΑΤΑΓΜΑ υπ')[0]  # χωρίς την κανονική κεφαλίδα
    assert len([n for n in z.namelist() if n.startswith('word/media/')]) == 4  # 2 εικόνες σχεδίασης + «ΗΜΕΙΣ» + υπογραφή (Γενικό Διάταγμα: χωρίς «ΔΙΟΡΙΖΟΜΕΝ»)
    # Διάταγμα Διορισμού: χωρίς σχεδίαση → κανονική κεφαλίδα
    app.go('/decrees/new')
    assert app.page.locator('#appointPart').is_visible() and app.page.locator('#dprev .paper .head').count() == 1


def test_letters_archive_whatsapp_pdf_button(app):
    app.connect_local()
    add_member(app)
    app.go('/letters/new').fill(recipient_name='ΕπΜΓρ. Δοκιμής', recipient_email='t@example.com', subject='Πρόσκληση WhatsApp', body='Κείμενο.')
    app.click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    app.go('/letters')
    opened = []
    app.page.context.on('page', lambda p: opened.append(p.url))
    with app.page.expect_download() as dl:
        app.page.locator('[data-act=wapdf]').first.click()
    assert dl.value.suggested_filename.endswith('.pdf') and dl.value.suggested_filename.isascii() and 'EPISTOLI Prosklisi WhatsApp' in dl.value.suggested_filename
    app.page.wait_for_selector('text=επισυνάψτε το')


def test_home_archive_dropdown_opens_decrees_and_letters(app):
    app.connect_local()
    app.go('/')
    app.page.locator('.archdrop summary').click()
    app.page.locator('.archdrop-menu a', has_text='ΔΙΑΤΑΓΜΑΤΑ').click()
    app.page.wait_for_url('**/#/decrees')
    app.go('/')
    app.page.locator('.archdrop summary').click()
    app.page.locator('.archdrop-menu a', has_text='ΕΠΙΣΤΟΛΕΣ').click()
    app.page.wait_for_url('**/#/letters')


def test_gm_programme_report_and_public_page(app):
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => { tx.replace('visits', []);
        const r = tx.insert('reps', { surname: 'Νικολαΐδης', name: 'Αθανάσιος', office: 'Βοηθός Μέγας Διδάσκαλος', rep_rank: 'Πανσεβάσμιος Αδ.' });
        const gm = tx.find('reps', (x) => x.office === 'Μέγας Διδάσκαλος');
        const P = 'ΕπΜΣτ. Αθηνών';
        tx.insert('visits', { visit_date: '2099-03-10', lodge: 'ΒΗΤΑ', lodge_number: '20', location: '', province: P, rep_id: r.id, notes: '' });
        tx.insert('visits', { visit_date: '2099-02-01', lodge: 'ΑΛΦΑ', lodge_number: '10', location: '', province: P, rep_id: gm.id, notes: '' });
        tx.insert('visits', { visit_date: '2099-02-15', lodge: 'ΚΕΝΗ', lodge_number: '30', location: '', province: P, rep_id: null, notes: '' });
        tx.insert('visits', { visit_date: '2020-01-01', lodge: 'ΠΑΛΙΑ', lodge_number: '40', location: '', province: P, rep_id: r.id, notes: '' }); }); }""")
    app.go('/')
    app.page.locator('nav a', has_text='Αναφορά εκπροσώπησης ΜΔ').click()
    app.page.wait_for_url('**/#/visits/gm-programme')
    t = app.text('.print-area')
    assert 'ΜΕΓΑΛΗ ΓΡΑΜΜΑΤΕΙΑ' in t and 'Σεβασμιώτατοι, Πανσεβάσμιοι, Λίαν Σεβάσμιοι και Σεβάσμιοι Αδελφοί,' in t and 'Με αφοσίωση και εκτίμηση,' in t and 'Μέγας Γραμματεύς' in t
    rows = app.page.locator('.gmp-table tbody tr').all_inner_texts()
    assert len(rows) == 2 and '«ΑΛΦΑ»' in rows[0] and 'Ο Μέγας Διδάσκαλος' in rows[0] and '«ΒΗΤΑ»' in rows[1] and 'Νικολαΐδης' in rows[1], rows  # αύξουσα, χωρίς ΟΥΔΕΙΣ/παλιές
    assert 'ΚΕΝΗ' not in t and 'ΠΑΛΙΑ' not in t
    # αριθμός πρωτοκόλλου της επιστολής κάθε επίσκεψης (κόκκινος)
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      const v = db.all('visits').find((x) => x.lodge === 'ΒΗΤΑ');
      await db.save('x', (tx) => { tx.insert('letters', { protocol_seq: 20550, protocol_no: '20550', status: 'ready', category: 'ΕΠΙΣΤΟΛΗ', subject: 'Εκπροσώπηση ΜΔ εις την Στοάν «ΒΗΤΑ» υπ’ αριθμ. 20', body: 'Σώμα επιστολής ΒΗΤΑ, γράψτε στο secret.person@example.com', recipient_name: 'ΕπΜΓρ. Αθηνών', cc_name: 'Πανσεβ. Αδ. Νικολαΐδης\\nrep.secret@example.com', letter_date: '2026-10-14' });
        tx.insert('letters', { protocol_seq: 20551, protocol_no: '20551', status: 'ready', category: 'ΕΠΙΣΚΕΨΗ', subject: 'Επίσημη Επίσκεψη', body: 'x', letter_date: '2026-10-14', visit_id: db.all('visits').find((x) => x.lodge === 'ΑΛΦΑ').id }); }); }""")
    app.go('/visits')
    cards = {c.locator('.vlodge a').first.inner_text(): c.locator('.vprot').all_inner_texts() for c in app.page.locator('.vcard').all()}
    assert cards['ΑΛΦΑ'] == ['Αρ. Πρωτ. 20551'] and cards['ΒΗΤΑ'] == ['Αρ. Πρωτ. 20550'] and cards['ΚΕΝΗ'] == [], cards
    app.go('/visits/gm-programme')
    prs = app.page.locator('.gmp-table td.pr').all_inner_texts()
    assert prs == ['20551', '20550'], prs
    lid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('letters').find((l) => l.protocol_seq === 20551).id")
    assert app.page.locator('.gmp-table td.pr a').first.get_attribute('href') == f'#/letters/{lid}/preview'
    app.page.locator('.gmp-table td.pr a').first.click()
    app.page.wait_for_url('**/preview')
    app.page.wait_for_selector('.lbar')
    assert app.page.locator('nav, .top, .mailsheet, [data-act=del]').count() == 0 and '20551' in app.text('.lbar')
    app.page.go_back()
    assert app.page.evaluate("() => getComputedStyle(document.querySelector('.gmp-table td.pr')).color") == 'rgb(179, 38, 30)'
    # το δημόσιο πρόγραμμα γράφεται στα δεδομένα
    app.page.click('[data-act=publish]')
    app.page.wait_for_selector('text=στάλθηκε για δημοσίευση')
    data = app.page.evaluate("async () => JSON.parse(new TextDecoder().decode(await (await import('./core/store.js')).db.file('public/programme.json')))")
    assert [r['lodge'] for r in data['rows']] == ['ΑΛΦΑ', 'ΒΗΤΑ'] and data['rows'][0]['gm'] == 1 and [r['protocol'] for r in data['rows']] == ['20551', '20550'] and 'email' not in json.dumps(data)
    # η δημόσια σελίδα το δείχνει (χωρίς σύνδεση)
    pub = app.page.context.new_page()
    old = {**data, 'rows': [{**r, 'letter_url': 'https://nglg-gsec.github.io/NGLG-Grand-Secretary/#/letters/1'} for r in data['rows']], 'salute': 'Σεβασμιώτατοι, Πανσεβάσμιοι, Λίαν Σεβαστοί και Σεβαστοί Αδελφοί,'}  # παλαιότερη δημοσίευση
    pub.route('**/programme/programme.json*', lambda r: r.fulfill(json=old))
    pub.goto(app.base + 'programme/')
    pub.wait_for_selector('table tbody tr')
    pt = pub.inner_text('body')
    assert pub.locator('td.pr').first.inner_text().strip() == '20551'
    assert pub.locator('td.pr a').first.get_attribute('href') == 'letter.html?p=20551'
    assert all('#/' not in (h or '') for h in pub.eval_on_selector_all('a', 'xs => xs.map((x) => x.getAttribute("href"))'))  # ποτέ σύνδεσμος στην εφαρμογή
    assert set(data['letters']) == {'20550', '20551'} and '@' not in json.dumps(data['letters'])
    # η προεπισκόπηση της επιστολής (χωρίς σύνδεση, χωρίς email)
    lp = app.page.context.new_page()
    lp.route('**/programme/programme.json*', lambda r: r.fulfill(json=data))
    lp.goto(app.base + 'programme/letter.html?p=20550')
    lp.wait_for_selector('.paper')
    lt = lp.inner_text('.paper')
    assert '20550' in lt and 'Σώμα επιστολής ΒΗΤΑ' in lt and 'Νικολαΐδης' in lt and '@' not in lt and 'Θέμα' in lt
    assert lp.locator('.lbar button', has_text='Εκτύπωση / PDF').count() == 1 and lp.evaluate("() => document.querySelector('.paper .head img').naturalWidth") > 0
    lp.goto(app.base + 'programme/letter.html?p=99999')
    lp.wait_for_selector('text=δεν είναι διαθέσιμη')
    lp.close()
    assert 'ΑΥΤΟΜΑΤΟ ΣΥΣΤΗΜΑ ΕΝΗΜΕΡΩΣΗΣ ΣΥΜΦΩΝΑ ΜΕ ΤΑ ΙΣΧΥΟΝΤΑ' in pt and 'Λίαν Σεβάσμιοι και Σεβάσμιοι Αδελφοί' in pt and 'Σεβαστοί' not in pt
    assert 'ΣΤΟ ΜΥΑΛΟ ΤΟΥ ΜΔ' in pt and pub.locator('#mda a[href="sto-myalo-tou-md.pdf"]').count() == 3
    assert pub.request.get(app.base + 'programme/sto-myalo-tou-md.pdf').body()[:5] == b'%PDF-'
    assert pub.evaluate("() => document.querySelector('.auto').compareDocumentPosition(document.querySelector('#mda')) & Node.DOCUMENT_POSITION_FOLLOWING")
    assert 'ΜΕΓΑΛΗ ΓΡΑΜΜΑΤΕΙΑ' in pt and '«ΑΛΦΑ»' in pt and 'Ο Μέγας Διδάσκαλος' in pt and pub.locator('tbody tr').count() == 2
    pub.close()


def test_remove_hashed_email_from_cc_lists(app):
    app.connect_local()
    r = app.page.evaluate("""async () => { const m = await import('./modules/settings.js'), h = m.emailHash('Gone.Person@Example.com');
      return [m.withoutHashed('a@x.gr, gone.person@example.com, b@x.gr', [h]), m.withoutHashed('Όνομα <gone.person@example.com>\\nc@x.gr', [h]), m.withoutHashed('a@x.gr, b@x.gr', [h]), m.withoutHashed(5, [h])]; }""")
    assert r == ['a@x.gr, b@x.gr', 'c@x.gr', 'a@x.gr, b@x.gr', 5], r


def test_letter_body_formatting_bar(app):
    app.connect_local()
    app.go('/letters/new')
    ta = app.page.locator('textarea[name=body]')
    ta.fill('Αγαπητέ Αδελφέ, σημαντική ανακοίνωση.')
    assert app.page.locator('.richbar button[data-w=b]').count() == 1
    app.page.evaluate("() => { const t = document.querySelector('textarea[name=body]'); t.setSelectionRange(0, 7); }")
    app.page.click('.richbar button[data-w=b]')
    app.page.evaluate("() => { const t = document.querySelector('textarea[name=body]'); const i = t.value.indexOf('σημαντική'); t.setSelectionRange(i, i + 9); }")
    app.page.click('.richbar button[data-w=i]')
    app.page.evaluate("() => { const t = document.querySelector('textarea[name=body]'); const i = t.value.indexOf('ανακοίνωση'); t.setSelectionRange(i, i + 10); }")
    app.page.select_option('.richbar select', '16')
    assert ta.input_value() == '[b]Αγαπητέ[/b] Αδελφέ, [i]σημαντική[/i] [size=16]ανακοίνωση[/size].'
    html = app.page.evaluate("async () => (await import('./core/paper.js')).letterPaper({ subject: 'x', body: document.querySelector('textarea[name=body]').value })")
    assert '<b>Αγαπητέ</b>' in html and '<i>σημαντική</i>' in html and 'font-size:16pt">ανακοίνωση' in html and '[b]' not in html
    plain = app.page.evaluate("async () => (await import('./core/mail.js')).gmailUrl({ to: 'a@b.gr', subject: 's', body: document.querySelector('textarea[name=body]').value })")
    assert '%5Bb%5D' not in plain and '[b]' not in plain


GOOGLE_CSV = '''First Name,Middle Name,Last Name,Organization Name,Organization Title,Notes,Labels,E-mail 1 - Label,E-mail 1 - Value,E-mail 2 - Label,E-mail 2 - Value,Phone 1 - Label,Phone 1 - Value
Άλφα,,Δοκιμαστής,ΜΑΞ,Μέγας Δοκιμαστής,"σημείωση

με γραμμές",Ομάδα Α ::: Διοίκηση ::: * myContacts,* ,alfa@example.com,,alfa2@example.com,Mobile,6900000001
Βήτα,,Δεύτερος,,,,Ομάδα Α ::: * myContacts,* ,beta@example.com ::: beta.old@example.com,,,,
,,Γραμματεία Δοκιμής,,,,Διοίκηση ::: * myContacts,* ,sec@example.com,,,,
Χωρίς,,Email,,,,Ομάδα Α,,,,,,
'''


def test_google_contacts_groups_in_letter_recipients(app, tmp_path):
    app.connect_local()
    f1, f2 = tmp_path / 'contacts.csv', tmp_path / 'contacts_1.csv'
    f1.write_text(GOOGLE_CSV, encoding='utf-8')
    f2.write_text(GOOGLE_CSV.splitlines()[0] + '\n' + GOOGLE_CSV.splitlines()[1] + '\n' + '\n'.join(GOOGLE_CSV.splitlines()[2:4]) + '\n', encoding='utf-8')
    app.go('/contacts')
    app.page.set_input_files('#gcsv', [str(f1), str(f2)])
    app.page.click('[data-act=imp]')
    app.page.wait_for_selector('text=Επαφές: 3 νέες')
    t = app.text()
    assert 'Ομάδα Α · 2' in t and 'Διοίκηση · 2' in t and 'Χωρίς Email' not in t and 'myContacts' not in t
    cs = app.page.evaluate("async () => (await import('./core/store.js')).db.all('contacts')")
    assert len(cs) == 3 and next(c for c in cs if c['name'] == 'Άλφα Δοκιμαστής')['emails'] == 'alfa@example.com, alfa2@example.com'
    # Επιστολή: Προς = ομάδα, Κοιν. = επαφή (προσθήκη στο έντυπο και στα email)
    app.go('/letters/new')
    app.page.fill('#rcptPick', 'Ομάδα')
    app.page.locator('#rcptPick + .picker-list button', has_text='Ομάδα Α').first.click()
    assert app.page.input_value('[name=recipient_name]') == 'Ομάδα Α'
    assert app.page.input_value('[name=recipient_email]') == 'alfa@example.com, beta@example.com'
    app.page.fill('#ccPick', 'Γραμματεία Δοκ')
    app.page.locator('#ccPick + .picker-list button', has_text='Γραμματεία Δοκιμής').first.click()
    assert app.page.input_value('[name=cc_name]') == 'Γραμματεία Δοκιμής'
    assert app.page.input_value('[name=recipient_email]') == 'alfa@example.com, beta@example.com, sec@example.com'
    app.page.fill('#emailPick', 'Διοίκ')
    app.page.locator('#emailPick + .picker-list button', has_text='Διοίκηση').first.click()
    assert app.page.input_value('[name=recipient_email]') == 'alfa@example.com, beta@example.com, sec@example.com'  # χωρίς διπλά


def test_registry_numbers_from_1200_permanent(app):
    gh = MockGitHub()
    connect_github(app, gh)
    app.page.wait_for_selector('.dash')
    # υπάρχοντα μέλη με παλιούς αριθμούς (Member_ID πηγής) → εφάπαξ νέα αλφαβητική αρίθμηση από το 1200
    rows = [{'id': 1, 'registry_no': 55, 'surname': 'Ωμέγας', 'first_name': 'Άγγελος', 'active': 1},
            {'id': 2, 'registry_no': 7, 'surname': 'Άλφας', 'first_name': 'Βασίλειος', 'active': 0, 'no_contact': 1},
            {'id': 3, 'registry_no': None, 'surname': 'Άλφας', 'first_name': 'Αθανάσιος', 'active': 1},
            {'id': 4, 'registry_no': 9, 'surname': 'μέσος', 'first_name': 'Γεώργιος', 'active': 1}]
    gh.external_commit('data/member_registry.json', json.dumps(rows, ensure_ascii=False))
    st = gh.read_json('data/settings.json')
    st['_migrations'] = ','.join(x for x in str(st.get('_migrations', '')).split(',') if x != 'registry-renumber-1200-2026-10')
    gh.external_commit('data/settings.json', json.dumps(st, ensure_ascii=False))
    app.page.reload()
    app.page.wait_for_selector('.dash')
    for _ in range(40):
        if app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry').every((m) => m.registry_no >= 1200)"):
            break
        app.page.wait_for_timeout(250)
    ms = {m['id']: m for m in app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry')")}
    assert [ms[i]['registry_no'] for i in (3, 2, 4, 1)] == [1200, 1201, 1202, 1203]  # Άλφας Αθ., Άλφας Βασ. (διαγραμμένος), μέσος, Ωμέγας
    assert ms[1]['source_member_id'] == 55 and ms[2]['source_member_id'] == 7 and ms[3].get('source_member_id') is None
    # νέο μέλος: επόμενος ελεύθερος αριθμός· ενημέρωση δεν αλλάζει τον αριθμό
    add_member(app, surname='Νέος', first='Δημήτριος', email='new@example.com')
    new = app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry').find((m) => m.surname === 'Νέος')")
    assert new['registry_no'] == 1204
    app.page.evaluate("async () => { const {db} = await import('./core/store.js'); const m = await import('./modules/members.js');"
                      " await db.save('x', (tx) => m.updateMember(tx, 1, { registry_no: 1, email: 'w@example.com' })); }")
    assert app.page.evaluate("async () => (await import('./core/store.js')).db.get('member_registry', 1).registry_no") == 1203


def test_member_title_from_epeteirida_in_registry(app):
    app.connect_local()
    add_member(app, surname='Τιτλοφόρος', first='Άγγελος', email='t@example.com')
    app.page.evaluate("async () => { const {db} = await import('./core/store.js'); const m = db.all('member_registry').find((x) => x.surname === 'Τιτλοφόρος');"
                      " await db.save('x', (tx) => tx.insert('epeteirida', { member_id: m.id, honorific: 'Λίαν Σεβάσμιος', full_name: 'Τιτλοφόρος Άγγελος' })); }")
    for _ in range(40):
        if app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry').find((x) => x.surname === 'Τιτλοφόρος').title") == 'Λίαν Σεβ. Αδ.':
            break
        app.page.wait_for_timeout(250)
    app.go('/members')
    assert 'Λίαν Σεβ. Αδ.' in app.text('.memtable')


def test_title_from_unlinked_epeteirida_row_and_abbreviated_honorific(app):
    # γραμμή της Επετηρίδας χωρίς σύνδεση με το Μητρώο (member_id) και προσφώνηση γραμμένη «Πσεβ.»
    app.connect_local()
    add_member(app, surname='ΔΟΜΕΣΤΙΧΟΣ', first='ΛΟΥΚΑΣ', email='dl@example.com')
    app.page.evaluate("async () => { const {db} = await import('./core/store.js');"
                      " await db.save('x', (tx) => tx.insert('epeteirida', { member_id: null, honorific: 'Πσεβ.', full_name: 'Δομεστίχος Λουκάς' })); }")
    t = app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); const n = await import('./modules/namedays.js');
      const m = db.all('member_registry').find((x) => x.email === 'dl@example.com'); return n.titleOf(m); }""")
    assert t == 'Πσεβ. Αδ.', t
    # η γραμμή συνδέεται μόνιμα με το Μητρώο· όσες αποσυνδέθηκαν ρητά (member_id 0) μένουν ασύνδετες
    app.page.evaluate("async () => { const {db} = await import('./core/store.js');"
                      " await db.save('y', (tx) => tx.insert('epeteirida', { member_id: 0, honorific: 'Σεβάσμιος', full_name: 'Δομεστίχος Λουκάς' })); }")
    links = []
    for _ in range(40):
        links = app.page.evaluate("async () => (await import('./core/store.js')).db.all('epeteirida').map((r) => [r.honorific, r.member_id])")
        if any(h == 'Πσεβ.' and mid for h, mid in links):
            break
        app.page.wait_for_timeout(250)
    mid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry').find((x) => x.email === 'dl@example.com').id")
    assert ['Πσεβ.', mid] in links and ['Σεβάσμιος', 0] in links, links
    lv = app.page.evaluate("async () => { const e = await import('./modules/epeteirida-table.js'); return ['Πανσεβάσμιος', 'Πσεβ. Αδ.', 'ΛΣεβ.', 'Σεβτ.', 'Σεβ.', 'Πανσεβάσμιος Αδελφός', 'κάτι'].map(e.honorificLevel); }")
    assert lv == [2, 2, 1, 3, 0, 2, None], lv

def test_contacts_linked_to_registry(app, tmp_path):
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); await db.save('x', (tx) => {
      tx.insert('member_registry', { surname: 'Δοκιμαστής', first_name: 'Άλφα', email: 'alfa.registry@example.com', other_emails: 'alfa@example.com', mobile: '', active: 1 }); }); }""")
    f = tmp_path / 'c.csv'
    f.write_text(GOOGLE_CSV, encoding='utf-8')
    app.go('/contacts')
    app.page.set_input_files('#gcsv', str(f))
    app.page.click('[data-act=imp]')
    app.page.wait_for_selector('text=Επαφές: 3 νέες')
    assert '✓ Μητρώο' in app.text() and 'alfa.registry@example.com' in app.text()
    g = app.page.evaluate("async () => (await import('./modules/contacts.js')).contactGroups().find((x) => x.name === 'Ομάδα Α').emails")
    assert g == ['alfa.registry@example.com', 'beta@example.com']  # το Μητρώο υπερισχύει


def test_registry_names_accented_from_official_calendar(app):
    app.connect_local()
    add_member(app, surname='ΔΟΜΕΣΤΙΧΟΣ', first='ΛΟΥΚΑΣ', email='l@example.com')
    add_member(app, surname='Παπας', first='Γεωργιος', email='g2@example.com')
    app.page.evaluate("async () => { const {db} = await import('./core/store.js'); const m = db.all('member_registry').find((x) => x.surname === 'Παπας');"
                      " await db.save('x', (tx) => tx.insert('epeteirida', { member_id: m.id, honorific: 'Σεβάσμιος', full_name: 'Παπάς Γεώργιος' })); }")
    names = []
    for _ in range(40):
        names = app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry').map((m) => [m.first_name, m.surname]).sort()")
        if ['Γεώργιος', 'Παπάς'] in names and ['Λουκάς', 'ΔΟΜΕΣΤΙΧΟΣ'] in names:
            break
        app.page.wait_for_timeout(250)
    assert ['Λουκάς', 'ΔΟΜΕΣΤΙΧΟΣ'] in names and ['Γεώργιος', 'Παπάς'] in names, names


def test_sure_duplicates_merged_once_with_backup(app):
    gh = MockGitHub()
    connect_github(app, gh)
    app.page.wait_for_selector('.dash')
    rows = [{'id': 1, 'registry_no': 1200, 'surname': 'Διπλός', 'first_name': 'Αναστάσιος', 'email': 'a@example.com', 'mobile': '', 'active': 1},
            {'id': 2, 'registry_no': 1201, 'surname': 'ΔΙΠΛΟΣ', 'first_name': 'ΑΝΑΣΤΑΣΙΟΣ', 'email': '', 'mobile': '6900000001', 'active': 1},
            {'id': 3, 'registry_no': 1202, 'surname': 'Συνώνυμος', 'first_name': 'Γεώργιος', 'email': '', 'mobile': '6911111111', 'active': 1},
            {'id': 4, 'registry_no': 1203, 'surname': 'Συνώνυμος', 'first_name': 'Γεώργιος', 'email': '', 'mobile': '6922222222', 'active': 1}]
    gh.external_commit('data/member_registry.json', json.dumps(rows, ensure_ascii=False))
    st = gh.read_json('data/settings.json')
    st['_migrations'] = ','.join(x for x in str(st.get('_migrations', '')).split(',') if x not in ('merge-sure-duplicates-2026-10', 'registry-renumber-1200-2026-10'))
    gh.external_commit('data/settings.json', json.dumps(st, ensure_ascii=False))
    app.page.reload()
    app.page.wait_for_selector('.dash')
    ms = []
    for _ in range(40):
        ms = app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry')")
        if len(ms) == 3:
            break
        app.page.wait_for_timeout(250)
    dipl = [m for m in ms if m['surname'].lower().startswith('διπλ')]
    assert len(dipl) == 1 and 'a@example.com' in (dipl[0]['email'] + (dipl[0].get('other_emails') or '')) and '6900000001' in (dipl[0]['mobile'] + (dipl[0].get('other_mobiles') or ''))
    assert len([m for m in ms if m['surname'] == 'Συνώνυμος']) == 2  # διαφορετικό κινητό: μένουν για έλεγχο
    assert any(p.startswith('files/backups/member_registry-before-merge-') for p in gh.files())


def test_small_lodges_report(app):
    # Στοές με λιγότερα από 12 κύρια μέλη: σειρά αρχαιότητας, δυναμικά φίλτρα στις επικεφαλίδες, PDF
    app.connect_local()
    add_member(app, surname='ΜΙΚΡΟΣΤΟΪΤΗΣ', first='ΑΝΤΩΝΙΟΣ', email='ms1@example.com', lodges='ΑΚΡΟΠΟΛΙΣ | 2 | 1. ΤΑΚΤΙΚΟ\nΠΑΡΘΕΝΩΝ | 3 | 2. ΣΥΝΔΕΔΕΜΕΝΟ')
    app.go('/members')
    assert app.page.locator('#mainnav a[href="#/members/small-lodges"]').count() == 1  # και στο μενού «Μητρώο»
    app.page.click('main a:has-text("Στοές με < 12 κύρια μέλη")')
    app.page.wait_for_selector('#slbody tr')
    nums = app.page.eval_on_selector_all('#slbody .c-number', 'xs => xs.map((x) => x.textContent)')
    assert nums[:2] == ['1', '2'] and nums == sorted(nums, key=lambda n: int(n) if n.isdigit() else 10**9), nums
    cnt = lambda n: app.page.eval_on_selector_all('#slbody tr', f"rs => rs.filter((r) => r.querySelector('.c-number').textContent === '{n}').map((r) => r.querySelector('.c-count').textContent)")
    assert cnt('2') == ['1'] and cnt('3') == ['0']  # μόνο το «1. ΤΑΚΤΙΚΟ» μετρά ως κύριο μέλος
    app.page.fill('#slf [data-f="number"]', '2-3')
    assert app.page.eval_on_selector_all('#slbody .c-number', 'xs => xs.map((x) => x.textContent)') == ['2', '3']
    app.page.select_option('#slf [data-f="count"]', '1')
    assert app.page.eval_on_selector_all('#slbody .c-number', 'xs => xs.map((x) => x.textContent)') == ['2']
    assert '(1)' in app.page.inner_text('#slf [data-f="provincial"]')
    with app.page.expect_download() as d:
        app.click('📄 Αναφορά PDF')
    assert d.value.suggested_filename.endswith('.pdf') and Path(d.value.path()).read_bytes()[:4] == b'%PDF'
    assert not app.errors, app.errors


def test_member_lodge_capacity_and_fee_rank(app):
    # Ιδιότητα μέλους κατά το Σύνταγμα (με τον κανόνα) και Στοά πλήρους συνδρομής / 2η / 3η (Κ. 269)
    app.connect_local()
    app.go('/members/new')
    opts = app.page.eval_on_selector_all('#mlrows [data-k=capacity] option', 'xs => xs.map((x) => x.textContent)')
    assert opts == ['—', 'Τακτικό — Κ. 166', 'Υιοθετημένο — Κ. 163', 'Επανελθόν — Κ. 163', 'Ομότιμο — Κ. 146', 'Επίτιμο — Κ. 146', 'Μέτοικο — Κ. 146', 'Αριστίνδην — Κ. 146', 'Ισόβιο', 'Θεράπων'], opts
    assert 'Στοά πλήρους συνδρομής — Κ. 269' in app.page.inner_text('#mlrows [data-k=fee_rank]')
    add_member(app, surname='ΙΔΙΟΤΗΤΑΣ', first='ΠΕΤΡΟΣ', email='cap@example.com', lodges='ΑΚΡΟΠΟΛΙΣ | 2 | ΕΝΕΡΓΟ | Υιοθετημένο | 1\nΠΑΡΘΕΝΩΝ | 3 | ΕΝΕΡΓΟ | Μέτοικο | 2')
    ls = app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); const m = db.all('member_registry').find((x) => x.email === 'cap@example.com');
      return db.all('member_lodges').filter((l) => l.member_id === m.id).map((l) => [l.lodge_number, l.capacity, l.fee_rank]); }""")
    assert sorted(ls) == [['2', 'Υιοθετημένο', 1], ['3', 'Μέτοικο', 2]], ls
    assert 'Υιοθετημένο · πλήρης συνδρ.' in app.text('.memtable') and 'Μέτοικο · 2η Στοά' in app.text('.memtable')
    # η παλιά κατάσταση «1. ΤΑΚΤΙΚΟ» προτείνει την ιδιότητα «Τακτικό»· δύο Στοές πλήρους συνδρομής δεν γίνονται δεκτές
    add_member(app, surname='ΠΑΛΑΙΟΣ', first='ΙΩΑΝΝΗΣ', email='old@example.com')
    mid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry').find((x) => x.email === 'old@example.com').id")
    app.go(f'/members/{mid}')
    assert app.page.locator('#mlrows [data-k=capacity]').input_value() == 'Τακτικό'
    set_lodges(app, 'ΠΑΡΘΕΝΩΝ | 3 | 1. ΤΑΚΤΙΚΟ | Τακτικό | 1\nΑΚΡΟΠΟΛΙΣ | 2 | ΕΝΕΡΓΟ | Τακτικό | 1')
    app.click('💾 Αποθήκευση')
    assert 'μόνο μία' in app.page.inner_text('body')
    # η εισαγωγή από το Excel-πηγή (χωρίς ιδιότητα/συνδρομή) δεν σβήνει όσα ορίστηκαν
    app.page.evaluate("""async () => { const M = await import('./modules/members.js'); const {db} = await import('./core/store.js'); const m = db.all('member_registry').find((x) => x.email === 'cap@example.com');
      await db.save('t', (tx) => M.updateMember(tx, m.id, { lodges: [{ name: 'ΑΚΡΟΠΟΛΙΣ', number: '2', status: 'ΕΝΕΡΓΟ' }, { name: 'ΠΑΡΘΕΝΩΝ', number: '3', status: 'ΕΝΕΡΓΟ' }] })); }""")
    ls = app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); const m = db.all('member_registry').find((x) => x.email === 'cap@example.com');
      return db.all('member_lodges').filter((l) => l.member_id === m.id).map((l) => [l.lodge_number, l.capacity, l.fee_rank]); }""")
    assert sorted(ls) == [['2', 'Υιοθετημένο', 1], ['3', 'Μέτοικο', 2]], ls


def test_member_degree_and_office_dates(app):
    # ημερομηνίες βαθμών (Μαθητής, Εταίρος, Διδάσκαλος), διαγραφής, και σε κάθε Στοά: ιδιότητας, Β΄/Α΄ Επόπτη, Σεβασμίου, διαγραφής
    app.connect_local()
    app.go('/members/new').fill(surname='ΗΜΕΡΟΜΗΝΙΑΣ', first_name='ΚΩΣΤΑΣ', email='dates@example.com', date_ea='2005-03-10', date_fc='2006-04-12', date_mm='2007-05-14')
    set_lodges(app, 'ΑΚΡΟΠΟΛΙΣ | 2 | ΕΝΕΡΓΟ | Υιοθετημένο | 1')
    r = app.page.locator('#mlrows .ml-lodge').first
    assert r.locator('.ml-capdate').inner_text() == 'Ημ. υιοθεσίας'
    for k, v in [('capacity_date', '2010-01-20'), ('jw_date', '2012-06-01'), ('sw_date', '2013-06-01'), ('wm_date', '2014-06-01')]:
        r.locator(f'[data-k={k}]').fill(v)
    app.click('💾 Αποθήκευση')
    app.wait_saved()
    m, ls = app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); const m = db.all('member_registry').find((x) => x.email === 'dates@example.com');
      return [[m.date_ea, m.date_fc, m.date_mm], db.all('member_lodges').filter((l) => l.member_id === m.id).map((l) => [l.capacity_date, l.jw_date, l.sw_date, l.wm_date, l.dereg_date])]; }""")
    assert m == ['2005-03-10', '2006-04-12', '2007-05-14'] and ls == [['2010-01-20', '2012-06-01', '2013-06-01', '2014-06-01', '']], (m, ls)
    assert 'Διδ. 14/05/2007' in app.text('.memtable')
    # η εισαγωγή χωρίς ημερομηνίες δεν τις σβήνει· οι ημερομηνίες Excel (15/3/2010) μετατρέπονται
    ls = app.page.evaluate("""async () => { const M = await import('./modules/members.js'); const {db} = await import('./core/store.js'); const m = db.all('member_registry').find((x) => x.email === 'dates@example.com');
      await db.save('t', (tx) => M.updateMember(tx, m.id, { lodges: [{ name: 'ΑΚΡΟΠΟΛΙΣ', number: '2', status: 'ΔΙΑΓΡΑΦΕΝ', dereg_date: '15/3/2020' }] }));
      return db.all('member_lodges').filter((l) => l.member_id === m.id).map((l) => [l.wm_date, l.dereg_date]); }""")
    assert ls == [['2014-06-01', '2020-03-15']], ls


def test_small_lodges_members_panel(app):
    # πάτημα σε Στοά → τα μέλη της με ιδιότητες, δυναμικά φίλτρα στις κατηγορίες, PDF μελών
    app.connect_local()
    add_member(app, surname='ΠΡΩΤΟΣ', first='ΑΛΕΞΑΝΔΡΟΣ', email='p1@example.com', lodges='ΑΚΡΟΠΟΛΙΣ | 2 | ΕΝΕΡΓΟ | Τακτικό | 1')
    add_member(app, surname='ΔΕΥΤΕΡΟΣ', first='ΒΑΣΙΛΕΙΟΣ', email='p2@example.com', lodges='ΑΚΡΟΠΟΛΙΣ | 2 | ΕΝΕΡΓΟ | Μέτοικο | 2')
    add_member(app, surname='ΤΡΙΤΟΣ', first='ΖΑΧΑΡΙΑΣ', email='p3@example.com', lodges='ΑΚΡΟΠΟΛΙΣ | 2 | ΕΝΕΡΓΟ | Επίτιμο')
    app.go('/members/small-lodges')
    assert app.page.locator('#slmem').is_hidden()
    app.page.click('#slbody tr[data-no="2"] .c-name')
    names = lambda: app.page.eval_on_selector_all('#slmbody tr td:nth-child(2)', 'xs => xs.map((x) => x.textContent.split(" ")[0])')
    assert 'ΑΚΡΟΠΟΛΙΣ' in app.page.inner_text('#slmtitle') and names() == ['ΠΡΩΤΟΣ', 'ΔΕΥΤΕΡΟΣ', 'ΤΡΙΤΟΣ'], names()
    assert 'Μέτοικο (1)' in app.page.inner_text('#slmf [data-m=capacity]')
    app.page.select_option('#slmf [data-m=primary]', 'ΝΑΙ')
    assert names() == ['ΠΡΩΤΟΣ']
    assert app.page.eval_on_selector_all('#slmf [data-m=capacity] option', 'xs => xs.map((x) => x.textContent)') == ['Όλα', 'Τακτικό (1)']
    app.click('✕ Φίλτρα')
    app.page.click('#slmchips [data-cap="Επίτιμο"]')
    assert names() == ['ΤΡΙΤΟΣ']
    with app.page.expect_download() as d:
        app.click('📄 PDF μελών')
    assert Path(d.value.path()).read_bytes()[:4] == b'%PDF'
    app.click('Κλείσιμο')
    assert app.page.locator('#slmem').is_hidden()
    assert not app.errors, app.errors


def test_letters_archive_protocol_actions_and_next_number(app):
    # Αρχείο Επιστολών: προσθήκη/αλλαγή αρ. πρωτοκόλλου από τις Ενέργειες, και αλλαγή του «επόμενου» αριθμού
    app.connect_local()
    seqs = lambda: app.page.evaluate("async () => (await import('./core/store.js')).db.all('letters').map((l) => [l.subject, l.protocol_seq, l.status])")
    app.go('/letters/new').fill(subject='Πρόχειρη', body='x').click('💾 Αποθήκευση')
    app.page.wait_for_url('**/#/letters/1')
    app.go('/letters')
    assert '20545' in app.text('#protonext')
    app.page.evaluate("window.prompt = (m, d) => d")
    app.click('➕ Αρ. πρωτοκόλλου')
    app.page.wait_for_selector('text=πήρε αριθμό πρωτοκόλλου')
    assert seqs() == [['Πρόχειρη', 20545, 'ready']]
    # χειροκίνητος αριθμός → η αρίθμηση συνεχίζει από εκεί
    app.go('/letters')
    app.page.evaluate("window.prompt = () => '30000'")
    app.click('✏ Αλλαγή αρ. πρωτ.')
    app.page.wait_for_selector('text=άλλαξε σε 30000')
    assert '30001' in app.text('#protonext')
    # ο «επόμενος» μπορεί να γίνει και μικρότερος· οι πιασμένοι αριθμοί παραλείπονται
    app.page.evaluate("window.prompt = () => '29999'")
    app.click('✏ Αλλαγή επόμενου αριθμού')
    app.page.wait_for_selector('text=επόμενος αριθμός πρωτοκόλλου είναι 29999')
    app.page.evaluate("window.prompt = (m, d) => d")
    app.go('/letters/new').fill(subject='Α', body='x').click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/2')
    app.go('/letters/new').fill(subject='Β', body='x').click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/3')
    assert sorted(s for _, s, _ in seqs()) == [29999, 30000, 30001], seqs()
    # μικρότερος χειροκίνητος αριθμός: «Άκυρο» στην ερώτηση = η αρίθμηση δεν επιστρέφει πίσω
    app.page.evaluate("window.prompt = () => '25000'; window.confirm = () => false")
    app.go('/letters/new').fill(subject='Γ', body='x').click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/4')
    app.go('/letters')
    assert '30002' in app.text('#protonext')
    assert not app.errors, app.errors


def test_letters_archive_pdf_download(app):
    """Αρχείο Επιστολών: σε κάθε γραμμή, δίπλα στον Αρ. Πρωτ., λήψη του PDF."""
    app.connect_local()
    app.go('/letters/new').fill(subject='Λήψη PDF', body='Κείμενο.').click('Αποθήκευση & απόδοση')
    app.page.wait_for_url('**/#/letters/1')
    app.go('/letters')
    with app.page.expect_download(timeout=60000) as dl:
        app.page.locator('tr', has_text='Λήψη PDF').locator('[data-act=dlpdf]').click()
    d = dl.value
    assert d.suggested_filename.endswith('.pdf') and '20545' in d.suggested_filename
    assert Path(d.path()).read_bytes()[:4] == b'%PDF'


def test_letters_archive_delete(app):
    # Αρχείο Επιστολών: «🗑 Διαγραφή» στις Ενέργειες, με ερώτηση επιβεβαίωσης
    app.connect_local()
    for subj in ['Να μείνει', 'Να διαγραφεί']:
        app.go('/letters/new').fill(subject=subj, body='x').click('💾 Αποθήκευση')
        app.page.wait_for_selector('text=Επεξεργασία')
    subjects = lambda: sorted(app.page.evaluate("async () => (await import('./core/store.js')).db.all('letters').map((l) => l.subject)"))
    app.go('/letters')
    row = app.page.locator('tr', has_text='Να διαγραφεί')
    app.page.evaluate("window.confirm = () => false")
    row.locator('[data-act=dellet]').click()
    app.page.wait_for_timeout(300)
    assert subjects() == ['Να διαγραφεί', 'Να μείνει']
    app.page.evaluate("window.confirm = (m) => { sessionStorage.setItem('q', m); return true; }")
    row.locator('[data-act=dellet]').click()
    app.page.wait_for_selector('text=Η επιστολή διαγράφηκε')
    assert subjects() == ['Να μείνει'] and 'Να διαγραφεί' in app.page.evaluate("sessionStorage.getItem('q')")
    assert 'Να διαγραφεί' not in app.text()
    assert not app.errors, app.errors


def test_decree_hmeis_artwork(app, tmp_path):
    # «ΗΜΕΙΣ» στα Διατάγματα: καλλιγραφική εικόνα, μεγάλη, πίσω από το κείμενο, με μικρό ύψος γραμμής· και στο Word
    import zipfile
    app.connect_local()
    add_member(app)
    app.go('/decrees/new')
    app.fill(matter='διορισμού Μεγάλων Αξιωματικών')
    app.page.select_option('#dOffice', 'Μέγας Γραμματεύς')
    app.pick('.registry-search', 'Παπαδ')
    app.click('Έκδοση Διατάγματος')
    app.page.wait_for_url('**/#/decrees/1')
    app.page.wait_for_function("() => { const i = document.querySelector('.decbody .hmeis img'); return i && i.complete && i.naturalWidth > 0; }")
    box = app.page.evaluate("""() => { const s = document.querySelector('.decbody .hmeis'), i = s.querySelector('img');
      return { span: s.getBoundingClientRect().height, img: i.getBoundingClientRect().height, z: getComputedStyle(i).zIndex }; }""")
    assert box['img'] > box['span'] * 1.5 and box['z'] == '-1', box  # η εικόνα είναι μεγαλύτερη από τον χώρο που πιάνει (πίσω από το κείμενο)
    assert not app.text('.decbody').startswith('ΗΜΕΙΣ') and 'ΔΙΟΡΙΖΟΜΕΝ' not in app.text('.decbody')
    assert app.page.locator('.decbody .diorizomen img[src$="img/diorizomen.png"]').count() >= 1
    with app.page.expect_download() as dl:
        app.click('⬇ Word')
    f = tmp_path / 'd.docx'
    dl.value.save_as(f)
    with zipfile.ZipFile(f) as z:
        sizes = [z.getinfo(n).file_size for n in z.namelist() if n.startswith('word/media/')]
        doc = z.read('word/document.xml').decode()
    assert all(Path(f'img/{n}.png').stat().st_size in sizes for n in ['hmeis', 'diorizomen']) and '>ΗΜΕΙΣ<' not in doc and '>ΔΙΟΡΙΖΟΜΕΝ<' not in doc, sizes
    # Διάταγμα απονομής: «ΑΠΟΝΕΜΕΙ» ως καλλιγραφική εικόνα
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); const d = db.all('decree_documents')[0];
      await db.save('t', (tx) => tx.update('decree_documents', d.id, { body: d.body.replace('ΔΙΟΡΙΖΟΜΕΝ', 'ΑΠΟΝΕΜΕΙ') })); }""")
    app.go('/decrees/1')
    assert app.page.locator('.decbody .aponemei img[src$="img/aponemei.png"]').count() >= 1 and 'ΑΠΟΝΕΜΕΙ' not in app.text('.decbody')
    assert not app.errors, app.errors


def test_visits_link_to_declarations(app):
    # Επισκέψεις Στοών: κουμπί «🗳 Δηλώσεις διάθεσης» προς την αναφορά δηλώσεων των Μ. Αξιωματικών
    app.connect_local()
    app.go('/visits')
    b = app.page.locator('main a.btn', has_text='Δηλώσεις διάθεσης')
    assert b.count() == 1 and b.get_attribute('href') == '#/declarations'


def test_declarations_single_page_report_needs_code(app):
    # Μία σελίδα δηλώσεων· η «Διαχειριστική Αναφορά & PDF» ανοίγει την καρτέλα της αναφοράς, όπου ζητείται κωδικός
    app.connect_local()
    app.go('/declarations')
    src = lambda: app.page.get_attribute('#declFrame', 'src')
    assert src().endswith('?embed=1#form') and app.page.locator('.decltabs button').count() == 3
    app.page.click('.decltabs [data-view=report]')
    assert src().endswith('?embed=1#report')
    app.go('/settings')
    assert 'Κωδικός αναφοράς' not in app.text()
def test_declarations_constitution_helper_and_decree_signature(app):
    app.connect_local()
    app.page.route('https://script.google.com/**', lambda r: r.fulfill(json={'ok': True, 'data': {}}))
    app.go('/declarations')
    app.page.click('.decltabs [data-view=report]')
    assert app.page.locator('#declFrame').get_attribute('src') == 'declarations/?embed=1#report'
    df = app.page.frame_locator('#declFrame')
    df.locator('#officer-filter').first.wait_for(state='attached')
    fr = [f for f in app.page.frames if '/declarations/' in f.url][0]
    fr.wait_for_function("() => typeof officerOf === 'function' && document.querySelectorAll('#officer-select option').length > 2")
    assert fr.evaluate("() => getComputedStyle(document.querySelector('.nav-tabs')).display") == 'none'  # ένα μόνο μενού
    assert fr.evaluate("() => { const o = officerOf('Λσεβ. Αδ. Χρήστος Διαβάτης, ΠΜΞ'); return o && officerValue(o); }") == 'Διαβάτης Χρήστος (Βοηθός Μέγας Γραμματεύς)'
    assert 'ΘΕΜΙΣΤΟΚΛΗΣ 96' in fr.evaluate("() => officerValue(OFFICERS.find((o) => o.name === 'Σκιαδόπουλος Σπυρίδων του Μιχαήλ'))")
    # Ο Μ.Δ. σε ξεχωριστό μπλε πλαίσιο· στη λίστα πρώτα οι εν ενεργεία, μετά οι Πρώην, με τη σειρά της Επετηρίδας
    assert 'Μπενετάτος' in df.locator('.gm-line').inner_text()
    opts = fr.evaluate("() => [...document.querySelectorAll('#officer-select option')].map((o) => [o.className, (o.parentElement.label || ''), o.textContent])")
    heads = [i for i, o in enumerate(opts) if o[0] == 'sect']
    assert len(heads) == 2 and 'ΕΝ ΕΝΕΡΓΕΙΑ' in opts[heads[0]][2] and 'ΠΡΩΗΝ' in opts[heads[1]][2]
    assert not any(o[1].startswith('Πρώην') for o in opts[heads[0]:heads[1]]) and all(o[1].startswith('Πρώην') for o in opts[heads[1] + 1:])
    ranks = lambda xs: [int(o[2].split('.')[0]) for o in xs if o[0] != 'sect']
    assert ranks(opts[heads[0]:heads[1]]) == sorted(ranks(opts[heads[0]:heads[1]])) and ranks(opts[heads[1]:]) == sorted(ranks(opts[heads[1]:]))
    assert not any('Μπενετάτος' in o[2] for o in opts)
    # Αριθμοί πεδίων, χωρίς χειροκίνητο πεδίο· η αναζήτηση αφήνει μόνο τα ονόματα που ταιριάζουν (και τα αξιώματά τους)
    assert df.locator('#officer-manual').count() == 0 and df.locator('.fno', has_text='1.2').count() == 1
    fr.evaluate("() => buildOfficerSelect('σκιαδ')")  # η σελίδα είναι στην αναφορά· το φίλτρο καλείται απευθείας
    left = fr.evaluate("() => { const s = document.getElementById('officer-select'); return [[...s.options].filter((o) => o.value).map((o) => o.textContent), s.querySelectorAll('optgroup').length, s.size]; }")
    assert len(left[0]) == 3 and all('Σκιαδόπουλος' in t for t in left[0]) and left[1] == 3 and left[2] > 1, left
    fr.evaluate("() => buildOfficerSelect('διαβατ')")
    assert fr.evaluate("() => document.getElementById('officer-select').value") == 'Διαβάτης Χρήστος (Βοηθός Μέγας Γραμματεύς)'
    fr.evaluate("() => buildOfficerSelect('')")
    app.go('/declarations?view=form')  # παλιός σύνδεσμος → η μία σελίδα
    app.page.wait_for_selector('#declFrame')
    assert app.page.url.endswith('#/declarations')
    # Το Σύνταγμα δεν εμφανίζεται πουθενά στην εφαρμογή· μόνο η αυτόνομη σελίδα constitution/
    assert 'Συντάγματ' not in app.text() and app.page.locator('#constFrame, .constitution-box, #constLink').count() == 0
    app.go('/portal')
    assert app.page.locator('a[href*="constitution"]').count() == 0
    app.go('/')  # μόνο πλακίδιο στην Αρχική, που ανοίγει την αυτόνομη σελίδα
    t = app.page.locator('.dtile', has_text='📜 Σύνταγμα')
    assert t.count() == 1 and t.locator('a.btn').get_attribute('href') == 'constitution/' and t.locator('a.btn').get_attribute('target') == '_blank'
    cp = app.page.context.new_page()
    cp.goto(app.page.url.split('#')[0] + 'constitution/')
    cp.locator('#emptyState').first.wait_for(state='attached')
    w = cp.evaluate("() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]")
    assert w[0] <= w[1] + 1, w  # χωρίς οριζόντια υπερχείλιση
    assert cp.locator('a[href*="#/"]').count() == 0  # χωρίς συνδέσμους προς την εφαρμογή
    # PDF του Συντάγματος: προβολή και λήψη
    assert cp.locator('a.pdf-btn[href="constitution.pdf"][target=_blank]').count() == 1 and cp.locator('a.pdf-btn[download]').count() == 1
    assert (ROOT / 'constitution' / 'constitution.pdf').read_bytes()[:5] == b'%PDF-'
    cp.close()
    # Διατάγματα: η υπογραφή έμεινε ως είχε (δεν είναι χαιρετισμός)
    html = app.page.evaluate("async () => (await import('./core/paper.js')).reportPaper('x', '', '', { signatures: true })")
    assert 'ΜΕΓΑΣ ΓΡΑΜΜΑΤΕΑΣ' in html and 'Με αφοσίωση' not in html


def test_declarations_gm_decision_on_the_spot(browser, base_url):
    # Αναφορά (με κωδικό): ο Μ.Δ. επιλέγει εκπρόσωπο ανάμεσα σε όσους δήλωσαν ή «αυτοπροσώπως»·
    # η απόφαση φαίνεται στις κάρτες της Δήλωσης (όχι πίνακας στο «Πρόγραμμα Επισκέψεων Μ.Δ.»)
    import json
    decided = {}

    def api(route):
        b = json.loads(route.request.post_data or '{}')
        a = b.get('action')
        if a == 'report':
            out = {'ok': b.get('key') == 'test-key', 'decisions': decided,
                   'data': {'atlas_118': [{'officer': 'Διαβάτης Χρήστος (Βοηθός Μέγας Γραμματεύς)', 'rank': 283}]}}
        elif a == 'decide':
            assert b.get('key') == 'test-key'
            decided[b['meeting']] = b['representative']
            out = {'ok': True, 'decisions': decided}
        elif a == 'decisions':
            out = {'ok': True, 'decisions': decided}
        else:
            out = {'ok': True}
        route.fulfill(json=out)

    page = browser.new_page()
    page.route('https://script.google.com/**', api)
    page.route('https://accounts.google.com/**', lambda r: r.abort())
    page.goto(base_url + 'declarations/#report')
    page.evaluate("document.getElementById('auth-alt').open = true")
    page.fill('#admin-pass', 'test-key')
    page.click('#auth-btn')
    sel = page.locator('#report-table-body tr').nth(1).locator('.decide-select')
    sel.wait_for()
    opts = sel.locator('option').all_inner_texts()
    assert 'Χωρίς απόφαση' in opts[0] and 'αυτοπροσώπως' in opts[1] and 'Διαβάτης' in opts[2]
    sel.select_option('Διαβάτης Χρήστος (Βοηθός Μέγας Γραμματεύς)')
    page.wait_for_selector('.decide-state.ok')
    page.locator('#report-table-body tr').nth(0).locator('.decide-select').select_option('Ο Μέγας Διδάσκαλος (αυτοπροσώπως)')
    page.wait_for_function("document.querySelectorAll('.decide-state.ok').length === 2")
    assert decided == {'atlas_118': 'Διαβάτης Χρήστος (Βοηθός Μέγας Γραμματεύς)', 'akropolis_104': 'Ο Μέγας Διδάσκαλος (αυτοπροσώπως)'}
    page.goto(base_url + 'declarations/#programme')
    assert page.locator('#decisions-body').count() == 0 and 'Αποφάσεις Μεγάλου Διδασκάλου' not in page.locator('#programme-view').inner_text()
    page.goto(base_url + 'declarations/#form')
    page.wait_for_selector('.meeting-decision')
    assert 'Διαβάτης' in page.locator('.meeting-card', has_text='ΑΤΛΑΣ').inner_text()
    page.close()


def test_gm_decisions_in_app_with_declarations(app):
    # ③ Αποφάσεις Μ.Δ. μέσα στην εφαρμογή, πάνω στις Επισκέψεις: δηλώσεις διάθεσης (κωδικός, μόνο στην καρτέλα), απόφαση της σελίδας Δηλώσεων
    # (παλιοί κωδικοί του config.js), επιλογή και αποθήκευση· ο εκπρόσωπος φαίνεται στην καρτέλα του μέλους
    app.connect_local()
    import json as _j
    def api(route):
        b = _j.loads(route.request.post_data or '{}')
        if b.get('action') == 'decisions':
            return route.fulfill(json={'ok': True, 'decisions': {'atlas_118': 'Διαβάτης Χρήστος (Βοηθός Μέγας Γραμματεύς)'}})
        if b.get('action') == 'report':
            ok = b.get('key') == 'kleidi'
            return route.fulfill(json={'ok': ok, 'error': '' if ok else 'unauthorized', 'data': {'l104_20261102': [{'officer': 'Διαβάτης Χρήστος (Βοηθός Μέγας Γραμματεύς)', 'rank': 5}]}})
        return route.fulfill(json={'ok': False, 'error': 'unknown_action'})
    app.page.route('https://script.google.com/**', api)
    add_member(app, surname='Διαβάτης', first='Χρήστος', email='d@example.com', mobile='6977000123')
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); const m = db.all('member_registry').find((x) => x.surname === 'Διαβάτης');
      await db.save('x', (tx) => { tx.replace('visits', []);
        tx.insert('reps', { name: 'Χρήστος', surname: 'Διαβάτης', office: 'Βοηθός Μέγας Γραμματεύς', email: '', mobile: '', member_id: m.id });
        tx.insert('visits', { visit_date: '2026-11-02', lodge: 'ΑΤΛΑΣ', lodge_number: '118', location: '', province: 'ΕπΜΣτ. Πειραιώς', rep_id: null, notes: '' });
        tx.insert('visits', { visit_date: '2026-11-02', lodge: 'ΑΚΡΟΠΟΛΙΣ', lodge_number: '104', location: '', province: 'ΕπΜΣτ. Αθηνών', rep_id: null, notes: '' }); });
      sessionStorage.setItem('nglg-decl-key', 'kleidi'); }""")
    app.go('/visits/decisions')
    app.page.wait_for_selector('text=1 δηλώσεις διάθεσης')
    atlas = app.page.locator('.gd-card', has_text='ΑΤΛΑΣ'); akro = app.page.locator('.gd-card', has_text='ΑΚΡΟΠΟΛΙΣ')
    assert 'Απόφαση στη σελίδα Δηλώσεων' in atlas.inner_text() and '✋ Δήλωσαν' in akro.inner_text()
    atlas.locator('.gd-decl [data-pick]').click()
    akro.locator('.gd-decl [data-pick]').click()
    app.page.click('#gdSave')
    app.page.wait_for_selector('text=Αποθηκεύτηκαν 2 αποφάσεις')
    st = app.page.evaluate("async () => { const {db} = await import('./core/store.js'); return db.all('visits').map((v) => (db.get('reps', v.rep_id) || {}).surname); }")
    assert st == ['Διαβάτης', 'Διαβάτης'], st
    # Μητρώο: η καρτέλα του μέλους δείχνει τις εκπροσωπήσεις του ΜΔ
    mid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry').find((x) => x.surname === 'Διαβάτης').id")
    app.go(f'/members/{mid}')
    t = app.text('.mv-card')
    assert 'Εκπροσωπήσεις του Μεγάλου Διδασκάλου' in t and 'ΑΤΛΑΣ' in t and 'ΑΚΡΟΠΟΛΙΣ' in t, t
    # η σελίδα Δηλώσεων παίρνει τις Εργασίες από τις Επισκέψεις (κοινός κωδικός)
    ms = app.page.evaluate("async () => (await import('./modules/visits.js')).publicMeetings('2026-10-24').map((m) => m.id + ' ' + m.date)")
    assert 'l104_20261102 Δευτέρα 02/11/2026' in ms and 'l118_20261102 Δευτέρα 02/11/2026' in ms, ms


def test_decree_design_header_builder_and_office_image(app):
    # Σχεδίαση σελίδας Διατάγματος: builder κεφαλίδας κειμένων και εικόνα αξιώματος 90×90 στο κέντρο-δεξιά, στο ύψος του αξιώματος
    app.connect_local()
    tid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('letter_templates').find((t) => t.key === 'decree-appoint').id")
    app.go(f'/templates/{tid}/design')
    app.page.check('#hdOn')
    app.page.locator('.hd-line input[data-f=text]').first.fill('ΚΕΦΑΛΙΔΑ ΔΟΚΙΜΗΣ')
    app.page.click('[data-hd=add]')
    app.page.locator('.hd-line input[data-f=text]').last.fill('Γραμμή χρυσή')
    app.page.locator('.hd-line select[data-f=color]').last.select_option('gold')
    app.page.set_input_files('input[data-up=office]', str(ROOT / 'programme' / 'emblem.jpg'))
    app.page.wait_for_selector('#dzp .dec-office-img')
    # όνομα του Αδελφού έντονα 20px· το ΗΜΕΙΣ δεν ακουμπά τη γραμμή «υπ’ αριθμ. …, ημερ. …»· εικόνα «ΔΙΟΡΙΖΟΜΕΝ & ΕΝΔΥΟΜΕΝ»
    st = app.page.evaluate("""() => { const p = document.querySelector('#dzp .paper').getBoundingClientRect(), mm = p.width / 210, g = (s) => document.querySelector('#dzp ' + s).getBoundingClientRect(),
      n = getComputedStyle(document.querySelector('#dzp .dec-name')); return { name: document.querySelector('#dzp .dec-name').textContent, w: n.fontWeight, fs: n.fontSize,
      gap: (g('.hmeis img').top - g('.dec-no').bottom) / mm, no: document.querySelector('#dzp .dec-no').textContent, dio: g('.diorizomen img').width / g('.diorizomen img').height }; }""")
    assert st['name'] == 'Ιωάννην Παπαδόπουλον' and st['w'] == '700' and st['fs'] == '20px' and st['gap'] > 1.5 and ', ημερ. ' in st['no'] and 1.8 < st['dio'] < 2.6, st
    head = app.text('#dzp .head-custom')
    assert 'ΚΕΦΑΛΙΔΑ ΔΟΚΙΜΗΣ' in head and 'Γραμμή χρυσή' in head
    b = app.page.evaluate("""() => { const p = document.querySelector('#dzp .paper').getBoundingClientRect(), mm = p.width / 210,
      i = document.querySelector('#dzp .dec-office-img').getBoundingClientRect(), s = document.querySelector('#dzp .dec-office').getBoundingClientRect();
      return { left: (i.left - p.left) / mm, right: (i.right - p.left) / mm, w: i.width / mm, txtRight: (s.right - p.left) / mm,
        dy: Math.abs((i.top + i.bottom) / 2 - (s.top + s.bottom) / 2) / mm }; }""")
    assert abs(b['left'] - 150) < 1 and b['right'] < 194 and abs(b['w'] - 90 * 25.4 / 96) < 1 and b['txtRight'] < b['left'] and b['dy'] < 1.5, b
    # σύρσιμο του πλαισίου «Αξίωμα»: 10 mm δεξιά και 5 mm κάτω· η γωνία ◢ μεγαλώνει την εικόνα
    def drag(sel, dx_mm, dy_mm):
        pw = app.page.evaluate("document.querySelector('#dzp .paper').getBoundingClientRect().width")
        r = app.page.locator(sel).bounding_box()
        x, y = r['x'] + r['width'] / 2, r['y'] + r['height'] / 2
        app.page.mouse.move(x, y); app.page.mouse.down()
        app.page.mouse.move(x + dx_mm * pw / 210, y + dy_mm * pw / 210, steps=5); app.page.mouse.up()
    drag('#dzp .dz-office', 10, 5)
    assert abs(float(app.page.input_value('[data-o=x]')) - 160) < 0.6 and abs(float(app.page.input_value('[data-o=dy]')) - 5) < 0.6
    drag('#dzp .dz-office .dz-h', 5, 0)
    assert int(app.page.input_value('[data-o=size]')) > 100
    app.page.click('[data-opreset=default]')
    assert app.page.input_value('[data-o=x]') == '150' and app.page.input_value('[data-o=size]') == '90'
    app.click('💾 Αποθήκευση σχεδίασης')
    app.page.wait_for_timeout(500)
    L = app.page.evaluate(f"async () => (await import('./core/store.js')).db.get('letter_templates', {tid}).layout")
    assert L['head']['on'] and L['head']['lines'][0]['text'] == 'ΚΕΦΑΛΙΔΑ ΔΟΚΙΜΗΣ' and L['office']['file'].endswith('.jpg') and L['office']['size'] == 90
    # Word: η κεφαλίδα του builder περνά και στο έγγραφο
    n = app.page.evaluate("async () => { const { letterBlocks } = await import('./core/docx.js'); return letterBlocks({ head: { emblem: true, lines: [{ text: 'Α', size: 22, bold: true, hex: '1F355D' }, { text: 'Β', size: 11 }] }, paragraphs: [] }).filter((b) => b.text === 'Α' || b.text === 'Β').length; }")
    assert n == 2


def test_decree_diorizomen_builder_and_appoint_matter(app):
    # ΔΙΟΡΙΖΟΜΕΝ: πλάτος/ύψος και κάθετη θέση από τη Σχεδίαση σελίδας, πάντα στο κέντρο· «Περί Διορισμού Μεγάλων Αξιωματικών»
    app.connect_local()
    tid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('letter_templates').find((t) => t.key === 'decree-appoint').id")
    app.go(f'/templates/{tid}/design')
    app.page.wait_for_selector('#dzp .act-art.diorizomen')
    geo = """() => { const p = document.querySelector('#dzp .paper').getBoundingClientRect(), mm = p.width / 210, a = document.querySelector('#dzp .act-art.diorizomen').getBoundingClientRect();
      return { cx: ((a.left + a.right) / 2 - p.left) / mm, w: a.width / mm, h: a.height / mm, top: (a.top - p.top) / mm }; }"""
    g0 = app.page.evaluate(geo)
    assert abs(g0['w'] - 45) < 0.6 and abs(g0['h'] - 20.7) < 0.6 and abs(g0['cx'] - 105) < 2, g0
    assert 'Κανονισμών,\nπερί Διορισμού Μεγάλων Αξιωματικών,' in app.text('#dzp .decbody')  # χωρίς κενή γραμμή ανάμεσα
    app.page.fill('[data-a=w]', '60')
    g1 = app.page.evaluate(geo)
    assert abs(g1['w'] - 60) < 0.6 and abs(g1['h'] - 60 * 0.4608) < 0.6 and abs(g1['cx'] - 105) < 2, g1
    app.page.uncheck('#dLock'); app.page.fill('[data-a=h]', '15')
    app.page.fill('[data-a=dy]', '-4')
    g2 = app.page.evaluate(geo)
    assert abs(g2['h'] - 15) < 0.6 and abs(g2['w'] - 60) < 0.6 and abs(g2['top'] - (g1['top'] - 4)) < 0.8 and abs(g2['cx'] - 105) < 2, (g1, g2)
    app.click('💾 Αποθήκευση σχεδίασης')
    app.page.wait_for_timeout(500)
    L = app.page.evaluate(f"async () => (await import('./core/store.js')).db.get('letter_templates', {tid}).layout")
    assert L['dior']['w'] == 60 and L['dior']['h'] == 15 and L['dior']['dy'] == -4, L
    # Νέο Διάταγμα: με ΔΙΟΡΙΖΟΜΕΝ το «Περί» συμπληρώνεται, και η εικόνα μπαίνει στη θέση του ΔΙΟΡΙΖΟΜΕΝ
    app.go('/decrees/new')
    app.page.wait_for_selector('#df')
    assert app.page.input_value('[name=matter]') == 'Διορισμού Μεγάλων Αξιωματικών'
    app.page.select_option('#dAction', 'award')
    assert app.page.input_value('[name=matter]') == ''
    app.page.select_option('#dAction', 'appoint')
    assert app.page.input_value('[name=matter]') == 'Διορισμού Μεγάλων Αξιωματικών'
    app.go(f'/templates/{tid}/design')
    app.page.wait_for_selector('#dzp .act-art.diorizomen')
    assert not app.page.is_visible('#dOrig')  # χωρίς δική του εικόνα: όχι «Αρχική εικόνα»
    app.page.set_input_files('input[data-up=dior]', str(ROOT / 'img' / 'diorizomen.png'))
    app.page.wait_for_selector('#dOrig', state='visible')
    app.page.click('#dOrig')
    assert not app.page.is_visible('#dOrig') and app.page.input_value('[data-a=w]') == '45'


def test_declarations_protocol_and_report_need_code(browser, base_url):
    # «🔒 ΠΡΩΤΟΚΟΛΛΟ ΕΞΕΡΧΟΜΕΝΩΝ» και «🔒 Διαχειριστική Αναφορά»: φαίνονται πάντα, ανοίγουν μόνο με τον κωδικό (έλεγχος στον server)
    import json
    page = browser.new_page()
    page.route('https://accounts.google.com/**', lambda r: r.abort())
    page.context.route('https://drive.google.com/**', lambda r: r.fulfill(body='drive'))
    page.route('https://script.google.com/**', lambda r: r.fulfill(json={'ok': json.loads(r.request.post_data or '{}').get('key') == 'test-key', 'data': {}, 'decisions': {}}))
    page.goto(base_url + 'declarations/#form')
    assert page.is_visible('.tab-btn[data-view=report]')
    assert page.locator('a[href*="drive.google.com"]').count() == 0  # ο σύνδεσμος δεν είναι ανοιχτός στη σελίδα
    page.click('button.header-link')
    page.fill('#protocol-pass', 'wrong')
    page.click('#protocol-dlg .btn-submit')
    page.wait_for_selector('#protocol-msg.error')
    assert 'Λανθασμένος' in page.inner_text('#protocol-msg')
    with page.context.expect_page() as popup:
        page.fill('#protocol-pass', 'test-key')
        page.click('#protocol-dlg .btn-submit')
    popup.value.wait_for_url('https://drive.google.com/**')
    assert not page.is_visible('#protocol-dlg')
    page.close()
    page = browser.new_page()
    page.route('https://accounts.google.com/**', lambda r: r.abort())
    page.route('https://script.google.com/**', lambda r: r.fulfill(json={'ok': json.loads(r.request.post_data or '{}').get('key') == 'test-key', 'data': {}, 'decisions': {}}))
    page.goto(base_url + 'declarations/#report')
    assert page.is_visible('#admin-pass')  # κωδικός πρώτα, χωρίς άνοιγμα πτυσσόμενου
    page.fill('#admin-pass', 'test-key')
    page.press('#admin-pass', 'Enter')
    page.wait_for_selector('#report-content', state='visible')
    page.close()


def test_master_mason_diplomas_registry_codes_and_import(app, tmp_path):
    # Δίπλωμα Διδασκάλου Τέκτονος: αρ. μητρώου MM<δίπλωμα>, αλλιώς M<αριθμός>· εισαγωγή Excel με ημερομηνίες και Στοά Εγέρσεως,
    # αντιστοίχιση και συγκρούσεις· ανά Στοά, αναζήτηση, πρότυπο Excel και εκτύπωση Διπλώματος
    from openpyxl import Workbook
    app.connect_local()
    ids = app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); const {insertMember} = await import('./modules/members.js'); let a, b, c;
      await db.save('x', (tx) => { a = insertMember(tx, { surname: 'Διπλωματούχος', first_name: 'Πέτρος', lodges: [{ name: 'ΑΘΗΝΑ', number: '1', status: 'ΕΝΕΡΓΟ' }] });
        b = insertMember(tx, { surname: 'Άλλος', first_name: 'Νίκος', lodges: [{ name: 'ΑΘΗΝΑ', number: '1', status: 'ΕΝΕΡΓΟ' }] });
        c = insertMember(tx, { surname: 'Κάτοχος', first_name: 'Γιώργος', diploma_no: '777', date_ea: '2001-01-01' }); }); return [a, b, c]; }""")
    reg = app.page.evaluate(f"async () => (await import('./core/store.js')).db.get('member_registry', {ids[0]}).registry_no")
    wb = Workbook(); ws = wb.active
    ws.append(['Ονοματεπώνυμο', 'Αρ. Διπλώματος', 'Ημ. Εισδοχής (Μαθητής)', 'Ημ. Διελεύσεως (Εταίρος)', 'Ημ. Εγέρσεως (Διδάσκαλος)', 'Στοά Εγέρσεως', 'Αρ. Στοάς Εγέρσεως'])
    ws.append(['Διπλωματούχος Πέτρος', 24680, '15/03/2010', '20/11/2010', '10/06/2011', 'Σεβ. Στοά «ΑΘΗΝΑ»', 1])
    ws.append(['Άλλος Νίκος', 777, '', '', '', '', '']); ws.append(['Ανύπαρκτος Τάδε', 999, '', '', '', '', ''])
    ws.append(['Κάτοχος Γιώργος', 777, '2002-02-02', '', '', '', ''])
    f = tmp_path / 'diplomas.xlsx'; wb.save(f)
    app.go('/members')
    app.page.click('a.btn:has-text("🎓 Διπλώματα Διδασκάλου")')
    app.page.click('a.btn:has-text("⬆ Εισαγωγή Excel")')
    with app.page.expect_download() as dl:
        app.page.click('[data-act=template]')
    assert dl.value.suggested_filename == 'Πρότυπο Διπλωμάτων Διδασκάλου.xlsx'
    app.page.set_input_files('#dpFile', str(f))
    app.page.wait_for_selector('#dpApply')
    t = app.text('#dpPlan')
    assert 'Θα συμπληρωθεί' in t and 'Δεν βρέθηκε' in t and 'Ο αριθμός υπάρχει δύο φορές στο αρχείο' in t and 'Διδάσκαλος: 10/06/2011' in t and 'Στοά Εγέρσεως: ΑΘΗΝΑ' in t, t
    app.pick('.dpPick', 'Κάτοχ')  # χειροκίνητη επιλογή για το «Ανύπαρκτος Τάδε» (999)
    app.page.wait_for_function("() => !document.querySelector('.dpPick') && document.querySelector('#dpPlan').innerText.includes('(επιλογή)')")
    app.page.click('#dpApply')
    app.page.wait_for_selector('.memtable .regno.mm:has-text("MM24680")')
    m = app.page.evaluate(f"async () => {{ const {{db}} = await import('./core/store.js'); const {{regCode}} = await import('./core/people.js'); return [{ids[0]}, {ids[1]}, {ids[2]}].map((i) => {{ const m = db.get('member_registry', i); return [regCode(m), m.date_ea, m.date_fc, m.date_mm, m.mm_lodge_name, m.mm_lodge_number, m.degree]; }}); }}")
    assert m[0] == ['MM24680', '2010-03-15', '2010-11-20', '2011-06-10', 'ΑΘΗΝΑ', '1', 'Διδάσκαλος'], m
    assert m[1][0] == f"M{reg + 1}" and m[2][0] == 'MM777', m  # ο 777 είναι δύο φορές στο αρχείο: δεν καταχωρίζεται
    # αναζήτηση με τον κωδικό (και με ελληνικό «Μ»)
    for q in ['MM24680', 'ΜΜ24680', '24680']:
        app.go('/members?q=' + q + '&field=all')
        assert 'Διπλωματούχος' in app.text('.memtable'), q
    app.go(f'/members?q=M{reg + 1}&field=all')
    assert 'Άλλος' in app.text('.memtable') and 'Διπλωματούχος' not in app.text('.memtable')
    # ανά Στοά: η ΑΘΗΝΑ 1 έχει 2 ενεργά μέλη, 1 με Δίπλωμα
    app.go('/members/diplomas?tab=lodges')
    row = app.page.locator('tr', has_text='ΠΑΛΑΙΩΝ ΠΑΤΡΩΝ ΓΕΡΜΑΝΟΣ').first.inner_text().split('\t')  # το όνομα της Στοάς 1 από τον κατάλογο Στοών
    assert row[2].strip() == '2' and row[3].strip() == '1' and row[4].strip() == '1', row
    app.go('/members/diplomas?tab=list&mode=without&lodge=1')
    assert 'Άλλος' in app.text('.memtable') and 'Διπλωματούχος' not in app.text('.memtable')
    # καρτέλα μέλους και Κάρτα Μέλους (όλα τα στοιχεία: Στοές με ιδιότητα και αξιώματα, Επετηρίδα, Διατάγματα)
    app.page.evaluate(f"""async () => {{ const {{db}} = await import('./core/store.js'); const {{updateMember}} = await import('./modules/members.js');
      await db.save('x', (tx) => {{ updateMember(tx, {ids[0]}, {{ lodges: [{{ name: 'ΑΘΗΝΑ', number: '1', status: 'ΕΝΕΡΓΟ', capacity: 'Τακτικό', fee_rank: 1, jw_date: '2014-05-01', sw_date: '2015-05-01', wm_date: '2016-05-01' }}] }});
        tx.insert('member_degrees_offices', {{ member_id: {ids[0]}, record_type: 'appoint', degree: '', office: 'Μέγας Ξιφοφόρος', decree_id: null, decree_no: 600, decree_year: 2026, valid_from: '', valid_to: '', is_current: 1, notes: '' }});
        tx.insert('epeteirida', {{ aa: 1, active: 1, title: 'Μέγας Ξιφοφόρος', honorific: 'Λσεβ. Αδ.', full_name: 'Διπλωματούχος Πέτρος', rank: 'Μέγας Ξιφοφόρος', province: '', decree_no: 600, decree_year: 2026, tmd: 0, tmd_decree: '', current: '', member_id: {ids[0]} }}); }}); }}""")
    app.go(f'/members/{ids[0]}')
    assert 'MM24680' in app.text('.regcode') and app.page.input_value('[name=diploma_no]') == '24680' and app.page.input_value('[name=mm_lodge_name]') == 'ΑΘΗΝΑ'
    app.page.click('a.btn.primary:has-text("🪪 Κάρτα Μέλους")')
    app.page.wait_for_selector('.paper.member-card')
    c = app.text('.paper.member-card')
    for s_ in ['ΚΑΡΤΑ ΜΕΛΟΥΣ', 'MM24680', 'Διπλωματούχος Πέτρος', '15/03/2010', '20/11/2010', '10/06/2011', 'ΑΘΗΝΑ 1', 'Τακτικό', 'Στοά πλήρους συνδρομής',
               'Σεβάσμιος ΑΘΗΝΑ 1 (01/05/2016)', 'Α΄ Επόπτης ΑΘΗΝΑ 1 (01/05/2015)', 'Β΄ Επόπτης ΑΘΗΝΑ 1 (01/05/2014)', 'Λσεβ. Αδ.', '600/2026', 'Μέγας Ξιφοφόρος']:
        assert s_ in c, s_
    assert 'ΔΙΠΛΩΜΑ ΔΙΔΑΣΚΑΛΟΥ ΤΕΚΤΟΝΟΣ' not in c and 'MASTER MASON' not in c  # το επίσημο Δίπλωμα είναι ξεχωριστό έντυπο


def test_unified_menu_and_visits_flow(app):
    # Ενιαίο μενού: κάθε ενότητα μία φορά· Επισκέψεις ΜΔ με τα βήματα ①–⑤ και μπάρα ροής σε κάθε βήμα
    app.connect_local()
    app.go('/')
    groups = app.page.eval_on_selector_all('#mainnav details.navdrop > summary', 'els => els.map((e) => e.textContent.replace("▾", "").trim())')
    assert groups == ['✉ Έγγραφα', '👥 Μητρώο', '🏛 ΣΓΥ', '📅 Επισκέψεις ΜΔ', '🎉 Εορτολόγιο & Πρότζεκτ', '🌐 Δημόσιες σελίδες', '⚙ Διαχείριση'], groups
    hrefs = app.page.eval_on_selector_all('#mainnav a', 'els => els.map((e) => e.getAttribute("href"))')
    inner = [h for h in hrefs if h.startswith('#/')]
    assert len(inner) == len(set(inner)), inner  # κάθε σελίδα μία φορά στο μενού
    assert app.page.locator('#mainnav a[href="programme/"][target=_blank]').count() == 1 and app.page.locator('#mainnav a[href="#/members/diplomas"]').count() == 1
    assert app.page.locator('#mainnav a[href*="constitution"]').count() == 0  # το Σύνταγμα μόνο ως πλακίδιο στην Αρχική
    for step, path in [(1, '/visits'), (2, '/declarations'), (3, '/visits/decisions'), (4, '/visits/publish'), (5, '/visits/report')]:
        app.go(path)
        app.page.wait_for_selector('.vflow')
        assert app.page.locator('.vflow a.on').inner_text().startswith('①②③④⑤'[step - 1]), path


def test_member_card_in_registry(app):
    # Κάρτα Μέλους μέσα στο Μητρώο: στη λίστα, στην κορυφή της καρτέλας και στο μενού (με αναζήτηση μέλους)
    app.connect_local()
    add_member(app)
    app.go('/members')
    assert app.page.locator('.mc-cta a.mc-cta-btn[href="#/members/card"] b').inner_text() == 'ΚΑΡΤΑ ΜΕΛΟΥΣ'  # κάτω από τα κουμπιά του Μητρώου
    app.go('/members?q=Παπαδ&field=all')
    app.page.click('.memtable a.btn:has-text("🪪 Κάρτα Μέλους")')
    app.page.wait_for_selector('.paper.member-card')
    assert 'ΚΑΡΤΑ ΜΕΛΟΥΣ' in app.text('.paper.member-card')
    # email από info@ με θέμα «Κάρτα Μέλους για …» και την κάρτα σε PDF
    app.page.wait_for_selector('.mailsheet .ms-head')
    ms = app.text('.mailsheet')
    assert 'Κάρτα Μέλους για ' in ms and 'Παπαδόπουλος' in ms and 'info@nglgreece.gr' in ms and '.pdf' in ms, ms
    assert app.page.locator('#mainnav a[href="#/members/card"]').count() == 1
    app.go('/members/card')
    app.pick('#mcFind', 'Παπαδ')
    app.page.wait_for_selector('.paper.member-card')
    assert 'Παπαδόπουλος' in app.text('.paper.member-card')


def test_decree_delete_from_archive_with_confirmation(app):
    # Αρχείο Διαταγμάτων: «🗑 Διαγραφή» σε κάθε γραμμή· επαλήθευση με τα στοιχεία του Διατάγματος και διαγραφή (και των αξιωμάτων του)
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => { const d = tx.insert('decree_documents', { decree_no: 901, decree_year: 2026, decree_date: '2026-10-01', matter: 'δοκιμής διαγραφής', recipient_name: 'Δοκιμαστής Αδελφός', body: 'x', template_key: 'decree-appoint' });
        tx.insert('decree_documents', { decree_no: 902, decree_year: 2026, decree_date: '2026-10-02', matter: 'παραμένει', body: 'y', template_key: 'decree-appoint' });
        tx.insert('member_degrees_offices', { member_id: 1, record_type: 'appoint', office: 'Μέγας Ξιφοφόρος', decree_id: d.id, decree_no: 901, decree_year: 2026, is_current: 1 }); }); }""")
    msgs = []
    app.page.on('dialog', lambda d: msgs.append(d.message))
    app.go('/decrees')
    app.page.locator('tr', has_text='901/2026').locator('button:has-text("🗑 Διαγραφή")').click()
    app.page.wait_for_function("() => !document.querySelector('main').innerText.includes('901/2026')")
    assert msgs and 'Οριστική διαγραφή του Διατάγματος 901/2026 «δοκιμής διαγραφής»' in msgs[0] and '1 εγγραφές αξιωμάτων' in msgs[1], msgs
    st = app.page.evaluate("async () => { const {db} = await import('./core/store.js'); return [db.all('decree_documents').map((d) => d.decree_no), db.all('member_degrees_offices').filter((o) => o.decree_no === 901).length]; }")
    assert 902 in st[0] and 901 not in st[0] and st[1] == 0, st
    assert app.page.locator('tr', has_text='902/2026').locator('button:has-text("🗑 Διαγραφή")').count() == 1


def test_decree_number_editable_and_protocol_button(app):
    # Αρ. Διατάγματος: προτείνεται ο επόμενος, αλλάζει (νέο και επεξεργασία), έλεγχος διπλού· το επόμενο έπεται του μεγαλύτερου·
    # πράσινο κουμπί «Πρωτ ΜΓραμμ Εξερχόμενα» στο Αρχείο, στο Νέο και στην Επεξεργασία
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => { tx.insert('decree_documents', { decree_no: 520, decree_year: 2026, decree_date: '2026-10-01', matter: 'υπάρχον', body: 'x', template_key: 'decree-general', rules: '{"action":"general"}' }); }); }""")
    app.go('/decrees')
    assert app.page.locator('a.btn.protogreen:has-text("Πρωτ ΜΓραμμ Εξερχόμενα")').count() == 1
    app.go('/decrees/new?kind=decree-general')
    assert app.page.locator('a.btn.protogreen').count() == 1 and app.page.input_value('[name=decree_no]') == '521'
    app.page.fill('[name=g_matter]', 'δοκιμής αριθμού')
    app.page.fill('[name=decree_no]', '520')
    app.page.click('button:has-text("Έκδοση Διατάγματος")')
    app.page.wait_for_selector('.toast.error')
    assert 'Υπάρχει ήδη Διάταγμα 520/' in app.text('.toast.error')
    app.page.fill('[name=decree_no]', '600')
    app.page.wait_for_function("() => document.querySelector('#dprev').innerText.includes('600/')")
    app.page.click('button:has-text("Έκδοση Διατάγματος")')
    app.page.wait_for_url('**/#/decrees/2')
    assert '600/' in app.text('.paper')
    app.go('/decrees/2/edit')
    assert app.page.locator('a.btn.protogreen').count() == 1 and app.page.input_value('[name=decree_no]') == '600'
    app.page.fill('[name=decree_no]', '610')
    app.page.fill('[name=decree_date]', '2026-10-21')  # επεξεργάσιμη ημερομηνία
    app.page.wait_for_function("() => document.querySelector('#dprev').innerText.includes('21ην Οκτωβρίου 2026')")
    app.page.click('button:has-text("Αποθήκευση Διατάγματος")')
    app.page.wait_for_url('**/#/decrees/2')
    st = app.page.evaluate("async () => { const d = (await import('./core/store.js')).db.get('decree_documents', 2); return [d.decree_no, d.decree_date, d.body]; }")
    assert st[0] == 610 and st[1] == '2026-10-21' and '21ην Οκτωβρίου 2026' in st[2], st
    assert '610/2026, ημερ. 21/10/2026' in app.text('.paper')
    app.go('/decrees/new')
    assert app.page.input_value('[name=decree_no]') == '611'  # το επόμενο έπεται του μεγαλύτερου


def test_decree_updates_epeteirida_and_registry_title_with_confirmation(app):
    # Διάταγμα → Επετηρίδα → Μητρώο: ερώτηση με τις αλλαγές, εφαρμογή, υπενθύμιση στο Διάταγμα, αναίρεση στη διαγραφή
    app.connect_local()
    add_member(app)
    mid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry').find((m) => m.surname === 'Παπαδόπουλος').id")
    app.page.evaluate(f"""async () => {{ const {{db}} = await import('./core/store.js');
      await db.save('x', (tx) => {{ tx.insert('epeteirida', {{ aa: 50, active: 0, title: 'Πρώην Μέγας Ξιφοφόρος', honorific: 'Σεβ. Αδ.', full_name: 'Παπαδόπουλος Γεώργιος', rank: 'Πρώην Μέγας Ξιφοφόρος', province: '', decree_no: 400, decree_year: 2020, tmd: 0, tmd_decree: '', current: '', member_id: {mid} }}); }}); }}""")
    msgs = []
    app.page.on('dialog', lambda d: msgs.append(d.message))
    app.go('/decrees/new')
    assert app.page.locator('#dOffice option', has_text='Επαρχιακός Μέγας Διδάσκαλος').count() == 0  # χωριστό πρότυπο
    app.page.check('[name=template_key][value=decree-provincial]')
    assert app.page.locator('#dOffice option', has_text='Επαρχιακός Μέγας Διδάσκαλος').count() == 1  # Καν. 63
    app.page.check('[name=template_key][value=decree-appoint]')
    app.page.select_option('#dOffice', 'Μέγας Γραμματεύς')
    app.pick('.registry-search', 'Παπαδ')
    app.click('Έκδοση Διατάγματος')
    app.page.wait_for_url('**/#/decrees/1')
    q = next(m for m in msgs if 'ΕΠΕΤΗΡΙΔΑ' in m)
    assert 'Παπαδόπουλος Γεώργιος' in q and 'Ανώτατο αξίωμα: Πρώην Μέγας Ξιφοφόρος → Μέγας Γραμματεύς' in q and 'Εν ενεργεία αξίωμα' in q, q
    ep = app.page.evaluate("async () => (await import('./core/store.js')).db.all('epeteirida').find((r) => r.aa === 50)")
    assert ep['rank'] == 'Μέγας Γραμματεύς' and ep['decree_no'] in (513, '513') and ep['active'] == 1 and 'Μέγας Γραμματεύς — Διάταγμα 513/' in ep['current'], ep
    # υπενθύμιση στη σελίδα του Διατάγματος και στο Αρχείο
    assert '✓ Επετηρίδα & Μητρώο ενημερώθηκαν από αυτό το Διάταγμα' in app.text('.sync-card')
    app.go('/decrees')
    assert '✓ Επετηρίδα' in app.text('main')
    # ο Τίτλος του μέλους στο Μητρώο ακολουθεί την Επετηρίδα (αυτόματα)
    app.page.wait_for_function(f"async () => {{ const m = (await import('./core/store.js')).db.get('member_registry', {mid}); return m.title && m.title !== 'Σεβ. Αδ.'; }}", polling=300)
    # διαγραφή: αναίρεση των αλλαγών στην Επετηρίδα
    app.page.locator('tr', has_text='513/').locator('button:has-text("🗑 Διαγραφή")').click()
    app.page.wait_for_function("() => !document.querySelector('main').innerText.includes('513/')")
    assert any('Να αλλάξουν και η ΕΠΕΤΗΡΙΔΑ και το ΜΗΤΡΩΟ ΜΕΛΟΥΣ' in m and 'Ανώτατο αξίωμα: Μέγας Γραμματεύς → Πρώην Μέγας Ξιφοφόρος' in m for m in msgs), msgs
    ep = app.page.evaluate("async () => (await import('./core/store.js')).db.all('epeteirida').find((r) => r.aa === 50)")
    assert ep['rank'] == 'Πρώην Μέγας Ξιφοφόρος' and str(ep['decree_no']) == '400' and not ep['current'], ep
    # Τάξις ΜΔ: νέα γραμμή στην Επετηρίδα με ΤΜΔ, για μέλος χωρίς γραμμή
    add_member(app, surname='Τάξεως', first='Νικόλαος', email='t@example.com', mobile='6944000001')
    app.go('/decrees/new?action=service_award')
    app.pick('.registry-search', 'Τάξεως')
    app.click('Έκδοση Διατάγματος')
    app.page.wait_for_url('**/#/decrees/*')
    ep = app.page.evaluate("async () => (await import('./core/store.js')).db.all('epeteirida').find((r) => r.full_name === 'Τάξεως Νικόλαος')")
    assert ep and ep['tmd'] == 1 and ep['tmd_decree'].split('/')[0] in ('513', '514') and ep['member_id'], ep


def test_decree_delete_asks_whether_to_change_epeteirida_and_registry(app):
    # Διαγραφή εκδοθέντος Διατάγματος: χωριστή ερώτηση· «Άκυρο» κρατά Επετηρίδα και Μητρώο ως έχουν
    app.connect_local()
    add_member(app)
    app.go('/decrees/new')
    app.page.select_option('#dOffice', 'Μέγας Γραμματεύς')
    app.pick('.registry-search', 'Παπαδ')
    app.click('Έκδοση Διατάγματος')
    app.page.wait_for_url('**/#/decrees/1')
    ep = app.page.evaluate("async () => (await import('./core/store.js')).db.all('epeteirida').find((r) => r.full_name === 'Παπαδόπουλος Γεώργιος')")
    assert ep and ep['rank'] == 'Μέγας Γραμματεύς', ep
    app.page.evaluate("() => { window._asked = []; window.confirm = (m) => { window._asked.push(m); return !m.includes('ΜΗΤΡΩΟ ΜΕΛΟΥΣ'); }; }")
    app.go('/decrees')
    app.page.locator('tr', has_text='513/').locator('button:has-text("🗑 Διαγραφή")').click()
    app.page.wait_for_function("() => !document.querySelector('main').innerText.includes('513/')")
    asked = app.page.evaluate('window._asked')
    assert len(asked) == 2 and 'ΕΠΕΤΗΡΙΔΑ' in asked[1] and 'Άκυρο = Επετηρίδα και Μητρώο μένουν ως έχουν' in asked[1], asked
    ep = app.page.evaluate("async () => (await import('./core/store.js')).db.all('epeteirida').find((r) => r.full_name === 'Παπαδόπουλος Γεώργιος')")
    assert ep and ep['rank'] == 'Μέγας Γραμματεύς', ep
    app.page.wait_for_function("() => document.body.innerText.includes('ΔΕΝ άλλαξαν')", timeout=5000)


def test_master_mason_diploma_template_issue_and_design(app):
    # Δίπλωμα Διδασκάλου Τέκτονος (A3): πρότυπο στα «Πρότυπα», έκδοση από το Μητρώο με τα στοιχεία του μέλους, σχεδίαση θέσεων
    app.connect_local()
    add_member(app)
    mid = app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); const m = db.all('member_registry').find((x) => x.surname === 'Παπαδόπουλος');
      await db.save('x', (tx) => tx.update('member_registry', m.id, { diploma_no: 24680, date_ea: '2021-03-15', date_mm: '2022-06-20', mm_lodge_name: 'Αρμονία', mm_lodge_number: '12' })); return m.id; }""")
    app.go('/templates')
    assert 'ΔΙΠΛΩΜΑ ΔΙΔΑΣΚΑΛΟΥ ΤΕΚΤΟΝΟΣ' in app.text('main') and app.page.locator('a:has-text("🎨 Σχεδίαση Διπλώματος")').count() == 1
    app.go(f'/members/{mid}')
    app.page.click('a:has-text("🎓 Δίπλωμα Διδασκάλου")')
    app.page.wait_for_selector('.dip-sheet')
    t = app.text('.dip-sheet')
    for s in ['Γεώργιος Παπαδόπουλος', 'GEORGIOS PAPADOPOULOS', 'τήν 15ην ἡμέραν τοῦ μηνός Μαρτίου 2021 Ε.Κ. 6021 Ε.Φ.', 'Στοάν Αρμονία ὑπ’ ἀριθ. 12',
              'on the 15th of March 2021 AD 6021 AL in ARMONIA Lodge No. 12', '24680', '20/6/2022', 'Ο Μέγας Διδάσκαλος']:
        assert s in t, s
    app.page.fill('[name=name]', 'Γιώργος Παπαδόπουλος')
    assert 'GIORGOS PAPADOPOULOS' in app.text('.dip-sheet') and app.page.input_value('[name=name_en]') == 'GIORGOS PAPADOPOULOS'
    app.page.screenshot(path='/tmp/claude-0/dip/issue.png', full_page=True)
    # σχεδίαση: μετακίνηση του αριθμού Διπλώματος και αποθήκευση στο πρότυπο
    tid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('letter_templates').find((t) => t.kind === 'diploma').id")
    app.go(f'/templates/{tid}/diploma')
    app.page.select_option('#dipSel', 'dno')
    app.page.fill('[data-f=x]', '90')
    app.page.click('button:has-text("Αποθήκευση σχεδίασης")')
    app.page.wait_for_url('**/#/templates')
    lay = app.page.evaluate(f"async () => {{ const L = (await import('./core/store.js')).db.get('letter_templates', {tid}).layout; return typeof L === 'string' ? JSON.parse(L) : L; }}")
    assert lay['boxes'] == {'dno': {'x': 90}}, lay
    app.go(f'/members/diploma?id={mid}')
    assert 'left:90mm' in app.page.get_attribute('[data-box=dno]', 'style')


def test_decree_template_follows_action_and_office(app):
    # Τρία πρότυπα προσώπων: Μεγάλοι Αξιωματικοί · Επαρχιακός/Περιφερειακός Μ.Δ. και Πρώην · Τάξις Μ.Δ. — το πρότυπο ακολουθεί πράξη και αξίωμα
    app.connect_local()
    add_member(app)
    app.go('/decrees/new')
    app.page.select_option('#dAction', 'award')
    assert app.page.is_checked('[name=template_key][value=decree-provincial]')
    app.page.select_option('#dAction', 'service_award')
    assert app.page.is_checked('[name=template_key][value=decree-service]')
    app.page.check('[name=template_key][value=decree-provincial]')
    assert app.page.input_value('#dAction') == 'appoint'
    opts = app.page.eval_on_selector_all('#dOffice option', 'os => os.map((o) => o.value).filter(Boolean)')
    assert opts == ['Επαρχιακός Μέγας Διδάσκαλος', 'Περιφερειακός Μέγας Διδάσκαλος'], opts
    app.page.select_option('#dOffice', 'Περιφερειακός Μέγας Διδάσκαλος')
    app.pick('.registry-search', 'Παπαδ')
    app.click('Έκδοση Διατάγματος')
    app.page.wait_for_url('**/#/decrees/1')
    d = app.page.evaluate("async () => (await import('./core/store.js')).db.get('decree_documents', 1)")
    assert d['template_key'] == 'decree-provincial' and 'ΠΕΡΙΦΕΡΕΙΑΚΟΝ ΜΕΓΑΝ ΔΙΔΑΣΚΑΛΟΝ' in d['body'], d
    assert 'ΔΙΑΤΑΓΜΑ ΠΡΩΗΝ' in app.text('main')
    # κουμπιά: ΕΝ ΕΝΕΡΓΕΙΑ · ΠΡΩΗΝ · ΤΑΞΗ ΜΔ (και Γενικό Διάταγμα χωριστά)· ΠΡΩΗΝ ανοίγει με ΑΠΟΝΕΜΕΙ
    app.go('/decrees/new')
    assert app.page.eval_on_selector_all('.dec-kinds .chip b', 'bs => bs.map((b) => b.textContent)') == ['ΕΝ ΕΝΕΡΓΕΙΑ', 'ΠΡΩΗΝ', 'ΤΑΞΗ ΜΔ']
    assert app.page.locator('.dec-kinds-gen .chip', has_text='Γενικό Διάταγμα').count() == 1
    app.go('/decrees/new?kind=decree-provincial')
    assert app.page.input_value('#dAction') == 'award' and app.page.is_checked('[name=template_key][value=decree-provincial]')
    # οι σελίδες: ΠΡΩΗΝ από το Γενικό, ΤΑΞΗ ΜΔ αντίγραφο του ΕΝ ΕΝΕΡΓΕΙΑ (ξεχωριστό πρότυπο)
    ks = app.page.evaluate("async () => (await import('./core/store.js')).db.all('letter_templates').filter((t) => t.kind === 'decree').map((t) => t.key)")
    assert sorted(ks) == ['decree-appoint', 'decree-general', 'decree-provincial', 'decree-service'], ks


def test_taxis_md_decree_shows_jewel_automatically(app):
    # Τάξη ΜΔ: το κόσμημα της Τάξεως μπαίνει αυτόματα δίπλα στη γραμμή «την Τάξιν του Μεγάλου Διδασκάλου»
    app.connect_local()
    add_member(app)
    app.go('/decrees/new?kind=decree-service')
    app.pick('.registry-search', 'Παπαδ')
    app.page.wait_for_selector('#dprev img.dec-jewel[src="img/jewels/taxis-md.jpg"]')
    app.click('Έκδοση Διατάγματος')
    app.page.wait_for_url('**/#/decrees/*')
    app.page.wait_for_selector('.paper img.dec-jewel')
    assert app.page.evaluate("() => document.querySelector('.paper img.dec-jewel').naturalWidth > 0")
    assert app.page.evaluate("() => document.querySelector('.paper img.dec-jewel').style.width") == '180px'  # διπλάσιο
    assert app.page.evaluate("() => !!document.querySelector('.paper .evarest img[src=\"img/evarestoumetha.png\"]')")
    t = app.text('.paper')
    assert 'στον Αδελφόν:' in t and 'κάτωθι' not in t and 'ΕΥΑΡΕΣΤΟΥΜΕΘΑ ΝΑ ΑΠΟΝΕΙΜΩΜΕΝ' not in t, t
    # όχι σε Διάταγμα ΕΝ ΕΝΕΡΓΕΙΑ
    app.go('/decrees/new')
    assert app.page.locator('#dprev img.dec-jewel').count() == 0


def test_sgy_council_registry_letter_and_whatsapp(app):
    # ΣΓΥ: εκ του αξιώματος αυτόματα (Καν. 216, από Διάταγμα), ταυτοποίηση λίστας στο Μητρώο, Επιστολή ΣΓΥ με Bcc όλα τα μέλη, WhatsApp
    app.connect_local()
    add_member(app)
    add_member(app, surname='Ιωάννου', first='Νικόλαος', email='n.ioannou@example.com', mobile='6977000111')
    add_member(app, surname='Εκτός', first='Πέτρος', email='p@example.com', mobile='6977000222')
    app.go('/decrees/new')
    app.page.select_option('#dOffice', 'Μέγας Γραμματεύς')
    app.pick('.registry-search', 'Παπαδ')
    app.click('Έκδοση Διατάγματος')
    app.page.wait_for_url('**/#/decrees/1')
    app.go('/members/sgy')
    t = app.text('main')
    assert 'Μητρώο Μελών ΣΓΥ' in t and 'Γεώργιος Παπαδόπουλος' in t and 'Μέγας Γραμματεύς' in t and 'Κανών 216 — εκ του αξιώματος' in t, t
    assert 'Ιωάννου' not in app.text('.print-area')
    # ταυτοποίηση λίστας (email / κινητό / όνομα) και προσθήκη
    app.page.click('summary:has-text("Ταυτοποίηση λίστας")')
    app.page.fill('#sgyList', 'Νίκος <n.ioannou@example.com>\nΆγνωστος Κάποιος <x@nowhere.gr>')
    app.page.click('button:has-text("🔎 Ταυτοποίηση")')
    assert 'Νικόλαος Ιωάννου' in app.text('#sgyMatch') and 'Δεν βρέθηκε στο Μητρώο' in app.text('#sgyMatch')
    app.page.click('#sgyAddAll')
    app.page.wait_for_function("() => document.querySelector('.print-area').innerText.includes('Ιωάννου')")
    assert 'Κανόνες 218–219 — εκλεγόμενο' in app.text('.print-area') and 'Εκτός' not in app.text('.print-area')
    assert app.page.locator('.print-area a.sgy-wa[href="https://wa.me/306977000111"]').count() == 1
    # ίδιος πίνακας στην ενότητα ΣΓΥ
    app.go('/sgy')
    assert 'Ιωάννου' in app.text('.print-area') and 'Παπαδόπουλος' in app.text('.print-area')
    # Νέα Επιστολή προς ΣΓΥ → κατηγορία ΣΓΥ, Bcc όλα τα μέλη
    app.page.click('main a.btn:has-text("✉ Νέα Επιστολή προς ΣΓΥ")')
    app.page.wait_for_selector('[name=category]', state='attached')
    assert app.page.input_value('[name=category]') == 'ΣΓΥ'
    mod = app.page.evaluate("async () => { const s = await import('./modules/sgy.js'); return s.sgyEmails(); }")
    assert sorted(mod) == ['g@example.com', 'n.ioannou@example.com'], mod


def test_sgy_match_comma_separated_recipients_with_latin_names(app):
    # Λίστα παραληπτών email (με κόμματα, λατινικά ονόματα): βέβαιη ταύτιση από email, πιθανή από επώνυμο (όνομα ή email)
    app.connect_local()
    add_member(app)
    add_member(app, surname='Ζαχαρίου', first='Βασίλειος', email='vz.home@example.com', mobile='6977000333')
    add_member(app, surname='Μπαλτάς', first='Αντώνιος', email='', mobile='6977000444')
    app.go('/sgy')
    app.page.click('summary:has-text("Ταυτοποίηση λίστας")')
    app.page.fill('#sgyList', ': g@example.com, Vasilis Zachariou <vz.work@example.org>, a.baltas77@example.net, nobody@example.net')
    app.page.click('button:has-text("🔎 Ταυτοποίηση")')
    t = app.text('#sgyMatch')
    assert '4 γραμμές' in t and '1 βέβαιες' in t and '2 πιθανές' in t and '1 δεν βρέθηκαν' in t, t
    assert 'Βασίλειος Ζαχαρίου' in t and 'Αντώνιος Μπαλτάς' in t, t
    assert app.page.locator('#sgyMatch [data-mi]:checked').count() == 1  # οι πιθανές δεν επιλέγονται μόνες τους


def test_home_sgy_tile_numbered_and_sgy_templates(app):
    # Αρχική: πλακίδιο ΣΓΥ (αριθμημένα, πυκνά)· πρότυπα ΣΓΥ στα Πρότυπα και στη σελίδα ΣΓΥ· επιστολή από πρότυπο ΣΓΥ με Αρ. Πρωτ.
    app.connect_local()
    app.go('/')
    tile = app.page.locator('.dash .dtile', has_text='ΣΓΥ').first
    assert tile.count() == 1 and tile.locator('a:has-text("+ Επιστολή ΣΓΥ")').count() == 1
    assert app.page.evaluate("() => getComputedStyle(document.querySelector('.dash .dtile h3'), '::before').content") == 'counter(dt)'  # αρίθμηση
    app.page.set_viewport_size({'width': 390, 'height': 844})
    cols = app.page.evaluate("() => getComputedStyle(document.querySelector('.dash')).gridTemplateColumns.split(' ').length")
    assert cols == 2, cols
    app.page.set_viewport_size({'width': 1280, 'height': 900})
    app.go('/templates?category=ΣΓΥ')
    t = app.text('main')
    assert 'ΣΓΥ — Πρόσκληση σε Συνεδρίαση' in t and 'ΣΓΥ — Ενημέρωση Μελών' in t and 'Ελεύθερη επιστολή' not in t, t
    app.go('/sgy')
    app.page.click('a.btn:has-text("Πρόσκληση σε Συνεδρίαση")')
    app.page.wait_for_selector('[name=subject]')
    assert app.page.input_value('[name=category]') == 'ΣΓΥ' and 'Συμβουλίου Γενικών Υποθέσεων' in app.page.input_value('[name=subject]')
    assert app.page.input_value('[name=recipient_name]') == 'Προς τα Μέλη του Συμβουλίου Γενικών Υποθέσεων'


def test_sgy_update_from_excel(app, tmp_path):
    # Excel μελών ΣΓΥ (Name / Family Name / Given Name / E-mail 1 - Value): ταύτιση, email όπου λείπει, νέο μέλος στο Μητρώο, πλήρης κατάλογος
    import openpyxl
    app.connect_local()
    add_member(app)
    add_member(app, surname='Ζαχαρίου', first='Βασίλειος', email='', mobile='6977000333')
    add_member(app, surname='Παλαιός', first='Πέτρος', email='old@example.com', mobile='6977000555')
    app.page.evaluate("""async () => { const s = await import('./modules/sgy.js'); const {db} = await import('./core/store.js');
      await s.addSgy([{ member_id: db.all('member_registry').find((m) => m.surname === 'Παλαιός').id, role: 'Μέλος', basis: '218' }]); }""")
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(['νο', 'Name', 'Family Name', 'Given Name', 'E-mail 1 - Value'])
    ws.append([1, 'Γεώργιος Παπαδόπουλος', 'Παπαδόπουλος', 'Γεώργιος', 'g@example.com'])
    ws.append([2, 'Βασίλειος Ζαχαρίου', 'Ζαχαρίου', 'Βασίλειος', 'vz@example.org'])
    ws.append([3, 'Νέος Αδελφός', 'Αδελφός', 'Νέος', 'neos@example.net'])
    f = tmp_path / 'sgy.xlsx'; wb.save(f)
    app.go('/sgy')
    app.page.click('summary:has-text("Ταυτοποίηση λίστας")')
    app.page.set_input_files('#sgyXlsx', str(f))
    app.page.wait_for_selector('#sgyMatch table')
    t = app.text('#sgyMatch')
    assert '3 γραμμές' in t and '2 βέβαιες' in t and '1 δεν βρέθηκαν' in t and '+ vz@example.org' in t, t
    app.page.click('#sgyAllNew')
    app.page.check('#sgyReplace')
    app.page.click('#sgyAddAll')
    app.page.wait_for_function("() => document.querySelector('.print-area').innerText.includes('Νέος Αδελφός')")
    pa = app.text('.print-area')
    assert 'Γεώργιος Παπαδόπουλος' in pa and 'Βασίλειος Ζαχαρίου' in pa and 'Παλαιός' not in pa, pa
    em = app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry').find((m) => m.surname === 'Ζαχαρίου').email")
    assert em == 'vz@example.org'


SGY_ROSTER_TEXT = """Μέλη εξ Αξιώματος
Μέγας Διδάσκαλος
Σεβτ. Αδ. Γεώργιος Παπαδόπουλος


Πρώην Μέγας Διδάσκαλος
Πέτρος Άγνωστος


Μέγας Καγκελάριος



Μέγας Γραμματέας Εκπ/σεως
Νικόλαος Ιωάννου
Ενώ τα αλλα μελη εχουν
Διορισμένα Μέλη υπό του ΜΔ 2026 - 2027
Νικόλαος Ιωάννου

Και κατηγορία Αιρετά Μέλη Θητείας 2024 - 2027
Βασίλειος Ζαχαρίου (Αθηνών)
 Κενη θεση να συμπληρωθεί για Επαρχια    (Πειραιώς & Ν.Α.Α.)
"""


def _docx(path):
    import zipfile
    P = lambda t: f'<w:p><w:r><w:t>{t}</w:t></w:r></w:p>'
    C = lambda t: f'<w:tc>{P(t)}</w:tc>'
    T = lambda rows: '<w:tbl>' + ''.join('<w:tr>' + ''.join(C(c) for c in r) + '</w:tr>' for r in rows) + '</w:tbl>'
    body = (P('ΣΥΜΒΟΥΛΙΟΝ ΓΕΝΙΚΩΝ ΥΠΟΘΕΣΕΩΝ') + P('Τεκτονική Περίοδος 2026-2027') + P('Τακτική Συνεδρίασις της') + P('2ας Νοεμβρίου 2026') + P('ΠΑΡΟΥΣΙΟΛΟΓΙΟ')
            + P('Μέλη εξ Αξιώματος') + T([['Μέγας Διδάσκαλος', 'Σεβτ. Αδ. Γεώργιος Παπαδόπουλος', ''], ['Μέγας Καγκελάριος', '', ''], ['Μέγας Γραμματεύς', 'Νικόλαος Ιωάννου', '']])
            + P('Αιρετά Μέλη Θητείας 2025 - 2028') + T([['Βασίλειος Ζαχαρίου (Αθηνών)', ''], ['      (Αθηνών)', '']]))
    doc = f'<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>'
    with zipfile.ZipFile(path, 'w') as z:
        z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
        z.writestr('word/document.xml', doc)


def test_sgy_attendance_builder_roster_text_and_docx(app, tmp_path):
    # Παρουσιολόγιο ΣΓΥ: κατάλογος θέσεων από κείμενο και από Word, builder, αποθήκευση· ο πίνακας ΣΓΥ ακολουθεί τον κατάλογο
    app.connect_local()
    add_member(app)
    add_member(app, surname='Ιωάννου', first='Νικόλαος', email='n.i@example.com', mobile='6977000111')
    add_member(app, surname='Ζαχαρίου', first='Βασίλειος', email='vz@example.com', mobile='6977000333')
    app.go('/sgy/attendance')
    app.page.click('summary:has-text("Εισαγωγή καταλόγου")')
    app.page.fill('#attText', SGY_ROSTER_TEXT)
    app.page.click('button:has-text("↧ Από το κείμενο")')
    pv = app.text('#attPrev')
    for s in ['ΠΑΡΟΥΣΙΟΛΟΓΙΟ', 'Μέλη εξ Αξιώματος', 'Μέγας Καγκελάριος', 'Διορισμένα Μέλη υπό του ΜΔ 2026 - 2027', 'Αιρετά Μέλη Θητείας 2024 - 2027', 'Βασίλειος Ζαχαρίου (Αθηνών)', '(Πειραιώς & Ν.Α.Α.)']:
        assert s in pv, s
    assert 'Ενώ τα αλλα' not in pv and 'Κενη' not in pv
    assert app.page.locator('#attPrev td.att-vac').count() == 2 and app.page.locator('#attPrev td.att-miss:has-text("Λείπει Διορισμός")').count() == 2
    assert app.page.locator('#attPrev td.att-vac', has_text='(Πειραιώς & Ν.Α.Α.)').count() == 1
    assert app.page.evaluate("() => getComputedStyle(document.querySelector('#attPrev td.att-vac')).backgroundColor") == 'rgb(248, 215, 215)'
    assert app.page.locator('#attRows .att-row').count() == 7, app.page.locator('#attRows .att-row').count()
    # builder: αλλαγή ημερομηνίας και ιδιότητας
    app.page.fill('[data-s=date]', '2026-11-02')
    assert '2ας Νοεμβρίου 2026' in app.text('#attPrev')
    app.page.locator('#attRows .att-row').nth(2).locator('[data-f=role]').fill('Μέγας Καγκελάριος (κενή)')
    assert 'Μέγας Καγκελάριος (κενή)' in app.text('#attPrev')
    app.page.click('button:has-text("💾 Αποθήκευση")')  # «Πέτρος Άγνωστος» δεν είναι στο Μητρώο → επιβεβαίωση (αυτόματα ΟΚ)
    app.page.wait_for_selector('text=Το Παρουσιολόγιο και ο κατάλογος του ΣΓΥ αποθηκεύτηκαν')
    assert app.page.evaluate("async () => (await import('./core/store.js')).db.all('sgy_roster').length") == 7
    app.go('/sgy')
    t = app.text('.print-area')
    assert t.index('Παπαδόπουλος') < t.index('Ιωάννου') < t.index('Ζαχαρίου') and 'Μέγας Διδάσκαλος' in t and 'Αθηνών' in t, t
    assert 'Μέγας Γραμματέας Εκπ/σεως · Διορισμένο Μέλος' in t
    # Word του Παρουσιολογίου
    f = tmp_path / 'p.docx'; _docx(f)
    app.go('/sgy/attendance')
    app.page.click('summary:has-text("Εισαγωγή καταλόγου")')
    app.page.set_input_files('#attDocx', str(f))
    app.page.wait_for_function("() => document.querySelector('#attPrev').innerText.includes('Αιρετά Μέλη Θητείας 2025 - 2028')")
    pv = app.text('#attPrev')
    assert 'Τεκτονική Περίοδος 2026-2027' in pv and '2ας Νοεμβρίου 2026' in pv and 'Μέγας Γραμματεύς' in pv and 'Μέγας Καγκελάριος' in pv, pv
    assert app.page.locator('#attRows .att-row').count() == 5


def test_members_status_filter_and_deregistered_pdf_list(app):
    # Μητρώο: δυναμικό φίλτρο κατάστασης (⛔ Διαγραμμένοι) και Λίστα Διαγραμμένων για εκτύπωση / PDF
    app.connect_local()
    add_member(app)
    add_member(app, surname='Διαγραμμένος', first='Πέτρος', email='x@example.com', mobile='6977000999', lodges='ΠΑΡΘΕΝΩΝ | 3 | 5. ΔΙΑΓΡΑΦΕΝ')
    app.go('/members')
    app.page.click('.mstatus a:has-text("Διαγραμμένοι")')
    app.page.wait_for_function("() => !document.querySelector('.memtable').innerText.includes('Παπαδόπουλος')")
    t = app.text('.memtable')
    assert 'Διαγραμμένος' in t and 'Παπαδόπουλος' not in t, t
    assert '⛔ Διαγραμμένοι 1' in app.text('.mstatus')
    app.page.click('a:has-text("Λίστα Διαγραμμένων (PDF)")')
    app.page.wait_for_selector('.paper')
    p = app.text('.paper')
    assert app.page.locator('.paper h3.dg-prov').count() >= 1  # ανά Επαρχιακή / Περιφερειακή Μεγάλη Στοά
    assert 'Κατάλογος Διαγραμμένων Μελών' in p and 'Διαγραμμένος' in p and 'ΠΑΡΘΕΝΩΝ 3 (5. ΔΙΑΓΡΑΦΕΝ)' in p and 'Παπαδόπουλος' not in p, p
    with app.page.expect_download() as dl:
        app.page.click('button:has-text("⬇ PDF")')
    assert dl.value.suggested_filename.endswith('.pdf')


def test_members_page_export_excel_pdf_and_reimport_add_or_replace(app, tmp_path):
    # Κάθε σελίδα του Μητρώου: ⬇ Excel (μόνο τα αποτελέσματα, μορφή επανεισαγωγής) και ⬇ PDF· επανεισαγωγή με Προσθήκη/Συμπλήρωση ή Αντικατάσταση στοιχείων
    import openpyxl
    app.connect_local()
    add_member(app)
    add_member(app, surname='Ανενεργός', first='Πέτρος', email='', mobile='6977000999')
    mid = app.page.evaluate("""async () => { const {db} = await import('./core/store.js'); const m = db.all('member_registry').find((x) => x.surname === 'Ανενεργός');
      await db.save('x', (tx) => tx.update('member_registry', m.id, { active: 0 })); return m.id; }""")
    app.go('/members?q=&field=surname&status=inactive')
    app.page.wait_for_function("() => !document.querySelector('.memtable').innerText.includes('Παπαδόπουλος')")
    with app.page.expect_download() as dl:
        app.page.click('.mexport [data-act=mxlsx]')
    f = tmp_path / 'out.xlsx'; dl.value.save_as(f)
    wb = openpyxl.load_workbook(f)
    ws = wb['ΜΗΤΡΩΟ ΜΕΛΩΝ']; rows = list(ws.iter_rows(values_only=True))
    assert len(rows) == 2 and rows[1][4] == 'Ανενεργός', rows
    assert 'ΟΔΗΓΙΕΣ' in wb.sheetnames and len(list(wb['ΣΤΟΕΣ ΜΕΛΩΝ'].iter_rows())) == 2
    with app.page.expect_download() as dl2:
        app.page.click('.mexport [data-act=mpdf]')
    assert dl2.value.suggested_filename.endswith('.pdf')
    # διόρθωση στο Excel: συμπλήρωση email και αλλαγή κινητού
    h = list(rows[0]); ws.cell(row=2, column=h.index('Κύριο Email') + 1, value='petros@example.com'); ws.cell(row=2, column=h.index('Κύριο Κινητό') + 1, value='6900000000')
    wb.save(f)
    app.go('/members/import')
    app.page.set_input_files('#imp [name=file]', str(f))
    app.page.check('#imp [name=mode][value=add]')
    with app.page.expect_download():
        app.page.click('#imp button')
    app.page.wait_for_selector('text=Προσθήκη / συμπλήρωση ολοκληρώθηκε')
    m = app.page.evaluate(f"async () => (await import('./core/store.js')).db.get('member_registry', {mid})")
    assert m['email'] == 'petros@example.com' and m['mobile'] == '6977000999', m  # συμπληρώθηκε το κενό, δεν άλλαξε το υπάρχον
    n = app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry').length")
    app.go('/members/import')
    app.page.set_input_files('#imp [name=file]', str(f))
    app.page.check('#imp [name=mode][value=merge]')
    with app.page.expect_download():
        app.page.click('#imp button')
    app.page.wait_for_selector('text=Αντικατάσταση στοιχείων ολοκληρώθηκε')
    m = app.page.evaluate(f"async () => (await import('./core/store.js')).db.get('member_registry', {mid})")
    assert m['mobile'] == '6900000000', m
    assert app.page.evaluate("async () => (await import('./core/store.js')).db.all('member_registry').length") == n  # τα άλλα μέλη μένουν


def test_visit_kind_field_default_and_inline_change(app):
    # Κάθε επίσκεψη: ΕΙΔΟΣ ΕΡΓΑΣΙΑΣ (ΕΓΚΑΤΑΣΤΑΣΗ ΣΕΒ · ΑΡΧΑΙΡΕΣΙΕΣ · ΟΜΙΛΙΑ · ΑΛΛΟ), προεπιλογή ΕΓΚΑΤΑΣΤΑΣΗ ΣΕΒ, αλλαγή από τη γραμμή
    app.connect_local()
    app.page.evaluate("""async () => { const {db} = await import('./core/store.js');
      await db.save('x', (tx) => { tx.replace('visits', []); tx.insert('visits', { visit_date: '2099-11-02', lodge: 'ΑΚΡΟΠΟΛΙΣ', lodge_number: '104', location: '', province: '', rep_id: null, notes: '' }); }); }""")
    app.go('/visits')
    sel = app.page.locator('.vkindsel').first
    assert sel.input_value() == 'ΕΓΚΑΤΑΣΤΑΣΗ ΣΕΒ'
    assert app.page.eval_on_selector('.vkindsel', 'e => [...e.options].map((o) => o.value)') == ['ΕΓΚΑΤΑΣΤΑΣΗ ΣΕΒ', 'ΑΡΧΑΙΡΕΣΙΕΣ', 'ΟΜΙΛΙΑ', 'ΑΛΛΟ']
    sel.select_option('ΑΡΧΑΙΡΕΣΙΕΣ')
    app.page.wait_for_selector('text=ΑΚΡΟΠΟΛΙΣ: ΑΡΧΑΙΡΕΣΙΕΣ')  # αποθηκεύτηκε
    ms = app.page.evaluate("async () => (await import('./modules/visits.js')).publicMeetings('2099-10-30')")
    assert ms and ms[0].get('kind') == 'ΑΡΧΑΙΡΕΣΙΕΣ', (ms, app.page.evaluate("async () => (await import('./core/store.js')).db.all('visits')"))
    vid = app.page.evaluate("async () => (await import('./core/store.js')).db.all('visits')[0].id")
    app.go(f'/visits/edit/{vid}')
    assert app.page.input_value('.vkindform') == 'ΑΡΧΑΙΡΕΣΙΕΣ'


def test_declarations_unified_from_app_visits(browser, base_url):
    # Οι Εργασίες της σελίδας Δηλώσεων = οι Επισκέψεις της εφαρμογής (meetings.json), με ΕΙΔΟΣ ΕΡΓΑΣΙΑΣ·
    # ο καταχωρημένος εκπρόσωπος έρχεται από το programme.json — όχι από ξεχωριστή λίστα
    page = browser.new_page()
    page.route('**/declarations/meetings.json*', lambda r: r.fulfill(json={'meetings': [
        {'id': 'l7_20991102', 'date': 'Δευτέρα 02/11/2099', 'name': 'ΔΟΚΙΜΗ', 'no': '7', 'prov': 'Αττικής', 'kind': 'ΑΡΧΑΙΡΕΣΙΕΣ'},
        {'id': 'l8_20991103', 'date': 'Τρίτη 03/11/2099', 'name': 'ΔΕΥΤΕΡΗ', 'no': '8', 'prov': 'Αττικής', 'kind': 'ΕΓΚΑΤΑΣΤΑΣΗ ΣΕΒ'}]}))
    page.route('**/programme/programme.json*', lambda r: r.fulfill(json={'rows': [
        {'id': 'l7_20991102', 'date': '2099-11-02', 'no': '7', 'rep': 'Δοκιμαστής Εκπρόσωπος (Μέγας Αξιωματικός)'}]}))
    page.route('https://script.google.com/**', lambda r: r.fulfill(json={'ok': True, 'decisions': {}}))
    page.goto(base_url + 'declarations/#form')
    page.wait_for_selector('.meeting-card')
    cards = page.locator('.meeting-card')
    assert cards.count() == 2
    first = cards.nth(0).inner_text()
    assert 'ΑΡΧΑΙΡΕΣΙΕΣ' in first and 'ΔΟΚΙΜΗ' in first
    assert 'ΕΓΚΑΤΑΣΤΑΣΗ ΣΕΒ' in cards.nth(1).inner_text()
    page.wait_for_selector('.meeting-decision')
    assert 'Δοκιμαστής Εκπρόσωπος' in cards.nth(0).inner_text()
    page.close()
