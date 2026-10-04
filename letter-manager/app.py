# NGLG Letter Manager — Ψηφιακή Μεγάλη Γραμματεία ΕΜΣτΕ.
#
# Ο κώδικας είναι χωρισμένος σε ενότητες, μία ανά θέμα (βλ. ARCHITECTURE.md):
#   core/      κοινά: ρυθμίσεις, βάση, είσοδος, εμφάνιση, PDF, ειδοποιήσεις
#   modules/   ένας φάκελος ανά θέμα: letters, decrees, members, lodges, ...
#
# Τα αρχεία φορτώνονται με τη σειρά της λίστας MODULES σε κοινό χώρο ονομάτων,
# οπότε ένα αρχείο μπορεί να χρησιμοποιεί ό,τι ορίστηκε σε προηγούμενο. Η σειρά
# έχει σημασία για: (α) κώδικα που τρέχει στην εκκίνηση (δημιουργία πινάκων),
# (β) τη σειρά των middleware και (γ) την αλυσίδα του templates_for
# (letters → decrees/legacy → decrees/documents). Ο έλεγχος
# tests/test_structure.py επιβεβαιώνει ότι κανένα όνομα δεν ορίζεται δύο φορές
# κατά λάθος και ότι κάθε αρχείο της λίστας υπάρχει.
from pathlib import Path

MODULES = [
    'core/config.py',
    'core/layout.py',
    'core/database.py',
    'core/auth.py',
    'core/mail.py',
    'core/assets.py',
    'modules/letters/permissions.py',
    'modules/letters/routes.py',
    'modules/letters/templates.py',
    'modules/admin/routes.py',
    'core/pdf.py',
    'modules/letters/pdf.py',
    'core/system.py',
    'modules/decrees/catalog.py',
    'modules/decrees/legacy.py',
    'modules/members/storage.py',
    'modules/members/importer.py',
    'modules/members/search.py',
    'modules/members/routes.py',
    'modules/members/startup.py',
    'modules/decrees/documents.py',
    'modules/epeteirida/routes.py',
    'modules/epeteirida/sync.py',
    'modules/provinces/data.py',
    'modules/provinces/routes.py',
    'modules/provinces/startup.py',
    'modules/lodges/data.py',
    'modules/lodges/routes.py',
    'modules/lodges/startup.py',
    'modules/recipients/widgets.py',
    'modules/directory/routes.py',
    'modules/visits/data.py',
    'modules/visits/mails.py',
    'modules/visits/routes.py',
    'modules/visits/reps.py',
    'modules/visits/report.py',
    'modules/visits/importer.py',
    'modules/visits/startup.py',
    'modules/namedays/data.py',
    'modules/namedays/routes.py',
    'modules/namedays/startup.py',
    'modules/projects/data.py',
    'modules/projects/routes.py',
    'modules/projects/startup.py',
    'modules/protocol/numbering.py',
    'core/notifications.py',
    'modules/drive/client.py',
    'modules/drive/upload.py',
    'modules/drive/routes.py',
    'modules/dashboard/tiles.py',
]

_ROOT = Path(__file__).resolve().parent
for _rel in MODULES:
    _path = _ROOT / _rel
    exec(compile(_path.read_text(encoding='utf-8'), str(_path), 'exec'), globals())
