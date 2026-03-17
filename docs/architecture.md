# Pulse Launcher Architecture

## Current objective

The current implementation extends the launcher shell into a local-first vertical slice with clipboard history, snippets, persisted usage-based ranking, Plugin System v1, and a stabilization pass for testing, packaging, and release workflows, while preserving the original architecture boundaries.

The goals remain:

- provider-based search
- unified result and action models
- Rust-owned platform integrations
- SQLite-owned local persistence
- React-owned UI and interaction state
- explicit permission gates for sensitive plugin capabilities

## Monorepo structure

```text
apps/desktop/
  src/                  React UI, providers, plugin host, Zustand store, settings surface
  src-tauri/            Rust commands, SQLite, clipboard monitor, file index, plugin discovery, platform modules
packages/
  shared-types/         ResultItem, ActionItem, settings, clipboard, snippets, plugin contracts, bootstrap payloads
  core/                 query parsing, ranking, search orchestration
  plugin-sdk/           plugin authoring types and PluginAPI contracts
plugins/
  calculator/
  github/
  shell/
```

## Data flow

1. The launcher input is parsed into a normalized query and an optional scope.
2. `SearchEngine` fans out to providers with timeout protection.
3. Providers return a shared `ResultItem` shape with shared `ActionItem` actions.
4. Ranking combines provider score, fuzzy score, prefix bonus, exact bonus, recency, source weight, and persisted usage boost.
5. React renders results, opens the action panel on `Tab`, and opens settings on `Ctrl+,` or the settings action.
6. Rust commands execute filesystem/app actions and mutate SQLite-backed state.
7. Plugin searches are delegated to dedicated workers through the plugin host, which enforces timeouts and host API permission checks.

## Quality and verification

Phase 4 adds shared workspace tooling so the active implementation can be checked consistently:

- ESLint for TypeScript, React, and plugin JS
- Prettier for workspace formatting
- Vitest coverage for ranking, provider aggregation, usage boost, and action resolution
- Rust format and compile checks through the root verification command

The release scripts run the same verification flow by default before bundling.

## Frontend responsibilities

The React layer owns:

- search input
- result list
- selection highlight
- keyboard navigation
- action panel
- settings UI
- snippet CRUD
- plugin runtime orchestration
- permission request presentation
- Zustand state for results, settings, clipboard items, snippets, discovered plugins, runtime snapshots, usage hints, and file index status

The frontend does not perform platform-specific work directly. It consumes Tauri commands and shared models.

## Rust responsibilities

Rust owns:

- global shortcut registration
- launcher window visibility
- app discovery per OS
- lightweight file indexing
- clipboard observation and local persistence
- plugin directory discovery and manifest validation
- permission-gated shell and clipboard bridges for plugins
- SQLite persistence for settings, usage stats, indexed files, clipboard items, and snippets
- action execution for open/reveal/copy/open-in-terminal/web-open/snippet expansion

Clipboard observation is intentionally a polling first pass. The service already carries TODO markers for replacing polling with native watchers and enforcing privacy exclusions once source-app detection is available.

## Persistence

SQLite currently stores:

- launcher settings
- usage stats
- indexed files
- clipboard history
- snippets

Plugin grants and disabled-plugin state are persisted inside launcher settings. Plugin source files themselves stay on disk in local plugin directories.

## Plugin host model

Plugin System v1 uses a pragmatic isolation model:

- each plugin is discovered from disk by Rust
- the manifest and entry source are loaded into the frontend
- each plugin runs inside its own dedicated worker
- ambient network access is removed inside the worker baseline
- plugins reach sensitive capabilities only through a small host API
- search and action calls are wrapped in timeouts
- crashing or timing out a plugin only tears down that plugin worker

Current PluginAPI surface:

- `fetchJson()`
- `execShell()`
- `readClipboardText()`
- `writeClipboardText()`
- `openUrl()`
- `showNotification()`

Current host permission checks:

- `network`
- `shell.exec`
- `clipboard.read`
- `clipboard.write`
- `notifications`

File-system permissions are modeled in manifests and shared types, but not yet exercised by example plugins.

## Platform isolation

App discovery is isolated under:

- [apps/desktop/src-tauri/src/platform/apps/macos.rs](/Users/chenhz/Documents/work-station/openSpotlightBar/apps/desktop/src-tauri/src/platform/apps/macos.rs)
- [apps/desktop/src-tauri/src/platform/apps/windows.rs](/Users/chenhz/Documents/work-station/openSpotlightBar/apps/desktop/src-tauri/src/platform/apps/windows.rs)
- [apps/desktop/src-tauri/src/platform/apps/linux.rs](/Users/chenhz/Documents/work-station/openSpotlightBar/apps/desktop/src-tauri/src/platform/apps/linux.rs)

Plugin discovery and validation are isolated under [plugins.rs](/Users/chenhz/Documents/work-station/openSpotlightBar/apps/desktop/src-tauri/src/services/plugins.rs).

## Search modules

Current providers:

- `AppProvider`
- `FileProvider`
- `ClipboardProvider`
- `SnippetProvider`
- `PluginProvider`
- `WebSearchProvider`
- `SystemProvider`

Current result actions:

- launch app
- open path
- reveal in folder
- copy path
- copy text
- open in terminal
- search on web
- paste text hook/TODO
- pin or unpin clipboard item
- delete clipboard item
- clear clipboard history
- expand snippet
- rebuild file index
- open settings
- run plugin action

## Deferred hardening

These areas are intentionally not complete yet:

- image/file clipboard payload support
- native global snippet expansion hooks
- stricter plugin sandboxing than worker isolation
- signed plugin packaging and install/update flows
- richer hotkey recorder and conflict detection
- deeper platform-native filesystem and application integrations
