# Open Spotlight Bar Demo

## Recommended script

1. Open the launcher with the global hotkey.
2. Search an installed app and launch it.
3. Search a file, show that recent files and previously used files rise naturally, then press `Tab` to open the action panel.
4. Execute a secondary file action such as reveal or copy path.
5. Type `/config indexing`, show indexed directories, exclusions, last rebuild time, and rebuild state.
6. Toggle indexing pause or resume, then explain that the current implementation still uses lightweight rebuilds.
7. Rebuild the index and show the updated health message.
8. Search a clipboard item or snippet and trigger its primary action.
9. Type `/config`, press `Enter`, move through the hub with arrow keys, and open a detail surface.
10. Search `g open spotlight bar`, run it, and explain that keyword workflows now behave like launcher-native commands rather than editor-only automation demos.
11. Search `/google open spotlight bar`, run it, and show that slash-command workflows still use the same runtime and logs model.
12. Search `/clip-clean`, run it, and show the clipboard-normalization action through the workflow runtime.
13. Search `/json-pretty {"hello":"world"}`, run it, and show structured JSON parsing plus pretty-print output.
14. Search `/url-encode open spotlight bar`, run it, and explain the template filter system.
15. Search `gh open spotlight bar`, run it, and show that a workflow can fetch remote JSON and emit real launcher-native results instead of just returning text.
16. Search `weather Shanghai`, run it, and show a practical HTTP-backed text summary workflow.
17. Open `/config workflow`, inspect the reusable helpers, and explain that `Normalize Query`, `Build Search URL`, and `GitHub Response Items` are local reusable subflows rather than separate products.
18. Open the `g` or `gh` workflow in the editor, show the trigger metadata plus `Invoke Workflow` node, and expand the nested debug logs after a run.
19. Change the HTTP query params or item templates on a duplicated workflow, save it, and run it from the editor to show validation plus debug logs.
20. Show `/reindex-now` as a workflow that reuses an existing shared action instead of inventing a parallel action system.
21. On macOS, repeat the same story in the native SwiftUI shell to show the native host bridge.

## Strongest demo flows

- keyboard-first launcher open, search, selection, and action execution
- local-first search over multiple providers
- lightweight but productized file indexing with clear health and management affordances
- usage-aware result ordering in the shared desktop shell
- `/config` as a command-driven settings router
- workflow runtime v1 with discoverable slash and keyword commands
- reusable workflow composition through `Invoke Workflow`
- workflow variable references and template filters
- workflow HTTP requests with explicit response outputs
- workflow-generated launcher results that still use the shared `ResultItem` and `ActionItem` model
- workflow editor v1 with validation and node-level execution logs
- native macOS shell backed by the shared Rust and SQLite data path

## Known limitations

- the macOS native shell does not yet expose the full plugin worker runtime the same way the shared desktop shell does
- file indexing remains lightweight metadata indexing and does not do file-content search
- indexing still relies on rebuilds instead of incremental background updates
- workflow runtime supports acyclic flows and simple explicit branches only
- reusable composition is limited to validated acyclic subflows with declared contracts
- workflow references are validated for obvious bad roots and missing node outputs, but not every semantic mistake can be proven statically yet
- HTTP Request is intentionally scoped to GET/POST, headers, query params, JSON body, and timeout; auth flows and long-lived sessions remain deferred
- hotkey workflow triggers are still scaffolds; launcher discovery and execution currently focus on slash and keyword entrypoints
- only a subset of nodes is runtime-ready today; file input and return-files remain deferred
- Windows and Linux remain on the shared Tauri shell in this phase
- clipboard watching and text expansion still need deeper OS-native integration
- packaging, signing, and notarization are not the focus of this phase
