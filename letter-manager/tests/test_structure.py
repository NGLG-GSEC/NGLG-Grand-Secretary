# Δομή του κώδικα: κάθε θέμα στο δικό του αρχείο, χωρίς κρυφές «επικαλύψεις» ονομάτων.
import ast
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Ονόματα που ορίζονται σκόπιμα ξανά, με αλυσίδα (κάθε ορισμός καλεί τον προηγούμενο).
INTENTIONAL_OVERRIDES = {
    'templates_for': ['modules/letters/permissions.py', 'modules/decrees/legacy.py', 'modules/decrees/documents.py'],
}


def manifest():
    src = (ROOT / 'app.py').read_text(encoding='utf-8')
    return re.findall(r"'([^']+\.py)'", re.search(r'MODULES = \[(.*?)\]', src, re.S).group(1))


def test_manifest_matches_files():
    listed = manifest()
    on_disk = sorted(str(p.relative_to(ROOT)) for d in ('core', 'modules') for p in (ROOT / d).rglob('*.py'))
    assert len(listed) == len(set(listed)), 'διπλή εγγραφή στη λίστα MODULES'
    assert sorted(listed) == on_disk, 'κάθε αρχείο του core/ και modules/ πρέπει να είναι στη λίστα MODULES του app.py'


def test_no_accidental_redefinitions():
    where = defaultdict(list)
    for rel in manifest():
        for node in ast.parse((ROOT / rel).read_text(encoding='utf-8')).body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                where[node.name].append(rel)
    dup = {k: v for k, v in where.items() if len(v) > 1 and INTENTIONAL_OVERRIDES.get(k) != v}
    assert not dup, f'το ίδιο όνομα ορίζεται σε πολλά σημεία: {dup}'


def test_unique_routes(app_module):
    seen = set()
    for r in app_module.app.router.routes:
        for m in getattr(r, 'methods', None) or []:
            assert (m, r.path) not in seen, (m, r.path)
            seen.add((m, r.path))


def test_every_module_describes_itself():
    for rel in manifest():
        first = (ROOT / rel).read_text(encoding='utf-8').splitlines()[0]
        assert first.startswith('# ') and len(first) > 10, rel
