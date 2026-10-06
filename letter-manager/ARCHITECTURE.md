# Χάρτης κώδικα — NGLG Letter Manager

Κάθε θέμα έχει τον δικό του φάκελο. Όταν ζητάτε μια διόρθωση, αρκεί να πείτε **την ενότητα**
(π.χ. «στα Διατάγματα…», «στην αναζήτηση του Μητρώου…»): αλλάζει μόνο το αντίστοιχο αρχείο, και οι
αυτόματοι έλεγχοι (`tests/`) επιβεβαιώνουν ότι οι υπόλοιπες ενότητες δεν επηρεάστηκαν.

## Πού βρίσκεται τι

<!-- map:begin -->
| Θέμα | Αρχείο | Σελίδες (διαδρομές) |
| --- | --- | --- |
| Ρυθμίσεις περιβάλλοντος (μεταβλητές Render), κοινές εισαγωγές βιβλιοθηκών και το αντικείμενο της εφαρμογής. | `core/config.py` | — |
| Εμφάνιση: CSS, μενού (☰ σε κινητά/tablet), πίνακες για κινητά και η συνάρτηση page() που «ντύνει» κάθε σελίδα. | `core/layout.py` | — |
| Βάση δεδομένων: SQLite τοπικά / Postgres στο Render, σύνδεση con(), βασικοί πίνακες και ρυθμίσεις. | `core/database.py` | — |
| Είσοδος με κωδικό μίας χρήσης (OTP), χρήστες/ρόλοι, Υπογράφων, προστασία από επαναλαμβανόμενες αποτυχίες. | `core/auth.py` | GET `/login`, POST `/otp`, POST `/verify`, GET `/identity`, POST `/identity`, GET `/logout` |
| Αποστολή email και λογαριασμοί αποστολής ανά κατηγορία (Ρυθμίσεις → «Λογαριασμοί αποστολής»). | `core/mail.py` | — |
| Εικόνες της εφαρμογής (θυρεός, σφραγίδα, υπογραφές) από τον φάκελο static/. | `core/assets.py` | GET `/asset/{name}` |
| Επιστολές — ποιος μπορεί να επεξεργαστεί ποια επιστολή και ποια πρότυπα βλέπει. | `modules/letters/permissions.py` | — |
| Επιστολές — αρχική σελίδα, νέα επιστολή, προβολή, «Έτοιμη», επεξεργασία, διαγραφή, αρχείο. | `modules/letters/routes.py` | GET `/`, GET `/new`, POST `/new`, GET `/letter/{lid}`, POST `/ready/{lid}`, GET `/edit/{lid}`, POST `/edit/{lid}`, POST `/delete/{lid}`, GET `/archive` |
| Επιστολές — πρότυπα επιστολών. | `modules/letters/templates.py` | GET `/templates`, POST `/templates` |
| Διαχείριση — πρόσβαση χρηστών και ρυθμίσεις. | `modules/admin/routes.py` | GET `/users`, POST `/users`, GET `/settings`, POST `/settings` |
| Κοινά εργαλεία PDF: γραμματοσειρές, καθαρισμός εικόνων (θυρεός/σφραγίδα/υπογραφή), σύνδεσμοι. | `core/pdf.py` | GET `/clean/{name}` |
| Επιστολές — παραγωγή PDF. | `modules/letters/pdf.py` | GET `/pdf/{lid}` |
| Σύστημα: έλεγχος υγείας (/health) με την έκδοση που τρέχει, robots.txt, κεφαλίδες ασφαλείας, συμπίεση (gzip). | `core/system.py` | GET `/health`, GET `/robots.txt` |
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
| Επαρχιακές / Περιφερειακή Μεγάλη Στοά και ΕΜΣτΕ — πίνακας της βάσης (όχι σταθερή λίστα στον κώδικα). | `modules/provinces/data.py` | — |
| Επαρχιακές Μεγάλες Στοές — σελίδες: λίστα, νέα, επεξεργασία. | `modules/provinces/routes.py` | GET `/provinces`, GET `/provinces/new`, POST `/provinces/new`, GET `/provinces/edit/{pid}`, POST `/provinces/edit/{pid}`, GET `/provinces/export.xlsx` |
| Επαρχιακές Μεγάλες Στοές — εκκίνηση (πίνακας, αρχικά δεδομένα). | `modules/provinces/startup.py` | — |
| Συμβολικές Στοές — η κεντρική βάση Στοών (πίνακας, αρχικά δεδομένα, τίτλοι, email). | `modules/lodges/data.py` | — |
| Συμβολικές Στοές — σελίδες, εισαγωγή/εξαγωγή Excel. | `modules/lodges/routes.py` | GET `/lodges`, GET `/lodges/new`, POST `/lodges/new`, GET `/lodges/edit/{lid}`, POST `/lodges/edit/{lid}`, GET `/lodges/export.xlsx`, POST `/lodges/import` |
| Συμβολικές Στοές — εκκίνηση (πίνακας, αρχικά δεδομένα). | `modules/lodges/startup.py` | — |
| Παραλήπτες — λίστες για Επιστολές: Επαρχιακές Μεγάλες Στοές, Συμβολικές Στοές, μέλη. | `modules/recipients/widgets.py` | — |
| Κατάλογος — όλα τα στοιχεία επικοινωνίας σε μία σελίδα: Επαρχίες (Γραμματεία, ΕπΜΔ, ΕπΜΓρ.) και Συμβολικές Στοές, | `modules/directory/routes.py` | GET `/directory` |
| Επισκέψεις Στοών & Εκπρόσωποι — πίνακες, βαθμοί εκπροσώπων, βοηθητικά κειμένων και ημερολογίου. | `modules/visits/data.py` | — |
| Επισκέψεις Στοών — κείμενα email: ενημέρωση εκπροσώπου (με πρόσκληση ημερολογίου) και ενημέρωση Επαρχίας. | `modules/visits/mails.py` | — |
| Επισκέψεις Στοών — ημερολόγιο, νέα/επεξεργασία, επικόλληση λίστας, ενημέρωση εκπροσώπου και Επαρχίας. | `modules/visits/routes.py` | GET `/visits`, GET `/visits/new`, POST `/visits/new`, GET `/visits/edit/{vid}`, POST `/visits/edit/{vid}`, POST `/visits/delete/{vid}`, GET `/visits/import`, POST `/visits/import`, GET `/visits/brief`, POST `/visits/brief`, GET `/visits/publish`, GET `/visits/publish/compose`, POST `/visits/publish/send`, POST `/visits/publish/bulk` |
| Εκπρόσωποι ΜΔ — λίστα, νέος/επεξεργασία, επικόλληση πίνακα, βαθμοί ανά αξίωμα, συμπλήρωση από την Επετηρίδα. | `modules/visits/reps.py` | GET `/reps`, GET `/reps/new`, POST `/reps/new`, GET `/reps/edit/{rid}`, POST `/reps/edit/{rid}`, POST `/reps/delete/{rid}`, GET `/reps/import`, POST `/reps/import`, GET `/reps/ranks`, POST `/reps/ranks`, POST `/reps/from-epeteirida` |
| Επισκέψεις Στοών — αναφορά (προεπισκόπηση και PDF A4) ανά διάστημα και Επαρχία. | `modules/visits/report.py` | GET `/visits/report`, GET `/visits/report.pdf` |
| Επισκέψεις Στοών — εισαγωγή των δεδομένων της σελίδας «Επιστολές Γραμματείας» (claude.ai) από αρχείο JSON. | `modules/visits/importer.py` | GET `/visits/import-data`, POST `/visits/import-data` |
| Επισκέψεις Στοών — εκκίνηση (πίνακες, ρυθμίσεις υπογραφής). | `modules/visits/startup.py` | — |
| Εορτολόγιο — ονομαστικές εορτές (σταθερές και κινητές από το Πάσχα), εορτάζοντες μέλη, ιστορικό ευχών. | `modules/namedays/data.py` | — |
| Εορτολόγιο — εορτάζοντες, αποστολή ευχών (ανά πρόσωπο, με προσφώνηση), αναφορά στον ΜΔ, εορτολόγιο ονομάτων. | `modules/namedays/routes.py` | GET `/namedays`, POST `/namedays/compose`, POST `/namedays/send`, GET `/namedays/report`, POST `/namedays/report/send`, GET `/namedays/export.xlsx`, GET `/namedays/calendar`, GET `/namedays/calendar/new`, POST `/namedays/calendar/new`, GET `/namedays/calendar/edit/{nid}`, POST `/namedays/calendar/edit/{nid}`, POST `/namedays/calendar/delete/{nid}` |
| Εορτολόγιο — εκκίνηση (πίνακες, αρχικό εορτολόγιο ονομάτων, πρότυπο ευχών). | `modules/namedays/startup.py` | — |
| Πρότζεκτ ΜΔ — πίνακες (πρότζεκτ, Στοές/ομάδες, μέλη, επαφές, αρχεία, ημερολόγιο) και αποθήκευση αρχείων. | `modules/projects/data.py` | — |
| Πρότζεκτ ΜΔ — λίστα, νέο πρότζεκτ, σελίδα πρότζεκτ (στοιχεία, Στοές/ομάδες, μέλη, επαφές, αρχεία, ημερολόγιο), αναφορά PDF. | `modules/projects/routes.py` | GET `/projects`, GET `/projects/new`, POST `/projects/new`, GET `/projects/{pid}`, POST `/projects/{pid}/save`, POST `/projects/{pid}/units`, POST `/projects/{pid}/units/add`, POST `/projects/{pid}/units/delete/{uid}`, POST `/projects/{pid}/members/add`, POST `/projects/{pid}/members/delete/{mid}`, POST `/projects/{pid}/contacts`, POST `/projects/{pid}/contacts/add`, POST `/projects/{pid}/contacts/delete/{cid}`, POST `/projects/{pid}/files`, POST `/projects/{pid}/links`, POST `/projects/{pid}/files/delete/{fid}`, POST `/projects/{pid}/cover`, POST `/projects/{pid}/cover/delete`, GET `/projects/file/{fid}`, POST `/projects/{pid}/log`, POST `/projects/{pid}/log/delete/{lid}`, POST `/projects/{pid}/delete`, GET `/projects/{pid}/report.pdf` |
| Πρότζεκτ ΜΔ — εκκίνηση (πίνακες, μεταφορά παλιών αρχείων από τον δίσκο στη βάση). | `modules/projects/startup.py` | — |
| Αριθμός Πρωτοκόλλου — ενιαία συνεχής αρίθμηση Επιστολών & Διαταγμάτων (20.542_26_Κατηγορία_Θέμα). | `modules/protocol/numbering.py` | — |
| Ειδοποιήσεις μέσα στην εφαρμογή. | `core/notifications.py` | POST `/notifications/seen`, GET `/api/notifications` |
| Google Drive — σύνδεση OAuth, αποθήκευση κλειδιών, κλήσεις στο Drive API. | `modules/drive/client.py` | — |
| Google Drive — ανέβασμα PDF εγγράφων και κατάσταση ανεβάσματος. | `modules/drive/upload.py` | — |
| Google Drive — σελίδα ρύθμισης, σύνδεση/αποσύνδεση, δοκιμή, χειροκίνητο ανέβασμα. | `modules/drive/routes.py` | POST `/drive/upload/{kind}/{doc_id}`, GET `/drive`, GET `/drive/connect`, GET `/drive/callback`, POST `/drive/disconnect`, POST `/drive/test` |
| Βάση Δεδομένων — κατάλογος των πινάκων που εμφανίζονται/επεξεργάζονται στη σελίδα «Βάση Δεδομένων». | `modules/database/registry.py` | — |
| Πλήρες αντίγραφο ασφαλείας όλης της βάσης (λήψη) και επαναφορά του (ανέβασμα). Λειτουργεί ανάμεσα σε SQLite και | `modules/database/backup.py` | GET `/database/backup.json.gz`, GET `/database/restore`, POST `/database/restore` |
| Βάση Δεδομένων — μία σελίδα για όλα τα δεδομένα της εφαρμογής: προβολή, αναζήτηση, επεξεργασία, Excel, | `modules/database/routes.py` | GET `/database`, GET `/database/protocol`, GET `/database/{key}/export.xlsx`, GET `/database/{key}`, GET `/database/{key}/{rid}`, POST `/database/{key}/{rid}`, GET `/system/check` |
| Αρχική σελίδα — πίνακας ελέγχου: μία κάρτα ανά ενότητα με ό,τι εκκρεμεί και τις συχνές ενέργειες. | `modules/dashboard/tiles.py` | — |
<!-- map:end -->

## Πώς φορτώνεται

Το `app.py` εκτελεί τα αρχεία με τη σειρά της λίστας `MODULES` σε κοινό χώρο ονομάτων: κάθε αρχείο
μπορεί να χρησιμοποιεί ό,τι ορίστηκε σε προηγούμενο. Η σειρά έχει σημασία μόνο για:

- κώδικα που τρέχει στην εκκίνηση (δημιουργία πινάκων: `core/database.py`, `modules/*/startup.py`, `modules/drive/routes.py`),
- τη σειρά των middleware (`core/system.py` → `modules/decrees/legacy.py` → `modules/decrees/documents.py`),
- την αλυσίδα `templates_for` (`letters/permissions` → `decrees/legacy` → `decrees/documents`), όπου κάθε ορισμός καλεί τον προηγούμενο.

Τα σφάλματα δείχνουν το πραγματικό αρχείο και τη γραμμή (π.χ. `modules/members/search.py, line 12`).

## Κανόνες

1. Νέο θέμα → νέος φάκελος στο `modules/` και εγγραφή στη λίστα `MODULES` του `app.py`.
2. Κάθε αρχείο ξεκινά με σχόλιο μίας γραμμής που λέει τι περιέχει· ο χάρτης παραπάνω φτιάχνεται από αυτό με `python tools/gen_architecture.py` (ο έλεγχος `tests/test_structure.py` αποτυγχάνει αν μείνει παλιός).
3. Ένα όνομα συνάρτησης ορίζεται **μία** φορά — το `tests/test_structure.py` αποτυγχάνει αν κάποιο ορίζεται ξανά κατά λάθος.
4. Πριν από κάθε ανέβασμα: `python -m pytest -q tests` (τρέχει και αυτόματα στο GitHub).

## Βάση δεδομένων ανά ενότητα

Κάθε ενότητα δημιουργεί/αναβαθμίζει τους δικούς της πίνακες στην εκκίνηση:

| Ενότητα | Πίνακες |
| --- | --- |
| `core/database.py` | `users`, `settings`, `letters`, `letter_templates`, `otps`, `login_guard` |
| `core/notifications.py` | `notifications`, `notification_seen` |
| `modules/decrees/*` | `decree_documents` (νέα Διατάγματα)· `decrees`, `members` (παλιά διαδρομή /decree) |
| `modules/protocol/numbering.py` | στήλες πρωτοκόλλου των Διαταγμάτων, ρύθμιση `protocol_start` |
| `modules/members/*` | `member_registry`, `member_lodges`, `member_degrees_offices` |
| `modules/provinces/*` | `grand_lodges` (Επαρχιακές / Περιφερειακή Μεγάλη Στοά, ΕΜΣτΕ) |
| `modules/lodges/*` | `lodges` |
| `modules/visits/*` | `reps` (Εκπρόσωποι ΜΔ), `visits` (Επισκέψεις Στοών), ρυθμίσεις `visits_signer_name`, `visits_signer_title`, `visits_rankmap` |
| `modules/namedays/*` | `namedays` (εορτολόγιο ονομάτων), `greetings_log` (ιστορικό ευχών), ρυθμίσεις `greet_subject`, `greet_body`, `greet_bcc_self` |
| `modules/projects/*` | `projects`, `project_units`, `project_members`, `project_contacts`, `project_files` (αρχεία στο `DATA_DIR/project_files/`), `project_log` |
| `modules/drive/*` | `app_secrets`, `drive_uploads`, ρύθμιση `drive_folder_id` |
