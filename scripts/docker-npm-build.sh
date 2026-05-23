#!/usr/bin/env bash
# Docker ビルド時: firebase-build.env から NEXT_PUBLIC_* のみ export して npm build する。
# RESEND_FROM_EMAIL 等（<> 含む）はランタイム用のためここでは読まない。
set -euo pipefail

secret_path="${1:-/run/secrets/next_public_env}"

while IFS= read -r line || [ -n "$line" ]; do
  line=$(printf '%s' "$line" | sed 's/\r$//')
  [[ -z "${line// }" ]] && continue
  [[ "$line" == \#* ]] && continue
  case "$line" in
    NEXT_PUBLIC_*=*) export "$line" ;;
  esac
done < "$secret_path"

npm run build && npm prune --omit=dev
