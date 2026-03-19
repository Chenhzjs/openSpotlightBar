#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE_BIN="$ROOT_DIR/apps/desktop/src-tauri/target/debug/osb_bridge"

cargo build --manifest-path "$ROOT_DIR/apps/desktop/src-tauri/Cargo.toml" --bin osb_bridge
OSB_REPO_ROOT="$ROOT_DIR" OSB_BRIDGE_BIN="$BRIDGE_BIN" \
  swift build --package-path "$ROOT_DIR/apps/macos"
