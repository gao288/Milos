#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export LD_LIBRARY_PATH="$PWD/.tools/libs/usr/lib/x86_64-linux-gnu:${LD_LIBRARY_PATH:-}"
exec "${RIVE_CLI:-$PWD/.tools/rive/bin/rive}" "$@"
