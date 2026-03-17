# Pulse Launcher Build and Release Notes

This document covers the local build and packaging flow for the current Phase 4 codebase. It does not cover signing, notarization, or auto-update publishing yet.

## Shared prerequisites

- Node.js 20+
- pnpm 9+
- Rust stable toolchain
- Tauri 2 system dependencies for the target OS

All platform scripts install dependencies with `--frozen-lockfile`, run workspace verification by default, and then call `tauri build`.

Artifacts are emitted under `apps/desktop/src-tauri/target/release/bundle`.

## macOS

Prerequisites:

- Xcode Command Line Tools
- `pkg-config`

Build:

```bash
pnpm release:macos
```

Skip verification if you already ran it:

```bash
SKIP_VERIFY=1 pnpm release:macos
```

Current macOS limitations:

- app discovery currently scans `/Applications` and `~/Applications`; deeper Launch Services integration is still TODO
- hotkey editing is still a scaffold, not a native recorder
- notarization and signing are not configured yet

## Windows

Prerequisites:

- Visual Studio Build Tools with C++ workload
- WebView2 runtime

Build:

```powershell
pnpm release:windows
```

Skip verification if you already ran it:

```powershell
pnpm release:windows -- -SkipVerify
```

Current Windows limitations:

- app discovery is based on Start Menu shortcuts and common install locations; registry-backed coverage can be expanded later
- installer signing is not configured yet
- deeper shell integration for terminal and paste simulation remains TODO

## Linux

Prerequisites:

- `pkg-config`
- GTK/WebKitGTK dependencies required by Tauri on your distribution

Build:

```bash
pnpm release:linux
```

Skip verification if you already ran it:

```bash
SKIP_VERIFY=1 pnpm release:linux
```

Current Linux limitations:

- app discovery is currently based on `.desktop` entries and can miss custom launchers outside standard locations
- packaged dependencies vary by distribution
- native clipboard watcher improvements remain TODO

## Verification steps

The default release scripts run:

```bash
pnpm verify
```

That includes:

- Prettier check
- ESLint
- TypeScript typecheck across workspaces
- Vitest unit tests
- desktop frontend production build
- Rust format check
- Rust compile check

## Release checklist

1. Run `pnpm verify`.
2. Run the matching platform build script.
3. Smoke test the produced bundle on the target OS.
4. Verify hotkey, search, action panel, settings, clipboard, snippets, and plugin host behavior.
5. Record any OS-specific regressions before distributing artifacts.

## Deferred release work

- code signing and notarization
- update channels
- CI release automation
- crash report export bundle
- packaged plugin installation flow
