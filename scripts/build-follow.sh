#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/generate_follow.py
bash scripts/rive-cli.sh rive-follow --verify
bash scripts/rive-cli.sh inspect rive-follow --summary
bash scripts/rive-cli.sh rive-follow --once
cp rive-follow/build/rive-follow.riv src/assets/follow-expressive.riv
cp rive-follow/build/rive-follow.riv public/follow-expressive.riv
