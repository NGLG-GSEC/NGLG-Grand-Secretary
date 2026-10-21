#!/usr/bin/env python3
"""Παράγει το constitution/constitution.pdf από το κείμενο της σελίδας constitution/index.html
(window.CONSTITUTION_DATA): εξώφυλλο, περιεχόμενα κατά κεφάλαιο και όλοι οι Κανόνες, σε Α4 με αρίθμηση σελίδων.

Χρήση (από τη ρίζα του αποθετηρίου):  python3 tools/build_constitution_pdf.py
Ξανατρέξτε το όποτε αλλάζει το κείμενο της σελίδας. Χρειάζεται Playwright με Chromium.
"""
import html
import json
import os
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'constitution' / 'index.html'
OUT = ROOT / 'constitution' / 'constitution.pdf'
TMP = ROOT / 'constitution' / '_print.html'


def load_data():
    s = SRC.read_text(encoding='utf-8')
    key = 'window.CONSTITUTION_DATA = '
    data, _ = json.JSONDecoder().raw_decode(s[s.index(key) + len(key):])
    return data


def norm(x):
    return ' '.join(str(x or '').split()).casefold()


def strip_next_heading(text, nxt):
    """Η πηγή κολλά στο τέλος κάθε Κανόνα τον τίτλο (και το κεφάλαιο) του επόμενου: αφαιρούνται, αφού τυπώνονται ως επικεφαλίδες."""
    blocks = [b for b in str(text or '').split('\n\n') if b.strip()]
    heads = {norm(nxt.get('title')), norm(nxt.get('chapter'))} if nxt else set()
    while blocks and norm(blocks[-1]) in heads:
        blocks.pop()
    return '\n\n'.join(blocks)


def paragraphs(text):
    out = []
    for block in str(text or '').split('\n\n'):
        b = block.strip()
        if not b:
            continue
        lines = [html.escape(x) for x in b.split('\n')]
        # γραμμές μόνο με κεφαλαία (υπότιτλοι μέσα στο κείμενο)
        cls = ' class="sub"' if len(lines) == 1 and b.upper() == b and any(c.isalpha() for c in b) and len(b) < 90 else ''
        out.append(f'<p{cls}>{"<br>".join(lines)}</p>')
    return ''.join(out)


def build_html(d):
    m, arts = d['meta'], sorted(d['articles'], key=lambda a: a.get('sort', 0))
    chapters = []
    for a in arts:
        if not chapters or chapters[-1][0] != a['chapter']:
            chapters.append((a['chapter'], []))
        chapters[-1][1].append(a)
    toc = ''.join(
        f'<li><b>{html.escape(c)}</b> <span>Κανόνες {html.escape(xs[0]["number"])}–{html.escape(xs[-1]["number"])}</span></li>'
        for c, xs in chapters)
    body = ''
    for c, xs in chapters:
        body += f'<h2 class="chapter">{html.escape(c)}</h2>'
        for a in xs:
            i = arts.index(a)
            a = {**a, 'text': strip_next_heading(a.get('text'), arts[i + 1] if i + 1 < len(arts) else None)}
            body += (f'<section class="art"><h3><span class="no">Κανών {html.escape(a["number"])}</span> {html.escape(a.get("title") or "")}</h3>'
                     f'{paragraphs(a.get("text"))}</section>')
    return f'''<!doctype html><html lang="el"><head><meta charset="utf-8"><title>{html.escape(m["title"])}</title>
<link rel="stylesheet" href="../css/fonts.css">
<style>
@page {{ size: A4; margin: 18mm 17mm 18mm 17mm; }}
body {{ font-family: 'Noto Serif', 'DejaVu Serif', serif; color: #111; font-size: 10.5pt; line-height: 1.45; }}
.cover {{ height: 255mm; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; page-break-after: always; color: #1d2f5e; }}
.cover img {{ width: 45mm; margin-bottom: 10mm; }}
.cover h1 {{ font-size: 20pt; line-height: 1.3; margin: 0 12mm 6mm; }}
.cover h2 {{ font-size: 13pt; font-weight: 400; margin: 0 15mm 12mm; }}
.cover .ed {{ font-size: 12pt; letter-spacing: .08em; color: #8a6d1d; }}
.toc {{ page-break-after: always; }}
.toc h2 {{ color: #1d2f5e; text-align: center; font-size: 15pt; }}
.toc ol {{ list-style: none; padding: 0; }}
.toc li {{ display: flex; justify-content: space-between; border-bottom: 1px dotted #b18a43; padding: 2mm 0; }}
.toc li span {{ color: #555; }}
h2.chapter {{ page-break-before: always; text-align: center; color: #1d2f5e; font-size: 14pt; border-bottom: 2px solid #b18a43; padding-bottom: 3mm; margin: 0 0 6mm; }}
.toc + h2.chapter {{ page-break-before: auto; }}
.art {{ margin: 0 0 5mm; }}
.art h3 {{ font-size: 11pt; color: #1d2f5e; margin: 0 0 1.5mm; page-break-after: avoid; }}
.art h3 .no {{ color: #8a6d1d; margin-right: 2mm; }}
.art p {{ margin: 0 0 2mm; text-align: left; overflow-wrap: anywhere; }}
.art p.sub {{ text-align: center; font-weight: 700; margin-top: 3mm; }}
.note {{ margin-top: 10mm; font-size: 8.5pt; color: #555; border-top: 1px solid #ccc; padding-top: 3mm; }}
</style></head><body>
<div class="cover"><img src="emblem.jpg" alt=""><h1>{html.escape(m["title"])}</h1><h2>{html.escape(m.get("rules_title", ""))}</h2><div class="ed">{html.escape(m.get("edition", ""))}</div></div>
<div class="toc"><h2>Περιεχόμενα</h2><ol>{toc}</ol><p class="note">{html.escape(m.get("note", ""))}</p></div>
{body}
</body></html>'''


def main():
    d = load_data()
    TMP.write_text(build_html(d), encoding='utf-8')
    handler = partial(SimpleHTTPRequestHandler, directory=str(ROOT))
    srv = ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as p:
            exe = '/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None
            b = p.chromium.launch(**({'executable_path': exe} if exe else {}))
            pg = b.new_page()
            pg.goto(f'http://127.0.0.1:{srv.server_port}/constitution/_print.html', wait_until='networkidle')
            pg.evaluate('document.fonts.ready')
            foot = ('<div style="width:100%;font:8pt serif;color:#777;text-align:center">'
                    'ΕΜΣτΕ — Γενικοί Νόμοι και Κανονισμοί · σελ. <span class="pageNumber"></span> / <span class="totalPages"></span></div>')
            pg.pdf(path=str(OUT), format='A4', print_background=True, display_header_footer=True,
                   header_template='<div></div>', footer_template=foot,
                   margin={'top': '18mm', 'bottom': '20mm', 'left': '17mm', 'right': '17mm'})
            b.close()
    finally:
        srv.shutdown()
        TMP.unlink(missing_ok=True)
    print(f'{OUT.relative_to(ROOT)}: {OUT.stat().st_size // 1024} KB, {len(d["articles"])} Κανόνες')


if __name__ == '__main__':
    main()
