# Ενότητα Πρωτόκολλο: συνεχής κοινή αρίθμηση Επιστολών και Διαταγμάτων από το 20.542.
from helpers import YY, decree_protocol, letter_protocol, new_decree, new_letter, seq


def test_continuous_numbering_across_letters_and_decrees(admin):
    a = letter_protocol(admin, new_letter(admin, 'Πρώτη'))
    b = decree_protocol(admin, new_decree(admin, matter='Δεύτερο'))
    c = letter_protocol(admin, new_letter(admin, 'Τρίτη'))
    assert seq(a) >= 20542
    assert seq(b) == seq(a) + 1 and seq(c) == seq(b) + 1
    assert b.split('_')[2] == 'Διάταγμα' and c.split('_')[2] == 'Επιστολή'


def test_format(admin):
    p = letter_protocol(admin, new_letter(admin, 'Πρόσκληση σε Συνεδρία: Νοέμβριος/2026'))
    n, yy, cat, topic = p.split('_', 3)
    assert '.' in n and yy == YY and cat == 'Επιστολή'
    assert '/' not in topic and ':' not in topic  # ασφαλές όνομα αρχείου


def test_protocol_topic(app_module):
    assert app_module.protocol_topic('  Εκπροσώπηση   ΜΔ ') == 'Εκπροσώπηση ΜΔ'
