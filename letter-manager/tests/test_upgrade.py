# Αναβάθμιση υπάρχουσας βάσης: μια βάση της προηγούμενης έκδοσης (χωρίς grand_lodges και χωρίς
# τα νέα πεδία Στοών) πρέπει να αναβαθμίζεται χωρίς απώλεια δεδομένων.
import os
import sqlite3
import subprocess
import sys
import tempfile
import textwrap
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.skipif(bool(os.environ.get('TEST_DATABASE_URL')), reason='έλεγχος μόνο για SQLite')
def test_old_database_is_upgraded():
    d = tempfile.mkdtemp()
    db = sqlite3.connect(os.path.join(d, 'letters.db'))
    db.executescript("""CREATE TABLE lodges(id INTEGER PRIMARY KEY AUTOINCREMENT,number TEXT NOT NULL DEFAULT '',name TEXT NOT NULL DEFAULT '',
        orient TEXT DEFAULT '',provincial TEXT DEFAULT '',email TEXT DEFAULT '',master TEXT DEFAULT '',secretary TEXT DEFAULT '',
        secretary_email TEXT DEFAULT '',status TEXT DEFAULT 'Ενεργή',notes TEXT DEFAULT '',source TEXT DEFAULT '',created_at TEXT,updated_at TEXT);
        INSERT INTO lodges(number,name,provincial,email) VALUES('95','LA PAIX','ΕπΜΣτ. Αθηνών','old@example.com');""")
    db.commit()
    db.close()
    code = textwrap.dedent(f"""
        import importlib.util, sys
        spec = importlib.util.spec_from_file_location('app', {str(ROOT / 'app.py')!r})
        m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
        x = [l for l in m._lodges_all() if l['number'] == '95'][0]
        assert x['email'] == 'old@example.com' and x['ritual'] == '' and x['meeting_place'] == '', x
        assert len(m._lodges_all()) == 1, 'δεν προστίθενται αρχικά δεδομένα σε βάση που έχει ήδη Στοές'
        assert len(m.provinces_all()) == 7
        print('OK')
    """)
    env = dict(os.environ, DATA_DIR=d, APP_SECRET='x')
    env.pop('DATABASE_URL', None)
    r = subprocess.run([sys.executable, '-c', code], env=env, capture_output=True, text=True, cwd=ROOT)
    assert r.returncode == 0 and 'OK' in r.stdout, r.stderr[-2000:]
