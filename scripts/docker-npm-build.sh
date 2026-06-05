#!/usr/bin/env bash
# Docker ビルド時: firebase-build.env から NEXT_PUBLIC_* のみ export して npm build する。
# RESEND_FROM_EMAIL 等（<> 含む）はランタイム用のためここでは読まない。
set -euo pipefail

secret_path="${1:-/run/secrets/next_public_env}"

nwb_public_app_url=""
while IFS= read -r line || [ -n "$line" ]; do
  line=$(printf '%s' "$line" | sed 's/\r$//')
  [[ -z "${line// }" ]] && continue
  [[ "$line" == \#* ]] && continue
  case "$line" in
    NEXT_PUBLIC_*=*) export "$line" ;;
    NWB_PUBLIC_APP_URL=*) nwb_public_app_url="${line#NWB_PUBLIC_APP_URL=}" ;;
  esac
done < "$secret_path"
if [[ -n "$nwb_public_app_url" && -z "${NEXT_PUBLIC_NWB_PUBLIC_APP_URL:-}" ]]; then
  export NEXT_PUBLIC_NWB_PUBLIC_APP_URL="$nwb_public_app_url"
fi

npm run build && npm prune --omit=dev
