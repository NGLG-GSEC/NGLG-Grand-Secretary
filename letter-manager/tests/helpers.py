# Βοηθητικές συναρτήσεις για τους ελέγχους.
import re
from datetime import date

YY = f'{date.today().year % 100:02d}'


def new_letter(client, subject='Δοκιμή', status='draft', **extra):
    data = {'subject': subject, 'body': 'Κείμενο δοκιμής', 'recipient_name': 'Παραλήπτης',
            'recipient_email': 'test@example.com', 'status': status}
    data.update(extra)
    r = client.post('/new', data=data)
    assert r.status_code == 303, r.text[:300]
    return int(r.headers['location'].rsplit('/', 1)[1])


def letter_protocol(client, lid):
    t = client.get(f'/letter/{lid}').text
    return re.search(r'Αρ\. Πρωτ\.: <b class="official-number">([^<]+)', t).group(1)


def new_decree(client, matter='Διορισμός Μεγάλου Αξιωματικού', **extra):
    data = {'decree_action': 'appoint', 'decree_office': 'Μέγας Γραμματεύς', 'matter': matter,
            'masonic_period': '2026 - 2027', 'first_name': 'Γεώργιος', 'last_name': 'Παπαδόπουλος',
            'member_email': 'g@example.com', 'mobile': '6900000000', 'honorific': 'Σεβ. Αδ.'}
    data.update(extra)
    r = client.post('/decrees/new', data=data)
    assert r.status_code == 303, r.text[:300]
    return int(r.headers['location'].rsplit('/', 1)[1])


def decree_protocol(client, did):
    t = client.get(f'/decrees/{did}').text
    return re.search(r'Αρ\. Πρωτ\.:</b> <span class="official-number">([^<]+)', t).group(1)


def seq(protocol_no):
    return int(protocol_no.split('_', 1)[0].replace('.', ''))
