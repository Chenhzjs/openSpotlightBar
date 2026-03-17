#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

require_cmd() {
  local cmd="$1"

  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

run_release_build() {
  local platform="$1"

  cd "$ROOT_DIR"

  require_cmd pnpm
  require_cmd cargo

  echo "==> Pulse Launcher release build ($platform)"
  echo "Workspace: $ROOT_DIR"

  pnpm install --frozen-lockfile

  if [[ "${SKIP_VERIFY:-0}" != "1" ]]; then
    echo "==> Running workspace verification"
    pnpm verify
  else
    echo "==> Skipping verification because SKIP_VERIFY=1"
  fi

  echo "==> Building Tauri bundle"
  pnpm --filter @pulse/desktop tauri build

  echo "==> Bundles available under apps/desktop/src-tauri/target/release/bundle"
}
