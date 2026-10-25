#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"
uv venv --allow-existing .venv-cutting
uv pip install --python .venv-cutting/bin/python 'yt-dlp[default]==2026.10.21'
node scripts/check-video-cutting.mjs
