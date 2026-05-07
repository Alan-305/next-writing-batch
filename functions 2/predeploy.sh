#!/usr/bin/env sh
set -e
cd "$(dirname "$0")"
exec node ./node_modules/typescript/bin/tsc
