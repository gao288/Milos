#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/generate_girl.py
python3 scripts/verify-girl-artwork.py
bash scripts/rive-cli.sh rive-girl --verify
bash scripts/rive-cli.sh inspect rive-girl --summary
bash scripts/rive-cli.sh rive-girl --once
cp rive-girl/build/girl-expressive.riv src/assets/girl-expressive.riv
cp rive-girl/build/girl-expressive.riv public/girl-expressive.riv
