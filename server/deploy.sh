#!/usr/bin/env bash
# Builds and deploys the API to Cloud Run, scale-to-zero and request-billed.
#
#   ./deploy.sh            # build locally with Go + ko (no Docker), push, deploy
#   USE_CLOUD_BUILD=1 ./deploy.sh   # build with Cloud Build instead (no Docker needed)
#
# Idempotent: re-running only rolls out a new revision.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-fiap-mobile-9eaf0}"
REGION="${REGION:-us-central1}"
SERVICE="${SERVICE:-cp4-chat-api}"
REPO="${REPO:-cp4-chat}"
SA_NAME="${SA_NAME:-cp4-chat-api}"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
DATABASE_URL="${DATABASE_URL:-https://${PROJECT_ID}-default-rtdb.firebaseio.com}"
STORAGE_BUCKET="${STORAGE_BUCKET:-${PROJECT_ID}.firebasestorage.app}"
IMAGE_REPO="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${SERVICE}"
TAG="$(date +%Y%m%d-%H%M%S)"
KO_VERSION="${KO_VERSION:-v0.19.1}"

cd "$(dirname "$0")"
gc() { gcloud --project "$PROJECT_ID" --quiet "$@"; }

echo "==> Enabling APIs"
gc services enable run.googleapis.com artifactregistry.googleapis.com \
  firestore.googleapis.com firebasedatabase.googleapis.com fcm.googleapis.com \
  cloudbuild.googleapis.com iam.googleapis.com

echo "==> Service account with least privilege (no key is ever created)"
if ! gc iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  gc iam service-accounts create "$SA_NAME" --display-name "CP4 Chat API (Cloud Run)"
fi
# Firestore read/write, Realtime Database read/write, FCM send. ID token
# verification needs no IAM role (it uses Google's public keys).
for role in roles/datastore.user roles/firebasedatabase.admin roles/firebasecloudmessaging.admin; do
  gc projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${SA_EMAIL}" --role "$role" --condition None >/dev/null
done

if [[ "${USE_CLOUD_BUILD:-0}" == "1" ]]; then
  SOURCE_ARGS=(--source .)
else
  echo "==> Building image locally with ko (Go toolchain, no Docker)"
  if ! gc artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1; then
    gc artifacts repositories create "$REPO" --repository-format docker --location "$REGION"
  fi
  gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet >/dev/null
  IMAGE_REF="$(KO_DOCKER_REPO="$IMAGE_REPO" go run "github.com/google/ko@${KO_VERSION}" \
    build . --bare --tags "$TAG")"
  SOURCE_ARGS=(--image "$IMAGE_REF")
fi

echo "==> Deploying ${SERVICE} to ${REGION}"
# min-instances 0      -> scales to zero, pay nothing while idle
# cpu-throttling       -> CPU only while a request is in flight (request-based billing)
# cpu-boost            -> extra CPU during container startup: shorter cold starts
# gen1                 -> the first-generation sandbox starts small containers fastest
gc run deploy "$SERVICE" "${SOURCE_ARGS[@]}" \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 5 \
  --cpu 1 \
  --memory 256Mi \
  --concurrency 80 \
  --cpu-throttling \
  --cpu-boost \
  --execution-environment gen1 \
  --timeout 30 \
  --set-env-vars "FIREBASE_PROJECT_ID=${PROJECT_ID},FIREBASE_DATABASE_URL=${DATABASE_URL},FIREBASE_STORAGE_BUCKET=${STORAGE_BUCKET}"

URL="$(gc run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')"
echo "==> Deployed: ${URL}"
curl -fsS "${URL}/health" && echo
