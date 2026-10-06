# Σύστημα: έλεγχος υγείας (/health) με την έκδοση που τρέχει, robots.txt, κεφαλίδες ασφαλείας, συμπίεση (gzip).
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.
from starlette.middleware.gzip import GZipMiddleware

def app_version():
    # Ποιος κώδικας τρέχει: αποθετήριο, κλάδος και commit της τελευταίας ανάπτυξης
    # (APP_GIT_* από τη ροή ανάπτυξης στο Google Cloud Run, RENDER_GIT_* στο Render)
    g=lambda k:os.getenv('APP_GIT_'+k) or os.getenv('RENDER_GIT_'+k) or ''
    return {'repo':g('REPO_SLUG'),'branch':g('BRANCH'),'commit':g('COMMIT')[:12],
            'host':'cloud-run' if os.getenv('K_SERVICE') else ('render' if os.getenv('RENDER') else 'local'),
            'database':'postgres' if USE_PG else 'sqlite'}

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
