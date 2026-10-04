# Χάρτης κώδικα — NGLG Letter Manager

Κάθε θέμα έχει τον δικό του φάκελο. Όταν ζητάτε μια διόρθωση, αρκεί να πείτε **την ενότητα**
(π.χ. «στα Διατάγματα…», «στην αναζήτηση του Μητρώου…»): αλλάζει μόνο το αντίστοιχο αρχείο, και οι
αυτόματοι έλεγχοι (`tests/`) επιβεβαιώνουν ότι οι υπόλοιπες ενότητες δεν επηρεάστηκαν.

## Πού βρίσκεται τι

| Θέμα | Αρχείο | Σελίδες (διαδρομές) |
| --- | --- | --- |
| Ρυθμίσεις περιβάλλοντος (μεταβλητές Render), κοινές εισαγωγές βιβλιοθηκών και το αντικείμενο της εφαρμογής. | `core/config.py` | — |
| Εμφάνιση: CSS, μενού (☰ σε κινητά/tablet), πίνακες για κινητά και η συνάρτηση page() που «ντύνει» κάθε σελίδα. | `core/layout.py` | — |
| Βάση δεδομένων: SQLite τοπικά / Postgres στο Render, σύνδεση con(), βασικοί πίνακες και ρυθμίσεις. | `core/database.py` | — |
| Είσοδος με κωδικό μίας χρήσης (OTP), χρήστες/ρόλοι, Υπογράφων, προστασία από επαναλαμβανόμενες αποτυχίες. | `core/auth.py` | GET `/login`, POST `/otp`, POST `/verify`, GET `/identity`, POST `/identity`, GET `/logout` |
| Εικόνες της εφαρμογής (θυρεός, σφραγίδα, υπογραφές) από τον φάκελο static/. | `core/assets.py` | GET `/asset/{name}` |
| Επιστολές — ποιος μπορεί να επεξεργαστεί ποια επιστολή και ποια πρότυπα βλέπει. | `modules/letters/permissions.py` | — |
| Επιστολές — αρχική σελίδα, νέα επιστολή, προβολή, «Έτοιμη», επεξεργασία, διαγραφή, αρχείο. | `modules/letters/routes.py` | GET `/`, GET `/new`, POST `/new`, GET `/letter/{lid}`, POST `/ready/{lid}`, GET `/edit/{lid}`, POST `/edit/{lid}`, POST `/delete/{lid}`, GET `/archive` |
| Επιστολές — πρότυπα επιστολών. | `modules/letters/templates.py` | GET `/templates`, POST `/templates` |
| Διαχείριση — πρόσβαση χρηστών και ρυθμίσεις. | `modules/admin/routes.py` | GET `/users`, POST `/users`, GET `/settings`, POST `/settings` |
| Κοινά εργαλεία PDF: γραμματοσειρές, καθαρισμός εικόνων (θυρεός/σφραγίδα/υπογραφή), σύνδεσμοι. | `core/pdf.py` | GET `/clean/{name}` |
| Επιστολές — παραγωγή PDF. | `modules/letters/pdf.py` | GET `/pdf/{lid}` |
| Σύστημα: έλεγχος υγείας (/health), robots.txt, κεφαλίδες ασφαλείας. | `core/system.py` | GET `/health`, GET `/robots.txt` |
| Διατάγματα — κατάλογοι αξιωμάτων, διακρίσεων, βάσεων και τίτλων. | `modules/decrees/catalog.py` | — |
| Διατάγματα — κείμενο διατάγματος, φόρμες και η παλιά διαδρομή /decree (συμβατότητα). | `modules/decrees/legacy.py` | GET `/api/member`, GET `/decree`, POST `/decree`, GET `/decree-asset/gm`, GET `/decree/edit/{lid}`, POST `/decree/edit/{lid}` |
| Μητρώο Μελών — πίνακες, αρχική φόρτωση, καταχώριση/αποθήκευση μέλους, Excel ασφαλείας. | `modules/members/storage.py` | — |
| Μητρώο Μελών — εισαγωγή από Excel/CSV/TSV/επικόλληση και εφάπαξ φορτώσεις. | `modules/members/importer.py` | POST `/internal/member-bootstrap`, POST `/internal/member-full-load-bootstrap` |
| Μητρώο Μελών — αναζήτηση ανά πεδίο (Επώνυμο/Όνομα/Κινητό/Email/Στοά) και επισήμανση. | `modules/members/search.py` | — |
| Μητρώο Μελών — σελίδες (λίστα, νέο, επεξεργασία, διαγραφή, εισαγωγή, εξαγωγή) και API αναζήτησης. | `modules/members/routes.py` | GET `/members`, GET `/members/export.xlsx`, GET `/members/new`, POST `/members/new`, GET `/members/edit/{mid}`, POST `/members/edit/{mid}`, POST `/members/delete/{mid}`, POST `/members/import`, GET `/api/members/search` |
| Μητρώο Μελών — εκκίνηση (δημιουργία πινάκων, αρχική φόρτωση). | `modules/members/startup.py` | — |
| Διατάγματα — αυτοτελή έγγραφα: νέο, αρχείο, επεξεργασία, «Έτοιμο», PDF, διαγραφή. | `modules/decrees/documents.py` | GET `/decrees/new`, POST `/decrees/new`, GET `/decrees/archive`, GET `/decrees/{did}/edit`, POST `/decrees/{did}/edit`, POST `/decrees/{did}/ready`, POST `/decrees/{did}/delete`, GET `/decrees/{did}/pdf`, GET `/decrees/{did}` |
| Επετηρίδα — σελίδα και PDF. | `modules/epeteirida/routes.py` | GET `/epeteirida`, GET `/epeteirida/pdf` |
| Επετηρίδα — τροφοδότηση από τα Διατάγματα και εφάπαξ φόρτωση ιστορικού. | `modules/epeteirida/sync.py` | POST `/internal/epeteirida-bootstrap` |
| Συμβολικές Στοές — η κεντρική βάση Στοών (πίνακας, αρχικά δεδομένα, τίτλοι, email). | `modules/lodges/data.py` | — |
| Συμβολικές Στοές — σελίδες, εισαγωγή/εξαγωγή Excel. | `modules/lodges/routes.py` | GET `/lodges`, GET `/lodges/new`, POST `/lodges/new`, GET `/lodges/edit/{lid}`, POST `/lodges/edit/{lid}`, GET `/lodges/export.xlsx`, POST `/lodges/import` |
| Συμβολικές Στοές — εκκίνηση (πίνακας, αρχικά δεδομένα). | `modules/lodges/startup.py` | — |
| Παραλήπτες — λίστες για Επιστολές: Επαρχιακές Μεγάλες Στοές, Συμβολικές Στοές, μέλη. | `modules/recipients/widgets.py` | — |
| Αριθμός Πρωτοκόλλου — ενιαία συνεχής αρίθμηση Επιστολών & Διαταγμάτων (20.542_26_Κατηγορία_Θέμα). | `modules/protocol/numbering.py` | — |
| Ειδοποιήσεις μέσα στην εφαρμογή. | `core/notifications.py` | POST `/notifications/seen`, GET `/api/notifications` |
| Google Drive — σύνδεση OAuth, αποθήκευση κλειδιών, κλήσεις στο Drive API. | `modules/drive/client.py` | — |
| Google Drive — ανέβασμα PDF εγγράφων και κατάσταση ανεβάσματος. | `modules/drive/upload.py` | — |
| Google Drive — σελίδα ρύθμισης, σύνδεση/αποσύνδεση, δοκιμή, χειροκίνητο ανέβασμα. | `modules/drive/routes.py` | POST `/drive/upload/{kind}/{doc_id}`, GET `/drive`, GET `/drive/connect`, GET `/drive/callback`, POST `/drive/disconnect`, POST `/drive/test` |

## Πώς φορτώνεται

Το `app.py` εκτελεί τα αρχεία με τη σειρά της λίστας `MODULES` σε κοινό χώρο ονομάτων: κάθε αρχείο
μπορεί να χρησιμοποιεί ό,τι ορίστηκε σε προηγούμενο. Η σειρά έχει σημασία μόνο για:

- κώδικα που τρέχει στην εκκίνηση (δημιουργία πινάκων: `core/database.py`, `modules/*/startup.py`, `modules/drive/routes.py`),
- τη σειρά των middleware (`core/system.py` → `modules/decrees/legacy.py` → `modules/decrees/documents.py`),
- την αλυσίδα `templates_for` (`letters/permissions` → `decrees/legacy` → `decrees/documents`), όπου κάθε ορισμός καλεί τον προηγούμενο.

Τα σφάλματα δείχνουν το πραγματικό αρχείο και τη γραμμή (π.χ. `modules/members/search.py, line 12`).

## Κανόνες

1. Νέο θέμα → νέος φάκελος στο `modules/` και εγγραφή στη λίστα `MODULES` του `app.py`.
2. Κάθε αρχείο ξεκινά με σχόλιο μίας γραμμής που λέει τι περιέχει (ο χάρτης παραπάνω φτιάχνεται από αυτό).
3. Ένα όνομα συνάρτησης ορίζεται **μία** φορά — το `tests/test_structure.py` αποτυγχάνει αν κάποιο ορίζεται ξανά κατά λάθος.
4. Πριν από κάθε ανέβασμα: `python -m pytest -q tests` (τρέχει και αυτόματα στο GitHub).

## Επόμενα βήματα (Φάση 2)

- Οι πίνακες των ειδοποιήσεων και η ρύθμιση `protocol_start` δημιουργούνται ακόμη μέσα στο `_drive_init` (`modules/drive/client.py`)· θα μεταφερθούν στις ενότητες `core/notifications.py` και `modules/protocol/`.
- Οι Επαρχιακές Μεγάλες Στοές (`GRAND_LODGE_RECIPIENTS`, `modules/recipients/widgets.py`) γίνονται πίνακας της βάσης με σελίδα επεξεργασίας.
