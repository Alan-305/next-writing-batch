#!/usr/bin/env bash
# Cloud Tasks キュー（非同期添削）を作成する。
# 使い方:
#   PROJECT_ID=nexus0101-35b17 REGION=asia-northeast1 QUEUE=proofread-jobs ./scripts/setup-proofread-cloud-tasks.sh
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-${GCP_PROJECT_ID:-}}"
REGION="${REGION:-${NWB_CLOUD_TASKS_LOCATION:-asia-northeast1}}"
QUEUE="${QUEUE:-${NWB_CLOUD_TASKS_QUEUE:-proofread-jobs}}"

if [[ -z "$PROJECT_ID" ]]; then
  echo "PROJECT_ID または GCP_PROJECT_ID を指定してください。" >&2
  exit 1
fi

echo "Creating queue ${QUEUE} in ${PROJECT_ID} (${REGION})…"

gcloud tasks queues describe "$QUEUE" --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1 ||
  gcloud tasks queues create "$QUEUE" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --max-concurrent-dispatches=5 \
    --max-dispatches-per-second=2 \
    --max-attempts=3 \
    --min-backoff=60s \
    --max-backoff=600s

echo "OK. Set on Cloud Run:"
echo "  NWB_CLOUD_TASKS_QUEUE=${QUEUE}"
echo "  NWB_CLOUD_TASKS_LOCATION=${REGION}"
echo "  NWB_PROOFREAD_WORKER_URL=https://（Cloud Run の URL）"
echo "  NWB_PROOFREAD_WORKER_SECRET=（ランダム秘密・Secret Manager 推奨）"
