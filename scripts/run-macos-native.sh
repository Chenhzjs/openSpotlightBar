#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE_BIN="$ROOT_DIR/apps/desktop/src-tauri/target/debug/pulse_launcher_bridge"

cargo build --manifest-path "$ROOT_DIR/apps/desktop/src-tauri/Cargo.toml" --bin pulse_launcher_bridge
PULSE_REPO_ROOT="$ROOT_DIR" PULSE_BRIDGE_BIN="$BRIDGE_BIN" \
  swift run --package-path "$ROOT_DIR/apps/macos" PulseLauncherMac
