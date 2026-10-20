# Οδηγίες για το Claude σε αυτό το αποθετήριο

- Διάβασε πρώτα το `docs/ΥΠΟΔΟΜΗ_ΚΑΙ_ΚΩΔΙΚΟΙ.md`: ποιος λογαριασμός (GitHub / Google) κρατά τι, πού είναι οι Δηλώσεις
  (Sheet + Apps Script), ο φάκελος Drive, και πώς αλλάζουν οι κωδικοί (Script Properties: `ADMIN_KEY`, `ADMIN_EMAILS`, `GOOGLE_CLIENT_ID`).
- Το αποθετήριο είναι **δημόσιο**: ποτέ προσωπικά δεδομένα (ονόματα/email/κινητά μελών), κωδικοί ή tokens στον κώδικα.
  Δεδομένα μόνο στο ιδιωτικό `NGLG-GSEC/nglg-grammateia-data` (μέσω migrations της εφαρμογής) ή στις Script Properties.
- Χωρίς rebase / force-push / αλλαγή ιστορικού· merge του `main`.
- Μετά από κάθε αλλαγή: τεστ (`python3 -m pytest tests/test_app.py -q`), ενημέρωση README (και `declarations/README.md` όπου αφορά),
  push στο `main`, και απάντηση στα ελληνικά με τα live links (https://nglg-gsec.github.io/NGLG-Grand-Secretary/…).
