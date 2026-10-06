# Έλεγχοι της εφαρμογής στον browser (Playwright/Chromium). Ο φάκελος του αποθετηρίου σερβίρεται τοπικά όπως στο GitHub Pages.
import functools
import http.server
import os
import threading
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope='session')
def base_url():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f'http://127.0.0.1:{srv.server_address[1]}/'
    srv.shutdown()


@pytest.fixture(scope='session')
def browser():
    with sync_playwright() as p:
        exe = os.environ.get('CHROMIUM_PATH') or ('/opt/pw-browsers/chromium-1194/chrome-linux/chrome' if Path('/opt/pw-browsers/chromium-1194/chrome-linux/chrome').exists() else None)
        b = p.chromium.launch(**({'executable_path': exe} if exe else {}))
        yield b
        b.close()


class App:
    """Μια καθαρή συνεδρία (νέο προφίλ browser) με εργαλεία για τους ελέγχους."""

    def __init__(self, page, base):
        self.page, self.base, self.errors = page, base, []
        page.on('pageerror', lambda e: self.errors.append(str(e)))
        page.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' and 'Failed to load resource' not in m.text else None)
        page.on('dialog', lambda d: d.accept())

    def go(self, hash_path):
        url = self.base + '#' + hash_path
        if self.page.url == url:
            self.page.reload()
        else:
            self.page.goto(url)
        self.page.wait_for_selector('main')
        self.page.wait_for_timeout(150)
        return self

    def text(self, sel='main'):
        return self.page.locator(sel).inner_text()

    def fill(self, **kw):
        for k, v in kw.items():
            loc = self.page.locator(f'[name="{k}"]').first
            if loc.evaluate('e => e.tagName') == 'SELECT':
                loc.select_option(v)
            else:
                loc.fill(v)
        return self

    def click(self, text):
        self.page.get_by_text(text, exact=False).first.click()
        self.page.wait_for_timeout(250)
        return self

    def wait_saved(self):
        self.page.wait_for_function("() => document.getElementById('syncPill') == null || document.getElementById('syncPill').hidden")
        self.page.wait_for_timeout(200)

    def pick(self, selector, query):
        self.page.fill(selector, query)
        self.page.wait_for_selector('.picker-list:not([hidden]) button')
        self.page.locator('.picker-list:not([hidden]) button').first.click()

    def connect_local(self):
        self.page.goto(self.base)
        self.page.get_by_text('Δοκιμή σε αυτή τη συσκευή').click()
        self.page.wait_for_selector('.dash')
        return self


@pytest.fixture
def app(browser, base_url):
    ctx = browser.new_context(viewport={'width': 1280, 'height': 900}, accept_downloads=True)
    page = ctx.new_page()
    a = App(page, base_url)
    yield a
    ctx.close()
    assert not a.errors, a.errors
