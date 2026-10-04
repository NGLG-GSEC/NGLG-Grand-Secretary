# Ξαναφτιάχνει τον πίνακα «Πού βρίσκεται τι» του ARCHITECTURE.md από τα ίδια τα αρχεία:
# πρώτη γραμμή σχολίου κάθε αρχείου + οι διαδρομές (σελίδες) που ορίζει.
# Χρήση: python tools/gen_architecture.py
import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BEGIN, END = '<!-- map:begin -->', '<!-- map:end -->'


def table():
    src = (ROOT / 'app.py').read_text(encoding='utf-8')
    files = re.findall(r"'([^']+\.py)'", re.search(r'MODULES = \[(.*?)\]', src, re.S).group(1))
    out = ['| Θέμα | Αρχείο | Σελίδες (διαδρομές) |', '| --- | --- | --- |']
    for f in files:
        t = (ROOT / f).read_text(encoding='utf-8')
        routes = []
        for n in ast.parse(t).body:
            for d in getattr(n, 'decorator_list', []):
                if isinstance(d, ast.Call) and getattr(d.func, 'attr', '') in ('get', 'post') and d.args:
                    routes.append(f'{d.func.attr.upper()} `{d.args[0].value}`')
        out.append(f"| {t.splitlines()[0][2:]} | `{f}` | {', '.join(routes) or '—'} |")
    return '\n'.join(out)


def render(doc):
    a, b = doc.index(BEGIN) + len(BEGIN), doc.index(END)
    return doc[:a] + '\n' + table() + '\n' + doc[b:]


if __name__ == '__main__':
    p = ROOT / 'ARCHITECTURE.md'
    p.write_text(render(p.read_text(encoding='utf-8')), encoding='utf-8')
