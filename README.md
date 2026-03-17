# Pulse Launcher

Pulse Launcher is a production-oriented cross-platform desktop launcher built with Tauri 2, React, TypeScript, Rust, SQLite, Tailwind CSS, and Zustand. It targets macOS, Windows, and Linux with a keyboard-first, local-first architecture inspired by Alfred, Raycast, PowerToys Run, and Ulauncher.

The active implementation lives under `apps/`, `packages/`, and `plugins/`. The legacy Qt/C++ code in this repository is reference-only and is not part of the Pulse Launcher runtime.

## Product overview

Pulse Launcher is designed around a few fixed constraints:

- keyboard-first interaction
- local-only storage by default
- fast provider fan-out with timeout protection
- unified result and action models
- extensibility through a permission-gated plugin system
- platform-specific behavior isolated in Rust

Current product slices:

- launcher window with global hotkey wiring
- application search
- lightweight file search by filename and path metadata
- clipboard history
- snippets with variable expansion
- web search shortcuts
- result action panel on `Tab`
- settings UI
- persisted usage-based ranking
- local plugin host with example plugins

## Architecture

Pulse Launcher keeps a strict split between shared search logic, the React UI shell, plugin runtime orchestration, and platform services:

- [apps/desktop](/Users/chenhz/Documents/work-station/openSpotlightBar/apps/desktop) contains the React UI, Zustand state, provider wiring, launcher interaction model, and plugin host.
- [apps/desktop/src-tauri](/Users/chenhz/Documents/work-station/openSpotlightBar/apps/desktop/src-tauri) contains Rust commands, SQLite persistence, file indexing, clipboard observation, plugin discovery, and platform-specific modules.
- [packages/shared-types](/Users/chenhz/Documents/work-station/openSpotlightBar/packages/shared-types) defines shared domain models such as `ResultItem`, `ActionItem`, settings, clipboard, snippets, plugins, and bootstrap payloads.
- [packages/core](/Users/chenhz/Documents/work-station/openSpotlightBar/packages/core) owns query parsing, fuzzy scoring, ranking, and timeout-protected provider aggregation.
- [packages/plugin-sdk](/Users/chenhz/Documents/work-station/openSpotlightBar/packages/plugin-sdk) defines the plugin contracts and host API surface.

Search remains provider-based. Each provider returns the same `ResultItem` shape, each result exposes `ActionItem` actions, and ranking combines:

- provider score
- fuzzy score
- prefix bonus
- exact match bonus
- source weight
- recency bonus
- usage history boost

Platform-specific discovery stays isolated under [apps/desktop/src-tauri/src/platform](/Users/chenhz/Documents/work-station/openSpotlightBar/apps/desktop/src-tauri/src/platform). Plugin discovery and manifest validation stay on the Rust side, while plugin execution happens in isolated frontend workers with permission-gated host APIs.

More detail: [docs/architecture.md](/Users/chenhz/Documents/work-station/openSpotlightBar/docs/architecture.md)

## Monorepo structure

```text
apps/
  desktop/               React + Tauri desktop app
packages/
  core/                  query parsing, ranking, search orchestration
  plugin-sdk/            plugin authoring contracts
  shared-types/          shared models and settings
plugins/
  calculator/            calculator example plugin
  github/                GitHub search example plugin
  shell/                 shell command example plugin
scripts/                 local build and release helpers
docs/                    architecture, release notes, roadmap
```

## Setup

Requirements:

- Node.js 20+
- pnpm 9+
- Rust stable
- Tauri system dependencies for your OS

Install dependencies:

```bash
pnpm install
```

Run the desktop app:

```bash
pnpm dev
```

Run the production frontend build:

```bash
pnpm desktop:build
```

Run the full verification pipeline:

```bash
pnpm verify
```

## Development workflow

Useful workspace commands:

- `pnpm dev` starts the Tauri development app
- `pnpm desktop:dev` starts the Vite frontend only
- `pnpm typecheck` runs TypeScript checks across workspaces
- `pnpm lint` runs ESLint on the active TypeScript and plugin sources
- `pnpm test` runs Vitest unit tests
- `pnpm format` applies Prettier
- `pnpm verify` runs format check, lint, typecheck, tests, frontend build, Rust format check, and Rust compile check

Phase 4 test coverage currently focuses on:

- ranking logic
- provider aggregation
- usage-based ranking boost
- action payload resolution

The current error-handling pass also adds:

- a React error boundary for fatal UI failures
- scoped frontend logging
- provider timeout diagnostics
- plugin timeout and crash diagnostics

## Search and interaction model

Current built-in providers:

- `AppProvider`
- `FileProvider`
- `ClipboardProvider`
- `SnippetProvider`
- `PluginProvider`
- `WebSearchProvider`
- `SystemProvider`

Current built-in actions:

- open or launch
- reveal in folder
- copy path
- copy text
- open in terminal
- search on web
- paste text hook with TODO marker for native simulation
- pin or unpin clipboard item
- delete clipboard item
- clear clipboard history
- expand snippet
- rebuild file index
- open settings
- run plugin action

Interaction rules:

- arrow keys move selection
- `Enter` runs the default action
- `Tab` opens the action panel for the selected result
- `Ctrl+,` opens settings
- `Escape` closes the launcher or exits the current panel

## Plugin authoring

Plugin System v1 is local-only and intentionally small:

- plugins are discovered from a local plugins directory
- each plugin has a `manifest.json` plus a JS-compatible ESM entry file
- each plugin runs in a dedicated worker
- plugin search and action execution are wrapped in timeouts
- sensitive capabilities are gated by explicit permissions
- missing permissions surface as approval requests in Settings

Current permission model:

- `network`
- `filesystem.read`
- `filesystem.write`
- `clipboard.read`
- `clipboard.write`
- `shell.exec`
- `notifications`

Minimal plugin shape:

```text
my-plugin/
├── manifest.json
└── src/
    └── index.js
```

Minimal manifest:

```json
{
  "id": "com.example.demo",
  "name": "Demo Plugin",
  "version": "0.1.0",
  "entry": "src/index.js",
  "commands": [
    {
      "name": "demo",
      "title": "Demo command"
    }
  ],
  "permissions": []
}
```

Minimal entry:

```js
/** @typedef {import("@pulse/plugin-sdk").LauncherPluginModule} LauncherPluginModule */

/** @type {LauncherPluginModule} */
const plugin = {
  async search(context) {
    if (!context.query.startsWith("demo ")) return [];
    return [
      {
        id: "demo:hello",
        title: "Hello from plugin",
        type: "plugin",
        actions: [
          {
            id: "copy",
            title: "Copy text",
            kind: "copy-text",
            payload: { text: "hello" }
          }
        ]
      }
    ];
  }
};

export default plugin;
```

Example plugins shipped in this repo:

- [plugins/calculator](/Users/chenhz/Documents/work-station/openSpotlightBar/plugins/calculator)
- [plugins/github](/Users/chenhz/Documents/work-station/openSpotlightBar/plugins/github)
- [plugins/shell](/Users/chenhz/Documents/work-station/openSpotlightBar/plugins/shell)

## Packaging and release

Platform build helpers:

- `pnpm release:macos`
- `pnpm release:windows`
- `pnpm release:linux`

Each script installs dependencies with a frozen lockfile, runs `pnpm verify` by default, and then executes `tauri build`.

Detailed local release notes: [docs/release.md](/Users/chenhz/Documents/work-station/openSpotlightBar/docs/release.md)

## Current limitations by platform

macOS:

- application discovery currently scans `/Applications` and `~/Applications`
- deeper Launch Services integration is still TODO
- signing and notarization are not configured yet

Windows:

- application discovery is based on Start Menu shortcuts and common install paths
- richer registry-backed discovery can be added later
- signing and installer hardening are not configured yet

Linux:

- application discovery currently parses standard `.desktop` entries
- package dependencies vary by distribution
- native clipboard watcher improvements are still TODO

Cross-platform:

- file indexing is intentionally shallow and does not do content indexing
- clipboard history is text-first; image and file payloads are modeled but not implemented
- clipboard watching still uses a polling-first implementation
- snippet expansion currently copies output to the clipboard instead of injecting text globally
- hotkey editing is a scaffold, not a native shortcut recorder
- plugin isolation currently uses workers plus host permission gating, not a hardened OS sandbox
- plugin entries must currently be JS-compatible at runtime

## Roadmap

1. Replace polling-based clipboard observation with native watchers and privacy-aware source filtering.
2. Add true global snippet expansion hooks with app-aware restrictions.
3. Harden plugin sandboxing, packaging, and installation flows.
4. Add platform signing, notarization, and release automation.

Additional roadmap detail: [docs/roadmap.md](/Users/chenhz/Documents/work-station/openSpotlightBar/docs/roadmap.md)
