# Σύστημα: έλεγχος υγείας (/health) με την έκδοση που τρέχει, robots.txt, κεφαλίδες ασφαλείας, συμπίεση (gzip).
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.
from starlette.middleware.gzip import GZipMiddleware

def app_version():
    # Ποιος κώδικας τρέχει (στο Render: αποθετήριο, κλάδος και commit της τελευταίας ανάπτυξης)
    return {'repo':os.getenv('RENDER_GIT_REPO_SLUG') or '','branch':os.getenv('RENDER_GIT_BRANCH') or '',
            'commit':(os.getenv('RENDER_GIT_COMMIT') or '')[:12],'database':'postgres' if USE_PG else 'sqlite'}

@app.get('/health')
def health():
    with con() as c:
        c.execute('SELECT 1').fetchone()
    return {'status':'ok','service':'nglg-letter-manager',**app_version()}

@app.get('/robots.txt', response_class=PlainTextResponse)
def robots():
    return "User-agent: *\nDisallow: /\n"

@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "no-referrer"
    if not request.url.path.startswith("/asset/"):
        response.headers["Cache-Control"] = "no-store"
    return response

app.add_middleware(GZipMiddleware,minimum_size=1000)
