#!/usr/bin/env bash
# Ρύθμιση Google Cloud για την «Ψηφιακή Μεγάλη Γραμματεία» — εκτελείται ΜΙΑ φορά στο Google Cloud Shell:
#   bash deploy/gcp-setup.sh <PROJECT_ID>
# Ενεργοποιεί τις υπηρεσίες, δημιουργεί αποθετήριο εικόνων (κρατά μόνο τις 2 τελευταίες), λογαριασμούς υπηρεσίας
# και σύνδεση χωρίς κλειδιά (Workload Identity) ώστε μόνο το GitHub NGLG-GSEC/NGLG-Grand-Secretary να μπορεί να αναπτύσσει.
# Στο τέλος τυπώνει τις τιμές που μπαίνουν στο GitHub (Settings → Secrets and variables → Actions → Variables).
set -euo pipefail
PROJECT_ID="${1:?Χρήση: bash deploy/gcp-setup.sh <PROJECT_ID>}"
REGION="${REGION:-europe-west1}"
GH_REPO="NGLG-GSEC/NGLG-Grand-Secretary"
DEPLOY_SA="nglg-deployer@${PROJECT_ID}.iam.gserviceaccount.com"
RUN_SA="nglg-run@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud config set project "$PROJECT_ID" >/dev/null
PNUM=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
echo "→ Ενεργοποίηση υπηρεσιών (1–2 λεπτά)…"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com

echo "→ Αποθετήριο εικόνων"
gcloud artifacts repositories describe nglg --location "$REGION" >/dev/null 2>&1 || \
  gcloud artifacts repositories create nglg --repository-format=docker --location "$REGION" --description "NGLG Grand Secretary"
cat > /tmp/nglg-cleanup.json <<'JSON'
[{"name":"keep-latest","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":2}},
 {"name":"delete-older","action":{"type":"Delete"},"condition":{"tagState":"ANY","olderThan":"3600s"}}]
JSON
gcloud artifacts repositories set-cleanup-policies nglg --location "$REGION" --policy /tmp/nglg-cleanup.json --no-dry-run >/dev/null

echo "→ Λογαριασμοί υπηρεσίας"
gcloud iam service-accounts describe "$DEPLOY_SA" >/dev/null 2>&1 || gcloud iam service-accounts create nglg-deployer --display-name "NGLG deploy από GitHub"
gcloud iam service-accounts describe "$RUN_SA" >/dev/null 2>&1 || gcloud iam service-accounts create nglg-run --display-name "NGLG εφαρμογή (Cloud Run)"
for ROLE in roles/run.admin roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$DEPLOY_SA" --role "$ROLE" --condition=None >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" --member "serviceAccount:$DEPLOY_SA" --role roles/iam.serviceAccountUser >/dev/null

echo "→ Σύνδεση GitHub χωρίς κλειδιά (Workload Identity)"
gcloud iam workload-identity-pools describe github --location global >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools create github --location global --display-name "GitHub"
gcloud iam workload-identity-pools providers describe github --location global --workload-identity-pool github >/dev/null 2>&1 || \
  gcloud iam workload-identity-pools providers create-oidc github --location global --workload-identity-pool github \
    --display-name "GitHub Actions" --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition "assertion.repository=='${GH_REPO}'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PNUM}/locations/global/workloadIdentityPools/github/attribute.repository/${GH_REPO}" >/dev/null

cat <<OUT

✅ Έτοιμο. Βάλτε στο GitHub → NGLG-Grand-Secretary → Settings → Secrets and variables → Actions → καρτέλα «Variables»:

  GCP_PROJECT_ID    = ${PROJECT_ID}
  GCP_REGION        = ${REGION}
  GCP_WIF_PROVIDER  = projects/${PNUM}/locations/global/workloadIdentityPools/github/providers/github
  GCP_DEPLOY_SA     = ${DEPLOY_SA}
  GCP_RUN_SA        = ${RUN_SA}

OUT
