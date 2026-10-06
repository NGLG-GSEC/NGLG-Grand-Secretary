# Μεταφορά της εφαρμογής από το Render στο Google Cloud Run (δωρεάν)

Η «Ψηφιακή Μεγάλη Γραμματεία» θα τρέχει σε δύο υπηρεσίες:
- το **Google Cloud Run** για την εφαρμογή,
- τη **Neon** για τη βάση PostgreSQL.

Για τη χρήση της Γραμματείας και οι δύο μένουν στα δωρεάν όρια. Το portal (GitHub Pages) δεν αλλάζει.

Χρόνος: περίπου 30–40 λεπτά, μία φορά. Μετά, κάθε αλλαγή στον κώδικα αναπτύσσεται αυτόματα, μόλις περάσουν οι έλεγχοι.

Το **Render μένει ανοιχτό μέχρι το τέλος**. Το κλείνουμε μόνο όταν η νέα εφαρμογή δουλεύει και έχουν μεταφερθεί τα δεδομένα (βήμα 6).

---

## 1. Βάση δεδομένων στη Neon (5 λεπτά)

1. Ανοίξτε το https://neon.tech και πατήστε **Sign up**. Μπορείτε να συνδεθείτε με τον λογαριασμό Google.
2. **Create project** με τις εξής ρυθμίσεις:
   - Όνομα: `nglg`
   - Postgres version: 16 ή νεότερη
   - Region: **AWS Europe Central 1 (Frankfurt)**
3. Στην καρτέλα **Connection string**:
   - απενεργοποιήστε το **Connection pooling**,
   - αντιγράψτε τη διεύθυνση. Μοιάζει με
     `postgresql://neondb_owner:……@ep-……eu-central-1.aws.neon.tech/neondb?sslmode=require`.

   Αυτό είναι το **DATABASE_URL**. Είναι κωδικός πρόσβασης: μην το στείλετε σε κανέναν.

## 2. Google Cloud (10 λεπτά)

1. Ανοίξτε το https://console.cloud.google.com με τον λογαριασμό Google που θέλετε να είναι ο κάτοχος.
2. Πάνω αριστερά επιλέξτε **Select project → New project**. Όνομα: `nglg-grammateia`. Σημειώστε το **Project ID** που εμφανίζεται, π.χ. `nglg-grammateia-123456`.
3. **Billing → Link a billing account**. Χρειάζεται κάρτα, αλλά εντός των δωρεάν ορίων δεν γίνεται χρέωση.
4. Συνιστάται ειδοποίηση κόστους: **Billing → Budgets & alerts → Create budget**.
   - Ποσό: 1 €.
   - Ειδοποιήσεις στο 50% και στο 100%.

   Έτσι ενημερώνεστε με email αν ποτέ ξεπεραστεί το δωρεάν όριο.
5. Πάνω δεξιά πατήστε το εικονίδιο **Cloud Shell** (`>_`) και εκτελέστε, βάζοντας το δικό σας Project ID:

   ```
   git clone https://github.com/NGLG-GSEC/NGLG-Grand-Secretary
   bash NGLG-Grand-Secretary/deploy/gcp-setup.sh nglg-grammateia-123456
   ```

   Αν σας ζητηθεί «Authorize», πατήστε το. Στο τέλος εμφανίζονται **5 τιμές** (GCP_PROJECT_ID, GCP_REGION, GCP_WIF_PROVIDER, GCP_DEPLOY_SA, GCP_RUN_SA).

## 3. Ρυθμίσεις στο GitHub (10 λεπτά)

Πηγαίνετε στο https://github.com/NGLG-GSEC/NGLG-Grand-Secretary/settings/secrets/actions

**Καρτέλα «Variables» → New repository variable.** Προσθέστε τις 5 τιμές του βήματος 2.

**Καρτέλα «Secrets» → New repository secret.** Τις περισσότερες τιμές θα τις βρείτε στο Render → nglg-letter-manager → **Environment**:

| Secret | Από πού |
|---|---|
| `DATABASE_URL` | Η διεύθυνση της Neon (βήμα 1) — **όχι** του Render |
| `APP_SECRET` | Ίδιο με το Render (αλλιώς απλώς θα χρειαστεί νέα είσοδος) |
| `SMTP_PASSWORD` | Ίδιο με το Render |
| `GOOGLE_OAUTH_CLIENT_ID` | Ίδιο με το Render |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Ίδιο με το Render |
| `PRIMARY_ADMIN_EMAIL` | Ίδιο με το Render (αν υπάρχει) |
| `PRIMARY_ADMIN_PASSWORD_HASH` | Ίδιο με το Render (αν υπάρχει) |
| `AUTHORIZED_USER_EMAIL`, `AUTHORIZED_USER_PASSWORD_HASH` | Ίδια με το Render (αν υπάρχουν) |

Τα μυστικά μένουν μόνο στο GitHub και στο Google Cloud. Δεν εμφανίζονται ποτέ στον κώδικα.

## 4. Πρώτη ανάπτυξη (5 λεπτά)

1. Ανοίξτε **GitHub → Actions → «Deploy (Cloud Run)» → Run workflow → Run workflow**.
2. Μετά από περίπου 3–5 λεπτά εμφανίζεται πράσινο ✓. Στη σύνοψη της εκτέλεσης φαίνεται η νέα διεύθυνση, π.χ.
   `https://nglg-letter-manager-123456789.europe-west1.run.app`.
3. Ανοίξτε τη διεύθυνση με την κατάληξη `/health`. Πρέπει να δείχνει `"host": "cloud-run"` και `"database": "postgres"`.

## 5. Μεταφορά των δεδομένων (5 λεπτά)

1. Στην **παλιά** εφαρμογή (Render) πηγαίνετε στο **Βάση Δεδομένων → 💾 Αντίγραφο ασφαλείας → ⬇ Λήψη πλήρους αντιγράφου**.
   Η διεύθυνση είναι https://nglg-letter-manager.onrender.com/database/restore.
2. Στη **νέα** εφαρμογή (Cloud Run) συνδεθείτε, πηγαίνετε στην ίδια σελίδα, επιλέξτε το αρχείο, γράψτε **ΕΠΑΝΑΦΟΡΑ** και πατήστε **Επαναφορά δεδομένων**.
3. Ελέγξτε στη Βάση Δεδομένων ότι οι αριθμοί εγγραφών είναι ίδιοι στις δύο εφαρμογές.

Το αρχείο αντιγράφου περιέχει προσωπικά δεδομένα. Διαγράψτε το από τον υπολογιστή μετά τη μεταφορά, ή φυλάξτε το σε ασφαλές σημείο.

## 6. Τελικά βήματα

1. **Google Drive.**
   - Στο Google Cloud του OAuth client (APIs & Services → Credentials → ο OAuth client της εφαρμογής) προσθέστε στα **Authorized redirect URIs** τη διεύθυνση
     `https://<νέα-διεύθυνση>/drive/callback`.
   - Μετά πατήστε «Σύνδεση» στη σελίδα Google Drive της εφαρμογής, αν χρειάζεται.
2. **Portal.** Στείλτε τη νέα διεύθυνση στον Claude. Θα ενημερωθούν όλοι οι σύνδεσμοι του portal.
   Προαιρετικά, βάλτε τη και ως Variable `PUBLIC_BASE_URL` στο GitHub.
3. **Έλεγχος.** Ανοίξτε τη σελίδα **🩺 Έλεγχος συστήματος** στη νέα εφαρμογή. Όλες οι σελίδες πρέπει να έχουν ✓.
4. **Κλείσιμο του Render.** Όταν όλα δουλεύουν για λίγες μέρες:
   - Render → nglg-letter-manager → **Settings → Delete Web Service**,
   - και τη βάση **nglg-letter-manager-db**, αν υπάρχει.

   Από εκεί και πέρα δεν υπάρχει χρέωση στο Render.

## Προαιρετικά: δική σας διεύθυνση

Αντί για τη διεύθυνση `…run.app` μπορεί να χρησιμοποιηθεί π.χ. `grammateia.nglgreece.gr`. Αυτό γίνεται στο Cloud Run → **Manage custom domains**, με μία εγγραφή DNS στο nglgreece.gr, χωρίς κόστος.

## Τι γίνεται αυτόματα από εδώ και πέρα

- Κάθε αλλαγή που μπαίνει στο `main` ελέγχεται (Tests) και, αν περάσει, αναπτύσσεται στο Cloud Run (Deploy).
- Το `/health` δείχνει ποιο commit τρέχει.
- Η εφαρμογή «κοιμάται» όταν δεν τη χρησιμοποιεί κανείς και ξυπνά σε λίγα δευτερόλεπτα. Γι' αυτό το κόστος μένει μηδενικό.
- Το αποθετήριο εικόνων κρατά μόνο τις 2 τελευταίες εκδόσεις, ώστε να μένει μέσα στο δωρεάν όριο αποθήκευσης.
