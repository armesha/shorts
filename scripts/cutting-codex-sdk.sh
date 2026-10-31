#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" != exec ]]; then exit 2; fi
shift
exec "${CUTTING_SDK_BINARY:-codex}" exec --ignore-user-config "$@"
