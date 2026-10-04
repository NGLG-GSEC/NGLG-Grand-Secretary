# Σύστημα: έλεγχος υγείας (/health), robots.txt, κεφαλίδες ασφαλείας.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

@app.get('/health')
def health():
    with con() as c:
        c.execute('SELECT 1').fetchone()
    return {'status':'ok','service':'nglg-letter-manager'}

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
