# Βιβλίο Εξερχόμενης Αλληλογραφίας (#/book): ανάγνωση φακέλου Drive (προσομοίωση), ρόλοι αρχείων, σειρά, ευρετήρια, αποθήκευση.
import json
import re

FOLDER = 'FOLDER123'


def make_pdf(text, pages=1):
    """Ελάχιστο έγκυρο PDF (Α4) με ένα κείμενο ανά σελίδα."""
    objs = ['<< /Type /Catalog /Pages 2 0 R >>', None, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    kids = []
    for i in range(pages):
        stream = f'BT /F1 24 Tf 72 700 Td ({text} p{i + 1}) Tj ET'
        objs.append(f'<< /Length {len(stream)} >>\nstream\n{stream}\nendstream')
        objs.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {len(objs)} 0 R >>')
        kids.append(f'{len(objs)} 0 R')
    objs[1] = f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {pages} >>'
    out, offs = b'%PDF-1.4\n', []
    for n, o in enumerate(objs, 1):
        offs.append(len(out))
        out += f'{n} 0 obj\n{o}\nendobj\n'.encode('latin-1')
    xref = len(out)
    out += f'xref\n0 {len(objs) + 1}\n0000000000 65535 f \n'.encode() + b''.join(f'{o:010d} 00000 n \n'.encode() for o in offs)
    out += f'trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    return out


FILES = [  # id, όνομα, δημιουργία, σελίδες
    ('c', 'cover.pdf', '2026-10-13T02:31:30Z', 1),
    ('f1', 'ΣΤΟ_ΜΥΑΛΟ_ΤΟΥ_ΜΕΓΑΛΟΥ_ΔΙΔΑΣΚΑΛΟΥ Αυγ_2026.pdf', '2026-08-13T08:00:00Z', 3),
    ('d3', '20.540_2026 ΔΙΑΤΑΓΜΑ-513 ΔΙΟΡΙΣΜΟΣ Μεγάλου Γραμματέως.pdf', '2026-09-18T09:44:58Z', 1),
    ('d1', '20.458_2026 ΔΙΑΤΑΓΜΑ-490 ΑΠΟΝΟΜΗ ΤΙΤΛΟΥ.pdf', '2026-01-12T04:39:20Z', 1),
    ('d2', '20.468_2026 ΗμΔΣΓΥ 02.03.2026.pdf', '2026-02-24T05:51:00Z', 2),
    ('d4', '20552 - ΕΠΙΣΚΕΨΗ Επίσημη Επίσκεψη ΜΔ εις την Στοάν «ΘΕΜΙΣΤΟΚΛΗΣ» υπ’ αριθμ. 96.pdf', '2026-10-12T22:30:00Z', 1),
    ('d5', '20.541_2026 Διάταγμα-514_2026 περί Υπαγωγής Στοάς.docx (2).pdf', '2026-09-29T14:09:34Z', 1),
    ('old', 'Εξερχόμενα_2026_Book_131026_v1.pdf', '2026-10-13T09:00:00Z', 1),
]


def fake_drive(app):
    """Google Drive και σύνδεση Google χωρίς δίκτυο: λίστα φακέλου, λήψη αρχείων, ανέβασμα."""
    uploads = []
    app.page.add_init_script("window.google = { accounts: { oauth2: { initTokenClient: (o) => ({ requestAccessToken: () => o.callback({ access_token: 'T', expires_in: 3600 }) }) } } };")

    def handle(route):
        url = route.request.url
        if '/upload/drive/v3/files' in url:
            uploads.append(route.request.post_data_buffer)
            return route.fulfill(json={'id': 'NEW', 'webViewLink': 'https://drive.google.com/file/d/NEW/view'})
        m = re.search(r'/drive/v3/files/([^/?]+)\?alt=media', url)
        if m:
            f = next(x for x in FILES if x[0] == m.group(1))
            return route.fulfill(body=make_pdf(f[0], f[3]), content_type='application/pdf')
        if '/drive/v3/files?' in url:
            assert FOLDER in url
            return route.fulfill(json={'files': [{'id': i, 'name': n, 'createdTime': t} for i, n, t, _ in FILES]})
        return route.abort()
    app.page.route('https://www.googleapis.com/**', handle)
    return uploads


def test_book_pure_rules(app):
    app.connect_local().go('/book')
    r = app.page.evaluate("""async () => { const B = await import('./core/book.js');
      return { kinds: ['cover.pdf', '20552 - ΕΠΙΣΚΕΨΗ x.pdf', '20.540_2026 ΔΙΑΤΑΓΜΑ-513 x.pdf', 'In the mind of the GM.pdf', 'Εξερχόμενα_2026_Book_131026_v2.pdf'].map(B.classify),
        nums: [B.protocolOf('20.540_2026 x.pdf'), B.protocolOf('20552 - x.pdf'), B.protocolOf('20542_2026 x.pdf'), B.protocolOf('x 20540.pdf')],
        subj: [B.subjectOf('20.514_2026_ΔΙΑΤΑΓΜΑ-510_ΔΙΟΡΙΣΜΟΣ_ΠερΜΔ_ΚΥΠΡΟΥ.pdf'), B.subjectOf('20.541_2026 Διάταγμα-514 περί.docx (2).pdf'), B.subjectOf('20552 - ΕΠΙΣΚΕΨΗ Θέμα.pdf')],
        dec: [B.decreeOf('20.541_2026 Διάταγμα-514_2026 x.pdf'), B.decreeOf('20.480 ΔΙΑΤΑΓΜΑ 493-2026 x.pdf'), B.decreeOf('20.468 ΗμΔΣΓΥ.pdf')],
        date: B.athensDate('2026-10-04T23:19:48Z'),
        name: B.bookFileName(2026, ['Εξερχόμενα_2026_Book_131026_v1.pdf', 'Εξερχόμενα_2026_Book_131026_v2.pdf'], new Date('2026-10-13T10:00:00Z')) }; }""")
    assert r['kinds'] == ['cover', 'doc', 'doc', 'front', 'skip']
    assert r['nums'] == ['20540', '20552', '20542', '']
    assert r['subj'] == ['ΔΙΑΤΑΓΜΑ-510 ΔΙΟΡΙΣΜΟΣ ΠερΜΔ ΚΥΠΡΟΥ', 'Διάταγμα-514 περί', 'ΕΠΙΣΚΕΨΗ Θέμα']
    assert r['dec'] == ['514', '493', None]
    assert r['date'] == '05.10.2026'  # ώρα Ελλάδος
    assert r['name'] == 'Εξερχόμενα_2026_Book_131026_v3.pdf'


def test_book_from_drive(app):
    uploads = fake_drive(app)
    app.connect_local()
    app.go('/settings').fill(google_client_id='test.apps.googleusercontent.com')
    app.click('💾 Αποθήκευση ρυθμίσεων')
    app.wait_saved()
    app.go('/book')
    app.page.fill('#bkFolder', f'https://drive.google.com/drive/folders/{FOLDER}?usp=sharing')
    app.click('☁ Φόρτωση από το Drive')
    app.page.wait_for_selector('.bk-kind')
    t = app.text('#bkList')
    assert '5 έγγραφα' in t and '1 προλογικά' in t and '1 εξώφυλλο' in t and '1 εκτός' in t
    with app.page.expect_download() as dl:
        app.click('📖 Δημιουργία βιβλίου')
    app.page.wait_for_selector('#bkOut h2')
    out = app.text('#bkOut')
    # 1 εξώφυλλο + 1 κενή + 3 προλογικές + 2 ευρετήριο (+ Διατάγματα σε δική τους σελίδα) + 6 σελίδες εγγράφων
    assert '13 σελίδες' in out and '5 έγγραφα' in out and '3 Διατάγματα' in out and '1 προλογικά' in out, out
    name = dl.value.suggested_filename
    assert re.fullmatch(r'Εξερχόμενα_\d{4}_Book_\d{6}_v1\.pdf', name), name
    assert open(dl.value.path(), 'rb').read(5) == b'%PDF-'
    assert len(uploads) == 1 and name.encode() in uploads[0]
    # σειρά και σελίδες: έγγραφα από το παλαιότερο (σελ. 8) στο νεότερο
    res = app.page.evaluate("""async () => { const B = await import('./core/book.js');
      const r = await fetch('https://www.googleapis.com/drive/v3/files?q=FOLDER123').then(x => x.json());
      const get = async (f) => ({ name: f.name, created: f.createdTime, bytes: await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`).then(x => x.arrayBuffer()) });
      const all = await Promise.all(r.files.map(get));
      const pick = (k) => all.filter(f => B.classify(f.name) === k);
      const b = await B.buildBook({ cover: pick('cover')[0], front: pick('front'), docs: pick('doc') }, { year: 2026, order: 'created' });
      const p = await B.buildBook({ cover: pick('cover')[0], front: [], docs: pick('doc') }, { year: 2026, order: 'protocol' });
      const lib = await PDFLib.PDFDocument.load(b.bytes);
      return { order: b.docs.map(d => [d.num, d.page, d.date]), decrees: b.decrees.map(d => d.decree), front: b.front.map(f => f.page),
               proto: p.docs.map(d => d.num), pages: lib.getPageCount(), outline: !!lib.catalog.get(PDFLib.PDFName.of('Outlines')) }; }""")
    assert res['order'] == [['20458', 8, '12.01.2026'], ['20468', 9, '24.02.2026'], ['20540', 11, '18.09.2026'], ['20541', 12, '29.09.2026'], ['20552', 13, '13.10.2026']]
    assert res['decrees'] == ['490', '513', '514'] and res['front'] == [3] and res['pages'] == 13 and res['outline']
    assert res['proto'] == ['20458', '20468', '20540', '20541', '20552']
