# Ρύθμιση Google Drive — αντίγραφο των PDF στον φάκελο της Μεγάλης Γραμματείας

Όταν μια **Επιστολή** ή ένα **Διάταγμα** σημανθεί «Έτοιμο», η εφαρμογή ανεβάζει αυτόματα το τελικό PDF
στον φάκελο Google Drive της Μεγάλης Γραμματείας, με όνομα τον αριθμό πρωτοκόλλου
(π.χ. `20.542_26_Επιστολή_Εκπροσώπηση ΜΔ.pdf`), και εμφανίζει ειδοποίηση μέσα στην εφαρμογή.

Φάκελος προορισμού: <https://drive.google.com/drive/folders/1kKR7v86jjs5QJE9-K5uUebvS6nZd9J03>
(αλλάζει από **Ρυθμίσεις → `drive_folder_id`**).

Για να λειτουργήσει χρειάζεται **μία φορά** η παρακάτω ρύθμιση (≈10 λεπτά).
Ορισμένα μενού της Google αλλάζουν κατά καιρούς όνομα· όπου χρειάζεται αναφέρονται και οι δύο ονομασίες.

**Πριν ξεκινήσετε:** συνδεθείτε με λογαριασμό που έχει **δικαίωμα επεξεργασίας (Editor) στον φάκελο**
— ιδανικά `grand.secretary@nglgreece.gr`.

---

## 1. Δημιουργία project

1. Ανοίξτε <https://console.cloud.google.com>.
2. Πάνω αριστερά, στη λίστα projects → **New Project**.
3. Όνομα, π.χ. `NGLG Letter Manager` → **Create** → βεβαιωθείτε ότι είναι επιλεγμένο αυτό το project.

## 2. Ενεργοποίηση Google Drive API

1. Μενού ☰ → **APIs & Services → Library**.
2. Αναζήτηση **Google Drive API** → **Enable**.

## 3. Οθόνη συναίνεσης

Μενού **Google Auth Platform** (ή, στην παλιά μορφή, **APIs & Services → OAuth consent screen**):

1. **Get started**.
2. **App name:** `Μεγάλη Γραμματεία ΕΜΣτΕ` · **User support email:** το email σας.
3. **Audience:**
   - **Internal** — αν ο λογαριασμός είναι @nglgreece.gr (Google Workspace). *Καλύτερη επιλογή:* δεν θέλει
     τίποτε άλλο και η σύνδεση δεν λήγει.
   - **External** — μόνο αν δεν υπάρχει η επιλογή Internal (π.χ. λογαριασμός @gmail.com). Τότε, αφού
     τελειώσει το βήμα 4, πηγαίνετε **Audience → Publish app** (να γίνει «In production»), αλλιώς η σύνδεση
     **λήγει κάθε 7 ημέρες**.
4. **Contact email** → αποδοχή όρων → **Create**.

## 4. Δημιουργία OAuth Client

1. **Clients** (ή **APIs & Services → Credentials → Create credentials → OAuth client ID**).
2. **Application type:** `Web application` · **Name:** `Letter Manager`.
3. **Authorized redirect URIs → Add URI**, ακριβώς (χωρίς κενό, χωρίς `/` στο τέλος):

   ```
   https://nglg-letter-manager.onrender.com/drive/callback
   ```

4. **Create**.
5. Αντιγράψτε **Client ID** και **Client secret** — πατήστε και **Download JSON**, γιατί το secret
   εμφανίζεται μόνο μία φορά. **Μην τα στείλετε σε κανέναν** και μην τα γράψετε στο GitHub· πηγαίνουν
   μόνο στο Render (βήμα 5).

## 5. Καταχώρηση στο Render

1. <https://dashboard.render.com> → υπηρεσία **nglg-letter-manager** → **Environment**.
2. Προσθέστε:
   - `GOOGLE_OAUTH_CLIENT_ID` = το Client ID
   - `GOOGLE_OAUTH_CLIENT_SECRET` = το Client secret
3. **Save Changes** → η εφαρμογή επανεκκινεί σε 1–2 λεπτά.

## 6. Σύνδεση από την εφαρμογή

1. <https://nglg-letter-manager.onrender.com/drive> (μενού **Google Drive**) → **«Σύνδεση με Google Drive»**.
2. Επιλέξτε τον λογαριασμό με δικαίωμα επεξεργασίας στον φάκελο → **Allow / Συνέχεια**.
   - Με **External** θα δείτε «Google hasn't verified this app» — αναμενόμενο για δική σας εφαρμογή:
     **Advanced → Go to … (unsafe)**.
3. Πατήστε **«Δοκιμή σύνδεσης»** → πρέπει να γράψει «Σύνδεση OK. Φάκελος: «…»».

Από εκεί και πέρα, κάθε έγγραφο που γίνεται «Έτοιμο» ανεβαίνει αυτόματα. Όσα έγιναν «Έτοιμα» πριν από τη
σύνδεση ανεβαίνουν με το κουμπί **«Ανέβασμα στο Google Drive»** στη σελίδα του εγγράφου.

---

## Αν κάτι δεν πάει καλά

| Μήνυμα | Λύση |
| --- | --- |
| `redirect_uri_mismatch` | Το URI του βήματος 4.3 δεν είναι ακριβώς ίδιο (https, χωρίς κενό, χωρίς `/` στο τέλος). |
| `access_denied` ή «has not completed the Google verification process» | Η εφαρμογή είναι External σε «Testing»: **Publish app** ή προσθέστε το email σας στους **Test users**. |
| «Δεν έδωσε refresh token» | <https://myaccount.google.com/permissions> → αφαιρέστε την πρόσβαση της εφαρμογής → ξανά «Σύνδεση». |
| Η δοκιμή γράφει ότι δεν υπάρχει δικαίωμα προσθήκης στον φάκελο | Ο λογαριασμός δεν είναι Editor στον φάκελο· μοιραστείτε τον φάκελο ή συνδεθείτε με άλλον λογαριασμό. |
| Η σελίδα Google Drive γράφει «Λείπουν τα στοιχεία OAuth» | Δεν έχουν οριστεί (ή είναι λάθος) οι μεταβλητές του βήματος 5 στο Render. |
