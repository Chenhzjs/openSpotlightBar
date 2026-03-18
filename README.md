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

The product goal is launcher-first. Workflows, commands, snippets, clipboard, plugins, and settings are meant to feel like one coherent launcher surface in the spirit of Alfred, not like separate demos bolted onto a launcher shell.

Current product slices:

- launcher window with global hotkey wiring
- application search
- lightweight file search by filename and path metadata
- clipboard history
- snippets with variable expansion
- web search shortcuts
- result action panel on `Tab`
- settings UI
- workflow runtime v1 with a unified trigger model for slash commands, keyword commands, manual runs, and hotkey scaffolds
- workflow editor v1 with list, inspector, validation, and debug logs
- workflow variable references, reusable subflows, structured JSON handling, typed node contracts, and scoped HTTP fetch support
- persisted usage-based ranking
- local plugin host with example plugins

Recent search and index productization work:

- richer file index health and status visibility
- explicit indexed directories and excluded paths
- pause or resume indexing scaffold
- better file-result ranking using filename/path match, modified-time recency, and usage history
- more informative file-search empty, loading, and error states

Demo-ready now:

- open launcher and search apps, files, web results, snippets, clipboard items, and plugin inventory
- open the action panel with `Tab`
- execute primary and common secondary actions
- route `/config` into a hub and detail surfaces
- open the dedicated workflow surface
- run slash-command workflows such as `/google`, `/jira`, `/clip-clean`, `/echo`, `/json-pretty`, `/url-encode`, `/reindex-now`, `/ghrepo`, `/gh-search`, `/weather`, and `/http-get`
- run keyword workflows such as `g pulse launcher`, `jira ENG-123`, `gh pulse launcher`, and `weather Shanghai`
- edit, validate, save, duplicate, and debug workflows from `/config workflow`
- demo reusable workflow composition through `Invoke Workflow` and built-in helper subflows
- demo the native macOS shell against shared Rust and SQLite-backed data

## Architecture

Pulse Launcher keeps a strict split between shared search logic, the React UI shell, plugin runtime orchestration, and platform services:

- [apps/desktop](/Users/chenhz/Documents/work-station/openSpotlightBar/apps/desktop) contains the React UI, Zustand state, provider wiring, launcher interaction model, and plugin host.
- [apps/desktop/src-tauri](/Users/chenhz/Documents/work-station/openSpotlightBar/apps/desktop/src-tauri) contains Rust commands, SQLite persistence, file indexing, clipboard observation, plugin discovery, and platform-specific modules.
- [apps/macos](/Users/chenhz/Documents/work-station/openSpotlightBar/apps/macos) contains the native SwiftUI/AppKit macOS shell with the floating Spotlight-style panel, native materials, global hotkey registration, and native outside-click hiding.
- [packages/shared-types](/Users/chenhz/Documents/work-station/openSpotlightBar/packages/shared-types) defines shared domain models such as `ResultItem`, `ActionItem`, settings, clipboard, snippets, plugins, and bootstrap payloads.
- [packages/core](/Users/chenhz/Documents/work-station/openSpotlightBar/packages/core) owns query parsing, fuzzy scoring, ranking, timeout-protected provider aggregation, workflow validation/runtime helpers, and the unified workflow trigger registry.
- [packages/plugin-sdk](/Users/chenhz/Documents/work-station/openSpotlightBar/packages/plugin-sdk) defines the plugin contracts and host API surface.

Search remains provider-based. Each provider returns the same `ResultItem` shape, each result exposes `ActionItem` actions, and ranking combines:

- provider score
- fuzzy score
- prefix bonus
- exact match bonus
- source weight
- recency bonus
- usage history boost

For file results specifically, ranking now also uses:

- filename and path match quality
- file modified-time recency
- usage history on top of the lightweight file metadata index

Platform-specific discovery stays isolated under [apps/desktop/src-tauri/src/platform](/Users/chenhz/Documents/work-station/openSpotlightBar/apps/desktop/src-tauri/src/platform). Plugin discovery and manifest validation stay on the Rust side, while plugin execution happens in isolated frontend workers with permission-gated host APIs.

On macOS, the launcher shell now has a native SwiftUI/AppKit host. The current native host now owns:

- native floating panel presentation
- native material rendering
- outside-click and focus-loss hiding
- global hotkey registration
- native application search
- Rust and SQLite-backed bootstrap snapshot loading
- Rust-backed file search
- shared action dispatch for file, clipboard, and snippet actions
- usage recording back into the shared persistence layer
- `/config` hub routing and section detail windows
- dedicated workflow window with shared status context
- shared workflow definitions through the Rust and SQLite store

The remaining macOS gap is no longer the basic shell bridge. The remaining work is richer plugin exposure, deeper settings completeness, native text expansion hooks, and fuller workflow editor/runtime bridging into the native host.

More detail: [docs/architecture.md](/Users/chenhz/Documents/work-station/openSpotlightBar/docs/architecture.md), [docs/status.md](/Users/chenhz/Documents/work-station/openSpotlightBar/docs/status.md), and [DEMO.md](/Users/chenhz/Documents/work-station/openSpotlightBar/DEMO.md)

## Monorepo structure

```text
apps/
  desktop/               React + Tauri desktop app
  macos/                 native SwiftUI/AppKit macOS launcher host
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

Run the native macOS host:

```bash
pnpm macos:native:dev
```

The native macOS scripts build the shared Rust bridge binary first and then launch the SwiftUI host with that bridge wired in.

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
- `pnpm macos:native:dev` runs the native SwiftUI/AppKit macOS host
- `pnpm macos:native:build` compiles the native macOS host
- `pnpm macos:native:test` runs Swift tests for the native macOS host
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
- workflow validation
- workflow runtime execution

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
- `WorkflowProvider`
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
- run workflow

Interaction rules:

- arrow keys move selection
- `Enter` runs the default action
- `Tab` opens the action panel for the selected result
- `Ctrl+,` opens settings
- `Escape` closes the launcher or exits the current panel

The native macOS host currently covers the Spotlight shell, app search, Rust-backed file search, action dispatch through the shared Rust layer, `/config`, workflow, and usage recording. Full plugin runtime exposure still primarily lives in the shared desktop stack.

## Index management

File indexing stays intentionally lightweight:

- filename
- path
- extension
- file or folder kind
- modified time

There is still no full-text content indexing in this phase.

Current index management capabilities:

- view indexed directory roots
- view excluded paths
- view indexed file count
- view last indexed time
- view rebuild state, stale state, paused state, truncation, and last error
- rebuild the index manually
- add or remove indexed directories
- add or remove exclusions
- pause or resume indexing as a lightweight scaffold

Index settings live under `/config indexing`, with index health also summarized under `/config search`.

## Platform status

- macOS: native SwiftUI/AppKit shell is demo-ready for launcher presentation, app search, file search via the Rust bridge, shared actions, `/config`, and the workflow surface.
- Windows: Tauri shell is the active runtime, with the `/config -> hub -> detail` interaction model and platform-adaptive tokens.
- Linux: Tauri shell is the active runtime, with the same interaction model and Linux-friendly tokenized presentation.

Windows and Linux are not native WinUI or GTK frontends in this phase. They intentionally stay on the shared Tauri UI and are being tightened for demo quality rather than replaced.

## Workflow status

Workflow is now a real but scoped subsystem rather than a placeholder:

- workflows are stored locally in SQLite and exposed through shared types
- unified workflow triggers currently support slash commands, keyword commands, manual runs, and hotkey scaffolds
- slash and keyword triggers are discoverable in launcher results and execute through runtime v1
- trigger conflicts are deterministic: custom workflows override built-ins, then newer workflows override older ones
- runtime v1 validates graphs before execution and supports acyclic flows plus explicit simple branches
- workflow references support trigger args, launcher context values, current node inputs, and previous node outputs
- reusable workflows can declare explicit input/output contracts and be invoked from other workflows
- workflow result mapping also supports per-item references such as `{{item.full_name}}` and `{{index}}`
- template rendering supports filters such as `trim`, `lower`, `upper`, `urlencode`, `json`, and `prettyjson`
- HTTP Request nodes support scoped `GET` and `POST`, headers, query params, optional JSON body, timeout, response status, response text, parsed JSON when available, and header scaffolding
- Show Launcher Results supports both provider-query mode and workflow item-mapping mode that emits real `ResultItem` entries through the shared launcher model
- node execution logs capture per-node input or output previews, timing, validation vs runtime failure stage, and errors
- workflow editor v1 includes a workflow list, ordered canvas, inspector, edge editor, validation panel, and debug runs
- built-in examples cover `/google`, `/jira`, `/clip-clean`, `/echo`, `/json-pretty`, `/url-encode`, `/reindex-now`, `/ghrepo`, `/gh-search`, `/weather`, and `/http-get`
- built-in keyword examples cover `g`, `jira`, `gh`, and `weather`
- built-in reusable helpers cover `Normalize Query`, `Build Search URL`, and `GitHub Response Items`

Current workflow reference syntax:

- `{{args.query}}`
- `{{context.clipboard}}`
- `{{inputs.input}}`
- `{{nodes.parse.default.user.name}}`
- `{{item.full_name}}` inside launcher-result item mapping
- `{{index}}` inside launcher-result item mapping

Reusable workflow contracts:

- reusable workflows declare named inputs with value types
- reusable workflows declare named outputs via `valueTemplate`
- `Invoke Workflow` returns those outputs as a structured object on `default`
- parent workflows read them with references such as `{{nodes.build.default.url}}`

Current trigger model:

- `slash-command`: `/google pulse launcher`
- `keyword`: `g pulse launcher`
- `manual`: editor or reusable-subflow entrypoint
- `hotkey`: persisted scaffold only in this phase

Keyword Trigger v1 behavior:

- the first token is the fixed trigger keyword
- the remaining text becomes the workflow's primary argument payload
- optional aliases can point at the same workflow
- launcher results show trigger type and example invocation where helpful
- conflicts are resolved locally with deterministic priority instead of implicit merging

Current workflow node support:

- input:
  query input, clipboard input, static value
- transform:
  template, regex replace, conditional branch, JSON parse, JSON extract
- action:
  HTTP request, invoke workflow, open URL, copy to clipboard, open file, run shell command, invoke shared action, invoke plugin command
- output:
  return text, return action result, show launcher results, emit toast

HTTP Request output schema:

- `default`: full response object with `url`, `status`, `ok`, `headers`, `contentType`, `text`, and `json`
- `status`: numeric HTTP status
- `ok`: boolean success flag
- `text`: raw response text
- `json`: parsed JSON object when available, otherwise `null`
- `headers`: response header map scaffold

Show Launcher Results modes:

- `query`: re-run launcher search through the shared provider pipeline
- `items`: map workflow data into real launcher results with `title`, `subtitle`, `icon`, `payload`, `default action`, `type`, and `source`

Reusable composition constraints in runtime v1:

- invoked workflows must be explicitly marked reusable
- reusable calls are validated against the local workflow catalog
- self-recursion and cyclic workflow dependencies are rejected
- reusable outputs currently come back as one structured object, not dynamic graph ports
- nested subflow execution logs are preserved under the `Invoke Workflow` node

Planned-only nodes that remain deferred:

- file input
- return files

Workflow runtime v1 intentionally does not include:

- loops
- parallel branches or async orchestration
- authenticated or stateful HTTP sessions beyond simple headers and JSON body
- recursive or arbitrarily deep workflow composition beyond validated acyclic subflows
- free-form drag-anywhere graph editing
- full native shell workflow editing parity
- full hotkey trigger execution

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
- file indexing uses full rebuilds, not incremental updates
- clipboard history is text-first; image and file payloads are modeled but not implemented
- clipboard watching still uses a polling-first implementation
- snippet expansion currently copies output to the clipboard instead of injecting text globally
- hotkey editing is a scaffold, not a native shortcut recorder
- plugin isolation currently uses workers plus host permission gating, not a hardened OS sandbox
- plugin entries must currently be JS-compatible at runtime
- the native macOS shell exposes shared data and actions, but not yet the full plugin worker runtime

## Roadmap

1. Add stronger index scheduling and eventual incremental indexing without leaving the lightweight metadata model.
2. Expose more of the shared plugin runtime inside the native macOS shell.
3. Replace polling-based clipboard observation with native watchers and privacy-aware source filtering.
4. Add true global snippet expansion hooks with app-aware restrictions.
5. Harden plugin sandboxing, packaging, installation flows, and final release automation.

Additional roadmap detail: [docs/roadmap.md](/Users/chenhz/Documents/work-station/openSpotlightBar/docs/roadmap.md)
