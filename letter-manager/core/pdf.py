# Κοινά εργαλεία PDF: γραμματοσειρές, καθαρισμός εικόνων (θυρεός/σφραγίδα/υπογραφή), σύνδεσμοι.
# Φορτώνεται από το app.py (βλ. MODULES) στον κοινό χώρο ονομάτων της εφαρμογής.

from io import BytesIO

from reportlab.lib.pagesizes import A4

from reportlab.lib.units import mm

from reportlab.lib import colors

from reportlab.lib.styles import ParagraphStyle

from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle, HRFlowable

from reportlab.pdfbase import pdfmetrics

from reportlab.pdfbase.ttfonts import TTFont

from PIL import Image as PILImage

_PDF_ASSET_CACHE={}

_PDF_FONTS=None

def _pdf_fonts():
    global _PDF_FONTS
    if _PDF_FONTS:return _PDF_FONTS
    candidates=[
      ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
      ('/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf','/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf'),
      ('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf','/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf')
    ]
    for reg,bold in candidates:
        if Path(reg).exists() and Path(bold).exists():
            try:
                pdfmetrics.registerFont(TTFont('NGLGRegular',reg))
                pdfmetrics.registerFont(TTFont('NGLGBold',bold))
                _PDF_FONTS=('NGLGRegular','NGLGBold')
                return _PDF_FONTS
            except Exception:
                pass
    _PDF_FONTS=('Helvetica','Helvetica-Bold')
    return _PDF_FONTS

def _raw_asset(name):
    key=('raw',name)
    if key in _PDF_ASSET_CACHE:return _PDF_ASSET_CACHE[key]
    files=sorted((BASE/'static').glob(name+'.b64.*'))
    if not files:raise HTTPException(404)
    data=base64.b64decode(''.join(p.read_text(encoding='ascii') for p in files))
    _PDF_ASSET_CACHE[key]=data
    return data

def _clean_asset(name,mode):
    key=(mode,name)
    if key in _PDF_ASSET_CACHE:return _PDF_ASSET_CACHE[key]
    im=PILImage.open(BytesIO(_raw_asset(name))).convert('RGBA')
    px=im.load()
    for yy in range(im.height):
        for xx in range(im.width):
            r,g,b,a=px[xx,yy]
            if mode=='white' and r>238 and g>238 and b>238:
                px[xx,yy]=(r,g,b,0)
            elif mode=='black' and r<30 and g<30 and b<30:
                px[xx,yy]=(r,g,b,0)
    out=BytesIO();im.save(out,'PNG')
    data=out.getvalue();_PDF_ASSET_CACHE[key]=data
    return data

@app.get('/clean/{name}')
def clean_asset(name:str):
    modes={'seal_original.png':'black','signature_original.png':'white','signature_nikolaos.png':'white'}
    if name not in modes or not asset_available(name):raise HTTPException(404)
    return Response(_clean_asset(name,modes[name]),media_type='image/png')

def _pdf_linkify(text):
    safe=html.escape(str(text or ''))
    pattern=r'(https?://[^\s<]+|www\.[^\s<]+)'
    def repl(m):
        raw=m.group(0);trail=''
        while raw and raw[-1] in '.,;:!?)]}':
            trail=raw[-1]+trail;raw=raw[:-1]
        href=raw if raw.startswith(('http://','https://')) else 'https://'+raw
        return '<a href="'+html.escape(href,quote=True)+'"><font color="#123B7A">'+html.escape(raw)+'</font></a>'+html.escape(trail)
    return re.sub(pattern,repl,safe).replace('\n','<br/>')
