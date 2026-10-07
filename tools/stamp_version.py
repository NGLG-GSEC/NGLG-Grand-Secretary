# Κατά τη δημοσίευση (GitHub Pages): κάθε αρχείο κώδικα φορτώνεται με την έκδοση (commit) στη διεύθυνσή του,
# ώστε ο browser να παίρνει αμέσως τη νέα έκδοση και όχι την παλιά από την προσωρινή μνήμη (cache).
# Χρήση: python tools/stamp_version.py <έκδοση>
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
v = sys.argv[1][:12]
files = sorted(str(p.relative_to(ROOT)).replace('\\', '/') for d in ('core', 'modules') for p in (ROOT / d).glob('*.js'))
imports = {f'./{f}': f'./{f}?v={v}' for f in files + ['main.js']}
importmap = '<script type="importmap">' + json.dumps({'imports': imports}) + '</script>'
p = ROOT / 'index.html'
html = p.read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="css/app.css">', f'<link rel="stylesheet" href="css/app.css?v={v}">\n<meta name="app-version" content="{v}">\n{importmap}')
html = html.replace('<script type="module" src="main.js"></script>', f'<script type="module" src="./main.js?v={v}"></script>')
p.write_text(html, encoding='utf-8')
print(f'stamped {len(imports)} files with v={v}')
d = ROOT / 'diatagma' / 'index.html'
if d.exists():
    d.write_text(d.read_text(encoding='utf-8').replace("from '../core/docx.js'", f"from '../core/docx.js?v={v}'"), encoding='utf-8')
