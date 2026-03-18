# Pulse Launcher Status

## Demo-ready now

- shared Tauri desktop shell on macOS, Windows, and Linux
- provider-based search across apps, files, web shortcuts, clipboard items, snippets, system commands, and plugin-backed results in the shared desktop app
- workflow-backed slash and keyword commands surfaced as first-class launcher results
- `Tab` action panel and primary action execution
- `/config` command flow with hub and detail surfaces
- `/config indexing` with visible directory roots, exclusions, rebuild health, and pause or resume scaffold
- workflow runtime v1 plus workflow editor v1 for product demos
- unified workflow trigger registry with deterministic conflict handling
- workflow references across args, context, inputs, and node outputs
- JSON parse and JSON extract nodes plus stronger type-aware validation
- scoped workflow HTTP requests with typed response data
- workflow-produced launcher results that reuse the shared result and action model
- reusable workflows with explicit contracts plus `Invoke Workflow`
- persisted usage-based ranking in the shared desktop path
- file-result ranking that now combines lightweight metadata match quality, modified-time recency, and usage history
- native macOS shell with shared Rust and SQLite-backed bootstrap data, file search, action dispatch, and usage recording

## Partially implemented

- file indexing lifecycle:
  status visibility and management are productized, but indexing is still rebuild-based and not yet incremental
- macOS native shell plugin exposure:
  plugin inventory and shared settings status are visible, but the full worker runtime still primarily lives in the shared desktop stack
- `/config` detail depth:
  the information architecture is coherent, but not every section is fully editable and product-complete
- workflow:
  runtime v1 is real, including reusable subflows and keyword trigger v1, but free-form graph editing, loops, full hotkey integration, auth-heavy HTTP patterns, dynamic output ports, and broader node coverage remain intentionally out of scope
- platform visuals:
  Windows and Linux use platform-adaptive Tauri presentation, but are not yet true native WinUI or GTK shells

## Roadmap / TODO

- incremental indexing and richer scheduling
- stricter plugin sandboxing and richer permission flows
- stronger file indexing and more native platform integrations
- native clipboard watcher improvements
- native text expansion hooks for snippets
- deeper workflow runtime features such as loops, richer async orchestration, broader node coverage, and more native trigger integration
- richer HTTP auth/session support and stronger remote-data node coverage
- richer workflow composition ergonomics beyond structured subflow output objects
- packaging, signing, notarization, and final release pipeline polish
