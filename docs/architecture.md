# Pulse Launcher Architecture

## Current objective

The current implementation is in a productization phase. The goal is not to replace the architecture, but to make the existing system demo-ready, improve the native macOS bridge, and make `/config`, workflow, and command-like launcher behavior feel intentional and connected.

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
apps/macos/
  Sources/              native SwiftUI/AppKit macOS shell, hotkey manager, Spotlight-style panel, native search host
packages/
  shared-types/         ResultItem, ActionItem, settings, clipboard, snippets, plugin contracts, bootstrap payloads
  core/                 query parsing, ranking, search orchestration, workflow validation/runtime helpers
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

For workflows:

1. Workflow definitions are persisted in SQLite and returned in the bootstrap snapshot.
2. A shared trigger registry normalizes slash, keyword, manual, and hotkey-scaffold workflow triggers.
3. Slash-command and keyword queries surface workflow entrypoints through the shared provider pipeline.
4. The workflow editor reads and writes the same shared `WorkflowRecord` model used by runtime and storage.
5. Workflow runtime v1 validates the graph, executes an acyclic flow in topological order, and logs node-level inputs, outputs, duration, failures, and nested subflow runs.
6. Host-owned side effects such as shared actions, plugin command routing, launcher search handoff, toast emission, and HTTP requests are injected through runtime services instead of duplicated inside the editor.
7. Action nodes reuse the existing shared action layer or the plugin host instead of inventing parallel execution code paths.
8. Reusable workflows declare explicit contracts that `Invoke Workflow` nodes consume through the same persisted workflow catalog.
9. String config fields and templates share the same workflow reference syntax so editor, validation, and runtime resolve the same data model.

For the native macOS shell:

1. SwiftUI/AppKit owns the floating panel and native settings/workflow windows.
2. A small Rust bridge binary exposes shared bootstrap data, file search, action execution, and usage recording.
3. The native shell reuses that bridge instead of reimplementing local persistence logic in Swift.
4. App search and shell presentation remain native-first where that improves responsiveness and fit.

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
- workflow studio surface and debug logs
- Zustand state for results, settings, clipboard items, snippets, workflows, discovered plugins, runtime snapshots, usage hints, and file index status

The frontend does not perform platform-specific work directly. It consumes Tauri commands and shared models.

That native SwiftUI host now lives in [apps/macos](/Users/chenhz/Documents/work-station/openSpotlightBar/apps/macos). It currently owns the floating macOS shell, native material rendering, hotkey registration, outside-click hiding, app discovery, config hub routing, workflow presentation, and the bridge into shared Rust and SQLite services for data loading, file search, actions, and usage recording.

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
- SQLite persistence for workflow definitions
- action execution for open/reveal/copy/open-in-terminal/web-open/snippet expansion

Clipboard observation is intentionally a polling first pass. The service already carries TODO markers for replacing polling with native watchers and enforcing privacy exclusions once source-app detection is available.

## Persistence

SQLite currently stores:

- launcher settings
- usage stats
- indexed files
- clipboard history
- snippets
- workflows

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
- `WorkflowProvider`
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
- run workflow

## Workflow model

Workflow runtime v1 shares a typed model between the editor, runtime, and storage:

- `Workflow`
- `WorkflowTrigger`
- `WorkflowNode`
- `WorkflowEdge`
- `WorkflowRunContext`
- `WorkflowRunResult`
- `WorkflowExecutionLog`

Supported trigger states in this phase:

- slash command
- keyword v1
- manual
- hotkey scaffold

Keyword Trigger v1 rules:

- the first token is a fixed keyword such as `g`, `jira`, `gh`, or `weather`
- the remaining text becomes the primary argument payload
- aliases are optional and normalize into the same trigger registry
- conflicts are resolved deterministically:
  custom workflows override built-ins, then newer workflows override older ones

Supported node categories in this phase:

- input:
  query input, clipboard input, static value
- transform:
  template, regex replace, conditional branch, JSON parse, JSON extract
- action:
  HTTP request, invoke workflow, open URL, copy to clipboard, open file, run shell command, invoke shared action, invoke plugin command
- output:
  return text, return action result, show launcher results, emit toast

Reusable workflow model in runtime v1:

- a workflow may declare a reusable contract
- contract inputs define named values and types expected by callers
- contract outputs define named values through `valueTemplate`
- `Invoke Workflow` resolves another reusable workflow by id, executes it through the same runtime, and returns a structured object of declared outputs
- validation rejects missing targets, non-reusable targets, self-recursion, and cyclic workflow dependencies

Workflow reference syntax in runtime v1:

- `{{args.query}}`
- `{{context.clipboard}}`
- `{{inputs.input}}`
- `{{nodes.parse.default.user.name}}`
- `{{item.full_name}}` inside launcher-result item mapping
- `{{index}}` inside launcher-result item mapping

Supported template filters in runtime v1:

- `trim`
- `lower`
- `upper`
- `urlencode`
- `json`
- `prettyjson`

HTTP Request node support in runtime v1:

- methods: `GET`, `POST`
- request fields: URL, headers, query params, optional JSON body, timeout
- response outputs:
  `default` response object, `status`, `ok`, `text`, `json`, `headers`
- execution boundary:
  the shared runtime asks the host to perform the request, so desktop and native shells can share the same execution model

Show Launcher Results support in runtime v1:

- `query` mode:
  hand a text query back into the shared launcher provider pipeline
- `items` mode:
  map structured workflow data into real `ResultItem` entries with templated title, subtitle, payload, icon scaffold, and default action

Composition limits in runtime v1:

- reusable subflows must stay inside an acyclic workflow dependency graph
- parent workflows currently consume subflow outputs through one structured `default` object
- runtime preserves nested logs, but does not yet support arbitrary composition visualizations or dynamic output ports

Planned-only nodes stay visible in the library but fail validation and runtime execution clearly:

- file input
- return files

Runtime v1 intentionally does not support:

- cycles
- loops
- parallel execution
- complex async orchestration
- unrestricted free-form graph editing

## Deferred hardening

These areas are intentionally not complete yet:

- image/file clipboard payload support
- native global snippet expansion hooks
- stricter plugin sandboxing than worker isolation
- signed plugin packaging and install/update flows
- richer hotkey recorder and conflict detection
- deeper platform-native filesystem and application integrations

## Status framing

- Demo-ready:
  launcher search and action flows, `/config`, workflow runtime v1 plus editor v1, shared desktop shell, and the macOS native shell bridge
- Partial:
  plugin exposure in the native shell, full settings completeness, and native-shell workflow editing parity
- Roadmap:
  native text expansion, deeper plugin sandboxing, richer native watchers, and final release hardening
